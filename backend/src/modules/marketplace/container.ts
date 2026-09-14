import {ContainerModule} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {ListingController} from './controllers/ListingController.js';
import {ListingService} from './services/ListingService.js';
import {ListingRepository} from '#root/shared/database/providers/mongo/repositories/ListingRepository.js';
import {DealController} from './controllers/DealController.js';
import {DealService} from './services/DealService.js';
import {DealRepository} from '#root/shared/database/providers/mongo/repositories/DealRepository.js';
import {MessageController} from './controllers/MessageController.js';
import {MessageService} from './services/MessageService.js';
import {MessageRepository} from '#root/shared/database/providers/mongo/repositories/MessageRepository.js';

export const marketplaceContainerModule = new ContainerModule(options => {
  options.bind(ListingController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.ListingService).to(ListingService).inSingletonScope();
  options.bind(GLOBAL_TYPES.ListingRepository).to(ListingRepository).inSingletonScope();

  options.bind(DealController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.DealService).to(DealService).inSingletonScope();
  options.bind(GLOBAL_TYPES.DealRepository).to(DealRepository).inSingletonScope();

  options.bind(MessageController).toSelf().inSingletonScope();
  options.bind(GLOBAL_TYPES.MessageService).to(MessageService).inSingletonScope();
  options.bind(GLOBAL_TYPES.MessageRepository).to(MessageRepository).inSingletonScope();
});