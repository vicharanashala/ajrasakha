import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IVerificationResult} from '../types/index.js';
import {RuleBasedClaimExtractor} from '../extractors/RuleBasedClaimExtractor.js';
import {ClaimResolver} from './ClaimResolver.js';
import {PolicyEngine} from './PolicyEngine.js';
import {VerificationReceiptRepository} from '../repositories/VerificationReceiptRepository.js';

/**
 * AjraVerify orchestrator: extract → resolve → decide → persist receipt.
 *
 * M1 pipeline is fully deterministic — no LLM call anywhere on this path.
 */
@injectable()
export class VerificationService {
  constructor(
    private readonly extractor: RuleBasedClaimExtractor,
    private readonly resolver: ClaimResolver,
    private readonly policyEngine: PolicyEngine,
    private readonly receiptRepo: VerificationReceiptRepository,
  ) {}

  /**
   * Verify an answer text. Returns the verdict plus the receipt id once the
   * audit record has been persisted.
   */
  async verifyAnswer(params: {
    answerText: string;
    questionId?: string | null;
    answerId?: string | null;
    persist?: boolean;
  }): Promise<IVerificationResult> {
    const {answerText, questionId = null, answerId = null, persist = true} = params;

    const claims = this.extractor.extract(answerText);
    const resolutions = await this.resolver.resolveAll(claims);
    const {verdict, reason} = this.policyEngine.decide(resolutions);
    const counts = this.policyEngine.count(resolutions);
    const createdAt = new Date();

    let receiptId: string | undefined;
    if (persist) {
      try {
        const receipt = await this.receiptRepo.addReceipt({
          questionId: questionId ?? null,
          answerId: answerId ?? null,
          answerText,
          claims,
          resolutions,
          verdict,
          reason,
          counts,
          policy: this.policyEngine.policy,
          extractor: RuleBasedClaimExtractor.extractorId,
          createdAt,
        });
        receiptId = receipt._id?.toString();
      } catch (error) {
        // A receipt write must never block the gate decision itself.
        console.error('[AjraVerify] Failed to persist receipt:', error);
      }
    }

    return {verdict, reason, claims, resolutions, receiptId, counts, createdAt};
  }

  async getReceiptByQuestionId(questionId: string) {
    return this.receiptRepo.getByQuestionId(questionId);
  }

  async getRecentReceipts(limit = 50, verdict?: string) {
    return this.receiptRepo.getRecent(limit, verdict);
  }

  /** Total receipts, or the total matching a verdict filter. */
  async countReceipts(verdict?: string) {
    return this.receiptRepo.count(verdict);
  }
}
