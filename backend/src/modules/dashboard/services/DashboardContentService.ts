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
    const [validatedQAPairs, { analytics }] = await Promise.all([
      this.questionRepo.countValidatedQAPairs(),
      this.questionRepo.getQuestionAnalytics(),
    ]);

    const { cropData = [], stateData = [], domainData = [] } =
      analytics ?? ({} as Analytics);

    return {
      validatedQAPairs,
      statesCovered: stateData.length,
      cropsCovered: cropData.length,
      domainsCovered: domainData.length,
      stateData,
      cropData,
      domainData,
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
