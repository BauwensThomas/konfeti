import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ConfettiBackground } from "@/components/ConfettiBackground";
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
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
