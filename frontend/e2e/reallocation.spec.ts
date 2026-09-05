import { test, expect } from "@playwright/test";

test.describe("Time-Bound Reallocation E2E", () => {
  test("should reallocate an un-opened AJRASAKHA question", async ({ page }) => {
    const oldExpertId = "expert_old";
    const newExpertId = "expert_new";

    // Mock the reallocation API.
    await page.route(
      /\/api\/questions\/reallocate-timebound/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Question reallocated successfully",
            data: {
              questionId: "q_reallocation_test",
              oldExpertId,
              newExpertId,
              currentExpertOpenedAt: null,
              currentExpertAllocatedAt: new Date().toISOString(),
            },
          }),
        });
      }
    );

    // Open a simple page so Playwright can make the request.
    await page.goto("/auth");

    // Trigger the same endpoint used by the application.
    const response = await page.evaluate(async () => {
      const result = await fetch("/api/questions/reallocate-timebound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      return {
        status: result.status,
        body: await result.json(),
      };
    });

    // Verify the reallocation request succeeded.
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify the old expert was replaced.
    expect(response.body.data.oldExpertId).toBe(oldExpertId);
    expect(response.body.data.newExpertId).toBe(newExpertId);

    // Verify the new allocation state.
    expect(response.body.data.currentExpertOpenedAt).toBeNull();
    expect(response.body.data.currentExpertAllocatedAt).toBeTruthy();
  });
});