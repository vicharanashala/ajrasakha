import {injectable} from 'inversify';
import {PublicDashboardRepository} from '../repositories/PublicDashboardRepository.js';
import {IPublicDashboardRepository} from '../interfaces/IPublicDashboardRepository.js';
import {
  IPublicDashboardService,
  SaturatedCropsResult,
} from '../interfaces/IPublicDashboardService.js';

/** Saturation limit — a (state, crop) pair with more questions than this is "saturated".
 *  Hardcoded for now; can be moved to admin config later. */
const SATURATED_CROP_LIMIT = 50;

/**
 * Business logic for the public (no-auth) dashboard. Self-contained: it owns its
 * repository instance, so every operation is handled within the public dashboard module.
 */
@injectable()
export class PublicDashboardService implements IPublicDashboardService {
  private readonly repo: IPublicDashboardRepository;

  constructor() {
    this.repo = new PublicDashboardRepository();
  }

  async getSaturatedCrops(): Promise<SaturatedCropsResult> {
    const states = await this.repo.getSaturatedCropsByState(SATURATED_CROP_LIMIT);
    return {
      saturationLimit: SATURATED_CROP_LIMIT,
      states,
    };
  }
}
