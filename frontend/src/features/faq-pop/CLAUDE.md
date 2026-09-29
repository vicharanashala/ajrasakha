# CLAUDE.md — FAQ/POP dashboard

Guidance for working in this directory (`frontend/src/features/faq-pop/`), the
"Data Processing Dashboard" reachable from the app's admin/moderator/expert nav.
This file is scoped to this feature, not the whole `ajrasakha` repo.

## Shape of the feature

`DataProcessingDashboard.tsx` renders three role-gated tabs (`DataProcessingDashboard.tsx:10-14`):

| Tab | Component | Roles |
|---|---|---|
| FAQ-Cluster | `components/FunctionsPanel/FunctionsPanel.tsx` | admin only |
| POP-Translation | `components/FunctionsPanel/PopTranslationPanel.tsx` | admin, moderator, expert |
| POP-Management (renamed from "Document Management" 2026-09-18) | `components/DocumentManagement/DocumentManagementPanel.tsx` | admin, moderator, expert |

**Almost all active work in this feature is in `components/DocumentManagement/`.**
FunctionsPanel/PopTranslationPanel are the older FAQ pipeline UI — touch them only
if explicitly asked.

## Backend contract — read this before trusting any field/endpoint name

The dashboard backend is a **separate repo/service**, proxied through this app's
Node backend at `/api/pop` (env: `POP_API_URL`). Its contract lives in
**`docs/first_render_frontend.md`** (repo root) — branch `first_render`, its own
Mongo DB (`pop_render`). That file is the ground truth for routes, filters,
payload shapes, and the placement/document distinction. **Read it fresh before
implementing anything backend-facing; do not rely on memory of past sessions or
on this file, which will go stale.**

There is an older `docs/dashboard_frontend_plan.md` from a *previous* backend
(Postgres, integer state/crop ids, `document_associations` table). It is
superseded and no longer accurate — if you find yourself checking it, stop and
use `first_render_frontend.md` instead. (As of 2026-09-29 it appears to have
been removed from `docs/` entirely; if it reappears, still ignore it.)

Key backend facts worth keeping in your head (see the doc for full detail):
- **Placement vs document.** A placement (`POP_00342`) is one row = one document
  filed under one state, filed under one **crop** (a plain string now — no more
  crop/organization "folder" split in the backend's own model; see below for how
  the frontend still frames this in the Add form). A document (`ANNAM_00321`) is
  the file + metadata; it can have many placements. Editing a placement field
  (state/crop) touches one row; editing anything else touches the document, and
  therefore every placement that uses it.
- Two list endpoints: `GET /documents` (one row per placement, backs Main
  Table) and `GET /unique-documents` (one row per document, backs the Documents
  tab) — both paginated server-side, 100/page, `{items, total, page, page_size}`.
  Do not try to de-duplicate the main table client-side to build the documents
  view; pagination makes that arithmetic wrong.
- Filters are `filter[<name>]=<value>`, whitelisted per endpoint, AND-ed,
  substring/case-insensitive unless noted exact. The two endpoints' whitelists
  are **not identical** — e.g. `state`/`crop` are placement-level filters valid
  on `/documents` but the doc does not list them as valid on `/unique-documents`
  (many-to-many via placements, not a scalar column on the document). An
  unrecognized `filter[key]` is silently ignored server-side (no error) — so a
  filter control that looks wired up can quietly do nothing. Verify a filter
  key against the doc's table before adding a UI control for it.
- Uploads are a two-phase, human-in-the-loop flow: `POST /uploads` →
  `queued → hashing → checking_duplicate → awaiting_review`, then one of
  `POST /uploads/{id}/add|new|cancel`. Nothing reaches storage until the person
  decides. At `awaiting_review`, per-candidate `can_add`/`can_create_new` flags
  drive which action buttons are legal — `can_create_new: false` means an exact
  `sha256` match (a second document literally cannot be stored), not a soft
  preference.
- Translation jobs are **per document, not per placement** — translating from
  any one of a document's rows marks all its placements `translation_status:
  "done"`. `GET /config` returns `{translation_available: bool}`; hide/disable
  translate actions when false rather than letting them 404.
- Live updates: `GET /dashboard/events` is a shared SSE stream
  (`dashboardEvents.ts`) — one `EventSource` for the whole app, ref-counted,
  event kinds `upload`/`translation`/`document`/`open`. No replay on reconnect;
  refetch your own state in the `open` handler (fires on first connect and every
  reconnect). Treat any interval-based polling alongside it as a fallback only,
  not the primary refresh path.

## Architecture conventions (do not deviate without being asked)

- Flat `api.ts` (one file, plain `fetch`, no react-query/SWR/state library).
  Every dashboard call goes through `_handleResponse()`; 204 responses return
  `null` (every DELETE here is 204).
- Components use `// @ts-nocheck` and plain hand-rolled Tailwind, matching the
  rest of this feature — not the app's newer typed/shadcn conventions.
- Toasts via `sonner`, icons via `lucide-react`.
- Reuse existing shared filter/selector components rather than building new
  ones: `TextFilter.tsx`, `RangeFilter.tsx`, `DateRangeColumnFilter.tsx`,
  `components/FunctionsPanel/ColumnFilter.tsx` (multi-select dropdown with a
  built-in search box — reach for this before writing a new "dropdown +
  search" filter), `StateSelector`/`MultiSelector` from
  `components/FunctionsPanel/RunTile.tsx`.
- `fields.ts` is the single source of truth for document metadata field
  definitions (`DOCUMENT_METADATA_FIELDS`, `EDITABLE_DOCUMENT_ONLY_FIELDS`,
  `DISPLAY_ONLY_FIELDS`) and the hardcoded dropdown vocabularies (advisory
  type/scope, season, domain, format, verification/document status). Both
  `AddDocumentForm.tsx` and `UniqueDocumentEditForm.tsx` consume these arrays
  generically — add/remove a metadata field here once, not in each form.
- `dashboardEvents.ts` is the only place that should own the `EventSource` —
  subscribe via `subscribeDashboardEvents()`, never instantiate a second one.

## `DocumentManagementPanel.tsx` structure

Three sub-modes (`MODES` const): **Add Document**, **Main Table**, **Documents**
(unique documents). All three stay mounted permanently (visibility toggled via
a `hidden` class, not conditional unmount) so the Upload Queue / Translation
Queue polling and SSE subscription survive switching sub-modes. The Document
Detail modal is a single shared instance, opened by document id from any
sub-mode or queue row (`openDetail`/`detailDocId`) — not a per-tab focus/pin
mechanism.

## Backend contract additions since this file was written (2026-09-29 batch)

Verify these are still current before relying on them — they came from direct discussion with the
backend session, not from `docs/first_render_frontend.md` (which may not be updated yet):

- **District/KVK** — placement-level, id-referenced vocabularies exactly like state/crop (`district`/`kvk` names, `district_id`/`kvk_id` ids, same `GET/POST/PATCH/merge/DELETE /dashboard/districts|kvks` shape as `/dashboard/states`, `?state=`/`?state_id=` narrowing). Every value is `null`/blank today — no WorkDrive folder level to backfill from.
- **Sort is now widened past `translated_at`/`reviewed_at`** to "any column you can filter, you can sort" (`sort=<field>` / `sort=-<field>`, one at a time; unmatched values sort last in both directions). **One asymmetry to remember:** on `/documents`, State/Folder/District/KVK are *filtered* by id (`state_id`/`crop_id`/`organization_id`/`district_id`/`kvk_id`) but *sorted* by plain name (`sort=state`/`sort=crop`/`sort=district`/`sort=kvk`) — the id forms 400 on `sort=`. Every other column sorts by the same name it filters by. See `SORT_KEYS`/`sortKeyFor` in `MainTable.tsx` and `sortKeyFor`/`DERIVED_COLUMNS` in `UniqueDocumentsTable.tsx`.
- **`shareable_name` (document name) is PATCH-able** on `/unique-documents/{id}` — cosmetic only, does not rename the file in WorkDrive, but does change what named translation/review downloads save as.
- **Named download endpoints now cover all three files**, not just translation/review: `GET /dashboard/unique-documents/{id}/original|translation|review/download`, each with a real `Content-Disposition` named after `shareable_name` and `?inline=1` support. Prefer these over the generic `GET /dashboard/files/{fileId}/download` proxy (still fine as a fallback, but names the file after WorkDrive, not the document).
- **`filter[state]`/`filter[crop]`/`filter[district]`/`filter[kvk]` (and their `_id` forms) now work on `/unique-documents` too**, not just `/documents`. One semantic to hold onto: filtering the Documents tab this way matches a document if **any** of its placements match — not just the anchor placement the row displays. A document with placements in two states can display one state (its anchor) while still matching a filter for the other. This is intentional (keeps the two tabs describing the same underlying set) — don't "fix" it by silently switching to anchor-only matching without flagging it first.
- The Documents tab's State/Folder/District/KVK columns are still **derived client-side** from `duplicate_links[representative_row_id]`, not real fields on the unique-document row — `duplicate_links` entries carry all four (`state`/`crop`/`district`/`kvk`) resolved server-side already, no extra request needed.

## Known non-obvious gotchas (learned the hard way this project)

- The Add Document form's "Folder" concept (crop vs. organisation, with
  `crop_ids`/`organization_ids` in `placements_json`) is a **frontend-side
  convenience layer** on top of `GET /dashboard/folders` (falls back to
  fetching crops/organizations separately and merging client-side if that
  route 404s) — don't assume the backend doc's plain `crops: [...]` shape is
  what's sent on the wire; check `api.ts`'s `uploadDashboardDocument` first.
- `document_code` was **removed** as a field/column (round-4 change) — do not
  reintroduce it into `fields.ts` or either table's columns.
- `duplicate_found` status was renamed to `awaiting_review`; nothing about a
  pending upload auto-resolves — every `awaiting_review`/gated row needs an
  explicit person action.
- `verified_by` was renamed `uploaded_by` (2026-09-18) and is auto-captured
  from the signed-in user, never a free-text/dropdown field in the form.
- When translation is unavailable, the UI should say it's "currently out of
  order" — this covers both "no LLM key configured" and the `TRANS=on/off` env
  flag cases; the API contract (`GET /config`) does not distinguish them, so
  don't invent a more specific message than the boolean supports.
- Before adding a new `filter[...]` control to either table, confirm the key is
  actually in that endpoint's whitelist in `docs/first_render_frontend.md` —
  the backend won't error on an unsupported key, it'll just ignore it, so a
  "broken" filter often isn't a frontend bug.

## Verifying changes

No dedicated test suite for this feature. After edits:
```bash
cd frontend
npx tsc --noEmit -p tsconfig.json | grep -i "faq-pop\|DocumentManagement"
npx vite build   # then rm -rf dist — this is a workspace-shared build dir
```
Both should be clean/succeed; the only expected `vite build` warning is the
pre-existing "chunks larger than 500kB" one, unrelated to this feature.
