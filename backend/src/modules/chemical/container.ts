import {ContainerModule} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {ChemicalController} from './controllers/ChemicalController.js';
import {ChemicalService} from './services/ChemicalService.js';
import {ChemicalRepository} from '#root/shared/database/providers/mongo/repositories/ChemicalRepository.js';

export const chemicalContainerModule = new ContainerModule(options => {
  options.bind(ChemicalController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.ChemicalService).to(ChemicalService).inSingletonScope();
  options.bind(GLOBAL_TYPES.ChemicalRepository).to(ChemicalRepository).inSingletonScope();
});
