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
  if (event.host_id !== user?.id) redirect(`/e/${shortCode}`);

  const { data: dateOptions } = await supabase
    .from("date_options")
    .select("starts_at, label")
    .eq("event_id", event.id)
    .order("starts_at");

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
  };

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-12 sm:py-16">
      <CreateEventWizard
        eventId={event.id}
        shortCode={event.short_code}
        initialData={initialData}
        initialPhotoUrl={photoUrl}
      />
    </main>
  );
}
