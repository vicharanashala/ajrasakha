// src/index.ts

import "dotenv/config";
import { runAllScenarios, runScenario } from "./agent/runner";
import { scenarios } from "./scenarios";
import { generateReport } from "./reporter";
import * as path from "path";

async function main() {
  // Parse CLI args: `ts-node src/index.ts --scenario "Login as Expert"`
  const args = process.argv.slice(2);
  const scenarioFlag = args.indexOf("--scenario");
  const scenarioName = scenarioFlag !== -1 ? args[scenarioFlag + 1] : null;

  console.log("\n🌾 Ajrasakha — Agentic AI Testing Agent");
  console.log("=========================================");
  console.log(`Frontend: ${process.env.FRONTEND_URL ?? "http://localhost:5173"}`);
  console.log(`Backend:  ${process.env.BACKEND_URL ?? "http://localhost:3141"}`);
  console.log();

  let results;

  if (scenarioName) {
    const match = scenarios.find((s) => s.name === scenarioName);
    if (!match) {
      console.error(`❌ Scenario not found: "${scenarioName}"`);
      console.log("Available scenarios:");
      scenarios.forEach((s) => console.log(`  - ${s.name}`));
      process.exit(1);
    }
    console.log(`Running single scenario: "${scenarioName}"\n`);
    const found = match; // narrowed — definitely not undefined
    results = [await runScenario(found)];
  } else {
    console.log(`Running all ${scenarios.length} scenarios...\n`);
    results = await runAllScenarios(scenarios);
  }

  // Print summary to console
  console.log("\n\n📊 RESULTS SUMMARY");
  console.log("==================");
  results.forEach((r) => {
    const icon = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "💥";
    console.log(`${icon} ${r.scenario.padEnd(45)} ${r.status.toUpperCase()} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.status !== "pass") {
      console.log(`   └─ ${r.message}`);
    }
  });

  const passed = results.filter((r) => r.status === "pass").length;
  const total = results.length;
  console.log(`\n${passed}/${total} passed`);

  // Generate HTML report
  const reportPath = generateReport(results);
  console.log(`\n📄 HTML report: ${reportPath}`);
  console.log(`📁 Screenshots: ${path.join(__dirname, "../reports/screenshots")}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
