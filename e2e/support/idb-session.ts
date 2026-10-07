import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Firebase Auth (JS SDK v10+) persists the signed-in session in IndexedDB
 * (`firebaseLocalStorageDb`), not localStorage. Playwright's `storageState()`
 * captures only cookies + localStorage, so a session saved by the setup project
 * is silently lost in role projects (the app redirects back to /auth).
 *
 * These helpers snapshot the IndexedDB auth store during setup and restore it,
 * via an init script that runs before the app's Firebase SDK reads the store, in
 * every role context. Local E2E only; the snapshot lives under `.auth/`
 * (gitignored). Staging runs are unaffected (no snapshot file exists there).
 */

const DB_NAME = "firebaseLocalStorageDb";
const STORE_NAME = "firebaseLocalStorage";

export type Role = "admin" | "moderator" | "expert";

function sessionFile(role: Role): string {
  return path.join(__dirname, "..", ".auth", `idb-${role}.json`);
}

interface FirebaseLocalStorageRow {
  fbase_key: string;
  value: unknown;
}

/** Dump the Firebase Auth session for a role to `.auth/idb-<role>.json`. */
export async function snapshotFirebaseSession(
  page: Page,
  role: Role,
): Promise<void> {
  const rows = await page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<FirebaseLocalStorageRow[]>((resolve, reject) => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const getAll = tx.objectStore(storeName).getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            const rows = getAll.result as FirebaseLocalStorageRow[];
            db.close();
            resolve(rows);
          };
        };
      }),
    { dbName: DB_NAME, storeName: STORE_NAME },
  );
  fs.mkdirSync(path.dirname(sessionFile(role)), { recursive: true });
  fs.writeFileSync(sessionFile(role), JSON.stringify(rows, null, 2));
}

/**
 * Restore a saved Firebase session into IndexedDB for every page the context
 * opens. Registered as an init script so the session is in place before the
 * app's Firebase SDK reads the store. No-op when the snapshot is absent
 * (staging, or setup has not run).
 */
export async function seedFirebaseSession(
  context: BrowserContext,
  role: Role,
): Promise<void> {
  const file = sessionFile(role);
  if (!fs.existsSync(file)) return;
  const rows = JSON.parse(
    fs.readFileSync(file, "utf8"),
  ) as FirebaseLocalStorageRow[];
  if (rows.length === 0) return;
  await context.addInitScript(
    ({ dbName, storeName, rows }) => {
      const openReq = indexedDB.open(dbName);
      openReq.onupgradeneeded = () => {
        if (!openReq.result.objectStoreNames.contains(storeName)) {
          openReq.result.createObjectStore(storeName, { keyPath: "fbase_key" });
        }
      };
      openReq.onsuccess = () => {
        const db = openReq.result;
        const tx = db.transaction(storeName, "readwrite");
        for (const row of rows) {
          tx.objectStore(storeName).put(row);
        }
        tx.oncomplete = () => db.close();
      };
    },
    { dbName: DB_NAME, storeName: STORE_NAME, rows },
  );
}
