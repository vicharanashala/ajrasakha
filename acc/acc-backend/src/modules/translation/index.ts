import { useContainer } from 'class-validator';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { TranslationController } from './controllers/TranslationController.js';
import { TranslationService } from './services/TranslationService.js';
import { Container, ContainerModule } from 'inversify';

export const translationModuleControllers = [TranslationController];
export const translationModuleValidators = [];

export const translationContainerModules = [
  new ContainerModule(options => {
    options.bind(TranslationController).toSelf().inSingletonScope();
    options.bind(Symbol.for('TranslationService')).to(TranslationService).inSingletonScope();
  }),
];

export async function setupTranslationContainer(): Promise<void> {
  const container = new Container();
  await container.load(...translationContainerModules);

  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/TranslationController.js';
export * from './services/TranslationService.js';
