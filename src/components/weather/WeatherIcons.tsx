type WeatherIconProps = { className?: string };

// Icônes météo (Phase 6, brief 4.6) : même convention que src/components/stickers/
// (viewBox 64x64, formes géométriques simples, palette de marque en hex direct,
// role="img" + aria-label) -- jamais un emoji comme icône.

function Cloud({ fill = "#E5E7EB" }: { fill?: string }) {
  return (
    <path
      d="M18 42 Q10 42 10 34 Q10 27 17 26 Q18 17 28 17 Q37 17 39 25 Q48 25 48 34 Q48 42 40 42 Z"
      fill={fill}
    />
  );
}

export function WeatherSunny({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Ensoleillé">
      <circle cx="32" cy="32" r="14" fill="#FACC15" />
      <g stroke="#FACC15" strokeWidth="4" strokeLinecap="round">
        <path d="M32 6 V12" />
        <path d="M32 52 V58" />
        <path d="M6 32 H12" />
        <path d="M52 32 H58" />
        <path d="M14 14 L18 18" />
        <path d="M46 46 L50 50" />
        <path d="M50 14 L46 18" />
        <path d="M18 46 L14 50" />
      </g>
    </svg>
  );
}

export function WeatherPartlyCloudy({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Peu nuageux">
      <circle cx="24" cy="22" r="11" fill="#FACC15" />
      <Cloud fill="#F9FAFB" />
    </svg>
  );
}

export function WeatherCloudy({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Nuageux">
      <Cloud fill="#D1D5DB" />
    </svg>
  );
}

export function WeatherFoggy({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Brouillard">
      <Cloud fill="#E5E7EB" />
      <g stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round">
        <path d="M12 48 H52" />
        <path d="M16 54 H48" />
      </g>
    </svg>
  );
}

export function WeatherDrizzle({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Bruine">
      <Cloud fill="#D1D5DB" />
      <g stroke="#38BDF8" strokeWidth="3" strokeLinecap="round">
        <path d="M22 48 V52" />
        <path d="M32 48 V52" />
        <path d="M42 48 V52" />
      </g>
    </svg>
  );
}

export function WeatherRainy({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Pluie">
      <Cloud fill="#9CA3AF" />
      <g stroke="#38BDF8" strokeWidth="4" strokeLinecap="round">
        <path d="M20 46 L16 58" />
        <path d="M32 46 L28 58" />
        <path d="M44 46 L40 58" />
      </g>
    </svg>
  );
}

export function WeatherSnowy({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Neige">
      <Cloud fill="#D1D5DB" />
      <g fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1.5">
        <circle cx="21" cy="50" r="3.5" />
        <circle cx="32" cy="54" r="3.5" />
        <circle cx="43" cy="50" r="3.5" />
      </g>
    </svg>
  );
}

export function WeatherStormy({ className }: WeatherIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Orage">
      <Cloud fill="#6B7280" />
      <path d="M34 44 L26 54 H32 L28 62 L40 50 H34 Z" fill="#FACC15" />
    </svg>
  );
}
