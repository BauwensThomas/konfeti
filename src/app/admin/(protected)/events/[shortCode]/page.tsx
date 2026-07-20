import { notFound } from "next/navigation";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { resolveAvatarUrl, resolveEventPhotoUrl } from "@/lib/avatars";
import { logAdminEvent } from "@/lib/admin-log";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Participants",
  pending: "En attente",
  restricted: "Ne viennent pas",
  removed: "Retirés / partis",
  left: "Partis",
};

const ANSWER_LABELS: Record<string, string> = { yes: "Je viens", maybe: "Peut-être", no: "Je ne peux pas" };

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
  created_at: string;
};

// Retour Thomas : "j'aimerais pouvoir voir tout les event, ce qui se passe,
// les gens, le chat, etc... tout complet sans qu'on sache que je vois toutes
// les infos, et que mon nom apparait pas -- je ne dois juste pas avoir
// répondu à la demande". Contrairement à `/e/[shortCode]` (le vrai parcours
// invité), cette page ne crée JAMAIS de ligne `rsvps`, ne poste rien dans le
// chat, et ne touche jamais `chat_reads` (pas de pastille "lu" laissée) --
// lecture seule via le client service-role, aucune trace visible par qui que
// ce soit dans l'app. Seule trace : une ligne `admin_logs` (jamais exposée
// aux participants/organisateurs, seulement à Thomas via `/admin/health` ou
// la base), pour garder un minimum de redevabilité sur un accès aussi large
// à des conversations privées.
export default async function AdminEventDetailPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params;
  const admin = serviceRoleClient();

  const { data: event } = await admin.from("events").select("*").eq("short_code", shortCode).maybeSingle();
  if (!event) notFound();

  await logAdminEvent("admin:event-view", "info", `Événement consulté en lecture seule : ${shortCode}`);

  const [{ data: host }, { data: rsvpsRaw }, { data: messagesRaw }, { data: pollsRaw }, { data: bringItemsRaw }] =
    await Promise.all([
      admin.from("profiles").select("first_name, last_name").eq("id", event.host_id).maybeSingle(),
      admin
        .from("rsvps")
        .select("id, first_name, last_name, phone, role, status, answer, blocked, avatar_kind, avatar_value, created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      admin
        .from("messages")
        .select("id, rsvp_id, channel, body, photo_url, sticker_id, reply_to, is_system, system_author_name, created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      admin.from("polls").select("id, question, poll_options(id, label, poll_votes(rsvp_id))").eq("event_id", event.id),
      admin
        .from("bring_items")
        .select("id, label, quantity_needed, bring_claims(rsvp_id, quantity, brought)")
        .eq("event_id", event.id),
    ]);

  const rsvps = (rsvpsRaw ?? []) as Rsvp[];
  const rsvpById = new Map(rsvps.map((r) => [r.id, r]));

  const [avatarUrls, coverPhotoUrl] = await Promise.all([
    Promise.all(
      rsvps.map(async (r) => [r.id, await resolveAvatarUrl(admin, r.avatar_kind, r.avatar_value)] as const),
    ),
    resolveEventPhotoUrl(admin, event.cover_photo_path),
  ]);
  const avatarUrlByRsvp = new Map(avatarUrls);

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

  const messagesWithPhotoUrl = await Promise.all(
    (messagesRaw ?? []).map(async (m) => ({
      ...m,
      resolvedPhotoUrl: m.photo_url ? await resolveEventPhotoUrl(admin, m.photo_url) : null,
    })),
  );

  let pot: { total: number; contributions: { name: string; amount: number; anonymous: boolean; status: string }[] } | null =
    null;
  if (event.pot_enabled) {
    const { data: contributions } = await admin
      .from("pot_contributions")
      .select("rsvp_id, amount_cents, net_cents, is_anonymous, status")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });
    const rows = (contributions ?? []).map((c) => ({
      name: c.is_anonymous ? "Anonyme" : rsvpNameOf(rsvpById.get(c.rsvp_id ?? "")),
      amount: c.amount_cents,
      anonymous: c.is_anonymous,
      status: c.status,
    }));
    const total = rows.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amount, 0);
    pot = { total, contributions: rows };
  }

  const grouped = new Map<string, Rsvp[]>();
  for (const r of rsvps) {
    const key = r.blocked ? "blocked" : r.status;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <h1 className="font-display text-xl font-bold text-foreground">{event.title}</h1>
        <p className="text-sm text-foreground/60">
          {event.short_code} · {event.status === "cancelled" ? "Annulé" : "Actif"} · thème {event.theme} · organisé par{" "}
          {host?.first_name} {host?.last_name}
        </p>
        <p className="text-sm text-foreground/70">
          {event.starts_at ? new Date(event.starts_at).toLocaleString("fr-BE") : "Date en cours de vote"}
          {event.location_text ? ` · ${event.location_text}` : ""}
        </p>
        {event.description && <p className="text-sm text-foreground/80">{event.description}</p>}
        {coverPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- outil interne, pas la peine d'optimiser via next/image
          <img src={coverPhotoUrl} alt="" className="mt-2 max-h-64 w-full rounded-konfeti object-cover" />
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-bold text-foreground">
          Participants ({rsvps.length})
        </h2>
        {(["approved", "pending", "restricted", "removed", "left", "blocked"] as const).map((key) =>
          grouped.get(key)?.length ? (
            <div key={key} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground/70">
                {key === "blocked" ? "Bloqués" : STATUS_LABELS[key]} ({grouped.get(key)!.length})
              </h3>
              <ul className="flex flex-col gap-2">
                {grouped.get(key)!.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-konfeti border border-border p-2 text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      {avatarUrlByRsvp.get(r.id) && (
                        // eslint-disable-next-line @next/next/no-img-element -- outil interne
                        <img src={avatarUrlByRsvp.get(r.id)!} alt="" className="h-6 w-6 rounded-full object-cover" />
                      )}
                      {r.first_name} {r.last_name}
                      {r.role !== "guest" && <span className="text-foreground/50"> ({r.role})</span>}
                    </span>
                    <span className="text-foreground/60">
                      {ANSWER_LABELS[r.answer] ?? r.answer} · {r.phone ?? "pas de téléphone"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </Card>

      {(["main", "backstage"] as const).map((channel) => {
        const channelMessages = messagesWithPhotoUrl.filter((m) => m.channel === channel);
        if (channelMessages.length === 0) return null;
        return (
          <Card key={channel} className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              Chat -- {channel === "main" ? "Général" : "Coulisses"} ({channelMessages.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {channelMessages.map((m) => {
                const author = m.is_system
                  ? m.system_author_name
                    ? `Système (${m.system_author_name})`
                    : "Système"
                  : rsvpNameOf(rsvpById.get(m.rsvp_id ?? ""));
                const reactions = reactionsByMessage.get(m.id);
                return (
                  <li key={m.id} className="flex flex-col gap-1 rounded-konfeti border border-border p-2 text-sm">
                    <span className="text-xs font-semibold text-foreground/60">
                      {author} · {new Date(m.created_at).toLocaleString("fr-BE")}
                    </span>
                    {m.body && <span className="text-foreground">{m.body}</span>}
                    {m.sticker_id && <span className="text-foreground/70">[sticker: {m.sticker_id}]</span>}
                    {m.resolvedPhotoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- outil interne
                      <img src={m.resolvedPhotoUrl} alt="" className="max-h-48 rounded-konfeti object-cover" />
                    )}
                    {reactions && reactions.size > 0 && (
                      <span className="text-xs text-foreground/60">
                        {[...reactions.entries()].map(([sticker, count]) => `${sticker}×${count}`).join(" ")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      {pot && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            Cagnotte -- {(pot.total / 100).toFixed(2)} € collectés
            {event.pot_goal_cents ? ` / objectif ${(event.pot_goal_cents / 100).toFixed(2)} €` : ""}
          </h2>
          <ul className="flex flex-col gap-2">
            {pot.contributions.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{c.name}</span>
                <span className="text-foreground/60">
                  {(c.amount / 100).toFixed(2)} € ({c.status === "succeeded" ? "payé" : c.status})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pollsRaw && pollsRaw.length > 0 && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-bold text-foreground">Sondages</h2>
          {pollsRaw.map((poll) => (
            <div key={poll.id} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">{poll.question}</p>
              <ul className="flex flex-col gap-1">
                {(poll.poll_options as { id: string; label: string; poll_votes: { rsvp_id: string }[] }[]).map((opt) => (
                  <li key={opt.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground/80">{opt.label}</span>
                    <span className="text-foreground/60">{opt.poll_votes.length} vote(s)</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {bringItemsRaw && bringItemsRaw.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">Qui apporte quoi</h2>
          <ul className="flex flex-col gap-2">
            {bringItemsRaw.map((item) => {
              const claims = item.bring_claims as { rsvp_id: string; quantity: number; brought: boolean }[];
              return (
                <li key={item.id} className="flex flex-col gap-1 text-sm">
                  <span className="text-foreground">
                    {item.label} ({item.quantity_needed} demandé{item.quantity_needed > 1 ? "s" : ""})
                  </span>
                  {claims.length === 0 ? (
                    <span className="text-foreground/50">Personne pour l&apos;instant</span>
                  ) : (
                    <span className="text-foreground/60">
                      {claims
                        .map((c) => `${rsvpNameOf(rsvpById.get(c.rsvp_id))} (${c.quantity}${c.brought ? ", apporté" : ""})`)
                        .join(", ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function rsvpNameOf(r: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!r) return "?";
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "?";
}
