import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWsUrl = supabaseUrl.replace(/^https:/, "wss:");

// Sans nonce (brief 5.5) : les nonces forceraient un rendu dynamique sur
// TOUTES les pages (plus de génération statique pour la landing), pour un
// projet qui utilise déjà massivement des styles inline (dégradés de thème,
// voir CreateEventWizard/EventAccueil) — 'unsafe-inline' est de toute façon
// nécessaire dans ce cas, aussi bien documenté par Next.js lui-même comme
// l'approche "Without Nonces" pour ce genre de situation.
//
// `upgrade-insecure-requests` uniquement en production : cette directive
// force le navigateur à réécrire TOUTES les requêtes suivantes (y compris
// les fetch RSC de Next.js pour la navigation client) en https://, ce qui
// casse tout en local puisque le serveur dev ne tourne qu'en http://
// ("Failed to fetch RSC payload", piège rencontré et corrigé).
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: ${supabaseUrl};
  font-src 'self';
  connect-src 'self' ${supabaseUrl} ${supabaseWsUrl} https://*.sentry.io https://*.ingest.sentry.io https://photon.komoot.io;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isDev ? "" : "upgrade-insecure-requests;"}
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Uniquement en production : sans objet en http://localhost, et
          // même risque que upgrade-insecure-requests ci-dessus si jamais
          // un navigateur en tenait compte sur le serveur dev.
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
  // `sharp` est censé être externalisé par défaut par Next.js (liste native
  // de packages), mais Turbopack en mode dev semble ne pas le respecter de
  // façon fiable : plusieurs routes qui importent `sharp` (uploads, image
  // Open Graph) finissent chacune avec leur propre exemplaire empaqueté du
  // module natif, ce qui corrompt libvips au sein du même process
  // (`TypeError: sharp.libvipsVersion is not a function`, plantage du
  // serveur — voir DECISIONS.md). Forcé explicitement ici pour garantir un
  // seul vrai `require("sharp")` partagé par tout le process serveur.
  serverExternalPackages: ["sharp"],
  experimental: {
    // La limite par défaut (1 Mo) est trop basse pour une vraie photo envoyée
    // depuis un téléphone ; le Server Action uploadEventPhoto la redimensionne
    // et la compresse (WebP) une fois reçue, mais elle doit d'abord arriver
    // entière. MAX_UPLOAD_BYTES (src/app/[locale]/actions/upload.ts) reste la
    // limite fonctionnelle réelle (8 Mo), un peu de marge est laissée ici
    // pour l'overhead multipart/form-data.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
