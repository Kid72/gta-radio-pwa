import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

// JSDOM's synthetic Blob is not properly cloned by Node's native structuredClone (used by fake-indexeddb).
// Use Node's standard WHATWG Blob so Blobs can be stored and retrieved from IndexedDB in tests.
globalThis.Blob = NodeBlob as any;
if (typeof window !== 'undefined') {
  window.Blob = NodeBlob as any;
}

// Ensure navigator.storage exists in JSDOM environment for storage quota and persistence APIs.
if (typeof navigator !== 'undefined' && !navigator.storage) {
  (navigator as any).storage = {
    estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
    persist: () => Promise.resolve(true),
    persisted: () => Promise.resolve(false),
  };
}
