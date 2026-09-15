/**
 * testers-dashboard/frontend/ has no node_modules of its own - Vite and
 * TypeScript both resolve bare imports (react, lucide-react, recharts, ...)
 * by walking up from the importing file's own directory, and
 * testers-dashboard/ is a sibling of frontend/, not a descendant. A
 * directory junction (works without admin rights on Windows, and as a
 * plain symlink on POSIX) gives it access to this project's exact
 * installed node_modules without a second install.
 *
 * Idempotent: safe to run on every `pnpm install`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target = path.resolve(__dirname, '../node_modules');
const linkPath = path.resolve(__dirname, '../../testers-dashboard/frontend/node_modules');

if (fs.existsSync(linkPath)) {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
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
