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

    if (scenario.name === "Full Q&A Lifecycle: Expert answers, Moderator approves") {
      try {
        const { seedQuestion } = await import("./seeder");
        await seedQuestion(process.env.EXPERT_EMAIL ?? "ashifmohd.offl@gmail.com");
      } catch (err: any) {
        console.warn(`\n[Warning] Could not seed question automatically: ${err.message}`);
      }
    }

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

      // Wait to respect rate limits
      console.log(`\nStep ${stepCount}: Asking AI brain for next move...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      let actions: any[] = [];
      let retryAttempts = 0;
      while (retryAttempts < 5) {
        try {
          actions = await getNextAction(input);
          break;
        } catch (err: any) {
          if (err.message.includes("503") || err.message.includes("429") || err.message.includes("high demand")) {
            console.log(`  [Rate Limit / 503 Spike] Google API is busy. Pausing 5 seconds before retry ${retryAttempts + 1}/5...`);
            await new Promise(r => setTimeout(r, 5000));
            retryAttempts++;
          } else {
            throw err;
          }
        }
      }

      console.log(`  → Actions: ${JSON.stringify(actions)}`);

      for (const action of actions) {
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
          break; // Stop executing further batched actions if one fails
        } else {
          lastError = undefined;
        }
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
