import {ContainerModule} from 'inversify';
import {SchemeController} from './controllers/SchemeController.js';

export const schemesContainerModule = new ContainerModule(options => {
  options.bind(SchemeController).toSelf().inSingletonScope();
});
