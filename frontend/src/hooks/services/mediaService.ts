import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export type MediaKind = "carousel" | "outreach_image" | "outreach_video";

export interface MediaItem {
  _id: string;
  kind: MediaKind;
  url: string;
  storagePath: string;
  mimeType: string;
  size: number;
  title?: string;
  caption?: string;
  order: number;
  createdAt?: string;
}

/**
 * PUT a file straight to a GCS signed URL. Uses XHR (not fetch) because we need upload
 * progress events, which fetch doesn't expose. No auth header is sent — the signature in
 * the URL is the authorisation, and adding headers would break it.
 */
const putWithProgress = (
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). Check the bucket's CORS rules.`));
    xhr.onerror = () =>
      reject(new Error("Upload failed — the bucket may not allow PUT from this origin (CORS)."));
    xhr.send(file);
  });

export class MediaService {
  /** All dashboard routes (public reads + admin writes) live on the one controller. */
  private _baseUrl = `${API_BASE_URL}/dashboard/media`;

  /** Public list — no auth. */
  async list(kind?: MediaKind): Promise<MediaItem[] | null> {
    const qs = kind ? `?kind=${kind}` : "";
    return apiFetch<MediaItem[]>(`${this._baseUrl}${qs}`);
  }

  /**
   * Admin/moderator upload — goes DIRECTLY to the bucket via a signed PUT URL, so it is
   * not bound by the API's request-size limit (Cloud Run caps requests at 32 MiB, and
   * outreach videos are routinely 40 MB+).
   *
   *   1. ask the API for a signed URL
   *   2. PUT the bytes straight to GCS (XHR, so we get real progress)
   *   3. tell the API the upload finished so it records the file
   */
  async upload(
    params: { kind: MediaKind; file: File; title?: string; caption?: string },
    onProgress?: (percent: number) => void,
  ): Promise<MediaItem | null> {
    const { kind, file, title, caption } = params;
    const contentType = file.type || "application/octet-stream";

    // 1. signed URL
    const signed = await apiFetch<{
      uploadUrl: string;
      storagePath: string;
      publicUrl: string;
    }>(`${this._baseUrl}/upload-url`, {
      method: "POST",
      body: JSON.stringify({ kind, filename: file.name, contentType }),
    });
    if (!signed?.uploadUrl) throw new Error("Could not get an upload URL");

    // 2. direct PUT to the bucket (Content-Type MUST match what was signed)
    await putWithProgress(signed.uploadUrl, file, contentType, onProgress);

    // 3. record it
    return apiFetch<MediaItem>(`${this._baseUrl}/complete`, {
      method: "POST",
      body: JSON.stringify({
        kind,
        storagePath: signed.storagePath,
        ...(title ? { title } : {}),
        ...(caption ? { caption } : {}),
      }),
    });
  }

  /** Admin/moderator — removes the bucket object and the record. */
  async remove(id: string): Promise<{ deleted: boolean } | null> {
    return apiFetch<{ deleted: boolean }>(`${this._baseUrl}/${id}`, {
      method: "DELETE",
    });
  }
}
