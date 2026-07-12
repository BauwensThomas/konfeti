import { type ReactNode } from "react";

// Habillage commun aux 4 pages légales (brief section 9) -- le contenu de
// chaque page vient de messages/fr.json (namespaces dédiés), pour permettre
// une traduction future vers d'autres langues.
export function LegalPageLayout({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <article className="flex w-full max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold text-primary">{title}</h1>
        <p className="text-xs text-foreground/50">Dernière mise à jour : {updatedAt}</p>
        <div className="flex flex-col gap-5">{children}</div>
      </article>
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold text-foreground">{heading}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}
