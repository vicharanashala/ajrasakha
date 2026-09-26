/**
 * testers-dashboard/backend/ has no package.json dependencies of its own -
 * it shares this project's exact installed node_modules instead of a
 * second install (see testers-dashboard/backend/package.json). Node/tsc
 * resolve bare imports (inversify, googleapis, csv-parser, ...) by walking
 * up from the importing file's own directory, and testers-dashboard/ is a
 * sibling of backend/, not a descendant - so it needs its own node_modules
 * entry point. A directory junction (works without admin rights on
 * Windows, and as a plain symlink on POSIX) gives it one without copying
 * anything.
 *
 * Idempotent: safe to run on every `pnpm install`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target = path.resolve(__dirname, '../node_modules');
const linkPath = path.resolve(__dirname, '../../testers-dashboard/backend/node_modules');

if (fs.existsSync(linkPath)) {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    // Already linked - nothing to do.
    process.exit(0);
  }
  console.warn(
    `[link-testers-dashboard-deps] ${linkPath} already exists and is not a symlink/junction - leaving it alone.`,
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(linkPath), { recursive: true });
fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
console.log(`[link-testers-dashboard-deps] Linked ${linkPath} -> ${target}`);
