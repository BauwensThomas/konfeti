import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
