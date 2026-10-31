import { env } from "@/config/env";

const LIBRARY_PATH = "/gdb-cleaning/library/";
const LIBRARY_SUFFIX = "/pdf";

// where a library document is read from; a source with this address opens at its page in the app
export const libraryDocumentUrl = (documentId: string): string =>
  `${env.apiBaseUrl()}${LIBRARY_PATH}${encodeURIComponent(documentId)}${LIBRARY_SUFFIX}`;

// the document id inside such an address, or null when the source is some other link
export const libraryDocumentIdOf = (source: string): string | null => {
  const start = source.indexOf(LIBRARY_PATH);
  if (start < 0 || !source.endsWith(LIBRARY_SUFFIX)) return null;
  const id = source.slice(start + LIBRARY_PATH.length, source.length - LIBRARY_SUFFIX.length);
  return id ? decodeURIComponent(id) : null;
};
