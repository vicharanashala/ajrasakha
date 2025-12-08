import {getContainer} from '#root/bootstrap/loadModules.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

export interface DailyStats {
  total: number;
  waiting: number;
  totalGolden: number;
  todayAdded: number;
  todayGolden: number;
  chatbot: number;
  manual: number;
}

export const getDailyStats = async (): Promise<DailyStats> => {
  const container = getContainer();
  const questionRepository = container.get<QuestionRepository>(
    CORE_TYPES.QuestionRepository,
  );

  const questions = await questionRepository.getAll();
  const inReview = await questionRepository.getByStatus('in-review');
  const closed = await questionRepository.getByStatus('closed');

  const total = questions.length;
  const waiting = inReview.length;
  const totalGolden = closed.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const today = questions.filter(q => new Date(q.createdAt) >= todayStart);

  const todayGolden = questions.filter(
    q => new Date(q.closedAt) >= todayStart,
  ).length;
  const chatbot = today.filter(q => q.source === 'AJRASAKHA').length;
  const manual = today.length - chatbot;

  return {
    total,
    waiting,
    totalGolden,
    todayAdded: today.length,
    todayGolden,
    chatbot,
    manual,
  };
};
