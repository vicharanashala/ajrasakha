import { ContainerModule } from 'inversify';
import { GapDetectorController } from './controllers/GapDetectorController.js';
import { GapDetectorService } from './services/GapDetectorService.js';
import { GAP_DETECTOR_TYPES } from './types.js';

export const gapDetectorContainerModule = new ContainerModule(options => {
  options.bind(GapDetectorController).toSelf().inSingletonScope();
  options.bind(GAP_DETECTOR_TYPES.GapDetectorService).to(GapDetectorService).inSingletonScope();
});

