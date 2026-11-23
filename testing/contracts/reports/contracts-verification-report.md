# Ajrasakha Layer 2: Cross-Boundary Contract Verification Report

**Execution Time:** 2026-11-23T07:30:53.939Z  
**Total Contracts Checked:** 91  
**Passed:** 91 | **Failed:** 0  
**Overall Compliance Score:** 100%  
**Gate Status:** 🟢 PASSED (PR Eligible for Merge)

## 1. Category Score Summary

| Category | Total Checked | Passed | Failed | Compliance Rate |
| :--- | :---: | :---: | :---: | :---: |
| **Backend-Frontend** | 26 | 26 | 0 | 🟢 100% |
| **Security-Guards** | 4 | 4 | 0 | 🟢 100% |
| **DTO-Validation** | 3 | 3 | 0 | 🟢 100% |
| **AI-MCP-Registry** | 6 | 6 | 0 | 🟢 100% |
| **AI-MCP-Signature** | 4 | 4 | 0 | 🟢 100% |
| **AI-MCP-Wire** | 10 | 10 | 0 | 🟢 100% |
| **Microservices** | 25 | 25 | 0 | 🟢 100% |
| **Cross-Service-Call** | 1 | 1 | 0 | 🟢 100% |
| **Type-Parity** | 5 | 5 | 0 | 🟢 100% |
| **Edge-Cases:Geo-Telemetry** | 1 | 1 | 0 | 🟢 100% |
| **Edge-Cases:Chemical-Safety** | 1 | 1 | 0 | 🟢 100% |
| **Edge-Cases:Consensus-Matrix** | 1 | 1 | 0 | 🟢 100% |
| **Edge-Cases:Type-Validation** | 1 | 1 | 0 | 🟢 100% |
| **Edge-Cases:Unicode-Indic** | 1 | 1 | 0 | 🟢 100% |
| **Edge-Cases:Sanitization** | 1 | 1 | 0 | 🟢 100% |
| **Edge-Cases:Pagination** | 1 | 1 | 0 | 🟢 100% |

## 2. Detailed Contract & Edge Case Breakdown

| Category | Contract / Service | Status | Verification Summary |
| :--- | :--- | :---: | :--- |
| **Backend-Frontend** | `POST /questions/allocated` | ✅ PASS | Verified Expert allocated questions workbench |
| **Backend-Frontend** | `POST /questions/detailed` | ✅ PASS | Verified Detailed questions list with advance filters |
| **Backend-Frontend** | `GET /questions/queue-details` | ✅ PASS | Verified Comprehensive queue metrics & workload status |
| **Backend-Frontend** | `GET /questions/role-dashboard` | ✅ PASS | Verified Role-based dashboard for auditor, gatekeeper & PAE |
| **Backend-Frontend** | `POST /questions/status-summary` | ✅ PASS | Verified Question status breakdown totals |
| **Backend-Frontend** | `POST /questions/reallocate-manual` | ✅ PASS | Verified Manual reallocation of questions to expert |
| **Backend-Frontend** | `POST /questions/reallocate-timebound` | ✅ PASS | Verified Time-bound re-allocation cycle |
| **Backend-Frontend** | `POST /questions/bulk-pae-allocate` | ✅ PASS | Verified Bulk allocation of questions to PAE experts |
| **Backend-Frontend** | `POST /questions/check-status` | ✅ PASS | Verified Question processing & lifecycle status check |
| **Backend-Frontend** | `GET /questions/feedback/queue-details` | ✅ PASS | Verified Moderator & Auditor feedback queue |
| **Backend-Frontend** | `GET /questions/pae-val/queue-details` | ✅ PASS | Verified PAE validation queue details |
| **Backend-Frontend** | `POST /answers` | ✅ PASS | Verified Initial answer creation / submission |
| **Backend-Frontend** | `POST /answers/review` | ✅ PASS | Verified Multi-round consensus peer review (approve/reject/modify) |
| **Backend-Frontend** | `PUT /answers` | ✅ PASS | Verified Update or finalize answer draft |
| **Backend-Frontend** | `POST /answers/moderator/approve` | ✅ PASS | Verified Moderator final approval & GDB readiness |
| **Backend-Frontend** | `POST /answers/:questionId/confirm-duplicate` | ✅ PASS | Verified Confirm duplicate question status |
| **Backend-Frontend** | `GET /answers/finalizedAnswers` | ✅ PASS | Verified Retrieve closed & finalized answers |
| **Backend-Frontend** | `POST /answers/detect-chemicals` | ✅ PASS | Verified Cross-boundary banned agro-chemical detector |
| **Backend-Frontend** | `GET /answers/submissions` | ✅ PASS | Verified Submissions queue for active questions |
| **Backend-Frontend** | `GET /users/me` | ✅ PASS | Verified Current authenticated user profile |
| **Backend-Frontend** | `GET /users/all` | ✅ PASS | Verified All active users directory |
| **Backend-Frontend** | `GET /users/moderators` | ✅ PASS | Verified Active moderators list |
| **Backend-Frontend** | `GET /users/by-role` | ✅ PASS | Verified Filter system users by role |
| **Backend-Frontend** | `GET /users/call-agents` | ✅ PASS | Verified ACC telephony call agents status |
| **Backend-Frontend** | `Chemical Master API` | ✅ PASS | Verified 5 CRUD routes on /chemicals |
| **Backend-Frontend** | `Crop Taxonomy API` | ✅ PASS | Verified 15 taxonomy & import routes on /crops |
| **Security-Guards** | `Answer Submission Auth Guard` | ✅ PASS | Strict role-based authorization guard enforced |
| **Security-Guards** | `Review Answer Auth Guard` | ✅ PASS | Strict role-based authorization guard enforced |
| **Security-Guards** | `Tester Mutation Barrier` | ✅ PASS | Strict role-based authorization guard enforced |
| **Security-Guards** | `Chemical Modification Guard` | ✅ PASS | Strict role-based authorization guard enforced |
| **DTO-Validation** | `AddAnswerBody DTO` | ✅ PASS | class-validator decorators and required types verified |
| **DTO-Validation** | `ReviewAnswerBody DTO` | ✅ PASS | class-validator decorators and required types verified |
| **DTO-Validation** | `DetectChemicalsBody DTO` | ✅ PASS | class-validator decorators and required types verified |
| **AI-MCP-Registry** | `Specialist Tool: gdb` | ✅ PASS | Registered in main tool node (Golden Dataset Retriever) |
| **AI-MCP-Registry** | `Specialist Tool: weather` | ✅ PASS | Registered in main tool node (Weather Telemetry & Observations) |
| **AI-MCP-Registry** | `Specialist Tool: soil` | ✅ PASS | Registered in main tool node (Soil Health & Fertilizer Calculator) |
| **AI-MCP-Registry** | `Specialist Tool: daily_price` | ✅ PASS | Registered in main tool node (Daily Mandi / Market Prices) |
| **AI-MCP-Registry** | `Specialist Tool: schemes` | ✅ PASS | Registered in main tool node (Government Agri-Schemes Engine) |
| **AI-MCP-Registry** | `Specialist Tool: chemical_checker` | ✅ PASS | Registered in main tool node (Agro-Chemical Safety Checker) |
| **AI-MCP-Signature** | `Golden Dataset Tool` | ✅ PASS | Schema parity: query, state, and crop synchronized between gd.py and GDBInput |
| **AI-MCP-Signature** | `Weather MCP Tools` | ✅ PASS | Verified get_weather_forecast & get_current_weather with lat/lon parameters |
| **AI-MCP-Signature** | `Market / eNAM MCP Tools` | ✅ PASS | Verified get_apmc_list_from_enam and get_trade_data_list signatures |
| **AI-MCP-Signature** | `Package of Practices MCP Tools` | ✅ PASS | Verified PoP context retriever and upload_question_to_reviewer_system |
| **AI-MCP-Wire** | `MCP Config: gdb` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: weather` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: soil` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: enam` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: agmarknet` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: reviewer` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: location` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: schemes` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: chemical_checker` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **AI-MCP-Wire** | `MCP Config: daily_price` | ✅ PASS | Configured network route in MCP_URLS dictionary |
| **Microservices** | `Chemical Detector API: Endpoint POST /detect-chemicals` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Chemical Detector API: Request Model DetectRequest(text)` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Chemical Detector API: Response Model DetectResponse` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Chemical Detector API: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Authoring Writing Assistant API: Endpoint POST /polish-draft` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Authoring Writing Assistant API: Request Model PolishDraftRequest` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Authoring Writing Assistant API: Response Model PolishDraftResponse` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Authoring Writing Assistant API: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Agriculture Intent Classifier API: Endpoint POST /classify-question` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Agriculture Intent Classifier API: Request Model ClassifyRequest` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Agriculture Intent Classifier API: Response Model ClassifyResponse` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Agriculture Intent Classifier API: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `PoP Answer Generation API: Endpoint POST /generate` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `PoP Answer Generation API: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `PoP Answer Generation API: Readiness Endpoint GET /health/ready` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `ACC Calling Agent Search & Extract API: Endpoint POST /search` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `ACC Calling Agent Search & Extract API: Endpoint POST /extract` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `ACC Calling Agent Search & Extract API: Endpoint GET /filters` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `ACC Calling Agent Search & Extract API: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Live Observation Weather API: Endpoint GET /live` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Live Observation Weather API: Endpoint GET /live/details` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Live Observation Weather API: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `Live Observation Weather API: Cache Management POST /cache/clear` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `LangGraph OpenAI Wire Protocol Adapter: Chat Completions POST /v1/ajrasakha/chat/completions` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Microservices** | `LangGraph OpenAI Wire Protocol Adapter: Health Endpoint GET /health` | ✅ PASS | Verified FastAPI route & Pydantic schema contract |
| **Cross-Service-Call** | `Backend -> Chemical Detector` | ✅ PASS | Verified service integration between Reviewer Backend and chemical_detector microservice |
| **Type-Parity** | `UserRole Union` | ✅ PASS | Full parity across all 11 system roles: [admin, auditor, block_coordinator, call_agent, district_coordinator, expert, gate_keeper, moderator, pae_expert, tester, village_volunteer] |
| **Type-Parity** | `QuestionStatus Union` | ✅ PASS | Full parity across all 19 lifecycle states: [auditor_review, closed, delayed, draft, duplicate, duplicate_closed, duplicate_confirmed, dynamic, dynamic_closed, hold, in-review, non_agri, open, pae_submitted, pass, pending, queue_duplicate, queue_progress, re-routed] |
| **Type-Parity** | `NotificationRetentionType Union` | ✅ PASS | Full parity on retention options: [1m, 1w, 2w, 3d, never] |
| **Type-Parity** | `User Preference Structure (IPreference <-> IMyPreference)` | ✅ PASS | Verified state, district, crop, and domain structure parity |
| **Type-Parity** | `IKVKCoveredItem Interface` | ✅ PASS | Verified state, district, and name field mapping for KVK operational coverage |
| **Edge-Cases:Geo-Telemetry** | `Coordinate Boundary Gate (-90<=lat<=90, -180<=lon<=180)` | ✅ PASS | Validated 8 edge cases including polar extremes, antimeridian, overflows, and null values |
| **Edge-Cases:Chemical-Safety** | `Agro-Chemical Detector with Evasion Resistance` | ✅ PASS | Verified detection of banned chemicals, leetspeak evasion, Cyrillic homoglyphs, and clean organic passes |
| **Edge-Cases:Consensus-Matrix** | `3-Approval Consensus Engine & Modification Reset Rule` | ✅ PASS | Verified incremental approvals, approval count reset on modification, and final closure on 3 approvals |
| **Edge-Cases:Type-Validation** | `MongoDB ObjectId (24-Hex) Strict Validation` | ✅ PASS | Verified 24-character hex format enforcement across valid/malformed/truncated identifiers |
| **Edge-Cases:Unicode-Indic** | `Multilingual Indic Character Encoding (5 Languages)` | ✅ PASS | Verified lossless UTF-8 roundtrip preservation for Hindi, Punjabi, Marathi, Telugu, and Tamil queries |
| **Edge-Cases:Sanitization** | `Adversarial Prompt & XSS Sanitization Contract` | ✅ PASS | Verified stripping of script injections, HTML tags, and override commands before ingestion |
| **Edge-Cases:Pagination** | `Pagination Parameter Clamping & Safety Gate` | ✅ PASS | Verified negative/zero page normalization, NaN fallback, and upper bound limit clamping (max 100) |

---
*Report generated automatically by Ajrasakha Layer 2 Enterprise Contract Gatekeeper*
