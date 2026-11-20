import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  startClassifierMock,
  startChemicalDetectorMock,
  startWritingAssistantMock,
  startWeatherMock,
  startAiApiMock,
  startBackendApiMock,
  startWhatsappApiMock,
  startAllMcpMocks,
} from './mock-apis-server.js';
import { generateQAReport } from './generate-qa-report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apisTestingDir = __dirname;
const reportsDir = path.join(apisTestingDir, 'reports');

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

function mergePlaywrightResults() {
  const apiPath = path.join(reportsDir, 'api-test-results.json');
  const uiPath = path.join(reportsDir, 'ui-test-results.json');
  const mergedPath = path.join(reportsDir, 'apis-test-results.json');

  let apiData = null;
  let uiData = null;

  if (fs.existsSync(apiPath)) {
    try {
      apiData = JSON.parse(fs.readFileSync(apiPath, 'utf8'));
    } catch {}
  }

  if (fs.existsSync(uiPath)) {
    try {
      uiData = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
    } catch {}
  }

  if (apiData && uiData) {
    const merged = {
      ...apiData,
      suites: [...(apiData.suites || []), ...(uiData.suites || [])],
    };
    fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[apis-runner] Merged API and UI results into ${mergedPath}`);
  } else if (apiData) {
    fs.writeFileSync(mergedPath, JSON.stringify(apiData, null, 2), 'utf8');
  } else if (uiData) {
    fs.writeFileSync(mergedPath, JSON.stringify(uiData, null, 2), 'utf8');
  }
}

async function main() {
  console.log('================================================================');
  console.log('    AJRASAKHA APIS DIRECTORY - AGENTIC TESTING ORCHESTRATOR     ');
  console.log('    (Contracts, Layer 2 MCPs, LangGraph Agentic & Swagger UI)   ');
  console.log('================================================================');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  let servers = [];
  try {
    const res = await fetch('http://localhost:8005/health', { signal: AbortSignal.timeout(600) });
    if (!res.ok) throw new Error();
    console.log('[apis-runner] Live microservices detected on port 8005.');
  } catch {
    console.log('[apis-runner] Launching isolated apis/ and MCP mock harnesses...');
    servers = [
      startClassifierMock(8005),
      startChemicalDetectorMock(8002),
      startWritingAssistantMock(8004),
      startWeatherMock(8000),
      startAiApiMock(2026),
      startBackendApiMock(3000),
      startWhatsappApiMock(4000),
      ...startAllMcpMocks(),
    ];
    await new Promise((r) => setTimeout(r, 800));
    console.log('[apis-runner] All mock microservices successfully initialized.');
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

    // 2. Playwright Backend API Testing (Contracts, Boundary, Extended Contracts, MCP, LangGraph Scenarios)
    console.log('\n--- 2. Playwright: Backend API, MCP Connectivity & Agentic Contracts ---');
    results.apiTests = await runCommand(
      'npx',
      [
        'playwright',
        'test',
        '--config',
        'playwright.config.ts',
        '--project=api',
      ],
      {
        env: { PLAYWRIGHT_JSON_OUTPUT_FILE: 'reports/api-test-results.json' },
      }
    );

    // 3. Playwright UI Testing (Swagger / Web Docs UI for apis/)
    console.log('\n--- 3. Playwright: Web UI Testing (FastAPI /docs Web Apps) ---');
    results.uiTests = await runCommand(
      'npx',
      [
        'playwright',
        'test',
        '--config',
        'playwright.config.ts',
        '--project=ui',
      ],
      {
        env: { PLAYWRIGHT_JSON_OUTPUT_FILE: 'reports/ui-test-results.json' },
      }
    );

    // Merge both API and UI results into apis-test-results.json
    mergePlaywrightResults();
  } finally {
    for (const s of servers) {
      try {
        s.close();
      } catch {}
    }
  }

  console.log('\n================================================================');
  console.log('                 APIS TEST EXECUTION SUMMARY                    ');
  console.log('================================================================');
  console.log(`1. Promptfoo LLMs Evaluation: ${results.promptfoo?.code === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log(`2. Playwright API Tests:      ${results.apiTests?.code === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log(`3. Playwright Web UI Tests:   ${results.uiTests?.code === 0 ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  console.log('================================================================\n');

  // Generate Quality Gate & Agentic QA Verification Markdown Report with Latency & Bug Reproduction Steps
  try {
    generateQAReport({ results });
  } catch (err) {
    console.error('[apis-runner] Failed to generate QA report:', err);
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
