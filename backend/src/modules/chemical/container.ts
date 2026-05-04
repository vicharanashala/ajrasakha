import {ContainerModule} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {ChemicalController} from './controllers/ChemicalController.js';
import {ChemicalService} from './services/ChemicalService.js';

// ChemicalService now uses CropRepository (crop_master) instead of ChemicalRepository.
// GLOBAL_TYPES.CropRepository is bound by the crop module's container — no rebind needed here.
export const chemicalContainerModule = new ContainerModule(options => {
  options.bind(ChemicalController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.ChemicalService).to(ChemicalService).inSingletonScope();
});
