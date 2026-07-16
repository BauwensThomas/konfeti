import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

// Back-office /admin (Phase 9, brief 5.8) : authentification par mot de
// passe unique + cookie de session signé, JAMAIS liée à Supabase Auth (ce
// n'est pas un compte, c'est un secret d'accès réservé à Thomas). Pas de
// table de sessions (stateless, adapté au serverless) -- le cookie porte
// lui-même sa preuve de validité (HMAC) et son expiration.

const COOKIE_NAME = "admin_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12h

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET manquante");
  return secret;
}

function sign(expiresAt: number): string {
  return createHmac("sha256", sessionSecret()).update(`admin-session:${expiresAt}`).digest("hex");
}

export function createSessionCookieValue(now: Date = new Date()): string {
  const expiresAt = now.getTime() + SESSION_DURATION_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

// Comparaison en temps constant (`timingSafeEqual`) : une comparaison
// naïve (`===`) fuite le nombre de caractères corrects via le temps de
// réponse, permettant en théorie de deviner la signature octet par octet.
export function verifySessionCookieValue(value: string | undefined | null, now: Date = new Date()): boolean {
  if (!value) return false;
  const [expiresAtRaw, signature] = value.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;

  const expected = sign(expiresAt);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export const ADMIN_SESSION_COOKIE = COOKIE_NAME;

// Appelé en tête de chaque page `/admin/*` (sauf `/admin/login`) : simple
// filet de sécurité côté Server Component, la vraie première ligne de
// défense contre un scan de sous-page est déjà dans `src/proxy.ts`.
export async function requireAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!verifySessionCookieValue(value)) {
    redirect("/admin/login");
  }
}
