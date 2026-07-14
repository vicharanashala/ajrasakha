import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { GLOBAL_TYPES } from '#root/types.js';
import { IDashboardContentRepository } from '#root/shared/database/interfaces/IDashboardContentRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import {
  IDashboardBlock,
  IDashboardContent,
  IDashboardStat,
} from '#root/shared/interfaces/models.js';
import { Analytics } from '../validators/DashboardValidators.js';
import {
  IDashboardContentService,
  PublicDashboardStats,
} from '../interfaces/IDashboardContentService.js';

@injectable()
export class DashboardContentService implements IDashboardContentService {
  constructor(
    @inject(GLOBAL_TYPES.DashboardContentRepository)
    private repo: IDashboardContentRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private questionRepo: IQuestionRepository,
  ) {}

  async getContent(): Promise<IDashboardContent> {
    const doc = await this.repo.get();
    return doc ?? { key: 'public_dashboard', blocks: [], stats: [] };
  }

  /**
   * Live figures for the public dashboard — no auth, no filters.
   *
   * Combines the total validated Question–Answer pairs (questions in a closed state:
   * closed / dynamic_closed / duplicate_closed) with the same analytics the
   * `/performance/questions-analytics` endpoint produces, MINUS `tableData` (a heavy
   * state×crop×source pivot the public page doesn't need). What's left — stateData,
   * cropData, domainData — is exactly "states / crops / domains covered".
   */
  async getPublicDashboardStats(): Promise<PublicDashboardStats> {
    const { dayStart, monthStart } = istBoundaries(new Date());

    const [
      totalQuestions,
      validatedQAPairs,
      questionsToday,
      questionsThisMonth,
      { analytics },
    ] = await Promise.all([
      this.questionRepo.countAllQuestions(),
      this.questionRepo.countValidatedQAPairs(),
      this.questionRepo.countQuestionsCreatedSince(dayStart),
      this.questionRepo.countQuestionsCreatedSince(monthStart),
      this.questionRepo.getQuestionAnalytics(),
    ]);

    const { cropData = [], stateData = [], domainData = [] } =
      analytics ?? ({} as Analytics);

    // A bulk update on 2026-06-05 wrote the literal string '$details.domain' into
    // details.domain on ~5.9k questions (a plain $set does not dereference a field path).
    // Those rows carry no real domain, so they are excluded here rather than published on
    // a public page. The internal analytics endpoint still reports them, so the corruption
    // stays visible to the team until the data is restored.
    const realDomains = domainData.filter(d => !d.name?.startsWith('$'));

    return {
      totalQuestions,
      validatedQAPairs,
      questionsToday,
      questionsThisMonth,
      statesCovered: stateData.length,
      cropsCovered: cropData.length,
      domainsCovered: realDomains.length,
      stateData,
      cropData,
      domainData: realDomains,
    };
  }

  async updateContent(
    blocks: IDashboardBlock[],
    stats: IDashboardStat[],
    userId: string,
  ): Promise<IDashboardContent> {
    // Normalise: trim, drop empty blocks, ensure ids, re-sequence order, sanitise figures.
    const cleanedBlocks: IDashboardBlock[] = (blocks ?? [])
      .map((b, i) => ({
        id: b.id?.trim() || randomUUID(),
        heading: (b.heading ?? '').trim(),
        body: (b.body ?? '').trim(),
        figures: (b.figures ?? [])
          .map(f => ({ label: (f.label ?? '').trim(), value: (f.value ?? '').trim() }))
          .filter(f => f.label || f.value),
        order: i,
      }))
      .filter(b => b.heading || b.body || b.figures.length > 0);

    // Headline figures (e.g. "Total Agricultural Questions Processed"). A stat needs at
    // least a label to be meaningful; the value stays free text so admins can enter
    // either a raw number (animated) or a formatted string like "18.6M".
    const cleanedStats: IDashboardStat[] = (stats ?? [])
      .map((s, i) => ({
        id: s.id?.trim() || randomUUID(),
        label: (s.label ?? '').trim(),
        value: (s.value ?? '').toString().trim(),
        order: i,
      }))
      .filter(s => s.label);

    return this.repo.save(cleanedBlocks, cleanedStats, userId ?? null);
  }
}

/** IST is UTC+05:30 — the day a farmer's question belongs to is the Indian day, not the UTC one. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Start of "today" and start of "this month" in IST, expressed as UTC instants (which is
 * what Mongo stores). Shifting into IST, truncating there, then shifting back keeps the
 * boundaries correct regardless of the server's own timezone.
 */
function istBoundaries(now: Date): { dayStart: Date; monthStart: Date } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);

  const dayStartIst = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
  );
  const monthStartIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1);

  return {
    dayStart: new Date(dayStartIst - IST_OFFSET_MS),
    monthStart: new Date(monthStartIst - IST_OFFSET_MS),
  };
}
