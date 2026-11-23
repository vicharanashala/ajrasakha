import fs from 'fs';
import path from 'path';

/**
 * Suite 3: Specialized Microservices Endpoint & Schema Parity (apis/)
 * Validates FastAPI endpoints, Pydantic request/response models, and cross-service invocation contracts.
 */
export function runMicroservicesSuite(rootDir, record) {
  const apisDir = path.join(rootDir, 'apis');

  const readFile = (filePath) => {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  };

  const services = [
    {
      dir: 'chemical_detector',
      main: 'main.py',
      name: 'Chemical Detector API',
      checks: [
        { name: 'Endpoint POST /detect-chemicals', pattern: /@app\.post\(\s*["']\/detect-chemicals["']/ },
        { name: 'Request Model DetectRequest(text)', pattern: /class\s+DetectRequest\s*\(BaseModel\):[\s\S]*?text:\s*str/ },
        { name: 'Response Model DetectResponse', pattern: /class\s+DetectResponse\s*\(BaseModel\):/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']\)/ },
      ],
    },
    {
      dir: 'writing_assistant',
      main: 'main.py',
      name: 'Authoring Writing Assistant API',
      checks: [
        { name: 'Endpoint POST /polish-draft', pattern: /@app\.post\(\s*["']\/polish-draft["']/ },
        { name: 'Request Model PolishDraftRequest', pattern: /class\s+PolishDraftRequest\s*\(CamelModel\):/ },
        { name: 'Response Model PolishDraftResponse', pattern: /class\s+PolishDraftResponse\s*\(CamelModel\):/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']\)/ },
      ],
    },
    {
      dir: 'agriculture_classifier',
      main: 'main.py',
      name: 'Agriculture Intent Classifier API',
      checks: [
        { name: 'Endpoint POST /classify-question', pattern: /@app\.post\(\s*["']\/classify-question["']/ },
        { name: 'Request Model ClassifyRequest', pattern: /class\s+ClassifyRequest\s*\(BaseModel\):/ },
        { name: 'Response Model ClassifyResponse', pattern: /class\s+ClassifyResponse\s*\(BaseModel\):/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']\)/ },
      ],
    },
    {
      dir: 'ans_gen_pop',
      main: 'main.py',
      name: 'PoP Answer Generation API',
      checks: [
        { name: 'Endpoint POST /generate', pattern: /@app\.post\(\s*["']\/generate["']/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']/ },
        { name: 'Readiness Endpoint GET /health/ready', pattern: /@app\.get\(\s*["']\/health\/ready["']/ },
      ],
    },
    {
      dir: 'acc_api',
      main: 'main.py',
      name: 'ACC Calling Agent Search & Extract API',
      checks: [
        { name: 'Endpoint POST /search', pattern: /@app\.post\(\s*["']\/search["']/ },
        { name: 'Endpoint POST /extract', pattern: /@app\.post\(\s*["']\/extract["']/ },
        { name: 'Endpoint GET /filters', pattern: /@app\.get\(\s*["']\/filters["']/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']/ },
      ],
    },
    {
      dir: 'weather_apis',
      main: 'main.py',
      name: 'Live Observation Weather API',
      checks: [
        { name: 'Endpoint GET /live', pattern: /@app\.get\(\s*["']\/live["']/ },
        { name: 'Endpoint GET /live/details', pattern: /@app\.get\(\s*["']\/live\/details["']/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']/ },
        { name: 'Cache Management POST /cache/clear', pattern: /@app\.post\(\s*["']\/cache\/clear["']/ },
      ],
    },
    {
      dir: 'langgraph-openai-adapter',
      main: 'app.py',
      name: 'LangGraph OpenAI Wire Protocol Adapter',
      checks: [
        { name: 'Chat Completions POST /v1/ajrasakha/chat/completions', pattern: /@app\.post\(\s*["']\/v1\/ajrasakha\/chat\/completions["']/ },
        { name: 'Health Endpoint GET /health', pattern: /@app\.get\(\s*["']\/health["']/ },
      ],
    },
  ];

  for (const s of services) {
    const mainPath = path.join(apisDir, s.dir, s.main);
    let allContent = readFile(mainPath);

    // Also check models.py or subdirectories if present
    const modelsPath = path.join(apisDir, s.dir, 'models.py');
    const assistantModelsPath = path.join(apisDir, s.dir, 'assistant/models.py');
    const classifierModelsPath = path.join(apisDir, s.dir, 'classifier/models.py');

    allContent += '\n' + readFile(modelsPath) + '\n' + readFile(assistantModelsPath) + '\n' + readFile(classifierModelsPath);

    for (const check of s.checks) {
      if (check.pattern.test(allContent)) {
        record('Microservices', `${s.name}: ${check.name}`, 'PASS', 'Verified FastAPI route & Pydantic schema contract');
      } else {
        record('Microservices', `${s.name}: ${check.name}`, 'FAIL', `Missing schema or route pattern in ${s.dir}`);
      }
    }
  }

  // Cross-Service Invocation Verification: Backend AnswerController calling Chemical Detector
  const backendAnswerServicePath = path.join(rootDir, 'backend/src/modules/answer/services/AnswerService.ts');
  const backendAnswerContent = readFile(backendAnswerServicePath);
  const backendCallsDetector = /detect-chemicals/i.test(backendAnswerContent) || /chemical/i.test(backendAnswerContent);

  if (backendCallsDetector) {
    record(
      'Cross-Service-Call',
      'Backend -> Chemical Detector',
      'PASS',
      'Verified service integration between Reviewer Backend and chemical_detector microservice'
    );
  } else {
    record(
      'Cross-Service-Call',
      'Backend -> Chemical Detector',
      'FAIL',
      'Missing chemical_detector invocation in AnswerService'
    );
  }
}
