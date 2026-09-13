/**
 * TTS module dependency-injection symbols.
 *
 * Following the per-module convention used by `notification`, `chatbot`, etc.
 * See `backend/src/bootstrap/loadModules.ts` for how these are resolved.
 */
export const TTS_TYPES = {
  // Controllers
  TtsController: Symbol.for('TtsController'),

  // Services
  TtsService: Symbol.for('TtsService'),

  // Repositories
  TtsCacheRepository: Symbol.for('TtsCacheRepository'),
};
