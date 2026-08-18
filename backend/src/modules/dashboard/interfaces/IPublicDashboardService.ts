import {
  PublicDashboardItem,
  PublicUserItem,
  SaturatedCropStateItem,
} from './IPublicDashboardRepository.js';

export interface SaturatedCropsResult {
  saturationLimit: number;
  states: SaturatedCropStateItem[];
}

/**
 * Business-logic contract for the public (no-auth) dashboard.
 */
export interface IPublicDashboardService {
  /**
   * Saturated crops grouped by state (question count strictly greater than the limit),
   * along with the limit that was applied.
   */
  getSaturatedCrops(): Promise<SaturatedCropsResult>;

  /** All active users, projected to the public-facing fields. */
  getActiveUsers(): Promise<PublicUserItem[]>;

  /** All stored public-dashboard items (saturation limit, outreach videos, …). */
  getItems(): Promise<PublicDashboardItem[]>;

  /** Admin: add a new item; returns the created entry. */
  addItem(name: string, value: unknown): Promise<PublicDashboardItem>;

  /** Admin: update an item's name/value by id; returns the updated entry. */
  updateItem(
    id: string,
    patch: {name?: string; value?: unknown},
  ): Promise<PublicDashboardItem>;

  /** Admin: delete an item by id. */
  deleteItem(id: string): Promise<void>;

  /** Admin: upload an outreach image/video to GCS; stores its URL as an item. */
  uploadMedia(
    file: Express.Multer.File,
    kind: 'image' | 'video',
  ): Promise<PublicDashboardItem>;
}
