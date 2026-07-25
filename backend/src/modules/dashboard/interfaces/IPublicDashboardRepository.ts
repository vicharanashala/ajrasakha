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
}
