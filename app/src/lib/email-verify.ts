import "server-only";
import { promises as dns } from "node:dns";
import net from "node:net";
import { randomBytes } from "node:crypto";

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com",
  "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mailnesia.com", "mintemail.com",
]);

const ROLE = new Set([
  "info", "admin", "support", "sales", "contact", "hello", "help", "billing", "office",
  "team", "hr", "jobs", "careers", "marketing", "press", "noreply", "no-reply", "postmaster",
  "webmaster", "abuse", "security", "notifications",
]);

export type EmailStatus = "valid" | "invalid" | "catch_all" | "unknown";

export interface EmailVerification {
  email: string;
  syntaxValid: boolean;
  domain: string | null;
  mxRecords: number;
  mxHost: string | null;
  smtp: boolean | null;
  smtpCode: number | null;
  catchAll: boolean | null;
  disposable: boolean;
  role: boolean;
  freeProvider: boolean;
  status: EmailStatus;
  score: number;
}

const FREE = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "proton.me", "protonmail.com", "aol.com", "gmx.com"]);

export async function resolveMx(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange)
      .filter((exchange) => exchange && exchange !== ".");
  } catch {
    return [];
  }
}

interface SmtpResult {
  code: number | null;
  message: string;
  connected: boolean;
}

function smtpRcpt(mxHost: string, recipient: string, from: string, timeoutMs: number): Promise<SmtpResult> {
  return new Promise((resolve) => {
    let buffer = "";
    let step = 0;
    let settled = false;
    const socket = net.createConnection({ host: mxHost, port: 25 });

    const done = (code: number | null, message: string, connected: boolean) => {
      if (settled) return;
      settled = true;
      try { socket.write("QUIT\r\n"); } catch { /* ignore */ }
      socket.destroy();
      resolve({ code, message, connected });
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done(null, "timeout", true));
    socket.on("error", () => done(null, "error", false));
    socket.on("close", () => { if (!settled) done(null, "closed", true); });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^(\d{3})[ -]/.test(line) ? line.slice(0, 3) : null;
        if (!m) continue;
        if ((m[0] === "2" || m[0] === "3") && step < 3) {
          if (step === 0) {
            try { socket.write("EHLO yute.dev\r\n"); } catch { /* ignore */ }
            step = 1;
          } else if (step === 1) {
            try { socket.write(`MAIL FROM:<${from}>\r\n`); } catch { /* ignore */ }
            step = 2;
          } else if (step === 2) {
            try { socket.write(`RCPT TO:<${recipient}>\r\n`); } catch { /* ignore */ }
            step = 3;
          }
        }
        if (step === 3 && /^(25[0-9]|45[0-9]|55[0-9]|50[0-9])/.test(m)) {
          done(Number(m), line, true);
          return;
        }
      }
    });
  });
}

export async function verifyEmail(email: string): Promise<EmailVerification> {
  const normalized = email.trim().toLowerCase();
  const syntaxValid = EMAIL_RE.test(normalized);
  const domain = syntaxValid ? normalized.split("@")[1]! : null;
  const localPart = syntaxValid ? normalized.split("@")[0]! : "";

  const disposable = domain ? DISPOSABLE.has(domain) : false;
  const role = localPart ? ROLE.has(localPart) || ROLE.has(localPart.replace(/[._-].*$/, "")) : false;
  const freeProvider = domain ? FREE.has(domain) : false;

  const mx = domain ? await resolveMx(domain) : [];
  const mxHost = mx[0] ?? null;

  let smtp: boolean | null = null;
  let smtpCode: number | null = null;
  let catchAll: boolean | null = null;

  const from = process.env.YUTE_VERIFY_FROM ?? "verify@yute.dev";

  if (syntaxValid && mxHost) {
    const primary = await smtpRcpt(mxHost, normalized, from, 6000);
    smtpCode = primary.code;
    if (primary.code != null) smtp = primary.code >= 200 && primary.code < 300;

    // Catch-all: a random mailbox on the same domain that should not exist.
    if (smtp === true) {
      const rnd = `${randomBytes(6).toString("hex")}@${domain}`;
      const probe = await smtpRcpt(mxHost, rnd, from, 6000);
      if (probe.code != null && probe.code >= 200 && probe.code < 300) catchAll = true;
      else if (probe.code != null) catchAll = false;
    }
  }

  let status: EmailStatus = "unknown";
  let score = 0;

  if (!syntaxValid) {
    status = "invalid";
    score = 0;
  } else if (!disposable && !role && smtp === true && catchAll === false) {
    status = "valid";
    score = 95;
  } else if (smtp === true && catchAll === true) {
    status = "catch_all";
    score = 60;
  } else if (smtp === false) {
    status = "invalid";
    score = 10;
  } else if (mx.length > 0) {
    status = "unknown";
    score = catchAll ? 50 : 45;
  } else {
    status = "invalid";
    score = 5;
  }

  if (disposable || role) {
    score = Math.max(0, score - 25);
    if (status === "valid") status = "catch_all";
  }

  return {
    email: normalized,
    syntaxValid,
    domain: domain ?? null,
    mxRecords: mx.length,
    mxHost,
    smtp,
    smtpCode,
    catchAll,
    disposable,
    role,
    freeProvider,
    status,
    score,
  };
}
