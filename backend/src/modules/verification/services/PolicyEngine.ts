import {injectable} from 'inversify';
import {
  IClaim,
  IClaimResolution,
  IVerificationPolicy,
  IVerdictCounts,
  MatchStatus,
  ValueVerdict,
  Verdict,
} from '../types/index.js';

/**
 * Deterministic decision-maker. Maps claim resolutions to one of four
 * verdicts using only counters — no LLM, no randomness.
 *
 *   BLOCKED          any catalogue-restricted/banned chemical, or any dosage
 *                    beyond the blocked tolerance
 *
 * Decisions read only structured resolution fields (status, valueVerdict,
 * restrictedChemical) — reason strings are for humans and are never parsed.
 *   REVIEW_REQUIRED  any chemical/dosage claim that matched no trusted record
 *   CONDITIONAL      everything matched, but some values were near-misses
 *   VERIFIED         everything matched within tolerance
 */
@injectable()
export class PolicyEngine {
  static readonly DEFAULT_POLICY: IVerificationPolicy = {
    nearMissTolerance: 0.1,
    blockedTolerance: 0.5,
    restrictedStatuses: ['restricted', 'banned'],
  };

  /** Active thresholds — override via configure() (env/config in M2). */
  policy: IVerificationPolicy = {...PolicyEngine.DEFAULT_POLICY};

  /** Replace defaults with the given overrides. Parameterless for DI. */
  configure(overrides?: Partial<IVerificationPolicy>): void {
    if (overrides) this.policy = {...this.policy, ...overrides};
  }

  count(resolutions: IClaimResolution[]): IVerdictCounts {
    const counts: IVerdictCounts = {
      matched: 0,
      matchedNoValue: 0,
      notFound: 0,
      unresolved: 0,
      nearMiss: 0,
      outOfRange: 0,
      restrictedChemicals: 0,
    };
    for (const r of resolutions) {
      switch (r.status) {
        case MatchStatus.MATCHED:
          counts.matched++;
          break;
        case MatchStatus.MATCHED_NO_VALUE:
          counts.matchedNoValue++;
          break;
        case MatchStatus.NOT_FOUND:
          counts.notFound++;
          break;
        default:
          counts.unresolved++;
      }
      if (r.valueVerdict === ValueVerdict.NEAR_MISS) counts.nearMiss++;
      if (r.valueVerdict === ValueVerdict.OUT_OF_RANGE) counts.outOfRange++;
      if (r.restrictedChemical) counts.restrictedChemicals++;
    }
    return counts;
  }

  decide(resolutions: IClaimResolution[]): {verdict: Verdict; reason: string} {
    const counts = this.count(resolutions);

    if (counts.restrictedChemicals > 0 || counts.outOfRange > 0) {
      const parts: string[] = [];
      if (counts.restrictedChemicals > 0) {
        parts.push(
          `${counts.restrictedChemicals} restricted/banned chemical${counts.restrictedChemicals > 1 ? 's' : ''} in the trusted catalogue`,
        );
      }
      if (counts.outOfRange > 0) {
        parts.push(
          `${counts.outOfRange} claim${counts.outOfRange > 1 ? 's' : ''} beyond the safety tolerance (${Math.round(this.policy.blockedTolerance * 100)}%)`,
        );
      }
      return {
        verdict: Verdict.BLOCKED,
        reason: `Blocked: ${parts.join(' and ')}. This answer must not ship without expert approval.`,
      };
    }

    if (counts.notFound > 0) {
      return {
        verdict: Verdict.REVIEW_REQUIRED,
        reason: `${counts.notFound} claim${counts.notFound > 1 ? 's' : ''} could not be matched against trusted data — expert review required before delivery.`,
      };
    }

    if (counts.nearMiss > 0) {
      return {
        verdict: Verdict.CONDITIONAL,
        reason: `All claims matched trusted data, but ${counts.nearMiss} value${counts.nearMiss > 1 ? 's are' : ' is'} within the caution band (±${Math.round(this.policy.nearMissTolerance * 100)}%). Deliver with the verification receipt attached.`,
      };
    }

    return {
      verdict: Verdict.VERIFIED,
      reason: 'All factual claims matched trusted data within tolerance.',
    };
  }
}
