import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toLocalDateTimeValue } from "@/lib/datetime";
import { CreateEventWizard, type WizardData } from "@/components/CreateEventWizard";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!event) notFound();

  // Un admin promu (pas seulement l'hôte littéral) doit pouvoir modifier
  // l'événement (retour Thomas : "il n'a pas accès à modifier") — cohérent
  // avec la policy RLS `events_update_by_admin`, qui autorise déjà
  // `is_event_admin` (host OU role='admin'). `is_event_admin` vit dans le
  // schéma `private` (jamais exposé via PostgREST) : impossible à appeler en
  // RPC depuis ce code, d'où une requête directe sur `rsvps` à la place
  // (protégée par `rsvps_select_own_or_admin`, même lecture "ma propre
  // ligne" que `myRsvpRow` dans page.tsx).
  const isHost = event.host_id === user?.id;
  const { data: myRsvp } =
    !isHost && user
      ? await supabase
          .from("rsvps")
          .select("role, status")
          .eq("event_id", event.id)
          .eq("profile_id", user.id)
          .maybeSingle()
      : { data: null };
  const isAdmin = isHost || (myRsvp?.status === "approved" && myRsvp?.role === "admin");
  if (!isAdmin) redirect(`/e/${shortCode}`);

  const { data: dateOptions } = await supabase
    .from("date_options")
    .select("starts_at, label")
    .eq("event_id", event.id)
    .order("starts_at");

  // "Qui apporte quoi" (brief 4.4) : items déjà définis, avec leur vrai `id`
  // -- nécessaire pour que createEvent/updateEvent puisse synchroniser par
  // diff plutôt que tout recréer (voir DECISIONS.md, `syncBringItems`).
  const { data: bringItemsRows } = await supabase
    .from("bring_items")
    .select("id, label, unit, quantity_needed")
    .eq("event_id", event.id);

  // Sondages : mêmes ids réels nécessaires pour que `syncPolls` diffe plutôt
  // que tout recréer (voir DECISIONS.md, même principe que `bringItemsRows`
  // ci-dessus). Options récupérées séparément puis groupées par sondage.
  const { data: pollRows } = await supabase
    .from("polls")
    .select("id, question, choice_mode")
    .eq("event_id", event.id);
  const pollIds = (pollRows ?? []).map((p) => p.id);
  const { data: pollOptionRows } =
    pollIds.length > 0
      ? await supabase.from("poll_options").select("id, poll_id, label").in("poll_id", pollIds)
      : { data: [] as { id: string; poll_id: string; label: string }[] };

  // Étape 5 (visibilité bénéficiaires) : prénoms des bénéficiaires déjà
  // approuvés, pour que les phrases ("Julie a accès à...") soient réelles
  // plutôt que génériques. Vide à la création (pas de participants encore),
  // ce fichier ne gère que l'édition.
  const { data: beneficiaryRows } = await supabase
    .from("rsvps")
    .select("first_name")
    .eq("event_id", event.id)
    .eq("role", "beneficiary")
    .eq("status", "approved");
  const beneficiaryNames = (beneficiaryRows ?? [])
    .map((r) => r.first_name)
    .filter((name): name is string => !!name);

  const photoUrl = event.cover_photo_path
    ? (
        await supabase.storage
          .from("event-photos")
          .createSignedUrl(event.cover_photo_path, 3600)
      ).data?.signedUrl ?? null
    : null;

  const initialData: WizardData = {
    title: event.title,
    theme: event.theme,
    dateMode: event.date_mode,
    startsAt: event.starts_at ? toLocalDateTimeValue(new Date(event.starts_at)) : "",
    endsAt: event.ends_at ? toLocalDateTimeValue(new Date(event.ends_at)) : "",
    dateOptions:
      dateOptions && dateOptions.length > 0
        ? dateOptions.map((option) => ({
            startsAt: toLocalDateTimeValue(new Date(option.starts_at)),
            label: option.label ?? "",
          }))
        : [
            { startsAt: "", label: "" },
            { startsAt: "", label: "" },
          ],
    locationText: event.location_text ?? "",
    locationLat: event.location_lat ?? null,
    locationLng: event.location_lng ?? null,
    coverPhotoPath: event.cover_photo_path ?? "",
    occasion: event.occasion ?? "other",
    birthdayPerson: event.birthday_person ?? "",
    birthdayDate: event.birthday_date ?? "",
    showAge: event.show_age,
    housewarmingHosts: event.housewarming_hosts?.length ? event.housewarming_hosts : [""],
    bachelorPerson: event.bachelor_person ?? "",
    description: event.description ?? "",
    instructions: event.instructions ?? "",
    dressCode: event.dress_code ?? "",
    bringGeneral: event.bring_general ?? "",
    rsvpDeadline: event.rsvp_deadline ? event.rsvp_deadline.slice(0, 10) : "",
    kidsAllowed: event.kids_allowed ?? "",
    petsAllowed: event.pets_allowed ?? "",
    maxGuests: event.max_guests?.toString() ?? "",
    allowCompanions: event.allow_companions,
    autoApprove: event.auto_approve,
    sharePolicy: event.share_policy,
    potEnabled: event.pot_enabled,
    potMode: event.pot_mode,
    potGoalEuros: event.pot_goal_cents ? (event.pot_goal_cents / 100).toString() : "",
    potLabel: event.pot_label ?? "",
    potCloseAtGoal: event.pot_close_at_goal ?? false,
    bringItems: (bringItemsRows ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      unit: item.unit as "piece" | "liter" | "gram" | "kilogram",
      quantityNeeded: item.quantity_needed.toString(),
    })),
    polls: (pollRows ?? []).map((poll) => ({
      id: poll.id,
      question: poll.question,
      options: (pollOptionRows ?? [])
        .filter((option) => option.poll_id === poll.id)
        .map((option) => ({ id: option.id, label: option.label })),
      choiceMode: poll.choice_mode as "single" | "multiple",
    })),
    beneficiaryHiddenBlocks: event.beneficiary_hidden_blocks ?? [],
  };

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-12 sm:py-16">
      <CreateEventWizard
        eventId={event.id}
        shortCode={event.short_code}
        initialData={initialData}
        initialPhotoUrl={photoUrl}
        beneficiaryNames={beneficiaryNames}
      />
    </main>
  );
}
