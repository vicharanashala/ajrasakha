// src/agent/executor.ts
// Executes the actions decided by the brain using Playwright

import { Page } from "playwright";
import { AgentAction } from "./brain";
import * as fs from "fs";
import * as path from "path";

const REPORTS_DIR = path.join(__dirname, "../../reports/screenshots");

export async function executeAction(
  page: Page,
  action: AgentAction
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.type) {
      case "navigate":
        await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(1000);
        break;

      case "click":
        // Try CSS selector first, then text-based
        try {
          await page.click(action.selector, { timeout: 8000 });
        } catch {
          await page.getByText(action.selector).first().click({ timeout: 8000 });
        }
        await page.waitForTimeout(500);
        break;

      case "fill":
        await page.fill(action.selector, action.value, { timeout: 8000 });
        await page.waitForTimeout(300);
        break;

      case "wait":
        await page.waitForTimeout(action.ms);
        break;

      case "assert":
        const element = page.locator(action.selector).first();
        const text = await element.textContent({ timeout: 8000 });
        if (!text?.includes(action.expected)) {
          return {
            success: false,
            error: `Assertion failed: Expected "${action.expected}" but got "${text}"`,
          };
        }
        break;

      case "screenshot":
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(REPORTS_DIR, action.filename),
          fullPage: true,
        });
        break;

      case "done":
        // "done" is handled by the runner, not the executor
        break;
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getPageSnapshot(page: Page): Promise<string> {
  // Get simplified page text — headings, buttons, inputs, links, visible text
  return page.evaluate(() => {
    const elements: string[] = [];

    // Page title
    elements.push(`URL: ${location.href}`);
    elements.push(`TITLE: ${document.title}`);

    // Headings
    document.querySelectorAll("h1,h2,h3").forEach((el) => {
      elements.push(`[${el.tagName}] ${el.textContent?.trim()}`);
    });

    // Buttons
    document.querySelectorAll("button:not([disabled])").forEach((el) => {
      elements.push(`[BUTTON] ${el.textContent?.trim()}`);
    });

    // Inputs
    document.querySelectorAll("input,textarea").forEach((el) => {
      const input = el as HTMLInputElement;
      elements.push(`[INPUT] type=${input.type} placeholder="${input.placeholder}" id="${input.id}" name="${input.name}"`);
    });

    // Links
    document.querySelectorAll("a").forEach((el) => {
      elements.push(`[LINK] ${el.textContent?.trim()} href="${el.href}"`);
    });

    // Error/alert messages
    document.querySelectorAll("[role='alert'],[class*='error'],[class*='toast']").forEach((el) => {
      elements.push(`[ALERT] ${el.textContent?.trim()}`);
    });

    // Visible text paragraphs (truncated)
    document.querySelectorAll("p,span,td,li").forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 3 && text.length < 200) {
        elements.push(`[TEXT] ${text}`);
      }
    });

    return elements.slice(0, 100).join("\n");
  });
}
