import {inject, injectable} from 'inversify';
import {Collection} from 'mongodb';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {ICrop} from '#root/shared/interfaces/models.js';
import {
  ClaimKind,
  IClaim,
  IClaimResolution,
  MatchStatus,
  TrustedSource,
  ValueVerdict,
} from '../types/index.js';

/**
 * Resolves extracted claims against the trusted in-repo catalogues.
 *
 * M1 resolvers are name/value lookups against existing collections:
 *  - chemical catalogue  → `crop_master` (type === 'chemical') and
 *                          `chemical_master` (restricted/banned statuses)
 *  - crop catalogue      → `crop_master` (type === 'crop' or unset)
 *
 * No facts are hardcoded here: statuses and names come from the documents.
 */
@injectable()
export class ClaimResolver {
  private cropCollection: Collection<ICrop> | null = null;
  private chemicalCollection: Collection<ICrop> | null = null;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    if (this.cropCollection) return;
    this.cropCollection = await this.db.getCollection<ICrop>('crop_master');
    this.chemicalCollection = await this.db.getCollection<ICrop>('chemical_master');
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Resolve every resolvable claim, preserving input order. */
  async resolveAll(claims: IClaim[]): Promise<IClaimResolution[]> {
    await this.init();
    const resolutions: IClaimResolution[] = [];
    for (const claim of claims) {
      resolutions.push(await this.resolveOne(claim));
    }
    return resolutions;
  }

  private async resolveOne(claim: IClaim): Promise<IClaimResolution> {
    switch (claim.kind) {
      case ClaimKind.CHEMICAL_MENTION:
        return this.resolveChemical(claim);
      case ClaimKind.DOSAGE:
        return this.resolveDosage(claim);
      case ClaimKind.INTERVAL:
      case ClaimKind.SPRAY_COUNT:
        return {
          claim,
          status: MatchStatus.UNRESOLVED,
          source: null,
          reason:
            'Interval / spray-count claims are recorded for expert review in M1; no trusted per-crop schedule is resolved automatically yet.',
        };
      default:
        return {
          claim,
          status: MatchStatus.UNRESOLVED,
          source: null,
          reason: 'Claim kind not checked automatically in M1.',
        };
    }
  }

  /**
   * Look a chemical name up in `chemical_master` first, then `crop_master`.
   * Blank/short subjects return null without touching the database — an empty
   * subject would build the regex `\b\b`, which matches the first document in
   * the collection and silently mis-attributes the claim.
   */
  private async findChemical(subject: string): Promise<ICrop | null> {
    const trimmed = (subject ?? '').trim();
    if (trimmed.length < 3) return null;

    const escaped = ClaimResolver.escapeRegex(trimmed);
    const nameRegex = new RegExp(`^${escaped}$`, 'i');
    const containsRegex = new RegExp(`\\b${escaped}\\b`, 'i');

    const chemicalMaster = await this.chemicalCollection!.findOne({
      $or: [{name: nameRegex}, {name: containsRegex}],
    });
    if (chemicalMaster) return chemicalMaster;

    return await this.cropCollection!.findOne({
      type: 'chemical',
      $or: [
        {name: nameRegex},
        {'aliases.english_representation': nameRegex},
        {'aliases.english_representation': containsRegex},
      ],
    });
  }

  private async resolveChemical(claim: IClaim): Promise<IClaimResolution> {
    const subject = claim.subject ?? claim.text;
    const chemical = await this.findChemical(subject);

    if (!chemical) {
      return {
        claim,
        status: MatchStatus.NOT_FOUND,
        source: TrustedSource.CHEMICAL_CATALOGUE,
        reason: `Chemical "${subject}" does not match any entry in the trusted chemical catalogue.`,
      };
    }

    const status = (chemical.status ?? '').toString().toLowerCase();
    const restricted = status === 'restricted' || status === 'banned';

    return {
      claim,
      status: MatchStatus.MATCHED_NO_VALUE,
      source: TrustedSource.CHEMICAL_CATALOGUE,
      reference: chemical.name,
      // A catalogue restriction is a status block, not a value comparison —
      // flagged explicitly so the policy engine never has to parse reason text.
      restrictedChemical: restricted,
      valueVerdict: restricted ? undefined : ValueVerdict.WITHIN_TOLERANCE,
      reason: restricted
        ? `Chemical "${chemical.name}" is marked "${chemical.status}" in the trusted catalogue.`
        : `Chemical "${chemical.name}" found in the trusted chemical catalogue (status: ${chemical.status || 'unlisted'}).`,
    };
  }

  /**
   * Resolve a dosage claim: find the chemical the answer's dosage phrases
   * attach to (nearest preceding chemical mention), then compare against the
   * catalogue. M1 keeps this coarse — the chemical module does not yet carry
   * per-chemical dose limits, so a matched chemical is WITHIN_TOLERANCE and
   * the dosage is recorded for expert evidence.
   */
  private async resolveDosage(claim: IClaim): Promise<IClaimResolution> {
    const subject = (claim.subject ?? '').trim();
    if (!subject) {
      // A dose that cannot be attributed to any product is checked against
      // nothing — it must not pass the gate silently. Unattributable dosage
      // claims go to review, same as an unknown chemical name.
      return {
        claim,
        status: MatchStatus.NOT_FOUND,
        source: TrustedSource.CHEMICAL_CATALOGUE,
        reference: undefined,
        reason: `Dosage "${claim.text}" could not be attributed to a chemical name in the answer — no catalogue value to compare against (M1).`,
      };
    }

    const chemical = await this.findChemical(subject);
    if (!chemical) {
      return {
        claim,
        status: MatchStatus.MATCHED_NO_VALUE,
        source: TrustedSource.CHEMICAL_CATALOGUE,
        reference: undefined,
        reason: `Dosage "${claim.text}" recorded for "${subject}", which has no catalogue entry to compare against (M1).`,
      };
    }

    return {
      claim,
      status: MatchStatus.MATCHED_NO_VALUE,
      source: TrustedSource.CHEMICAL_CATALOGUE,
      reference: chemical.name,
      reason: `Dosage "${claim.text}" attached to catalogue chemical "${chemical.name}" and recorded for expert evidence.`,
    };
  }
}
