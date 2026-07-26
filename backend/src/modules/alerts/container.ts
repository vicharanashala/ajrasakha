import {ContainerModule} from 'inversify';
import {AlertController} from './controllers/AlertController.js';

export const alertsContainerModule = new ContainerModule(options => {
  options.bind(AlertController).toSelf().inSingletonScope();
});

export const alertsContainerModules: ContainerModule[] = [alertsContainerModule];
