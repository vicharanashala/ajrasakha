import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {InternalServerError} from 'routing-controllers';

import {AiService} from '../services/AiService.js';

describe('AiService', () => {
  let service: AiService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new AiService();
  });

  describe('getQuestionByContext', () => {
    it('returns questions when AI server responds successfully', async () => {
      const response = {
        questions: [
          {
            questionId: 'q1',
            score: 0.95,
            question: 'What is wheat?',
          },
        ],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const result = await service.getQuestionByContext('wheat');

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'wheat',
          top_k: 5,
          threshold: 0.8,
        }),
      });
    });

    it('throws InternalServerError when AI server returns non-200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Bad Request',
        }),
      );

      await expect(service.getQuestionByContext('wheat')).rejects.toThrow(
        InternalServerError,
      );
    });

    it('throws fetch error when request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(service.getQuestionByContext('wheat')).rejects.toThrow(
        'Network Error',
      );
    });

    it('passes empty query to AI server', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            questions: [],
          }),
        }),
      );

      await service.getQuestionByContext('');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            query: '',
            top_k: 5,
            threshold: 0.8,
          }),
        }),
      );
    });
  });

  describe('getQuestionByContextAndMetaData', () => {
    it('returns matching questions successfully', async () => {
      const response = {
        questions: [
          {
            questionId: 'q1',
            score: 0.94,
          },
        ],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const metadata = {
        crop: 'Wheat',
        state: 'Punjab',
        district: 'Ludhiana',
      };

      const result = await service.getQuestionByContextAndMetaData(
        'yellow leaves',
        'Punjab',
        'Ludhiana',
        'Wheat',
      );

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'yellow leaves',
          top_k: 3,
          threshold: 0.85,
          state: 'Punjab',
          crop: 'Wheat',
        }),
      });
    });

    it('throws InternalServerError when AI server returns error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
        }),
      );

      await expect(
        service.getQuestionByContextAndMetaData(
          'yellow leaves',
          'Punjab',
          'Ludhiana',
          'Wheat',
        ),
      ).rejects.toThrow(InternalServerError);
    });

    it('propagates fetch errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(
        service.getQuestionByContextAndMetaData(
          'yellow leaves',
          'Punjab',
          'Ludhiana',
          'Wheat',
        ),
      ).rejects.toThrow('Network Error');
    });

    it('sends empty optional fields', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            questions: [],
          }),
        }),
      );

      await service.getQuestionByContextAndMetaData('query');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            query: 'query',
            top_k: 3,
            threshold: 0.85,
            state: undefined,
            crop: undefined,
          }),
        }),
      );
    });
  });

  describe('getFinalAnswerByThreshold', () => {
    it('returns similarity score successfully', async () => {
      const response = {
        similarity_score: 0.92,
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const payload = {
        text1: 'Answer one',
        text2: 'Answer two',
      };

      const result = await service.getFinalAnswerByThreshold(payload);

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/score'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    });

    it('throws when AI server returns non-200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
        }),
      );

      await expect(
        service.getFinalAnswerByThreshold({
          text1: 'one',
          text2: 'two',
        }),
      ).rejects.toThrow('Failed to get final answer from ai server');
    });

    it('propagates fetch errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(
        service.getFinalAnswerByThreshold({
          text1: 'one',
          text2: 'two',
        }),
      ).rejects.toThrow('Network Error');
    });
  });

  describe('evaluateAnswers', () => {
    it('returns evaluation successfully', async () => {
      const payload = {
        question: 'Why are leaves turning yellow?',
        initialAnswer: 'Nitrogen deficiency',
        reviewerAnswer: 'Nitrogen deficiency due to poor soil nutrition',
      } as any;

      const response = {
        verdict: 'approved',
        confidence: 0.96,
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const result = await service.evaluateAnswers(payload);

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/evaluate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    });

    it('throws when AI server returns non-200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Bad Gateway',
        }),
      );

      await expect(service.evaluateAnswers({} as any)).rejects.toThrow(
        'Failed to evaluate answers from AI server',
      );
    });

    it('propagates fetch errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(service.evaluateAnswers({} as any)).rejects.toThrow(
        'Network Error',
      );
    });

    it('sends payload unchanged', async () => {
      const payload = {
        foo: 'bar',
        nested: {
          hello: 'world',
        },
      } as any;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      await service.evaluateAnswers(payload);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(payload),
        }),
      );
    });
  });
  describe('getEmbedding', () => {
    it('returns embedding successfully', async () => {
      const response = {
        embedding: [0.1, 0.2, 0.3],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const result = await service.getEmbedding('hello world');

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/embed'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'hello world',
        }),
      });
    });

    it('returns empty embedding when server responds with error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: vi.fn().mockResolvedValue('Something went wrong'),
        }),
      );

      const result = await service.getEmbedding('hello');

      expect(result).toEqual({
        embedding: [],
      });
    });

    it('returns empty embedding when fetch throws', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      const result = await service.getEmbedding('hello');

      expect(result).toEqual({
        embedding: [],
      });
    });

    it('returns empty embedding when json parsing fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        }),
      );

      const result = await service.getEmbedding('hello');

      expect(result).toEqual({
        embedding: [],
      });
    });

    it('calls response.text() when server returns non-200', async () => {
      const textSpy = vi.fn().mockResolvedValue('Backend failure');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: textSpy,
        }),
      );

      await service.getEmbedding('hello');

      expect(textSpy).toHaveBeenCalled();
    });
  });

  describe('getAnswerByQuestionDetails', () => {
    const questionDoc = {
      question: 'Why are wheat leaves turning yellow?',
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'Wheat',
        season: 'Rabi',
        domain: 'Plant Health',
      },
    } as any;

    it('returns cleaned AI answer successfully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: `
**Answer**

The crop is likely suffering from nitrogen deficiency.

\`\`\`
ignore this
\`\`\`

Apply nitrogen fertilizer and irrigate properly.
`,
                },
              },
            ],
          }),
        }),
      );

      const result = await service.getAnswerByQuestionDetails(questionDoc);

      expect(result).toEqual({
        question: questionDoc.question,
        answer:
          'Answer\n\nThe crop is likely suffering from nitrogen deficiency.\n\nApply nitrogen fertilizer and irrigate properly.',
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    });
    it('throws when LLM returns non-200 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: vi.fn().mockResolvedValue('LLM failure'),
        }),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });

    it('throws when response json cannot be parsed', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        }),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });

    it('throws when choices array is missing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });

    it('throws when choices array is empty', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [],
          }),
        }),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });

    it('throws when message content is missing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {},
              },
            ],
          }),
        }),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });

    it('throws when cleaned answer is too short', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: 'short',
                },
              },
            ],
          }),
        }),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });

    it('returns generic error when fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(
        service.getAnswerByQuestionDetails(questionDoc),
      ).rejects.toThrow(
        'Failed to generate AI answer. Please try again later.',
      );
    });
  });

  describe('searchGdb', () => {
    const params = {
      crop: 'Wheat',
      state: 'Punjab',
      rephrased_query: 'yellow leaves',
    };

    it('returns search results successfully', async () => {
      const response = {
        rephrased_query: 'yellow leaves',
        crop: 'Wheat',
        state: 'Punjab',
        exact_match: null,
        selected_match: {
          question_id: 'q1',
          similarity_score: 0.94,
          question: 'Why are wheat leaves yellow?',
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const result = await service.searchGdb(params);

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/gdb/search'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        },
      );
    });

    it('returns null when server responds with non-200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      const result = await service.searchGdb(params);

      expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      const result = await service.searchGdb(params);

      expect(result).toBeNull();
    });

    it('handles empty search response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            rephrased_query: '',
            crop: '',
            state: '',
            exact_match: null,
            selected_match: null,
          }),
        }),
      );

      const result = await service.searchGdb(params);

      expect(result?.selected_match).toBeNull();
      expect(result?.exact_match).toBeNull();
    });
  });

  describe('fetchWhatsAppMessage', () => {
    it('returns null when API returns non-200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
        }),
      );

      const result = await service.fetchWhatsAppMessage(
        'thread-1',
        'question-1',
      );

      expect(result).toBeNull();
    });

    it('returns null when values.messages is missing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            values: {},
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage(
        'thread-1',
        'question-1',
      );

      expect(result).toBeNull();
    });

    it('returns null when values.messages is not an array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            values: {
              messages: {},
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage(
        'thread-1',
        'question-1',
      );

      expect(result).toBeNull();
    });

    it('returns null when question block is not found', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Hello',
                },
                {
                  type: 'ai',
                  content: 'Hi',
                },
              ],
            },
            metadata: {},
            created_at: new Date().toISOString(),
            checkpoint_id: 'cp-1',
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage(
        'thread-1',
        'question-1',
      );

      expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      const result = await service.fetchWhatsAppMessage(
        'thread-1',
        'question-1',
      );

      expect(result).toBeNull();
    });

    it('returns structured conversation successfully', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'checkpoint-1',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'My wheat leaves are yellow',
                },

                {
                  type: 'ai',
                  tool_calls: [
                    {
                      name: 'search_gdb',
                      args: {
                        crop: 'Wheat',
                      },
                      id: 'tool-1',
                      type: 'function',
                    },
                  ],
                  content: 'Searching database...',
                },

                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',

                  // 👇 THIS MUST MATCH THE SERVICE
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: questionId,
                          },
                        },
                      },
                    },
                  },

                  content: '',
                },

                {
                  type: 'ai',
                  content:
                    'This appears to be nitrogen deficiency. Apply urea as recommended.',
                },

                {
                  type: 'tool',
                  name: 'search_gdb',
                  artifact: {
                    structured_content: {
                      result: {
                        matches: [],
                      },
                    },
                  },
                  content: '',
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread-1', questionId);

      expect(result).not.toBeNull();

      expect(result).toEqual({
        messageId: 'checkpoint-1',
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-01T10:00:00.000Z',
        userDetails: {
          username: 'Farmer',
          email: '<not_specified>',
          emailVerified: false,
          avatar: null,
        },
        content: [
          {
            type: 'human',
            text: 'My wheat leaves are yellow',
          },
          {
            type: 'tool',
            toolName: 'search_gdb',
            toolArgs: {
              crop: 'Wheat',
            },
          },
          {
            type: 'ai',
            text: 'Searching database...',
          },
          {
            type: 'tool',
            toolName: 'upload_question_to_reviewer_system',
            toolResponse: {
              data: {
                data: {
                  _id: questionId,
                },
              },
            },
          },
          {
            type: 'ai',
            text: 'This appears to be nitrogen deficiency. Apply urea as recommended.',
          },
          {
            type: 'tool',
            toolName: 'search_gdb',
            toolResponse: {
              matches: [],
            },
          },
        ],
      });
    });
    it('extracts question id from tool content when artifact is missing', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp-1',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'My crop is sick',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',

                  // No artifact -> JSON.parse branch
                  content: JSON.stringify({
                    data: {
                      data: {
                        _id: questionId,
                      },
                    },
                  }),
                },
                {
                  type: 'ai',
                  content: 'Use fungicide.',
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread-1', questionId);

      expect(result).not.toBeNull();

      expect(result?.content[0]).toEqual({
        type: 'human',
        text: 'My crop is sick',
      });

      expect(result?.content[1]).toEqual({
        type: 'tool',
        toolName: 'upload_question_to_reviewer_system',
        toolResponse: {
          data: {
            data: {
              _id: questionId,
            },
          },
        },
      });

      expect(result?.content[2]).toEqual({
        type: 'ai',
        text: 'Use fungicide.',
      });
    });
    it('handles AI messages whose content is an array', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp-1',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Leaves are yellow',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: questionId,
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
                {
                  type: 'ai',
                  content: [
                    {
                      text: 'Nitrogen',
                    },
                    {
                      text: 'deficiency',
                    },
                    'detected.',
                  ],
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread-1', questionId);

      expect(result).not.toBeNull();

      expect(result?.content).toContainEqual({
        type: 'ai',
        text: 'Nitrogen deficiency detected.',
      });
    });
    it('skips AI messages generated by agri expert', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp-1',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Leaves are yellow',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: questionId,
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
                {
                  type: 'ai',
                  content:
                    'THIS IS AN AGRI EXPERT GENERATED MESSAGE: Use urea.',
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread-1', questionId);

      expect(result).not.toBeNull();

      expect(
        result?.content.find(
          c => c.type === 'ai' && c.text?.startsWith('THIS IS AN AGRI EXPERT'),
        ),
      ).toBeUndefined();
    });
    it('extracts question id from Mongo $oid format', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp-1',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Question',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: {
                              $oid: questionId,
                            },
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread', questionId);

      expect(result).not.toBeNull();
    });
    it('extracts question id from buffer object', async () => {
      const hex = '507f1f77bcf86cd799439011';

      const bytes = [];

      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substring(i, i + 2), 16));
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp-1',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Question',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: {
                              buffer: {
                                data: bytes,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread', hex);

      expect(result).not.toBeNull();
    });
    it('falls back to raw tool content when JSON parsing fails', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Question',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: questionId,
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
                {
                  type: 'tool',
                  name: 'search_gdb',
                  artifact: undefined,
                  content: 'NOT_JSON_AT_ALL',
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread', questionId);

      expect(result).not.toBeNull();

      expect(result?.content).toContainEqual({
        type: 'tool',
        toolName: 'search_gdb',
        toolResponse: 'NOT_JSON_AT_ALL',
      });
    });
    it('uses object tool content directly', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      const toolResponse = {
        answer: 'hello',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Question',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: questionId,
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
                {
                  type: 'tool',
                  name: 'search_gdb',
                  artifact: undefined,
                  content: toolResponse,
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread', questionId);

      expect(result?.content).toContainEqual({
        type: 'tool',
        toolName: 'search_gdb',
        toolResponse,
      });
    });
    it('ignores empty AI array content', async () => {
      const questionId = '507f1f77bcf86cd799439011';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            checkpoint_id: 'cp',
            created_at: '2025-01-01T10:00:00.000Z',
            metadata: {
              user_display_name: 'Farmer',
            },
            values: {
              messages: [
                {
                  type: 'human',
                  content: 'Question',
                },
                {
                  type: 'tool',
                  name: 'upload_question_to_reviewer_system',
                  artifact: {
                    structured_content: {
                      result: {
                        data: {
                          data: {
                            _id: questionId,
                          },
                        },
                      },
                    },
                  },
                  content: '',
                },
                {
                  type: 'ai',
                  content: [],
                },
              ],
            },
          }),
        }),
      );

      const result = await service.fetchWhatsAppMessage('thread', questionId);

      expect(result).not.toBeNull();

      expect(result?.content.find(c => c.type === 'ai')).toBeUndefined();
    });
  });
});
