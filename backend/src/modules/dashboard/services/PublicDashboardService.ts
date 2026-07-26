import {randomUUID} from 'node:crypto';
import {injectable} from 'inversify';
import {BadRequestError, NotFoundError} from 'routing-controllers';
import {PublicDashboardRepository} from '../repositories/PublicDashboardRepository.js';
import {
  IPublicDashboardRepository,
  PublicDashboardItem,
  PublicUserItem,
} from '../interfaces/IPublicDashboardRepository.js';
import {
  IPublicDashboardService,
  SaturatedCropsResult,
} from '../interfaces/IPublicDashboardService.js';

/** Well-known item names. Used for value validation and reading typed values back out. */
export const SATURATION_LIMIT_NAME = 'saturation limit crop';
export const OUTREACH_VIDEO_NAME = 'outreach video';

/** Fallback used until an admin sets the saturation limit item. */
const DEFAULT_SATURATION_LIMIT = 50;

/**
 * Business logic for the public (no-auth) dashboard. Self-contained: it owns its
 * repository instance, so every operation is handled within the public dashboard module.
 *
 * All admin-editable values live in a single `items` array ({ id, name, value }) with one
 * generic add / update / delete API.
 */
@injectable()
export class PublicDashboardService implements IPublicDashboardService {
  private readonly repo: IPublicDashboardRepository;

  constructor() {
    this.repo = new PublicDashboardRepository();
  }

  async getSaturatedCrops(): Promise<SaturatedCropsResult> {
    const items = await this.repo.getItems();
    const saturationLimit = this.readSaturationLimit(items);
    const states = await this.repo.getSaturatedCropsByState(saturationLimit);
    return {saturationLimit, states};
  }

  /** All active users, projected to the public-facing fields. */
  async getActiveUsers(): Promise<PublicUserItem[]> {
    return this.repo.getActiveUsers();
  }

  /** All stored public-dashboard items. */
  async getItems(): Promise<PublicDashboardItem[]> {
    return this.repo.getItems();
  }

  /** Admin: add a new item. */
  async addItem(name: string, value: unknown): Promise<PublicDashboardItem> {
    const cleanName = this.requireName(name);
    const cleanValue = this.validateValue(cleanName, value);

    const items = await this.repo.getItems();
    const created: PublicDashboardItem = {
      id: randomUUID(),
      name: cleanName,
      value: cleanValue,
      createdAt: new Date(),
    };
    await this.repo.saveItems([...items, created]);
    return created;
  }

  /** Admin: update an item's name/value by id. */
  async updateItem(
    id: string,
    patch: {name?: string; value?: unknown},
  ): Promise<PublicDashboardItem> {
    const items = await this.repo.getItems();
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) {
      throw new NotFoundError(`Public dashboard item ${id} not found`);
    }

    const name =
      patch.name !== undefined ? this.requireName(patch.name) : items[idx].name;
    const value =
      patch.value !== undefined
        ? this.validateValue(name, patch.value)
        : items[idx].value;

    const updated: PublicDashboardItem = {...items[idx], name, value};
    items[idx] = updated;
    await this.repo.saveItems(items);
    return updated;
  }

  /** Admin: delete an item by id. */
  async deleteItem(id: string): Promise<void> {
    const items = await this.repo.getItems();
    const next = items.filter(i => i.id !== id);
    if (next.length === items.length) {
      throw new NotFoundError(`Public dashboard item ${id} not found`);
    }
    await this.repo.saveItems(next);
  }

  // ── helpers ──

  private requireName(name: string): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      throw new BadRequestError('item name is required');
    }
    return trimmed;
  }

  /** Validate/coerce a value based on its (well-known) name; open-ended otherwise. */
  private validateValue(name: string, value: unknown): unknown {
    if (name === SATURATION_LIMIT_NAME) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        throw new BadRequestError(
          `${SATURATION_LIMIT_NAME} must be a non-negative number`,
        );
      }
      return n;
    }

    if (name === OUTREACH_VIDEO_NAME) {
      return this.validateUrl(value);
    }

    return value;
  }

  private validateUrl(url: unknown): string {
    const trimmed = String(url ?? '').trim();
    if (!trimmed) {
      throw new BadRequestError('url is required');
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestError('value must be a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestError('value must be an http(s) URL');
    }
    return trimmed;
  }

  /** Pull the numeric saturation limit out of the items, defaulting if absent. */
  private readSaturationLimit(items: PublicDashboardItem[]): number {
    const entry = items.find(i => i.name === SATURATION_LIMIT_NAME);
    const n = Number(entry?.value);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SATURATION_LIMIT;
  }
}
