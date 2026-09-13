import { Page } from "@playwright/test";

export interface MockUserOptions {
  role?: string;
  email?: string;
  name?: string;
  isCallAgentActive?: boolean;
}

export async function setupMockMediaDevices(page: Page) {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        writable: true,
        configurable: true,
      });
    }

    const mockStream = {
      getTracks: () => [
        {
          stop: () => {},
          enabled: true,
        },
      ],
      getAudioTracks: () => [
        {
          stop: () => {},
          enabled: true,
        },
      ],
    };
    
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      return mockStream as any;
    };

    class MockMediaRecorder {
      state = "inactive";
      ondataavailable: any = null;
      onstop: any = null;
      stream: any;

      constructor(stream: any) {
        this.stream = stream;
      }

      start() {
        this.state = "recording";
        setTimeout(() => {
          if (this.ondataavailable) {
            this.ondataavailable({ data: new Blob(["dummy audio data"], { type: "audio/webm" }) });
          }
        }, 100);
      }

      stop() {
        this.state = "inactive";
        if (this.onstop) {
          this.onstop();
        }
      }
    }

    (window as any).MediaRecorder = MockMediaRecorder;

    class MockAudioContext {
      close = async () => {};
      createMediaStreamSource() {
        return {
          connect: () => {},
        };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          frequencyBinCount: 128,
          getByteFrequencyData: (array: Uint8Array) => {
            for (let i = 0; i < array.length; i++) {
              array[i] = Math.floor(Math.random() * 255);
            }
          },
        };
      }
    }
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;
  });
}

export async function performMockLogin(page: Page, options: MockUserOptions = {}) {
  const role = options.role || "farmer";
  const email = options.email || `${role}@example.com`;
  const name = options.name || `${role.charAt(0).toUpperCase() + role.slice(1)} User`;
  const isCallAgentActive = options.isCallAgentActive !== undefined ? options.isCallAgentActive : true;

  // Add console listeners
  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.error(`[BROWSER EXCEPTION]: ${err.message}\nStack: ${err.stack}`);
  });

  // Intercept all Google Identity Toolkit requests
  await page.route(/identitytoolkit/, async (route) => {
    const url = route.request().url();
    if (url.includes("verifyPassword") || url.includes("signInWithPassword")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          localId: "mock-uid-1234",
          email: email,
          displayName: name,
          idToken: "mock-id-token",
          registered: true,
          refreshToken: "mock-refresh-token",
          expiresIn: "3600",
          emailVerified: true
        }),
      });
    } else if (url.includes("getAccountInfo") || url.includes("lookup")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "identitytoolkit#GetAccountInfoResponse",
          users: [
            {
              localId: "mock-uid-1234",
              email: email,
              emailVerified: true,
              displayName: name,
              createdAt: "123456789",
              lastLoginAt: "123456789"
            }
          ]
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    }
  });

  await page.route(/securetoken\.googleapis\.com\/v1\/token/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        expires_in: "3600",
        token_type: "Bearer",
        refresh_token: "mock-refresh-token",
        id_token: "mock-id-token",
        user_id: "mock-uid-1234",
        project_id: "dummy-project-id"
      }),
    });
  });

  // Mock Firebase Installations to clean up console errors
  await page.route(/firebaseinstallations\.googleapis\.com/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "projects/dummy-project/installations/mock-fid-1234",
        fid: "mock-fid-1234",
        refreshToken: "mock-install-refresh-token",
        authToken: {
          token: "mock-install-auth-token",
          expiresIn: "3600s"
        }
      }),
    });
  });

  // Intercept backend endpoints
  await page.route(/\/api\/users\/details\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        _id: "mock-id-1234",
        email: email,
        role: role,
        firstName: name.split(" ")[0],
        lastName: name.split(" ")[1] || "",
        isCallAgentActive: isCallAgentActive,
        isBlocked: false,
        status: "active",
      }),
    });
  });

  await page.route(/\/api\/auth\/sync/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          _id: "mock-id-1234",
          email: email,
          role: role,
          firstName: name.split(" ")[0],
          lastName: name.split(" ")[1] || "",
          notifications: 5,
          isCallAgentActive: isCallAgentActive,
          isBlocked: false,
          status: "active",
        }
      }),
    });
  });

  await page.route(/\/api\/users\/me/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        _id: "mock-id-1234",
        email: email,
        role: role,
        firstName: name.split(" ")[0],
        lastName: name.split(" ")[1] || "",
        notifications: 5,
        isCallAgentActive: isCallAgentActive,
        isBlocked: false,
        status: "active",
      }),
    });
  });

  // Clear any existing localStorage state on page load
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // Navigate to auth
  await page.goto("/auth");

  // Perform UI login
  await page.fill("input[name='email']", email);
  await page.fill("input[name='password']", "password123");
  await page.click("button[type='submit']");

  // Wait for redirect to home
  await page.waitForURL("**/home");
}

export async function setupDefaultMockRoutes(page: Page) {
  // Catch-all mock for API endpoints. Exclude Vite frontend JS/TS source files.
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;

    // Do NOT intercept Vite frontend source modules or static assets
    if (
      path.includes("/src/") ||
      path.includes("/node_modules/") ||
      path.endsWith(".ts") ||
      path.endsWith(".tsx") ||
      path.endsWith(".js") ||
      path.endsWith(".jsx") ||
      path.endsWith(".css")
    ) {
      return route.fallback();
    }

    // Allow key test endpoints to fall back to their specific mocks in test files
    if (
      path.includes("/details/") ||
      path.includes("/sync") ||
      path.includes("/me") ||
      path.includes("/speech-to-text") ||
      path.includes("/questions/generate") ||
      path.includes("/question/generate") ||
      path.includes("/context")
    ) {
      return route.fallback();
    }

    if (path.includes("/crops")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ crops: [], totalPages: 1, totalCount: 0 }),
      });
    }

    if (path.includes("/notifications")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [], page: 1, totalCount: 0, totalPages: 0 }),
      });
    }

    if (path.includes("/performance/overview")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userRoleOverview: [],
          stfExpertCount: 0,
          stfModeratorCount: 0,
          moderatorApprovalRate: { approved: 0, rejected: 0, pending: 0 },
        }),
      });
    }

    if (path.includes("/performance/golden-dataset")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "year",
          totalEntriesByType: 0,
          totalVerifiedByType: 0,
          verifiedEntries: 0,
          yearData: [],
          weeksData: [],
          dailyData: [],
          dayHourlyData: {},
        }),
      });
    }

    if (path.includes("/performance/status-overview")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: [],
          answers: [],
        }),
      });
    }

    if (path.includes("/performance/questions-analytics")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cropData: [],
          stateData: [],
          domainData: [],
          tableData: [],
        }),
      });
    }

    if (path.includes("/performance/workload")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          currentUserAnswersCount: 0,
          totalQuestionsCount: 0,
          totalInreviewQuestionsCount: 0,
        }),
      });
    }

    if (path.includes("/users/all")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          myPreference: { states: [], crops: [] },
          users: [],
          totalUsers: 0,
          totalPages: 0,
        }),
      });
    }

    if (path.includes("/questions/detailed")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: [],
          totalQuestions: 0,
          totalPages: 0,
        }),
      });
    }

    // Endpoints returning raw arrays directly
    if (
      path.includes("/location/states") ||
      path.includes("/chemicals") ||
      path.includes("/users/review-level") ||
      path.includes("/performance/shift-based-") ||
      path.includes("/performance/contribution-trend") ||
      path.includes("/expert-performance") ||
      path.includes("/call-agents") ||
      path.includes("/available")
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Default mock response: return a unified object satisfying both data and other property access
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        total: 0,
        success: true,
        crops: [],
        notifications: [],
        users: []
      }),
    });
  });
}
