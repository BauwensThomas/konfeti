"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type PhotonFeature = {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    country?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

type Suggestion = { label: string; lat: number; lng: number };

// Recherche d'adresse/lieu (brief 4.6, retour Thomas : "on sait pas mettre
// une adresse google ? ... s'il cherche un restaurant il peut directement
// mettre le nom"). Décision confirmée avec Thomas (AskUserQuestion) : Photon
// (komoot, OpenStreetMap) plutôt que Google Places Autocomplete -- gratuit,
// sans clé, sans facturation, CORS ouvert (vérifié en direct), appel direct
// depuis le navigateur, pas de route API proxy nécessaire. Sélectionner une
// suggestion remplit le texte ET les coordonnées exactes -- c'est cette
// sélection qui alimente `location_lat`/`location_lng` (voir DECISIONS.md),
// jamais un géocodage serveur séparé. Un texte libre jamais sélectionné reste
// utilisable tel quel (comportement historique préservé), juste sans
// coordonnées -- la météo (brief 4.6) ne s'affichera simplement pas.
export function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (text: string, coords: { lat: number; lng: number } | null) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const listId = useId();
  // Valeur pour laquelle il ne faut PAS relancer de recherche -- capturée une
  // seule fois au montage (préremplissage initial en modification
  // d'événement) puis remise à jour uniquement dans `selectSuggestion`
  // (retour Thomas : "quand je clique sur modifier, l'adresse revient comme
  // si je devais revalider à chaque fois"). Volontairement PAS une mutation
  // faite depuis l'effet ci-dessous ("sauter une seule fois") : le Strict
  // Mode de React invoque chaque effet deux fois en dev, ce qui neutralisait
  // ce genre de garde-fou dès la deuxième invocation (la valeur passait déjà
  // à `false`/consommée à la première). Ici, les deux invocations comparent
  // `value` à la même référence, jamais modifiée par l'effet lui-même.
  const lastAcceptedValueRef = useRef(value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value === lastAcceptedValueRef.current) {
      return;
    }

    const requestId = ++requestIdRef.current;

    // Requête différée dans un `setTimeout` même pour le cas "texte trop
    // court" (pas seulement la recherche réelle) : appeler `setState`
    // directement et SYNCHRONE dans le corps de l'effet déclenche des
    // rendus en cascade (`react-hooks/set-state-in-effect`), même principe
    // déjà rencontré pour les notifications de chat (voir DECISIONS.md).
    if (value.trim().length < 3) {
      const timeout = setTimeout(() => {
        setSuggestions([]);
        setOpen(false);
      }, 0);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=5&lang=fr`,
        );
        if (!response.ok || requestIdRef.current !== requestId) return;

        const data: { features?: PhotonFeature[] } = await response.json();
        if (requestIdRef.current !== requestId) return;

        const seenLabels = new Set<string>();
        const results = (data.features ?? [])
          .map((feature): Suggestion | null => {
            const { name, housenumber, street, city, country } = feature.properties ?? {};
            const coordinates = feature.geometry?.coordinates;
            if (!coordinates) return null;

            // Un résultat au niveau MAISON (adresse précise, ex. "12
            // Rozenlaan, Dilbeek") n'a jamais de `name` chez Photon -- bug
            // réel trouvé en direct par Thomas ("si je mets un numéro ça ne
            // trouve pas") : ces résultats étaient silencieusement rejetés
            // faute de nom, alors que Photon les avait bien trouvés. Titre
            // reconstruit depuis `housenumber`/`street` dans ce cas.
            const title = name || (street ? `${street}${housenumber ? ` ${housenumber}` : ""}` : null);
            if (!title) return null;

            const [lng, lat] = coordinates;
            const place = city && city !== title ? city : country;
            return { label: place ? `${title}, ${place}` : title, lat, lng };
          })
          // Photon renvoie parfois plusieurs entités OSM distinctes (ville,
          // limite administrative...) pour le même lieu, avec le même
          // libellé formaté -- inutile et déroutant pour l'utilisateur de
          // proposer deux fois "Bruxelles, Belgique" dans la liste.
          .filter((s): s is Suggestion => {
            if (!s || seenLabels.has(s.label)) return false;
            seenLabels.add(s.label);
            return true;
          });

        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlighted(0);
      } catch {
        // Silencieux : l'autocomplétion reste un confort, jamais un blocage.
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [value]);

  function selectSuggestion(suggestion: Suggestion) {
    lastAcceptedValueRef.current = suggestion.label;
    onChange(suggestion.label, { lat: suggestion.lat, lng: suggestion.lng });
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectSuggestion(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value, null)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        className={className}
      />
      {open && (
        <ul
          id={listId}
          className="absolute z-10 mt-1 w-full rounded-konfeti border border-border bg-surface py-1 shadow-konfeti"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.lat}-${suggestion.lng}-${index}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                className={`w-full px-4 py-2 text-left text-sm text-foreground hover:bg-primary/10 ${
                  index === highlighted ? "bg-primary/10" : ""
                }`}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
