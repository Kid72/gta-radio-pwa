/**
 * Resolves a local or remote asset path against Vite's import.meta.env.BASE_URL.
 * Preserves remote, blob, and data URIs untouched.
 */
export function resolveAssetUrl(path: string): string {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as Record<string, any>).env : undefined;
  const base = metaEnv && metaEnv.BASE_URL ? metaEnv.BASE_URL : './';

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const cleanBase = base.endsWith('/') ? base : `${base}/`;

  return `${cleanBase}${cleanPath}`;
}
