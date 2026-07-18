import {ContainerModule} from 'inversify';
import {CropCalendarController} from './controllers/CropCalendarController.js';

export const cropCalendarContainerModule = new ContainerModule(options => {
  options.bind(CropCalendarController).toSelf().inSingletonScope();
});
