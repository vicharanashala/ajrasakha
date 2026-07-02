import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { QuestionService } from '#root/modules/question/services/QuestionService.js';
import { CORE_TYPES } from '#root/modules/core/types.js';

// Runs every 3 minutes. Processes up to 50 questions per tick.
// Becomes a silent no-op once all embeddings are filled.
cron.schedule('*/3 * * * *', async () => {
  console.log('<<EMBEDDING_BACKFILL>> Cron tick started');
  try {
    const questionService = getContainer().get<QuestionService>(CORE_TYPES.QuestionService);
    await questionService.backfillEmptyEmbeddings();
  } catch (err) {
    console.error('<<EMBEDDING_BACKFILL>> Unexpected error:', err);
  }
});
