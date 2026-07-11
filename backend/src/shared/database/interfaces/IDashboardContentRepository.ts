import { IDashboardBlock, IDashboardContent } from '#root/shared/interfaces/models.js';

export interface IDashboardContentRepository {
  /** Fetch the singleton public-dashboard content document (or null if never set). */
  get(): Promise<IDashboardContent | null>;
  /** Replace the block list (upsert the singleton). Returns the saved document. */
  save(blocks: IDashboardBlock[], updatedBy: string | null): Promise<IDashboardContent>;
}
