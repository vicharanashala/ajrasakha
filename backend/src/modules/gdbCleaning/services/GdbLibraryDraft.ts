import {spawn} from 'node:child_process';
import path from 'node:path';

// a passage from the library that the draft cites, with the document and page to open
export interface GdbDraftCitation {
  passageNumber: number;
  documentName: string | null;
  documentId: string | null;
  pageNumber: number | null;
  passageId: string | null;
}

export interface GdbDraft {
  answer: string;
  citations: GdbDraftCitation[];
  note: string;
}

// the Anara search and the Minimax draft live in the gdb-quality-pipeline repo. On a server
// the backend calls its draft service (GDB_DRAFT_URL); on a developer machine it can run the
// bridge script directly with that repo's venv Python
const DRAFT_TIMEOUT_MS = 240_000;

const draftUrl = () => process.env.GDB_DRAFT_URL;
const draftToken = () => process.env.GDB_DRAFT_TOKEN;
const pythonPath = () => process.env.GDB_DRAFT_PYTHON;
const pipelineDir = () => process.env.GDB_PIPELINE_DIR;

const draftOverHttp = async (
  url: string,
  question: string,
  crop: string | null,
): Promise<GdbDraft> => {
  const token = draftToken();
  const response = await fetch(`${url.replace(/\/+$/, '')}/draft`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? {'x-draft-token': token} : {}),
    },
    body: JSON.stringify({question, crop}),
    signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`Library draft failed (${response.status}): ${detail || 'no output'}`);
  }
  return (await response.json()) as GdbDraft;
};

// the crop of the record narrows the search to documents of that crop
export const draftFromLibrary = (
  question: string,
  crop: string | null = null,
): Promise<GdbDraft> => {
  const url = draftUrl();
  if (url) return draftOverHttp(url, question, crop);

  const python = pythonPath();
  const dir = pipelineDir();
  if (!python || !dir) {
    return Promise.reject(
      new Error(
        'Library draft is not configured: set GDB_DRAFT_URL, or GDB_DRAFT_PYTHON and GDB_PIPELINE_DIR',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(dir, 'draft_gdb_answer.py')], {cwd: dir});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), DRAFT_TIMEOUT_MS);

    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Library draft failed (exit ${code}): ${stderr.trim() || 'no output'}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as GdbDraft);
      } catch {
        reject(new Error(`Library draft returned unreadable output: ${stdout.slice(0, 200)}`));
      }
    });

    child.stdin.end(JSON.stringify({question, crop}));
  });
};

// a library document is kept as a PDF next to the draft service; this is the file a citation points to
export class GdbLibraryDocumentNotFound extends Error {}

export const fetchLibraryPdf = async (documentId: string): Promise<Buffer> => {
  const url = draftUrl();
  if (!url) {
    throw new Error('Opening a library document needs GDB_DRAFT_URL to be set');
  }
  const token = draftToken();
  const response = await fetch(
    `${url.replace(/\/+$/, '')}/documents/${encodeURIComponent(documentId)}/pdf`,
    {
      headers: token ? {'x-draft-token': token} : {},
      signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    },
  );
  if (response.status === 404) throw new GdbLibraryDocumentNotFound(documentId);
  if (!response.ok) {
    throw new Error(`Library document failed (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
};
