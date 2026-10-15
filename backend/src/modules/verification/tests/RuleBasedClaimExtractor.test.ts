import {describe, it, expect} from 'vitest';
import {RuleBasedClaimExtractor} from '../extractors/RuleBasedClaimExtractor.js';
import {ClaimKind, DosageUnit} from '../types/index.js';

const extractor = new RuleBasedClaimExtractor();

describe('RuleBasedClaimExtractor', () => {
  it('extracts nothing from an empty or fact-free answer', () => {
    expect(extractor.extract('')).toEqual([]);
    expect(extractor.extract('Water the crop regularly and watch for yellowing leaves.')).toEqual([]);
  });

  it('extracts a ml-per-litre dosage', () => {
    const claims = extractor.extract('Spray 2 ml per litre of water.');
    const dosages = claims.filter(c => c.kind === ClaimKind.DOSAGE);
    expect(dosages).toHaveLength(1);
    expect(dosages[0].value).toBe(2);
    expect(dosages[0].unit).toBe(DosageUnit.ML_PER_L);
  });

  it('extracts slash-form dosages with decimals', () => {
    const claims = extractor.extract('Apply 1.5 ml/L as a foliar spray.');
    const dosages = claims.filter(c => c.kind === ClaimKind.DOSAGE);
    expect(dosages).toHaveLength(1);
    expect(dosages[0].value).toBe(1.5);
    expect(dosages[0].unit).toBe(DosageUnit.ML_PER_L);
  });

  it('extracts per-acre dosages in multiple units', () => {
    const claims = extractor.extract('Use 500 ml/acre or 2.5 kg/acre depending on severity.');
    const units = claims
      .filter(c => c.kind === ClaimKind.DOSAGE)
      .map(c => c.unit);
    expect(units).toContain(DosageUnit.ML_PER_ACRE);
    expect(units).toContain(DosageUnit.KG_PER_ACRE);
  });

  it('extracts interval claims normalised to days (weeks ×7)', () => {
    const claims = extractor.extract('Repeat every 5 days. After 2 weeks, reassess.');
    const intervals = claims.filter(c => c.kind === ClaimKind.INTERVAL);
    expect(intervals.map(i => i.value).sort((a, b) => a - b)).toEqual([5, 14]);
    expect(intervals.every(i => i.unit === 'days')).toBe(true);
  });

  it('extracts range intervals at the upper bound ("every 5-7 days" → 7)', () => {
    const claims = extractor.extract('Repeat every 5-7 days for 3 sprays.');
    const intervals = claims.filter(c => c.kind === ClaimKind.INTERVAL);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].value).toBe(7);
    expect(intervals[0].text).toContain('5-7 days');
  });

  it('detects the chemical in "25 ml monocrotophos per litre" (name after dosage)', () => {
    const claims = extractor.extract('Spray 25 ml monocrotophos per litre on the crop.');
    const mentions = claims.filter(c => c.kind === ClaimKind.CHEMICAL_MENTION);
    expect(mentions.some(x => x.subject === 'monocrotophos')).toBe(true);
    const dosage = claims.find(c => c.kind === ClaimKind.DOSAGE);
    expect(dosage?.subject).toBe('monocrotophos');
  });

  it('detects multi-word product names interleaved in the dosage ("2 ml Nominee Gold per litre")', () => {
    const claims = extractor.extract('Use 2 ml Nominee Gold per litre of water.');
    const dosage = claims.find(c => c.kind === ClaimKind.DOSAGE);
    expect(dosage).toBeDefined();
    expect(dosage?.value).toBe(2);
    expect(dosage?.subject).toBe('nominee gold');
    expect(claims.some(c => c.kind === ClaimKind.CHEMICAL_MENTION && c.subject === 'nominee gold')).toBe(true);
  });

  it('extracts numeric and word spray counts', () => {
    const claims = extractor.extract('Repeat 3 sprays total; two applications may suffice.');
    const counts = claims.filter(c => c.kind === ClaimKind.SPRAY_COUNT && c.value !== undefined);
    expect(counts.map(c => c.value).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it('extracts chemical mentions preceding a dosage', () => {
    const claims = extractor.extract(' monocrotophos 25 ml per litre');
    const mentions = claims.filter(c => c.kind === ClaimKind.CHEMICAL_MENTION);
    expect(mentions.some(m => m.subject === 'monocrotophos')).toBe(true);
  });

  it('attributes doses to the product name across a concentration + formulation code', () => {
    const claims = extractor.extract(
      'Spray monocrotophos 36% SL at 25 ml per litre of water, about 500 ml per acre.',
    );
    const dosages = claims.filter(c => c.kind === ClaimKind.DOSAGE);
    expect(dosages.length).toBeGreaterThanOrEqual(2);
    // Every dose in the sentence belongs to monocrotophos — not to the
    // formulation code ("sl") or a filler word ("about").
    for (const dose of dosages) expect(dose.subject).toBe('monocrotophos');
    const mentions = claims.filter(c => c.kind === ClaimKind.CHEMICAL_MENTION);
    expect(mentions.map(m => m.subject)).toContain('monocrotophos');
    expect(mentions.some(m => ['sl', 'sl at', 'about'].includes(m.subject as string))).toBe(false);
  });

  it('never treats filler words or formulation codes as chemicals', () => {
    const claims = extractor.extract('Apply about 500 ml per acre of water at 2 ml per litre.');
    const mentions = claims.filter(c => c.kind === ClaimKind.CHEMICAL_MENTION);
    expect(mentions).toEqual([]);
    const dosages = claims.filter(c => c.kind === ClaimKind.DOSAGE);
    expect(dosages.length).toBeGreaterThanOrEqual(2);
    expect(dosages.every(d => d.subject === undefined)).toBe(true);
  });

  it('keeps digit-bearing product shapes as chemical candidates ("2,4-D")', () => {
    const claims = extractor.extract('Spray 2,4-D at 500 ml per acre.');
    const mentions = claims.filter(c => c.kind === ClaimKind.CHEMICAL_MENTION);
    expect(mentions.some(m => m.subject === '2,4-d')).toBe(true);
    const dosage = claims.find(c => c.kind === ClaimKind.DOSAGE);
    expect(dosage?.subject).toBe('2,4-d');
  });

  it('does not carry a chemical across a sentence boundary onto a later dose', () => {
    const claims = extractor.extract(
      'Monocrotophos 25 ml per litre is dangerous. Apply 25 ml per acre later.',
    );
    const dosages = claims.filter(c => c.kind === ClaimKind.DOSAGE);
    const perLitre = dosages.find(d => d.unit === DosageUnit.ML_PER_L);
    const perAcre = dosages.find(d => d.unit === DosageUnit.ML_PER_ACRE);
    expect(perLitre?.subject).toBe('monocrotophos');
    expect(perAcre?.subject).toBeUndefined();
  });

  it('does not treat common instruction words as chemicals', () => {
    const claims = extractor.extract('Spray the solution on the crop every morning.');
    const mentions = claims.filter(c => c.kind === ClaimKind.CHEMICAL_MENTION);
    expect(mentions).toEqual([]);
  });

  it('extracts a full unsafe answer into all four claim kinds', () => {
    const claims = extractor.extract(
      'Use 25 ml per litre of monocrotophos. Repeat every 5 days for 3 sprays.',
    );
    const kinds = new Set(claims.map(c => c.kind));
    expect(kinds.has(ClaimKind.DOSAGE)).toBe(true);
    expect(kinds.has(ClaimKind.INTERVAL)).toBe(true);
    expect(kinds.has(ClaimKind.SPRAY_COUNT)).toBe(true);
    expect(kinds.has(ClaimKind.CHEMICAL_MENTION)).toBe(true);
  });
});
