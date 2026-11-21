import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {VerificationService} from '../services/VerificationService.js';
import {RuleBasedClaimExtractor} from '../extractors/RuleBasedClaimExtractor.js';
import {ClaimResolver} from '../services/ClaimResolver.js';
import {PolicyEngine} from '../services/PolicyEngine.js';
import {
  ClaimKind,
  MatchStatus,
  TrustedSource,
  Verdict,
} from '../types/index.js';

// ── Mock resolver: no DB, no Firebase, no network ────────────────────────────

const mockResolver = {
  resolveAll: vi.fn(async (claims: any[]) =>
    claims.map(c => ({
      claim: c,
      status:
        c.kind === ClaimKind.CHEMICAL_MENTION && c.subject === 'unknownchem'
          ? MatchStatus.NOT_FOUND
          : c.kind === ClaimKind.INTERVAL || c.kind === ClaimKind.SPRAY_COUNT
            ? MatchStatus.UNRESOLVED
            : MatchStatus.MATCHED_NO_VALUE,
      source: TrustedSource.CHEMICAL_CATALOGUE,
      reason:
        c.kind === ClaimKind.CHEMICAL_MENTION && c.subject === 'unknownchem'
          ? 'Chemical "unknownchem" does not match any entry in the trusted chemical catalogue.'
          : 'ok',
    })),
  ),
};

const mockReceiptRepo = {
  addReceipt: vi.fn(async (receipt: any) => ({...receipt, _id: 'receipt-123'})),
  getByQuestionId: vi.fn(async () => null),
  getRecent: vi.fn(async () => []),
  count: vi.fn(async () => 7),
};

const buildService = () =>
  new VerificationService(
    new RuleBasedClaimExtractor(),
    mockResolver as any,
    new PolicyEngine(),
    mockReceiptRepo as any,
  );

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = buildService();
  });

  it('routes a safe answer to VERIFIED and persists a receipt', async () => {
    const result = await service.verifyAnswer({
      answerText: 'Spray neem oil 5 ml per litre in the morning.',
      questionId: '64b000000000000000000001',
    });

    expect(result.verdict).toBe(Verdict.VERIFIED);
    expect(result.receiptId).toBe('receipt-123');
    expect(mockReceiptRepo.addReceipt).toHaveBeenCalledTimes(1);
    const receipt = mockReceiptRepo.addReceipt.mock.calls[0][0];
    expect(receipt.questionId).toBe('64b000000000000000000001');
    expect(receipt.extractor).toBe('rule-based-regex-m1');
    expect(receipt.claims.some((c: any) => c.kind === ClaimKind.DOSAGE)).toBe(true);
  });

  it('routes an answer with an unknown chemical to REVIEW_REQUIRED', async () => {
    const result = await service.verifyAnswer({
      answerText: 'Apply unknownchem 20 ml per litre weekly.',
    });
    expect(result.verdict).toBe(Verdict.REVIEW_REQUIRED);
    expect(result.counts.notFound).toBeGreaterThanOrEqual(1);
  });

  it('routes a restricted chemical answer to BLOCKED', async () => {
    mockResolver.resolveAll.mockResolvedValueOnce([
      {
        claim: {kind: ClaimKind.CHEMICAL_MENTION, text: 'monocrotophos', subject: 'monocrotophos'},
        status: MatchStatus.MATCHED_NO_VALUE,
        source: TrustedSource.CHEMICAL_CATALOGUE,
        restrictedChemical: true,
        reason: 'Chemical "monocrotophos" is marked "Restricted" in the trusted catalogue.',
      },
      {
        claim: {kind: ClaimKind.DOSAGE, text: '25 ml per litre', value: 25, unit: 'ml_per_l'},
        status: MatchStatus.MATCHED_NO_VALUE,
        source: TrustedSource.CHEMICAL_CATALOGUE,
        reason: 'ok',
      },
    ] as any);

    const result = await service.verifyAnswer({
      answerText: 'Use monocrotophos 25 ml per litre.',
    });
    expect(result.verdict).toBe(Verdict.BLOCKED);
  });

  it('never fails the gate when receipt persistence throws', async () => {
    mockReceiptRepo.addReceipt.mockRejectedValueOnce(new Error('DB down'));

    const result = await service.verifyAnswer({answerText: 'plain advice only'});
    expect(result.verdict).toBe(Verdict.VERIFIED);
    expect(result.receiptId).toBeUndefined();
  });

  it('skips persistence when persist=false', async () => {
    const result = await service.verifyAnswer({
      answerText: 'Spray 2 ml per litre.',
      persist: false,
    });
    expect(mockReceiptRepo.addReceipt).not.toHaveBeenCalled();
    expect(result.receiptId).toBeUndefined();
  });

  it('attaches the chemical subject to dosage claims via the extractor', async () => {
    const result = await service.verifyAnswer({
      answerText: 'Use 25 ml per litre of monocrotophos.',
      persist: false,
    });

    const dosage = result.claims.find(c => c.kind === ClaimKind.DOSAGE);
    expect(dosage?.subject).toBe('monocrotophos');
  });

  it('counts receipts with the same verdict filter as the list', async () => {
    const total = await service.countReceipts('BLOCKED');
    expect(mockReceiptRepo.count).toHaveBeenCalledWith('BLOCKED');
    expect(total).toBe(7);
  });

  it('escalates a dose that cannot be attributed to any chemical (real resolver, empty catalogue)', async () => {
    const emptyDb = {getCollection: vi.fn(async () => ({findOne: vi.fn(async () => null)}))};
    const realPipeline = new VerificationService(
      new RuleBasedClaimExtractor(),
      new ClaimResolver(emptyDb as any),
      new PolicyEngine(),
      mockReceiptRepo as any,
    );

    const result = await realPipeline.verifyAnswer({
      answerText: 'Apply about 500 ml per acre of water.',
      persist: false,
    });

    expect(result.verdict).toBe(Verdict.REVIEW_REQUIRED);
    const dosage = result.claims.find(c => c.kind === ClaimKind.DOSAGE);
    expect(dosage?.subject).toBeUndefined();
    expect(result.counts.notFound).toBe(1);
  });
});
