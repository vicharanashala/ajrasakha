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
    extracted_domain?: string | string[];
    extracted_name?: string;
    extracted_phone?: string;
    extracted_age?: number;
    extracted_gender?: string;
    extracted_village?: string;
    extracted_block?: string;
    extracted_primary_crop?: string;
  }>;
  updateState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
      domain: string | string[];
      season: string;
      farmerName?: string;
      farmerPhone?: string;
      farmerAge?: number;
      farmerGender?: string;
      farmerVillage?: string;
      farmerBlock?: string;
      farmerPrimaryCrop?: string;
    }
  ): Promise<void>;
  resumeAndGetAnswer(threadId: string): Promise<{ final_answer: string }>;
  getThreadState(threadId: string): Promise<any>;
}
