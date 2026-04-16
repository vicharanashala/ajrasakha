import { initAuditWorker } from './auditworkermanager.js';
// import { buildAudit } from './audit.helper';

export function logAudit(payload: any) {
  try {
    console.log("Audit Data -> ", payload)
    const worker = initAuditWorker();
    if (!worker) return;

    // const audit = buildAudit(payload);

    worker.postMessage(payload); // 🔥 fire-and-forget
  } catch (err) {
    console.log("Audit logging failed logs ->", err)
    console.error('Audit logging failed:', err);
  }
}