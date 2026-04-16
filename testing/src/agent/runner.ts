// src/agent/runner.ts
// Orchestrates brain + executor in a loop until "done" or max steps reached

import { chromium, Browser, Page } from "playwright";
import { getNextAction, BrainInput } from "./brain";
import { executeAction, getPageSnapshot } from "./executor";
import * as fs from "fs";
import * as path from "path";

export interface TestScenario {
  name: string;
  goal: string;
}

export interface TestResult {
  scenario: string;
  status: "pass" | "fail" | "error";
  steps: string[];
  message: string;
  durationMs: number;
  screenshots: string[];
}

const MAX_STEPS = 30; // Safety cap — agent stops after 30 actions

export async function runScenario(scenario: TestScenario): Promise<TestResult> {
  const startTime = Date.now();
  const steps: string[] = [];
  const screenshots: string[] = [];

  let browser: Browser | null = null;
  let page: Page | null = null;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`▶ SCENARIO: ${scenario.name}`);
  console.log(`  GOAL: ${scenario.goal}`);
  console.log(`${"=".repeat(60)}`);

  try {
    browser = await chromium.launch({ headless: false, slowMo: 300 });
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    let lastError: string | undefined;
    let stepCount = 0;

    while (stepCount < MAX_STEPS) {
      stepCount++;

      const currentUrl = page.url();
      const pageSnapshot = await getPageSnapshot(page);

      const input: BrainInput = {
        goal: scenario.goal,
        previousActions: steps,
        currentUrl,
        pageSnapshot,
        error: lastError,
      };

      console.log(`\nStep ${stepCount}: Waiting 4s for rate limits, then asking brain...`);
      await new Promise(r => setTimeout(r, 4000));
      const action = await getNextAction(input);
      console.log(`  → Action: ${JSON.stringify(action)}`);

      // Handle "done" before executing
      if (action.type === "done") {
        console.log(`\n✅ DONE: ${action.message}`);
        return {
          scenario: scenario.name,
          status: action.status,
          steps,
          message: action.message,
          durationMs: Date.now() - startTime,
          screenshots,
        };
      }

      // Track screenshots
      if (action.type === "screenshot") {
        screenshots.push(action.filename);
      }

      steps.push(`[Step ${stepCount}] ${JSON.stringify(action)}`);

      // Execute the action
      const result = await executeAction(page, action);

      if (!result.success) {
        lastError = result.error;
        console.log(`  ⚠ Error: ${result.error}`);
      } else {
        lastError = undefined;
      }
    }

    // Hit max steps without finishing
    return {
      scenario: scenario.name,
      status: "fail",
      steps,
      message: `Hit maximum step limit (${MAX_STEPS}) without completing the goal.`,
      durationMs: Date.now() - startTime,
      screenshots,
    };
  } catch (err: any) {
    return {
      scenario: scenario.name,
      status: "error",
      steps,
      message: `Runner error: ${err.message}`,
      durationMs: Date.now() - startTime,
      screenshots,
    };
  } finally {
    await browser?.close();
  }
}

export async function runAllScenarios(
  scenarios: TestScenario[]
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    results.push(result);
    // Small breather between scenarios
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
