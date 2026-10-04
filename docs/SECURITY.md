# Security Architecture & Controls
**Campus Equipment Lending & Exchange Platform**

## 1. Threat Model & Overview
The Campus Equipment Lending Exchange processes student identity credentials, equipment inventory, deposit escrows, and peer evaluations. The security model strictly adheres to the **Zero Trust** principle: all client requests are treated as untrusted until authenticated and authorized by server middleware and database security rules. Full threat vectors and mitigations are documented in `docs/THREAT_MODEL.md`.

---

## 2. Implemented Security Controls

### 2.1 Password Hashing & Authentication
- Passwords are never stored in plaintext.
- Hashing is handled via pre-save hooks on the `User` model using `bcryptjs` with 10 salt rounds (`$2a$10$...`).
- Verification is performed using timing-safe comparisons via `user.comparePassword(candidatePassword)`.
- Firebase Authentication is supported for production session tokens and identity tokens.

### 2.2 Session Security & Cookie Protection
- Cookies are assigned strict production attributes:
  - `httpOnly: true`: Blocks client-side JavaScript access to prevent session theft via XSS.
  - `sameSite: 'lax'`: Mitigates Cross-Site Request Forgery (CSRF).
  - `secure: true`: Automatically enforced in production over TLS (`isProd && process.env.COOKIE_SECURE === 'true'`).
  - `name: 'campus_sid'`: Non-default session cookie identifier.
- Sessions regenerate on authentication events (`req.session.regenerate()`) to defend against session fixation attacks.

### 2.3 Cross-Site Request Forgery (CSRF) Defense
- In addition to `SameSite=Lax` cookies, server-side `csrfProtection` middleware validates incoming `Origin` and `Referer` headers on all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
- Mismatched origins from third-party websites are rejected with HTTP 403 Forbidden.

### 2.4 Role-Based Access Control (RBAC) & Anti-Self-Approval
Endpoints enforce authorization through three distinct tiers:
1. **Student / Borrower (`requireAuth`)**: Permitted to browse catalogue, submit borrow requests, view personal active loans, and submit reviews for returned items.
2. **Senior Peer Lender (`requireSenior`)**: Permitted to manage incoming requests for equipment they personally own, approve/decline valid requests, and inspect returns.
   - **Anti-Self-Approval Guard**: A senior borrower can NEVER approve their own borrow request.
   - **Horizontal Isolation**: Senior A cannot approve, decline, or modify requests for equipment owned by Senior B.
3. **Campus Administrator (`requireAdmin`)**: Authorized for department-wide oversight, cross-user conflict resolution, and inventory moderation.

### 2.5 Insecure Direct Object Reference (IDOR) Defenses
- **Equipment Listings**: `edit`, `update`, and `remove` verify that `equipment.ownerId === currentUserId` or user is `admin`.
- **Borrow Collections**: `confirmPickup` verifies `borrowRequest.borrowerId === currentUserId`.
- **Return Verification**: `returnEquipment` verifies `borrowRequest.lenderId === currentUserId` or `borrowRequest.borrowerId === currentUserId` (or admin).
- **Reviews**: Submissions require a verified completed order (`request.status === 'returned'`) belonging to the reviewer; duplicate reviews for the same order are blocked to eliminate Trust Score inflation exploits.
- **Notifications**: `markRead` verifies document ownership before mutation.

### 2.6 HTTP Security Headers (`middleware/security.js`)
- `X-Frame-Options: SAMEORIGIN` (prevents clickjacking).
- `X-Content-Type-Options: nosniff` (prevents MIME sniffing).
- `Referrer-Policy: strict-origin-when-cross-origin` (protects privacy on outbound links).
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (restricts browser APIs).
- `Content-Security-Policy`: Restricts scripts and assets to `'self'`, Google Fonts, and authorized origins with `frame-ancestors 'self'`.
- `Strict-Transport-Security`: HSTS enabled for 1 year (`max-age=31536000; includeSubDomains`) in production.
- `X-Powered-By`: Removed to suppress framework fingerprinting.

### 2.7 Rate Limiting & Denial of Service Protection
- Token-bucket in-memory rate limiting with periodic garbage collection:
  - `/auth/*`: 30 attempts per 15-minute window per IP.
  - `/chat/*`: 45 queries per 10-minute window per IP.
  - Standard API: 60 requests per minute per IP.
- Express body parsing is capped at `2mb` to prevent memory flooding.
- Chat prompt input is strictly capped at 2,000 characters.

### 2.8 AI Security, Data Minimization & Secret Protection
- The OpenRouter API key resides strictly server-side (`process.env.OPENROUTER_API_KEY`).
- Prompt injection filter (`isMaliciousPrompt`) intercepts and rejects attempts to dump database schemas or extract keys.
- AI tools (`services/aiTools.js`) enforce least-privilege Firestore access and require authentication for user-specific queries.
- Data minimization: Sensitive database fields (passwords, emails, user IDs) are stripped before sending context to the LLM.
- 6,000ms HTTPS timeout with immediate degradation to Mode B local deterministic engine.
