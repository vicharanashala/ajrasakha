import {ContainerModule} from 'inversify';
import {sharedContainerModule} from '#root/container.js';
import {marketplaceContainerModule} from './container.js';
import {ListingController} from './controllers/ListingController.js';
import {LISTING_VALIDATORS} from './classes/validators/ListingValidators.js';
import {DealController} from './controllers/DealController.js';
import {DEAL_VALIDATORS} from './classes/validators/DealValidators.js';
import {MessageController} from './controllers/MessageController.js';
import {MESSAGE_VALIDATORS} from './classes/validators/MessageValidators.js';

export const marketplaceModuleControllers: Function[] = [ListingController, DealController, MessageController];

export const marketplaceModuleValidators: Function[] = [...LISTING_VALIDATORS, ...DEAL_VALIDATORS, ...MESSAGE_VALIDATORS];

export const marketplaceContainerModules: ContainerModule[] = [
  marketplaceContainerModule,
  sharedContainerModule,
];
