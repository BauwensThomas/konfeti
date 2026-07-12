// Emails transactionnels (brief 4.7 + section "Ton rôle" : "ton fun,
// mascotte"). HTML minimal avec CSS inline (nécessaire pour la compatibilité
// des clients mail, aucun CSS externe/`<style>` de bloc fiable partout) --
// mêmes couleurs de marque que l'app (violet, jaune, corail, menthe, fond
// crème), mascotte en absolu (`NEXT_PUBLIC_APP_URL`, un email n'a pas accès
// aux assets locaux du site).

const BRAND = {
  primary: "#7C3AED",
  cream: "#FFF7F5",
  ink: "#2E1065",
  coral: "#FB7185",
  mint: "#34D399",
};

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://konfeti.belgacai.com";
  return `${base}${path}`;
}

function wrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background-color:${BRAND.cream};font-family:sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.cream};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;">
          <tr>
            <td align="center" style="background-color:${BRAND.primary};padding:24px;">
              <img src="${appUrl("/mascot.webp")}" alt="Konfeti" width="80" height="80" style="display:block;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:${BRAND.ink};font-size:16px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 28px 28px;color:#9CA3AF;font-size:12px;">
              Konfeti, un projet BelgaCai &middot; <a href="mailto:konfeti@belgacai.com" style="color:#9CA3AF;">konfeti@belgacai.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" style="border-radius:999px;background-color:${BRAND.primary};"><a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">${label}</a></td></tr></table>`;
}

/**
 * Relance des indécis (J-7 et J-2, même contenu pour les deux -- seule la
 * cadence d'envoi diffère, gérée par le cron). Ciblée sur les "peut-être"/
 * sans réponse encore engagée, jamais sur les "je viens" déjà confirmés
 * (rappel J-1 séparé, `undecidedReminderEmail` ci-dessous) ni les "je ne
 * peux pas" (accès restreint, la relance ne les concerne plus).
 */
export function undecidedReminderEmail({
  firstName,
  eventTitle,
  eventUrl,
}: {
  firstName: string | null;
  eventTitle: string;
  eventUrl: string;
}): { subject: string; html: string } {
  const greeting = firstName ? `Salut ${firstName} !` : "Salut !";
  return {
    subject: `On compte sur toi pour "${eventTitle}" ?`,
    html: wrapper(`
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${greeting}</p>
      <p style="margin:0 0 12px;">La fête <strong>${eventTitle}</strong> approche, et on n'a pas encore ta réponse définitive !</p>
      <p style="margin:0 0 12px;">Prends deux secondes pour dire si tu viens, ça aide vraiment à s'organiser (et à savoir combien de gâteau prévoir 🎂).</p>
      ${button("Je réponds maintenant", eventUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Tu reçois ce message parce que tu as accepté les rappels pour cet événement.</p>
    `),
  };
}

/** Rappel J-1 pour les "oui" confirmés, avec l'adresse (brief 4.7). */
export function tomorrowReminderEmail({
  firstName,
  eventTitle,
  eventUrl,
  locationText,
}: {
  firstName: string | null;
  eventTitle: string;
  eventUrl: string;
  locationText: string | null;
}): { subject: string; html: string } {
  const greeting = firstName ? `${firstName}, c'est demain !` : "C'est demain !";
  return {
    subject: `Demain : ${eventTitle} !`,
    html: wrapper(`
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${greeting} 🎉</p>
      <p style="margin:0 0 12px;"><strong>${eventTitle}</strong>, c'est pour demain. On a hâte de te voir !</p>
      ${locationText ? `<p style="margin:0 0 12px;">📍 Rendez-vous : <strong>${locationText}</strong></p>` : ""}
      ${button("Voir tous les détails", eventUrl)}
    `),
  };
}

/** Message post-événement à J+1 (brief 4.7). Pas de "mur photos" (V1.1, pas encore construit) : renvoie simplement vers le chat. */
export function postEventEmail({
  firstName,
  eventTitle,
  eventUrl,
}: {
  firstName: string | null;
  eventTitle: string;
  eventUrl: string;
}): { subject: string; html: string } {
  const greeting = firstName ? `Merci d'être venu(e), ${firstName} !` : "Merci d'être venu(e) !";
  return {
    subject: `Merci pour "${eventTitle}" !`,
    html: wrapper(`
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${greeting} 🎊</p>
      <p style="margin:0 0 12px;">On espère que <strong>${eventTitle}</strong> était une réussite !</p>
      <p style="margin:0 0 12px;">Passe sur le chat de l'événement pour partager tes photos et tes souvenirs avec les autres.</p>
      ${button("Retrouver le chat", eventUrl)}
    `),
  };
}
