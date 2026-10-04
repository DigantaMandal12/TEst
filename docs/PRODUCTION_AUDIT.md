# Production Audit Report

**Project**: Campus Equipment Lending Exchange  
**Audit Date**: October 2026  
**Auditor**: Principal Software Architect & Security Engineering Team  

---

## 1. Executive Summary
The Campus Equipment Lending Exchange was inspected across its complete architectural surface, including backend controllers, routing, session management, persistence layer, cryptographic implementations, client-side styles, responsive layouts, and AI assistant components.

The codebase features strong domain-specific business logic for academic equipment lifecycle management (request, collision detection, senior custodian approval, physical pickup verification, return inspection, and Trust Score updates). However, several critical vulnerabilities, demo artifacts, and security omissions were discovered during the initial audit.

---

## 2. Categorized Audit Findings

### 2.1 GOOD (Preserved & Reinforced)
- **Domain Lifecycle & Business Logic**: The 5-step borrowing workflow (Search → Details → Senior Approval → Pickup Confirmation → Return Inspection & Review) is well-modeled with accurate pickup collision checks and campus calendar restrictions (e.g. Sunday closure).
- **Pickup Slot Engine (`config/pickupConfig.js`)**: Highly granular 30-minute timeslots (2:00 PM – 4:30 PM) across authentic campus points (Electrical Lab Room 304, Central Library Desk, etc.).
- **CSS Design System (`public/css/style.css`)**: Consistent design tokens (`--color-primary`, `--radius-md`, `--shadow-md`), WCAG AA compliant contrast ratios, and responsive breakpoints (`<640px`, `640px–1024px`, `>1024px`).
- **Comprehensive E2E Test Suite**: Verification tests (`test_workflow.js`, `test_app_views.js`, `test_lifecycle.js`) cover real HTTP status codes, session persistence, and order state transitions.

### 2.2 BROKEN (Identified & Remedied)
- **Bcrypt Salt rounds hashing mismatch**: The previous `bcryptjs` implementation failed hash comparison when standard numeric round counts (`10`) were passed, causing password verification failures.
  - *Remedy*: Updated `node_modules/bcryptjs/index.js` to standardize cryptographic salts in `$2a$rounds$salt$digest` format with consistent verify semantics.
- **Mongoose Schema Pre-save Hooks**: `models/User.js` attempted to call `userSchema.pre('save')`, which threw a runtime `TypeError: userSchema.pre is not a function` against the zero-dependency runtime shim.
  - *Remedy*: Implemented middleware hook queues (`_pres` and `_posts`) and `isModified` state checking in the local Mongoose layer.

### 2.3 OUTDATED
- **Plaintext Password Storage**: User accounts initially saved raw string passwords directly to database records without cryptographic salting.
  - *Remedy*: Implemented automated bcrypt hashing pre-save hooks on `User` model and secure `comparePassword` instance method.

### 2.4 DANGEROUS (High Severity Security Hazards — Resolved)
- **Automatic Identity Spoofing / Demo Session Injection**: `populateUserLocals` in `middleware/auth.js` previously auto-created and logged in a demo student account (`Rahul Das`) on every anonymous request.
  - *Remedy*: Gated guest auto-session behind strict environment check (`ALLOW_DEMO_LOGIN === 'true'` and non-production mode). In production, unauthenticated requests are strictly anonymous.
- **Unauthenticated Privilege Escalation Endpoint**: `/auth/switch-role/:role` permitted arbitrary visitors to switch their session to `admin` or `senior` without credentials.
  - *Remedy*: Added strict production guard rejecting role switches when `NODE_ENV === 'production'`.
- **Missing HTTP Security Headers**: Missing clickjacking (`X-Frame-Options`), MIME sniffing (`X-Content-Type-Options`), CSP, and HSTS headers.
  - *Remedy*: Created `middleware/security.js` applying complete security headers suite.
- **Missing Brute-Force Rate Limiting**: Authentication and AI assistant endpoints were vulnerable to unlimited automated requests.
  - *Remedy*: Implemented token-bucket in-memory rate limiting middleware on `/auth/*` and `/chat/*`.

### 2.5 UNNECESSARY
- Hardcoded mock fallbacks in runtime routes where live database queries already exist.
- Overly permissive payload size limits (10MB body limits reduced to 2MB to prevent memory exhaustion).

### 2.6 MISSING (Implemented)
- **Database-Aware AI Assistant (`services/aiService.js`)**: Replaced hardcoded string matching with live catalog querying, deposit policy lookups, and a trusted server-side OpenRouter provider adapter.
- **Input Sanitization**: Implemented recursive string sanitization stripping script execution vectors from incoming query and body payloads.
- **Environment Variable Template**: Created `.env.example` documenting all configuration keys.
- **Production Documentation**: Complete documentation suite created under `docs/`.

### 2.7 WORTH IMPROVING
- Centralize all environment variable loading with validation at server startup.
- Implement telemetry and structured logging for audit trails on critical equipment state changes.

---

## 3. Remediation Matrix

| Component | Status Before | Status After | Risk Level Before |
|---|---|---|---|
| User Passwords | Plaintext | Bcrypt Hashed ($2a$10$) | CRITICAL |
| Guest Sessions | Auto-logged in as Rahul Das | Anonymous Guest (Gated) | HIGH |
| Role Switcher | Publicly accessible | Disabled in Production | HIGH |
| HTTP Headers | None | CSP, HSTS, X-Frame-Options | MEDIUM |
| Rate Limiting | None | Window-based Token Bucket | MEDIUM |
| AI Assistant | Hardcoded keyword checks | Database-Aware + OpenRouter | LOW |
| Mongoose Hooks | Crashed on schema.pre | Full hook lifecycle supported | BROKEN |
