import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { GLOBAL_TYPES } from '#root/types.js';
import { IDashboardContentRepository } from '#root/shared/database/interfaces/IDashboardContentRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import {
  IDashboardBlock,
  IDashboardContent,
  IDashboardStat,
} from '#root/shared/interfaces/models.js';
import { Analytics } from '../validators/DashboardValidators.js';
import {
  IDashboardContentService,
  PublicDashboardCounts,
  PublicDashboardStats,
} from '../interfaces/IDashboardContentService.js';

/** Raw role keys → the labels shown on the public Human Intelligence Network grid. */
const ROLE_LABELS: Record<string, string> = {
  expert: 'Experts',
  pae_expert: 'PAE Experts',
  moderator: 'Moderators',
  auditor: 'Auditors',
  gate_keeper: 'Gatekeepers',
  district_coordinator: 'District Coordinators',
  block_coordinator: 'Block Coordinators',
  village_volunteer: 'Village Volunteers',
  call_agent: 'Call Agents',
  tester: 'Testers',
};

/** Fallback for an unmapped role key: "some_new_role" → "Some New Roles". */
const prettifyRole = (role: string): string =>
  role
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') + 's';

@injectable()
export class DashboardContentService implements IDashboardContentService {
  constructor(
    @inject(GLOBAL_TYPES.DashboardContentRepository)
    private repo: IDashboardContentRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private userRepo: IUserRepository,
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
  /**
   * The four headline counts — four countDocuments, no aggregation. Cheap enough for the
   * public dashboard to poll every few seconds so the figures track new questions in
   * near-real-time. Each poll hits the DB directly, so it is correct even when Cloud Run
   * has scaled to several instances (no shared in-process state to keep in sync).
   */
  async getPublicDashboardCounts(): Promise<PublicDashboardCounts> {
    const { dayStart, monthStart } = istBoundaries(new Date());

    const [totalQuestions, validatedQAPairs, questionsToday, questionsThisMonth] =
      await Promise.all([
        this.questionRepo.countAllQuestions(),
        this.questionRepo.countValidatedQAPairs(),
        this.questionRepo.countQuestionsCreatedSince(dayStart),
        this.questionRepo.countQuestionsCreatedSince(monthStart),
      ]);

    return { totalQuestions, validatedQAPairs, questionsToday, questionsThisMonth };
  }

  async getPublicDashboardStats(): Promise<PublicDashboardStats> {
    const [counts, { analytics }, roleCounts] = await Promise.all([
      this.getPublicDashboardCounts(),
      this.questionRepo.getQuestionAnalytics(),
      // The Human Intelligence Network headcounts — current active users grouped by role
      // (status not in-active), from the live users collection. Folded into /stats rather
      // than a new endpoint since it is part of the heavy, lazily-refreshed figures.
      this.userRepo.getActiveUserCountByRole(),
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
      ...counts,
      statesCovered: stateData.length,
      cropsCovered: cropData.length,
      domainsCovered: realDomains.length,
      stateData,
      cropData,
      domainData: realDomains,
      // Every role except admin (an internal role, not part of the public network view),
      // with raw role keys mapped to display labels.
      userRoleOverview: roleCounts
        .filter(r => r.role !== 'admin')
        .map(r => ({ role: ROLE_LABELS[r.role] ?? prettifyRole(r.role), count: r.count })),
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
