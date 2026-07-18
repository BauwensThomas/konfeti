// Emails transactionnels (brief 4.7 + section "Ton rôle" : "ton fun,
// mascotte"). HTML minimal avec CSS inline (nécessaire pour la compatibilité
// des clients mail, aucun CSS externe/`<style>` de bloc fiable partout) --
// mêmes couleurs de marque que l'app (violet, jaune, corail, menthe, fond
// crème).
//
// Langue de l'email (retour Thomas, option 1 retenue) : `events.locale`
// (colonne déjà en base depuis la Phase 1, jamais exploitée jusqu'ici) fixe
// la langue des 3 emails liés à CET événement -- pas une langue par
// destinataire individuel (plus simple, suppose que les invités d'un même
// événement parlent en général la même langue que l'organisateur qui l'a
// créé). Un seul email dans une seule langue, jamais plusieurs langues
// empilées dans le même message.

export type EmailLocale = "fr" | "nl" | "en" | "es" | "pt" | "de";

function resolveEmailLocale(locale: string | null | undefined): EmailLocale {
  return (["fr", "nl", "en", "es", "pt", "de"] as const).includes(locale as EmailLocale)
    ? (locale as EmailLocale)
    : "fr";
}

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

function wrapper(bodyHtml: string, locale: EmailLocale): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
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

type UndecidedStrings = {
  greeting: (name: string | null) => string;
  subject: (eventTitle: string) => string;
  line1: (eventTitle: string) => string;
  line2: string;
  cta: string;
  footnote: string;
};

type TomorrowStrings = {
  greeting: (name: string | null) => string;
  subject: (eventTitle: string) => string;
  line1: (eventTitle: string) => string;
  location: (locationText: string) => string;
  cta: string;
};

type PostEventStrings = {
  greeting: (name: string | null) => string;
  subject: (eventTitle: string) => string;
  line1: (eventTitle: string) => string;
  line2: string;
  cta: string;
};

const UNDECIDED: Record<EmailLocale, UndecidedStrings> = {
  fr: {
    greeting: (name) => (name ? `Salut ${name} !` : "Salut !"),
    subject: (t) => `On compte sur toi pour "${t}" ?`,
    line1: (t) => `La fête <strong>${t}</strong> approche, et on n'a pas encore ta réponse définitive !`,
    line2: "Prends deux secondes pour dire si tu viens, ça aide vraiment à s'organiser (et à savoir combien de gâteau prévoir 🎂).",
    cta: "Je réponds maintenant",
    footnote: "Tu reçois ce message parce que tu as accepté les rappels pour cet événement.",
  },
  nl: {
    greeting: (name) => (name ? `Hoi ${name}!` : "Hoi!"),
    subject: (t) => `Rekenen we op jou voor "${t}"?`,
    line1: (t) => `Het feest <strong>${t}</strong> komt eraan, en we hebben je definitieve antwoord nog niet!`,
    line2: "Neem twee seconden om te laten weten of je komt, dat helpt echt bij de organisatie (en om te weten hoeveel taart nodig is 🎂).",
    cta: "Ik antwoord nu",
    footnote: "Je ontvangt dit bericht omdat je herinneringen voor dit evenement hebt geaccepteerd.",
  },
  en: {
    greeting: (name) => (name ? `Hi ${name}!` : "Hi!"),
    subject: (t) => `Can we count on you for "${t}"?`,
    line1: (t) => `<strong>${t}</strong> is coming up, and we still don't have your final answer!`,
    line2: "Take two seconds to let us know if you're coming, it really helps with the planning (and knowing how much cake to get 🎂).",
    cta: "I'll reply now",
    footnote: "You're receiving this message because you accepted reminders for this event.",
  },
  es: {
    greeting: (name) => (name ? `¡Hola ${name}!` : "¡Hola!"),
    subject: (t) => `¿Contamos contigo para "${t}"?`,
    line1: (t) => `¡La fiesta <strong>${t}</strong> se acerca, y todavía no tenemos tu respuesta definitiva!`,
    line2: "Tómate dos segundos para decir si vienes, ayuda de verdad a organizarse (y a saber cuánta tarta preparar 🎂).",
    cta: "Respondo ahora",
    footnote: "Recibes este mensaje porque aceptaste los recordatorios para este evento.",
  },
  pt: {
    greeting: (name) => (name ? `Olá ${name}!` : "Olá!"),
    subject: (t) => `Contamos contigo para "${t}"?`,
    line1: (t) => `A festa <strong>${t}</strong> está a aproximar-se, e ainda não temos a tua resposta definitiva!`,
    line2: "Demora só dois segundos a dizer se vens, ajuda mesmo a organizar (e a saber quanto bolo preparar 🎂).",
    cta: "Responder agora",
    footnote: "Recebes esta mensagem porque aceitaste os lembretes para este evento.",
  },
  de: {
    greeting: (name) => (name ? `Hallo ${name}!` : "Hallo!"),
    subject: (t) => `Können wir für "${t}" auf dich zählen?`,
    line1: (t) => `Die Feier <strong>${t}</strong> steht bevor, und wir haben deine endgültige Antwort noch nicht!`,
    line2: "Nimm dir zwei Sekunden, um zu sagen, ob du kommst -- das hilft wirklich bei der Planung (und zu wissen, wie viel Kuchen wir brauchen 🎂).",
    cta: "Ich antworte jetzt",
    footnote: "Du erhältst diese Nachricht, weil du Erinnerungen für dieses Event akzeptiert hast.",
  },
};

const TOMORROW: Record<EmailLocale, TomorrowStrings> = {
  fr: {
    greeting: (name) => (name ? `${name}, c'est demain !` : "C'est demain !"),
    subject: (t) => `Demain : ${t} !`,
    line1: (t) => `<strong>${t}</strong>, c'est pour demain. On a hâte de te voir !`,
    location: (loc) => `📍 Rendez-vous : <strong>${loc}</strong>`,
    cta: "Voir tous les détails",
  },
  nl: {
    greeting: (name) => (name ? `${name}, het is morgen!` : "Het is morgen!"),
    subject: (t) => `Morgen: ${t}!`,
    line1: (t) => `<strong>${t}</strong> is morgen. We kijken ernaar uit je te zien!`,
    location: (loc) => `📍 Afspraak: <strong>${loc}</strong>`,
    cta: "Alle details bekijken",
  },
  en: {
    greeting: (name) => (name ? `${name}, it's tomorrow!` : "It's tomorrow!"),
    subject: (t) => `Tomorrow: ${t}!`,
    line1: (t) => `<strong>${t}</strong> is tomorrow. We can't wait to see you!`,
    location: (loc) => `📍 Meeting point: <strong>${loc}</strong>`,
    cta: "See all the details",
  },
  es: {
    greeting: (name) => (name ? `${name}, ¡es mañana!` : "¡Es mañana!"),
    subject: (t) => `Mañana: ¡${t}!`,
    line1: (t) => `<strong>${t}</strong> es mañana. ¡Tenemos ganas de verte!`,
    location: (loc) => `📍 Punto de encuentro: <strong>${loc}</strong>`,
    cta: "Ver todos los detalles",
  },
  pt: {
    greeting: (name) => (name ? `${name}, é amanhã!` : "É amanhã!"),
    subject: (t) => `Amanhã: ${t}!`,
    line1: (t) => `<strong>${t}</strong> é amanhã. Estamos ansiosos por te ver!`,
    location: (loc) => `📍 Ponto de encontro: <strong>${loc}</strong>`,
    cta: "Ver todos os detalhes",
  },
  de: {
    greeting: (name) => (name ? `${name}, es ist morgen!` : "Es ist morgen!"),
    subject: (t) => `Morgen: ${t}!`,
    line1: (t) => `<strong>${t}</strong> ist morgen. Wir freuen uns, dich zu sehen!`,
    location: (loc) => `📍 Treffpunkt: <strong>${loc}</strong>`,
    cta: "Alle Details ansehen",
  },
};

const POST_EVENT: Record<EmailLocale, PostEventStrings> = {
  fr: {
    greeting: (name) => (name ? `Merci d'être venu(e), ${name} !` : "Merci d'être venu(e) !"),
    subject: (t) => `Merci pour "${t}" !`,
    line1: (t) => `On espère que <strong>${t}</strong> était une réussite !`,
    line2: "Passe sur le chat de l'événement pour partager tes photos et tes souvenirs avec les autres.",
    cta: "Retrouver le chat",
  },
  nl: {
    greeting: (name) => (name ? `Bedankt voor je komst, ${name}!` : "Bedankt voor je komst!"),
    subject: (t) => `Bedankt voor "${t}"!`,
    line1: (t) => `We hopen dat <strong>${t}</strong> een succes was!`,
    line2: "Ga naar de chat van het evenement om je foto's en herinneringen met de anderen te delen.",
    cta: "Naar de chat",
  },
  en: {
    greeting: (name) => (name ? `Thanks for coming, ${name}!` : "Thanks for coming!"),
    subject: (t) => `Thanks for "${t}"!`,
    line1: (t) => `We hope <strong>${t}</strong> was a success!`,
    line2: "Head to the event's chat to share your photos and memories with everyone else.",
    cta: "Go to the chat",
  },
  es: {
    greeting: (name) => (name ? `¡Gracias por venir, ${name}!` : "¡Gracias por venir!"),
    subject: (t) => `¡Gracias por "${t}"!`,
    line1: (t) => `¡Esperamos que <strong>${t}</strong> fuera un éxito!`,
    line2: "Pasa por el chat del evento para compartir tus fotos y recuerdos con los demás.",
    cta: "Ir al chat",
  },
  pt: {
    greeting: (name) => (name ? `Obrigado por teres vindo, ${name}!` : "Obrigado por teres vindo!"),
    subject: (t) => `Obrigado por "${t}"!`,
    line1: (t) => `Esperamos que <strong>${t}</strong> tenha sido um sucesso!`,
    line2: "Passa pelo chat do evento para partilhares as tuas fotografias e memórias com os outros.",
    cta: "Ir para o chat",
  },
  de: {
    greeting: (name) => (name ? `Danke fürs Kommen, ${name}!` : "Danke fürs Kommen!"),
    subject: (t) => `Danke für "${t}"!`,
    line1: (t) => `Wir hoffen, <strong>${t}</strong> war ein Erfolg!`,
    line2: "Schau im Chat des Events vorbei, um deine Fotos und Erinnerungen mit den anderen zu teilen.",
    cta: "Zum Chat",
  },
};

/**
 * Relance des indécis (J-7 et J-2, même contenu pour les deux -- seule la
 * cadence d'envoi diffère, gérée par le cron). Ciblée sur les "peut-être"/
 * sans réponse encore engagée, jamais sur les "je viens" déjà confirmés
 * (rappel J-1 séparé, `tomorrowReminderEmail` ci-dessous) ni les "je ne
 * peux pas" (accès restreint, la relance ne les concerne plus).
 */
export function undecidedReminderEmail({
  firstName,
  eventTitle,
  eventUrl,
  locale,
}: {
  firstName: string | null;
  eventTitle: string;
  eventUrl: string;
  locale?: string | null;
}): { subject: string; html: string } {
  const loc = resolveEmailLocale(locale);
  const s = UNDECIDED[loc];
  return {
    subject: s.subject(eventTitle),
    html: wrapper(
      `
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${s.greeting(firstName)}</p>
      <p style="margin:0 0 12px;">${s.line1(eventTitle)}</p>
      <p style="margin:0 0 12px;">${s.line2}</p>
      ${button(s.cta, eventUrl)}
      <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">${s.footnote}</p>
    `,
      loc,
    ),
  };
}

/** Rappel J-1 pour les "oui" confirmés, avec l'adresse (brief 4.7). */
export function tomorrowReminderEmail({
  firstName,
  eventTitle,
  eventUrl,
  locationText,
  locale,
}: {
  firstName: string | null;
  eventTitle: string;
  eventUrl: string;
  locationText: string | null;
  locale?: string | null;
}): { subject: string; html: string } {
  const loc = resolveEmailLocale(locale);
  const s = TOMORROW[loc];
  return {
    subject: s.subject(eventTitle),
    html: wrapper(
      `
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${s.greeting(firstName)} 🎉</p>
      <p style="margin:0 0 12px;">${s.line1(eventTitle)}</p>
      ${locationText ? `<p style="margin:0 0 12px;">${s.location(locationText)}</p>` : ""}
      ${button(s.cta, eventUrl)}
    `,
      loc,
    ),
  };
}

/** Message post-événement à J+1 (brief 4.7). Pas de "mur photos" (V1.1, pas encore construit) : renvoie simplement vers le chat. */
export function postEventEmail({
  firstName,
  eventTitle,
  eventUrl,
  locale,
}: {
  firstName: string | null;
  eventTitle: string;
  eventUrl: string;
  locale?: string | null;
}): { subject: string; html: string } {
  const loc = resolveEmailLocale(locale);
  const s = POST_EVENT[loc];
  return {
    subject: s.subject(eventTitle),
    html: wrapper(
      `
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${s.greeting(firstName)} 🎊</p>
      <p style="margin:0 0 12px;">${s.line1(eventTitle)}</p>
      <p style="margin:0 0 12px;">${s.line2}</p>
      ${button(s.cta, eventUrl)}
    `,
      loc,
    ),
  };
}
