import {ContainerModule} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {VerificationController} from './controllers/VerificationController.js';
import {VerificationService} from './services/VerificationService.js';
import {ClaimResolver} from './services/ClaimResolver.js';
import {PolicyEngine} from './services/PolicyEngine.js';
import {RuleBasedClaimExtractor} from './extractors/RuleBasedClaimExtractor.js';
import {VerificationReceiptRepository} from './repositories/VerificationReceiptRepository.js';

export const verificationContainerModule = new ContainerModule(options => {
  options.bind(RuleBasedClaimExtractor).toSelf().inSingletonScope();
  options.bind(PolicyEngine).toSelf().inSingletonScope();
  options.bind(ClaimResolver).toSelf().inSingletonScope();
  options
    .bind(GLOBAL_TYPES.VerificationService)
    .to(VerificationService)
    .inSingletonScope();
  options.bind(VerificationReceiptRepository).toSelf().inSingletonScope();
  options.bind(VerificationController).toSelf().inSingletonScope();
});
