import { promises as dns } from "node:dns";

/* eslint-disable no-control-regex */
const E164_RE = /^\+[1-9]\d{6,14}$/;

export type PhoneLineType = "mobile" | "landline" | "voip" | "unknown";

export interface PhoneValidation {
  phone: string;
  valid: boolean;
  lineType: PhoneLineType;
  reason?: string;
}

/** Very light normalization: strip formatting, keep leading +. */
export function normalizePhone(input: string, defaultCountry = "1"): { e164: string | null; raw: string } {
  const raw = input.trim();
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return { e164: E164_RE.test(digits) ? digits : null, raw };
  }
  if (!digits) return { e164: null, raw };
  const local = digits.replace(/^0+/, "");
  const candidate = `+${defaultCountry}${local}`;
  return { e164: E164_RE.test(candidate) ? candidate : null, raw };
}

/** Static hint only — real line type needs a carrier/HLR provider. */
export function guessLineType(number: string): PhoneLineType {
  const n = number.replace(/[^\d]/g, "");
  if (!n) return "unknown";
  // NANP: area-code heuristic is unreliable, so stay honest.
  return "unknown";
}

export async function validatePhone(input: string, defaultCountry = "1"): Promise<PhoneValidation> {
  const { e164, raw } = normalizePhone(input, defaultCountry);
  if (!e164) {
    return { phone: raw, valid: false, lineType: "unknown", reason: "invalid_format" };
  }
  return { phone: e164, valid: true, lineType: guessLineType(e164) };
}

/** Reserved for future carrier lookups; keeps DNS import stable across refactors. */
export async function domainHasMx(_domain: string): Promise<boolean> {
  try {
    const r = await dns.resolveMx(_domain);
    return r.length > 0;
  } catch {
    return false;
  }
}
