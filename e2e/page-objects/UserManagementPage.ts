import { type Page, type Locator, expect } from "@playwright/test";

/**
 * User Management tab (UserManagement → UsersTable).
 * Search + role filter live in the toolbar / UserFiltersDialog.
 */
export class UserManagementPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto("/home");
    await this.page
      .locator("header")
      .getByRole("tab", { name: "User Management", exact: true })
      .click();
  }

  get tableRows(): Locator {
    return this.page.locator("tbody tr");
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder("Search users...");
  }

  get filtersButton(): Locator {
    return this.page.getByRole("button", { name: /filters/i }).first();
  }

  get applyFiltersButton(): Locator {
    return this.page.getByRole("button", { name: "Apply Filters" });
  }

  /** Pick a role inside the User Filters dialog (admin-only role select). */
  async filterByRole(role: "Admin" | "Moderator" | "Expert"): Promise<void> {
    await this.filtersButton.click();
    const dialog = this.page.getByRole("dialog", { name: /user filters/i });
    // The Radix SelectTrigger's accessible name is its value text ("All Roles"),
    // not the surrounding <Label> ("Role"), so match on the value text.
    await dialog
      .getByRole("combobox")
      .filter({ hasText: "All Roles" })
      .click();
    await this.page.getByRole("option", { name: role, exact: true }).click();
    await this.applyFiltersButton.click();
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await expect(this.searchInput).toHaveValue(term);
  }

  /** Search miss: the table falls back to an empty state. */
  get emptyState(): Locator {
    return this.page.getByText("No users found").first();
  }
}
