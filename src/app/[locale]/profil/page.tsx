import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { ProfileCompletionForm } from "@/components/ProfileCompletionForm";

// Édition du profil, accessible à tout moment (bouton "Modifier mon profil"
// du footer), y compris à une session anonyme "code d'accès" (retour
// Thomas : elle a bien rempli nom/prénom/photo via le formulaire RSVP, elle
// doit pouvoir les modifier) — `proxy.ts` ne protège plus que
// `/profil/completer` (parcours de création de compte), pas cette page-ci.
// Distincte de `/profil/completer` : jamais de redirection forcée.
export default async function ProfilePage() {
  const t = await getTranslations("ProfileCompletion");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion?next=/profil");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, gender, avatar_kind, avatar_value")
    .eq("id", user.id)
    .maybeSingle();

  // Un invité anonyme n'a jamais rempli `profiles` (le formulaire RSVP écrit
  // directement dans `rsvps`, sans jamais passer par la complétion de
  // profil) : ce champ resterait vide sans ce repli sur sa participation la
  // plus récente, pourtant bien la seule vraie source de son identité connue.
  const hasProfileIdentity = !!profile?.first_name;
  const { data: latestRsvp } = hasProfileIdentity
    ? { data: null }
    : await supabase
        .from("rsvps")
        .select("first_name, last_name, phone, gender, avatar_kind, avatar_value")
        .eq("profile_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const identity = hasProfileIdentity ? profile : latestRsvp;

  const avatarPreviewUrl =
    identity?.avatar_kind === "photo"
      ? await resolveAvatarUrl(supabase, identity.avatar_kind, identity.avatar_value)
      : null;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 text-center sm:py-24">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold text-primary">
          {t("editHeading")}
        </h1>
        <p className="text-base text-foreground/80">{t("editSubheading")}</p>
      </div>

      <ProfileCompletionForm
        mode="edit"
        initial={{
          firstName: identity?.first_name ?? "",
          lastName: identity?.last_name ?? "",
          phone: identity?.phone ?? "",
          gender: (identity?.gender as "female" | "male" | null) ?? null,
          avatarKind: (identity?.avatar_kind as "preset" | "photo") ?? "preset",
          avatarValue: identity?.avatar_value ?? null,
          avatarPreviewUrl,
        }}
      />
    </main>
  );
}
