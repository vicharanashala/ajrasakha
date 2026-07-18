import { ContainerModule } from 'inversify';
import { FarmerFeedbackRepository } from './models/FarmerFeedbackModel.js';
import { FarmerFeedbackService } from './services/FarmerFeedbackService.js';
import { FarmerFeedbackController } from './controllers/FarmerFeedbackController.js';

export const feedbackContainerModule = new ContainerModule(options => {
  options.bind(FarmerFeedbackRepository).toSelf().inSingletonScope();
  options.bind(FarmerFeedbackService).toSelf().inSingletonScope();
  options.bind(FarmerFeedbackController).toSelf();
});
