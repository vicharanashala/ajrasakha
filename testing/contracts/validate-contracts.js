import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { runBackendFrontendSuite } from './suites/backend-frontend-contracts.js';
import { runAiMcpSuite } from './suites/ai-mcp-contracts.js';
import { runMicroservicesSuite } from './suites/microservices.js';
import { runTypeParitySuite } from './suites/type-parity.js';
import { runEdgeCasesSuite } from './suites/edge-cases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const reportsDir = path.join(__dirname, 'reports');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

console.log('\x1b[1m\x1b[36m');
console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
console.log('║        LAYER 2: AJRASAKHA ENTERPRISE CROSS-BOUNDARY CONTRACT GATEWAY          ║');
console.log('║        (Frontend <-> Backend, AI <-> MCP, Microservices & Edge Scenarios)     ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
console.log('\x1b[0m');

const results = {
  timestamp: new Date().toISOString(),
  contractsChecked: 0,
  passed: 0,
  failed: 0,
  categories: {},
  details: [],
};

function recordContract(category, name, status, message, details = {}) {
  results.contractsChecked++;
  if (status === 'PASS') {
    results.passed++;
  } else {
    results.failed++;
  }

  if (!results.categories[category]) {
    results.categories[category] = { total: 0, passed: 0, failed: 0 };
  }
  results.categories[category].total++;
  if (status === 'PASS') results.categories[category].passed++;
  else results.categories[category].failed++;

  const badge = status === 'PASS' ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`  ${badge} \x1b[1m[${category}]\x1b[0m ${name}`);
  console.log(`         \x1b[90m↳ ${message}\x1b[0m`);

  results.details.push({
    category,
    name,
    status,
    message,
    ...details,
  });
}

// ─── EXECUTE SUITES ───
console.log('\n\x1b[1m\x1b[33m>>> 1. Validating Frontend <-> Backend REST & Controller Contracts...\x1b[0m');
runBackendFrontendSuite(rootDir, recordContract);

console.log('\n\x1b[1m\x1b[33m>>> 2. Validating AI LangGraph Engine <-> FastMCP Tool Signatures...\x1b[0m');
runAiMcpSuite(rootDir, recordContract);

console.log('\n\x1b[1m\x1b[33m>>> 3. Validating Specialized Microservices & Cross-Service Integrations...\x1b[0m');
runMicroservicesSuite(rootDir, recordContract);

console.log('\n\x1b[1m\x1b[33m>>> 4. Validating Cross-Boundary Type System & Enum Parity...\x1b[0m');
runTypeParitySuite(rootDir, recordContract);

console.log('\n\x1b[1m\x1b[33m>>> 5. Executing Synthetic Edge Case Matrices & Boundary Fuzzing...\x1b[0m');
runEdgeCasesSuite(rootDir, recordContract);

// ─── GENERATE STRUCTURED AUDIT REPORT ───
const complianceScore = Math.round((results.passed / results.contractsChecked) * 100);
const reportPath = path.join(reportsDir, 'contracts-verification-report.md');

let md = `# Ajrasakha Layer 2: Cross-Boundary Contract Verification Report\n\n`;
md += `**Execution Time:** ${results.timestamp}  \n`;
md += `**Total Contracts Checked:** ${results.contractsChecked}  \n`;
md += `**Passed:** ${results.passed} | **Failed:** ${results.failed}  \n`;
md += `**Overall Compliance Score:** ${complianceScore}%  \n`;
md += `**Gate Status:** ${results.failed === 0 ? '🟢 PASSED (PR Eligible for Merge)' : '🔴 FAILED (Contract Regressions Detected)'}\n\n`;

md += `## 1. Category Score Summary\n\n`;
md += `| Category | Total Checked | Passed | Failed | Compliance Rate |\n`;
md += `| :--- | :---: | :---: | :---: | :---: |\n`;

for (const [cat, stats] of Object.entries(results.categories)) {
  const rate = Math.round((stats.passed / stats.total) * 100);
  const statusBadge = stats.failed === 0 ? '🟢 100%' : `🔴 ${rate}%`;
  md += `| **${cat}** | ${stats.total} | ${stats.passed} | ${stats.failed} | ${statusBadge} |\n`;
}

md += `\n## 2. Detailed Contract & Edge Case Breakdown\n\n`;
md += `| Category | Contract / Service | Status | Verification Summary |\n`;
md += `| :--- | :--- | :---: | :--- |\n`;

for (const d of results.details) {
  const icon = d.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  md += `| **${d.category}** | \`${d.name}\` | ${icon} | ${d.message} |\n`;
}

md += `\n---\n`;
md += `*Report generated automatically by Ajrasakha Layer 2 Enterprise Contract Gatekeeper*\n`;

fs.writeFileSync(reportPath, md, 'utf8');

console.log('\n\x1b[1m\x1b[36m═══════════════════════════════════════════════════════════════════════════════\x1b[0m');
console.log(`  \x1b[1mCONTRACT VERIFICATION COMPLETED:\x1b[0m ${results.passed}/${results.contractsChecked} Passed (${results.failed} Failures)`);
console.log(`  \x1b[1mCOMPLIANCE SCORE:\x1b[0m ${complianceScore}%  -  ${results.failed === 0 ? '\x1b[32m[ALL CONTRACTS SATISFIED]\x1b[0m' : '\x1b[31m[REGRESSIONS DETECTED]\x1b[0m'}`);
console.log(`  \x1b[1mREPORT WRITTEN TO:\x1b[0m ${reportPath}`);
console.log('\x1b[1m\x1b[36m═══════════════════════════════════════════════════════════════════════════════\x1b[0m\n');

process.exit(results.failed > 0 ? 1 : 0);
