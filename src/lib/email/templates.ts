// Emails transactionnels (brief 4.7 + section "Ton rôle" : "ton fun,
// mascotte"). HTML minimal avec CSS inline (nécessaire pour la compatibilité
// des clients mail, aucun CSS externe/`<style>` de bloc fiable partout) --
// mêmes couleurs de marque que l'app (violet, jaune, corail, menthe, fond
// crème).

const BRAND = {
  primary: "#7C3AED",
  cream: "#FFF7F5",
  ink: "#2E1065",
  coral: "#FB7185",
  mint: "#34D399",
  grey: "#EDEAE7",
};

// Retour Thomas : les images pointaient vers `NEXT_PUBLIC_APP_URL`
// (konfeti.belgacai.com en prod, localhost en dev) -- cassées dans un email
// reçu tant que le site n'est pas déployé, ou inaccessibles de l'extérieur en
// dev. Bucket Storage public dédié à la place (`email-assets`, voir
// `20260717000100_email_assets_bucket.sql`) : le projet Supabase, lui, est
// déjà en ligne en permanence, indépendamment du déploiement de l'app.
const EMAIL_ASSET_BASE = "https://tibinblvqxqcygzmxouv.supabase.co/storage/v1/object/public/email-assets";

function assetUrl(path: string): string {
  return `${EMAIL_ASSET_BASE}${path}`;
}

// Dispersion aléatoire de confettis sur le fond rosé (retour Thomas, en 3
// temps : "sur le fond rosé, pas la mascotte", puis "dispersés sur TOUTE la
// partie rose", puis "comme sur mon site, en arrière-plan aléatoire" -- pas
// des rangées alignées). `position:absolute` ignoré par Gmail (confirmé sur
// un vrai envoi -- les confettis se sont empilés en un tas), et une grille de
// rangées ne rend pas "aléatoire". Solution retenue : une vraie image de
// fond répétable (`confetti-bg-tile.png`, générée une fois via
// `sharp.composite` avec des formes à positions/rotations pseudo-aléatoires,
// même palette que `StickerConfetti` du site), posée en `background-image`
// sur la table extérieure -- dégrade proprement vers `background-color` seul
// sur les rares clients qui ignorent les fonds d'image (ex. Outlook desktop).
const CONFETTI_BG = `background-color:${BRAND.cream};background-image:url('${assetUrl("/confetti-bg-tile.png")}');background-repeat:repeat;`;

function wrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;${CONFETTI_BG}font-family:sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${CONFETTI_BG}padding:32px 16px;">
    <tr>
      <td align="center" style="${CONFETTI_BG}padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;">
          <tr>
            <td align="center" style="background-color:${BRAND.grey};padding:24px;border:3px solid ${BRAND.primary};border-radius:20px 20px 0 0;">
              <img src="${assetUrl("/mascot.webp")}" alt="Konfeti" width="80" height="80" style="display:block;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:${BRAND.ink};font-size:16px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 10px;">
                    <a href="https://www.instagram.com/konfeti_app" style="display:inline-flex;align-items:center;gap:6px;color:#6B7280;font-size:13px;font-weight:600;text-decoration:none;">
                      <img src="${assetUrl("/icon-instagram.png")}" alt="" width="18" height="18" style="display:inline-block;vertical-align:middle;margin-right:5px;" />Instagram
                    </a>
                  </td>
                  <td style="padding:0 10px;">
                    <a href="https://www.facebook.com/profile.php?id=61591900944905" style="display:inline-flex;align-items:center;gap:6px;color:#6B7280;font-size:13px;font-weight:600;text-decoration:none;">
                      <img src="${assetUrl("/icon-facebook.png")}" alt="" width="18" height="18" style="display:inline-block;vertical-align:middle;margin-right:5px;" />Facebook
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 28px 28px;color:#9CA3AF;font-size:12px;">
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
