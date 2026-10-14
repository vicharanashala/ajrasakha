/**
 * Convert a base64 string + MIME type into a playable Blob URL.
 * Caller is responsible for revoking the URL with `URL.revokeObjectURL`.
 */
export function base64ToBlobUrl(
  audioBase64: string,
  contentType: string,
): string {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {type: contentType});
  return URL.createObjectURL(blob);
}

/**
 * Revoke a blob URL we created via `base64ToBlobUrl`. Safe to call with
 * null/undefined — no-ops.
 */
export function revokeBlobUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}