import type { Page } from "@playwright/test";

export const mockNotifications = [
  {
    _id: "notif_001",
    enitity_id: "q001",
    title: "Answer created for your question",
    type: "answer_creation",
    message: "A new answer has been submitted for your question about rice fertilizer.",
    is_read: false,
    createdAt: "2026-07-14T10:30:00.000Z",
    questionText: "What is the best fertilizer for rice?",
    sender: { _id: "exp001", name: "Dr. Sharma", email: "sharma@test.com", role: "expert" },
    recipient: null,
  },
  {
    _id: "notif_002",
    enitity_id: "q002",
    title: "Peer review requested",
    type: "peer_review",
    message: "Your answer for pest control in wheat needs peer review.",
    is_read: false,
    createdAt: "2026-07-14T09:00:00.000Z",
    questionText: "How to control pest in wheat?",
    sender: { _id: "mod001", name: "Moderator One", email: "mod@test.com", role: "moderator" },
    recipient: null,
  },
];



export async function mockNotificationsApi(page: Page) {
  // Override /api/users/me to include notification count
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        _id: "664f000000000000000000001",
        firebaseUID: "firebase-admin-uid",
        email: "admin@annam.ai",
        firstName: "Test",
        lastName: "Admin",
        role: "admin",
        isBlocked: false,
        status: "active",
        isCallAgent: false,
        isCallAgentActive: false,
        notifications: 2,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      }),
    });
  });

  // GET /api/notifications?page=X&limit=Y (paginated list)
  await page.route("**/api/notifications*", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    // Skip if URL has a notification ID after /api/notifications/
    if (pathname.match(/\/notifications\/[^/]+$/)) {
      return;
    }

    if (route.request().method() === "GET") {
      const pageParam = url.searchParams.get("page") || "1";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          notifications: mockNotifications,
          page: Number(pageParam),
          totalCount: mockNotifications.length,
          totalPages: 1,
        }),
      });
    } else if (route.request().method() === "PATCH") {
      // Mark all as read
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  // PATCH /api/notifications/:id (mark single as read) or DELETE /api/notifications/:id
  await page.route("**/api/notifications/*", async (route) => {
    if (route.request().method() === "PATCH") {
      const notifId = route.request().url().split("/").pop();
      const notif = mockNotifications.find((n) => n._id === notifId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(notif ? { ...notif, is_read: true } : null),
      });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204 });
    }
  });
}
