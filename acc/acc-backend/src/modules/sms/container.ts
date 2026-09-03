import { ContainerModule } from 'inversify';
import { BrpsTokenService } from './services/BrpsTokenService.js';
import { BsnlSmsService } from './services/BsnlSmsService.js';
import { SMS_TYPES } from './types.js';

export const smsContainerModule = new ContainerModule(options => {
  options.bind(SMS_TYPES.BrpsTokenService).to(BrpsTokenService).inSingletonScope();
  options.bind(SMS_TYPES.BsnlSmsService).to(BsnlSmsService).inSingletonScope();
  options.bind(BrpsTokenService).toSelf().inSingletonScope();
  options.bind(BsnlSmsService).toSelf().inSingletonScope();
});

export const smsContainerModules = [smsContainerModule];
