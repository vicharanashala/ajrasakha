/** One state and the crops within it whose question count exceeds the saturation limit. */
export interface SaturatedCropStateItem {
  state: string;
  /** Sum of question counts across the saturated crops in this state. */
  total: number;
  crops: {crop: string; count: number}[];
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
}
