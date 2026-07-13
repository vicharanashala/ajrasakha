import {
  IDashboardBlock,
  IDashboardContent,
  IDashboardStat,
} from '#root/shared/interfaces/models.js';
import { Analytics } from '../validators/DashboardValidators.js';

/**
 * Public dashboard figures: the total validated Q&A pairs plus the coverage breakdowns
 * (states / crops / domains) — i.e. the questions-analytics payload without `tableData`.
 */
export interface PublicDashboardStats {
  /** Questions in a closed state: closed + dynamic_closed + duplicate_closed. */
  validatedQAPairs: number;
  statesCovered: number;
  cropsCovered: number;
  domainsCovered: number;
  stateData: Analytics['stateData'];
  cropData: Analytics['cropData'];
  domainData: Analytics['domainData'];
}

export interface IDashboardContentService {
  /** Public read — returns the singleton content ({ blocks: [], stats: [] } when unset). */
  getContent(): Promise<IDashboardContent>;

  /** Admin write — replaces the blocks and the headline stats. `userId` is the editor. */
  updateContent(
    blocks: IDashboardBlock[],
    stats: IDashboardStat[],
    userId: string,
  ): Promise<IDashboardContent>;

  /** Public read — live figures computed from the questions collection. */
  getPublicDashboardStats(): Promise<PublicDashboardStats>;
}
