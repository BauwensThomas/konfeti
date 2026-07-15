import Stripe from "stripe";

// Client Stripe unique, réutilisé partout côté serveur (actions + webhook).
// Jamais importé côté client (`STRIPE_SECRET_KEY` n'existe que côté serveur).
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://konfeti.belgacai.com";
  return `${base}${path}`;
}
