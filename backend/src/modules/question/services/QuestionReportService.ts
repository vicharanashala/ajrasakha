import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import ExcelJS from 'exceljs';
import {ObjectId} from 'mongodb';
import {BadRequestError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {CHATBOT_TYPES} from '#root/modules/chatbot/types.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IChatbotRepository} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {IDuplicateQuestionRepository} from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import {AiService} from '#root/modules/ai/services/AiService.js';
import {sendEmailWithAttachment} from '#root/utils/mailer.js';
import {IQuestionReportService} from '../interfaces/IQuestionReportService.js';
import {
  formatAnswerSources,
  resolveExpertNames,
  resolveExpertMeta,
} from './helpers/reportHelpers.js';

/**
 * Excel/report generation extracted from QuestionService. QuestionService keeps
 * thin delegating wrappers for each of these so its public interface is unchanged.
 */
@injectable()
export class QuestionReportService
  extends BaseService
  implements IQuestionReportService
{
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.DuplicateQuestionRepository)
    private readonly duplicateQuestionRepository: IDuplicateQuestionRepository,

    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,

    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.Database)
    mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async sendOutReachQuestionsMail(
    startDate: string,
    endDate: string,
    emails: string | string[],
  ): Promise<{success: boolean; message: string}> {
    try {
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate are required');
      }

      const start = new Date(startDate + 'T00:00:00.000Z');
      const end = new Date(endDate + 'T23:59:59.999Z');
      const questions = await this.questionRepo.findByDateRangeAndSource(
        start,
        end,
        'AJRASAKHA',
      );

      // const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(start, end, 'AJRASAKHA');
      const duplicateQuestions =
        await this.duplicateQuestionRepository.findDuplicatesByDateRange(
          start,
          end,
        );
      const combineQuestions = [...questions, ...duplicateQuestions];
      const allQuestions = [
        ...combineQuestions.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      ];

      if (allQuestions.length === 0) {
        return {
          success: true,
          message: 'There are no Outreach questions in the selected time',
        };
      }

      // OLD CSV IMPLEMENTATION
      // const csv = this.convertQuestionsToCSV(allQuestions, startDate, endDate);
      // await sendEmailWithAttachment(
      //   emails,
      //   'Ajrasakha Outreach Questions Report',
      //   `
      //     <p>Hello,</p>
      //     <p>Please find attached the <b>Ajrasakha Outreach Questions</b> report.</p>
      //     <p>Date Range: <b>${startDate}</b> to <b>${endDate}</b></p>
      //     <br />
      //     <p>Regards,<br/>Ajrasakha System</p>
      //   `,
      //   csv,
      //   'out_reach_questions.csv',
      // );

      // NEW EXCEL IMPLEMENTATION
      const excelBuffer = await this.convertQuestionsToExcel(
        allQuestions,
        startDate,
        endDate,
      );

      await sendEmailWithAttachment(
        emails,
        'Ajrasakha Outreach Questions Report',
        `
          <p>Hello,</p>
          <p>Please find attached the <b>Ajrasakha Outreach Questions</b> report.</p>
          <p>Date Range: <b>${startDate}</b> to <b>${endDate}</b></p>
          <br />
          <p>Regards,<br/>Ajrasakha System</p>
        `,
        excelBuffer,
        'out_reach_questions.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      return {
        success: true,
        message: 'Outreach questions report sent via email',
      };
    } catch (error) {
      console.error('Error in sendOutReachQuestionsMail:', error);
      throw error;
    }
  }

  // OLD CSV IMPLEMENTATION
  // private convertQuestionsToCSV(
  //   data: IQuestion[],
  //   startDate?: string,
  //   endDate?: string,
  // ): string {
  //   if (!data.length) return '';

  //   const reportHeader = [
  //     'Out Reach Data Report',
  //     `Date Range: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`,
  //     '', // empty line
  //   ].join('\n');

  //   const headers = [
  //     'Question',
  //     'Status',
  //     'Priority',
  //     // 'Is Auto Allocate',
  //     'Source',
  //     'State',
  //     'District',
  //     'Crop',
  //     'Season',
  //     'Domain',
  //     // 'Total Answers',
  //     // 'AI Initial Answer',
  //     'Text',
  //     // 'Closed At',
  //     'Created At',
  //     // 'Updated At',
  //   ];

  //   const rows = data.map(q => [
  //     this.escape(q.question),
  //     q.status,
  //     q.priority,
  //     // q.isAutoAllocate,
  //     q.source,
  //     q.details?.state,
  //     q.details?.district,
  //     q.details?.crop,
  //     q.details?.season,
  //     q.details?.domain,
  //     // q.totalAnswersCount,
  //     // this.escape(q.aiInitialAnswer),
  //     this.escape(q.text),
  //     // q.closedAt ? this.formatDate(q.closedAt) : '',
  //     q.createdAt ? this.formatDate(q.createdAt) : '',
  //     // q.updatedAt ? this.formatDate(q.updatedAt) : '',
  //   ]);

  //   return [
  //     reportHeader,
  //     headers.join(','),
  //     ...rows.map(r => r.join(',')),
  //   ].join('\n');
  // }

  // NEW EXCEL IMPLEMENTATION
  private async convertQuestionsToExcel(
    data: IQuestion[],
    startDate?: string,
    endDate?: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Outreach Questions');

    // Add title and date range at the top
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Out Reach Data Report';
    titleCell.font = {bold: true, size: 14};
    titleCell.alignment = {horizontal: 'center', vertical: 'middle'};

    sheet.mergeCells('A2:K2');
    const dateRangeCell = sheet.getCell('A2');
    dateRangeCell.value = `Date Range: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
    dateRangeCell.font = {bold: true, size: 11};
    dateRangeCell.alignment = {horizontal: 'center', vertical: 'middle'};

    // Add empty row
    sheet.addRow([]);

    // Manually add header row (row 4)
    const headerRow = sheet.addRow([
      'Question',
      'Status',
      'Priority',
      'Source',
      'State',
      'District',
      'Crop',
      'Season',
      'Domain',
      'Text',
      'Created At',
    ]);

    // Style the header row
    headerRow.font = {bold: true};
    headerRow.alignment = {horizontal: 'center', vertical: 'middle'};
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {argb: 'FFD3D3D3'},
    };

    // Set column widths
    sheet.getColumn(1).width = 50; // Question
    sheet.getColumn(2).width = 15; // Status
    sheet.getColumn(3).width = 15; // Priority
    sheet.getColumn(4).width = 15; // Source
    sheet.getColumn(5).width = 20; // State
    sheet.getColumn(6).width = 20; // District
    sheet.getColumn(7).width = 20; // Crop
    sheet.getColumn(8).width = 15; // Season
    sheet.getColumn(9).width = 25; // Domain
    sheet.getColumn(10).width = 50; // Text
    sheet.getColumn(11).width = 22; // Created At

    // Add data rows
    data.forEach(q => {
      const row = sheet.addRow([
        q.question || '',
        q.status || '',
        q.priority || '',
        q.source || '',
        q.details?.state || '',
        q.details?.district || '',
        q.details?.crop || '',
        q.details?.season || '',
        q.details?.domain || '',
        q.text || '',
        q.createdAt ? this.formatDate(q.createdAt) : '',
      ]);

      // Enable text wrapping for long content
      row.getCell(1).alignment = {wrapText: true, vertical: 'top'}; // Question
      row.getCell(10).alignment = {wrapText: true, vertical: 'top'}; // Text
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private formatDate(date: Date | string): string {
    return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
  }
  private escape(value: any): string {
    if (value === null || value === undefined) return '';
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  async generateQuestionReport(
    consecutiveApprovals?: number,
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ) {
    const result = await this.answerRepo.groupbyquestion(
      consecutiveApprovals,
      startDate,
      endDate,
      isTrainingUser,
      isAdmin,
    );

    // Check if there's any data with reasons
    const hasData = result.reasons.some(item => {
      const modList = (item.reasonForModification || []).filter(Boolean);
      const rejList = (item.reasonForRejection || []).filter(Boolean);
      return modList.length > 0 || rejList.length > 0;
    });

    // Return null if no data found
    if (!hasData) {
      return null;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Question Reasons');

    sheet.columns = [
      {header: 'Created At', key: 'createdAt', width: 22},
      {header: 'Question', key: 'question', width: 50},
      {header: 'Reason For Modification', key: 'mod', width: 50},
      {header: 'Reason For Rejection', key: 'rej', width: 50},
    ];

    let rowCount = 0;
    result.reasons.forEach(item => {
      const modList = (item.reasonForModification || []).filter(Boolean);
      const rejList = (item.reasonForRejection || []).filter(Boolean);

      if (!modList.length && !rejList.length) return;

      const row = sheet.addRow({
        createdAt: item.createdAt,
        question: item.question,
        mod: modList.map((r, i) => `${i + 1}) ${r}`).join('\n'),
        rej: rejList.map((r, i) => `${i + 1}) ${r}`).join('\n'),
      });

      row.getCell('mod').alignment = {wrapText: true};
      row.getCell('rej').alignment = {wrapText: true};
      rowCount++;
    });

    const data = await workbook.xlsx.writeBuffer();
    return data;
  }

  /**
   * TAT (turnaround-time) lifecycle report → Excel buffer.
   *
   * One row per question created in [startDate, endDate]: the author, each reviewer and
   * the moderator, with the time each took, plus the question's total lifecycle time.
   * Ports scripts/timebound-question-cycle-report.js. Timings come from the submission
   * history work-log; timestamps are written in IST. Returns null when nothing matched.
   */
  async generateTatReport(
    startDate: Date,
    endDate: Date,
    opts: {
      sources?: string[];
      statuses?: string[];
      maxReviewers?: number;
    } = {},
  ): Promise<ArrayBuffer | null> {
    const {sources, statuses, maxReviewers: maxReviewersArg = 0} = opts;

    const CLOSED_STATUSES = ['closed', 'dynamic_closed', 'duplicate_closed'];
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

    const asDate = (v: any): Date | null => (v ? new Date(v) : null);
    // Excel cells carry no timezone, so shift the instant by +5:30 and the cell reads IST.
    const asIST = (v: any): Date | null => {
      const d = asDate(v);
      return d && !Number.isNaN(d.getTime())
        ? new Date(d.getTime() + IST_OFFSET_MS)
        : null;
    };
    const istLabel = (d: Date): string =>
      `${new Date(d.getTime() + IST_OFFSET_MS)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')} IST`;
    const hoursBetween = (start: any, end: any): number | null => {
      const a = asDate(start);
      const b = asDate(end);
      if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()))
        return null;
      return (b.getTime() - a.getTime()) / 36e5;
    };
    const humanDuration = (hours: number | null): string => {
      if (hours === null) return '';
      const totalMin = Math.round(hours * 60);
      const d = Math.floor(totalMin / 1440);
      const h = Math.floor((totalMin % 1440) / 60);
      const m = totalMin % 60;
      return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
    };
    const initialStatus = (q: any): string => {
      if (q.referenceQuestionId) return 'Duplicate';
      if (q.tag === 'static_dynamic') return 'Static Dynamic';
      if (q.tag === 'dynamic') return 'Dynamic';
      return 'Unique';
    };
    const idStr = (v: any): string => (v ? v.toString() : '');
    const reviewAction = (entry: any): string => {
      if (entry.approvedAnswer) return 'approved';
      if (entry.modifiedAnswer) return 'modified';
      if (entry.rejectedAnswer) return 'rejected';
      return entry.status ?? '';
    };

    const docs = await this.questionRepo.findQuestionsForTatReport(
      startDate,
      endDate,
      sources,
      statuses,
    );
    if (!docs.length) return null;

    const qIds = docs
      .map(q => idStr(q._id))
      .filter((id): id is string => Boolean(id));
    const subs = await this.questionSubmissionRepo.getByQuestionIds(qIds);
    const subByQ = new Map(subs.map(s => [idStr(s.questionId), s]));

    // Resolve every referenced user (author/reviewers from history, plus moderatorId).
    const userIds = new Set<string>();
    const collect = (v: any) => {
      const s = idStr(v);
      if (s) userIds.add(s);
    };
    for (const q of docs) {
      collect(q.userId);
      collect((q as any).moderatorId);
      collect((q as any).gateKeeperId);
      collect((q as any).auditorId);
      const s = subByQ.get(idStr(q._id)) as any;
      if (s) {
        collect(s.lastRespondedBy);
        (s.queue ?? []).forEach(collect);
        (s.history ?? []).forEach((h: any) => collect(h.updatedBy));
      }
    }
    const users = userIds.size
      ? await this.userRepo.getUsersByIds([...userIds])
      : [];
    const userById = new Map(users.map(u => [idStr(u._id), u]));
    const nameOf = (v: any): string => {
      const u = userById.get(idStr(v)) as any;
      if (!u) return '';
      return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '';
    };

    // The submission history IS the work log: entry [0] is the author, [1..] the reviewers.
    const perQuestion = docs.map(q => {
      const history = ((subByQ.get(idStr(q._id)) as any)?.history ?? []) as any[];
      return {authorEntry: history[0] ?? null, chain: history.slice(1)};
    });

    const observedMax = Math.max(3, ...perQuestion.map(p => p.chain.length));
    const maxReviewers =
      maxReviewersArg > 0 ? Math.min(maxReviewersArg, observedMax) : observedMax;

    const totals: number[] = [];
    const authorTimes: number[] = [];
    const reviewerTimes: number[] = [];
    const moderatorTimes: number[] = [];
    const handlingTimes: number[] = [];

    const rows = perQuestion.map(({authorEntry, chain}, i) => {
      const q = docs[i] as any;

      // Author: firstAllocationAt → author's history entry createdAt (submit time).
      const authorStart = q.firstAllocationAt ?? null;
      const authorEnd = authorEntry?.createdAt ?? null;
      const authorHours = hoursBetween(authorStart, authorEnd);

      // Reviewers: each reviewer's own history entry createdAt → updatedAt.
      const reviewerBlock: Record<string, any> = {};
      for (let n = 0; n < maxReviewers; n++) {
        const r = chain[n];
        const h = r ? hoursBetween(r.createdAt, r.updatedAt) : null;
        const label = `Reviewer ${n + 1}`;
        reviewerBlock[label] = r ? nameOf(r.updatedBy) : '';
        reviewerBlock[`${label} Action`] = r ? reviewAction(r) : '';
        reviewerBlock[`${label} Assigned At (IST)`] = asIST(r?.createdAt);
        reviewerBlock[`${label} Completed At (IST)`] = asIST(r?.updatedAt);
        reviewerBlock[`${label} Time`] = humanDuration(h);
      }

      // Moderator: assigned → question closed.
      const modStart = q.moderatorAssignedAt ?? null;
      const closedAt = q.closedAt ?? null;
      const modHours = hoursBetween(modStart, closedAt);

      const totalHours = hoursBetween(q.createdAt, closedAt);
      totals.push(totalHours as any);

      // Hands-on time: author + every reviewer + moderator (minus idle gaps).
      const handledParts = [
        authorHours,
        ...chain.map(r => hoursBetween(r.createdAt, r.updatedAt)),
        modHours,
      ].filter((h): h is number => h !== null);
      const handledHours = handledParts.length
        ? handledParts.reduce((a, b) => a + b, 0)
        : null;

      if (authorHours !== null) authorTimes.push(authorHours);
      if (modHours !== null) moderatorTimes.push(modHours);
      if (handledHours !== null) handlingTimes.push(handledHours);
      chain.forEach(r => {
        const h = hoursBetween(r.createdAt, r.updatedAt);
        if (h !== null) reviewerTimes.push(h);
      });

      return {
        'Question ID': idStr(q._id),
        Question: q.question ?? '',
        Source: q.source ?? '',
        'Initial Status': initialStatus(q),
        Status: q.status ?? '',
        'Created At (IST)': asIST(q.createdAt),
        'Closed At (IST)': asIST(closedAt),

        'Answer Author': nameOf(authorEntry?.updatedBy),
        'Author Assigned At (IST)': asIST(authorStart),
        'Author Completed At (IST)': asIST(authorEnd),
        'Author Time': humanDuration(authorHours),

        ...reviewerBlock,

        Moderator: nameOf(q.moderatorId),
        'Moderator Assigned At (IST)': asIST(modStart),
        'Moderator Completed At (IST)': asIST(closedAt),
        'Moderator Time': humanDuration(modHours),

        'Total Time Taken': humanDuration(totalHours),
        'Author + Reviewers + Moderator Time': humanDuration(handledHours),
      } as Record<string, any>;
    });

    /* ─── workbook ─── */
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Question Lifecycle');

    const headers = Object.keys(rows[0]);
    ws.columns = headers.map(h => ({
      key: h,
      width: /Question$/.test(h)
        ? 60
        : /At \(IST\)$/.test(h)
          ? 22
          : Math.min(Math.max(h.length + 4, 12), 28),
    }));

    const mean = (xs: number[]): number | null =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

    // Averages block above the table.
    const titleRow = ws.addRow([
      `AVERAGE TIME TAKEN — ${rows.length} question(s), ${istLabel(startDate).slice(
        0,
        10,
      )} → ${istLabel(endDate).slice(0, 10)} IST`,
    ]);
    titleRow.font = {bold: true, size: 12};

    const avgLabelRow = ws.addRow([
      'Author',
      'Reviewer (per review)',
      'Moderator',
      'Author + Reviewers + Moderator',
      'Total Time Taken (created→closed)',
    ]);
    avgLabelRow.font = {bold: true};
    avgLabelRow.eachCell(c => {
      c.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFF3E7D3'}};
    });
    const avgValueRow = ws.addRow([
      humanDuration(mean(authorTimes)),
      humanDuration(mean(reviewerTimes)),
      humanDuration(mean(moderatorTimes)),
      humanDuration(mean(handlingTimes)),
      humanDuration(mean(totals.filter(t => t !== null))),
    ]);
    avgValueRow.eachCell(c => {
      c.alignment = {horizontal: 'left'};
      c.numFmt = '@';
    });

    ws.addRow([]); // spacer

    const headerRow = ws.addRow(headers);
    headerRow.font = {bold: true};
    headerRow.eachCell(c => {
      c.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFE4F6EA'}};
    });
    const HEADER_ROW = headerRow.number;

    rows.forEach(r => ws.addRow(r));

    ws.views = [{state: 'frozen', ySplit: HEADER_ROW}];
    ws.autoFilter = {
      from: {row: HEADER_ROW, column: 1},
      to: {row: HEADER_ROW, column: headers.length},
    };

    // Scope date formats to the data rows only (not the averages text block above).
    headers.forEach((h, i) => {
      if (!/At \(IST\)$/.test(h)) return;
      for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
        ws.getRow(r).getCell(i + 1).numFmt = 'yyyy-mm-dd hh:mm';
      }
    });

    return workbook.xlsx.writeBuffer();
  }

  async generateOverallQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null> {
    return this._withTransaction(async session => {
      // Get monthly statistics from the repository
      const stats = await this.questionRepo.getMonthlyQuestionStats(
        startDate,
        endDate,
        isTrainingUser,
        isAdmin,
        session,
      );

      // Check if there's any data
      if (!stats || stats.length === 0) {
        return null;
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Overall Questions Report');

      // Define columns matching the template
      sheet.columns = [
        {header: 'Year', key: 'year', width: 12},
        {header: 'Month', key: 'month', width: 15},
        {header: 'Total No. of Q', key: 'totalQuestions', width: 18},
        {header: 'Modified Answ', key: 'modifiedAnswers', width: 18},
        {header: 'Rejected Answ', key: 'rejectedAnswers', width: 18},
        {header: 'Total (Modified + Rejected)', key: 'total', width: 28},
      ];

      // Add data rows
      stats.forEach(stat => {
        sheet.addRow({
          year: stat.year,
          month: stat.month,
          totalQuestions: stat.totalQuestions,
          modifiedAnswers: stat.modifiedAnswers,
          rejectedAnswers: stat.rejectedAnswers,
          total: stat.modifiedAnswers + stat.rejectedAnswers,
        });
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = {bold: true};
      headerRow.alignment = {horizontal: 'center', vertical: 'middle'};

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

  async generateStateCropQuestionReport(filters: {
    state?: string;
    crop?: string;
    normalised_crop?: string;
    season?: string;
    domain?: string;
    status?: string;
    source?: string;
    hiddenQuestions?: string;
    duplicateQuestions?: string;
    startDate?: string;
    endDate?: string;
    /** All Users to filter questions by. */
    allUsers?: string;
  }): Promise<ArrayBuffer | null> {
    return this._withTransaction(async session => {
      // Build filter query
      const query: any = {};
      if (filters.state && filters.state !== 'all') {
        query['details.state'] = filters.state;
      }
      if (filters.crop && filters.crop !== 'all') {
        query['details.crop'] = filters.crop;
      }
      if (filters.normalised_crop && filters.normalised_crop !== 'all') {
        // Handle comma-separated multiple crops
        const crops = filters.normalised_crop
          .split(',')
          .map(c => c.trim())
          .filter(c => c);
        if (crops.length === 0) {
          // No valid crops, skip filter
        } else if (crops.length === 1) {
          // Single crop - use regex match
          if (crops[0] === '__NOT_SET__') {
            query.$or = [
              {'details.normalised_crop': {$exists: false}},
              {'details.normalised_crop': null},
              {'details.normalised_crop': ''},
            ];
          } else {
            query['details.normalised_crop'] = {
              $regex: `^${crops[0]}$`,
              $options: 'i',
            };
          }
        } else {
          // Multiple crops - use $in with regex for each
          query['details.normalised_crop'] = {
            $in: crops.map(crop => new RegExp(`^${crop}$`, 'i')),
          };
        }
      }
      if (filters.season && filters.season !== 'all') {
        query['details.season'] = filters.season;
      }
      if (filters.domain && filters.domain !== 'all') {
        query['details.domain'] = filters.domain;
      }
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'pae_closed') {
          query.status = 'closed';
          query.pae_review = true;
        } else if (filters.status === 'all-closed') {
          query.status = {
            $in: ['closed', 'duplicate_closed', 'dynamic_closed'],
          };
        } else {
          query.status = filters.status;
        }
      }
      if (filters.source && filters.source !== 'all') {
        query.source = filters.source;
      }
      if (filters.hiddenQuestions === 'true') {
        query.isHidden = {$eq: true};
      }
      if (filters.startDate || filters.endDate) {
        // For closed statuses, filter using closedAt.
        // Date boundaries are based on IST:
        // 00:00 IST = previous day 18:30 UTC
        const isClosedStatus =
          filters.status === 'closed' ||
          filters.status === 'pae_closed' ||
          filters.status === 'dynamic_closed' ||
          filters.status === 'duplicate_closed' ||
          filters.status === 'all-closed';

        const dateField = isClosedStatus ? 'closedAt' : 'createdAt';

        query[dateField] = {};

        if (filters.startDate) {
          const [year, month, day] = filters.startDate.split('-').map(Number);

          const startUTC = new Date(
            Date.UTC(year, month - 1, day, 0, 0, 0, 0) -
              (5 * 60 + 30) * 60 * 1000,
          );

          query[dateField].$gte = startUTC;
        }

        if (filters.endDate) {
          const [year, month, day] = filters.endDate.split('-').map(Number);

          const endUTC = new Date(
            Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) -
              (5 * 60 + 30) * 60 * 1000,
          );

          query[dateField].$lt = endUTC;
        }
      }

      // Check if this is a closed status report - if so, limit to 50 questions
      const isClosedStatus =
        filters.status === 'closed' ||
        filters.status === 'pae_closed' ||
        filters.status === 'dynamic_closed' ||
        filters.status === 'duplicate_closed' ||
        filters.status === 'all-closed';
      // `allUsers` is a comma-separated list of user (approvedBy) ids.
      const allUserIds =
        filters.allUsers && filters.allUsers !== 'all'
          ? filters.allUsers
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : [];
      const filterByAllUsers = allUserIds.length > 0;
      // Answer / Sources / All Users details only exist on a closed question's final
      // answer, so they are included for closed reports or when filtering by all users.
      const includeAnswerDetails = isClosedStatus || filterByAllUsers;
      const questionLimit = includeAnswerDetails ? 50 : undefined;

      // All Users filter (= final answer's approvedBy): restrict to the closed questions
      // those users approved. Final answers only exist for closed questions, so this
      // also scopes the report to closed questions.
      if (filterByAllUsers) {
        const approvedQuestionIds =
          await this.answerRepo.getFinalAnswerQuestionIdsByApprover(
            allUserIds,
            session,
          );
        if (!approvedQuestionIds.length) {
          console.log('No closed questions approved by the selected user(s)');
          return null;
        }
        query._id = {
          $in: approvedQuestionIds.map((id: string) => new ObjectId(id)),
        };
      }

      // Get questions from repository
      const questions = await this.questionRepo.getQuestionsByFilters(
        query,
        session,
        filters.duplicateQuestions === 'true',
        questionLimit,
      );

      if (!questions || questions.length === 0) {
        console.log('No questions found for given filters');
        return null;
      }

      // Fetch question submissions to get experts from history
      const questionIds = questions.map(q => q._id.toString());
      const submissions = await this.questionSubmissionRepo.getByQuestionIds(questionIds, session);

      // Extract all unique expert IDs from history
      const allExpertIds = new Set<string>();
      let maxHistoryLength = 0;
      for (const sub of submissions) {
        const historyLength = sub.history?.length || 0;
        if (historyLength > maxHistoryLength) {
          maxHistoryLength = historyLength;
        }
        for (const historyEntry of sub.history || []) {
          const expertId = historyEntry.updatedBy?.toString();
          if (expertId) {
            allExpertIds.add(expertId);
          }
        }
      }

      // Fetch user details for all experts
      const expertMeta = await resolveExpertMeta(this.userRepo, [...allExpertIds]);

      // Build experts map for each question: questionId -> array of expert names by level
      const questionExpertsByLevel = new Map<string, (string | null)[]>();
      for (const sub of submissions) {
        const qId = sub.questionId.toString();
        const expertsByLevel: (string | null)[] = [];
        for (let level = 0; level < maxHistoryLength; level++) {
          const historyEntry = sub.history?.[level];
          const expertId = historyEntry?.updatedBy?.toString();
          if (expertId) {
            const meta = expertMeta.get(expertId);
            expertsByLevel.push(meta?.name || expertId);
          } else {
            expertsByLevel.push(null);
          }
        }
        questionExpertsByLevel.set(qId, expertsByLevel);
      }

      // For closed questions, fetch the final answer (text + sources + approving moderator).
      const questionAnswers = new Map<string, string>();
      const questionSources = new Map<string, string>();
      const questionModerator = new Map<string, string>();
      if (includeAnswerDetails) {
        const answers = await this.answerRepo.getFinalAnswersByQuestionIds(
          questionIds,
          session,
        );

        // Resolve approving-moderator ids → display names in one batch.
        const approverIds = [
          ...new Set(
            answers
              .map(a => a.approvedBy?.toString())
              .filter(Boolean) as string[],
          ),
        ];
        const moderatorNames = await resolveExpertNames(this.userRepo, approverIds);

        answers.forEach(answer => {
          if (!answer.questionId) return;
          const qId = answer.questionId.toString();
          questionAnswers.set(qId, answer.answer ?? '');
          questionSources.set(qId, formatAnswerSources(answer.sources));
          const approverId = answer.approvedBy?.toString();
          if (approverId)
            questionModerator.set(qId, moderatorNames.get(approverId) ?? '');
        });
      }

      // Mongo stores UTC; the team reads IST (UTC+5:30). Excel date cells carry no
      // timezone, so shift the instant by +5:30 and the cell reads as IST.
      const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
      const asIST = (v: any): Date | null => {
        const d = v ? new Date(v) : null;
        return d && !Number.isNaN(d.getTime())
          ? new Date(d.getTime() + IST_OFFSET_MS)
          : null;
      };
      // Include a Closed At column whenever any question actually has a closedAt
      // (not only for closed-status reports).
      const hasClosedAt = questions.some(q => !!q.closedAt);

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Questions');

      // Define columns - add Answer column for closed status
      const columns: {header: string; key: string; width: number}[] = [
        {header: 'Question ID', key: 'questionId', width: 26},
        {header: 'Created At (IST)', key: 'createdAt', width: 22},
        {header: 'Question', key: 'question', width: 60},
        {header: 'State', key: 'state', width: 20},
        {header: 'District', key: 'district', width: 20},
        {header: 'Crop', key: 'crop', width: 20},
        {header: 'Season', key: 'season', width: 20},
        {header: 'Domain', key: 'domain', width: 25},
        {header: 'Status', key: 'status', width: 15},
        {header: 'Priority', key: 'priority', width: 15},
        {header: 'Source', key: 'source', width: 15},
      ];

      // Add Author and Level columns based on max history length
      for (let level = 0; level < maxHistoryLength; level++) {
        const header = level === 0 ? 'Author' : `Level ${level}`;
        columns.push({header, key: `expert_${level}`, width: 25});
      }

      if (isClosedStatus || hasClosedAt) {
        columns.push({
          header: 'Closed At (IST)',
          key: 'closedAt',
          width: 22,
        });
      }

      // Add Answer / Sources / Moderator columns for closed questions.
      if (includeAnswerDetails) {
        columns.push({header: 'Answer', key: 'answer', width: 80});
        columns.push({header: 'Sources', key: 'sources', width: 50});
        columns.push({header: 'AllUsers', key: 'allUsers', width: 25});
      }

      sheet.columns = columns;
      // IST-formatted date cells (the values are already shifted +5:30 above).
      sheet.getColumn('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
      if (isClosedStatus || hasClosedAt) {
        sheet.getColumn('closedAt').numFmt = 'yyyy-mm-dd hh:mm';
      }
      if (includeAnswerDetails) {
        sheet.getColumn('sources').alignment = {
          wrapText: true,
          vertical: 'top',
        };
      }

      // Add data rows
      questions.forEach(q => {
        const qId = q._id.toString();
        const rowData: any = {
          questionId: qId,
          createdAt: asIST(q.createdAt),
          question: q.question,
          state: q.details?.state,
          district: q.details?.district,
          crop: q.details?.crop,
          season: q.details?.season,
          domain: q.details?.domain,
          status: q.status,
          priority: q.priority,
          source: q.source,
        };

        // Add expert columns for each level
        const expertsByLevel = questionExpertsByLevel.get(qId) || [];
        for (let level = 0; level < maxHistoryLength; level++) {
          rowData[`expert_${level}`] = expertsByLevel[level] || '';
        }

        if (isClosedStatus || hasClosedAt) {
          rowData.closedAt = asIST(q.closedAt);
        }

        // Add answer / sources / moderator for closed questions.
        if (includeAnswerDetails) {
          rowData.answer = questionAnswers.get(qId) || '';
          rowData.sources = questionSources.get(qId) || '';
          rowData.allUsers = questionModerator.get(qId) || '';
        }

        sheet.addRow(rowData);
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = {bold: true};
      headerRow.alignment = {horizontal: 'center', vertical: 'middle'};

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

  async generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null> {
    return this._withTransaction(async session => {
      if (!startDate || !endDate) {
        throw new BadRequestError('startDate and endDate are required');
      }

      // Fetch duplicates using the repository
      // const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(startDate, endDate, 'AJRASAKHA', session);
      const duplicateQuestions =
        await this.duplicateQuestionRepository.findDuplicatesByDateRange(
          startDate,
          endDate,
          isTrainingUser,
          isAdmin,
          session,
        );

      if (!duplicateQuestions || duplicateQuestions.length === 0) {
        return null;
      }

      // Fetch reference question details for metadata
      // Use a Map to avoid duplicate fetches for the same reference question
      const refDetailsMap = new Map<
        string,
        {
          state: string;
          district: string;
          crop: string | import('#root/shared/interfaces/models.js').ICropRef;
          season: string;
          domain: string[];
        } | null
      >();

      for (const q of duplicateQuestions) {
        const refId = q.referenceQuestionId?.toString();
        if (refId && !refDetailsMap.has(refId)) {
          try {
            const refQuestion = await this.questionRepo.getById(refId, session);
            refDetailsMap.set(refId, refQuestion?.details || null);
          } catch {
            refDetailsMap.set(refId, null);
          }
        }
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Similar Questions');

      // Define columns with metadata for both question and reference question
      sheet.columns = [
        {header: 'createdAt', key: 'createdAt', width: 22},
        {header: 'question', key: 'question', width: 60},
        {header: 'q_state', key: 'q_state', width: 18},
        {header: 'q_district', key: 'q_district', width: 20},
        {header: 'q_crop', key: 'q_crop', width: 18},
        {header: 'q_season', key: 'q_season', width: 18},
        {header: 'q_domain', key: 'q_domain', width: 22},
        {header: 'source', key: 'source', width: 15},
        {header: 'similarityScore', key: 'similarityScore', width: 18},
        {header: 'referenceQuestion', key: 'referenceQuestion', width: 60},
        {header: 'referenceSource', key: 'referenceSource', width: 20},
        {header: 'ref_state', key: 'ref_state', width: 18},
        {header: 'ref_district', key: 'ref_district', width: 20},
        {header: 'ref_crop', key: 'ref_crop', width: 18},
        {header: 'ref_season', key: 'ref_season', width: 18},
        {header: 'ref_domain', key: 'ref_domain', width: 22},
      ];

      // Add data rows
      duplicateQuestions.forEach(q => {
        const refId = q.referenceQuestionId?.toString();
        const refDetails = refId ? refDetailsMap.get(refId) : null;

        sheet.addRow({
          createdAt: q.createdAt,
          question: q.question,
          q_state: q.details?.state || '',
          q_district: q.details?.district || '',
          q_crop: q.details?.crop || '',
          q_season: q.details?.season || '',
          q_domain: q.details?.domain || '',
          source: q.source,
          similarityScore: q.similarityScore,
          referenceQuestion: q.referenceQuestion ? q.referenceQuestion : '',
          referenceSource: q.referenceSource || '',
          ref_state: refDetails?.state || '',
          ref_district: refDetails?.district || '',
          ref_crop: refDetails?.crop || '',
          ref_season: refDetails?.season || '',
          ref_domain: refDetails?.domain || '',
        });
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = {bold: true};
      headerRow.alignment = {horizontal: 'center', vertical: 'middle'};

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }
}
