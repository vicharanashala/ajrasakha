import { aiConfig } from '#root/config/ai.js';
import { QuestionSearchResponse, IQuestionAnalysis, IQuestionWithAnswerTexts } from '#root/modules/question/classes/validators/QuestionVaidators.js';
import { IQuestion } from '#root/shared/index.js';
import { injectable } from 'inversify';
import { InternalServerError } from 'routing-controllers';

@injectable()
export class AiService {
  private _aiServerUrl =
    'http://' + (aiConfig.serverIP || 'localhost') + ':' + aiConfig.serverPort;

  private _agentServerUrl =
    aiConfig.agentServerIP
      ? 'http://' + aiConfig.agentServerIP + ':' + (aiConfig.agerntServerPort || '9017')
      : '';

  private _openAIServerUrl =
    aiConfig.openAIServerIP
      ? 'http://' + aiConfig.openAIServerIP + ':' + (aiConfig.openAIServerPort || '8080')
      : '';

  private _whatsAppServerUrl =
    'http://' + (aiConfig.serverIP || 'localhost') + ':' + aiConfig.whatsAppServerPort;

  private _gdbServerUrl =
    'http://' + (aiConfig.gdbServerIP || 'localhost') + ':' + aiConfig.gdbServerPort;

  async getQuestionByContext(
    context: string,
  ): Promise<QuestionSearchResponse> {
    if (!this._agentServerUrl) {
      console.warn('AGENT_SERVER_IP not configured, returning empty result');
      return { reviewer: [], golden: [], pop: [] };
    }
    // const response = await fetch(`${this._aiServerUrl}/questions`, {
    const response = await fetch(`${this._agentServerUrl}/search`, {
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
    if (!this._agentServerUrl) {
      console.warn('AGENT_SERVER_IP not configured, returning empty result');
      return { reviewer: [], golden: [], pop: [] };
    }
    const response = await fetch(`${this._agentServerUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: question,
        top_k: 3,
        threshold: 0.85,
        state: state,
       // district: district,
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
     /* throw new InternalServerError(
        'Failed to generate embedding from the AI server. Please try again later.',
      );*/
      return { embedding: [] };
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

  async fetchWhatsAppMessage(
    threadId: string,
    questionId: string
  ): Promise<{
    messageId: string;
    createdAt: string;
    updatedAt: string;
    userDetails: {
      username: string;
      email: string;
      emailVerified: boolean;
      avatar: string | null;
    };
    content: {
      type: "human" | "ai" | "tool";
      text?: string;
      toolName?: string;
      toolArgs?: Record<string, any>;
      toolResponse?: any;
    }[];
  } | null> {
    try {
      interface AgriFlowResponse {
        values: {
          messages: {
            content: any;
            type: "human" | "ai" | "tool";
            name?: string;
            tool_calls?: {
              name: string;
              args: Record<string, any>;
              id: string;
              type: string;
            }[];
            artifact?: {
              structured_content?: {
                result?: any;
              };
            };
          }[];
        };
        metadata: {
          user_display_name: string;
        };
        created_at: string;
        checkpoint_id: string;
      }

      const fullUrl = `${this._whatsAppServerUrl}/threads/${threadId}/state`;

      const response = await fetch(fullUrl);

      if (!response.ok) {
        console.error("Failed to fetch WhatsApp message:", response.statusText);
        return null;
      }

      const data = (await response.json()) as AgriFlowResponse;
      if (!data?.values || !Array.isArray(data.values.messages)) {
        console.warn("Invalid API response", data);
        return null;
      }

      const messages = data.values.messages;
      const extractId = (id: any): string | null => {
        if (typeof id === 'string') return id;
        if (!id) return null;
        if (id.buffer && Array.isArray(id.buffer.data)) {
          return id.buffer.data.map((b: number) => b.toString(16).padStart(2, '0')).join('');
        }
        if (id.$oid) return id.$oid;
        return String(id);
      };

      /* =======================================================
          STEP 1: FIND START INDEX USING questionId
      ======================================================= */

      let startIndex = -1;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.type === "tool" && msg.name === "upload_question_to_reviewer_system") {
          try {
            let extractedId: string | null = null;

            // 1. Try extracting from artifact if present
            if (msg.artifact?.structured_content?.result?.data) {
              const resData = msg.artifact.structured_content.result.data;
              extractedId = extractId(resData.data?._id || resData.question_id);
            }

            // 2. Fallback to parsing content
            if (!extractedId) {
              const textBlock = Array.isArray(msg.content)
                ? msg.content.find((c: any) => c.type === "text")?.text
                : (typeof msg.content === 'string' ? msg.content : null);

              if (textBlock) {
                const parsed = JSON.parse(textBlock);
                extractedId = extractId(parsed?.data?.data?._id || parsed?.data?.data?.question_id || parsed?.question_id);
              }
            }

            if (extractedId === questionId) {
              //  move back to corresponding human
              startIndex = i - 1;

              while (startIndex >= 0 && messages[startIndex].type !== "human") {
                startIndex--;
              }

              break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      if (startIndex === -1) {
        console.warn("Question block not found for questionId:", questionId);
        return null;
      }

      /* =======================================================
         STEP 2: COLLECT STRUCTURED CONVERSATION
      ======================================================= */

      const structuredContent: {
        type: "human" | "ai" | "tool";
        text?: string;
        toolName?: string;
        toolArgs?: Record<string, any>;
        toolResponse?: any;
      }[] = [];

      for (let i = startIndex; i < messages.length; i++) {
        const msg = messages[i];

        // ✅ STOP at next human (skip first)
        if (i !== startIndex && msg.type === "human") break;

        /* ---------------- HUMAN ---------------- */
        if (msg.type === "human") {
          structuredContent.push({
            type: "human",
            text: typeof msg.content === "string" ? msg.content : (Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || '').join(' ') : ""),
          });
        }

        /* ---------------- AI ---------------- */
        else if (msg.type === "ai") {
          //  Tool calls (Intent to call)
          if (msg.tool_calls?.length) {
            for (const tool of msg.tool_calls) {
              structuredContent.push({
                type: "tool",
                toolName: tool.name,
                toolArgs: tool.args,
              });
            }
          }

          //  AI text answer
          if (typeof msg.content === "string" && !msg.content.startsWith("THIS IS AN AGRI EXPERT GENERATED MESSAGE")) {
            structuredContent.push({
              type: "ai",
              text: msg.content,
            });
          } else if (Array.isArray(msg.content)) {
            const text = msg.content
              .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
              .join(" ")
              .trim();

            if (text) {
              structuredContent.push({
                type: "ai",
                text,
              });
            }
          }
        }

        /* ---------------- TOOL RESPONSE ---------------- */
        else if (msg.type === "tool") {
          let parsedResponse: any = null;

          try {
            if (msg.artifact?.structured_content?.result) {
              parsedResponse = msg.artifact.structured_content.result;
            } else {
              const textBlock = Array.isArray(msg.content)
                ? msg.content.find((c: any) => c.type === "text")?.text
                : (typeof msg.content === 'string' ? msg.content : null);

              if (textBlock) {
                parsedResponse = JSON.parse(textBlock);
              } else {
                parsedResponse = msg.content;
              }
            }
          } catch {
            parsedResponse = msg.content;
          }

          structuredContent.push({
            type: "tool",
            toolName: msg.name,
            toolResponse: parsedResponse,
          });
        }
      }

      /* =======================================================
          FINAL RETURN
      ======================================================= */

      return {
        messageId: data.checkpoint_id || "",
        createdAt: data.created_at
          ? new Date(data.created_at).toISOString()
          : "",
        updatedAt: data.created_at
          ? new Date(data.created_at).toISOString()
          : "",
        userDetails: {
          username: data.metadata?.user_display_name || "N/A",
          email: "<not_specified>",
          emailVerified: false,
          avatar: null,
        },
        content: structuredContent,
      };
    } catch (error) {
      console.error("Error fetching WhatsApp message:", error);
      return null;
    }
  }

  async searchGdb(params: {
    crop: string;
    state: string;
    rephrased_query: string;
  }): Promise<GdbSearchResponse | null> {
    try {
      const response = await fetch(`${this._gdbServerUrl}/v1/gdb/search`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        console.error(`[searchGdb] Failed: ${response.status} ${response.statusText}`);
        return null;
      }
      return (await response.json()) as GdbSearchResponse;
    } catch (error) {
      console.error('[searchGdb] Error:', error);
      return null;
    }
  }

}

export interface GdbMatchItem {
  question_id: string;
  similarity_score: number;
  question: string;
  answer?: string;
  retrieval_source?: string;
  details?: any[];
  chosen_for_answer?: boolean;
  answer_from_class?: string;
}

export interface GdbSearchResponse {
  rephrased_query: string;
  crop: string;
  state: string;
  exact_match: GdbMatchItem | null;
  selected_match: GdbMatchItem | null;
  classification_audit?: any;
}
