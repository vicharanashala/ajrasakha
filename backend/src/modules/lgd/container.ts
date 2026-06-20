import {ContainerModule} from 'inversify';
import {LocationController} from './controllers/locationController.js';
import {LocationService} from './services/locationService.js';
import {LGD_TYPES} from './types.js';

export const lgdContainerModule = new ContainerModule(options => {
  options.bind(LocationController).toSelf().inSingletonScope();
  options.bind(LGD_TYPES.LocationService).to(LocationService).inSingletonScope();
});

export const lgdContainerModules: ContainerModule[] = [lgdContainerModule];
