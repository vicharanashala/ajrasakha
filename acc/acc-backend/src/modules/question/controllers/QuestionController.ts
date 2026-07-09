import 'reflect-metadata';
import {
  Post,
  HttpCode,
  Authorized,
  JsonController,
  Body,
  InternalServerError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { injectable } from 'inversify';
import axios from 'axios';
import { ObjectId } from 'mongodb';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for ACC Question Generation',
})
@injectable()
@JsonController('/questions')
export class QuestionController {
  @Post('/generate-by-call-context')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Generate questions from call context' })
  async getQuestionFromCallContext(
    @Body() body: { query: string; state?: string; crop?: string },
  ): Promise<any[]> {
    const { query, state, crop } = body;
    try {
      const payload: any = { query };
      if (state) payload.state = state;
      if (crop) payload.crop = crop;

      const agentSearchResponse = await axios.post(
        'http://100.100.108.44:6002/search',
        payload,
        { timeout: 100000 },
      );

      const data = agentSearchResponse.data || {};
      let formattedResponse: any[] = [];

      if (
        data &&
        (Array.isArray(data.reviewer) ||
          Array.isArray(data.golden) ||
          Array.isArray(data.pop))
      ) {
        formattedResponse = [
          ...(data.reviewer || []).map((item: any) => ({
            question: item.question,
            answer: item.answer || item.text,
            agri_specialist:
              item.agri_expert ||
              item.agri_specialist ||
              item.source ||
              'AGRI_EXPERT',
            referenceSource: 'reviewer',
            id: item.id || new ObjectId().toString(),
          })),
          ...(data.golden || []).map((item: any) => ({
            question: item.question,
            answer: item.answer || item.text,
            agri_specialist:
              item.agri_expert ||
              item.agri_specialist ||
              item.metadata?.['Agri Specialist'] ||
              'Unknown',
            referenceSource: 'golden',
            id: item.id || new ObjectId().toString(),
          })),
          ...(data.pop || []).map((item: any) => ({
            question: 'Reference Information',
            answer: item.text,
            agri_specialist: 'POP_DOCUMENT',
            referenceSource: 'pop',
            id: item.id || new ObjectId().toString(),
          })),
        ];
      } else if (data && Array.isArray(data.results)) {
        formattedResponse = data.results.map((item: any) => ({
          question: item.question || data.extracted_question || query,
          answer: item.answer || item.text || 'Answer not available',
          agri_specialist: item.source || 'AGRI_EXPERT',
          referenceSource: 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (Array.isArray(data)) {
        formattedResponse = data.map((item: any) => ({
          question: item.question || query,
          answer: item.answer || item.response || JSON.stringify(item),
          agri_specialist: item.agri_specialist || item.source || 'AGRI_EXPERT',
          referenceSource: item.referenceSource || 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (data && typeof data === 'object') {
        formattedResponse = [
          {
            question: data.extracted_question || data.question || query,
            answer: data.answer || data.response || JSON.stringify(data),
            agri_specialist:
              data.agri_specialist || data.source || 'AGRI_EXPERT',
            referenceSource: data.referenceSource || 'agent_search',
            id: data.id || new ObjectId().toString(),
          },
        ];
      }

      // Deduplicate by question text
      const uniqueQuestions = Array.from(
        new Map(formattedResponse.map(q => [q.question, q])).values(),
      ).map(q => ({
        ...q,
        id: q.id || new ObjectId().toString(),
      }));

      return uniqueQuestions;
    } catch (error) {
      console.error('Failed to generate questions from call context:', error);
      throw new InternalServerError('Failed to generate questions from call context');
    }
  }
}
