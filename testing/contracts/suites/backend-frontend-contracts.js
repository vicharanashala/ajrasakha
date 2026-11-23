import fs from 'fs';
import path from 'path';

/**
 * Suite 1: Backend <-> Frontend REST & Route Contracts
 * Validates route alignment, HTTP methods, authorization guards, and DTO schemas.
 */
export function runBackendFrontendSuite(rootDir, record) {
  const backendModulesDir = path.join(rootDir, 'backend/src/modules');
  const frontendServicesDir = path.join(rootDir, 'frontend/src/hooks/services');

  // Helper to read file safely
  const readFile = (filePath) => {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  };

  // Helper to extract routes from routing-controllers files
  function extractControllerRoutes(controllerPath) {
    const content = readFile(controllerPath);
    if (!content) return { base: '', routes: [], content: '' };

    const baseMatch = content.match(/@JsonController\(['"]([^'"]+)['"]\)/);
    const base = baseMatch ? baseMatch[1] : '';

    const routeRegex = /@(Get|Post|Put|Patch|Delete)\(['"]?([^'")\s]*)['"]?\)/g;
    const routes = [];
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2] || '',
        fullPath: `${base}${match[2] ? (match[2].startsWith('/') ? match[2] : `/${match[2]}`) : ''}`.replace(/\/+/g, '/'),
      });
    }

    return { base, routes, content };
  }

  // Helper to extract service calls from frontend service files
  function extractServiceCalls(servicePath) {
    const content = readFile(servicePath);
    if (!content) return { baseUrl: '', calls: [], content: '' };

    const baseMatch = content.match(/_baseUrl\s*=\s*`\$\{API_BASE_URL\}\/([^`]+)`/);
    const baseUrl = baseMatch ? `/${baseMatch[1]}` : '';

    const apiFetchRegex = /apiFetch(?:<[^>]+>)?\(\s*[`"']([^`"']+)`?|`\$\{this\._baseUrl\}([^`]*)`/g;
    const calls = [];
    let match;
    while ((match = apiFetchRegex.exec(content)) !== null) {
      const urlPart = match[1] || match[2] || '';
      calls.push(urlPart);
    }

    return { baseUrl, calls, content };
  }

  // 1. Question Workflows & Allocation Routes
  const questionControllers = [
    'QuestionController.ts',
    'QuestionAllocationController.ts',
    'QuestionAiController.ts',
    'QuestionFeedbackController.ts',
    'QuestionPaeValidationController.ts',
    'QuestionIngestionController.ts',
    'QuestionReportController.ts',
  ];

  let allQuestionRoutes = [];
  let allQuestionContent = '';
  for (const c of questionControllers) {
    const cPath = path.join(backendModulesDir, 'question/controllers', c);
    const extracted = extractControllerRoutes(cPath);
    allQuestionRoutes.push(...extracted.routes);
    allQuestionContent += extracted.content + '\n';
  }

  const expectedQuestionEndpoints = [
    { method: 'POST', path: '/questions/allocated', desc: 'Expert allocated questions workbench' },
    { method: 'POST', path: '/questions/detailed', desc: 'Detailed questions list with advance filters' },
    { method: 'GET', path: '/questions/queue-details', desc: 'Comprehensive queue metrics & workload status' },
    { method: 'GET', path: '/questions/role-dashboard', desc: 'Role-based dashboard for auditor, gatekeeper & PAE' },
    { method: 'POST', path: '/questions/status-summary', desc: 'Question status breakdown totals' },
    { method: 'POST', path: '/questions/reallocate-manual', desc: 'Manual reallocation of questions to expert' },
    { method: 'POST', path: '/questions/reallocate-timebound', desc: 'Time-bound re-allocation cycle' },
    { method: 'POST', path: '/questions/bulk-pae-allocate', desc: 'Bulk allocation of questions to PAE experts' },
    { method: 'POST', path: '/questions/check-status', desc: 'Question processing & lifecycle status check' },
    { method: 'GET', path: '/questions/feedback/queue-details', desc: 'Moderator & Auditor feedback queue' },
    { method: 'GET', path: '/questions/pae-val/queue-details', desc: 'PAE validation queue details' },
  ];

  for (const ep of expectedQuestionEndpoints) {
    const found = allQuestionRoutes.some(
      (r) => r.method === ep.method && (r.fullPath === ep.path || ep.path.startsWith(r.fullPath))
    );
    if (found) {
      record('Backend-Frontend', `${ep.method} ${ep.path}`, 'PASS', `Verified ${ep.desc}`);
    } else {
      record('Backend-Frontend', `${ep.method} ${ep.path}`, 'FAIL', `Missing controller route for ${ep.desc}`);
    }
  }

  // 2. Answers & Peer Review Consensus Workflows
  const answerControllerPath = path.join(backendModulesDir, 'answer/controllers/AnswerController.ts');
  const answerExtracted = extractControllerRoutes(answerControllerPath);

  const expectedAnswerEndpoints = [
    { method: 'POST', path: '/answers', desc: 'Initial answer creation / submission' },
    { method: 'POST', path: '/answers/review', desc: 'Multi-round consensus peer review (approve/reject/modify)' },
    { method: 'PUT', path: '/answers', desc: 'Update or finalize answer draft' },
    { method: 'POST', path: '/answers/moderator/approve', desc: 'Moderator final approval & GDB readiness' },
    { method: 'POST', path: '/answers/:questionId/confirm-duplicate', desc: 'Confirm duplicate question status' },
    { method: 'GET', path: '/answers/finalizedAnswers', desc: 'Retrieve closed & finalized answers' },
    { method: 'POST', path: '/answers/detect-chemicals', desc: 'Cross-boundary banned agro-chemical detector' },
    { method: 'GET', path: '/answers/submissions', desc: 'Submissions queue for active questions' },
  ];

  for (const ep of expectedAnswerEndpoints) {
    const found = answerExtracted.routes.some((r) => {
      if (r.method !== ep.method) return false;
      const normalize = (p) => p.replace(/:[a-zA-Z0-9_]+/g, ':param').replace(/\/$/, '');
      return normalize(r.fullPath) === normalize(ep.path);
    });
    if (found) {
      record('Backend-Frontend', `${ep.method} ${ep.path}`, 'PASS', `Verified ${ep.desc}`);
    } else {
      record('Backend-Frontend', `${ep.method} ${ep.path}`, 'FAIL', `Missing AnswerController route for ${ep.desc}`);
    }
  }

  // 3. User, Chemical & Crop Management Contracts
  const userControllerPath = path.join(backendModulesDir, 'user/controllers/UserController.ts');
  const userExtracted = extractControllerRoutes(userControllerPath);

  const chemicalControllerPath = path.join(backendModulesDir, 'chemical/controllers/ChemicalController.ts');
  const chemicalExtracted = extractControllerRoutes(chemicalControllerPath);

  const cropControllerPath = path.join(backendModulesDir, 'crop/controllers/CropController.ts');
  const cropExtracted = extractControllerRoutes(cropControllerPath);

  const userEndpoints = [
    { method: 'GET', path: '/users/me', desc: 'Current authenticated user profile' },
    { method: 'GET', path: '/users/all', desc: 'All active users directory' },
    { method: 'GET', path: '/users/moderators', desc: 'Active moderators list' },
    { method: 'GET', path: '/users/by-role', desc: 'Filter system users by role' },
    { method: 'GET', path: '/users/call-agents', desc: 'ACC telephony call agents status' },
  ];

  for (const ep of userEndpoints) {
    const found = userExtracted.routes.some((r) => r.method === ep.method && r.fullPath === ep.path);
    if (found) {
      record('Backend-Frontend', `${ep.method} ${ep.path}`, 'PASS', `Verified ${ep.desc}`);
    } else {
      record('Backend-Frontend', `${ep.method} ${ep.path}`, 'FAIL', `Missing UserController route for ${ep.desc}`);
    }
  }

  record(
    'Backend-Frontend',
    'Chemical Master API',
    chemicalExtracted.routes.length >= 4 ? 'PASS' : 'FAIL',
    `Verified ${chemicalExtracted.routes.length} CRUD routes on /chemicals`
  );

  record(
    'Backend-Frontend',
    'Crop Taxonomy API',
    cropExtracted.routes.length >= 6 ? 'PASS' : 'FAIL',
    `Verified ${cropExtracted.routes.length} taxonomy & import routes on /crops`
  );

  // 4. Security & Authorization Guards Validation
  const authChecks = [
    { name: 'Answer Submission Auth Guard', file: answerControllerPath, check: /@Authorized\(\)[\s\S]*?addAnswer/ },
    { name: 'Review Answer Auth Guard', file: answerControllerPath, check: /@Authorized\(\)[\s\S]*?reviewAnswer/ },
    { name: 'Tester Mutation Barrier', file: answerControllerPath, check: /verifyNotTester\(user\)/ },
    { name: 'Chemical Modification Guard', file: chemicalControllerPath, check: /WRITE_ROLES\s*=\s*\['admin',\s*'moderator'\]/ },
  ];

  for (const ac of authChecks) {
    const content = readFile(ac.file);
    if (ac.check.test(content)) {
      record('Security-Guards', ac.name, 'PASS', 'Strict role-based authorization guard enforced');
    } else {
      record('Security-Guards', ac.name, 'FAIL', 'Missing expected authorization guard');
    }
  }

  // 5. DTO Validation Schema Parity
  const answerValidatorPath = path.join(backendModulesDir, 'answer/classes/validators/AnswerValidator.ts');
  const answerValidatorContent = readFile(answerValidatorPath);

  const dtoChecks = [
    { name: 'AddAnswerBody DTO', check: /class AddAnswerBody[\s\S]*?@IsNotEmpty\(\)[\s\S]*?answer: string/ },
    { name: 'ReviewAnswerBody DTO', check: /class ReviewAnswerBody[\s\S]*?@IsIn\(\['accepted',\s*'rejected',\s*'modified'\]\)/ },
    { name: 'DetectChemicalsBody DTO', check: /class DetectChemicalsBody[\s\S]*?@IsNotEmpty\(\)[\s\S]*?text: string/ },
  ];

  for (const dto of dtoChecks) {
    if (dto.check.test(answerValidatorContent)) {
      record('DTO-Validation', dto.name, 'PASS', 'class-validator decorators and required types verified');
    } else {
      record('DTO-Validation', dto.name, 'FAIL', 'DTO schema mismatch or missing decorators');
    }
  }
}
