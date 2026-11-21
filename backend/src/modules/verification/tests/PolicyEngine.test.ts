import {describe, it, expect} from 'vitest';
import {PolicyEngine} from '../services/PolicyEngine.js';
import {
  ClaimKind,
  IClaimResolution,
  MatchStatus,
  TrustedSource,
  ValueVerdict,
  Verdict,
} from '../types/index.js';

const claim = (text: string) => ({kind: ClaimKind.DOSAGE, text, value: 2, unit: 'ml_per_l'});

const resolution = (over: Partial<IClaimResolution>): IClaimResolution => ({
  claim: claim(over.claim?.text ?? '2 ml/L'),
  status: MatchStatus.MATCHED_NO_VALUE,
  source: TrustedSource.CHEMICAL_CATALOGUE,
  reason: 'ok',
  ...over,
});

describe('PolicyEngine', () => {
  const engine = new PolicyEngine();
  engine.configure({nearMissTolerance: 0.1, blockedTolerance: 0.5});

  it('returns VERIFIED when everything matched', () => {
    const {verdict} = engine.decide([
      resolution({status: MatchStatus.MATCHED_NO_VALUE, reason: 'Chemical "neem oil" found in the trusted chemical catalogue.'}),
    ]);
    expect(verdict).toBe(Verdict.VERIFIED);
  });

  it('returns VERIFIED when there are no factual claims at all', () => {
    const {verdict} = engine.decide([]);
    expect(verdict).toBe(Verdict.VERIFIED);
  });

  it('returns CONDITIONAL when a value is a near miss', () => {
    const {verdict, reason} = engine.decide([
      resolution({valueVerdict: ValueVerdict.NEAR_MISS, reason: 'Dosage within caution band.'}),
    ]);
    expect(verdict).toBe(Verdict.CONDITIONAL);
    expect(reason).toContain('caution band');
  });

  it('returns REVIEW_REQUIRED when a claim matched no trusted record', () => {
    const {verdict} = engine.decide([
      resolution({
        status: MatchStatus.NOT_FOUND,
        reason: 'Chemical "unknownchemical" does not match any entry in the trusted chemical catalogue.',
      }),
    ]);
    expect(verdict).toBe(Verdict.REVIEW_REQUIRED);
  });

  it('returns BLOCKED for a restricted chemical', () => {
    const {verdict, reason} = engine.decide([
      resolution({
        status: MatchStatus.MATCHED_NO_VALUE,
        restrictedChemical: true,
        reason: 'Chemical "monocrotophos" is marked "Restricted" in the trusted catalogue.',
      }),
    ]);
    expect(verdict).toBe(Verdict.BLOCKED);
    expect(reason).toContain('restricted/banned');
  });

  it('counts restricted chemicals from the structured flag only, never reason text', () => {
    const counts = engine.count([
      resolution({
        restrictedChemical: true,
        reason: 'Chemical "monocrotophos" is marked "Restricted" in the trusted catalogue.',
      }),
      resolution({
        claim: claim('neem'),
        // Reason mentions a restriction but the structured flag is what counts.
        reason: 'Chemical "neem oil" found in the trusted chemical catalogue (status: unlisted).',
      }),
      resolution({
        claim: claim('bannedium'),
        // Text that looks restricted but carries no flag must NOT block.
        reason: 'Chemical "bannedium" is marked "Banned" in some other system.',
      }),
    ]);
    expect(counts.restrictedChemicals).toBe(1);
    expect(counts.matchedNoValue).toBe(3);
  });

  it('returns BLOCKED with tolerance wording for a genuine out-of-range value', () => {
    const {verdict, reason} = engine.decide([
      resolution({
        valueVerdict: ValueVerdict.OUT_OF_RANGE,
        reason: 'Dosage is 80% above the catalogue value.',
      }),
    ]);
    expect(verdict).toBe(Verdict.BLOCKED);
    expect(reason).toContain('beyond the safety tolerance (50%)');
    expect(reason).not.toContain('restricted/banned');
  });

  it('treats unresolved (informational) claims as neither pass nor fail', () => {
    const {verdict} = engine.decide([
      resolution({status: MatchStatus.UNRESOLVED, reason: 'Interval claims are recorded for expert review in M1.'}),
    ]);
    expect(verdict).toBe(Verdict.VERIFIED);
  });
});
