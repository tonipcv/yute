import "server-only";

/** Transactional email via Resend. No-op (logged) when not configured. */
const FROM = process.env.YUTE_EMAIL_FROM ?? "yute <no-reply@yute.dev>";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set; skipping "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function wrap(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#173D2D;color:#fff;padding:12px 20px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px">${cta.label}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F6F6F1;font-family:Helvetica,Arial,sans-serif;color:#11130f">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <p style="font-size:14px;font-weight:600;letter-spacing:.02em">yute</p>
    <h1 style="font-size:20px;font-weight:500;margin:12px 0">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#33362f">${body}</div>
    ${button}
    <hr style="border:none;border-top:1px solid #E2E1D9;margin:28px 0" />
    <p style="font-size:12px;color:#777970">You are receiving this because of activity on your yute workspace.</p>
  </div></body></html>`;
}

export async function sendPasswordReset(to: string, link: string): Promise<boolean> {
  return sendEmail(
    to,
    "Reset your yute password",
    wrap(
      "Reset your password",
      `<p>We received a request to reset the password for your workspace. This link expires in 30 minutes.</p><p>If you didn't request this, you can ignore this email.</p>`,
      { label: "Choose a new password", url: link }
    )
  );
}

export async function sendWelcome(to: string): Promise<boolean> {
  return sendEmail(
    to,
    "Welcome to yute",
    wrap(
      "Your workspace is ready",
      `<p>You now have 100 free credits and can create API keys, run lookups and read the docs.</p><p>Start here: <a href="https://yute.heuv.dev/docs" style="color:#173D2D">API docs</a>.</p>`
    )
  );
}
