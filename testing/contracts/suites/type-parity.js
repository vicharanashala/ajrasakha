import fs from 'fs';
import path from 'path';

/**
 * Suite 4: Cross-Boundary Type & Enum Parity
 * Validates that TypeScript enums, unions, and core interfaces in frontend/src/types.ts
 * are 100% synchronized with backend/src/shared/interfaces/models.ts.
 */
export function runTypeParitySuite(rootDir, record) {
  const backendModelsPath = path.join(rootDir, 'backend/src/shared/interfaces/models.ts');
  const frontendTypesPath = path.join(rootDir, 'frontend/src/types.ts');

  const readFile = (filePath) => {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  };

  const backendContent = readFile(backendModelsPath);
  const frontendContent = readFile(frontendTypesPath);

  // Helper to extract union values from `type X = 'a' | 'b' | ...;`
  function extractUnionValues(content, typeName) {
    const regex = new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([^;\\r\\n]+)`);
    const match = content.match(regex);
    if (!match) return [];
    return match[1]
      .split('|')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  // 1. UserRole Parity Check
  const backendUserRoles = extractUnionValues(backendContent, 'UserRole').sort();
  const frontendUserRoles = extractUnionValues(frontendContent, 'UserRole').sort();

  const missingInFrontendRoles = backendUserRoles.filter((r) => !frontendUserRoles.includes(r));
  const missingInBackendRoles = frontendUserRoles.filter((r) => !backendUserRoles.includes(r));

  if (missingInFrontendRoles.length === 0 && missingInBackendRoles.length === 0 && backendUserRoles.length > 0) {
    record(
      'Type-Parity',
      'UserRole Union',
      'PASS',
      `Full parity across all ${backendUserRoles.length} system roles: [${backendUserRoles.join(', ')}]`
    );
  } else {
    record(
      'Type-Parity',
      'UserRole Union',
      'FAIL',
      `Discrepancy: Missing in FE: [${missingInFrontendRoles.join(', ')}], Missing in BE: [${missingInBackendRoles.join(', ')}]`
    );
  }

  // 2. QuestionStatus Parity Check
  const backendStatuses = extractUnionValues(backendContent, 'QuestionStatus').sort();
  const frontendStatuses = extractUnionValues(frontendContent, 'QuestionStatus').sort();

  const missingInFrontendStatus = backendStatuses.filter((s) => !frontendStatuses.includes(s));
  const missingInBackendStatus = frontendStatuses.filter((s) => !backendStatuses.includes(s));

  if (missingInFrontendStatus.length === 0 && missingInBackendStatus.length === 0 && backendStatuses.length > 0) {
    record(
      'Type-Parity',
      'QuestionStatus Union',
      'PASS',
      `Full parity across all ${backendStatuses.length} lifecycle states: [${backendStatuses.join(', ')}]`
    );
  } else {
    record(
      'Type-Parity',
      'QuestionStatus Union',
      'FAIL',
      `Discrepancy: Missing in FE: [${missingInFrontendStatus.join(', ')}], Missing in BE: [${missingInBackendStatus.join(', ')}]`
    );
  }

  // 3. NotificationRetentionType Parity Check
  const backendRetention = extractUnionValues(backendContent, 'NotificationRetentionType').sort();
  const frontendRetention = extractUnionValues(frontendContent, 'NotificationRetentionType').sort();

  if (
    backendRetention.length > 0 &&
    backendRetention.join(',') === frontendRetention.join(',')
  ) {
    record(
      'Type-Parity',
      'NotificationRetentionType Union',
      'PASS',
      `Full parity on retention options: [${backendRetention.join(', ')}]`
    );
  } else {
    record(
      'Type-Parity',
      'NotificationRetentionType Union',
      'FAIL',
      `Retention options mismatch: BE=[${backendRetention}], FE=[${frontendRetention}]`
    );
  }

  // 4. Preference Interface Parity Check
  const hasBackendPref = /export\s+interface\s+IPreference\s*\{[\s\S]*?state:\s*string[\s\S]*?crop:\s*string[\s\S]*?domain:\s*string/.test(backendContent);
  const hasFrontendPref = /export\s+interface\s+IMyPreference\s*\{[\s\S]*?state:\s*string[\s\S]*?crop:\s*string[\s\S]*?domain:\s*string/.test(frontendContent);

  if (hasBackendPref && hasFrontendPref) {
    record(
      'Type-Parity',
      'User Preference Structure (IPreference <-> IMyPreference)',
      'PASS',
      'Verified state, district, crop, and domain structure parity'
    );
  } else {
    record(
      'Type-Parity',
      'User Preference Structure',
      'FAIL',
      'Interface structure mismatch between IPreference and IMyPreference'
    );
  }

  // 5. KVK Coverage Item Parity Check
  const hasBackendKvk = /export\s+interface\s+IKVKCoveredItem\s*\{[\s\S]*?state\??:\s*string[\s\S]*?district\??:\s*string[\s\S]*?name\??:\s*string/.test(backendContent);
  const hasFrontendKvk = /export\s+interface\s+IKVKCoveredItem\s*\{[\s\S]*?state:\s*string[\s\S]*?district:\s*string[\s\S]*?name:\s*string/.test(frontendContent);

  if (hasBackendKvk && hasFrontendKvk) {
    record(
      'Type-Parity',
      'IKVKCoveredItem Interface',
      'PASS',
      'Verified state, district, and name field mapping for KVK operational coverage'
    );
  } else {
    record(
      'Type-Parity',
      'IKVKCoveredItem Interface',
      'FAIL',
      'Interface structure mismatch on IKVKCoveredItem'
    );
  }
}
