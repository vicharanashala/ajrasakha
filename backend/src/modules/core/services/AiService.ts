import {aiConfig} from '#root/config/ai.js';
import {injectable} from 'inversify';
import {InternalServerError} from 'routing-controllers';
import {
  GeneratedQuestionResponse,
  IQuestionAnalysis,
  IQuestionWithAnswerTexts,
} from '../classes/validators/QuestionValidators.js';

@injectable()
export class AiService {
  private _aiServerUrl =
    'http://' + aiConfig.serverIP + ':' + aiConfig.serverPort;

  async getQuestionByContext(
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    const response = await fetch(`${this._aiServerUrl}/questions`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({context}),
    });
    if (!response.ok)
      throw new InternalServerError(
        `Failed to get questions from ai server ${response.statusText}`,
      );
    const data = (await response.json()) as GeneratedQuestionResponse[];
    return data;
  }

  async getFinalAnswerByThreshold(answers: {
    text1: string;
    text2: string;
  }): Promise<{similarity_score: number}> {
    const response = await fetch(`${this._aiServerUrl}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(answers),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get final answer from ai server: ${response.statusText}`,
      );
    }
    const data = (await response.json()) as {similarity_score: number};
    return data;
  }

  async evaluateAnswers(
    payload: IQuestionWithAnswerTexts,
  ): Promise<IQuestionAnalysis> {
    const response = await fetch(`${this._aiServerUrl}/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to evaluate answers from AI server: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as IQuestionAnalysis;
    return data;
  }

  async getEmbedding(text: string): Promise<{embedding: number[]}> {
    const response = await fetch(`${this._aiServerUrl}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({text}),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get embedding from AI server: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {embedding: number[]};
    return data;
  }
}
