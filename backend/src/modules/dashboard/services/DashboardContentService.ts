import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { GLOBAL_TYPES } from '#root/types.js';
import { IDashboardContentRepository } from '#root/shared/database/interfaces/IDashboardContentRepository.js';
import { IDashboardBlock, IDashboardContent } from '#root/shared/interfaces/models.js';
import { IDashboardContentService } from '../interfaces/IDashboardContentService.js';

@injectable()
export class DashboardContentService implements IDashboardContentService {
  constructor(
    @inject(GLOBAL_TYPES.DashboardContentRepository)
    private repo: IDashboardContentRepository,
  ) {}

  async getContent(): Promise<IDashboardContent> {
    const doc = await this.repo.get();
    return doc ?? { key: 'public_dashboard', blocks: [] };
  }

  async updateContent(blocks: IDashboardBlock[], userId: string): Promise<IDashboardContent> {
    // Normalise: trim, drop empty blocks, ensure ids, re-sequence order, sanitise figures.
    const cleaned: IDashboardBlock[] = (blocks ?? [])
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

    return this.repo.save(cleaned, userId ?? null);
  }
}
