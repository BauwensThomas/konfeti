import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let callsSinceSweep = 0;

// Purge périodique des compteurs expirés pour ne pas faire grossir la Map
// indéfiniment (une entrée par IP distincte vue). Pas besoin d'un
// setInterval : un balayage tous les 500 appels suffit largement.
function sweepExpired(now: number) {
  callsSinceSweep += 1;
  if (callsSinceSweep < 500) return;
  callsSinceSweep = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

/**
 * Limiteur de débit en mémoire (brief 5.5, sécurité transverse). Suffisant
 * pour un déploiement mono-instance ; sur du serverless multi-instance à
 * grande échelle, chaque instance a sa propre mémoire donc la limite réelle
 * peut être dépassée d'un facteur "nombre d'instances actives" — à
 * remplacer par Upstash/Vercel KV si le trafic le justifie un jour (voir
 * DECISIONS.md). Nettement mieux que rien pour la phase actuelle (avant
 * lancement, aucun vrai trafic).
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  // Coupe-circuit pour le développement/les tests e2e (retour Thomas : les
  // runs e2e répétés dans la même session/heure finissent par se bloquer
  // mutuellement, "ce n'est pas possible de mettre dans le .env ON/OFF ?").
  // Jamais actif par défaut (absent de `.env.example`, donc désactivé tant
  // qu'on ne l'ajoute pas explicitement en local) : aucun risque d'oublier ça
  // activé en production par erreur.
  if (process.env.RATE_LIMIT_DISABLED === "true") return false;

  const now = Date.now();
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (bucket.count >= limit) return true;
  bucket.count += 1;
  return false;
}

/** IP de l'appelant (Vercel renseigne x-forwarded-for), pour clé de limite. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}
