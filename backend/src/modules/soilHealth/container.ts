import { ContainerModule } from 'inversify';
import { SoilHealthController } from './SoilHealthController.js';

export const soilHealthContainerModule = new ContainerModule(options => {
  options.bind(SoilHealthController).toSelf().inSingletonScope();
});
