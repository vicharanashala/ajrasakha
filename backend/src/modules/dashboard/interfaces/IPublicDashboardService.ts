import {SaturatedCropStateItem} from './IPublicDashboardRepository.js';

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
}
