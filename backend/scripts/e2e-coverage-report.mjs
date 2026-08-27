#!/usr/bin/env node
/**
 * E2E route-coverage report.
 *
 * Cross-references every @Get/@Post/@Put/@Patch/@Delete route declared across
 * src/modules (controllers subfolders) against every literal API call made
 * from src/e2e (*.e2e.test.ts files), and prints a per-module + overall
 * coverage summary plus the list of uncovered routes.
 *
 * This is a static-analysis heuristic, not a runtime instrumentation tool — it
 * matches on { method, normalized path shape }, so it can't tell you whether a
 * covered route's important branches/edge-cases are actually exercised, only
 * whether *some* test hits it at all. Use it as a coverage floor, not a
 * substitute for reading the suites.
 *
 * Usage:
 *   node scripts/e2e-coverage-report.mjs            # human-readable report
 *   node scripts/e2e-coverage-report.mjs --json      # machine-readable JSON
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const MODULES_DIR = join(ROOT, 'src', 'modules');
const E2E_DIR = join(ROOT, 'src', 'e2e');

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip full-line `//` comments and `/* ... *\/` block comments so we never
 *  pick up dead/commented-out decorators as live routes. */
function stripComments(source) {
  let noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks
    .split('\n')
    .map(line => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

/** Normalize a route path's dynamic segments to a single `:param` token shape
 *  so `/:questionId/:answerId` and `/:foo/:bar` compare equal. */
function normalizePath(path) {
  return path
    .split('?')[0] // drop query strings — they're not part of the route shape
    .replace(/\{[^}]*\}/g, ':param') // template-literal placeholders already stringified elsewhere
    .replace(/:[A-Za-z0-9_]+/g, ':param')
    .replace(/\/+$/, '')
    .replace(/^\/?/, '/');
}

// ─────────────────────────── 1. Route inventory ────────────────────────────

function extractControllerRoutes() {
  const files = walk(MODULES_DIR, f => /\/controllers\/.*\.ts$/.test(f));
  const routes = [];

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const source = stripComments(raw);
    const lines = source.split('\n');

    // Find the @JsonController('/prefix') closest above the class declaration.
    let prefix = '';
    for (const line of lines) {
      const m = line.match(/@JsonController\(\s*['"`]([^'"`]*)['"`]/);
      if (m) {
        prefix = m[1];
        break;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      for (const method of HTTP_METHODS) {
        const m = lines[i].match(new RegExp(`@${method}\\(\\s*['"\`]([^'"\`]*)['"\`]`));
        if (m) {
          const routePath = m[1];
          const fullPath = (prefix + (routePath === '/' ? '' : routePath)) || '/';
          routes.push({
            method: method.toUpperCase(),
            path: fullPath,
            normalized: `${method.toUpperCase()} ${normalizePath(fullPath)}`,
            file: relative(ROOT, file),
            line: i + 1,
            module: relative(MODULES_DIR, file).split('/')[0],
          });
        }
      }
    }
  }
  return routes;
}

// ─────────────────────────── 2. E2E call inventory ──────────────────────────

function extractE2eCalls() {
  const files = walk(E2E_DIR, f => /\.e2e\.test\.ts$/.test(f));
  const calls = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    // Matches: apiGet(`...`), apiPost('...'), request(app).delete(`...`), etc.
    // Captures the quoted/templated path literal that follows. Two separate
    // alternatives (not one \b-anchored group): a `\b` word-boundary assertion
    // never fires directly before a literal `.` when it's preceded by
    // whitespace/newline (both sides non-word), which silently dropped every
    // chained `request(app)\n  .post(...)` call style used by several suites.
    const callRe =
      /\bapi(Get|Post|Put|Patch|Delete)\(\s*[`'"]([^`'"]*)[`'"]|\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]*)[`'"]/g;
    let m;
    while ((m = callRe.exec(source))) {
      const method = (m[1] || m[3]).toUpperCase();
      let pathLiteral = m[1] ? m[2] : m[4];
      // Turn `${ROUTE_PREFIX}/foo/${id}/bar` into /foo/:param/bar (strip any
      // leading ${...} route-prefix interpolation, normalize the rest). Some
      // suites hardcode the full literal instead (e.g. '/api/questions/...')
      // — strip a literal leading /api too, since every suite's ROUTE_PREFIX
      // resolves to '/api' and @JsonController paths never include it.
      pathLiteral = pathLiteral
        .replace(/^\$\{[^}]*\}/, '')
        .replace(/^\/api(?=\/)/, '')
        .replace(/\$\{[^}]*\}/g, ':param');
      if (!pathLiteral.startsWith('/')) continue; // not a path-shaped literal
      calls.push({
        method,
        normalized: `${method} ${normalizePath(pathLiteral)}`,
        file: relative(ROOT, file),
      });
    }

    // Second pass: some suites build a route list as an array of bare path
    // strings and interpolate a loop variable into apiGet(`${PREFIX}${route}`)
    // — the call-site regex above can't resolve a variable, so it under-counts
    // those suites. Best-effort recovery: any standalone path-shaped string
    // literal (no interpolation) in a file that also calls apiGet(...)
    // somewhere is treated as a covered GET. This can over-count if a file
    // happens to contain an unrelated path-shaped string, but undercounting
    // loop-driven suites to zero is worse for a "coverage floor" tool.
    if (/\bapiGet\(/.test(source)) {
      // Recover the static path segment routing-controllers-prefix loops use,
      // e.g. apiGet(`${ROUTE_PREFIX}/performance${route}`) -> '/performance'.
      const staticPrefixMatch = source.match(/apiGet\(\s*`\$\{[A-Za-z_]+\}(\/[A-Za-z0-9\-_/]*)\$\{[A-Za-z_]+\}/);
      const staticPrefix = staticPrefixMatch ? staticPrefixMatch[1] : '';

      const literalRe = /['"`](\/[A-Za-z0-9\-_/:.]*)['"`]/g;
      let lm;
      while ((lm = literalRe.exec(source))) {
        const p = lm[1];
        if (p.length < 2) continue;
        calls.push({ method: 'GET', normalized: `GET ${normalizePath(p)}`, file: relative(ROOT, file) });
        if (staticPrefix) {
          calls.push({ method: 'GET', normalized: `GET ${normalizePath(staticPrefix + p)}`, file: relative(ROOT, file) });
        }
      }
    }
  }
  return calls;
}

// ─────────────────────────────── 3. Cross-reference ─────────────────────────

function buildReport() {
  const routes = extractControllerRoutes();
  const calls = extractE2eCalls();
  const covered = new Set(calls.map(c => c.normalized));

  const byModule = {};
  for (const r of routes) {
    byModule[r.module] ??= { total: 0, covered: 0, uncovered: [] };
    byModule[r.module].total++;
    if (covered.has(r.normalized)) {
      byModule[r.module].covered++;
    } else {
      byModule[r.module].uncovered.push(r);
    }
  }

  const totals = Object.values(byModule).reduce(
    (acc, m) => ({ total: acc.total + m.total, covered: acc.covered + m.covered }),
    { total: 0, covered: 0 },
  );

  return { byModule, totals, routes, calls };
}

// ─────────────────────────────── 4. Output ──────────────────────────────────

function pct(covered, total) {
  return total === 0 ? '0.0' : ((covered / total) * 100).toFixed(1);
}

function printHuman(report) {
  const { byModule, totals } = report;
  const modules = Object.keys(byModule).sort(
    (a, b) => pct(byModule[b].covered, byModule[b].total) - pct(byModule[a].covered, byModule[a].total),
  );

  console.log('\n=== E2E Route Coverage Report ===\n');
  console.log(
    `${'Module'.padEnd(16)}${'Covered'.padEnd(10)}${'Total'.padEnd(8)}Coverage`,
  );
  console.log('-'.repeat(50));
  for (const mod of modules) {
    const m = byModule[mod];
    console.log(
      `${mod.padEnd(16)}${String(m.covered).padEnd(10)}${String(m.total).padEnd(8)}${pct(m.covered, m.total)}%`,
    );
  }
  console.log('-'.repeat(50));
  console.log(
    `${'TOTAL'.padEnd(16)}${String(totals.covered).padEnd(10)}${String(totals.total).padEnd(8)}${pct(totals.covered, totals.total)}%\n`,
  );

  const anyUncovered = modules.some(m => byModule[m].uncovered.length > 0);
  if (anyUncovered) {
    console.log('=== Uncovered routes ===\n');
    for (const mod of modules) {
      const m = byModule[mod];
      if (!m.uncovered.length) continue;
      console.log(`${mod}:`);
      for (const r of m.uncovered) {
        console.log(`  ${r.method.padEnd(7)} ${r.path}  (${r.file}:${r.line})`);
      }
      console.log('');
    }
  }
}

const args = process.argv.slice(2);
const report = buildReport();

if (args.includes('--json')) {
  const { byModule, totals } = report;
  console.log(
    JSON.stringify(
      {
        totals: { ...totals, percent: Number(pct(totals.covered, totals.total)) },
        modules: Object.fromEntries(
          Object.entries(byModule).map(([mod, m]) => [
            mod,
            {
              covered: m.covered,
              total: m.total,
              percent: Number(pct(m.covered, m.total)),
              uncovered: m.uncovered.map(r => ({ method: r.method, path: r.path, file: r.file, line: r.line })),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
} else {
  printHuman(report);
}
