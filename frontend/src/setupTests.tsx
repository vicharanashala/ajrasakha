import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

afterEach(() => {
  cleanup();
});

beforeAll(() => {
  vi.mock("@tanstack/react-router", () => ({
    createFileRoute: vi.fn(),
    useNavigate: vi.fn(() => vi.fn()),
    useLocation: vi.fn(() => ({ pathname: "/" })),
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
    Outlet: () => null,
    RouterProvider: () => null,
  }));

  vi.mock("@/stores/auth-store", () => ({
    useAuthStore: vi.fn(() => ({
      user: { uid: "test-uid", email: "test@test.com", name: "Test User", avatar: "" },
      firebaseUser: null,
      loading: false,
      isAuthenticated: true,
      initAuthListener: vi.fn(),
    })),
  }));
});
