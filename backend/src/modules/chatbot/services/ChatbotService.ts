import { injectable, inject } from 'inversify';
import { InternalServerError } from 'routing-controllers';
import { CHATBOT_TYPES } from '../types.js';
import type { IChatbotService, DashboardResponse } from '../interfaces/IChatbotService.js';
import type { IChatbotRepository, ChatbotConversationData } from '#root/shared/database/interfaces/IChatbotRepository.js';
import ExcelJS from 'exceljs';

@injectable()
export class ChatbotService implements IChatbotService {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,
  ) {}

  async getDashboard(days = 30, source = 'vicharanashala'): Promise<DashboardResponse> {
    try {
      const [kpi, dau, channelSplit, voiceAccuracy, geo, queryCategories, dailyQueries, todayQueryCount, weeklyQueries, avgSessionDurationMin, weeklySessionDuration] =
        await Promise.all([
          this.chatbotRepository.getKpiSummary(source),
          this.chatbotRepository.getDailyActiveUsers(days, source),
          this.chatbotRepository.getChannelSplit(source),
          this.chatbotRepository.getVoiceAccuracyByLanguage(source),
          this.chatbotRepository.getGeoDistribution(source),
          this.chatbotRepository.getQueryCategories(source),
          this.chatbotRepository.getDailyQueryCounts(days, source),
          this.chatbotRepository.getTodayQueryCount(source),
          this.chatbotRepository.getWeeklyQueryCounts(source),
          // V2: inactivity-gap based session duration replaces the old value from getKpiSummary
          this.chatbotRepository.getAvgSessionDurationV2(source),
          // V2: inactivity-gap based weekly breakdown replaces the old getWeeklyAvgSessionDuration
          this.chatbotRepository.getWeeklyAvgSessionDurationV2(Math.ceil(days / 7), source),
        ]);

      return {
        // Override avgSessionDurationMin in the KPI with the V2 value
        kpi: { ...kpi, dailyQueries: todayQueryCount, avgSessionDurationMin },
        dau,
        channelSplit,
        voiceAccuracy,
        geo,
        queryCategories,
        weeklySessionDuration,
        dailyQueries,
        weeklyQueries,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch dashboard data: ${error}`);
    }
  }

  async getKpiSummary(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getKpiSummary(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(days = 30, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getDailyActiveUsers(days, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily active users: ${error}`);
    }
  }

  async getChannelSplit(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getChannelSplit(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch channel split: ${error}`);
    }
  }

  async getVoiceAccuracyByLanguage(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getVoiceAccuracyByLanguage(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch voice accuracy: ${error}`);
    }
  }

  async getGeoDistribution(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getGeoDistribution(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch geo distribution: ${error}`);
    }
  }

  async getQueryCategories(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getQueryCategories(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch query categories: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(weeks = 52, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDuration(weeks, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly session duration: ${error}`);
    }
  }

  async getDailyQueryCounts(days = 30, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getDailyQueryCounts(days, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily query counts: ${error}`);
    }
  }

  async getTodayQueryCount(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getTodayQueryCount(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch today query count: ${error}`);
    }
  }

  async getDailyUserTrend(days = 30, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getDailyUserTrend(days, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily user trend: ${error}`);
    }
  }

  async getWeeklyQueryCounts(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getWeeklyQueryCounts(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly query counts: ${error}`);
    }
  }

  async getUserDetails(startDate?: string, endDate?: string, page = 1, limit = 10, search = '', source = 'vicharanashala', crop = '', village = '', profileCompleted = 'all') {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      return await this.chatbotRepository.getUserDetails(start, end, page, limit, search, source, crop, village, profileCompleted);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch user details: ${error}`);
    }
  }

  async getAvgSessionDurationV2(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getAvgSessionDurationV2(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch avg session duration v2: ${error}`);
    }
  }

  async getWeeklyAvgSessionDurationV2(weeks = 52, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDurationV2(weeks, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly avg session duration v2: ${error}`);
    }
  }

  async generateChatbotExcelReport(
    startDate: Date,
    endDate: Date,
    source = 'vicharanashala',
  ): Promise<ArrayBuffer | null> {
    try {
      const rows = await this.chatbotRepository.generateChatbotExcelReport(startDate, endDate, source);
      if (!rows || rows.length === 0) return null;

      // ── helpers ─────────────────────────────────────────────────────────────
      const safeJson = (raw: any): any => {
        try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
      };

      const truncate = (text: any, maxLen = 32000): string => {
        if (!text) return '';
        const s = String(text);
        return s.length > maxLen ? s.slice(0, maxLen) + '… [TRUNCATED]' : s;
      };

      const extractLocation = (toolCalls: any[]) => {
        for (const tc of toolCalls) {
          if (tc.name === 'get_location_info_mcp_weather' && tc.output) {
            try {
              const out = JSON.parse(tc.output);
              const locData = JSON.parse(out[0].text);
              const loc = locData?.location ?? {};
              return { state: loc.state ?? '', district: loc.county ?? '', city: loc.city ?? '' };
            } catch { /* skip */ }
          }
        }
        return { state: '', district: '', city: '' };
      };

      const extractUploadDetails = (toolCalls: any[]) => {
        for (const tc of toolCalls) {
          if (tc.name === 'upload_question_to_reviewer_system_mcp_pop') {
            const args = safeJson(tc.args);
            const details = args.details ?? {};
            return {
              question_en: args.question ?? '',
              state: args.state_name ?? '',
              crop: args.crop ?? '',
              district: details.district ?? '',
              season: details.season ?? '',
              domain: details.domain ?? '',
            };
          }
        }
        return { question_en: '', state: '', crop: '', district: '', season: '', domain: '' };
      };

      const extractWeather = (toolCalls: any[]): string => {
        for (const tc of toolCalls) {
          if (tc.name === 'get_weather_forecast_mcp_weather' && tc.output) {
            try {
              const out = JSON.parse(tc.output);
              return String(out[0]?.text ?? '').slice(0, 500);
            } catch { /* skip */ }
          }
        }
        return '';
      };

      // ── styling helpers ──────────────────────────────────────────────────────
      const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
      const HEADER_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      const CELL_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10 };
      const WRAP_ALIGN: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' };
      const CENTER_ALIGN: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const THIN_BORDER: Partial<ExcelJS.Borders> = {
        left: { style: 'thin' }, right: { style: 'thin' },
        top: { style: 'thin' }, bottom: { style: 'thin' },
      };

      const styleHeader = (sheet: ExcelJS.Worksheet) => {
        const row = sheet.getRow(1);
        row.eachCell((cell) => {
          cell.font = HEADER_FONT;
          cell.fill = HEADER_FILL;
          cell.alignment = CENTER_ALIGN;
          cell.border = THIN_BORDER;
        });
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      };

      const autoWidth = (sheet: ExcelJS.Worksheet, max = 60) => {
        sheet.columns.forEach((col) => {
          let best = 12;
          col.eachCell?.({ includeEmpty: false }, (cell) => {
            const lines = String(cell.value ?? '').split('\n');
            const longest = Math.max(...lines.map((l) => l.length));
            best = Math.max(best, Math.min(longest + 2, max));
          });
          col.width = best;
        });
      };

      // ── workbook setup ───────────────────────────────────────────────────────
      const wb = new ExcelJS.Workbook();

      const ws1 = wb.addWorksheet('Conversations');
      ws1.columns = [
        { header: 'S.No', key: 'sno', width: 6 },
        { header: 'Conversation ID', key: 'convId', width: 36 },
        { header: 'User Question (Original)', key: 'userQ', width: 40 },
        { header: 'User Question (English)', key: 'userQEn', width: 40 },
        { header: 'State', key: 'state', width: 16 },
        { header: 'District', key: 'district', width: 16 },
        { header: 'Crop', key: 'crop', width: 16 },
        { header: 'Season', key: 'season', width: 14 },
        { header: 'Domain', key: 'domain', width: 18 },
        { header: 'Location – State', key: 'locState', width: 16 },
        { header: 'Location – District', key: 'locDistrict', width: 16 },
        { header: 'Location – City', key: 'locCity', width: 16 },
        { header: 'Number of Tool Calls', key: 'toolCount', width: 12 },
        { header: 'Tool Names Used', key: 'toolNames', width: 40 },
        { header: 'Number of Think Steps', key: 'thinkCount', width: 12 },
        { header: 'Bot Response (Final Text)', key: 'botResponse', width: 60 },
        { header: 'Weather Forecast Preview', key: 'weather', width: 40 },
      ];

      const ws2 = wb.addWorksheet('Tool Calls');
      ws2.columns = [
        { header: 'S.No', key: 'sno', width: 6 },
        { header: 'Conversation ID', key: 'convId', width: 36 },
        { header: 'User Question (Original)', key: 'userQ', width: 30 },
        { header: 'Tool Call Order', key: 'order', width: 10 },
        { header: 'Tool Name', key: 'name', width: 40 },
        { header: 'Tool Call ID', key: 'id', width: 30 },
        { header: 'Arguments (JSON)', key: 'args', width: 40 },
        { header: 'Progress', key: 'progress', width: 10 },
        { header: 'Output Preview', key: 'output', width: 50 },
      ];

      const ws3 = wb.addWorksheet('Reviewer Data');
      ws3.columns = [
        { header: 'S.No', key: 'sno', width: 6 },
        { header: 'Conversation ID', key: 'convId', width: 36 },
        { header: 'User Question (Original)', key: 'userQ', width: 30 },
        { header: 'Reviewer Question ID', key: 'qId', width: 26 },
        { header: 'Reviewer Question Text', key: 'qText', width: 40 },
        { header: 'Reviewer Answer Text', key: 'aText', width: 50 },
        { header: 'Author', key: 'author', width: 18 },
        { header: 'Similarity Score', key: 'score', width: 14 },
        { header: 'Source 1 Name', key: 's1Name', width: 24 },
        { header: 'Source 1 Link', key: 's1Link', width: 40 },
        { header: 'Source 2 Name', key: 's2Name', width: 24 },
        { header: 'Source 2 Link', key: 's2Link', width: 40 },
      ];

      const ws4 = wb.addWorksheet('FAQ Videos');
      ws4.columns = [
        { header: 'S.No', key: 'sno', width: 6 },
        { header: 'Conversation ID', key: 'convId', width: 36 },
        { header: 'User Question (Original)', key: 'userQ', width: 30 },
        { header: 'FAQ Title', key: 'title', width: 30 },
        { header: 'FAQ Link', key: 'link', width: 40 },
        { header: 'FAQ Query', key: 'query', width: 30 },
        { header: 'FAQ English Answer', key: 'answer', width: 50 },
        { header: 'Similarity Score', key: 'score', width: 14 },
      ];

      const ws5 = wb.addWorksheet('POP Data');
      ws5.columns = [
        { header: 'S.No', key: 'sno', width: 6 },
        { header: 'Conversation ID', key: 'convId', width: 36 },
        { header: 'User Question (Original)', key: 'userQ', width: 30 },
        { header: 'POP Text', key: 'text', width: 50 },
        { header: 'Similarity Score', key: 'score', width: 14 },
        { header: 'Page No', key: 'page', width: 10 },
        { header: 'Source', key: 'source', width: 40 },
        { header: 'Source Name', key: 'sourceName', width: 24 },
        { header: 'Topics', key: 'topics', width: 30 },
      ];

      const ws6 = wb.addWorksheet('Golden Data');
      ws6.columns = [
        { header: 'S.No', key: 'sno', width: 6 },
        { header: 'Conversation ID', key: 'convId', width: 36 },
        { header: 'User Question (Original)', key: 'userQ', width: 30 },
        { header: 'Golden Question Text', key: 'qText', width: 40 },
        { header: 'Golden Answer Text', key: 'aText', width: 50 },
        { header: 'Author', key: 'author', width: 18 },
        { header: 'Similarity Score', key: 'score', width: 14 },
        { header: 'Source Name', key: 'sName', width: 24 },
        { header: 'Source Link', key: 'sLink', width: 40 },
      ];

      let tcRow = 2, revRow = 2, faqRow = 2, popRow = 2, goldRow = 2;

      rows.forEach((item, idx) => {
        const convId = item.conversationId;
        const userQ = item.farmerQuestions.find((t) => t && t.trim().length > 0) ?? '';
        const contentBlocks: any[] = Array.isArray(item.mcpToolCalls) && item.mcpToolCalls.length > 0
          ? (Array.isArray(item.mcpToolCalls[0]) ? item.mcpToolCalls[0] : [])
          : [];

        // classify content blocks
        const toolCallsRaw: any[] = [];
        const thinkTexts: string[] = [];
        const responseTexts: string[] = [];

        for (const block of contentBlocks) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'tool_call' && block.tool_call) {
            toolCallsRaw.push({
              id: block.tool_call.id ?? '',
              name: block.tool_call.name ?? '',
              args: block.tool_call.args ?? '',
              progress: block.tool_call.progress ?? '',
              output: block.tool_call.output ?? '',
            });
          } else if (block.type === 'think') {
            thinkTexts.push(block.think ?? '');
          } else if (block.type === 'text') {
            responseTexts.push(block.text ?? '');
          }
        }

        const uploadInfo = extractUploadDetails(toolCallsRaw);
        const loc = extractLocation(toolCallsRaw);
        const weatherPreview = extractWeather(toolCallsRaw);
        const toolNames = toolCallsRaw.map((tc) => tc.name).join(', ');
        const finalResponse = responseTexts.join('\n\n---\n\n');

        // Sheet 1
        ws1.addRow({
          sno: idx + 1,
          convId,
          userQ: truncate(userQ, 10000),
          userQEn: truncate(uploadInfo.question_en, 10000),
          state: uploadInfo.state,
          district: uploadInfo.district,
          crop: uploadInfo.crop,
          season: uploadInfo.season,
          domain: uploadInfo.domain,
          locState: loc.state,
          locDistrict: loc.district,
          locCity: loc.city,
          toolCount: toolCallsRaw.length,
          toolNames,
          thinkCount: thinkTexts.length,
          botResponse: truncate(finalResponse),
          weather: truncate(weatherPreview, 5000),
        });

        // Sheet 2
        toolCallsRaw.forEach((tc, order) => {
          let outputText = '';
          if (tc.output) {
            try {
              const parsed = JSON.parse(tc.output);
              outputText = Array.isArray(parsed) && parsed.length > 0
                ? (parsed[0].text ?? String(parsed))
                : String(parsed);
            } catch { outputText = String(tc.output); }
          }
          ws2.addRow({
            sno: tcRow - 1,
            convId,
            userQ: truncate(userQ, 2000),
            order: order + 1,
            name: tc.name,
            id: tc.id,
            args: truncate(tc.args, 5000),
            progress: tc.progress,
            output: truncate(outputText, 5000),
          });
          tcRow++;
        });

        // Sheet 3
        toolCallsRaw.forEach((tc) => {
          if (tc.name === 'get_context_from_reviewer_dataset_mcp_reviewer' && tc.output) {
            try {
              const out = JSON.parse(tc.output);
              const results = JSON.parse(out[0].text);
              if (Array.isArray(results)) {
                results.forEach((r: any) => {
                  const sources = r.sources ?? [];
                  ws3.addRow({
                    sno: revRow - 1, convId,
                    userQ: truncate(userQ, 2000),
                    qId: r.question_id ?? '',
                    qText: truncate(r.question_text ?? '', 10000),
                    aText: truncate(r.answer_text ?? ''),
                    author: r.author ?? '',
                    score: r.similarity_score ?? '',
                    s1Name: sources[0]?.source_name ?? sources[0]?.sourceName ?? '',
                    s1Link: sources[0]?.source ?? '',
                    s2Name: sources[1]?.source_name ?? sources[1]?.sourceName ?? '',
                    s2Link: sources[1]?.source ?? '',
                  });
                  revRow++;
                });
              }
            } catch { /* skip */ }
          }
        });

        // Sheet 4
        toolCallsRaw.forEach((tc) => {
          if (tc.name === 'search_faq_mcp_faq-videos' && tc.output) {
            try {
              const out = JSON.parse(tc.output);
              const faqData = JSON.parse(out[0].text);
              const results = faqData.results ?? [];
              results.forEach((r: any) => {
                ws4.addRow({
                  sno: faqRow - 1, convId,
                  userQ: truncate(userQ, 2000),
                  title: r.title ?? '',
                  link: r.link ?? '',
                  query: r.query ?? '',
                  answer: truncate(r.english_answer ?? '', 10000),
                  score: r.similarity_score ?? '',
                });
                faqRow++;
              });
            } catch { /* skip */ }
          }
        });

        // Sheet 5
        toolCallsRaw.forEach((tc) => {
          if (tc.name === 'get_context_from_package_of_practices_mcp_pop' && tc.output) {
            try {
              const out = JSON.parse(tc.output);
              const results = JSON.parse(out[0].text);
              if (Array.isArray(results)) {
                results.forEach((r: any) => {
                  const meta = r.meta_data ?? {};
                  ws5.addRow({
                    sno: popRow - 1, convId,
                    userQ: truncate(userQ, 2000),
                    text: truncate(r.text ?? ''),
                    score: meta.similarity_score ?? '',
                    page: meta.page_no ?? '',
                    source: meta.source ?? '',
                    sourceName: meta.source_name ?? '',
                    topics: Array.isArray(meta.topics) ? meta.topics.join(', ') : '',
                  });
                  popRow++;
                });
              }
            } catch { /* skip */ }
          }
        });

        // Sheet 6
        toolCallsRaw.forEach((tc) => {
          if (tc.name === 'get_context_from_golden_dataset_mcp_golden' && tc.output) {
            try {
              const out = JSON.parse(tc.output);
              const results = JSON.parse(out[0].text ?? '');
              if (Array.isArray(results)) {
                results.forEach((r: any) => {
                  const sources = r.sources ?? [];
                  ws6.addRow({
                    sno: goldRow - 1, convId,
                    userQ: truncate(userQ, 2000),
                    qText: truncate(r.question_text ?? '', 10000),
                    aText: truncate(r.answer_text ?? ''),
                    author: r.author ?? '',
                    score: r.similarity_score ?? '',
                    sName: sources[0]?.source_name ?? sources[0]?.sourceName ?? '',
                    sLink: sources[0]?.source ?? '',
                  });
                  goldRow++;
                });
              }
            } catch { /* skip */ }
          }
        });
      });

      // Style all sheets
      [ws1, ws2, ws3, ws4, ws5, ws6].forEach((ws) => {
        styleHeader(ws);
        ws.eachRow((row, rowNum) => {
          if (rowNum === 1) return;
          row.eachCell((cell) => {
            cell.font = CELL_FONT;
            cell.alignment = WRAP_ALIGN;
            cell.border = THIN_BORDER;
          });
        });
        autoWidth(ws);
      });

      return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
    } catch (error) {
      throw new InternalServerError(`Failed to generate chatbot Excel report: ${error}`);
    }
  }
}
