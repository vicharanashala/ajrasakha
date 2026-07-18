import {
  IDashboardBlock,
  IDashboardContent,
  IDashboardStat,
} from '#root/shared/interfaces/models.js';
import { Analytics } from '../validators/DashboardValidators.js';

/**
 * The cheap, poll-friendly counts — four countDocuments, no aggregation. The public
 * dashboard polls this every few seconds so the headline figures track the questions
 * collection in near-real-time, without re-running the heavy analytics pipeline.
 */
export interface PublicDashboardCounts {
  /** Every question in the collection, any status — total questions processed. */
  totalQuestions: number;
  /** Questions in a closed state: closed + dynamic_closed + duplicate_closed. */
  validatedQAPairs: number;
  /** Questions that entered the DB since midnight IST (any status). */
  questionsToday: number;
  /** Questions that entered the DB since the 1st of the month, IST (any status). */
  questionsThisMonth: number;
}

/**
 * Public dashboard figures: the counts plus the coverage breakdowns (states / crops /
 * domains) — i.e. the questions-analytics payload without `tableData`. This is the heavy
 * call; the coverage breakdowns are refreshed lazily, while the counts above are polled
 * separately via getPublicDashboardCounts().
 */
/** One role and how many users currently hold it (PAEs, reviewers, moderators, …). */
export interface RoleCount {
  role: string;
  count: number;
}

/** Crops considered saturated in a state (count exceeds the admin's threshold). */
export interface SaturatedCropState {
  state: string;
  total: number;
  crops: { crop: string; count: number }[];
}

export interface PublicDashboardStats extends PublicDashboardCounts {
  statesCovered: number;
  cropsCovered: number;
  domainsCovered: number;
  stateData: Analytics['stateData'];
  cropData: Analytics['cropData'];
  domainData: Analytics['domainData'];
  /** The Human Intelligence Network headcounts — from performance/overview's userRoleOverview. */
  userRoleOverview: RoleCount[];
  /** Threshold used for the saturated-crops grouping (admin-configured). */
  saturationThreshold: number;
  /** Per state, the crops whose question count exceeds the threshold. */
  saturatedCropsByState: SaturatedCropState[];
}

export interface IDashboardContentService {
  /** Public read — returns the singleton content ({ blocks: [], stats: [] } when unset). */
  getContent(): Promise<IDashboardContent>;

  /** Admin write — replaces the blocks and the headline stats. `userId` is the editor. */
  updateContent(
    blocks: IDashboardBlock[],
    stats: IDashboardStat[],
    userId: string,
    saturationThreshold?: number,
  ): Promise<IDashboardContent>;

  /** Public read — live figures computed from the questions collection. */
  getPublicDashboardStats(): Promise<PublicDashboardStats>;

  /** Public read — just the four headline counts (cheap; polled for near-real-time). */
  getPublicDashboardCounts(): Promise<PublicDashboardCounts>;
}
