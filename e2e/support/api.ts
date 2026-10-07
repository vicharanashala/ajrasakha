import { type APIRequestContext, type Page } from "@playwright/test";
import { env } from "./config";

/**
 * API helpers for the Reviewer System backend.
 *
 * Every backend endpoint is protected by Firebase auth: the frontend attaches a
 * Firebase ID token as `Authorization: Bearer <token>`. Tests therefore need a
 * token. Two sources are provided:
 *
 *  1. `fetchIdToken` — Firebase Identity Toolkit REST exchange (email + password
 *     + the app's PUBLIC Firebase API key). No app changes required; the API key
 *     ships in the built frontend by design.
 *  2. `readFirebaseTokenFromPage` — reads the token Firebase persisted into the
 *     authed page's localStorage. Fallback for when the key is unavailable.
 *
 * These helpers are for VERIFICATION and TEST-DATA SETUP only. The GDB/push
 * flow itself is always verified through Reviewer-System state (UI toast +
 * question `status`, `finalAnswer`, `isFinalAnswer`, `approvedBy`) — never by
 * reading the golden service directly (TEST_PLAN.md §2).
 *
 * Contracts below were extracted from the backend controllers/validators:
 *  - POST   /questions                          AddQuestionBody { userId, question, context }
 *  - GET    /questions/:questionId/full         { success, data: { _id, status, answers, ... } }
 *  - GET    /questions/queue-details            queue counts by state
 *  - POST   /questions/:questionId/allocate-experts   AllocateExpertsRequest { experts: string[] }
 *  - POST   /answers/review                     ReviewAnswerBody (expert submit)
 *  - POST   /answers/moderator/approve          UpdateAnswerBody (moderator LLM approve)
 *  - GET    /answers/submissions                expert submissions (page/limit)
 *  - GET    /users/me                           current user
 *  - GET    /users/details/:email               user by email (no auth)
 *  - GET    /users/admin/all                    admin user list (role/search filters)
 *  - DELETE /questions/bulk                     cleanup { questionIds: string[] }
 */

const identityToolkitBase =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

/** Auth Emulator's Identity Toolkit surface (used only in localMode). */
function emulatorIdentityToolkitBase(): string {
  return `http://${env.authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword`;
}

export interface RuntimeConfig {
  VITE_FIREBASE_API_KEY?: string;
  [key: string]: string | undefined;
}

/** Read the runtime config the app exposes on window.__RUNTIME_CONFIG__. */
export async function getRuntimeConfig(page: Page): Promise<RuntimeConfig> {
  return page.evaluate(() => {
    const cfg = (
      window as unknown as { __RUNTIME_CONFIG__?: Record<string, string> }
    ).__RUNTIME_CONFIG__;
    return (cfg ?? {}) as Record<string, string>;
  });
}

/** Firebase ID token via the public Identity Toolkit REST endpoint. */
export async function fetchIdToken(opts: {
  apiKey: string;
  email: string;
  password: string;
}): Promise<string> {
  // Local E2E: the Auth Emulator serves the same Identity Toolkit REST surface
  // on its own port and accepts any key string, but STILL requires the `key`
  // query param to be present (403 PERMISSION_DENIED otherwise). Staging/prod
  // path unchanged.
  const endpoint = env.localMode
    ? `${emulatorIdentityToolkitBase()}?key=${opts.apiKey}`
    : `${identityToolkitBase}?key=${opts.apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: opts.email,
      password: opts.password,
      returnSecureToken: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firebase sign-in failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { idToken: string };
  return json.idToken;
}

/** Fallback: read the persisted Firebase token from an authed page. */
export async function readFirebaseTokenFromPage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("firebase:authUser:"),
    );
    if (!key) throw new Error("No firebase:authUser entry in localStorage");
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("firebase:authUser entry was empty");
    const parsed = JSON.parse(raw) as {
      stsTokenManager?: { accessToken?: string };
    };
    const token = parsed.stsTokenManager?.accessToken;
    if (!token) throw new Error("No access token in persisted auth state");
    return token;
  });
}

export type Json = unknown;

export interface ApiResponse {
  status: number;
  body: Json;
}

async function call(
  api: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  token: string,
  body?: unknown,
): Promise<ApiResponse> {
  const res = await api.fetch(`${env.apiBaseURL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: body === undefined ? undefined : (body as object),
  });
  const text = await res.text();
  let parsed: Json = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status(), body: parsed };
}

/** Throw with the backend's response when a call is not a 2xx. */
export function assertOk(op: string, res: ApiResponse): void {
  if (res.status < 200 || res.status >= 300) {
    const detail =
      typeof res.body === "string"
        ? res.body
        : JSON.stringify(res.body ?? "");
    throw new Error(`${op} failed with HTTP ${res.status}: ${detail}`);
  }
}

export const api = {
  get: (api: APIRequestContext, path: string, token: string) =>
    call(api, "GET", path, token),
  post: (api: APIRequestContext, path: string, token: string, body?: unknown) =>
    call(api, "POST", path, token, body),
  put: (api: APIRequestContext, path: string, token: string, body?: unknown) =>
    call(api, "PUT", path, token, body),
  delete: (api: APIRequestContext, path: string, token: string, body?: unknown) =>
    call(api, "DELETE", path, token, body),
};

// ─────────────────────────── domain helpers ───────────────────────────

export interface FullQuestionData {
  _id: string;
  question?: string;
  context?: string;
  status?: string;
  source?: string;
  answers?: Array<{
    _id?: string;
    answer?: string;
    answerIteration?: number;
    isFinalAnswer?: boolean;
    status?: string;
    authorId?: string;
    reviews?: unknown[];
    [k: string]: unknown;
  }>;
  finalAnswer?: string;
  isFinalAnswer?: boolean;
  approvedBy?: string | { _id?: string; name?: string; email?: string };
  closedAt?: string;
  referenceQuestionId?: string;
  /**
   * `/full` exposes the question's submission record (not an `answers` array).
   * The expert's submitted answers live in `submission.history[*].answer`.
   */
  submission?: {
    lastRespondedBy?: unknown;
    queue?: unknown[];
    history?: Array<{
      status?: string;
      updatedBy?: { _id?: string; name?: string; email?: string };
      answer?: {
        _id?: string;
        authorId?: string;
        answer?: string;
        answerIteration?: number;
        isFinalAnswer?: boolean;
        status?: string;
        remarks?: string;
        sources?: unknown[];
        reviews?: unknown[];
        createdAt?: string;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface UserRecord {
  _id: string;
  email?: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  isBlocked?: boolean;
  isVerified?: boolean;
  reputation_score?: number;
  incentive?: number;
  penalty?: number;
  [k: string]: unknown;
}

/** GET /users/me — the currently authenticated user. */
export async function getMe(
  apiCtx: APIRequestContext,
  token: string,
): Promise<UserRecord> {
  const res = await api.get(apiCtx, "/users/me", token);
  assertOk("GET /users/me", res);
  const body = res.body as { data?: UserRecord } | UserRecord;
  return ((body as { data?: UserRecord }).data ?? body) as UserRecord;
}

export interface NotificationRecord {
  _id: string;
  type?: string;
  message?: string;
  is_read?: boolean;
  createdAt?: string;
  [k: string]: unknown;
}

/** GET /notifications — current user's notifications. */
export async function getUserNotifications(
  apiCtx: APIRequestContext,
  token: string,
  page = 1,
  limit = 10,
): Promise<{ notifications: NotificationRecord[]; totalCount: number }> {
  const res = await api.get(
    apiCtx,
    `/notifications?page=${page}&limit=${limit}`,
    token,
  );
  assertOk("GET /notifications", res);
  const body = res.body as {
    notifications?: NotificationRecord[];
    totalCount?: number;
    data?: { notifications?: NotificationRecord[]; totalCount?: number };
  };
  return {
    notifications: body.data?.notifications ?? body.notifications ?? [],
    totalCount: body.data?.totalCount ?? body.totalCount ?? 0,
  };
}

/**
 * The public `/users/details/:email` endpoint returns the raw Mongo user doc,
 * where ObjectIds serialize as `{ buffer: { type: "Buffer", data: number[] } }`
 * instead of a hex string. Normalise any such id so callers (e.g.
 * `allocateExperts`) always pass a 24-hex string.
 */
function toIdHex(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const rec = value as {
      buffer?: { data?: number[] };
      $oid?: string;
      _id?: unknown;
    };
    if (typeof rec.$oid === "string") return rec.$oid;
    if (Array.isArray(rec.buffer?.data)) {
      return rec.buffer.data
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    if (rec._id) return toIdHex(rec._id);
  }
  return String(value);
}

function normalizeUserDoc(doc: unknown): UserRecord {
  const user = (doc ?? {}) as UserRecord & { _id?: unknown };
  return { ...user, _id: toIdHex(user._id) };
}

/** GET /users/details/:email — public user lookup by email (no auth). */
export async function getUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const res = await fetch(
    `${env.apiBaseURL}/users/details/${encodeURIComponent(email)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /users/details/:email failed (${res.status})`);
  return normalizeUserDoc(await res.json());
}

/** GET /users/admin/all — admin-only list, filtered by role/search. */
export async function getAdminUsers(
  apiCtx: APIRequestContext,
  token: string,
  opts: { role?: string; search?: string; limit?: number } = {},
): Promise<{ users: UserRecord[] }> {
  const params = new URLSearchParams();
  if (opts.role) params.set("role", opts.role);
  if (opts.search) params.set("search", opts.search);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await api.get(apiCtx, `/users/admin/all${qs ? `?${qs}` : ""}`, token);
  assertOk("GET /users/admin/all", res);
  return res.body as { users: UserRecord[] };
}

/** GET /questions/:questionId/full — full question with answers + reviewers. */
export async function getQuestionFull(
  apiCtx: APIRequestContext,
  token: string,
  questionId: string,
): Promise<FullQuestionData> {
  const res = await api.get(
    apiCtx,
    `/questions/${questionId}/full`,
    token,
  );
  assertOk(`GET /questions/${questionId}/full`, res);
  const body = res.body as { data: FullQuestionData };
  return body.data;
}

/**
 * GET /questions/queue-details — section counts (stuck/waiting/needsReviewer/...).
 * Each section value is `{ count, items }` (QueueSectionResult), not a bare number.
 */
export interface QueueSectionData {
  count: number;
  items: unknown[];
}

export async function getQueueDetails(
  apiCtx: APIRequestContext,
  token: string,
): Promise<Record<string, QueueSectionData>> {
  const res = await api.get(apiCtx, "/questions/queue-details", token);
  assertOk("GET /questions/queue-details", res);
  const body = res.body as { data?: Record<string, QueueSectionData> };
  return (body.data ?? body) as Record<string, QueueSectionData>;
}

/**
 * GET /questions/:questionId — QuestionResponse: derives `finalAnswer` /
 * `isFinalAnswer` from the answers collection for closed questions
 * (QuestionService.getQuestionById).
 */
export interface QuestionRecord {
  id?: string;
  status?: string;
  finalAnswer?: string;
  isFinalAnswer?: boolean;
  [k: string]: unknown;
}

export async function getQuestionById(
  apiCtx: APIRequestContext,
  token: string,
  questionId: string,
): Promise<QuestionRecord> {
  const res = await api.get(apiCtx, `/questions/${questionId}`, token);
  assertOk(`GET /questions/${questionId}`, res);
  return res.body as QuestionRecord;
}

/**
 * POST /questions — seed a single question as the given user.
 * `userId` is taken from the caller so the seeded question is attributed to them.
 *
 * The backend requires a full `details` block (crop/state/district/season/domain)
 * or it rejects the request with `BadRequestError: All fields are required`
 * (QuestionService.addQuestion). Defaults mirror the local/CI seed data so the
 * question is also approveable (crop + LGD collections are seeded to match).
 */
export interface CreateQuestionOpts {
  question: string;
  context: string;
  source?: "AJRASAKHA" | "WHATSAPP" | "AGRI_EXPERT" | "OUTREACH";
  details?: {
    crop: string;
    state: string;
    district: string;
    season: string;
    domain: string[];
  };
}

export async function createQuestion(
  apiCtx: APIRequestContext,
  token: string,
  opts: CreateQuestionOpts,
): Promise<{ _id: string; [k: string]: unknown }> {
  const me = await getMe(apiCtx, token);
  const res = await api.post(apiCtx, "/questions", token, {
    userId: me._id,
    question: opts.question,
    context: opts.context,
    ...(opts.source && { source: opts.source }),
    details: opts.details ?? {
      crop: "Paddy",
      state: "Punjab",
      district: "Ludhiana",
      season: "KHARIF",
      domain: ["Agronomy"],
    },
  });
  assertOk("POST /questions", res);
  const body = res.body as {
    data?: { _id: string };
    question_id?: string;
  };
  const data = body.data ?? (body as unknown as { _id: string });
  const questionId = data?._id ?? (body as { question_id?: string }).question_id;
  if (!questionId) {
    throw new Error(`POST /questions returned no question id: ${JSON.stringify(res.body)}`);
  }
  return { _id: questionId };
}

/** POST /questions/:questionId/allocate-experts — assign experts (moderator/admin). */
export async function allocateExperts(
  apiCtx: APIRequestContext,
  token: string,
  questionId: string,
  experts: string[],
): Promise<Json> {
  const res = await api.post(
    apiCtx,
    `/questions/${questionId}/allocate-experts`,
    token,
    { experts },
  );
  assertOk(`POST /questions/${questionId}/allocate-experts`, res);
  return res.body;
}

/**
 * POST /answers/review — expert first response (status undefined).
 * Mirrors the QA interface payload (QA-interface.tsx handleSubmitResponse).
 */
export async function submitExpertAnswer(
  apiCtx: APIRequestContext,
  token: string,
  opts: {
    questionId: string;
    answer: string;
    sources: Array<{ source: string; page?: string | number }>;
    remarks?: string;
    type?: string;
  },
): Promise<Json> {
  const res = await api.post(apiCtx, "/answers/review", token, {
    questionId: opts.questionId,
    answer: opts.answer,
    sources: opts.sources,
    ...(opts.remarks !== undefined && { remarks: opts.remarks }),
    ...(opts.type !== undefined && { type: opts.type }),
  });
  assertOk("POST /answers/review", res);
  return res.body;
}

/** POST /answers/moderator/approve — moderator approves an LLM answer. */
export async function approveAnswerModerator(
  apiCtx: APIRequestContext,
  token: string,
  opts: {
    questionId: string;
    answer: string;
    sources: Array<{ source: string; page?: string | number }>;
    source: string;
  },
): Promise<Json> {
  const res = await api.post(apiCtx, "/answers/moderator/approve", token, {
    questionId: opts.questionId,
    answer: opts.answer,
    sources: opts.sources,
    source: opts.source,
  });
  assertOk("POST /answers/moderator/approve", res);
  return res.body;
}

/**
 * PUT /answers — moderator pushes a duplicate question to the GDB.
 * This is the exact endpoint the UI's "Push to GDB" button hits
 * (MessageDetail.doApprove -> useUpdateAnswer -> AnswerService.updateAnswer with
 * isModeratorApproval=false). A duplicate/auditor_review question is closed as
 * `duplicate_closed` with a stamped final answer (AnswerService.approveAnswer).
 */
export async function pushAnswerToGDB(
  apiCtx: APIRequestContext,
  token: string,
  opts: {
    questionId: string;
    answer: string;
    sources: Array<{ source: string; page?: string | number }>;
    source: string;
  },
): Promise<Json> {
  const res = await api.put(apiCtx, "/answers", token, {
    questionId: opts.questionId,
    answer: opts.answer,
    sources: opts.sources,
    source: opts.source,
  });
  assertOk("PUT /answers (push to GDB)", res);
  return res.body;
}

/**
 * PUT /answers — moderator approves an expert's submitted answer on an
 * `in-review` question (AnswerService.approveAnswer NORMAL APPROVAL FLOW).
 * Closes the question as `closed` with the answer stamped as final.
 */
export async function approveExpertAnswer(
  apiCtx: APIRequestContext,
  token: string,
  opts: {
    questionId: string;
    answerId: string;
    answer: string;
    sources: Array<{ source: string; page?: string | number }>;
    source: string;
  },
): Promise<Json> {
  const res = await api.put(apiCtx, "/answers", token, {
    questionId: opts.questionId,
    answerId: opts.answerId,
    answer: opts.answer,
    sources: opts.sources,
    source: opts.source,
  });
  assertOk("PUT /answers (final approval)", res);
  return res.body;
}

/** GET /answers/submissions — expert submissions (paged). */
export async function getSubmissions(
  apiCtx: APIRequestContext,
  token: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ submissions?: unknown[]; [k: string]: unknown }> {
  const params = new URLSearchParams();
  params.set("page", String(opts.page ?? 1));
  params.set("limit", String(opts.limit ?? 10));
  const res = await api.get(
    apiCtx,
    `/answers/submissions?${params.toString()}`,
    token,
  );
  assertOk("GET /answers/submissions", res);
  return res.body as { submissions?: unknown[]; [k: string]: unknown };
}

/**
 * POST /questions/detailed — paged question list with filters.
 * Query: GetDetailedQuestionsQuery (search/sort/status/source/state/priority/crop/page/limit/...).
 * Response: { questions, totalPages }.
 */
export async function getDetailedQuestions(
  apiCtx: APIRequestContext,
  token: string,
  query: Record<string, string | number | undefined> = {},
): Promise<{ questions: FullQuestionData[]; totalPages: number }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const res = await api.post(
    apiCtx,
    `/questions/detailed${params.toString() ? `?${params.toString()}` : ""}`,
    token,
    {},
  );
  assertOk("POST /questions/detailed", res);
  return res.body as { questions: FullQuestionData[]; totalPages: number };
}

/** DELETE /questions/bulk — clean up questions created by the suite. */
export async function deleteQuestions(
  apiCtx: APIRequestContext,
  token: string,
  questionIds: string[],
): Promise<Json> {
  if (questionIds.length === 0) return null;
  const res = await api.delete(apiCtx, "/questions/bulk", token, {
    questionIds,
  });
  assertOk("DELETE /questions/bulk", res);
  return res.body;
}

/** PUT /questions/:id — partial update (used by tests to transition status). */
export async function updateQuestion(
  apiCtx: APIRequestContext,
  token: string,
  questionId: string,
  updates: Record<string, unknown>,
): Promise<Json> {
  const res = await api.put(apiCtx, `/questions/${questionId}`, token, updates);
  assertOk(`PUT /questions/${questionId}`, res);
  return res.body;
}
