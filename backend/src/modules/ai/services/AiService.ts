import { aiConfig } from '#root/config/ai.js';
import { QuestionSearchResponse, IQuestionAnalysis, IQuestionWithAnswerTexts } from '#root/modules/question/classes/validators/QuestionVaidators.js';
import { IQuestion } from '#root/shared/index.js';
import { injectable, inject } from 'inversify';
import { InternalServerError, NotFoundError } from 'routing-controllers';
import { WEATHER_TYPES } from '#root/modules/weather/types.js';
import { IWeatherService } from '#root/modules/weather/services/WeatherService.js';
import { CROP_TYPES } from '#root/modules/crop/types.js';
import { ICropService } from '#root/modules/crop/interfaces/ICropService.js';
import { LGD_TYPES } from '#root/modules/lgd/types.js';
import { ILocationService } from '#root/modules/lgd/interfaces/ILocationService.js';

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

  constructor(
    @inject(WEATHER_TYPES.WeatherService)
    private readonly weatherService: IWeatherService,
    @inject(CROP_TYPES.CropService)
    private readonly cropService: ICropService,
    @inject(LGD_TYPES.LocationService)
    private readonly locationService: ILocationService,
  ) {}

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
      const fullUrl = `${this._openAIServerUrl}/v1/chat/completions`;

      const systemPrompt =
        You are an expert agricultural advisor helping farmers. You have access to tools to get weather forecasts and crop information.

        Your goal:
        - Provide accurate, practical, and easy-to-understand answers.
        - If the user asks about the weather, you MUST use the 'get_weather_forecast' tool with the location name.
        - If the user asks about sowing or harvesting time for a crop, you MUST use the 'get_crop_sowing_info' tool.
        - Write in simple language suitable for farmers.
        - Focus on real-world solutions.

        Rules:
        - Avoid bullet points unless necessary.
        - Write in clear, natural paragraphs.
        - Do not use headings like "Cause", "Symptoms", etc.
        - Be concise but informative.
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
        - If the question is about weather, call the 'get_weather_forecast' tool with the location name (e.g., "Mumbai", "Jaipur").
        - If the question is about sowing or harvesting time, call the 'get_crop_sowing_info' tool with the crop name.
        - Otherwise, provide a clear and meaningful answer in paragraph form.
        `;

      const tools = [
        {
          type: "function",
          function: {
            name: "get_weather_forecast",
            description: "Get the current weather forecast for a given location name.",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The name of the city or location, e.g., 'Mumbai', 'Jaipur'.",
                },
              },
              required: ["location"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_crop_sowing_info",
            description: "Get the sowing and harvesting time for a specific crop.",
            parameters: {
              type: "object",
              properties: {
                crop_name: {
                  type: "string",
                  description: "The name of the crop in English, e.g., 'wheat', 'rice'.",
                },
              },
              required: ["crop_name"],
            },
          },
        },
      ];

      const messages: any[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-30B-A3B",
          messages: messages,
          temperature: 0.4,
          max_tokens: 700,
          tools: tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new InternalServerError(
          `Failed to get LLM response: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const responseData = await response.json();
      const responseMessage = responseData.choices[0].message;

      // Check if the model wants to call a tool
      if (responseMessage.tool_calls) {
        const toolCall = responseMessage.tool_calls[0];
        let toolResponseMessage;

        if (toolCall.function.name === 'get_weather_forecast') {
          const args = JSON.parse(toolCall.function.arguments);
          try {
            const coords = await this.locationService.getCoordinatesByLocationName(args.location);
            if (coords) {
              const weatherData = await this.weatherService.getWeatherByLocation(coords.lat, coords.lon);
              toolResponseMessage = {
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolCall.function.name,
                content: JSON.stringify(weatherData),
              };
            } else {
              throw new NotFoundError();
            }
          } catch (e) {
             toolResponseMessage = {
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolCall.function.name,
                content: JSON.stringify({error: `Could not find the location ${args.location}.`}),
              };
          }
        } else if (toolCall.function.name === 'get_crop_sowing_info') {
          const args = JSON.parse(toolCall.function.arguments);
          const cropInfo = this.cropService.getCropSowingInfo(args.crop_name);
          toolResponseMessage = {
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolCall.function.name,
            content: cropInfo ? JSON.stringify(cropInfo) : JSON.stringify({error: "Crop not found"}),
          };
        }

        if (toolResponseMessage) {
          messages.push(responseMessage);
          messages.push(toolResponseMessage);

          // Call the model again with the tool data
          const finalResponse = await fetch(fullUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "Qwen/Qwen3-30B-A3B",
              messages: messages,
              temperature: 0.4,
              max_tokens: 700,
            }),
          });

          if (!finalResponse.ok) {
            throw new InternalServerError('Failed to get final response from LLM after tool call');
          }

          const finalData = await finalResponse.json();
          let answer = finalData.choices[0].message.content;
          return { question: questionDoc.question, answer };
        }
      }

      // If no tool call, process the direct answer
      let answer = responseMessage.content;

      if (!answer) {
        throw new InternalServerError("LLM returned insufficient content");
      }

      answer = answer
        .replace(/```[\s\S]*?```/g, "") // remove code blocks fully
        .replace(/```/g, "")            // fallback cleanup
        .replace(/\*\*/g, "")           // remove bold markdown
        .replace(/^\s+/, "")            // remove leading whitespace/newlines
        .replace(/\n{3,}/g, "\n\n")     // normalize excessive line breaks
        .trim();

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
