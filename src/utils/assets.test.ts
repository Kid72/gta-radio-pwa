import { describe, it, expect } from 'vitest';
import { resolveAssetUrl } from './assets';

describe('resolveAssetUrl', () => {
  it('returns empty string for empty input', () => {
    expect(resolveAssetUrl('')).toBe('');
  });

  it('preserves external http and https urls', () => {
    expect(resolveAssetUrl('https://archive.org/audio.mp3')).toBe('https://archive.org/audio.mp3');
    expect(resolveAssetUrl('http://example.com/logo.png')).toBe('http://example.com/logo.png');
  });

  it('preserves blob and data urls', () => {
    expect(resolveAssetUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(resolveAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('resolves absolute path to base-relative url', () => {
    const resolved = resolveAssetUrl('/logos/gta5/radio-los-santos.png');
    expect(resolved.startsWith('//')).toBe(false);
    expect(resolved).toContain('logos/gta5/radio-los-santos.png');
  });

  it('resolves relative path without double slashes', () => {
    const resolved = resolveAssetUrl('logos/gtasa/k-dst.png');
    expect(resolved).not.toContain('//logos');
    expect(resolved).toContain('logos/gtasa/k-dst.png');
  });
});
