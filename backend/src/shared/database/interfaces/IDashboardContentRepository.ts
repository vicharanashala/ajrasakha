import {
  IDashboardBlock,
  IDashboardContent,
  IDashboardStat,
} from '#root/shared/interfaces/models.js';

export interface IDashboardContentRepository {
  /** Fetch the singleton public-dashboard content document (or null if never set). */
  get(): Promise<IDashboardContent | null>;
  /** Replace the blocks + headline stats (upsert the singleton). Returns the saved doc. */
  save(
    blocks: IDashboardBlock[],
    stats: IDashboardStat[],
    updatedBy: string | null,
    saturationThreshold?: number,
  ): Promise<IDashboardContent>;
}
