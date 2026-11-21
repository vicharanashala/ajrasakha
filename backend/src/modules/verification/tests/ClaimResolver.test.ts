import {describe, it, expect, vi} from 'vitest';
import {ClaimResolver} from '../services/ClaimResolver.js';
import {ClaimKind, MatchStatus} from '../types/index.js';

// ── Minimal MongoDatabase stand-in: getCollection() returns a stub whose
//    findOne() answers with the given document and records every call. ──

const makeResolver = (doc: any) => {
  const findOne = vi.fn(async () => doc);
  const db = {getCollection: vi.fn(async () => ({findOne}))};
  return {resolver: new ClaimResolver(db as any), findOne};
};

const dosageClaim = {kind: ClaimKind.DOSAGE, text: '25 ml per litre', value: 25, unit: 'ml_per_l'};

describe('ClaimResolver', () => {
  it('does not query the catalogue for a dosage with no chemical subject', async () => {
    // An empty subject previously produced the regex `\b\b`, which matches the
    // first catalogue document — silently attaching the dose to a random
    // chemical. The guard must keep the database untouched.
    const {resolver, findOne} = makeResolver({name: 'Imidacloprid', status: 'Approved'});

    const [resolution] = await resolver.resolveAll([dosageClaim]);

    expect(findOne).not.toHaveBeenCalled();
    // Unattributable doses are unchecked, so they must escalate — never pass.
    expect(resolution.status).toBe(MatchStatus.NOT_FOUND);
    expect(resolution.reference).toBeUndefined();
    expect(resolution.reason).toContain('could not be attributed to a chemical name');
  });

  it('flags a restricted catalogue record explicitly, without a value verdict', async () => {
    const {resolver} = makeResolver({name: 'Monocrotophos', status: 'Restricted'});

    const [resolution] = await resolver.resolveAll([
      {kind: ClaimKind.CHEMICAL_MENTION, text: 'monocrotophos', subject: 'monocrotophos'},
    ]);

    expect(resolution.status).toBe(MatchStatus.MATCHED_NO_VALUE);
    expect(resolution.restrictedChemical).toBe(true);
    expect(resolution.valueVerdict).toBeUndefined();
    expect(resolution.reason).toContain('"Restricted"');
  });

  it('reports NOT_FOUND when the catalogue has no match', async () => {
    const {resolver} = makeResolver(null);

    const [resolution] = await resolver.resolveAll([
      {kind: ClaimKind.CHEMICAL_MENTION, text: 'unknownchem', subject: 'unknownchem'},
    ]);

    expect(resolution.status).toBe(MatchStatus.NOT_FOUND);
    expect(resolution.reason).toContain('does not match any entry');
  });

  it('records interval and spray-count claims as unresolved expert evidence', async () => {
    const {resolver, findOne} = makeResolver({name: 'Anything', status: 'Approved'});

    const resolutions = await resolver.resolveAll([
      {kind: ClaimKind.INTERVAL, text: 'every 5 days', value: 5, unit: 'days'},
      {kind: ClaimKind.SPRAY_COUNT, text: '3 sprays', value: 3},
    ]);

    expect(findOne).not.toHaveBeenCalled();
    expect(resolutions.map(r => r.status)).toEqual([
      MatchStatus.UNRESOLVED,
      MatchStatus.UNRESOLVED,
    ]);
  });
});
