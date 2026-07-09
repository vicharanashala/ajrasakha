import { useContainer } from 'class-validator';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { QuestionController } from './controllers/QuestionController.js';
import { Container, ContainerModule } from 'inversify';

export const questionModuleControllers = [QuestionController];
export const questionModuleValidators = [];

export const questionContainerModules = [
  new ContainerModule(options => {
    options.bind(QuestionController).toSelf().inSingletonScope();
  }),
];

export async function setupQuestionContainer(): Promise<void> {
  const container = new Container();
  await container.load(...questionContainerModules);

  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/QuestionController.js';
