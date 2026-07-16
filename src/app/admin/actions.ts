"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_SESSION_COOKIE,
  createSessionCookieValue,
  requireAdminSession,
  verifyPassword,
} from "@/lib/admin-auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import {
  adminLoginSchema,
  toggleFeatureFlagSchema,
  patchEventSchema,
  adminRsvpIdSchema,
  resendMagicLinkSchema,
} from "@/lib/validation/admin";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type AdminActionResult = { ok: true } | { ok: false; error: "invalid" | "rate_limited" | "unauthorized" | "unknown" };

export type AdminLoginResult = { ok: true } | { ok: false; error: "invalid" | "rate_limited" | "wrong_password" };

// Mot de passe unique (pas un compte Supabase Auth), rate-limité par IP --
// même limiteur en mémoire que le reste du projet (`isRateLimited`). Signature
// `(_prevState, formData)` pour `useActionState`, même convention que
// `sendMagicLink` (actions/auth.ts).
export async function adminLogin(_prevState: AdminLoginResult | null, formData: FormData): Promise<AdminLoginResult> {
  const parsed = adminLoginSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const ip = await getClientIp();
  if (isRateLimited(`adminLogin:${ip}`, 5, 15 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const valid = await verifyPassword(parsed.data.password);
  if (!valid) {
    return { ok: false, error: "wrong_password" };
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60,
    path: "/",
  });

  redirect("/admin");
}

export async function adminLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}

// Toutes les actions ci-dessous supposent déjà passé `requireAdminSession()`
// dans la page appelante -- revérifié ici quand même (défense en profondeur,
// même principe que le reste du projet qui ne fait jamais confiance qu'à
// l'UI). Client service-role partout : le back-office contourne
// délibérément les vérifications "admin de CET événement" (c'est tout son
// intérêt en cas d'hôte injoignable).

export async function toggleFeatureFlag(key: string, enabled: boolean): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = toggleFeatureFlagSchema.safeParse({ key, enabled });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const { error } = await serviceRoleClient()
    .from("feature_flags")
    .update({ enabled: parsed.data.enabled, updated_at: new Date().toISOString() })
    .eq("key", parsed.data.key);

  if (error) {
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

export async function patchEvent(input: {
  eventId: string;
  title?: string;
  startsAt?: string;
  cancelled?: boolean;
}): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = patchEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const updates: { title?: string; starts_at?: string; status?: "active" | "cancelled" } = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.startsAt !== undefined) updates.starts_at = parsed.data.startsAt;
  if (parsed.data.cancelled !== undefined) updates.status = parsed.data.cancelled ? "cancelled" : "active";

  const { error } = await serviceRoleClient().from("events").update(updates).eq("id", parsed.data.eventId);
  if (error) {
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

// Fait passer une demande "pending" en "approved" (rôle invité) directement,
// SANS passer par `admin_approve_rsvp` (qui exige d'être admin de CET
// événement) -- c'est précisément le rôle du back-office de pouvoir
// débloquer une situation quand l'hôte est injoignable.
export async function forceApproveRsvp(rsvpId: string): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = adminRsvpIdSchema.safeParse({ rsvpId });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const { error } = await serviceRoleClient()
    .from("rsvps")
    .update({ status: "approved", role: "guest" })
    .eq("id", parsed.data.rsvpId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

// Débloque depuis la vue globale (tous événements) -- même effet que
// `admin_unblock_participant` (SQL), mais en direct via service-role : ce
// RPC vérifie `is_event_admin` via `auth.uid()`, qui vaut toujours null ici
// (session admin maison, jamais une session Supabase Auth).
export async function unblockParticipantAdmin(rsvpId: string): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = adminRsvpIdSchema.safeParse({ rsvpId });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const { error } = await serviceRoleClient().from("rsvps").update({ blocked: false }).eq("id", parsed.data.rsvpId);
  if (error) {
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}

// Renvoie un lien magique à une adresse donnée -- même mécanisme que
// `sendMagicLink` (actions/auth.ts), déclenché ici par Thomas pour le compte
// de quelqu'un d'autre (ex: hôte injoignable qui redemande un accès).
export async function resendMagicLink(email: string): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = resendMagicLinkSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error) {
    return { ok: false, error: "unknown" };
  }
  return { ok: true };
}
