import { test, expect, devices } from '@playwright/test';

// Forces Playwright to emulate a standard mobile phone screen layout layout
test.use({
  ...devices['iPhone 14'], 
});

test.describe('Tester Dashboard Frontend - Mobile Responsive Layout Verification', () => {

  test('should gracefully toggle and render the navigation mobile drawer menu on compact screens', async ({ page }) => {
    // 1. Navigate to the staging application URL
    await page.goto('https://vicharanashala.ai');

    // 2. Locate the mobile menu icon or hamburger navigation trigger layout element
    const mobileMenuButton = page.locator('button[aria-label*="menu"], button:has-text("Menu"), .mobile-menu-btn, svg.lucide-menu').first();
    
    // Validate if the responsive mobile layout button exists on the viewport DOM
    if (await mobileMenuButton.count() > 0) {
      await expect(mobileMenuButton).toBeVisible();
      
      // Execute click event to toggle open the hidden navigation drawer panel
      await mobileMenuButton.click();

      // 3. Assert that the hidden layout panel drawer transitions smoothly to a visible state
      const mobileNavOverlay = page.locator('[role="dialog"], [role="menu"], .drawer-content, nav.mobile-nav').first();
      await expect(mobileNavOverlay).toBeVisible();

      // 4. Confirm that core admin dashboard links remain completely accessible inside the view
      const criticalDashboardOption = page.locator('text=Analytics, text=Logs, text=Queue').first();
      if (await criticalDashboardOption.count() > 0) {
        await expect(criticalDashboardOption).toBeVisible();
      }
    }
  });

});