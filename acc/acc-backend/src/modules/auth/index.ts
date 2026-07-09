import { useContainer } from 'class-validator';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { AuthController } from './controllers/AuthController.js';
import { FirebaseAuthService } from './services/FirebaseAuthService.js';
import { Container, ContainerModule } from 'inversify';

export const authModuleControllers = [AuthController];
export const authModuleValidators = [];

export const authContainerModules = [
  new ContainerModule(options => {
    options.bind(AuthController).toSelf().inSingletonScope();
  }),
];

export async function setupAuthContainer(): Promise<void> {
  const container = new Container();
  await container.load(...authContainerModules);

  const inversifyAdapter = new InversifyAdapter(container);
  useContainer(inversifyAdapter);
}

export * from './controllers/AuthController.js';
export * from './services/FirebaseAuthService.js';
