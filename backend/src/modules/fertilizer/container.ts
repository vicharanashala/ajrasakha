import {ContainerModule} from 'inversify';
import {FertilizerController} from './controllers/FertilizerController.js';

export const fertilizerContainerModule = new ContainerModule(options => {
  options.bind(FertilizerController).toSelf().inSingletonScope();
});
