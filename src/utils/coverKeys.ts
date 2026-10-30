/**
 * Canonical key builder for the pre-built album cover index.
 *
 * The same algorithm is mirrored in scripts/build-cover-index.mjs
 * (normalizeCoverPart). Any change here MUST be mirrored there and the
 * index regenerated, otherwise every lookup silently misses.
 */
export function normalizeCoverPart(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2018\u2019`\u00b4]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function coverKey(artist: string, song: string): string {
  return `${normalizeCoverPart(artist)}|${normalizeCoverPart(song)}`;
}
