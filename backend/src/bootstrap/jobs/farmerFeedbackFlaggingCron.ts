import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { FARMER_FEEDBACK_TYPES } from '#root/modules/farmerFeedback/types.js';
import { IFarmerFeedbackService } from '#root/modules/farmerFeedback/interfaces/IFarmerFeedbackService.js';

// Runs hourly to evaluate farmer helpfulness feedback and flag underperforming GDB answers
cron.schedule(
  '0 0 * * * *',
  async () => {
    try {
      const container = getContainer();
      const feedbackService = container.get<IFarmerFeedbackService>(
        FARMER_FEEDBACK_TYPES.FarmerFeedbackService,
      );
      const result = await feedbackService.runAutoFlaggingPipeline();
      console.log(
        `<<CRON>> [FarmerFeedback] Flagging run completed. Evaluated=${result.totalEvaluated}, Flagged=${result.flaggedCount}`,
      );
    } catch (error) {
      console.error('<<CRON>> [FarmerFeedback] Error in auto-flagging cron:', error);
    }
  },
  { timezone: 'Asia/Kolkata' },
);
