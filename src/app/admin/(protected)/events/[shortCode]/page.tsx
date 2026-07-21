import { notFound } from "next/navigation";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { resolveAvatarUrl, resolveEventPhotoUrl } from "@/lib/avatars";
import { logAdminEvent } from "@/lib/admin-log";
import { AdminEventViewer } from "@/components/admin/AdminEventViewer";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type Rsvp = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  answer: string;
  blocked: boolean;
  avatar_kind: "preset" | "photo";
  avatar_value: string | null;
};

function rsvpNameOf(r: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!r) return "?";
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "?";
}

// Retour Thomas : "j'aimerais pouvoir voir tout les event, ce qui se passe,
// les gens, le chat, etc... tout complet sans qu'on sache que je vois toutes
// les infos, et que mon nom apparait pas -- je ne dois juste pas avoir
// répondu à la demande", puis "j'aimerais voir la page dans admin comme si
// j'etais réelement dans le groupe" -- l'affichage (onglets, bulles,
// avatars) reprend donc le langage visuel exact du vrai parcours invité, via
// `AdminEventViewer` (composant séparé et purement présentationnel, voir son
// commentaire pour pourquoi les vrais composants interactifs ne sont pas
// réutilisés tels quels).
//
// Contrairement à `/e/[shortCode]` (le vrai parcours invité), cette page ne
// crée JAMAIS de ligne `rsvps`, ne poste rien dans le chat, et ne touche
// jamais `chat_reads` (pas de pastille "lu" laissée) -- lecture seule via le
// client service-role, aucune trace visible par qui que ce soit dans l'app.
// Seule trace : une ligne `admin_logs` (jamais exposée aux
// participants/organisateurs, seulement à Thomas via `/admin/health` ou la
// base), pour garder un minimum de redevabilité sur un accès aussi large à
// des conversations privées.
export default async function AdminEventDetailPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params;
  const admin = serviceRoleClient();

  const { data: event } = await admin.from("events").select("*").eq("short_code", shortCode).maybeSingle();
  if (!event) notFound();

  await logAdminEvent("admin:event-view", "info", `Événement consulté en lecture seule : ${shortCode}`);

  const [{ data: host }, { data: rsvpsRaw }, { data: messagesRaw }, { data: pollsRaw }, { data: bringItemsRaw }, { data: dateOptionsRaw }] =
    await Promise.all([
      admin.from("profiles").select("first_name, last_name").eq("id", event.host_id).maybeSingle(),
      admin
        .from("rsvps")
        .select("id, first_name, last_name, phone, role, status, answer, blocked, avatar_kind, avatar_value, created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      admin
        .from("messages")
        .select("id, rsvp_id, channel, body, photo_url, sticker_id, is_system, system_author_name, created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      admin.from("polls").select("id, question, poll_options(id, label, poll_votes(rsvp_id))").eq("event_id", event.id),
      admin
        .from("bring_items")
        .select("id, label, quantity_needed, bring_claims(rsvp_id, quantity, brought)")
        .eq("event_id", event.id),
      // Retour Thomas : "voir toutes les infos de la liste de la création de
      // l'événement... de l'étape 1 à la fin" -- inclut le sondage de DATE
      // (date_mode = 'poll'), distinct des sondages classiques (table `polls`)
      // déjà affichés dans l'onglet Sondages.
      event.date_mode === "poll"
        ? admin.from("date_options").select("id, starts_at, label, date_votes(rsvp_id)").eq("event_id", event.id)
        : Promise.resolve({ data: [] as { id: string; starts_at: string; label: string | null; date_votes: { rsvp_id: string }[] }[] }),
    ]);

  const rsvpsRawTyped = (rsvpsRaw ?? []) as Rsvp[];
  const rsvpById = new Map(rsvpsRawTyped.map((r) => [r.id, r]));

  const [avatarUrls, coverPhotoUrl] = await Promise.all([
    Promise.all(
      rsvpsRawTyped.map(async (r) => [r.id, await resolveAvatarUrl(admin, r.avatar_kind, r.avatar_value)] as const),
    ),
    resolveEventPhotoUrl(admin, event.cover_photo_path),
  ]);
  const avatarUrlByRsvp = new Map(avatarUrls);

  const rsvps = rsvpsRawTyped.map((r) => ({ ...r, avatarUrl: avatarUrlByRsvp.get(r.id) ?? null }));

  const messageIds = (messagesRaw ?? []).map((m) => m.id);
  const { data: reactionsRaw } =
    messageIds.length > 0
      ? await admin.from("message_reactions").select("message_id, sticker_id").in("message_id", messageIds)
      : { data: [] as { message_id: string; sticker_id: string }[] };
  const reactionsByMessage = new Map<string, Map<string, number>>();
  for (const r of reactionsRaw ?? []) {
    const perMessage = reactionsByMessage.get(r.message_id) ?? new Map<string, number>();
    perMessage.set(r.sticker_id, (perMessage.get(r.sticker_id) ?? 0) + 1);
    reactionsByMessage.set(r.message_id, perMessage);
  }

  const messages = await Promise.all(
    (messagesRaw ?? []).map(async (m) => ({
      ...m,
      resolvedPhotoUrl: m.photo_url ? await resolveEventPhotoUrl(admin, m.photo_url) : null,
      reactions: [...(reactionsByMessage.get(m.id) ?? new Map()).entries()] as [string, number][],
    })),
  );

  let pot: { total: number; contributions: { name: string; amount: number; status: string }[] } | null = null;
  if (event.pot_enabled) {
    const { data: contributions } = await admin
      .from("pot_contributions")
      .select("rsvp_id, amount_cents, is_anonymous, status")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });
    const rows = (contributions ?? []).map((c) => ({
      name: c.is_anonymous ? "Anonyme" : rsvpNameOf(rsvpById.get(c.rsvp_id ?? "")),
      amount: c.amount_cents,
      status: c.status,
    }));
    const total = rows.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amount, 0);
    pot = { total, contributions: rows };
  }

  const polls = (pollsRaw ?? []).map((poll) => ({
    id: poll.id,
    question: poll.question,
    options: (poll.poll_options as { id: string; label: string; poll_votes: { rsvp_id: string }[] }[]).map((opt) => ({
      id: opt.id,
      label: opt.label,
      voteCount: opt.poll_votes.length,
    })),
  }));

  const bringItems = (bringItemsRaw ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    quantity_needed: item.quantity_needed,
    claims: (item.bring_claims as { rsvp_id: string; quantity: number; brought: boolean }[]).map((c) => ({
      rsvpId: c.rsvp_id,
      quantity: c.quantity,
      brought: c.brought,
    })),
  }));

  const dateOptions = (dateOptionsRaw ?? []).map((opt) => ({
    id: opt.id,
    starts_at: opt.starts_at,
    label: opt.label,
    voteCount: opt.date_votes.length,
  }));

  return (
    <AdminEventViewer
      event={{ ...event, coverPhotoUrl }}
      host={host ?? { first_name: null, last_name: null }}
      rsvps={rsvps}
      messages={messages}
      polls={polls}
      bringItems={bringItems}
      pot={pot}
      dateOptions={dateOptions}
    />
  );
}
