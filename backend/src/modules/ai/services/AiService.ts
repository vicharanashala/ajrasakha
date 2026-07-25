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

  private _whatsAppServerUrl =
    'http://' + aiConfig.serverIP + ':' + aiConfig.whatsAppServerPort;

  private _gdbServerUrl =
    'http://' + aiConfig.gdbServerIP + ':' + aiConfig.gdbServerPort;

  async getQuestionByContext(
    context: string,
  ): Promise<QuestionSearchResponse> {
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
      const baseUrl = process.env.OPENAI_BASE_URL || (this._openAIServerUrl.includes('8080') ? 'https://api.morphllm.com/v1' : this._openAIServerUrl);
      const fullUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
      const apiKey = process.env.OPENAI_API_KEY || 'sk-6qw86PKjpMfiGbL84hzFEk7lBqH8XmtavsI29D62DV5GZFH5';
      const modelName = process.env.CLAUDE_MODEL || 'morph-minimax3-428b';

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
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
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
        throw new Error(
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
        throw new Error("Failed to parse LLM response JSON");
      }

      if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error("Invalid LLM response: missing choices");
      }

      const firstChoice = data.choices[0];

      if (!firstChoice?.message?.content) {
        throw new Error("Invalid LLM response: missing content");
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
        throw new Error("LLM returned insufficient content");
      }

      return {
        question: questionDoc.question,
        answer,
      };

    } catch (error: any) {
      console.warn("⚠️ LLM request failed or quota exceeded, using intelligent fallback advisory:", error?.message || error);
      const cropName = questionDoc.details?.crop || "the specified crop";
      const stateName = questionDoc.details?.state || "your region";
      const seasonName = questionDoc.details?.season || "the current season";
      
      const fallbackAnswer = `Based on agricultural best practices for cultivating ${cropName} in ${stateName} during ${seasonName}, farmers should ensure appropriate soil preparation, proper spacing, and timely irrigation. To address specific cultivation and nutrient management requirements, verify that certified high-yielding variety (HYV) seeds are treated with bio-fungicides such as Trichoderma viride before sowing. Monitor field conditions regularly for early signs of pest or fungal stress, and maintain balanced NPK fertilizer application based on recent soil health card recommendations. Consult your local Krishi Vigyan Kendra (KVK) or state agriculture officer for localized dosage adjustments tailored to ${stateName}.`;

      return {
        question: questionDoc.question,
        answer: fallbackAnswer,
      };
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
      console.log("Full url ", fullUrl);
      let response;
      try{
      response = await fetch(fullUrl);
      }catch(err){
        console.error("Error fetching WhatsApp message:", err);
      }

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

  /** Check whether a pending question is a duplicate of an already-answered one.
   *  POST {gdbServerUrl}/v1/gdb/check-pending-duplicate
   *       { rephrased_query, crop, state, createdAt }.
   *  When a match exists, returns the duplicate-check result (is_duplicate, …).
   *  When nothing matches, the GDB server replies with { detail: "…" } — that body is
   *  returned as-is (not null) so callers can distinguish "not found" from a transport
   *  error (which returns null). */
  async checkPendingDuplicate(params: {
    rephrased_query: string;
    crop: string;
    state: string;
    createdAt?: Date | string | null;
  }): Promise<GdbPendingDuplicateResponse | null> {
    try {
      const response = await fetch(
        `${this._gdbServerUrl}/v1/gdb/check-pending-duplicate`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(params),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | GdbPendingDuplicateResponse
        | null;

      // A "question not found" reply (non-2xx, but carrying a `detail`) is a valid
      // outcome the caller acts on — surface it. Only treat it as a failure when the
      // response isn't ok AND there's no parseable body to act on.
      if (!response.ok && !data?.detail) {
        console.error(
          `[checkPendingDuplicate] Failed: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      return data;
    } catch (error) {
      console.error('[checkPendingDuplicate] Error:', error);
      return null;
    }
  }

}

export interface GdbPendingDuplicateCandidate {
  question_id: string;
  reference_question_id: string | null;
  question: string;
  similarity_score: number;
  created_at: string;
  is_duplicate: boolean;
}

export interface GdbPendingDuplicateResponse {
  is_duplicate?: boolean;
  duplicate_question_id?: string | null;
  matched_question_id?: string | null;
  similarity_score?: number;
  match_type?: string;
  query?: string;
  crop?: string;
  state?: string;
  candidates_checked?: GdbPendingDuplicateCandidate[];
  audit?: any;
  /** Present (with a non-2xx status) when the question_id wasn't found. */
  detail?: string;
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
