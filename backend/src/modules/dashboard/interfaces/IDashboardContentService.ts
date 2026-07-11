import { IDashboardBlock, IDashboardContent } from '#root/shared/interfaces/models.js';

export interface IDashboardContentService {
  /** Public read — returns the singleton content ({ blocks: [] } when unset). */
  getContent(): Promise<IDashboardContent>;
  /** Admin write — replaces the block list. `userId` is recorded as the editor. */
  updateContent(blocks: IDashboardBlock[], userId: string): Promise<IDashboardContent>;
}
