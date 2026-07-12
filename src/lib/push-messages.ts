// Textes des notifications push, mêmes conventions que src/lib/email/templates.ts
// (texte français en dur, pas de next-intl côté serveur pour ce genre de
// contenu généré). `url` toujours relative à NEXT_PUBLIC_APP_URL, résolue
// dans le service worker (voir public/sw.js, notificationclick).

function eventUrl(shortCode: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://konfeti.belgacai.com";
  return `${base}/e/${shortCode}`;
}

type PushPayload = { title: string; body: string; url: string; tag?: string };

export const pushMessages = {
  newRsvpRequest(shortCode: string, eventTitle: string, guestName: string): PushPayload {
    return {
      title: "Nouvelle demande",
      body: `${guestName} veut participer à "${eventTitle}"`,
      url: eventUrl(shortCode),
    };
  },
  rsvpApproved(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "Tu es sur la liste !",
      body: `Ta demande pour "${eventTitle}" a été approuvée.`,
      url: eventUrl(shortCode),
    };
  },
  guestCantCome(shortCode: string, eventTitle: string, guestName: string): PushPayload {
    return {
      title: "Un invité ne peut plus venir",
      body: `${guestName} ne peut plus venir à "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  guestLeft(shortCode: string, eventTitle: string, guestName: string): PushPayload {
    return {
      title: "Un invité a quitté l'événement",
      body: `${guestName} a quitté "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  hostTransferred(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "Tu es maintenant l'organisateur !",
      body: `On t'a confié les clés de "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  newChatMessage(shortCode: string, eventTitle: string, authorName: string, channel: "main" | "backstage"): PushPayload {
    return {
      title: channel === "backstage" ? `Coulisses · ${eventTitle}` : eventTitle,
      body: `${authorName} : nouveau message`,
      url: eventUrl(shortCode),
      tag: `chat-${shortCode}-${channel}`,
    };
  },
  newBringItemProposed(shortCode: string, eventTitle: string, itemName: string): PushPayload {
    return {
      title: "Nouveau produit proposé",
      body: `Un invité propose "${itemName}" pour "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  bringItemClaimed(shortCode: string, eventTitle: string, guestName: string, itemName: string): PushPayload {
    return {
      title: "Produit réclamé",
      body: `${guestName} apporte "${itemName}" pour "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  newPollProposed(shortCode: string, eventTitle: string, question: string): PushPayload {
    return {
      title: "Nouveau sondage proposé",
      body: `Un invité propose "${question}" pour "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  companionAdded(shortCode: string, eventTitle: string, guestName: string): PushPayload {
    return {
      title: "Accompagnant ajouté",
      body: `${guestName} a ajouté un accompagnant à "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  pollQuotaExceeded(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "Sondage à ajuster",
      body: `Après le retrait d'un accompagnant, tes choix pour "${eventTitle}" dépassent le quota.`,
      url: eventUrl(shortCode),
    };
  },
  guestCheckedIn(shortCode: string, eventTitle: string, guestName: string): PushPayload {
    return {
      title: "Arrivée",
      body: `${guestName} est arrivé·e à "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  reminderUndecided(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "Tu viens ?",
      body: `On attend toujours ta réponse pour "${eventTitle}".`,
      url: eventUrl(shortCode),
    };
  },
  reminderTomorrow(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "C'est demain !",
      body: `"${eventTitle}" a lieu demain.`,
      url: eventUrl(shortCode),
    };
  },
  reminderJourJ(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "C'est le Jour J !",
      body: `"${eventTitle}" a lieu aujourd'hui.`,
      url: eventUrl(shortCode),
    };
  },
  reminderPostEvent(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "C'était bien ?",
      body: `Un petit mot sur "${eventTitle}" ?`,
      url: eventUrl(shortCode),
    };
  },
  eventCancelled(shortCode: string, eventTitle: string): PushPayload {
    return {
      title: "Événement annulé",
      body: `"${eventTitle}" a été annulé par l'organisateur.`,
      url: eventUrl(shortCode),
    };
  },
};
