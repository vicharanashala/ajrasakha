/**
 * Cloud Run Job entrypoint for the daily Response Adherence Summary report.
 */
import {getContainer, loadAppModules} from '../../bootstrap/loadModules.js';
import {CHATBOT_TYPES} from '#root/modules/chatbot/types.js';
import {ChatbotService} from '#root/modules/chatbot/index.js';

async function main(): Promise<void> {
  await loadAppModules('all');

  const container = getContainer();
  const chatbotService = container.get<ChatbotService>(CHATBOT_TYPES.ChatbotService);
  const result = await chatbotService.sendDailyResponseAdherenceReportEmail();
  console.log(
    `[response-adherence-report-job] done: success=${result.success}, message=${result.message}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[response-adherence-report-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });
