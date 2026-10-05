import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { prisma } from "@/lib/prisma";

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

function allowPrivate(): boolean {
  return process.env.YUTE_ALLOW_PRIVATE_WEBHOOKS === "true";
}

/** Parse an IPv6 string into 16 bytes, expanding :: and embedded IPv4. */
function parseIPv6(input: string): number[] | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  const v4part = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4part) {
    const octets = v4part[2].split(".").map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    s = `${v4part[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (str: string): number[] | null => {
    if (!str) return [];
    const out: number[] = [];
    for (const g of str.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parseGroups(halves[0]);
  if (!head) return null;
  const tail = halves.length === 2 ? parseGroups(halves[1]) : null;
  if (halves.length === 2 && !tail) return null;

  let groups: number[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - (tail as number[]).length;
    if (missing < 0) return null;
    groups = [...head, ...new Array(missing).fill(0), ...(tail as number[])];
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff);
  return bytes;
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const b = parseIPv6(ip);
    if (!b) return true; // unparseable: fail closed
    if (b.every((x) => x === 0)) return true; // ::
    if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
    const first10zero = b.slice(0, 10).every((x) => x === 0);
    // IPv4-mapped ::ffff:a.b.c.d (also arrives in compressed hex form)
    if (first10zero && b[10] === 0xff && b[11] === 0xff) return isPrivateIp(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
    // IPv4-compatible ::a.b.c.d (deprecated)
    if (first10zero && b[10] === 0 && b[11] === 0 && b.slice(12).some((x) => x !== 0)) {
      return isPrivateIp(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
    }
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
    if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA (incl. fd00:ec2 metadata)
    if (b[0] === 0xff) return true; // ff00::/8 multicast
    if (b[0] === 0x20 && b[1] === 0x02) return isPrivateIp(`${b[2]}.${b[3]}.${b[4]}.${b[5]}`); // 6to4
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // Teredo
    return false;
  }
  return true; // not an IP: caller resolves first
}

interface Target {
  url: URL;
  hostname: string;
  port: string;
  isHttps: boolean;
}

function parseTarget(raw: string): Target {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid_or_disallowed_webhook_url");
  if (url.username || url.password) throw new Error("invalid_or_disallowed_webhook_url");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) throw new Error("invalid_or_disallowed_webhook_url");
  return { url, hostname, port: url.port || (url.protocol === "https:" ? "443" : "80"), isHttps: url.protocol === "https:" };
}

interface Pinned {
  ip: string;
  family: number;
}

/** Resolve the host once, verify every address, and return the one to connect to. */
async function pinTarget(t: Target): Promise<Pinned> {
  if (allowPrivate()) {
    if (isIP(t.hostname)) return { ip: t.hostname, family: isIP(t.hostname) };
    const a = await lookup(t.hostname, { all: true });
    if (!a.length) throw new Error("invalid_or_disallowed_webhook_url");
    return { ip: a[0].address, family: a[0].family };
  }
  if (isIP(t.hostname)) {
    if (isPrivateIp(t.hostname)) throw new Error("invalid_or_disallowed_webhook_url");
    return { ip: t.hostname, family: isIP(t.hostname) };
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(t.hostname, { all: true });
  } catch {
    throw new Error("invalid_or_disallowed_webhook_url");
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new Error("invalid_or_disallowed_webhook_url");
  return { ip: addresses[0].address, family: addresses[0].family };
}

/**
 * Validate a webhook destination before sending: http(s) only, no embedded
 * credentials, and the host must not resolve to any private/internal address.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<void> {
  const t = parseTarget(raw);
  await pinTarget(t);
}

export function signPayload(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export async function registerWebhook(userId: string, url: string) {
  await assertSafeWebhookUrl(url);
  const secret = "whsec_" + randomBytes(24).toString("hex");
  return prisma.webhookEndpoint.create({ data: { userId, url, secret } });
}

export async function listWebhooks(userId: string) {
  return prisma.webhookEndpoint.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/** One request to a pinned IP; the Host header/SNI keep the original identity. */
function requestPinned(t: Target, pinned: Pinned, headers: Record<string, string>, body: string): Promise<{ status: number | null; location: string | null }> {
  return new Promise((resolve) => {
    const mod = t.isHttps ? https : http;
    const req = mod.request(
      {
        host: pinned.ip,
        family: pinned.family,
        port: Number(t.port),
        path: `${t.url.pathname}${t.url.search}`,
        method: "POST",
        headers: { ...headers, Host: t.url.host },
        servername: t.isHttps ? t.hostname : undefined,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        res.resume(); // drain
        resolve({ status: res.statusCode ?? null, location: (res.headers.location as string | undefined) ?? null });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve({ status: null, location: null }));
    req.end(body);
  });
}

/** POST with manual redirect handling so a redirect cannot bypass the SSRF check. */
async function postOnce(rawUrl: string, event: string, payload: string, secret: string): Promise<number | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let t: Target;
    let pinned: Pinned;
    try {
      t = parseTarget(current);
      pinned = await pinTarget(t);
    } catch {
      return null;
    }
    const { status, location } = await requestPinned(
      t,
      pinned,
      {
        "content-type": "application/json",
        "x-yute-event": event,
        "x-yute-signature": signPayload(secret, payload),
      },
      payload
    );
    if (status != null && status >= 300 && status < 400 && location) {
      try {
        current = new URL(location, current).toString();
      } catch {
        return status;
      }
      continue;
    }
    return status;
  }
  return null;
}

export interface DeliveryResult {
  url: string;
  status: number | null;
}

export async function deliverToUrl(url: string, event: string, data: unknown): Promise<DeliveryResult> {
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  let status = await postOnce(url, event, payload, process.env.YUTE_WEBHOOK_SECRET ?? "ephemeral");
  if (status == null || status >= 500) {
    await new Promise((r) => setTimeout(r, 1500));
    status = await postOnce(url, event, payload, process.env.YUTE_WEBHOOK_SECRET ?? "ephemeral");
  }
  return { url, status };
}

export async function deliverEvent(userId: string, event: string, data: unknown): Promise<DeliveryResult[]> {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId, active: true } });
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  return Promise.all(
    endpoints.map(async (ep) => {
      let status = await postOnce(ep.url, event, payload, ep.secret);
      if (status == null || status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        status = await postOnce(ep.url, event, payload, ep.secret);
      }
      return { url: ep.url, status };
    })
  );
}
