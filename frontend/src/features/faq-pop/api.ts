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
