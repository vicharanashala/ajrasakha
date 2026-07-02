export interface IAccAgentService {
  createThread(): Promise<{ thread_id: string }>;
  extractData(
    threadId: string,
    transcript: string
  ): Promise<{
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
  }>;
  updateState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
    }
  ): Promise<void>;
  resumeAndGetAnswer(threadId: string): Promise<{ final_answer: string }>;
}
