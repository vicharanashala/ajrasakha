/**
 * AjraVerify — shared domain types.
 *
 * M1 is deterministic: claim extraction is regex-based (format patterns only —
 * no agricultural facts live in this module) and every factual judgement is
 * resolved against trusted in-database sources (chemical catalogue, crop
 * catalogue, PoP documents).
 */

/** Kinds of factual claims the extractor can recognise in answer text. */
export enum ClaimKind {
  CHEMICAL_MENTION = 'chemical_mention',
  DOSAGE = 'dosage',
  INTERVAL = 'interval',
  SPRAY_COUNT = 'spray_count',
  CROP_MENTION = 'crop_mention',
}

/** Unit families a dosage can be expressed in. */
export enum DosageUnit {
  ML_PER_L = 'ml_per_l',
  G_PER_L = 'g_per_l',
  ML_PER_ACRE = 'ml_per_acre',
  G_PER_ACRE = 'g_per_acre',
  KG_PER_ACRE = 'kg_per_acre',
  L_PER_ACRE = 'l_per_acre',
  PERCENT = 'percent',
  PPM = 'ppm',
  UNKNOWN = 'unknown',
}

/** What the trusted-source resolution found for a claim. */
export enum MatchStatus {
  /** A trusted record matched with a comparable value. */
  MATCHED = 'matched',
  /** A trusted record matched but with no comparable value (e.g. name-only). */
  MATCHED_NO_VALUE = 'matched_no_value',
  /** No trusted record matched the claim's subject. */
  NOT_FOUND = 'not_found',
  /** The claim was recognised but this resolver type does not check values. */
  UNRESOLVED = 'unresolved',
}

/** How far a claimed value may sit from the trusted value and still pass. */
export enum ValueVerdict {
  WITHIN_TOLERANCE = 'within_tolerance',
  NEAR_MISS = 'near_miss',
  OUT_OF_RANGE = 'out_of_range',
}

/** Trusted sources a claim is resolved against. */
export enum TrustedSource {
  CHEMICAL_CATALOGUE = 'chemical_catalogue',
  CROP_CATALOGUE = 'crop_catalogue',
}

/** One factual claim extracted from an answer. */
export interface IClaim {
  kind: ClaimKind;
  /** The exact text span the claim was extracted from. */
  text: string;
  /** Chemical / crop name the claim is about, normalised for lookup. */
  subject?: string;
  value?: number;
  unit?: DosageUnit | string;
  /** Original ordinal (1st, 2nd…) for interval / count claims. */
  ordinal?: string;
}

/** The outcome of resolving one claim against trusted data. */
export interface IClaimResolution {
  claim: IClaim;
  status: MatchStatus;
  source: TrustedSource | null;
  /** Human-readable reference to the matched record (name, id…). */
  reference?: string;
  /** Trusted value, when the matched record carries a comparable one. */
  trustedValue?: number;
  trustedUnit?: string;
  valueVerdict?: ValueVerdict;
  /**
   * True when the matched catalogue record is marked restricted/banned. A
   * status block, not a value comparison — kept explicit so the policy engine
   * decides from structured fields, never by parsing reason text.
   */
  restrictedChemical?: boolean;
  /** Distance from the trusted value, as a signed fraction (0.12 = +12%). */
  deviation?: number;
  reason: string;
}

export enum Verdict {
  VERIFIED = 'VERIFIED',
  CONDITIONAL = 'CONDITIONAL',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  BLOCKED = 'BLOCKED',
}

/** Per-verdict counters, for receipts and metrics. */
export interface IVerdictCounts {
  matched: number;
  matchedNoValue: number;
  notFound: number;
  unresolved: number;
  nearMiss: number;
  outOfRange: number;
  restrictedChemicals: number;
}

/** Configurable thresholds for the policy engine (from env or defaults). */
export interface IVerificationPolicy {
  /** Fractional deviation treated as a minor deviation (CONDITIONAL). */
  nearMissTolerance: number;
  /** Fractional deviation beyond which a dosage is treated as unsafe (BLOCKED). */
  blockedTolerance: number;
  /** Chemical catalogue statuses that must never ship unreviewed. */
  restrictedStatuses: string[];
}

/** The persisted audit record for one gate decision. */
export interface IVerificationReceipt {
  _id?: string | {toString(): string};
  /** Mongo ObjectId string of the question the answer belongs to. */
  questionId?: string | null;
  /** Mongo ObjectId string of the answer checked (when known). */
  answerId?: string | null;
  answerText: string;
  claims: IClaim[];
  resolutions: IClaimResolution[];
  verdict: Verdict;
  reason: string;
  counts: IVerdictCounts;
  policy: IVerificationPolicy;
  extractor: string;
  createdAt: Date;
}

/** Result returned by the verification pipeline. */
export interface IVerificationResult {
  verdict: Verdict;
  reason: string;
  claims: IClaim[];
  resolutions: IClaimResolution[];
  receiptId?: string;
  counts: IVerdictCounts;
  createdAt: Date;
}
