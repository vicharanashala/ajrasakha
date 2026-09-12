import { env } from "@/config/env";

const FAQ_API = (env.faqApiUrl() || "").replace(/\/$/, "");
const POP_API = (env.popApiUrl() || "").replace(/\/$/, "");

async function _handleResponse(res: Response) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }
  // 204 No Content (used by every DELETE in the dashboard API) has no body — res.json() would
  // throw on the empty string.
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// FAQ Cluster — file management
// ---------------------------------------------------------------------------

export async function getTree() {
  const res = await fetch(`${FAQ_API}/files/tree`);
  return _handleResponse(res);
}

export function downloadUrl(path: string) {
  return `${FAQ_API}/files/download/${path}`;
}

export function outputDownloadUrl(state: string, district: string, crop: string) {
  return `${FAQ_API}/app/output/${encodeURIComponent(state)}/${encodeURIComponent(district)}/${encodeURIComponent(crop)}`;
}

export async function deleteFile(path: string) {
  const res = await fetch(`${FAQ_API}/files/${path}`, { method: "DELETE" });
  return _handleResponse(res);
}

export async function renameFile(fromPath: string, toPath: string) {
  const res = await fetch(`${FAQ_API}/files/rename/${fromPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: toPath }),
  });
  return _handleResponse(res);
}

export async function deleteFolder(path: string) {
  const res = await fetch(`${FAQ_API}/folders/${path}`, { method: "DELETE" });
  return _handleResponse(res);
}

export async function createFolder(path: string) {
  const res = await fetch(`${FAQ_API}/files/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return _handleResponse(res);
}

const _CHUNK_SIZE = 800 * 1024;

async function _uploadChunked(
  file: File,
  dest: string,
  chunkEndpoint: string,
  onProgress?: (pct: number) => void,
) {
  const totalChunks = Math.ceil(file.size / _CHUNK_SIZE);
  const uploadId = crypto.randomUUID();
  let result;
  for (let i = 0; i < totalChunks; i++) {
    const chunk = file.slice(
      i * _CHUNK_SIZE,
      Math.min((i + 1) * _CHUNK_SIZE, file.size),
    );
    const params = new URLSearchParams({
      upload_id: uploadId,
      chunk_index: String(i),
      total_chunks: String(totalChunks),
      filename: file.name,
      dest: dest || "",
    });
    const res = await fetch(`${chunkEndpoint}?${params}`, {
      method: "POST",
      body: chunk,
      headers: { "Content-Type": "application/octet-stream" },
    });
    result = await _handleResponse(res);
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }
  return result;
}

export async function uploadFile(
  file: File,
  dest = "",
  onProgress?: (pct: number) => void,
) {
  if (file.size > _CHUNK_SIZE)
    return _uploadChunked(
      file,
      dest,
      `${FAQ_API}/files/upload-chunk`,
      onProgress,
    );
  const fd = new FormData();
  fd.append("file", file);
  const url = dest
    ? `${FAQ_API}/files/upload?dest=${encodeURIComponent(dest)}`
    : `${FAQ_API}/files/upload`;
  const res = await fetch(url, { method: "POST", body: fd });
  const result = await _handleResponse(res);
  onProgress?.(100);
  return result;
}

export async function uploadAuditedFile(
  file: File,
  state: string,
  district: string,
  crop: string,
) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("state", state);
  fd.append("district", district);
  fd.append("crop", crop);
  const res = await fetch(`${FAQ_API}/files/upload-audited`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// FAQ Cluster — pipeline runs
// ---------------------------------------------------------------------------

export async function runPre(body: object) {
  const res = await fetch(`${FAQ_API}/run/pre`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _handleResponse(res);
}

export async function runPipeline(body: object) {
  const res = await fetch(`${FAQ_API}/run/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _handleResponse(res);
}

export async function runPost(body: object) {
  const res = await fetch(`${FAQ_API}/run/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _handleResponse(res);
}

export async function runFull(body: object) {
  const res = await fetch(`${FAQ_API}/run/full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// FAQ Cluster — app utility
// ---------------------------------------------------------------------------

export async function getNextState(state = "", domains: string[] = [], district = "") {
  const params = new URLSearchParams({ state });
  if (district) params.set("district", district);
  for (const d of domains) params.append("domains", d);
  const res = await fetch(`${FAQ_API}/app/next-state?${params}`);
  return _handleResponse(res);
}

export async function getStateTable() {
  const res = await fetch(`${FAQ_API}/app/state-table`);
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// FAQ Cluster — job management
// ---------------------------------------------------------------------------

export async function getJobs() {
  const res = await fetch(`${FAQ_API}/jobs`);
  return _handleResponse(res);
}

export async function getJob(jobId: string) {
  const res = await fetch(`${FAQ_API}/jobs/${jobId}`);
  return _handleResponse(res);
}

export async function deleteJob(jobId: string) {
  const res = await fetch(`${FAQ_API}/jobs/${jobId}`, { method: "DELETE" });
  return _handleResponse(res);
}

export async function stopJob(jobId: string) {
  const res = await fetch(`${FAQ_API}/jobs/${jobId}/stop`, { method: "POST" });
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// POP Translation — calls the separate POP server
// ---------------------------------------------------------------------------

export async function getPopStates() {
  const res = await fetch(`${POP_API}/states`);
  const data = await _handleResponse(res);
  return Array.isArray(data) ? { states: data } : data;
}

export async function getPopCrops(state: string) {
  const res = await fetch(
    `${POP_API}/crops?state=${encodeURIComponent(state)}`,
  );
  const data = await _handleResponse(res);
  return Array.isArray(data) ? { crops: data } : data;
}

export async function getPopDocs(state: string, crop: string) {
  const res = await fetch(
    `${POP_API}/docs?state=${encodeURIComponent(state)}&crop=${encodeURIComponent(crop)}`,
  );
  const data = await _handleResponse(res);
  return Array.isArray(data) ? { docs: data } : data;
}

export async function getPopJob(jobId: string) {
  const res = await fetch(`${POP_API}/jobs/${jobId}`);
  return _handleResponse(res);
}

export async function stopPopJob(jobId: string) {
  const res = await fetch(`${POP_API}/jobs/${jobId}/stop`, {
    method: "POST",
  });
  return _handleResponse(res);
}

export async function getPopDataTree() {
  const res = await fetch(`${POP_API}/data/tree`);
  return _handleResponse(res);
}

export async function getPopOutputTree() {
  const res = await fetch(`${POP_API}/output/tree`);
  return _handleResponse(res);
}

export async function getPopStateTable() {
  const res = await fetch(`${POP_API}/state-table`);
  return _handleResponse(res);
}

export async function runPop(body: object) {
  const res = await fetch(`${POP_API}/run/pop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _handleResponse(res);
}

export async function createPopState(state: string) {
  const res = await fetch(`${POP_API}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return _handleResponse(res);
}

export async function createPopCrop(state: string, crop: string) {
  const res = await fetch(`${POP_API}/crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, crop }),
  });
  return _handleResponse(res);
}

export async function uploadPopDoc(file: File, state: string, crop: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("state", state);
  fd.append("crop", crop);
  const res = await fetch(`${POP_API}/upload-doc`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

export async function deletePopDoc(
  state: string,
  crop: string,
  docName: string,
) {
  const params = new URLSearchParams({ state, crop, doc_name: docName });
  const res = await fetch(`${POP_API}/doc?${params}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

export async function deleteEmptyPopCrop(state: string, crop: string) {
  const params = new URLSearchParams({ state, crop });
  const res = await fetch(`${POP_API}/crop?${params}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

export async function deleteEmptyPopState(state: string) {
  const params = new URLSearchParams({ state });
  const res = await fetch(`${POP_API}/state?${params}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

export function popDownloadUrl(path: string) {
  return `${POP_API}/download/${path}`;
}

export function popOutputDownloadUrl(
  state: string,
  crop: string,
  docName: string,
) {
  const params = new URLSearchParams({ state, crop, doc_name: docName });
  return `${POP_API}/output?${params}`;
}

export async function uploadPopFile(
  file: File,
  dest = "",
  onProgress?: (pct: number) => void,
) {
  if (file.size > _CHUNK_SIZE)
    return _uploadChunked(
      file,
      dest,
      `${POP_API}/upload-chunk`,
      onProgress,
    );
  const fd = new FormData();
  fd.append("file", file);
  const url = dest
    ? `${POP_API}/upload?dest=${encodeURIComponent(dest)}`
    : `${POP_API}/upload`;
  const res = await fetch(url, { method: "POST", body: fd });
  const result = await _handleResponse(res);
  onProgress?.(100);
  return result;
}

export async function deletePopFile(path: string) {
  const res = await fetch(`${POP_API}/files/${path}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

export async function deletePopFolder(path: string) {
  const res = await fetch(`${POP_API}/folders/${path}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

export async function uploadPopAuditedFile(
  file: File,
  state: string,
  crop: string,
  docName: string,
) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("state", state);
  fd.append("crop", crop);
  fd.append("doc_name", docName);
  const res = await fetch(`${POP_API}/upload-audited`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

// ---------------------------------------------------------------------------
// Document Management — /dashboard routes on the same POP server
//
// Verified against docs/first_render_frontend.md (backend branch `first_render`) — a different
// schema than the old POP-Translation Postgres backend docs/dashboard_frontend_plan.md described
// (Mongo ObjectId ids, placements vs. documents, PATCH-routes-itself, etc.). Don't cross-check
// anything here against that old doc, it explicitly no longer applies.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100;

// Multiple selected values for one filter key are joined into a single comma-separated value
// (`filter[state]=Karnataka,Kerala`) rather than sent as repeated `filter[state]=` params —
// confirmed by the backend: Starlette was keeping only the last of several repeated query params,
// which is why a multi-select only ever narrowed to the last selection. `filter[key]=A,B` now
// works on every key (a single selection still sends one plain value, unaffected either way).
function _buildListParams(page: number, filters: Record<string, string[]>) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  for (const [key, values] of Object.entries(filters || {})) {
    const clean = (values || []).filter((v) => v !== "" && v != null);
    if (clean.length > 0) params.set(`filter[${key}]`, clean.join(","));
  }
  return params;
}

// A row arrives with its document already joined (state/crop/language/translation_status/etc.
// are plain fields, not a second request) — see MainTable.tsx.
export async function getDashboardDocuments(
  page = 1,
  filters: Record<string, string[]> = {},
) {
  const params = _buildListParams(page, filters);
  const res = await fetch(`${POP_API}/dashboard/documents?${params}`);
  return _handleResponse(res);
}

export async function getDashboardDocument(id: string) {
  const res = await fetch(`${POP_API}/dashboard/documents/${id}`);
  return _handleResponse(res);
}

// The document's OTHER placements (this row excluded).
export async function getDocumentSiblings(id: string) {
  const res = await fetch(`${POP_API}/dashboard/documents/${id}/siblings`);
  return _handleResponse(res);
}

// PATCH routes itself server-side — send any mix of a placement field (state, crop) and document
// fields (season, language, ...) in one call; the backend decides where each lands. `language` is
// validated against GET /languages (400 on an unknown code) and stamps language_source: "manual".
export async function updateDashboardDocument(
  id: string,
  fields: Record<string, unknown>,
) {
  const res = await fetch(`${POP_API}/dashboard/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return _handleResponse(res);
}

// Removes the PLACEMENT only — never the document, even on its last placement. Its metadata and
// any translation survive.
export async function deleteDashboardDocument(id: string) {
  const res = await fetch(`${POP_API}/dashboard/documents/${id}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

// {documents, files, states, crops, translated, reviewed} — `documents` means placements,
// `files` means documents. The raw key names read backwards; label them for humans on display.
export async function getStats() {
  const res = await fetch(`${POP_API}/dashboard/stats`);
  return _handleResponse(res);
}

// One row per document (not per placement) — the "Documents tab" counterpart of
// getDashboardDocuments. Real server-side pagination; don't build this by de-duplicating the
// main table client-side (a page of placements collapses to an unpredictable document count).
export async function getDashboardUniqueDocuments(
  page = 1,
  filters: Record<string, string[]> = {},
) {
  const params = _buildListParams(page, filters);
  const res = await fetch(`${POP_API}/dashboard/unique-documents?${params}`);
  return _handleResponse(res);
}

export async function getDashboardUniqueDocument(id: string) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}`);
  return _handleResponse(res);
}

// Also accepts { representative_file_id } to re-anchor onto a different physical copy from
// duplicate_links — 400 unless that file is one of this document's own copies.
export async function updateDashboardUniqueDocument(
  id: string,
  fields: Record<string, unknown>,
) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return _handleResponse(res);
}

// Real cascade delete — NOT the placement-only semantics of deleteDashboardDocument. Removes the
// document, every one of its placements, and every file it owns (each duplicate_links copy, the
// translation, the review) from WorkDrive too. Zoho moves deleted files to trash rather than
// purging them, so this is recoverable from WorkDrive's own trash — but nothing in this dashboard
// can undo it, so the caller must confirm with real numbers (placement_count,
// duplicate_links.length) before calling this, not just a generic "are you sure?".
// 409 if a translation job for the document is queued/running (cancel it first). 502 if WorkDrive
// refuses to delete a file — files are removed before any database row, so a 502 here leaves the
// database exactly as it was and the call is safely retryable.
export async function deleteDashboardUniqueDocument(id: string) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

// Every row using this document.
export async function getUniqueDocumentPlacements(id: string) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}/placements`);
  return _handleResponse(res);
}

// Absorbs the documents in `absorb` (ANNAM_ ids or ObjectId hex) into `id`. The absorbed
// documents are deleted; their placements are repointed (never deleted) and their copies join
// the survivor's duplicate_links. The survivor's anchor does not move.
export async function mergeUniqueDocuments(id: string, absorb: string[]) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ absorb }),
  });
  return _handleResponse(res);
}

// Always returns { document_id, candidates: [], note } today — the chunk-match algorithm isn't
// connected yet. Show `note` verbatim rather than "no duplicates found", which would be false.
export async function findDuplicatesForRow(rowId: string) {
  const res = await fetch(`${POP_API}/dashboard/documents/${rowId}/find-duplicates`, {
    method: "POST",
  });
  return _handleResponse(res);
}

export async function findDuplicatesForDocument(id: string) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}/find-duplicates`, {
    method: "POST",
  });
  return _handleResponse(res);
}

export async function getDashboardStates() {
  const res = await fetch(`${POP_API}/dashboard/states`);
  return _handleResponse(res);
}

// `state` narrows to crops actually used in that state.
export async function getDashboardCrops(state?: string) {
  const qs = state ? `?state=${encodeURIComponent(state)}` : "";
  const res = await fetch(`${POP_API}/dashboard/crops${qs}`);
  return _handleResponse(res);
}

export async function createDashboardState(name: string) {
  const res = await fetch(`${POP_API}/dashboard/states`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return _handleResponse(res);
}

export async function createDashboardCrop(name: string) {
  const res = await fetch(`${POP_API}/dashboard/crops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return _handleResponse(res);
}

// 14 tessdata languages + non_english — the only valid source for a language dropdown, don't
// hardcode a list client-side.
export async function getDashboardLanguages() {
  const res = await fetch(`${POP_API}/dashboard/languages`);
  return _handleResponse(res);
}

// `placements` is the per-state crop-group shape: [{state, crops: [...]}, ...] — sent as
// placements_json. (states_json/crops_json cross-product is also accepted server-side but only
// makes sense when every state gets the same crop list, so it isn't used here.)
export async function uploadDashboardDocument(
  file: File,
  fields: Record<string, string>,
  placements: { state: string; crops: string[] }[],
  language: string,
) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("placements_json", JSON.stringify(placements));
  fd.append("language", language);
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== "" && value != null) fd.append(key, value);
  }
  const res = await fetch(`${POP_API}/dashboard/uploads`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

// Not explicitly re-documented in docs/first_render_frontend.md (only `GET /uploads/{id}`
// polling is shown there) — kept as a carried-over assumption since the multi-item Upload Queue
// panel has no other data source and nothing suggests this list endpoint went away.
export async function getDashboardUploads() {
  const res = await fetch(`${POP_API}/dashboard/uploads`);
  return _handleResponse(res);
}

export async function getDashboardUpload(id: string) {
  const res = await fetch(`${POP_API}/dashboard/uploads/${id}`);
  return _handleResponse(res);
}

export async function cancelDashboardUpload(id: string) {
  const res = await fetch(`${POP_API}/dashboard/uploads/${id}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

// Every upload lands at awaiting_review with up to 3 ranked `candidates`, each carrying its own
// can_add/can_create_new/new_placements. `documentId` picks which candidate this is ("this IS the
// matched document") — may be omitted only when there's exactly one candidate. Links the new
// placement(s) onto it and removes the item from the queue. 409 if that candidate can't be added.
export async function addUploadToMatch(id: string, documentId?: string) {
  const res = await fetch(`${POP_API}/dashboard/uploads/${id}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(documentId ? { document_id: documentId } : {}),
  });
  return _handleResponse(res);
}

export async function addUploadAsNew(id: string) {
  // "This is actually a different document" (or there was no candidate at all) — creates it as
  // its own document. Async — a real Zoho upload happens server-side — keep polling
  // getDashboardUploads()/getDashboardUpload(id) until the item disappears (succeeded) or shows
  // status: "failed". 409 if the top candidate is an exact sha match (can_create_new: false).
  const res = await fetch(`${POP_API}/dashboard/uploads/${id}/new`, {
    method: "POST",
  });
  return _handleResponse(res);
}

export async function cancelPendingDuplicateUpload(id: string) {
  // "Discard" — nothing linked or created, any matched document untouched. 204.
  const res = await fetch(`${POP_API}/dashboard/uploads/${id}/cancel`, {
    method: "POST",
  });
  return _handleResponse(res);
}

// No status param = active jobs only (queued/running) — the live queue view. ?status=done/failed/
// cancelled for history.
export async function getDashboardTranslationJobs(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${POP_API}/dashboard/translation-jobs${qs}`);
  return _handleResponse(res);
}

export async function cancelDashboardTranslationJob(jobId: string) {
  const res = await fetch(`${POP_API}/dashboard/translation-jobs/${jobId}/cancel`, {
    method: "POST",
  });
  return _handleResponse(res);
}

// Removes a finished job row from the queue view only — does NOT touch the document
// (translation_status/translation_file_id are untouched, the queue is just a view of what's
// running). 409 for queued/running ("cancel it first") — cancel, then remove once it shows
// done/failed/cancelled.
export async function deleteDashboardTranslationJob(jobId: string) {
  const res = await fetch(`${POP_API}/dashboard/translation-jobs/${jobId}`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

// Placement-addressed. Jobs are per DOCUMENT, not per placement — translating from any one of a
// document's placements translates it once, and every sibling placement then shows
// translation_status: "done".
export async function translateDashboardDocument(placementId: string) {
  const res = await fetch(`${POP_API}/dashboard/documents/${placementId}/translate`, {
    method: "POST",
  });
  return _handleResponse(res);
}

// Document-addressed equivalent of translateDashboardDocument, for use where no single placement
// is in scope (e.g. the top level of a document detail view).
export async function translateUniqueDocument(id: string) {
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${id}/translate`, {
    method: "POST",
  });
  return _handleResponse(res);
}

export async function deleteDashboardTranslation(placementId: string) {
  const res = await fetch(`${POP_API}/dashboard/documents/${placementId}/translation`, {
    method: "DELETE",
  });
  return _handleResponse(res);
}

// Manual translation upload — for when someone already has a translated file (e.g. picked the
// better of two candidates produced elsewhere) rather than running the auto-translate job.
// Multipart, field name "file". Reaches the identical end state the async job does
// (translation_status: "done", translation_file_id + translation_shareable_link set) — the
// download icon already wired for translation lights up with no extra work.
//
// 409 while a job is queued/running for the document — the job would silently overwrite the file
// just attached when it finishes, so the backend refuses rather than let that happen silently;
// the error's `detail` says so and TranslateReviewCell surfaces it with a cancel-job action.
// Replacing an EXISTING translation deletes the superseded WorkDrive file so copies don't pile up
// unreachable (review's upload does NOT do this yet — it still orphans the old file; asymmetric
// on purpose per the backend, not a bug to "fix" here).
export async function uploadDashboardTranslation(placementId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${POP_API}/dashboard/documents/${placementId}/translation`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

// Document-addressed equivalent, for use where no single placement is in scope (Documents tab,
// Document Detail) — same semantics as translateUniqueDocument vs translateDashboardDocument.
export async function uploadUniqueDocumentTranslation(documentId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${POP_API}/dashboard/unique-documents/${documentId}/translation`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

// Multipart, a reviewed DOCX. Placement-addressed like translate/delete-translation above.
export async function uploadDashboardReview(placementId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${POP_API}/dashboard/documents/${placementId}/review`, {
    method: "POST",
    body: fd,
  });
  return _handleResponse(res);
}

// The backend proxies a WorkDrive file download through itself with a permissive CORS header
// (Allow-Origin: *), keyed by the file's zoho_file_id — so a browser can fetch() this directly
// with no Zoho CORS problem. FileActionIcons.tsx's Download button uses this whenever a file id
// is available (currently: a document's anchor copy, via its `representative_file_id`).
export function getFileDownloadUrl(fileId: string) {
  return `${POP_API}/dashboard/files/${fileId}/download`;
}

export async function getDashboardConfig() {
  const res = await fetch(`${POP_API}/dashboard/config`);
  return _handleResponse(res);
}
