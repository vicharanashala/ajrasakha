import {ContainerModule} from 'inversify';

import {ROUTE_TYPES} from './types.js';

import {ReRouteController} from './controllers/ReRouteController.js'
import {ReRouteService} from './services/ReRouteService.js'
import {ReRouteRepository} from '#root/shared/database/providers/mongo/repositories/ReRouteRepository.js'

export const rerouteContainerModule = new ContainerModule(options => {
  // Controllers
  
  options.bind(ReRouteController).toSelf().inSingletonScope()
  // Services
  options
    .bind(ROUTE_TYPES.ReRouteService) 
    .to(ReRouteService)
    .inSingletonScope();
  
  // Repositories
  options
    .bind(ROUTE_TYPES.ReRouteRepository)
    .to(ReRouteRepository)
    .inSingletonScope();
  
    
 
});
