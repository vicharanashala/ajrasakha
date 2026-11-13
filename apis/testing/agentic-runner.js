import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  startClassifierMock,
  startChemicalDetectorMock,
  startWritingAssistantMock,
  startWeatherMock,
} from './mock-apis-server.js';
import { generateQAReport } from './generate-qa-report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apisTestingDir = __dirname;
const rootDir = path.resolve(__dirname, '../..');

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    console.log(`\n\x1b[36m[apis-test-runner]\x1b[0m ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      cwd: options.cwd || apisTestingDir,
      shell: true,
      env: { ...process.env, ...options.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      const str = d.toString();
      stdout += str;
      process.stdout.write(str);
    });

    proc.stderr.on('data', (d) => {
      const str = d.toString();
      stderr += str;
      process.stderr.write(str);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('    AJRASAKHA APIS DIRECTORY - AGENTIC TESTING ORCHESTRATOR     ');
  console.log('         (Isolated strictly within apis/ directory)             ');
  console.log('================================================================');

  let servers = [];
  try {
    const res = await fetch('http://localhost:8005/health', { signal: AbortSignal.timeout(800) });
    if (!res.ok) throw new Error();
    console.log('[apis-runner] Live microservices detected on port 8005.');
  } catch {
    console.log('[apis-runner] Launching isolated apis/ mock harnesses on ports 8005, 8002, 8004, 8000...');
    servers = [
      startClassifierMock(8005),
      startChemicalDetectorMock(8002),
      startWritingAssistantMock(8004),
      startWeatherMock(8000),
    ];
    await new Promise((r) => setTimeout(r, 600));
  }

  const results = {
    promptfoo: null,
    apiTests: null,
    uiTests: null,
  };

  try {
    // 1. Promptfoo LLMs Response Testing (promptfooconfig.yaml)
    console.log('\n--- 1. Promptfoo: LLMs Response Evaluation & Guardrails ---');
    results.promptfoo = await runCommand('npx', [
      'promptfoo',
      'eval',
      '--config',
      'promptfoo/promptfooconfig.yaml',
      '--output',
      'reports/promptfoo-results.json',
      '--no-cache',
    ]);

    // 2. Playwright Backend API Testing (microservices in apis/)
    console.log('\n--- 2. Playwright: Backend API Testing (apis/ Microservices) ---');
    results.apiTests = await runCommand('npx', [
      'playwright',
      'test',
      '--config',
      'playwright.config.ts',
      '--project=api',
    ]);

    // 3. Playwright UI Testing (Swagger / Web Docs UI for apis/)
    console.log('\n--- 3. Playwright: Web UI Testing (FastAPI /docs Web Apps) ---');
    results.uiTests = await runCommand('npx', [
      'playwright',
      'test',
      '--config',
      'playwright.config.ts',
      '--project=ui',
    ]);
  } finally {
    for (const s of servers) {
      s.close();
    }
  }

  console.log('\n================================================================');
  console.log('                 APIS TEST EXECUTION SUMMARY                    ');
  console.log('================================================================');
  console.log(`1. Promptfoo LLMs Evaluation: ${results.promptfoo?.code === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log(`2. Playwright API Tests:      ${results.apiTests?.code === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log(`3. Playwright Web UI Tests:   ${results.uiTests?.code === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log('================================================================\n');

  // Generate Quality Gate & Agentic QA Verification Markdown Report
  try {
    generateQAReport({ results });
  } catch (err) {
    console.error('[apis-runner] Failed to generate QA report:', err.message);
  }

  const allPassed =
    results.promptfoo?.code === 0 &&
    results.apiTests?.code === 0 &&
    results.uiTests?.code === 0;

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
