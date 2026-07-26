import {IPreference, UserRole} from '#root/shared/interfaces/models.js';

/** One state and the crops within it whose question count exceeds the saturation limit. */
export interface SaturatedCropStateItem {
  state: string;
  /** Sum of question counts across the saturated crops in this state. */
  total: number;
  crops: {crop: string; count: number}[];
}

/** Public-facing subset of an active user for the public dashboard. */
export interface PublicUserItem {
  firstName: string;
  lastName?: string;
  preference?: IPreference | null;
  avatar?: string;
  role: UserRole;
  university?: string;
  createdAt?: Date;
}

/**
 * A single entry in the public dashboard's `items` array — the one shape used for every
 * admin-editable value (saturation limit, outreach video URLs, future images/tunables).
 * `id` lets admins update/delete individual entries; `value` is open-ended.
 */
export interface PublicDashboardItem {
  id: string;
  name: string;
  value: unknown;
  createdAt?: Date;
}

/**
 * Data-access contract for the public (no-auth) dashboard.
 * Implementations own their own DB access — every operation lives in the module.
 */
export interface IPublicDashboardRepository {
  /**
   * Crops grouped by state whose question document count is strictly greater than
   * `saturatedCropLimit`. Grouped by state, sorted by total descending.
   */
  getSaturatedCropsByState(
    saturatedCropLimit: number,
  ): Promise<SaturatedCropStateItem[]>;

  /**
   * All active users, projected to the public-facing fields
   * (firstName, lastName, preference, avatar, role, university, createdAt).
   */
  getActiveUsers(): Promise<PublicUserItem[]>;

  /** All stored public-dashboard items (empty array if none). */
  getItems(): Promise<PublicDashboardItem[]>;

  /** Replace the stored items array with the given one; returns the new list. */
  saveItems(items: PublicDashboardItem[]): Promise<PublicDashboardItem[]>;
}
