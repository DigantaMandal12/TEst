# Master Quality Assurance & Test Plan
**Campus Equipment Lending & Exchange Platform**
*Release Candidate Validation Standard (v1.0.0-rc.1)*

---

## 1. Test Objectives & Scope
The objective of Phase 9 QA is to empirically prove that the Campus Equipment Lending Exchange functions correctly, securely, consistently, and performantly under production-like conditions. Testing validates all user workflows (Borrower, Senior Lender, Administrator, AI Assistant) against zero-trust authorization boundaries, concurrency conflicts, edge cases, and catastrophic failures.

---

## 2. Test Environment Specification
- **Runtime**: Node.js 20 LTS (Alpine Linux container / local runtime)
- **Framework & Middlewares**: Express 4.19, Helmet 7.1, Express-Rate-Limit, Express-Session
- **Database**: Cloud Firestore (authoritative production store with ACID transaction isolation)
- **Identity & Authentication**: Firebase Authentication + salted Bcrypt ($2a$10$) session management
- **Object Storage**: Firebase Cloud Storage with strict MIME and size controls
- **AI Gateway**: OpenRouter API (`meta-llama/llama-3.1-8b-instruct:free`) with local deterministic Mode B database-aware fallback
- **Target Configurations**:
  - `NODE_ENV=production`
  - `ALLOW_DEMO_LOGIN=false`
  - `COOKIE_SECURE=true`
  - `PORT=3000`

---

## 3. Test Suites & Verification Matrix

### 3.1 Functional & Lifecycle Tests
- **FL-01**: Catalog discovery, keyword search, and department taxonomy filtering (Mechanical, Civil, Electrical, Survey, IoT).
- **FL-02**: Equipment listing creation, editing, and deletion with strict owner/admin authorization.
- **FL-03**: Complete 6-Step Borrow-to-Return Lifecycle:
  1. Student searches & selects instrument.
  2. Submits borrow request with validated 30-min pickup slot (Sundays blocked).
  3. Senior lender verifies and approves request (Anti-self-approval enforced).
  4. Student arrives at designated campus pickup point and confirms collection (`in-use`).
  5. Equipment returned, physical condition inspected, and 100% security deposit marked refunded.
  6. Student submits peer review, ratings stored, and +3 Trust Score points awarded.

### 3.2 Security & Zero-Trust Tests
- **SEC-01**: Vertical Privilege Escalation — Student attempting `/admin` access rejected with 302/403.
- **SEC-02**: Horizontal Privilege Escalation — Senior A attempting to approve Senior B's equipment rejected with 403 Forbidden.
- **SEC-03**: Anti-Self-Approval — Senior borrower attempting to approve their own loan request rejected with 403 Forbidden.
- **SEC-04**: IDOR Defenses — Equipment deletion, order pickup, and return verification verify document ownership.
- **SEC-05**: Review Manipulation — Unborrowed items, pre-return reviews, and duplicate submissions blocked.
- **SEC-06**: CSRF Defense — Mismatched `Origin` and `Referer` headers on mutating HTTP requests rejected with 403 Forbidden.
- **SEC-07**: Rate Limiting — Rapid requests on auth and chat throttled with HTTP 429.
- **SEC-08**: Secret Leakage — Zero API keys, private keys, or stack traces in responses, error views, or `/health`.

### 3.3 Concurrency & Data Integrity Tests
- **CON-01**: Atomic Slot Reservation — Simultaneous requests for the identical equipment and 30-minute time slot result in exactly 1 reservation; colliding request is rejected.
- **CON-02**: State Machine Invariants — Instruments cannot be in `available` state while simultaneously associated with an active/reserved borrow request.
- **CON-03**: Trust Score Protection — Direct client tampering with `trustScore`, `trustTier`, `role`, or counter fields rejected at server and Firestore rule layers.

### 3.4 AI Assistant & OpenRouter Gateway Tests
- **AI-01**: Database Grounding — Inventory, deposit amounts, and pickup station responses match live Firestore data with zero hallucination.
- **AI-02**: Prompt Injection Resistance — Malicious prompts attempting system prompt dumps or credential exfiltration are neutralized.
- **AI-03**: Input Flooding Defense — Prompts exceeding 2,000 characters rejected with HTTP 400.
- **AI-04**: Mode A / Mode B Degradation — When OpenRouter API is unreachable or times out (6s), system degrades gracefully to local deterministic database engine.
- **AI-05**: User Privacy & Least Privilege — Students can only query their own loan records; unauthenticated requests require sign-in.

### 3.5 UI/UX, Mobile & Accessibility (WCAG 2.1 AA)
- **UI-01**: Mobile Responsiveness across 360px, 375px, 390px, 414px, 768px, 1024px, 1280px, 1440px+ without horizontal overflow.
- **UI-02**: Mobile Bottom Navigation bar with safe-area insets and role-aware navigation.
- **UI-03**: Form double-submission prevention (`btn.loading` spinner feedback).
- **UI-04**: Accessibility semantics: skip-to-content links, ARIA live regions for chat, visible focus rings (`:focus-visible`), and `prefers-reduced-motion` compliance.

### 3.6 Performance & Reliability Stress Tests
- **PERF-01**: Average response latency across core views (`/`, `/equipment`, `/health`, `/chat/message`) < 100ms.
- **PERF-02**: Clean PID 1 signal forwarding (`SIGTERM`, `SIGINT`) with zero unclosed sockets or leaked timers.
- **PERF-03**: Container non-root execution (`USER node`) and zero development dependencies in production build.

---

## 4. Release Criteria Gate
The release candidate will be approved only when 100% of automated tests pass, zero BLOCKER or CRITICAL defects remain, and all security policies are validated.
