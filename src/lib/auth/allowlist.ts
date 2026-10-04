import { z } from "zod";

const emailSchema = z.email();

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = emailSchema.safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

// Recebe o valor bruto a cada chamada: nada fica em cache de módulo, então
// trocar o secret ADMIN_EMAILS vale já no próximo acesso.
export function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  const emails = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    const email = normalizeEmail(entry);
    if (email) emails.add(email);
  }
  return emails;
}

export function isAllowedEmail(email: string | null | undefined, raw: string | undefined): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== null && parseAllowlist(raw).has(normalized);
}

export function decideSignIn(
  input: { email?: string | null; emailVerified?: boolean | null },
  raw: string | undefined,
): boolean {
  return input.emailVerified === true && isAllowedEmail(input.email, raw);
}
