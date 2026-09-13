import {Container, ContainerModule} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {useContainer} from 'class-validator';
import {TtsController} from './controllers/TtsController.js';
import {TtsService} from './services/TtsService.js';
import {TtsCacheRepository} from './repositories/TtsCacheRepository.js';
import {TTS_TYPES} from './types.js';
import {
  TTS_VALIDATORS,
  TtsRequestBody,
  TtsResponse,
} from './classes/validators/TtsValidators.js';
import {TtsErrorResponse} from './classes/validators/TtsResponseValidators.js';

/**
 * DI bindings for the TTS module.
 *
 * Following the per-module convention used by `notification`, `chatbot`, etc.
 * `loadModules.ts` will look up `${moduleName}ModuleControllers`,
 * `${moduleName}ModuleValidators`, and `${moduleName}ContainerModules`
 * automatically because `tts` is a directory under `src/modules`.
 */
export const ttsContainerModule = new ContainerModule(options => {
  options.bind(TtsController).toSelf().inSingletonScope();
  options.bind(TTS_TYPES.TtsService).to(TtsService).inSingletonScope();
  options.bind(TTS_TYPES.TtsCacheRepository).to(TtsCacheRepository).inSingletonScope();
});

export const ttsModuleControllers: Function[] = [TtsController];

export const ttsModuleValidators: Function[] = [
  ...TTS_VALIDATORS,
  TtsErrorResponse,
];

export const ttsContainerModules: ContainerModule[] = [ttsContainerModule];

export async function setupTtsContainer(): Promise<void> {
  const container = new Container();
  await container.load(...ttsContainerModules);
  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

// Re-export for external consumers
export * from './controllers/TtsController.js';
export * from './services/TtsService.js';
export * from './repositories/TtsCacheRepository.js';
export * from './types.js';
export {TtsRequestBody, TtsResponse, TtsErrorResponse};
