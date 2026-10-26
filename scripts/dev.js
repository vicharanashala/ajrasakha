import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Ajrasakha Backend & Frontend...');

const backend = spawn('pnpm', ['run', 'dev'], {
  cwd: path.join(rootDir, 'backend'),
  shell: true,
  stdio: 'inherit',
});

const frontend = spawn('pnpm', ['run', 'dev'], {
  cwd: path.join(rootDir, 'frontend'),
  shell: true,
  stdio: 'inherit',
});

function cleanup() {
  console.log('\n🛑 Stopping servers...');
  backend.kill('SIGINT');
  frontend.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

