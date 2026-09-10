import {ContainerModule} from 'inversify';
import {PlantScanController} from './controllers/PlantScanController.js';
import {PlantScanService} from './services/PlantScanService.js';

export const plantScanContainerModules: ContainerModule[] = [
  new ContainerModule((options) => {
    options.bind(PlantScanService).toSelf().inSingletonScope();
    options.bind(PlantScanController).toSelf().inSingletonScope();
  }),
];

export const plantScanModuleControllers: Function[] = [
  PlantScanController,
];

export const plantScanModuleValidators: Function[] = [];
