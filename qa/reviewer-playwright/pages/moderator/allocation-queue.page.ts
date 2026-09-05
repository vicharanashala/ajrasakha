import { expect, type Locator, type Page } from "@playwright/test";
import { ModeratorQuestionDetailsPage } from "./question-details.page.js";
import { ModeratorDashboardPage } from "./dashboard.page.js";

export class ModeratorAllocationQueuePage {
  readonly heading: Locator;
  readonly subtitle: Locator;

  readonly autoAllocateSwitch: Locator;
  readonly autoAllocateLabel: Locator;
  readonly allocationSection: Locator;

  readonly allocationCards: Locator;
  readonly expertNames: Locator;
  readonly statusBadges: Locator;
  readonly firstAllocationCard: Locator;
  readonly assignedLabel: Locator;
  readonly completedLabel: Locator;
  readonly durationLabel: Locator;

  readonly allocationStatusMessage: Locator;

  readonly gateKeeperHeading: Locator;
  readonly gateKeeperSubtitle: Locator;
  readonly gateKeeperEmptyState: Locator;
  readonly gateKeeperSection: Locator;
  readonly gateKeeperToggle: Locator;
  readonly gateKeeperToggleLabel: Locator;
  readonly gateKeeperEmptyMessage: Locator;

  readonly auditorSection: Locator;
  readonly auditorHeading: Locator;
  readonly auditorSubtitle: Locator;
  readonly auditorToggle: Locator;
  readonly auditorToggleLabel: Locator;
  readonly auditorEmptyState: Locator;
  readonly auditorEmptyMessage: Locator;

  readonly moderatorSection: Locator;
  readonly moderatorHeading: Locator;
  readonly moderatorSubtitle: Locator;
  readonly moderatorToggle: Locator;
  readonly moderatorToggleLabel: Locator;
  readonly moderatorEmptyState: Locator;
  readonly moderatorEmptyMessage: Locator;

  readonly submissionHistoryHeading: Locator;
  readonly refreshButton: Locator;
  readonly manageHistoryButton: Locator;
  readonly noAnswersMessage: Locator;

  readonly removeExpertDialog: Locator;
  readonly removeExpertHeading: Locator;
  readonly removeButton: Locator;
  readonly closeRemoveDialogButton: Locator;
  readonly allocationRemovedToast: Locator;
  // readonly noExpertsAssignedMessage: Locator;
  readonly noExpertsAllocatedHeading: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", {
      name: "Allocation Queue",
    });

    this.subtitle = page.getByText(/experts? in queue/i);

    this.autoAllocateSwitch = page.getByRole("switch", {
      name: "Auto-allocate Experts",
    });
    this.autoAllocateLabel = page.getByText("Auto-allocate Experts", {
      exact: true,
    });

    this.allocationSection = this.heading.locator("xpath=ancestor::section[1]");

    // Case-insensitive deliberately: auto-allocated cards render the
    // generic label as lowercase "expert" (confirmed via real DOM:
    // `<p title="expert">expert</p>`), while manually-allocated cards
    // (via "Select Experts") render it capitalized ("Expert"). An
    // exact-match "Expert" filter silently matches zero auto-allocated
    // cards — this was the actual cause of AAR-001..004 timing out
    // waiting for an allocation card that was already on the page the
    // whole time.
    this.allocationCards = this.page.locator(".group").filter({
      has: this.page.getByText(/^expert$/i),
    });
    // Expert email displayed on the card
    this.expertNames = page.locator('p[title*="@"]');

    // Status badge on every card
    this.statusBadges = page.locator("span").filter({
      hasText:
        /Answer Created|Approved|Rejected|Waiting|Modified|Pending|Your Turn/,
    });

    // Back side of flipped card
    this.firstAllocationCard = this.allocationCards.first();

    this.assignedLabel = this.firstAllocationCard.getByText("Assigned:");

    this.completedLabel = this.firstAllocationCard.getByText("Completed:");

    this.durationLabel = this.firstAllocationCard.getByText("Duration");

    this.allocationStatusMessage = this.page.getByText(
      /Expert .*reviewing|Expert created an answer/i,
    );

    this.gateKeeperSection = this.page.locator(".w-full.space-y-6").filter({
      has: this.page.getByRole("heading", {
        name: "Gate Keeper Queue",
      }),
    });

    this.gateKeeperHeading = this.gateKeeperSection.getByRole("heading", {
      name: "Gate Keeper Queue",
    });

    this.gateKeeperSubtitle = this.gateKeeperSection.locator("p").first();

    this.gateKeeperEmptyState = this.gateKeeperSection.getByRole("heading", {
      name: "No gate keeper assigned",
    });

    this.gateKeeperToggle = page.getByRole("switch", {
      name: "Auto-allocate Gate Keeper",
    });

    this.gateKeeperToggleLabel = page.getByText("Auto-allocate Gate Keeper", {
      exact: true,
    });

    this.gateKeeperEmptyMessage = page.getByText(
      /No gate keeper is currently assigned/,
    );

    this.auditorSection = this.page.locator(".w-full.space-y-6").filter({
      has: this.page.getByRole("heading", {
        name: "Auditor Queue",
      }),
    });

    this.auditorHeading = this.auditorSection.getByRole("heading", {
      name: "Auditor Queue",
    });

    this.auditorSubtitle = this.auditorSection.locator("p").first();

    this.auditorToggle = this.page.getByRole("switch", {
      name: "Auto-allocate Auditor",
    });

    this.auditorToggleLabel = this.page.getByText("Auto-allocate Auditor", {
      exact: true,
    });

    this.auditorEmptyState = this.auditorSection.getByRole("heading", {
      name: "No auditor assigned",
    });

    this.auditorEmptyMessage = this.auditorSection.getByText(
      /No auditor is currently assigned/,
    );
    this.moderatorSection = this.page.locator(".w-full.space-y-6").filter({
      has: this.page.getByRole("heading", {
        name: "Moderator Queue",
      }),
    });

    this.moderatorHeading = this.moderatorSection.getByRole("heading", {
      name: "Moderator Queue",
    });

    this.moderatorSubtitle = this.moderatorSection.locator("p").first();

    this.moderatorToggle = this.page.getByRole("switch", {
      name: "Auto-allocate Moderator",
    });

    this.moderatorToggleLabel = this.page.getByText("Auto-allocate Moderator", {
      exact: true,
    });

    this.moderatorEmptyState = this.moderatorSection.getByRole("heading", {
      name: "No Moderator Assigned",
    });

    this.moderatorEmptyMessage = this.moderatorSection.getByText(
      /No moderator is currently assigned/,
    );

    this.submissionHistoryHeading = page.getByRole("heading", {
      name: "Submission History",
    });

    this.refreshButton = page.getByRole("button", {
      name: "Refresh",
    });

    this.manageHistoryButton = page.getByRole("button", {
      name: "Manage History",
    });

    this.noAnswersMessage = page.getByText("No answers yet.", {
      exact: true,
    });

    this.removeExpertDialog = page.getByRole("alertdialog");

    this.removeExpertHeading = this.removeExpertDialog.getByRole("heading", {
      name: "Remove Expert Allocation?",
    });

    this.removeButton = this.removeExpertDialog.getByRole("button", {
      name: "Remove",
    });

    this.closeRemoveDialogButton = this.removeExpertDialog
      .getByRole("button")
      .last();

    this.allocationRemovedToast = page.getByText(
      /allocation removed|expert removed|removed successfully/i,
    );
    // this.noExpertsAssignedMessage = page.getByText(/No Experts Allocated/i);
    this.noExpertsAllocatedHeading = page.getByRole("heading", {
      name: "No Experts Allocated",
    });
  }

  //   FUNCTIONS======================================
  async pause(): Promise<void> {
    await this.page.pause();
  }

  async expectOpened(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
  }

  async expectAutoAllocateToggle(): Promise<void> {
    await expect(this.autoAllocateSwitch).toBeVisible();
    await expect(this.autoAllocateLabel).toBeVisible();
  }

  async expectAllocationCards(): Promise<void> {
    await expect(this.allocationCards.first()).toBeVisible();
  }

  /**
   * Waits for auto-allocation to actually assign an initial reviewer
   * after a question is created.
   *
   * Observed to sometimes take noticeably longer than the project's
   * default ~10s expect timeout on the very FIRST load of a freshly
   * created question — this is a real async backend delay before the
   * allocation card appears at all, not the HTTP-caching staleness
   * documented on the expert side (ExpertDashboardPage.reload()): this
   * is an initial load, not a repeated reload of an already-stale page,
   * so there's nothing to bypass here — just genuinely needs more time
   * on occasion. A single generous `expect(...).toBeVisible({timeout})`
   * is enough (Playwright's built-in polling already re-checks the DOM
   * continuously within that window); no manual reload loop needed.
   *
   * Use this instead of the plain expectAllocationCards() /
   * getFirstAllocatedExpertEmail() right after opening a freshly
   * created question when auto-allocation is expected to assign
   * someone automatically (i.e. whenever auto-allocate is left ON,
   * as in the auto-allocation random-review workflow).
   */
  async waitForAutoAllocatedExpert(timeout = 45_000): Promise<void> {
    await expect(this.allocationCards.first()).toBeVisible({ timeout });
  }

  async expectExpertsVisible(): Promise<void> {
    await expect(this.expertNames.first()).toBeVisible();
  }

  async expectStatusesVisible(): Promise<void> {
    await expect(this.statusBadges.first()).toBeVisible();
  }

  async openFirstAllocationCard() {
    const card = this.allocationCards.first();

    await expect(card).toBeVisible();

    await card.scrollIntoViewIfNeeded();

    await card.hover({ force: true });
  }

  async expectAllocationStatusMessage() {
    const card = this.allocationCards.first();

    await expect(
      card.getByText(/Expert .*reviewing|Expert created an answer/i),
    ).toBeVisible();
  }

  async expectGateKeeperOpened() {
    await expect(this.gateKeeperHeading).toBeVisible();
    await expect(this.gateKeeperSubtitle).toBeVisible();
  }

  async expectGateKeeperToggle() {
    await expect(this.gateKeeperToggle).toBeVisible();
    await expect(this.gateKeeperToggleLabel).toBeVisible();
  }
  async expectGateKeeperEmptyState() {
    await expect(this.gateKeeperEmptyState).toBeVisible();
  }
  async expectGateKeeperMessage() {
    await expect(this.gateKeeperEmptyMessage).toBeVisible();
  }
  async expectAuditorOpened() {
    await expect(this.auditorHeading).toBeVisible();
  }

  async expectAuditorToggle() {
    await expect(this.auditorToggle).toBeVisible();
    await expect(this.auditorToggleLabel).toBeVisible();
  }

  async expectAuditorEmptyState() {
    await expect(this.auditorEmptyState).toBeVisible();
  }

  async expectAuditorMessage() {
    await expect(this.auditorEmptyMessage).toBeVisible();
  }
  async expectModeratorOpened() {
    await expect(this.moderatorHeading).toBeVisible();
  }

  async expectModeratorToggle() {
    await expect(this.moderatorToggle).toBeVisible();
    await expect(this.moderatorToggleLabel).toBeVisible();
  }

  async expectModeratorEmptyState() {
    await expect(this.moderatorEmptyState).toBeVisible();
  }

  async expectModeratorMessage() {
    await expect(this.moderatorEmptyMessage).toBeVisible();
  }

  async expectSubmissionHistoryOpened() {
    await expect(this.submissionHistoryHeading).toBeVisible();
  }

  async expectRefreshButton() {
    await expect(this.refreshButton).toBeVisible();
  }

  async expectManageHistoryButtonDisabled() {
    await expect(this.manageHistoryButton).toBeDisabled();
  }

  async expectNoAnswersMessage() {
    await expect(this.noAnswersMessage).toBeVisible();
  }
  async disableExpertAutoAllocate() {
    await expect(this.autoAllocateSwitch).toBeVisible();

    await expect(this.autoAllocateSwitch).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await this.autoAllocateSwitch.click();

    await expect(this.autoAllocateSwitch).toHaveAttribute(
      "aria-checked",
      "false",
    );
  }
  expertCard(email: string) {
    return this.allocationCards.filter({
      has: this.page.getByText(email),
    });
  }

  async expectExpertAllocated(email: string) {
    await expect(this.expertCard(email)).toBeVisible();
  }
  async expectAutoAllocatedExpert(): Promise<void> {
    await expect(this.expertNames.first()).toHaveText(/.+@annam\.ai$/);
  }

  async getFirstAllocatedExpertEmail(): Promise<string> {
    const email = await this.expertNames.first().textContent();

    expect(email).toMatch(/.+@annam\.ai$/);

    return email!;
  }

  /**
   * Same reasoning as waitForAutoAllocatedExpert() above: right after
   * clickAllocate(), with no prior wait, this is a first-load delay
   * (backend hasn't finished reflecting the new allocation yet), not the
   * HTTP-caching staleness documented on reload() - so there's nothing to
   * bypass here, and reload() itself isn't safe to use as a retry: this
   * page reaches the Allocation Queue view via a click-based selection
   * that (like the expert dashboard's question list) never round-trips
   * through the URL, so a hard page.reload() drops back to the question
   * list instead of refreshing this view. A single generous
   * expect(...).toBeVisible({timeout}) is enough - Playwright's built-in
   * polling already re-checks the DOM continuously within that window.
   */
  async expectExpertStatus(
    email: string,
    expectedStatus: string,
    timeout = 30_000,
  ): Promise<void> {
    const card = this.expertCard(email);

    await expect(card).toBeVisible();

    const status = card.getByText(expectedStatus, {
      exact: true,
    });

    await expect(status).toBeVisible({ timeout }).catch(async (error) => {
      console.log("=================================");
      console.log("EXPERT:", email);
      console.log("EXPECTED STATUS:", expectedStatus);
      console.log("CARD TEXT:");
      console.log(await card.innerText());
      console.log("=================================");
      throw error;
    });
  }
  async openRemoveExpertDialog(email: string) {
    const card = this.expertCard(email);

    await card.hover();

    await card.locator("[data-slot='alert-dialog-trigger']").click();
  }

  async expectRemoveExpertDialog() {
    await expect(this.removeExpertDialog).toBeVisible();

    await expect(this.removeExpertHeading).toBeVisible();

    await expect(this.removeButton).toBeVisible();

    await expect(this.closeRemoveDialogButton).toBeVisible();
  }
  // async confirmRemoveExpert() {
  //   await expect(this.removeButton).toBeVisible();

  //   await this.removeButton.click();
  // }
  async confirmRemoveExpert() {
    await expect(this.removeButton).toBeVisible();
    await this.removeButton.click();
    await this.page.waitForTimeout(3000);
  }
  async expectRemoveDialogClosed() {
    await expect(this.removeExpertDialog).toBeHidden();
  }
  async expectExpertRemoved(email: string) {
    await expect(this.expertCard(email)).toHaveCount(0);
  }
  async expectEmptyExpertQueue() {
    // await expect(this.subtitle).toHaveText("0 experts in queue");

    await expect(this.noExpertsAllocatedHeading).toBeVisible();

    await expect(this.allocationCards).toHaveCount(0);
  }
  async getExpertStatus(email: string): Promise<string> {
    const card = this.expertCard(email);

    const statuses = [
      "Answer Created",
      "Approved",
      "Rejected",
      "Waiting",
      "Modified",
      "Pending",
      "Your Turn",
    ];

    for (const status of statuses) {
      const locator = card.getByText(status, { exact: true });

      if (await locator.count()) {
        return (await locator.first().innerText()).trim();
      }
    }

    throw new Error(`No expert status found for ${email}`);
  }

  /**
   * Returns the email of whichever allocated expert currently has the
   * active turn (status "Waiting" or "Your Turn" — confirmed via real
   * DOM inspection that "Waiting" specifically means "action needed
   * from this person now", not merely queued; its tooltip reads
   * "Expert is currently reviewing Expert's answer").
   *
   * Needed for auto-allocation-driven flows, where the backend — not
   * the test — decides which expert gets the next turn. Unlike the
   * manual-allocation triple-acceptance workflow (which always knows
   * the reviewer order up front: EXPERT_EMAIL_2, then _3, then _4),
   * this has to ask the moderator's own view who's active right now
   * and dynamically log in as that person via the generic
   * `loginAsExpert(email)` fixture.
   */
  async getActiveExpertEmail(): Promise<string> {
    const count = await this.allocationCards.count();

    for (let i = 0; i < count; i++) {
      const card = this.allocationCards.nth(i);
      const text = (await card.innerText()).trim();

      if (/\b(Waiting|Your Turn)\b/.test(text)) {
        const match = text.match(/[\w.+-]+@annam\.ai/);

        if (match) {
          return match[0];
        }
      }
    }

    throw new Error(
      "getActiveExpertEmail: no card in the allocation queue is " +
        'currently "Waiting" / "Your Turn" (i.e. active). Either the ' +
        "queue hasn't caught up yet (try reloading the moderator page " +
        "first) or every allocated expert has already acted.",
    );
  }

  /**
   * All expert emails currently shown in the Allocation Queue, in
   * display order. Used to count how many distinct experts have
   * participated in an auto-allocation review chain so far.
   */
  async getAllocatedExpertEmails(): Promise<string[]> {
    const count = await this.expertNames.count();
    const emails: string[] = [];

    for (let i = 0; i < count; i++) {
      const email = (await this.expertNames.nth(i).textContent())?.trim();

      if (email) {
        emails.push(email);
      }
    }

    return emails;
  }

  /**
   * Logs email + status for every card currently in the queue.
   * Purely diagnostic — call this whenever waitForNextActiveExpert()
   * is about to give up, so a failed run's console output shows
   * exactly what the queue looked like instead of just "not found".
   */
  async logAllocationSnapshot(label: string): Promise<void> {
    const emails = await this.getAllocatedExpertEmails();

    console.log(
      `[AAR] Allocation snapshot (${label}): ${emails.length} card(s)`,
    );

    for (const email of emails) {
      try {
        const status = await this.getExpertStatus(email);
        console.log(`[AAR]   - ${email}: ${status}`);
      } catch {
        console.log(`[AAR]   - ${email}: <status not found>`);
      }
    }
  }

  // Lazily-initialized CDP session used to force real cache bypass on
  // reload() — same fix, same reasoning as
  // ExpertDashboardPage.ensureCacheDisabled(): a plain page.reload()
  // still honors normal browser HTTP caching, which can make an
  // already-updated queue look permanently stale to a tight poll loop.
  private cacheDisabled = false;

  private async ensureCacheDisabled(): Promise<void> {
    if (this.cacheDisabled) {
      return;
    }

    try {
      const client = await this.page.context().newCDPSession(this.page);
      await client.send("Network.setCacheDisabled", { cacheDisabled: true });
      this.cacheDisabled = true;
    } catch (error) {
      console.log(
        `ModeratorAllocationQueuePage: could not disable cache via CDP ` +
          `(${(error as Error).message}); reload() may see cached responses.`,
      );
    }
  }

  /**
   * Force a genuine (cache-bypassed) refetch of the current question's
   * Allocation Queue view.
   */
  async reload(): Promise<void> {
    await this.ensureCacheDisabled();
    await this.page.reload();
    await this.expectOpened();
  }

  /**
   * Polls (reloading, cache bypassed) until a DIFFERENT expert than
   * `previousExpert` becomes the active ("Waiting"/"Your Turn") reviewer.
   *
   * This is the moderator-side equivalent of
   * ExpertDashboardPage.waitForQuestionEnabled(): after any action
   * (initial answer submitted, or a review accepted/rejected/modified),
   * the backend needs a moment to hand the turn to the next expert, and
   * a single one-shot getActiveExpertEmail() call can either be too
   * early (queue hasn't caught up) or read a stale cached response
   * forever. Bounded and logged so a stall is diagnosable in seconds,
   * not indistinguishable from a 15-minute hang.
   */
  async waitForNextActiveExpert(
    page: Page,
    moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage,
    moderatorDashboard: ModeratorDashboardPage,
    moderatorAllocationQueuePage: ModeratorAllocationQueuePage,
    question: string,
    previousExpert: string | null,
    timeout = 60_000,
    pollInterval = 3_000,
  ): Promise<string> {
    const deadline = Date.now() + timeout;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt++;

      try {
        console.log(
          `[AAR] Checking for next active expert — attempt ${attempt}`,
        );

        // If the question is currently open, exit it.
        await moderatorQuestionDetailsPage.exit();

        // Re-open the SAME question to get fresh allocation state.
        await moderatorDashboard.openQuestion(question);

        // Wait for the allocation details to load.
        await moderatorAllocationQueuePage.expectOpened();

        const activeExpert =
          await moderatorAllocationQueuePage.getActiveExpertEmail();

        console.log(
          `[AAR] Attempt ${attempt}: active="${activeExpert}", ` +
            `previous="${previousExpert}"`,
        );

        if (activeExpert && activeExpert !== previousExpert) {
          console.log(`[AAR] Found next active expert: ${activeExpert}`);

          return activeExpert;
        }

        console.log(`[AAR] No new active expert yet on attempt ${attempt}`);

        // We are currently inside the question after checking it.
        // Exit so the next iteration starts cleanly.
        await moderatorQuestionDetailsPage.exit();
      } catch (error) {
        console.log(
          `[AAR] Attempt ${attempt} failed: ${(error as Error).message}`,
        );
      }

      await page.waitForTimeout(pollInterval);
    }

    await moderatorAllocationQueuePage.logAllocationSnapshot(
      "waitForNextActiveExpert timeout",
    );

    throw new Error(
      `No new active expert different from "${previousExpert}" ` +
        `appeared within ${timeout}ms.`,
    );
  }

  async expectRejectionReason(reason: string): Promise<void> {
    await expect(this.page.getByText(reason, { exact: true })).toBeVisible();
  }
}
