import {createHash} from 'crypto';
import {inject, injectable} from 'inversify';
import {BadRequestError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {IPendingPopUploadRepository} from '#root/shared/database/interfaces/IPendingPopUploadRepository.js';
import {IPopRepository} from '#root/shared/database/interfaces/IPopRepository.js';
import {IPendingPopUpload, IUser} from '#root/shared/interfaces/models.js';
import {faqPopConfig} from '#root/config/faqPop.js';
import {ConflictError} from '#root/shared/errors/ConflictError.js';

export interface PopUploadIntakeResult {
  id: string;
  status: 'received';
  /** Non-blocking — the file already exists in PoP's catalogue (pop_unique_documents). Filing
   *  it into more folders is a normal workflow, so the upload proceeds; this is shown to the
   *  uploader as a heads-up, not an error. */
  warning?: string;
}

export interface PopUploadSummary {
  id: string;
  filename: string;
  status: IPendingPopUpload['status'];
  error?: string | null;
  createdAt: Date;
}

interface PopForwardResult {
  ok: boolean;
  status?: number;
  error?: string;
  retryable?: boolean;
}

function toSummary(doc: IPendingPopUpload): PopUploadSummary {
  return {
    id: String(doc._id),
    filename: doc.filename,
    status: doc.status,
    error: doc.error ?? null,
    createdAt: doc.createdAt,
  };
}

@injectable()
export class PopUploadsService {
  // Re-entry guard for processQueue — one worker loop per process at a time, matches the
  // client-side queue this replaced (sequential, not concurrent: these are large multipart
  // forwards, and several at once would just contend for the same bandwidth).
  private processing = false;

  constructor(
    @inject(GLOBAL_TYPES.PendingPopUploadRepository)
    private readonly pendingRepo: IPendingPopUploadRepository,
    @inject(GLOBAL_TYPES.PopRepository)
    private readonly popRepo: IPopRepository,
  ) {
    // Boot-time recovery: anything left `processing` belonged to an instance that died
    // mid-forward. Reset it to `received` so a fresh claim can pick it up, then kick the
    // worker in case there's already work waiting. Fire-and-forget — the constructor can't be
    // async, and nothing blocks on this finishing.
    this.pendingRepo
      .resetStuckProcessing()
      .then(() => this.processQueue())
      .catch(err => console.error('[PopUploadsService] Boot recovery failed', err));
  }

  async intake(
    file: Express.Multer.File,
    fieldsJson: string,
    placementsJson: string,
    language: string,
    currentUser: IUser,
    popUserId: string,
    popUserRole: string,
  ): Promise<PopUploadIntakeResult> {
    if (!file) {
      throw new BadRequestError('file is required');
    }
    let fields: Record<string, unknown>;
    let placements: IPendingPopUpload['placements'];
    try {
      fields = JSON.parse(fieldsJson);
    } catch {
      throw new BadRequestError('fields_json is not valid JSON');
    }
    try {
      placements = JSON.parse(placementsJson);
    } catch {
      throw new BadRequestError('placements_json is not valid JSON');
    }
    if (!Array.isArray(placements) || placements.length === 0) {
      throw new BadRequestError('At least one placement is required');
    }
    if (!language) {
      throw new BadRequestError('language is required');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const uploaderId = currentUser._id.toString();

    // Three-tier duplicate check, confirmed with the PoP team — see
    // IPopRepository.findQueuedBySha256/findCatalogueBySha256 for the full reasoning. This is a
    // fast, synchronous, upfront UX improvement; PoP's own 409 at forward time (handled in
    // processQueue below) stays the authoritative guard against a same-file race.
    const [ownDuplicate, popQueued, popCatalogued] = await Promise.all([
      this.pendingRepo.findByUploaderAndSha256(uploaderId, sha256),
      this.popRepo.findQueuedBySha256(sha256),
      this.popRepo.findCatalogueBySha256(sha256),
    ]);
    if (ownDuplicate) {
      if (ownDuplicate.status === 'failed') {
        // A failed doc never reached PoP, so it isn't a real duplicate — just dead weight left
        // over from the earlier attempt. Clear it out of the way instead of trapping the user
        // behind their own failure with no way to retry.
        await this.pendingRepo.deleteById(String(ownDuplicate._id));
      } else {
        throw new ConflictError(`This exact file is already in your upload queue as "${ownDuplicate.filename}"`);
      }
    }
    if (popQueued) {
      throw new ConflictError(
        `This exact file is already in the PoP upload queue as "${popQueued.filename || 'an upload'}"`,
      );
    }
    // shareable_name is the one catalogue field we can rely on here — confirmed present on
    // IPop; PoP's own ANNAM_##### display code isn't modeled on our direct read of
    // pop_unique_documents, so the warning names the document instead.
    const warning = popCatalogued
      ? `This file is already in the catalogue as "${popCatalogued.shareable_name}" — uploading it will file it in the folders you chose.`
      : undefined;

    const doc = await this.pendingRepo.create(
      {
        filename: file.originalname,
        mimetype: file.mimetype,
        sha256,
        fields,
        placements,
        language,
        uploaderId,
        popUserId,
        popUserRole,
        error: null,
      },
      file.buffer,
    );

    // Fire-and-forget — intake responds as soon as the bytes are durably in GridFS, the actual
    // forward to PoP happens in the background regardless of whether this request's caller is
    // still connected.
    this.processQueue().catch(err => console.error('[PopUploadsService] processQueue failed', err));

    return {id: String(doc._id), status: 'received', warning};
  }

  async getMine(uploaderId: string): Promise<PopUploadSummary[]> {
    const docs = await this.pendingRepo.findByUploader(uploaderId);
    const live = await Promise.all(docs.map(doc => this.pruneIfResolved(doc)));
    return live.filter((doc): doc is IPendingPopUpload => doc !== null).map(toSummary);
  }

  // Nothing else ever removes a `succeeded` tracking doc (GridFS bytes are already gone by
  // then — only the metadata row is left). Once PoP no longer has this sha256 in its own live
  // queue, the item has been resolved there (catalogued or rejected/removed) and our row is
  // stale, so prune it here, lazily, the same fetch-on-view way History already works — no new
  // polling/cron needed. `received`/`processing` are still in flight and `failed` never reached
  // PoP's queue in the first place, so only `succeeded` is eligible for this check.
  private async pruneIfResolved(doc: IPendingPopUpload): Promise<IPendingPopUpload | null> {
    if (doc.status !== 'succeeded') return doc;
    const stillQueued = await this.popRepo.findQueuedBySha256(doc.sha256);
    if (stillQueued) return doc;
    await this.pendingRepo.deleteById(String(doc._id));
    return null;
  }

  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const doc = await this.pendingRepo.claimNext();
        if (!doc) break;
        await this.forwardOne(doc);
      }
    } finally {
      this.processing = false;
    }
  }

  // One retry, and only for a network error or a 5xx — PoP's own 4xx answers (400, 401, 409)
  // are final, per the PoP team. The 409 caveat: if attempt 1 actually reached PoP (it got
  // queued there) but WE never saw the 201 (dropped connection, proxy timeout — exactly what
  // the earlier large-upload 503s were), the retry gets PoP's duplicate-by-sha256 409 back.
  // That's not a real failure, it means attempt 1 already succeeded — treat a 409 on the RETRY
  // as success. A 409 on the FIRST attempt is a genuine duplicate and is reported as a failure.
  private async forwardOne(doc: IPendingPopUpload): Promise<void> {
    const id = String(doc._id);
    const first = await this.forwardToPop(doc);
    if (first.ok) {
      await this.pendingRepo.markSucceeded(id);
      await this.pendingRepo.deleteFile(doc.gridfsFileId);
      return;
    }
    if (!first.retryable) {
      await this.pendingRepo.markFailed(id, first.error);
      await this.pendingRepo.deleteFile(doc.gridfsFileId);
      return;
    }

    await this.pendingRepo.incrementAttempts(id);
    const retry = await this.forwardToPop(doc);
    if (retry.ok) {
      await this.pendingRepo.markSucceeded(id);
      await this.pendingRepo.deleteFile(doc.gridfsFileId);
      return;
    }
    if (retry.status === 409) {
      // Attempt 1 landed at PoP even though we didn't see it succeed — treat as delivered.
      await this.pendingRepo.markSucceeded(id);
      await this.pendingRepo.deleteFile(doc.gridfsFileId);
      return;
    }
    await this.pendingRepo.markFailed(id, retry.error);
    await this.pendingRepo.deleteFile(doc.gridfsFileId);
  }

  private async forwardToPop(doc: IPendingPopUpload): Promise<PopForwardResult> {
    if (!faqPopConfig.popApiUrl) {
      return {ok: false, error: 'POP_API_URL is not configured', retryable: false};
    }
    try {
      const buffer = await streamToBuffer(await this.pendingRepo.readFile(doc.gridfsFileId));
      const formData = new FormData();
      formData.append('file', new Blob([buffer], {type: doc.mimetype}), doc.filename);
      formData.append('placements_json', JSON.stringify(doc.placements));
      formData.append('language', doc.language);
      // Mirrors uploadDashboardDocument in frontend/src/features/faq-pop/api.ts exactly: domain
      // goes as its own JSON-encoded field (commas inside domain names would otherwise break a
      // plain comma-joined value), every other field goes as a plain form field.
      const {domain, ...rest} = doc.fields as Record<string, unknown>;
      if (Array.isArray(domain) && domain.length > 0) {
        formData.append('domain_json', JSON.stringify(domain));
      }
      for (const [key, value] of Object.entries(rest)) {
        if (value !== '' && value != null) formData.append(key, String(value));
      }

      // Matches the /api/pop proxy's own POP_PROXY_TIMEOUT_MS (index.ts) — without this, a truly
      // dead tailnet link hangs this fetch forever, which would stall the whole queue behind it
      // (processQueue is sequential), not just this one upload.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch(`${faqPopConfig.popApiUrl}/dashboard/uploads`, {
          method: 'POST',
          headers: {'X-User-Id': doc.popUserId, 'X-User-Role': doc.popUserRole},
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (res.ok) return {ok: true};

      const status = res.status;
      let detail = `HTTP ${status}`;
      try {
        const body: any = await res.json();
        if (body?.detail) detail = body.detail;
      } catch {
        // ignore parse error, fall back to the status-only message
      }
      // Only a network error or a 5xx is worth retrying — every 4xx PoP returns (400, 401, 409)
      // is a final answer.
      const retryable = status >= 500;
      return {ok: false, status, error: detail, retryable};
    } catch (err: any) {
      return {ok: false, error: err?.message || 'Network error forwarding to PoP', retryable: true};
    }
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
