import { env } from '#root/utils/env.js';

export const faqPopConfig = {
  faqApiUrl: env('FAQ_API_URL') || '',
  popApiUrl: env('POP_API_URL') || '',
  // Shared-secret gate POP is adding on its side (2026-11) — every request to POP will need
  // this as an X-Service-Key header once POP turns its check on. Server-side only: never sent
  // to the browser, never read from a VITE_ var. Empty until the user sets it.
  popServiceKey: env('POP_SERVICE_KEY') || '',
};
