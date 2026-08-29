import type { Page, Locator } from "@playwright/test";

export class NotificationPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // --- bell trigger (always visible in playground header) ---

  get bellTrigger(): Locator {
    // Two [data-slot="sheet-trigger"] elements exist: desktop bell + mobile menu trigger.
    // Desktop bell is first in DOM order.
    return this.page.locator('[data-slot="sheet-trigger"]').first();
  }

  // --- sheet ---

  get sheetContent(): Locator {
    return this.page.locator('[data-slot="sheet-content"]');
  }

  get sheetTitle(): Locator {
    return this.page.locator('[data-slot="sheet-title"]');
  }

  get sheetCloseButton(): Locator {
    return this.page.locator('[data-slot="sheet-close"]');
  }

  // --- notification items ---

  get notificationCards(): Locator {
    return this.page.locator('[data-slot="sheet-content"] .flex.gap-4.p-4.rounded-xl');
  }

  get notificationTitles(): Locator {
    return this.page.locator('[data-slot="sheet-content"] h4.font-bold');
  }

  get notificationMessages(): Locator {
    return this.page.locator('[data-slot="sheet-content"] p.text-xs.text-muted-foreground');
  }

  // --- mark all read ---

  get markAllReadButton(): Locator {
    return this.page.getByRole("button", { name: "Mark all read" });
  }

  // --- delete button (per notification, hidden until hover) ---

  async deleteFirstNotification(): Promise<void> {
    const firstCard = this.notificationCards.first();
    await firstCard.hover();
    const deleteBtn = firstCard.locator("button");
    await deleteBtn.click({ force: true });
  }

  // --- open sheet ---

  async open(): Promise<void> {
    await this.bellTrigger.click();
  }
}
