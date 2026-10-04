# Campus Equipment Lending Exchange

A secure, scalable production platform enabling collegiate departments, engineering laboratories, and students to discover, reserve, borrow, inspect, and return academic equipment.

---

## Technical Highlights & Target Architecture

- **Runtime & Framework**: Node.js (>= 18.0.0) with Express.js.
- **Production Persistence**: **Cloud Firestore** as single authoritative source of truth.
  - Native Firestore collection models (`users`, `equipment`, `borrowRequests`, `reviews`, `notifications`).
  - Atomic transaction reservations for zero-collision pickup slot booking.
  - Aggregation queries (`collection.count().get()`) for minimal read units.
- **Authentication & Identity**: **Firebase Authentication** + signed session management.
  - Cryptographically verified session cookies with 7-day TTL (`httpOnly`, `sameSite: 'lax'`, `secure` in production).
  - Multi-tier Role-Based Access Control (`student`, `senior`, `admin`).
- **Object Storage**: **Firebase Cloud Storage** (`gs://bucket-name`) with strict MIME and size security rules (`storage.rules`).
- **Trusted Server Logic**: **Firebase Cloud Functions** (`functions/index.js`) for senior approvals, condition verification, deposit refund state, and Trust Score calculations.
- **Security & Hardening**:
  - Production security headers (CSP, X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, HSTS, Referrer-Policy).
  - Sliding-window rate limiting on authentication and AI assistant endpoints.
  - Recursive input sanitization against cross-site scripting (XSS).
  - Comprehensive `firestore.rules` and `storage.rules` enforcing Zero Trust access control.
- **AI Hardware Assistant**:
  - Database-aware assistant architecture querying real-time inventory and borrowing rules.
  - Zero-hallucination policy for unlisted hardware.
  - Secure server-side proxy integration with OpenRouter (`process.env.OPENROUTER_API_KEY`).
- **UI/UX Design System**:
  - Pure CSS design tokens (`public/css/style.css`) with WCAG AA compliance.
  - Responsive across mobile (<640px) with fixed bottom navigation, tablet (640-1024px), and desktop (>1024px).
  - Semantic HTML5, accessible form controls, and `prefers-reduced-motion` animations.

---

## Documentation Suite

Detailed architectural and operational documentation is located in the `docs/` folder:
- [Firebase Migration Audit & Strategy](docs/FIREBASE_MIGRATION.md)
- [Cloud Firestore Data Architecture](docs/DATABASE.md)
- [Hosting & Architecture Decision](docs/HOSTING_DECISION.md)
- [Disaster Recovery & Backup Strategy](docs/DISASTER_RECOVERY.md)
- [Security & RBAC Controls](docs/SECURITY.md)
- [Testing & Quality Assurance](docs/TESTING.md)
- [Environment Variables Guide](docs/ENVIRONMENT.md)

---

## Quickstart & Verification Commands

### 1. Run Automated Test Suite (6 Verification Suites)
```bash
npm test
```

### 2. Verify Data Migration to Firestore
```bash
npm run migrate:firestore
```

### 3. Production Build Check
```bash
npm run build
```

### 4. Start Server
```bash
# Development
npm run dev

# Production
NODE_ENV=production npm start
```
