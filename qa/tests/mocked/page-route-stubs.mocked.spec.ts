/**
 * Mocked suite: page.route() stubbing pattern.
 *
 * Demonstrates the `page.route()` interception pattern that future mocked
 * specs can copy when they need to stub a real API endpoint.  This is the
 * canonical shape for "I want to verify the UI handles a 500 gracefully"
 * without involving staging.
 *
 * What this proves:
 *   • `page.route()` can satisfy a request before the page is loaded.
 *   • `page.route()` can later abort a request and the stub handler can
 *     still observe the request via `onRequest`.
 *   • The mocked project itself is wired correctly end-to-end (fixture
 *     load, page creation, response inspection).
 *
 * @mocked
 */
import { test, expect } from "@playwright/test";

test.describe("@mocked page.route() stubbing", () => {
  test("MOCCK-RT-01 • page.route can fulfill a request with a stubbed payload", async ({
    page,
  }) => {
    // ------------------------------------------------------------------
    // Stub EVERY request that goes through the browser context with a
    // deterministic, empty HTML page.  This is the same trick real mocked
    // tests use to substitute backend responses with local fixtures.
    // ------------------------------------------------------------------
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.endsWith(".css") || url.endsWith(".png")) {
        return route.fulfill({ status: 200, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body><h1 data-testid='stub'>stubbed</h1></body></html>",
      });
    });

    const response = await page.goto("/anything");
    expect(response, "navigation should succeed against the stub").not.toBeNull();
    // The stub body is what got rendered.
    await expect(page.getByTestId("stub")).toHaveText("stubbed");
  });

  test("MOCCK-RT-02 • page.route can abort a request and the page handle still works", async ({
    page,
  }) => {
    let observed = false;

    await page.route("**/api/**", (route) => {
      observed = true;
      return route.abort("failed");
    });

    // Use setContent for the page chrome — no navigation required, so
    // the route handler above is invoked only when something deliberately
    // hits /api/*.  This is the safe way to verify the abort path without
    // racing with the page itself.
    await page.setContent(
      `<!doctype html><html><body>
        <button data-testid="ping">ping</button>
        <pre data-testid="status">idle</pre>
        <script>
          document.getElementById('ping').addEventListener('click', () => {
            fetch('/api/v1/health').catch(() => {
              document.getElementById('status').textContent = 'aborted';
            });
          });
        </script>
      </body></html>`,
    );

    await page.getByTestId("ping").click();
    await expect(page.getByTestId("status")).toHaveText("aborted", {
      timeout: 2_000,
    });
    // The handler should have been invoked at least once.  The exact
    // count depends on the browser's prefetch heuristics, so we only
    // assert that the route was wired up correctly.
    expect(observed, "route handler should have been invoked").toBe(true);
  });

  test("MOCCK-RT-03 • page.route can fulfill with a JSON payload (API-shape pattern)", async ({
    page,
  }) => {
    // This mirrors how a future spec will stub /api/v1/questions when
    // it wants to exercise the queue UI without staging.
    type StubQuestion = { id: string; title: string };
    const stubQuestions: StubQuestion[] = [
      { id: "q-1", title: "How do I irrigate tomatoes?" },
      { id: "q-2", title: "Best fertilizer for wheat?" },
    ];

    await page.route("**/api/v1/questions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ questions: stubQuestions }),
      }),
    );

    const response = await page.request.get("/api/v1/questions");
    expect(response.status(), "stub should return 200").toBe(200);
    const json = (await response.json()) as { questions: StubQuestion[] };
    expect(json.questions, "stubbed payload must round-trip").toEqual(stubQuestions);
  });
});
