import {ContainerModule} from 'inversify';
import {AUTH_TYPES} from './types.js';
import {FirebaseAuthService} from './services/index.js';
import {AuthController} from './controllers/index.js';
import {UserRepository} from '#root/shared/database/providers/mongo/repositories/UserRepository.js';
import { GLOBAL_TYPES } from '#root/types.js';

export const authContainerModule = new ContainerModule(options => {
  // Controllers
  options.bind(AuthController).toSelf().inSingletonScope();

  // Services
  options
    .bind(AUTH_TYPES.AuthService)
    .to(FirebaseAuthService)
    .inSingletonScope();

  // Reponsitory
  options.bind(GLOBAL_TYPES.UserRepository).to(UserRepository).inSingletonScope();
});
 