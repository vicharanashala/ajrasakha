import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let auditWorker: Worker | null = null;

export function initAuditWorker() {
  if (auditWorker) return auditWorker;

  const workerFile = path.join(__dirname, 'audit.worker.js');
  console.log("in audit worker manager")

  auditWorker = new Worker(workerFile, {
    workerData: {
      mongoUri: process.env.DB_URL!,
      dbName: process.env.DB_NAME!,
    },
  });

  auditWorker.on('error', (err) => {
    console.error('Audit Worker Error:', err);
  });

  auditWorker.on('exit', (code) => {
    console.error(`Audit Worker exited with code ${code}`);
    auditWorker = null; // allow restart
  });

  return auditWorker;
}