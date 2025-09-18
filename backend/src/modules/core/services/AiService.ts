import {aiConfig} from '#root/config/ai.js';
import {injectable} from 'inversify';
import {InternalServerError} from 'routing-controllers';
import {GeneratedQuestionResponse} from '../classes/validators/QuestionValidators.js';

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
    previousAnswer: string;
    currentAnswer: string;
  }): Promise<number> {
    const response = await fetch(`${this._aiServerUrl}/answers/threshold`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({answers}),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get final answer from ai server: ${response.statusText}`,
      );
    }

    return (await response.json()) as number;
  }
}
