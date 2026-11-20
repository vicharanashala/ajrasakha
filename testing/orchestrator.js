import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const layerArg = args.find((a) => a.startsWith('--layer='));
const selectedLayer = layerArg ? layerArg.split('=')[1] : null;

function runStep(title, command, cmdArgs, options = {}) {
  return new Promise((resolve) => {
    console.log(`\n\x1b[35m>>> [EXECUTING] ${title}\x1b[0m`);
    console.log(`    Command: ${command} ${cmdArgs.join(' ')}\n`);
    const proc = spawn(command, cmdArgs, {
      cwd: options.cwd || rootDir,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...options.env },
    });

    proc.on('close', (code) => {
      resolve({ code });
    });
  });
}

async function main() {
  console.log('\x1b[1m\x1b[32m');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║               AJRASAKHA HYBRID AGENTIC TESTING ARCHITECTURE                  ║');
  console.log('║       Enterprise Multi-Layer CI/CD & Synthetic Verification Platform          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');

  const summary = {
    layer1_apis: null,
    layer2_contracts: null,
    layer3_synthetic: null,
  };

  // Determine what to run
  const shouldRunLayer1 = isAll || selectedLayer === '1';
  const shouldRunLayer2 = isAll || selectedLayer === '2';
  const shouldRunLayer3 = isAll || selectedLayer === '3' || (!selectedLayer && !isAll);

  if (!isAll && !selectedLayer) {
    console.log('\x1b[36mNote: Defaulting to Layer 2 (Contracts) and Layer 3 (Synthetic Journey).\x1b[0m');
    console.log('To run everything including APIs Playwright & Promptfoo, pass: \x1b[33m--all\x1b[0m\n');
  }

  // --- LAYER 1: APP-ISOLATED AGENTIC TESTING (apis/) ---
  if (shouldRunLayer1) {
    console.log('\n\x1b[1m--- LAYER 1: APP-ISOLATED AGENTIC TEST SUITE (apis/) ---\x1b[0m');
    console.log('Fast, isolated PR verification: Contracts, Swagger UI, Promptfoo LLM & Latency SLAs');
    const res = await runStep(
      'Layer 1: APIs Agentic Test Suite',
      'node',
      ['apis/testing/agentic-runner.js']
    );
    summary.layer1_apis = res.code === 0 ? 'PASSED' : 'FAILED';
  }

  // --- LAYER 2: CROSS-BOUNDARY CONTRACT & SCHEMA GATEWAY ---
  if (shouldRunLayer2 || (!selectedLayer && !isAll)) {
    console.log('\n\x1b[1m--- LAYER 2: CROSS-BOUNDARY CONTRACT & SCHEMA GATEWAY ---\x1b[0m');
    console.log('Validates Interface Parity across Backend <-> Frontend, AI <-> MCP, and Microservices');
    const res = await runStep(
      'Layer 2: Contract Verification',
      'node',
      ['testing/contracts/validate-contracts.js']
    );
    summary.layer2_contracts = res.code === 0 ? 'PASSED' : 'FAILED';
  }

  // --- LAYER 3: END-TO-END SYNTHETIC FARMER-TO-GDB JOURNEY ---
  if (shouldRunLayer3) {
    console.log('\n\x1b[1m--- LAYER 3: END-TO-END AGENTIC SYNTHETIC LIFECYCLE FLOW ---\x1b[0m');
    console.log('Simulates: Farmer Query -> GDB Miss -> AI Fallback -> Reviewer System -> 3 Peer Approvals -> Moderator Ingestion -> Closed-Loop Verify');
    const res = await runStep(
      'Layer 3: Synthetic Farmer Journey',
      'node',
      ['testing/e2e-synthetic/synthetic-farmer-journey.js']
    );
    summary.layer3_synthetic = res.code === 0 ? 'PASSED' : 'FAILED';
  }

  console.log('\n\x1b[1m\x1b[36m================================================================');
  console.log('              HYBRID ARCHITECTURE EXECUTION SUMMARY             ');
  console.log('================================================================\x1b[0m');

  if (summary.layer1_apis) {
    const badge = summary.layer1_apis === 'PASSED' ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m';
    console.log(`Layer 1 (App-Isolated CI - apis/):       ${badge}`);
  }
  if (summary.layer2_contracts) {
    const badge = summary.layer2_contracts === 'PASSED' ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m';
    console.log(`Layer 2 (Cross-Boundary Contract Gate):   ${badge}`);
  }
  if (summary.layer3_synthetic) {
    const badge = summary.layer3_synthetic === 'PASSED' ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m';
    console.log(`Layer 3 (E2E Synthetic Farmer Journey):   ${badge}`);
  }
  console.log('\x1b[36m================================================================\x1b[0m\n');

  const hasFailures = Object.values(summary).some((s) => s === 'FAILED');
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error('Orchestrator failed:', err);
  process.exit(1);
});
