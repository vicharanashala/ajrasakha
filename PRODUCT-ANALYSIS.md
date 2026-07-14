# Ajrasakha Product Analysis

## 1. Understanding the Application

Ajrasakha is a farmer-friendly multilingual agricultural Q&A platform. The architecture follows a three-tier answer approach:

1. **Golden Dataset** (expert-verified QA pairs)
2. **Package of Practices** (guidelines)
3. **AI Fallback** (DeepSeek-R1, Qwen3 via Ollama)

**Users**: Farmers (via WhatsApp/voice), Experts (answer questions), Moderators (review answers), Admins (manage system), Call Agents (handle voice calls), Coordinators (district/block/village level oversight).

**Tech Stack**: React 19 + Vite frontend, Node.js/Express backend, Python LangGraph AI agents, MongoDB, Firebase Auth, Plivo voice, Web Push notifications.

---

## 2. Missing Features (Not Already Present)

### 2.1 Farmer-Facing Features

| # | Feature | Problem | Existing? |
|---|---------|---------|-----------|
| F1 | **Question Status Tracker** | Farmers ask via WhatsApp and wait blindly. No way to check "is my question being answered?" | ❌ No farmer portal exists |
| F2 | **Answer Rating / Feedback** | No way for farmers to rate answer quality or mark "this solved my problem" | ❌ No feedback loop |
| F3 | **Knowledge Base Browser** | Farmers can't browse previously answered questions by crop/disease/region | ❌ No public search |
| F4 | **Structured Question Intake** | Farmers submit unstructured text; experts must infer crop, state, season | ❌ No guided form |
| F5 | **Answer History Export (PDF)** | No way for farmer to save/download their Q&A history | ❌ No export feature |
| F6 | **Language Preference Memory** | Language selection is session-only, not persisted per farmer | ❌ Not persisted |

### 2.2 Expert / Moderator Features

| # | Feature | Problem | Existing? |
|---|---------|---------|-----------|
| F7 | **Batch Question Operations** | Moderators must act on questions one-at-a-time; no multi-select | ❌ Single-action only |
| F8 | **Expert Availability Scheduling** | Experts can check-in/out but can't set recurring schedules | ❌ Check-in only |
| F9 | **Question Templates** | Experts waste time typing repeated field labels (crop, state, etc.) | ❌ Free-form text only |
| F10 | **Inbox Priority Sorting** | No smart sorting of questions by urgency, age, or expertise match | ❌ Basic pagination |
| F11 | **Saved Filters & Views** | Moderators re-apply same filters every session | ❌ Filters reset each visit |

### 2.3 Admin / System Features

| # | Feature | Problem | Existing? |
|---|---------|---------|-----------|
| F12 | **Bulk User Invite** | Admin must create users one-by-one; no CSV/email invite | ❌ Single-user only |
| F13 | **Report Scheduling** | Reports are manual download only; no auto-email delivery | ❌ Manual only |
| F14 | **Audit Dashboard** | Audit page at `/audit` shows raw table but no aggregate stats, charts, or trend visualization | ❌ Basic table only |
| F15 | **System Health Monitor** | No in-app view of service status, queue depths, error rates | ❌ Not present |
| F16 | **Two-Factor Authentication** | Firebase supports 2FA but not configured/enforced | ❌ Not set up |

### 2.4 Cross-Cutting Features

| # | Feature | Problem | Existing? |
|---|---------|---------|-----------|
| F17 | **Session Timeout & Warning** | Users can be left logged in indefinitely | ❌ No idle timeout |
| F18 | **Onboarding Flow** | New users get no tour or guidance on first login | ❌ Blank first experience |
| F19 | **Keyboard Shortcuts** | Power users (experts/moderators) navigate slowly | ❌ No shortcuts |
| F20 | **Undo for Destructive Actions** | No way to undo block, delete, or role change | ❌ No undo |

---

## 3. Missing Validations

| # | Validation | Location | Severity |
|---|------------|----------|----------|
| V1 | **Email format on backend** | Backend signup/login doesn't validate email format server-side | Medium |
| V2 | **Phone number format** | Farmer/agent phone numbers not validated for Indian format (+91) | Medium |
| V3 | **Password min-length** | No server-side minimum password length enforcement | Medium |
| V4 | **File upload size/type** | No validation on uploaded file size or MIME type | High |
| V5 | **Input length limits** | Name, comment, question fields lack max-length enforcement | Low |
| V6 | **XSS sanitization** | User-supplied names/comments not sanitized for XSS in API responses | High |
| V7 | **Rate limiting on auth** | Backend has `rateLimiter` but not explicitly wired to auth routes | High |
| V8 | **CSRF protection** | No anti-CSRF tokens (partially mitigated by Firebase Bearer tokens) | Medium |

---

## 4. UX Improvements

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| UX1 | **Missing loading skeletons** | Dashboard, user table, question list show nothing while loading | Add skeleton components matching layout shape |
| UX2 | **Missing empty states** | Lists show blank when no data (no questions, no notifications) | Add illustrative empty state with CTA |
| UX3 | **Error boundaries** | Unhandled React errors show white screen | Wrap route components in error boundaries |
| UX4 | **Success/error toasts** | Some operations lack toast feedback (role change, verification) | Add toast on every mutation success/failure |
| UX5 | **Confirmation dialogs** | Some destructive actions lack confirmation (delete notification) | Add confirm dialog for all destructive actions |
| UX6 | **Breadcrumb navigation** | Deep pages (question detail, user detail) lack breadcrumbs | Add breadcrumb trail to nested routes |
| UX7 | **Undo toast pattern** | No "undo" snackbar for accidental actions | Implement undo-with-timer pattern (Gmail-style) |
| UX8 | **Search hint text** | Search inputs lack placeholder examples | Add "Search by name, email, or phone..." placeholders |
| UX9 | **Click feedback** | Buttons lack pressed-state animation | Add `active:scale-95` or ripple effect |
| UX10 | **Drag-and-drop question reordering** | Question lists in queues can't be reordered manually | Add drag handle for priority sorting |

---

## 5. Accessibility Improvements (WCAG)

| # | Issue | WCAG Criterion | Recommendation |
|---|-------|----------------|----------------|
| A1 | **Missing ARIA labels** | 4.1.2 Name, Role, Value | Add `aria-label` to icon-only buttons, tab lists, and toolbars |
| A2 | **Focus indicators** | 2.4.7 Focus Visible | Add custom `:focus-visible` styles (current Tailwind outline may be insufficient) |
| A3 | **Color contrast** | 1.4.3 Contrast (Minimum) | Check dark mode text/background contrast ratios; green status badges on white may fail |
| A4 | **Missing form labels** | 1.3.1 Info and Relationships | Some inputs use `placeholder` instead of `<label>` |
| A5 | **Keyboard navigation** | 2.1.1 Keyboard | Dialogs and dropdowns may trap or skip focus; test Tab order in complex modals |
| A6 | **Screen reader announcements** | 4.1.3 Status Messages | Dynamic content (toasts, loading states) not announced to screen readers |
| A7 | **Skip-to-content link** | 2.4.1 Bypass Blocks | No skip navigation link at page start |
| A8 | **Alt text on decorative icons** | 1.1.1 Non-text Content | Many SVG icons in buttons lack `aria-hidden="true"` |
| A9 | **Touch target size** | 2.5.8 Target Size (Minimum) | Small icon buttons (< 44px) may fail on mobile |
| A10 | **Heading hierarchy** | 1.3.1 Info and Relationships | Some pages have multiple `<h1>` or skip heading levels |

---

## 6. Mobile Responsiveness Improvements

| # | Issue | Screens | Recommendation |
|---|-------|---------|----------------|
| M1 | **Question table** | All (worse on mobile) | Replace table with card layout on `< md` breakpoints (partial `MobileQuestionCard.tsx` exists but not universal) |
| M2 | **User management table** | Admin | Same as M1 — use responsive card view |
| M3 | **Dashboard cards** | Dashboard | Ensure 2-column grid collapses to single column on mobile |
| M4 | **Filter dialogs** | Question page, Users page | Full-screen modals on mobile instead of side panels |
| M5 | **Notification panel** | Notification modal | Full-width sheet on mobile |
| M6 | **Call interface** | Call agent | Two-panel layout collapses to single vertical scroll |
| M7 | **Tab overflow** | Playground tabs | Tabs overflow on small screens; add horizontal scroll or hamburger menu |
| M8 | **Header navigation** | All pages | Header items overflow; consolidate into hamburger menu |

---

## 7. Performance Optimizations

| # | Issue | Impact | Recommendation |
|---|-------|--------|----------------|
| P1 | **Route-level code splitting** | Bundle size | Verify TanStack Router auto-splitting covers all routes; lazy-load heavy components (Recharts, Leaflet) |
| P2 | **Image optimization** | Page load | Add `loading="lazy"` to images; use responsive image sets |
| P3 | **List virtualization** | Scroll performance | Virtualize question table (1000s of rows) with `react-window` or `@tanstack/virtual` |
| P4 | **React.memo on large components** | Render performance | Add `React.memo` to card lists, table rows, chart components |
| P5 | **Request deduplication** | Network | Deduplicate parallel API calls using React Query's `staleTime` and `gcTime` |
| P6 | **Debounced search inputs** | Network | Already partially done (`useDebounce` exists); extend to all search fields |
| P7 | **WebSocket reconnection** | Call reliability | Ensure Sarvam AI WebSocket reconnects with exponential backoff |
| P8 | **Bundle analysis** | Build size | Run `vite-bundle-visualizer`; identify large dependencies for dynamic import |

---

## 8. Security Improvements

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| S1 | **Internal API key** | High | Single shared key for all internal services; rotate and use per-service keys |
| S2 | **Sentry DSN exposed** | Medium | DSN is in client bundle; use environment filtering |
| S3 | **No Helmet.js** | Medium | Add `helmet` middleware for security headers (CSP, X-Frame-Options, etc.) |
| S4 | **User ID enumeration** | Medium | `GET /users/details/:email` doesn't require auth; can enumerate registered emails |
| S5 | **No IP rate limiting** | Medium | Backend rate limiter exists but not applied to auth/login endpoints |
| S6 | **Audit trail gaps** | Medium | Some admin actions (call agent management) may not be audited |
| S7 | **Firebase rules** | High | Verify Firebase Security Rules don't allow unauthorized read/write |
| S8 | **Password reset rate limit** | Medium | No explicit rate limiting on password reset requests |

---

## 9. Missing Analytics

| # | Metric | Why It Matters |
|---|--------|----------------|
| AN1 | **Question resolution time** | Track P50/P95/P99 time from ask to final answer |
| AN2 | **Expert throughput trends** | Identify top/bottom performers over time |
| AN3 | **Answer quality score** | Beyond binary approve/reject, track a quality score per answer |
| AN4 | **Farmer satisfaction** | Post-answer survey or rating aggregation |
| AN5 | **Channel analytics** | WhatsApp vs Voice vs Web question volume trends |
| AN6 | **Crop-season heatmap** | Which crop-season combinations generate most questions |
| AN7 | **Re-routing rate** | Percentage of questions needing re-routing (indicator of allocation quality) |
| AN8 | **Moderator backlog** | Queue depth and age distribution per moderator |
| AN9 | **Feature usage** | Which dashboard tabs and reports are most used |
| AN10 | **Error rate dashboard** | In-app view of Sentry errors without leaving the app |

---

## 10. Missing Notifications

| # | Notification | Trigger | Current State |
|---|--------------|---------|---------------|
| N1 | **"Your question was answered" SMS** | Answer approved | ❌ Not sent to farmer |
| N2 | **Weekly expert digest email** | Every Sunday | ❌ Not implemented |
| N3 | **Question aging alert** | Question unassigned > 24h | ❌ Not implemented |
| N4 | **Reallocation notification to new expert** | Question re-routed | ✅ Already exists |
| N5 | **System health alert** | Backend error rate > threshold | ❌ Not implemented |
| N6 | **Pending review reminder** | Answer pending review > 48h | ❌ Not implemented |
| N7 | **Inactivity warning** | Expert hasn't checked in for 7 days | ❌ Not implemented |
| N8 | **New feature announcement** | Feature deployed | ❌ Not implemented |

---

## 11. Top 20 Improvement Ranking

Ranked by **Impact × Reach ÷ Effort** (higher = better value).

| Rank | Feature | Category | Impact | Effort | Reach |
|------|---------|----------|--------|--------|-------|
| 1 | **Answer Rating / Feedback System** (F2) | Farmer | High | Medium | All farmers |
| 2 | **Question Status Tracker** (F1) | Farmer | High | Medium | WhatsApp farmers |
| 3 | **Empty & Loading States** (UX1, UX2) | UX | High | Easy | All users |
| 4 | **Batch Question Operations** (F7) | Moderator | High | Medium | Moderators |
| 5 | **Error Boundaries** (UX3) | UX | High | Easy | All users |
| 6 | **Mobile-Responsive Tables** (M1, M2) | Mobile | High | Easy | Mobile users |
| 7 | **Knowledge Base Browser** (F3) | Farmer | High | Medium | All farmers |
| 8 | **Keyboard Navigation & ARIA** (A1, A2, A5) | A11y | Medium | Medium | Screen reader users |
| 9 | **Saved Filters & Views** (F11) | Moderator | Medium | Easy | Moderators/experts |
| 10 | **Confirmation on Destructive Actions** (UX5) | UX | High | Easy | All users |
| 11 | **Session Timeout & Auto-Logout** (F17) | Security | Medium | Easy | All users |
| 12 | **Breadcrumb Navigation** (UX6) | UX | Medium | Easy | All users |
| 13 | **Structured Question Intake** (F4) | Farmer | High | Medium | WhatsApp farmers |
| 14 | **Audit Dashboard** (F14) | Admin | Medium | Medium | Admins |
| 15 | **Rate Limiting on Auth** (V7) | Security | High | Easy | All users |
| 16 | **Weekly Expert Digest** (N2) | Notifications | Medium | Medium | Experts |
| 17 | **Performance Trend Charts** (AN2) | Analytics | Medium | Medium | Moderators/admins |
| 18 | **User Onboarding Flow** (F18) | UX | Medium | Medium | New users |
| 19 | **SMS Notifications to Farmers** (N1) | Notifications | High | Hard | Farmers |
| 20 | **Report Scheduling** (F13) | Admin | Medium | Medium | Admins |

---

## 12. Top 5 for Open-Source Contribution

These are selected for: clear scope, visible impact, good demonstration of full-stack skills, manageable for a single contributor.

### #1 Answer Rating / Feedback System
**Why**: Farmers have zero way to provide feedback. This closes the quality loop. Adds a simple star/emoji rating + optional comment on answers. Backend needs a new `feedback` collection + API endpoint. Frontend needs a rating widget on the answer card. Integrates with notification system to alert experts of low ratings. Moderate scope, clear boundaries, high visible impact.

### #2 Knowledge Base Browser
**Why**: A public-facing searchable FAQ / golden dataset browser serves farmers directly. Leverages existing Golden Dataset MongoDB collection and AI search tools (MCP golden_dataset server). Frontend: search box + paginated results + filter by crop/state/language. No auth required. Great demo of full-stack skill: API endpoint, search index, responsive UI, i18n.

### #3 Mobile-Responsive Table Views
**Why**: Many tables (questions, users, queue) are unusable on mobile. Replace one table at a time with a card-based responsive layout. Stack existing `MobileQuestionCard.tsx` pattern. No backend changes needed. Quick wins across the app — perfect first PR for a newcomer.

### #4 Empty & Loading States
**Why**: Currently many lists show nothing during loading or when empty. Adding skeleton loaders and illustrated empty states with CTAs is low-risk, high-visibility. Each state is a small self-contained component. Easy to review, easy to test, high impact for user trust.

### #5 Keyboard Shortcuts & Navigation
**Why**: Power users (experts reviewing 100+ questions/day) would benefit enormously from keyboard shortcuts (j/k to navigate questions, Enter to open, `n` for new question, `1-5` for status changes). Integrates with existing hotkey libraries or a simple `useEffect`. Pure frontend, no backend. Shows attention to power-user UX.

---

## 13. Summary of Current Gaps by User Role

| User Role | Current Pain Points | Missing Capabilities |
|-----------|-------------------|---------------------|
| **Farmer** | Blind question status, no feedback channel, no self-service lookup | Status tracker, rating, knowledge base, structured forms, export |
| **Expert** | Manual repeated typing, no scheduling, no performance visibility | Templates, availability calendar, personal analytics |
| **Moderator** | Slow single-action workflow, reapplied filters, no batch ops | Batch actions, saved filters, queue analytics |
| **Admin** | No audit viewer, manual report downloads, no health monitoring | Audit dashboard, scheduled reports, health monitor |
| **Call Agent** | Mobile-unfriendly interface, no knowledge base during calls | Mobile optimization, inline KB search |

**Cross-cutting gaps**: Accessibility (screen readers, keyboard nav), mobile responsiveness, empty/loading states, error boundaries, session security.
