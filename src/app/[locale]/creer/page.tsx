import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateEventWizard } from "@/components/CreateEventWizard";

// Retour Thomas : "quand on clique sur créer un event, on arrive sur la page
// de connexion si on n'est pas connecté, et sur créer l'event si on est
// connecté" -- découvert en conditions réelles (base tout juste vidée, un
// vrai visiteur non connecté) que rien ne vérifiait la connexion avant
// d'entrer dans l'assistant : on pouvait remplir les 5 étapes en entier avant
// de découvrir, au clic final sur "Créer l'événement", un message générique
// ("Oups, quelque chose s'est mal passé") au lieu d'être invité à se
// connecter -- jamais vu avant puisque tous les tests précédents avaient déjà
// une session ouverte. Vérifié dès l'entrée sur la page plutôt qu'au clic
// final, pour ne jamais faire perdre sa saisie à quelqu'un.
export default async function CreateEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?next=/creer");
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-12 sm:py-16">
      <CreateEventWizard />
    </main>
  );
}
