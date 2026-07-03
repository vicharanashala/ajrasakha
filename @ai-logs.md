# AI Log - Sarvam WebSocket Speech-to-Text Integration

## Changes Logged: 2026-05-21

### 1. `backend/src/modules/plivo/services/PlivoService.ts`
- **Transitioned to WebSockets**: Switched from the REST API to Sarvam AI's real-time streaming WebSocket endpoints (`wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3`).
- **Dual Connection Setup**: Initialized two parallel WebSocket connections per call (one for `mode=transcribe`, one for `mode=translate`) passing the `api-subscription-key` header.
- **Audio Configuration**: Specifed query parameters `sample_rate=16000` and `input_audio_codec=pcm_l16` to accept the 16-bit PCM big-endian 16kHz audio stream sent by Plivo. Added `high_vad_sensitivity=true` to enable voice activity detection for automatically filtering out silence and ambient noise.
- **Audio Queueing**: Queued incoming audio buffers before the WebSocket connections are fully open and flushed them immediately upon opening.
- **Debounced Synchronization**: Added a 300ms debounce timer to group and sync the `transcribe` and `translate` callbacks to send updates as coherent sentences to the frontend.
- **Incremental Deltas**: Implemented logic to compute string deltas from the cumulative transcripts returned by Sarvam's WebSocket turns.
- **Connection Finalization**: Created `finalizeStreams` to send a `flush` message (`{"type": "flush"}`), wait briefly for final packets, close both WebSockets safely, and return the final transcript and translation.
- **Restored PCM to WAV Helper**: Restored the `convertLinearPcmToWav` helper method to support local debugging, WAV exports, and fallback integrations.

### 2. `backend/src/bootstrap/websocket.ts`
- **Integrated Live Audio Streaming**:
  - `start` event: Called `plivoService.initializeStreams` to initialize the transcribe and translate WebSocket connections for the call and register the transcript broadcast callback.
  - `media` event: Forwarded audio chunks in real-time to both sockets using `plivoService.transcribeAudio`.
  - `stop` event: Called `plivoService.processRemainingAudio` (which calls `finalizeStreams`), broadcasted final text updates, fetched complete logs, and cleaned up via `plivoService.clearTranscript`.
  - `close` event: Cleaned up active transcriptions and stream sessions.

### 3. Translation Duplication Fix
- **Backend `websocket.ts`**: Updated the `text` field in live `transcript` messages to use a fallback chain of `originalText || translatedText || ''` to prevent the frontend from ignoring messages when `originalText` is empty.
- **Frontend `IncomingCallBox.tsx`**:
  - Replaced checking `message.text` with `message.originalText || message.translatedText`.
  - Removed the frontend fallback (`|| t.text`) when generating final concatenated strings, preventing original non-English text from leaking into the translated box.
  - Handled the `call_end` event by updating the parent component with the backend's fully-accumulated, final transcript and translation.

## Changes Logged: 2026-05-22

### 1. `newletter_design.html`
- **Premium Redesign**: Completely overhauled the HTML newsletter and micro-landing page to align with XIPHIAS's high-end, corporate brand identity (handling high-net-worth individuals, Fortune 500s, and private client advisory).
- **Brand Palette & Typography**: Incorporated XIPHIAS brand colors (Deep Blue, Premium Gold, Dark Zinc) extracted from the provided live site. Implemented 'Sora' for headings and 'Inter' for body text for an elite visual hierarchy.
- **Interactive Elements**: Added CSS micro-animations, glassmorphism card effects, and hover transitions on the Flagship Frameworks section to increase engagement and simulate a senior UI/UX designer's "living HTML" touch.
- **Component Structure**: Enhanced the Hero section, credibility stats grid, program feature pills, and a compelling CTA section while keeping it contained within a responsive structure suitable for both broad email layout constraints and independent micro-landing page contexts.
- **Stats Grid Enhancement**: Upgraded the `.stats` container and `.stat-item` cards from a basic joined bar into separated, premium glassmorphism floating cards with improved border-radii, glowing hover states, and dynamic gradient backgrounds.
- **Email Compatibility Rewrite**: Completely rebuilt the HTML structure using email-safe `<table>` layouts, inline CSS styling, web-safe fallback fonts (`Helvetica`, `Arial`), and VML background image support for Outlook. This ensures the premium aesthetic renders perfectly and reliably across all major email clients (Gmail, Outlook, Apple Mail) without breaking layout.

### 2. Separated Audio Tracks & Chat-bubble UI (Plivo + Sarvam WebSocket)
- **`backend/src/modules/plivo/services/PlivoService.ts`**:
  - Implemented dual-channel stream tracking using compound keys: `${callId}_inbound` and `${callId}_outbound`.
  - Updated `initializeStreams` to initialize separate Sarvam WS connections for both `inbound` and `outbound` tracks.
  - Added track parameters to `transcribeAudio`, `getTranscript`, `getTranslation`, and `getDetectedLanguage`.
  - Modified `finalizeStreams` and `clearTranscript` to properly flush, close, and clean up resources for both tracks.
- **`backend/src/bootstrap/websocket.ts`**:
  - Initialized separate Sarvam WS stream sessions per active track (caller/inbound and agent/outbound) via compound keys: `${callId}_inbound` and `${callId}_outbound`.
  - Routed real-time media packets by track payload and broadcasted transcript messages containing the `track` attribute.
  - Added backend logs displaying transcripts and translations separately: `[BACKEND LOG] Caller: ...` and `[BACKEND LOG] Agent: ...`.
  - Aggregated final transcripts for both tracks and broadcasted a combined payload on `call_end`.
- **`frontend/src/hooks/services/plivoWebSocketService.ts`**:
  - Updated `PlivoTranscriptMessage` interface to include the `track?: 'inbound' | 'outbound'` attribute.
- **`frontend/src/components/IncomingCallBox.tsx`**:
  - Refactored message handlers to track the active source track and notify parent components using the `onTranscriptsListChange` callback.
  - Handled the dual-track structure of the final `call_end` payload.
- **`frontend/src/components/CallInterface.tsx`**:
  - Redesigned the live call transcript layout into a premium, real-time chat bubble dialogue.
  - Grouped and styled speaker tracks visually (left-aligned caller, right-aligned agent) displaying translations as primary text and original languages as subtitle items with language codes.
  - Implemented an expandable "Edit Transcript Drafts" section holding the auto-formatted draft for caller and agent segments to review/edit before final submission.

### 3. TypeScript Type-Only Import Fix
- **`frontend/src/components/CallInterface.tsx`**:
  - Prefixed `CallTranscript` import with `type` modifier to comply with TypeScript's `verbatimModuleSyntax` rules, resolving the build error when importing types alongside runtime values.

### 4. Text File Conversation Logging (Plivo WebSocket)
- **`backend/src/bootstrap/websocket.ts`**:
  - Added real-time append logging for incoming transcripts and translations (from both caller and agent tracks) into a dedicated `.txt` file inside `backend/call_logs/`.
  - Logged session metadata when the call starts.
  - Logged a complete conversation summary (transcripts and translations for both caller and agent) when the call stops.
  - Logged disconnection status when the call is closed.

### 5. Chat Bubble Conversation UI & IncomingCallBox fixes
- **`frontend/src/components/IncomingCallBox.tsx`**:
  - Added missing `onTranscriptsListChange` prop to the component parameter destructuring list, resolving the `ReferenceError: onTranscriptsListChange is not defined` crash.
  - Implemented the standard React `useEffect` callback sync pattern using a mutable `callbacksRef` to decouple external callbacks from state-updating render cycles. This resolves the React runtime warning: `Cannot update a component (CallInterface) while rendering a different component (IncomingCallBox)`.
  - Refactored `ws.onMessage('transcript')` and `ws.onMessage('call_end')` to only call the internal state setter `setTranscripts`, shifting the propagation of transcripts to the parent components to a clean, decoupled effect hook listening to `transcripts` changes.
  - Updated `connectWebSocket` to clear any stale transcripts from previous calls upon starting a new connection.
  - Fixed `call_end` payload parsing to properly map backend `caller` and `agent` objects, ensuring compatibility with structured fields.
- **`frontend/src/components/CallInterface.tsx`**:
  - Completely replaced the side-by-side textareas with a premium, real-time read-only chat bubble dialogue view.
  - Placed caller (inbound) messages left-aligned with a subtle background and agent (outbound) messages right-aligned with an indigo/blue gradient.
  - Displayed the English translation as primary text and the original language (if different) as secondary styled italic text with a globe icon and language metadata.
  - Added auto-scrolling to the bottom of the chat container when new messages arrive.
  - Added a single edit & submit translation box at the bottom of the screen that only appears after the call has concluded, pre-filled with the formatted conversation draft.

### 6. Chat Container Scrolling, Persistence & Collapsible Transition (CallInterface.tsx)
- **`frontend/src/components/CallInterface.tsx`**:
  - Replaced body/window scrolling `scrollIntoView` behavior with local container-level `scrollTo` to prevent the parent screen/viewport from shifting up when transcripts arrive.
  - Overhauled the `Card` wrapper to render unconditionally, making the card header persistent.
  - Placed the `CardContent` within a transition-enabled wrapper div that smoothly collapses to `max-h-0` and fades to `opacity-0` when the call is inactive and transcript lists are empty, keeping the box minimized.
  - Expands the container smoothly to `max-h-[480px]` with `opacity-100` when a call starts or when there are active transcripts.
  - Implemented a premium animated listening state placeholder displaying bouncing dot indicators inside the expanded container if a call is active but speech has not yet been transcribed.

### 7. Spacing & UI Alignment Optimizations (CallInterface.tsx, IncomingCallBox.tsx, FarmerDetails.tsx)
- **`frontend/src/components/CallInterface.tsx`**:
  - Reduced main outer container spacing from `space-y-6` to `space-y-4` to tighten gaps between dashboard panels.
  - Expanded the main dashboard container from `max-w-4xl mx-auto` to `w-full max-w-full px-4 md:px-6` to occupy the full screen width and remove unused blank space.
- **`frontend/src/components/IncomingCallBox.tsx`**:
  - Reduced idle/admin state paddings to `p-3` and decreased text size to `text-sm` to prevent empty call containers from occupying too much vertical space.
  - Rewrote active call info to display caller phone number and time side-by-side using flex layout with a thin divider, saving a line of vertical space.
- **`frontend/src/components/FarmerDetails.tsx`**:
  - Imported `cn` and converted the default card to a border-reduced, low-opacity flat container with tighter padding (`p-2.5` / `pt-1`) and a clean uppercase header.
  - Overhauled the farmer profile fields representation into a space-efficient 2-column grid (`grid-cols-2`) with custom icon spacing and truncation support, shrinking vertical usage by 50%.

### 8. Draft Review Spacing Optimizations (CallInterface.tsx)
- **`frontend/src/components/CallInterface.tsx`**:
  - Optimized the layout of the "Review & Edit Translation Draft" card to utilize vertical and horizontal space more efficiently.
  - Reduced CardHeader padding from `px-6 py-4` to a tighter `px-4 py-2.5` and set CardContent padding to `p-4 space-y-3` (previously `p-6 space-y-4`).
  - Resized the Reset Draft button (`h-7 px-2.5` with smaller text size) and Submit Translation button (`h-8 px-4 text-xs font-medium`) to look more balanced.
  - Shrinked the draft textarea's minimum and maximum heights (`min-h-[100px] max-h-[220px]` from `min-h-[140px] max-h-[320px]`) and adjusted its padding to `p-3`.
  - Refined container roundness to `rounded-xl` to better align with the compact panel layouts.

### 9. Call Panel & Layout Optimizations (IncomingCallBox.tsx)
- **`frontend/src/components/IncomingCallBox.tsx`**:
  - Overhauled the layout structure when a call is active (incoming, connected, or held) using a responsive 2-column grid (`grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch`).
  - Placed caller details and controls in the left column inside a clean cards-in-card layout to reduce whitespace.
  - Placed the Farmer Details component in the right column, matching height and resolving the horizontal layout imbalance.
  - Redesigned caller info with an elegant round telephone avatar and bold phone number font.
  - Dynamically styled the headers, badges, and statuses with color-coded states (Amber/Pulse for incoming, Emerald for active call, Yellow for hold).
  - Streamlined buttons to a clean grid (Hang Up takes full width, and Record, Hold, and Mute fill out the row neatly) with modern gradients and transitions.
  - Removed standard card inner padding bounds to allow full screen alignment.
  - Reduced CardHeader height by switching from `border-b` (which triggered a shadcn `pb-6` override) to `border-b-0` with a separate divider div, and set padding to `py-2`.
  - Slightly increased title font size to `text-base font-bold` for better visual presence.
  - Optimized header icon container padding to `p-1`.

### 10. Farmer Feature Complete Flow Debug Logging
- **`backend/src/shared/database/providers/mongo/MongoDatabase.ts`**: Added `[FARMER_FLOW]` console logs to database connection events, including connection attempts, successful connections, and failures. Masked credentials in the connection URI to protect security.
- **`backend/src/shared/database/providers/mongo/repositories/CallFarmerRepository.ts`**: Implemented `[FARMER_FLOW]` logs on all DB repository methods (`findByPhoneNo`, `create`, `update`, `delete`, `getAll`) to print query arguments, success statuses with counts/records, and detailed error stack traces.
- **`backend/src/modules/plivo/services/FarmerService.ts`**: Added service-layer console logs tracing inputs, result structures, and detailed error outputs.
- **`backend/src/modules/plivo/controllers/FarmerController.ts`**: Added API endpoint console logs to print incoming params, request bodies, and responses.
- **`frontend/src/hooks/api/plivo/api.ts`**: Logged HTTP requests and response structures for all PlivoService API calls.
- **`frontend/src/components/FarmerDetails.tsx`**: Integrated UI-component level logs during fetching (`fetchFarmerDetails`) and saving (`handleSave`) of farmer profiles.

### 11. Farmer Flow Database Authentication Fix
- **`backend/src/shared/database/providers/mongo/repositories/CallFarmerRepository.ts`**:
  - Switched database dependency injection from `GLOBAL_TYPES.annamanalyticsDatabase` (`AnnamDatabase`) to the main application's primary database instance `GLOBAL_TYPES.Database` (`MongoDatabase`). This ensures CRUD queries target the fully-authenticated, primary application database rather than targeting the analytics analytics/test database which has different credentials and triggers authentication failures.
  - Cleaned up unused imports of `AnnamDatabase` and its injection symbol.
- **`backend/src/config/analyticsDbConfig.ts`**:
  - Corrected analytics fallback database names by replacing `'test'` with `'vicharanashala'` and `'annamalytics'` respectively, preventing authorization/scope issues when fallback logic runs in staging environments.

### 12. Call Details Database Storage
- **`backend/src/shared/database/interfaces/ICallDetailsRepository.ts`**: Created interface to enforce typing for `CallDetails` records including transcripts, translation and language detection for both agent and caller.
- **`backend/src/shared/database/providers/mongo/repositories/CallDetailsRepository.ts`**: Implemented `CallDetailsRepository` targeting the `call_details` MongoDB collection.
- **`backend/src/modules/plivo/types.ts` & `container.ts`**: Added dependency injection bindings for the new `CallDetailsRepository`.
- **`backend/src/modules/plivo/services/PlivoService.ts`**: Added `plivo.Client` and `saveCallDetails` method to fetch metadata from Plivo API and persist the complete call details (along with active transcripts) into the database.
- **`backend/src/bootstrap/websocket.ts`**: Updated the instantiation of `PlivoService` to correctly use the DI container (`getContainer().get(...)`) instead of `new PlivoService()`. Captured the actual Plivo `callUuid` from the `start` payload, and triggered `saveCallDetails()` when the call `stop` event is received.
- Changed question generation in \rontend/src/components/CallInterface.tsx\ from automatic based on \useEffect\ to manual with a queued system and a 'Generate question' button.
- 2026-05-26 06:33:25 - Modified CallInterface.tsx to add checkbox selection for individual transcripts and remove the previous queue system, allowing users to select specific transcripts for generating questions.
- Modified \`frontend/src/components/CallInterface.tsx\` to always show the original text by removing the condition that hides it when \`originalText\` is identical to \`translatedText\`.
- Modified `backend/src/modules/question/services/QuestionService.ts` and `IQuestionService.ts` to use `agent_search` API directly for generating questions, bypassing `aiService.getQuestionByContextForCall`, and formatted the response to match the expected array structure.
- Fixed the `agent_search` mapping to properly extract multiple questions from the `data.results` array instead of stringifying the entire top-level response object.
- Restored the strict `Promise<GeneratedQuestionResponse[]>` return type mapping in QuestionService.
- Fixed a TypeScript error in `backend/src/modules/plivo/controllers/PlivoController.ts` by passing `src`, `dst`, and `text` as positional arguments to `this.client.messages.create()` instead of a single object, matching the Plivo SDK method signature.
- Integrated the `sendMessage` API into the frontend: added the method to `plivoApi` hook and added a "Message" button in `CallHistory.tsx` that opens an inline input box to send SMS directly to the farmer.
- Fixed a crash in `PlivoController`'s `sendMessage` endpoint where `req.body` was undefined, by using the `@Body()` decorator and wrapping the destructuring inside a try-catch block.
- Resolved an issue where `routing-controllers` paired with `class-transformer` wiped out the JSON payload when using `@Body() body: any`. Switched to explicit `@BodyParam("destination")` and `@BodyParam("text")` to ensure the frontend data is correctly parsed without being discarded by type reflection.
- Added global `express.json()` and `express.urlencoded()` to `backend/src/index.ts` to ensure consistent body parsing across all routes.
- Fixed a 500 "stream is not readable" error in `UserRepository.ts` by safely cloning the MongoDB document returned by `findOneAndUpdate` via `JSON.parse(JSON.stringify(result))` before applying spread operations and returning it to `routing-controllers`.
- Updated `frontend/src/components/ManageCallAgents.tsx` to allow selecting only one agent at a time using a single radio selection instead of multiple checkboxes.

## Changes Logged: 2026-06-24

### 1. Fix Call Agent Busy Status on Call End / Termination
- **Backend `UserController.ts`**:
  - Exposed a new endpoint `POST /users/call-agents/available` that allows call agents to mark themselves as available (`isBusy: false`).
  - Added a backend check to ensure that the agent is active (`isCallAgentActive === true`) and currently busy (`isBusy === true`) before calling `markAgentAsAvailable(userId)`.
- **Frontend `userService.ts`**:
  - Exposed `markAgentAsAvailable()` API helper calling `POST /users/call-agents/available`.
- **Frontend `IncomingCallBox.tsx`**:
  - Imported and instantiated `UserService`.
  - Added `handleMarkAgentAsAvailable` to call the new availability API.
  - Registered `handleMarkAgentAsAvailable` callback invocation in the Plivo Client SDK event handlers: `onCallTerminated`, `onCallRejected`, `onCallFailed`, `onCallCancelled`, and `onIncomingCallEnded`.
  - Registered `handleMarkAgentAsAvailable` invocation inside the auto-reset call timeout callback (triggered when an incoming call rings for 30 seconds without being answered).

### 2. Fix Missing Agent UserId in Call Details
- **Backend `PlivoController.ts`**:
  - Imported `UseBefore` from `routing-controllers` and `urlencoded` from `express`.
  - Added `@UseBefore(urlencoded({ extended: true }))` to the `/answer`, `/webhook/call-answered`, and `/webhook/call-ended` routes. This ensures that the urlencoded parameters sent by Plivo are correctly parsed into `req.body`, resolving `callUuid` successfully to map and store the agent's `userid` in MongoDB.
  - Enabled debug request logging in the `/answer` endpoint.

### 3. Redesign Call Agent Dashboard UI for Clarity
- **Frontend `CallAgentDashboard.tsx`**:
  - Replaced the confusing fixed-timeframe cards ("Calls Today", "This Week", "This Month") with a clean, dynamic, period-specific grid.
  - Set the KPI cards to represent metrics directly matching the user's selected global period filter:
    - **Total Calls**: Displays call count for the filtered period.
    - **Average Call Duration**: Formatted elegantly (e.g. `24s` or `1m 15s`) instead of raw seconds.
    - **Domains Covered**: Displays unique domain count for the filtered period.
    - **Agent Live Status**: Displays if the agent is "Online & Ready" or "Offline" with a glowing animated ping indicator and assigned endpoint details.
  - Eliminated the redundant second row cards ("Average Call Duration" and "Quick Stats"), giving the dashboard a unified and clean appearance.
  - Removed the unused `Calendar` import.

### 4. Live Call Conversation Dummy Data for Testing
- **Frontend `CallInterface.tsx`**:
  - Defined a new constant `DUMMY_TRANSCRIPTS` containing structured transcripts representing an inbound-outbound call dialogue between a farmer and an agent in Hindi/English translations.
  - Configured state variables (`transcriptsList`, `isCallActive`, and `callUuid`) to initialize by default with the dummy data and the specific testing call UUID `"8abb85d7-aa02-4b69-95de-cf82034f0988"` so the live conversation card displays immediately on render.
  - Exposed a `handleLoadTestData` method and a corresponding "Load Test Data" button in the Live Conversation Dialogue header, allowing testing states to be reloaded easily at any point.

### 5. Flatten Analytics Domains in Dashboard
- **Frontend `CallAgentDashboard.tsx`**:
  - Implemented a `processedDomains` mapping helper at the component's top level. It processes backend analytics, flattening array values in `analytics.domains` (such as `domain: ["Soil Health", "Disease Management"]`) to track and group each unique domain individually.
  - Bound the "Domains Covered" KPI card count and the "Domains Answered" Pie Chart data directly to the flattened domains list to fix visual clustering and percentage calculation errors.

### 6. Redesign Call History Details UI
- **Frontend `CallHistory.tsx`**:
  - Overhauled the expander row details container with custom borders, background shading, margins, and center alignments to maximize readability.
  - Placed the `<FarmerDetails />` card (with `defaultOpen={true}`) and a newly extracted **"Extracted Call Data"** card (holding crop, season, state, district, and domain metadata list) side-by-side in a responsive 2-column grid layout (`grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch`), using the screen width much more efficiently and balancing content height.
  - Positioned the **Call Transcripts** (single vertical chat dialogue) and the **Question & Answer Pairs** (clean Accordion block) as single-column full-width containers below the top row.
  - Integrated `formatDomainField` to cleanly render multiple domains separated by commas (`.join(", ")`) instead of squashed text.
  - Implemented a React-based `renderMarkdown` parser utility to format raw markdown characters (such as `**bold**` tags and `- bullet` lists) in LLM-generated questions and answers.
  - Applied `renderMarkdown` to both Accordion QnA headers and answer text areas to ensure clean visual styling.

### 7. Collapsible FarmerDetails
- **Frontend `FarmerDetails.tsx`**:
  - Added a `defaultOpen` prop and an `isOpen` state to make the card collapsible.
  - When collapsed, it displays a space-efficient, single-line horizontal preview of primary farmer fields (Name, Crop, State) in the header with a "Show Details" button, shrinking vertical usage by 85%.
  - When expanded, it renders the full interactive editing/viewing grid, alongside options to toggle field density ("All Fields" / "Less Fields") and a collapse ("Hide") button.
- **Frontend `IncomingCallBox.tsx`**:
  - Passed `defaultOpen={true}` to `FarmerDetails` so the details remain expanded immediately on active inbound calls.

### 8. Enhanced FarmerDetails Grid, Q&A Chevrons, and Markdown Parser
- **Frontend `FarmerDetails.tsx`**:
  - Restructured the viewing grid to be responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2`).
  - Reformatted individual fields as clean horizontal row strips, with labels on the left and values on the right, separated by a light border line to prevent squishing when displayed in the 2-column layout.
- **Frontend `CallHistory.tsx`**:
  - Imported `ChevronDown` from `lucide-react`.
  - Added the rotating `ChevronDown` arrow to the `AccordionTrigger` for Q&A items to clearly indicate they are expandable.
  - Upgraded the `renderMarkdown` function to support headers (`#` and `##`) and custom bullets with colored indigo circles to cleanly render complex LLM responses.

### 9. Overhaul FarmerDetails Grid and Q&A Accordion Layouts
- **Frontend `FarmerDetails.tsx`**:
  - Replaced the simple horizontal row strips with a gorgeous, space-efficient grid of color-coded card tiles.
  - Implemented vertical stacking inside each tile (upper-case small label on top, bold value below) to prevent truncation and make it extremely readable.
  - Dynamically color-coded tiles based on categories (Indigo for General/Contact, Sky for Location, Emerald for Agriculture, Amber for Tech/Socio-economic) using curated border, background, and icon classes.
  - Mapped relevant Lucide icons (`Calendar`, `Users`, `Languages`, `Award`, `BookOpen`, `Smartphone`, `GraduationCap`, `Sparkles`, `Map`) to all profile fields for visual consistency.
  - Added a clean bottom border to the card header to separate it from the details grid.
- **Frontend `CallHistory.tsx`**:
  - Overhauled the Q&A `AccordionTrigger` header styling, keeping the layout clean and relying on the right-hand rotating chevron to indicate expandability.
  - Upgraded the custom `renderMarkdown` parser to support numbered lists (rendering custom rounded indigo/emerald badges) and inline code blocks, and grouped consecutive bullet and numbered items in proper `<ul>` and `<ol>` tags.
  - OVERHAULED the answer content block to use a subtle emerald-green scheme (`bg-emerald-50/15`, `border-emerald-100/50`) with an inner shadow, giving the Agri Specialist answers a premium, distinct visual treatment.
  - Fixed standard Tailwind classes in labels (`text-zinc-400 dark:text-zinc-500` instead of invalid `zinc-450`/`zinc-555`).

### 10. Visual Grouping and Advanced Renders for FarmerDetails Profiles
- **Frontend `FarmerDetails.tsx`**:
  - Grouped profile fields into 4 distinct visual sub-sections ("General Profile", "Location & Geography", "Agricultural Profile", "Social & Technology Profile") when expanded, separated by themed borders.
  - Added visual helper `renderValue` to format key-value profiles dynamically:
    - Boolean fields are rendered as glowing green/gray pulse status pill badges (`Yes`/`No`) rather than plain text.
    - Crops cultivated are rendered as individual flex-wrapped tag badges with light emerald background fills and borders.
    - Phone numbers are structured and formatted with local country code separators (`+91 XXXXX XXXXX`).
  - Fixed typo in field labels color classes (using `text-zinc-400 dark:text-zinc-500` instead of Tailwind fallback errors).
  - Redesigned the empty-state profile placeholder (when `farmer` is null) from a plain text sentence to a gorgeous, centered dashed container with a user icon, formatted helper text, and a prominent "Create Profile" button.
  - Removed the "Hide Details" (collapse) state and "Show Details" / "Hide" buttons from the header entirely. The FarmerDetails card is now persistently displayed in full (either as the profile grid or the empty-state profile builder), saving header space and simplifying interaction.
  - Patched a data-loss bug in `handleSave` where saving a new profile with unmodified default inputs would omit the active `phoneNo` payload property. Added default parameter merging.



