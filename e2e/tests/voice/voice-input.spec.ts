/**
 * Voice input tests — the VoiceRecorderCard in "Agents Interface" tab.
 *
 * Voice recording requires microphone access. Playwright uses:
 *   --use-fake-ui-for-media-stream
 *   --use-fake-device-for-media-stream
 * so tests run without real hardware.
 *
 * Desktop (8 tests) + Mobile (1 test) — mobile test uses Pixel 5 viewport.
 */
import { test, expect } from '@playwright/test';
import { VoiceRecorderPage } from '../../pages/VoiceRecorderPage';
import { HomePage } from '../../pages/HomePage';
import {
  mockCurrentUser,
  mockAudioUpload,
  mockSubmitTranscript,
} from '../../helpers/api-mock';

test.describe('Voice input — VoiceRecorderCard', () => {
  test.beforeEach(async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockAudioUpload(page, 'मेरी फसल में कीट लग गए हैं');
    await mockSubmitTranscript(page);
  });

  test('TEST-32: Agents Interface tab is accessible and Voice Recorder is visible', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    const tab = page.getByRole('tab', { name: /agents interface/i });
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();

    // Voice Recorder card heading must appear
    await expect(page.getByText('Voice Recorder')).toBeVisible({ timeout: 10_000 });
  });

  test('TEST-33: mic button (toggle) is visible and enabled', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    await voice.expectMicButtonVisible();
    await expect(voice.toggleButton).toBeEnabled();
  });

  test('TEST-34: transcript area shows placeholder text before recording', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    await voice.expectTranscriptPlaceholderVisible();
  });

  test('TEST-35: submit button is disabled when transcript is empty', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    await voice.expectSubmitDisabled();
  });

  test('TEST-36: clear button is disabled when transcript is empty', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    await voice.expectClearDisabled();
  });

  test('TEST-37: clicking mic button toggles recording state (button class changes)', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    // Start recording
    await voice.startRecording();

    // Recording button should switch to destructive variant (red)
    await expect(voice.toggleButton).toHaveClass(/destructive/, { timeout: 5_000 });

    // Stop recording
    await voice.stopRecording();

    // Button should return to default (non-destructive)
    await expect(voice.toggleButton).not.toHaveClass(/destructive/, { timeout: 8_000 });
  });

  test('TEST-38: "Click microphone to start" cue disappears during recording', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    const cue = page.getByText(/click microphone to start/i);
    await expect(cue).toBeVisible({ timeout: 5_000 });

    await voice.startRecording();

    // Cue text should be replaced by recording indicator
    await expect(cue).not.toBeVisible({ timeout: 5_000 });

    // Stop recording to clean up
    await voice.stopRecording();
  });

  test('TEST-39: language select dropdown is visible in voice recorder', async ({ page }) => {
    const voice = new VoiceRecorderPage(page);
    await page.goto('/home');
    await voice.navigateTo();

    // The language selection combobox should be present in the Voice Recorder card
    const langSelect = page.locator('[role="combobox"]').first();
    await expect(langSelect).toBeVisible({ timeout: 8_000 });
  });

  // ── Mobile voice test ────────────────────────────────────────────────────────
  test('TEST-40: voice recorder UI is functional on mobile viewport [Pixel 5]', async ({ page, browserName }) => {
    // Force mobile viewport for this single test
    await page.setViewportSize({ width: 393, height: 851 }); // Pixel 5

    await page.goto('/home');

    // On mobile, the user first needs to open the mobile sidebar to find the tab
    // OR the Agents Interface tab might be in the mobile sidebar
    const agentsTab = page.getByRole('tab', { name: /agents interface/i });
    const mobileSidebar = page.getByRole('button', { name: /menu|sidebar|navigation/i });

    const tabVisible = await agentsTab.isVisible().catch(() => false);
    if (!tabVisible) {
      // Try opening mobile sidebar
      const sidebarBtn = page.locator('header button').last();
      if (await sidebarBtn.isVisible()) {
        await sidebarBtn.click();
        const sidebarTab = page.getByText(/agents interface/i);
        if (await sidebarTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sidebarTab.click();
        }
      }
    } else {
      await agentsTab.click();
    }

    // Voice recorder should be visible
    const voice = new VoiceRecorderPage(page);
    await expect(voice.toggleButton).toBeVisible({ timeout: 10_000 });
    await expect(voice.transcript).toBeVisible({ timeout: 10_000 });
  });
});
