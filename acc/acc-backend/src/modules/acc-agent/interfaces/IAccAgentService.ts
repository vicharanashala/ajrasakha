export interface IAccAgentService {
  createThread(): Promise<{ thread_id: string }>;
  extractData(
    threadId: string,
    transcript: string,
    extractionType?: 'farmer_details' | 'query_details'
  ): Promise<{
    extracted_queries?: Array<{
      query: string;
      crop: string | null;
      standardized_domains: string[];
    }>;
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
    extracted_domain?: string | string[];
    standardized_domains?: string[];
    extracted_name?: string;
    extracted_phone?: string;
    extracted_age?: number;
    extracted_gender?: string;
    extracted_village?: string;
    extracted_block?: string;
    extracted_primary_crop?: string;
    extracted_secondary_crops?: string[] | string;
    extracted_language_preference?: string;
    extracted_years_of_experience?: number;
    extracted_highest_education?: string;
    extracted_smartphones_at_home?: number;
  }>;
  updateState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
      block?: string;
      village?: string;
      domain: string | string[];
      season: string;
      farmerName?: string;
      farmerPhone?: string;
      farmerAge?: number;
      farmerGender?: string;
      farmerVillage?: string;
      farmerBlock?: string;
      farmerPrimaryCrop?: string;
      farmerSecondaryCrops?: string[] | string;
      farmerLanguagePreference?: string;
      farmerYearsOfExperience?: number;
      farmerHighestEducation?: string;
      farmerSmartphonesAtHome?: number;
    }
  ): Promise<void>;
  resumeAndGetAnswer(threadId: string): Promise<{ final_answer: string }>;
  getThreadState(threadId: string): Promise<any>;
}
