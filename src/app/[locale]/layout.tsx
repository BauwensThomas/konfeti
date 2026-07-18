import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { routing } from "@/i18n/routing";
import { ConfettiBackground } from "@/components/ConfettiBackground";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SessionExpiredBanner } from "@/components/SessionExpiredBanner";
import "./globals.css";

const balooTwo = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

// Balises meta + Open Graph par défaut (brief 5.7), héritées par toutes les
// pages sauf celles qui définissent leur propre `generateMetadata`/
// `opengraph-image` (ex. la page événement, Open Graph dynamique par
// événement — voir src/app/[locale]/e/[shortCode]/).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const title = t("title");
  const description = t("subtitle");

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    title: { default: title, template: `%s · ${title}` },
    description,
    openGraph: {
      title,
      description,
      siteName: title,
      locale,
      type: "website",
      images: ["/logo-texte.webp"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    // iOS ne respecte pas `manifest.ts`/`display: "standalone"` pour "Ajouter
    // à l'écran d'accueil" (comportement Chrome/Android) : ces balises meta
    // spécifiques sont nécessaires pour qu'un lancement depuis l'icône ouvre
    // l'app en plein écran (repérable par `StandaloneRedirect.tsx`) plutôt
    // qu'un onglet Safari classique.
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Konfeti",
    },
  };
}

// `viewportFit: "cover"` : sans ça, `env(safe-area-inset-*)` (voir
// globals.css, `.pt-safe`/`.pb-safe`) reste figé à 0 sur iOS — la page ne
// "couvre" pas la zone de l'encoche/barre de gestes tant que ce réglage
// n'est pas explicite, quel que soit le CSS écrit par ailleurs.
export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#7c3aed",
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html
      lang={locale}
      className={`${balooTwo.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConfettiBackground />
        <NextIntlClientProvider>
          <SessionExpiredBanner />
          {/* Header toujours en haut (`pt-safe` : marge pour l'encoche/la
              caméra/la batterie, portée par le header lui-même puisque c'est
              désormais le premier élément affiché). Footer toujours en bas,
              avec sa propre marge de sécurité (`pb-safe`, voir Footer.tsx)
              pour la barre de gestes. */}
          <Header />
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
