import "../[locale]/globals.css";

// Back-office /admin (Phase 9) : hors du segment `[locale]`, donc hors de
// `[locale]/layout.tsx` -- ce layout est le seul à fournir <html>/<body>
// pour toute cette arborescence. Pas de next-intl (outil développeur,
// français en dur), pas de Header/Footer applicatif (voir `(protected)/layout.tsx`
// pour la nav propre au back-office).
export const metadata = {
  title: "Konfeti Admin",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
