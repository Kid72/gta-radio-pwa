import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

// JSDOM's synthetic Blob is not properly cloned by Node's native structuredClone (used by fake-indexeddb).
// Use Node's standard WHATWG Blob so Blobs can be stored and retrieved from IndexedDB in tests.
globalThis.Blob = NodeBlob as any;
if (typeof window !== 'undefined') {
  window.Blob = NodeBlob as any;
}

// Ensure URL.createObjectURL and URL.revokeObjectURL exist in JSDOM
if (typeof window !== 'undefined') {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (() => 'blob:mock-object-url') as any;
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = (() => {}) as any;
  }
}
if (!URL.createObjectURL) {
  (URL as any).createObjectURL = () => 'blob:mock-object-url';
}
if (!URL.revokeObjectURL) {
  (URL as any).revokeObjectURL = () => {};
}

// Ensure navigator.storage exists in JSDOM environment for storage quota and persistence APIs.
if (typeof navigator !== 'undefined' && !navigator.storage) {
  (navigator as any).storage = {
    estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
    persist: () => Promise.resolve(true),
    persisted: () => Promise.resolve(false),
  };
}

// Ensure matchMedia exists in JSDOM
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
}

// Ensure localStorage exists and works in Node 22 / JSDOM
if (typeof window !== 'undefined') {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  };
  Object.defineProperty(localStorageMock, 'length', {
    get: () => store.size,
  });

  try {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  } catch {}
}
