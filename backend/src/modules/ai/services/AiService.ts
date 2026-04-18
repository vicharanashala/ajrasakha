import { aiConfig } from '#root/config/ai.js';
import { QuestionSearchResponse, IQuestionAnalysis, IQuestionWithAnswerTexts } from '#root/modules/question/classes/validators/QuestionVaidators.js';
import { IQuestion } from '#root/shared/index.js';
import { injectable } from 'inversify';
import { InternalServerError } from 'routing-controllers';

@injectable()
export class AiService {
  private _aiServerUrl =
    'http://' + aiConfig.serverIP + ':' + aiConfig.serverPort;

  private _agentServerUrl =
    'http://' + aiConfig.agentServerIP + ':' + aiConfig.agerntServerPort;

  private _openAIServerUrl =
    'http://' + aiConfig.openAIServerIP + ':' + aiConfig.openAIServerPort;

  async getQuestionByContext(
    context: string,
  ): Promise<QuestionSearchResponse> {
    // const response = await fetch(`${this._aiServerUrl}/questions`, {
    const response = await fetch(`${this._agentServerUrl}/search_all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: context,
        top_k: 5,
        threshold: 0.8
      }),
    });
    if (!response.ok)
      throw new InternalServerError(
        `Failed to get questions from ai server ${response.statusText}`,
      );
    const data = (await response.json()) as QuestionSearchResponse;
    return data;
  }

  async getQuestionByContextAndMetaData(
    question: string,
    state?: string,
    district?: string,
    crop?: string,
    season?: string,
    domain?: string,
  ): Promise<QuestionSearchResponse> {

    const response = await fetch(`${this._agentServerUrl}/search_all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: question,
        top_k: 3,
        threshold: 0.85,
        state: state,
        district: district,
        crop: crop,
        //season: season,
        //domain: domain
      }),
    });

    if (!response.ok) {
      throw new InternalServerError(
        `Failed to get questions from ai server ${response.statusText}`,
      );
    }

    const data = (await response.json()) as QuestionSearchResponse;
    return data;
  }

  async getFinalAnswerByThreshold(answers: {
    text1: string;
    text2: string;
  }): Promise<{ similarity_score: number }> {
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
    const data = (await response.json()) as { similarity_score: number };
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

  async getEmbedding(text: string): Promise<{ embedding: number[] }> {
    try {
      const fullUrl = `${this._aiServerUrl}/embed`;
      console.log("FULL FETCH URL:", fullUrl);
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        const errorText = await response.text();
        throw new InternalServerError(
          `Failed to get embedding from AI server: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as { embedding: number[] };
      return data;
    } catch (error) {
      console.error('AI embedding request failed:', error);
      throw new InternalServerError(
        'Failed to generate embedding from the AI server. Please try again later.',
      );
    }
  }

  async getAnswerByQuestionDetails(
    questionDoc: IQuestion
  ): Promise<{ question: string; answer: string }> {
    try {
      const fullUrl = `${this._openAIServerUrl}/v1/chat/completions`;

      const systemPrompt = `
        You are an expert agricultural advisor helping farmers.

        Your goal:
        - Provide accurate, practical, and easy-to-understand answers
        - Write in simple language suitable for farmers
        - Focus on real-world solutions

        Rules:
        - Avoid bullet points unless necessary
        - Write in clear, natural paragraphs
        - Do not use headings like "Cause", "Symptoms", etc.
        - Be concise but informative
        `;

      const userPrompt = `
        Farmer Question:
        "${questionDoc.question}"

        Context:
        - State: ${questionDoc.details?.state || "Unknown"}
        - District: ${questionDoc.details?.district || "Unknown"}
        - Crop: ${questionDoc.details?.crop || "Unknown"}
        - Season: ${questionDoc.details?.season || "Unknown"}
        - Domain: ${questionDoc.details?.domain || "General"}

        Instructions:
        Provide a clear and meaningful answer in paragraph form.

        The answer should:
        - Explain the likely issue
        - Describe what the farmer might observe
        - Suggest practical prevention and treatment steps
        - Be easy to understand and actionable

        Do not use structured sections or bullet formatting.
        Write as a natural explanation.
        `;

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-30B-A3B",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 700,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new InternalServerError(
          `Failed to get LLM response: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      type LLMResponse = {
        choices?: {
          message?: {
            content?: string;
          };
        }[];
      };

      let data: LLMResponse;

      try {
        data = (await response.json()) as LLMResponse;
      } catch (err) {
        throw new InternalServerError("Failed to parse LLM response JSON");
      }

      if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new InternalServerError("Invalid LLM response: missing choices");
      }

      const firstChoice = data.choices[0];

      if (!firstChoice?.message?.content) {
        throw new InternalServerError("Invalid LLM response: missing content");
      }

      let answer = firstChoice.message.content;

      answer = answer
        .replace(/```[\s\S]*?```/g, "") // remove code blocks fully
        .replace(/```/g, "")            // fallback cleanup
        .replace(/\*\*/g, "")           // remove bold markdown
        .replace(/^\s+/, "")            // remove leading whitespace/newlines
        .replace(/\n{3,}/g, "\n\n")     // normalize excessive line breaks
        .trim();

      if (!answer || answer.length < 10) {
        throw new InternalServerError("LLM returned insufficient content");
      }

      return {
        question: questionDoc.question,
        answer,
      };

    } catch (error) {
      console.error("❌ LLM request failed:", error);

      throw new InternalServerError(
        "Failed to generate AI answer. Please try again later."
      );
    }
  }








































  // async getEmbedding(text: string): Promise<{embedding: number[]}> {
  //   const response = await fetch(`${this._aiServerUrl}/embed`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({text}),
  //   });

  //   if (!response.ok) {
  //     throw new InternalServerError(
  //       `Failed to get embedding from AI server: ${response.statusText}`,
  //     );
  //   }

  //   const data = (await response.json()) as {embedding: number[]};
  //   return data;
  // }


  /*async getEmbedding(text: string): Promise<{ embedding: number[] } | null> {
    const fullUrl = `${this._aiServerUrl}/embed`;
  
    console.log("FULL FETCH URL:", fullUrl);
    console.log("FULL URL LENGTH:", fullUrl.length);
    console.log("LAST CHAR CODE:", fullUrl.charCodeAt(fullUrl.length - 1));
  
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  
    console.log("Response object:", response);
    console.log("Response status:", response.status);
    console.log("Response status text:", response.statusText);
  
    if (!response.ok) {
      const errorText = await response.text();
      console.log("Embedding request failed");
      console.log("Error status:", response.status);
      console.log("Error body:", errorText);
      return null;
    }
  
    const data = (await response.json()) as { embedding: number[] };
    console.log("Embedding received successfully");
    console.log("Embedding length:", data?.embedding?.length);
  
    return data;
  }*/
}
