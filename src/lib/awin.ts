// Lien affilié TheFork via Awin (brief 4.6, V1.1). `AWIN_MERCHANT_ID`/
// `AWIN_AFFILIATE_ID` : IDs réels fournis par Thomas une fois son compte
// Awin créé et accepté dans le programme TheFork (voir DECISIONS.md pour la
// procédure). Sans ces variables (dev/preview tant que l'acceptation n'est
// pas confirmée), retourne le lien TheFork direct SANS tracking -- jamais
// bloquant, jamais d'erreur visible : le lien reste utile pour l'invité même
// avant que l'affiliation ne soit active.
export function buildTheForkAffiliateUrl(restaurantName: string, city: string | null): string {
  const theForkSearchUrl = `https://www.thefork.fr/search/?query=${encodeURIComponent(restaurantName)}${
    city ? `&cityName=${encodeURIComponent(city)}` : ""
  }`;

  const merchantId = process.env.AWIN_MERCHANT_ID;
  const affiliateId = process.env.AWIN_AFFILIATE_ID;
  if (!merchantId || !affiliateId) {
    return theForkSearchUrl;
  }

  return `https://www.awin1.com/cread.php?awinmid=${merchantId}&awinaffid=${affiliateId}&clickref=&p=${encodeURIComponent(theForkSearchUrl)}`;
}
