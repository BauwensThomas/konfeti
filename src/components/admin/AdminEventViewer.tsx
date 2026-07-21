"use client";

import { useState } from "react";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { Card } from "@/components/ui/Card";

type Rsvp = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  answer: string;
  blocked: boolean;
  avatarUrl: string | null;
};

type Message = {
  id: string;
  rsvp_id: string | null;
  channel: "main" | "backstage";
  body: string | null;
  sticker_id: string | null;
  resolvedPhotoUrl: string | null;
  is_system: boolean;
  system_author_name: string | null;
  created_at: string;
  reactions: [string, number][];
};

type Poll = { id: string; question: string; options: { id: string; label: string; voteCount: number }[] };
type BringItem = { id: string; label: string; quantity_needed: number; claims: { rsvpId: string; quantity: number; brought: boolean }[] };
type PotContribution = { name: string; amount: number; status: string };
type DateOption = { id: string; starts_at: string; label: string | null; voteCount: number };

// Toutes les colonnes de `events` (retour Thomas : "voir toutes les infos de
// la liste de la création de l'événement... de l'étape 1 à la fin, pour
// savoir ce que la personne a coché ou non") -- reprend exactement les
// champs du wizard (`CreateEventWizard.tsx`, `CreateEvent.step1` à `step5`
// dans `messages/fr.json`), affichés en lecture seule dans un nouvel onglet
// "Configuration".
type EventFull = {
  title: string;
  short_code: string;
  status: string;
  theme: string;
  starts_at: string | null;
  ends_at: string | null;
  date_mode: string;
  location_text: string | null;
  description: string | null;
  instructions: string | null;
  coverPhotoUrl: string | null;
  pot_enabled: boolean;
  pot_goal_cents: number | null;
  pot_mode: string;
  pot_label: string | null;
  pot_close_at_goal: boolean;
  occasion: string | null;
  birthday_person: string | null;
  birthday_date: string | null;
  birthday_age: number | null;
  show_age: boolean;
  housewarming_hosts: string[] | null;
  bachelor_person: string | null;
  dress_code: string | null;
  bring_general: string | null;
  kids_allowed: string | null;
  pets_allowed: string | null;
  rsvp_deadline: string | null;
  max_guests: number | null;
  allow_companions: boolean;
  auto_approve: boolean;
  share_policy: string;
  beneficiary_hidden_blocks: string[];
};

const OCCASION_LABELS: Record<string, string> = {
  birthday: "Anniversaire",
  housewarming: "Crémaillère",
  bachelor: "Enterrement de vie de garçon/fille",
  bbq: "Barbecue",
  aperitif: "Apéro",
  new_year: "Nouvel An",
  other: "Autre",
};
const YES_NO_DETAILS_LABELS: Record<string, string> = { yes: "Oui", no: "Non", details: "Ça dépend" };
const SHARE_POLICY_LABELS: Record<string, string> = { all: "Tout le monde", admins: "Les admins seulement" };
const POT_MODE_LABELS: Record<string, string> = { goal: "Objectif fixe", open: "Montant libre" };
const BENEFICIARY_BLOCK_LABELS: Record<string, string> = {
  pot: "la cagnotte",
  backstage: "le fil Coulisses",
  chat: "le chat général",
  bring: "\"qui apporte quoi\"",
  polls: "les sondages",
  participants: "la liste des participants",
};

function ConfigRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 text-sm last:border-0">
      <span className="text-xs font-semibold text-foreground/50">{label}</span>
      <span className="text-foreground">{value || "Non renseigné"}</span>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Participants",
  pending: "En attente",
  restricted: "Ne viennent pas",
  removed: "Retirés / partis",
  left: "Partis",
  blocked: "Bloqués",
};
const ANSWER_LABELS: Record<string, string> = { yes: "Je viens", maybe: "Peut-être", no: "Je ne peux pas" };
const ROLE_LABELS: Record<string, string> = { admin: "Organisateur", beneficiary: "Bénéficiaire" };

const TABS = ["accueil", "personnes", "chat", "cagnotte", "sondages", "apporter", "config"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = {
  accueil: "Accueil",
  personnes: "Personnes",
  chat: "Chat",
  cagnotte: "Cagnotte",
  sondages: "Sondages",
  apporter: "Qui apporte quoi",
  config: "Configuration",
};

function rsvpNameOf(r: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!r) return "?";
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "?";
}

// Vue admin "comme si j'étais réellement dans le groupe" (retour Thomas) --
// reprend le langage visuel exact du vrai parcours invité (barre d'onglets
// pilule de `EventTabs.tsx`, bulles de chat de `MessageBubble.tsx`, lignes
// avatar de `ParticipantsList.tsx`) plutôt qu'une simple liste de données.
// Volontairement un COMPOSANT SÉPARÉ, pas les vrais composants importés tels
// quels : ceux-ci sont câblés à un vrai `viewerRsvpId`, du Realtime, et des
// Server Actions d'écriture (réagir, modifier, approuver...) -- tout ça
// exigerait une fausse identité de participant pour fonctionner, ce qui casse
// justement l'exigence "sans laisser de trace, mon nom n'apparaît nulle
// part". Ici, purement présentationnel : aucune écriture possible, aucune
// case "propriétaire du message" (tous les messages sont affichés comme
// "reçus", jamais alignés à droite en violet -- il n'y a pas de VRAI
// message de l'admin dans ce salon).
export function AdminEventViewer({
  event,
  host,
  rsvps,
  messages,
  polls,
  bringItems,
  pot,
  dateOptions,
}: {
  event: EventFull;
  host: { first_name: string | null; last_name: string | null };
  rsvps: Rsvp[];
  messages: Message[];
  polls: Poll[];
  bringItems: BringItem[];
  pot: { total: number; contributions: PotContribution[] } | null;
  dateOptions: DateOption[];
}) {
  const [active, setActive] = useState<TabKey>("accueil");
  const [chatChannel, setChatChannel] = useState<"main" | "backstage">("main");
  const rsvpById = new Map(rsvps.map((r) => [r.id, r]));

  const visibleTabs = TABS.filter((tab) => {
    if (tab === "cagnotte") return event.pot_enabled;
    if (tab === "sondages") return polls.length > 0;
    if (tab === "apporter") return bringItems.length > 0;
    return true;
  });

  const grouped = new Map<string, Rsvp[]>();
  for (const r of rsvps) {
    const key = r.blocked ? "blocked" : r.status;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }

  const channelMessages = messages.filter((m) => m.channel === chatChannel);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap rounded-full bg-surface p-1 shadow-konfeti">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`flex flex-1 items-center justify-center rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              active === tab ? "bg-primary text-white" : "text-foreground/70"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {active === "accueil" && (
        <Card className="flex flex-col gap-3">
          {event.coverPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- outil interne
            <img src={event.coverPhotoUrl} alt="" className="max-h-64 w-full rounded-konfeti object-cover" />
          )}
          <h1 className="font-display text-xl font-bold text-foreground">{event.title}</h1>
          <p className="text-sm text-foreground/70">
            Organisé par {rsvpNameOf(host)} · thème {event.theme} ·{" "}
            {event.status === "cancelled" ? "Annulé" : "Actif"}
          </p>
          <p className="text-sm text-foreground">
            {event.date_mode === "poll" || !event.starts_at
              ? "Date en cours de vote"
              : new Date(event.starts_at).toLocaleString("fr-BE", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            {event.location_text ? ` · ${event.location_text}` : ""}
          </p>
          {event.description && <p className="text-sm text-foreground/80">{event.description}</p>}
          {event.instructions && (
            <p className="rounded-konfeti bg-surface p-3 text-sm text-foreground/80">{event.instructions}</p>
          )}
        </Card>
      )}

      {active === "personnes" && (
        <Card className="flex flex-col gap-4">
          {(["approved", "pending", "restricted", "removed", "left", "blocked"] as const).map((key) =>
            grouped.get(key)?.length ? (
              <div key={key} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground/70">
                  {STATUS_LABELS[key]} ({grouped.get(key)!.length})
                </h3>
                <ul className="flex flex-col gap-3">
                  {grouped.get(key)!.map((r) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                        {r.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- outil interne
                          <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <AvatarPlaceholder className="h-full w-full rounded-full" compact />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">
                          {r.first_name} {r.last_name}
                        </span>
                        <span className="text-xs text-foreground/60">
                          {ROLE_LABELS[r.role] ?? (ANSWER_LABELS[r.answer] ?? r.answer)}
                        </span>
                        {r.phone && <span className="text-xs text-foreground/60">{r.phone}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </Card>
      )}

      {active === "chat" && (
        <Card className="flex flex-col gap-3 p-0 overflow-hidden">
          <div className="flex gap-1 p-3 pb-0">
            {(["main", "backstage"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChatChannel(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  chatChannel === c ? "bg-primary text-white" : "bg-surface text-foreground/70"
                }`}
              >
                {c === "main" ? "Général" : "Coulisses"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 bg-canvas p-3">
            {channelMessages.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground/50">Aucun message.</p>
            ) : (
              channelMessages.map((m, i) => {
                const prev = channelMessages[i - 1];
                const showHeader = m.is_system ? false : !prev || prev.is_system || prev.rsvp_id !== m.rsvp_id;
                const author = m.is_system
                  ? null
                  : rsvpNameOf(rsvpById.get(m.rsvp_id ?? ""));
                const avatarUrl = m.rsvp_id ? rsvpById.get(m.rsvp_id)?.avatarUrl : null;

                if (m.is_system) {
                  return (
                    <p key={m.id} className="py-1 text-center text-xs text-foreground/50">
                      {m.system_author_name ?? "Quelqu'un"} {m.body === "left" ? "a quitté" : "a rejoint"} l&apos;événement
                    </p>
                  );
                }

                return (
                  <div key={m.id} className="flex w-full gap-2">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                      {showHeader ? (
                        avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- outil interne
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <AvatarPlaceholder className="h-full w-full rounded-full" compact />
                        )
                      ) : null}
                    </div>
                    <div className="flex min-w-0 max-w-[75%] flex-col gap-1 items-start">
                      {showHeader && <span className="text-xs font-semibold text-foreground/60">{author}</span>}
                      {m.resolvedPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- outil interne
                        <img src={m.resolvedPhotoUrl} alt="" className="max-h-60 rounded-konfeti object-contain" />
                      ) : (
                        <div className="flex max-w-full flex-col gap-0.5 rounded-konfeti bg-surface px-3 py-2 text-sm text-foreground">
                          {m.body && <span className="whitespace-pre-line wrap-break-word">{m.body}</span>}
                          {m.sticker_id && <span className="text-foreground/60">[sticker : {m.sticker_id}]</span>}
                          <span className="self-end text-[10px] leading-none text-foreground/45">
                            {new Date(m.created_at).toLocaleString("fr-BE", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      )}
                      {m.reactions.length > 0 && (
                        <div className="flex gap-1">
                          {m.reactions.map(([sticker, count]) => (
                            <span key={sticker} className="rounded-full bg-surface px-2 py-0.5 text-xs">
                              {sticker} {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {active === "cagnotte" && pot && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            {(pot.total / 100).toFixed(2)} € collectés
            {event.pot_goal_cents ? ` / objectif ${(event.pot_goal_cents / 100).toFixed(2)} €` : ""}
          </h2>
          {event.pot_goal_cents && (
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (pot.total / event.pot_goal_cents) * 100)}%` }}
              />
            </div>
          )}
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

      {active === "sondages" && (
        <Card className="flex flex-col gap-4">
          {polls.map((poll) => (
            <div key={poll.id} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">{poll.question}</p>
              <ul className="flex flex-col gap-1">
                {poll.options.map((opt) => (
                  <li key={opt.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground/80">{opt.label}</span>
                    <span className="text-foreground/60">{opt.voteCount} vote(s)</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {active === "apporter" && (
        <Card className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {bringItems.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 text-sm">
                <span className="text-foreground">
                  {item.label} ({item.quantity_needed} demandé{item.quantity_needed > 1 ? "s" : ""})
                </span>
                {item.claims.length === 0 ? (
                  <span className="text-foreground/50">Personne pour l&apos;instant</span>
                ) : (
                  <span className="text-foreground/60">
                    {item.claims
                      .map((c) => `${rsvpNameOf(rsvpById.get(c.rsvpId))} (${c.quantity}${c.brought ? ", apporté" : ""})`)
                      .join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active === "config" && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col">
            <h2 className="mb-1 font-display text-base font-bold text-foreground">1. L&apos;essentiel</h2>
            <ConfigRow label="Titre" value={event.title} />
            <ConfigRow label="Thème visuel" value={event.theme} />
            <ConfigRow
              label="La date"
              value={
                event.date_mode === "poll"
                  ? `Vote en cours (${dateOptions.length} date${dateOptions.length > 1 ? "s" : ""} proposée${dateOptions.length > 1 ? "s" : ""})`
                  : event.starts_at
                    ? new Date(event.starts_at).toLocaleString("fr-BE", { dateStyle: "full", timeStyle: "short" })
                    : null
              }
            />
            {event.date_mode === "poll" && dateOptions.length > 0 && (
              <ul className="flex flex-col gap-1 py-2 text-sm">
                {dateOptions.map((opt) => (
                  <li key={opt.id} className="flex items-center justify-between">
                    <span className="text-foreground/80">
                      {new Date(opt.starts_at).toLocaleString("fr-BE", { dateStyle: "long", timeStyle: "short" })}
                      {opt.label ? ` (${opt.label})` : ""}
                    </span>
                    <span className="text-foreground/60">{opt.voteCount} vote(s)</span>
                  </li>
                ))}
              </ul>
            )}
            <ConfigRow label="Date et heure de fin" value={event.ends_at ? new Date(event.ends_at).toLocaleString("fr-BE", { dateStyle: "full", timeStyle: "short" }) : null} />
            <ConfigRow label="Lieu" value={event.location_text} />
          </Card>

          <Card className="flex flex-col">
            <h2 className="mb-1 font-display text-base font-bold text-foreground">2. L&apos;occasion</h2>
            <ConfigRow label="Pourquoi cette fête ?" value={event.occasion ? (OCCASION_LABELS[event.occasion] ?? event.occasion) : null} />
            {event.occasion === "birthday" && (
              <>
                <ConfigRow label="L'anniversaire de qui ?" value={event.birthday_person} />
                <ConfigRow
                  label="Date officielle de l'anniversaire"
                  value={event.birthday_date ? new Date(event.birthday_date).toLocaleDateString("fr-BE") : null}
                />
                <ConfigRow label="Âge fêté" value={event.birthday_age != null ? `${event.birthday_age} ans` : null} />
                <ConfigRow label="Afficher l'âge sur l'invitation" value={event.show_age ? "Oui" : "Non"} />
              </>
            )}
            {event.occasion === "housewarming" && (
              <ConfigRow
                label="C'est la crémaillère de qui ?"
                value={event.housewarming_hosts && event.housewarming_hosts.length > 0 ? event.housewarming_hosts.join(", ") : null}
              />
            )}
            {event.occasion === "bachelor" && (
              <ConfigRow label="Le nom du futur marié ou de la future mariée" value={event.bachelor_person} />
            )}
            <ConfigRow label="Description libre" value={event.description} />
          </Card>

          <Card className="flex flex-col">
            <h2 className="mb-1 font-display text-base font-bold text-foreground">3. Les consignes</h2>
            <ConfigRow label="Ce que les invités doivent savoir" value={event.instructions} />
            <ConfigRow label="Tenue / dress code" value={event.dress_code} />
            <ConfigRow label="À prévoir" value={event.bring_general} />
            <ConfigRow
              label="Date limite de réponse"
              value={event.rsvp_deadline ? new Date(event.rsvp_deadline).toLocaleString("fr-BE", { dateStyle: "full", timeStyle: "short" }) : null}
            />
            <ConfigRow label="Enfants bienvenus ?" value={event.kids_allowed ? (YES_NO_DETAILS_LABELS[event.kids_allowed] ?? event.kids_allowed) : null} />
            <ConfigRow label="Animaux bienvenus ?" value={event.pets_allowed ? (YES_NO_DETAILS_LABELS[event.pets_allowed] ?? event.pets_allowed) : null} />
          </Card>

          <Card className="flex flex-col">
            <h2 className="mb-1 font-display text-base font-bold text-foreground">4. Les extras</h2>
            <ConfigRow label="Nombre maximum de participants" value={event.max_guests != null ? String(event.max_guests) : null} />
            <ConfigRow label="Autoriser les accompagnants (+X)" value={event.allow_companions ? "Oui" : "Non"} />
            <ConfigRow label="Approbation automatique des invités" value={event.auto_approve ? "Oui" : "Non"} />
            <ConfigRow label="Qui peut partager le lien ?" value={SHARE_POLICY_LABELS[event.share_policy] ?? event.share_policy} />
            <ConfigRow label="Cagnotte activée" value={event.pot_enabled ? "Oui" : "Non"} />
            {event.pot_enabled && (
              <>
                <ConfigRow label="Type de cagnotte" value={POT_MODE_LABELS[event.pot_mode] ?? event.pot_mode} />
                <ConfigRow label="Objectif" value={event.pot_goal_cents ? `${(event.pot_goal_cents / 100).toFixed(2)} €` : null} />
                <ConfigRow label="Nom de la cagnotte" value={event.pot_label} />
                <ConfigRow label="Fermeture auto à l'objectif atteint" value={event.pot_close_at_goal ? "Oui" : "Non"} />
              </>
            )}
          </Card>

          <Card className="flex flex-col">
            <h2 className="mb-1 font-display text-base font-bold text-foreground">5. Ce que voient les bénéficiaires</h2>
            <ConfigRow
              label="Blocs masqués aux bénéficiaires"
              value={
                event.beneficiary_hidden_blocks.length > 0
                  ? event.beneficiary_hidden_blocks.map((b) => BENEFICIARY_BLOCK_LABELS[b] ?? b).join(", ")
                  : "Aucun, tout est visible"
              }
            />
          </Card>
        </div>
      )}
    </div>
  );
}
