# Campus Equipment Lending Exchange — Architecture Specification

## 1. System Overview
The Campus Equipment Lending Exchange is a full-stack web application designed for collegiate departments, academic laboratories, and student peer groups to list, discover, borrow, return, and inspect academic and engineering hardware.

```
                              CLIENT TIER
                 ┌───────────────────────────────────┐
                 │ Browser (Mobile, Tablet, Desktop) │
                 │ HTML5 / CSS3 Tokens / Vanilla JS  │
                 └─────────────────┬─────────────────┘
                                   │ HTTPS / TLS
                                   ▼
                             SECURITY TIER
                 ┌───────────────────────────────────┐
                 │ Security Headers (CSP, HSTS, XFO) │
                 │ In-Memory Rate Limiting           │
                 │ Input Sanitization Middleware     │
                 └─────────────────┬─────────────────┘
                                   │
                                   ▼
                            APPLICATION TIER
                 ┌───────────────────────────────────┐
                 │ Node.js & Express Application     │
                 │ Session Management (Connect-Mongo)│
                 │ Role-Based Access Control (RBAC)  │
                 │ Controllers (Borrow, Equip, Auth) │
                 │ EJS Component & View Rendering    │
                 └───────┬───────────────────┬───────┘
                         │                   │
                         ▼                   ▼
                   DATABASE TIER        AI GATEWAY
             ┌──────────────────────┐  ┌──────────────────┐
             │ MongoDB / Mongoose   │  │ Server AI Proxy  │
             │ Persistent Collections│  │ OpenRouter HTTPS │
             │ (Users, Equip, Orders│  │ Minimal DB Data  │
             │  Reviews, Notifs)    │  │ (Zero Client Key)│
             └──────────────────────┘  └──────────────────┘
```

---

## 2. Layered Architecture

### 2.1 Presentation Layer (Views & Static Assets)
- **View Engine**: EJS templates partitioned into reusable partials (`navbar.ejs`, `bottom-nav.ejs`, `timeline.ejs`, `badge.ejs`, `flash.ejs`).
- **Styling**: `public/css/style.css` built on an ergonomic CSS token design system:
  - Responsive layouts: Mobile (`<640px`) with fixed bottom navigation bar, Tablet (`640px–1024px`), Desktop (`>1024px`).
  - Accessibility: WCAG AA color contrast, explicit `:focus-visible` styling, semantic markup, and `prefers-reduced-motion` compliance.
- **Client Scripting**: `public/js/main.js` provides instant search filtering, modal controls, and active route synchronization.

### 2.2 Application & Business Logic Layer
- **`app.js`**: Core Express bootstrap mounting security headers, session store, parser limits, and domain routes.
- **Controllers**:
  - `equipmentController.js`: Catalog queries, category aggregation, and item CRUD.
  - `borrowController.js`: Request intake, Sunday guard, pickup slot collision prevention, senior approval, and return deposit refunds.
  - `authController.js`: Registration, password hashing, session issuance, and logout.
  - `chatController.js`: AI Hardware Assistant API adapter.
  - `notificationController.js`: Activity notifications and order status updates.
  - `adminController.js`: Centralized catalog oversight and Trust Score auditing.

### 2.3 Persistence & Data Layer
- **Mongoose ODM**: Strongly typed schema models (`User`, `Equipment`, `BorrowRequest`, `Review`, `Notification`).
- **Connection Strategy**: `config/db.js` provides cached connection pooling for MongoDB/MongoDB Atlas with automated fallback to resilient in-memory storage for offline development and local environments.

### 2.4 AI Assistant Layer
- **`services/aiService.js`**:
  - Server-side trusted proxy ensuring zero exposure of `OPENROUTER_API_KEY` to the client.
  - Least-privilege data injection: Queries only active available equipment and borrowing policies.
  - Zero-hallucination guarantee: Returns explicit unavailable status when queried items do not exist in campus inventory.
