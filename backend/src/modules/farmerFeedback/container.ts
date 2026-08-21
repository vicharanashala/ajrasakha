import { ContainerModule } from 'inversify';
import { FARMER_FEEDBACK_TYPES } from './types.js';
import { FarmerFeedbackController } from './controllers/FarmerFeedbackController.js';
import { FarmerFeedbackService } from './services/FarmerFeedbackService.js';
import { FarmerFeedbackRepository } from '#root/shared/database/providers/mongo/repositories/FarmerFeedbackRepository.js';

export const farmerFeedbackContainerModule = new ContainerModule(options => {
  // Repositories
  options
    .bind(FARMER_FEEDBACK_TYPES.FarmerFeedbackRepository)
    .to(FarmerFeedbackRepository)
    .inSingletonScope();

  // Services
  options
    .bind(FARMER_FEEDBACK_TYPES.FarmerFeedbackService)
    .to(FarmerFeedbackService)
    .inSingletonScope();

  // Controllers
  options.bind(FarmerFeedbackController).toSelf().inSingletonScope();
});
