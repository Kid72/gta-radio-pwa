/**
 * Procedural Cover Art Generator for GTA Radio PWA.
 * Generates an SVG Data URI mimicking an authentic vinyl record / album sleeve
 * with circular vinyl grooves, center spindle label, and stylized typography.
 * Completely offline, 0 bytes network overhead.
 */

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface VinylCoverOptions {
  song?: string;
  artist?: string;
  stationName?: string;
  accentColor?: string;
}

export function generateVinylCoverSvg({
  song = 'Now Playing',
  artist = 'Grand Theft Auto Radio',
  stationName = 'GTA Radio',
  accentColor = '#f59e0b',
}: VinylCoverOptions = {}): string {
  const safeSong = escapeXml(song.length > 28 ? `${song.slice(0, 27)}…` : song);
  const safeArtist = escapeXml(artist.length > 32 ? `${artist.slice(0, 31)}…` : artist);
  const safeStation = escapeXml(stationName.length > 24 ? `${stationName.slice(0, 23)}…` : stationName);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <defs>
    <linearGradient id="sleeve" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="50%" stop-color="#0f0f12" />
      <stop offset="100%" stop-color="#050507" />
    </linearGradient>
    <radialGradient id="vinyl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#27272a" />
      <stop offset="70%" stop-color="#121215" />
      <stop offset="100%" stop-color="#09090b" />
    </radialGradient>
    <radialGradient id="labelGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.85" />
      <stop offset="85%" stop-color="#18181b" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#09090b" />
    </radialGradient>
  </defs>

  <!-- Outer Album Sleeve -->
  <rect width="500" height="500" fill="url(#sleeve)" rx="24" />
  <rect width="496" height="496" x="2" y="2" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" rx="22" />

  <!-- Vinyl Disc Rim -->
  <circle cx="250" cy="250" r="225" fill="url(#vinyl)" stroke="#3f3f46" stroke-width="1.5" />

  <!-- Concentric Sound Grooves -->
  <circle cx="250" cy="250" r="210" fill="none" stroke="#27272a" stroke-width="1.2" opacity="0.6" />
  <circle cx="250" cy="250" r="195" fill="none" stroke="#3f3f46" stroke-width="0.8" opacity="0.4" />
  <circle cx="250" cy="250" r="180" fill="none" stroke="#27272a" stroke-width="1" opacity="0.5" />
  <circle cx="250" cy="250" r="165" fill="none" stroke="#3f3f46" stroke-width="0.8" opacity="0.4" />
  <circle cx="250" cy="250" r="150" fill="none" stroke="#27272a" stroke-width="1" opacity="0.5" />
  <circle cx="250" cy="250" r="135" fill="none" stroke="#3f3f46" stroke-width="0.8" opacity="0.3" />

  <!-- Vinyl Center Record Label -->
  <circle cx="250" cy="250" r="96" fill="url(#labelGrad)" stroke="${accentColor}" stroke-width="2.5" />

  <!-- Center Spindle Hole -->
  <circle cx="250" cy="250" r="14" fill="#000000" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />

  <!-- Typography -->
  <text x="250" y="195" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="#ffffff" letter-spacing="2">${safeStation}</text>
  <text x="250" y="222" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${safeSong}</text>
  <text x="250" y="286" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.85)">${safeArtist}</text>
  <text x="250" y="316" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="700" fill="${accentColor}" letter-spacing="3">STEREO • 33⅓ RPM</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
