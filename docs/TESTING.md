# Testing & Quality Assurance Documentation

## 1. Test Architecture Overview
The application maintains a zero-dependency, automated verification suite that runs across all layers of the stack without requiring external internet access or third-party test runners.

```
                              TEST RUNNER (`npm test`)
                                         │
        ┌───────────────────┬────────────┴───────┬───────────────────┐
        ▼                   ▼                    ▼                   ▼
Workflow Tests      View & Route Tests   Lifecycle E2E Tests  AI Assistant Tests
`test_workflow.js`  `test_app_views.js`  `test_lifecycle.js`  `test_ai_security.js`
```

---

## 2. Test Suites

### 2.1 Workflow Integration (`test_workflow.js`)
Validates business logic and campus configuration rules:
- **Test 1**: Verifies presence of at least 6 canonical campus pickup locations (Electrical Lab, Computer Lab, Central Library, etc.).
- **Test 2**: Validates 30-minute standard pickup slots (2:00 PM – 4:30 PM).
- **Test 3**: Enforces Sunday closure rule (`getDay() === 0 -> isAvailable: false`).
- **Test 4**: Verifies buyer and seller notification template formatting.
- **Test 5**: Tests order number uniqueness and timeslot collision prevention.

### 2.2 End-to-End View & Routing (`test_app_views.js`)
Validates HTTP endpoints, response status codes, view rendering, and CSS design tokens:
- **CSS Tokens**: Verifies `:root` CSS custom properties, WCAG AA tokens, and reduced-motion media query rules.
- **Catalog & Department Filtering**: Tests full catalogue browsing and department-specific filtering (`Mechanical`, `Civil`, `Electrical`, `Survey`, `Other`).
- **Details & Forms**: Validates equipment detail specs, deposit indicators, and pickup booking forms.
- **Role Dashboards**: Verifies borrower loan views, lender custodian dashboards, and admin panels.
- **Error Handling**: Tests 404 template rendering on non-existent routes.

### 2.3 Full Borrowing-to-Return Lifecycle (`test_lifecycle.js`)
Simulates the entire student and senior user journey:
1. Student browses available items.
2. Student books a pickup slot and submits a borrow request (Order status: `pending`).
3. Senior custodian inspects and approves the reservation (Order status: `approved`, buyer notification generated).
4. Physical collection confirmed at pickup station (Order status: `active`).
5. Equipment returned and inspected, deposit refund recorded (Order status: `returned`, deposit refunded).
6. Peer rating and review submitted, updating cumulative Trust Score.

### 2.4 AI Assistant & Zero-Hallucination Guard (`test_ai_security.js`)
Tests the database-aware AI Hardware Assistant:
- Verifies campus pickup policy explanation.
- Verifies deposit and Trust Score calculation guidance.
- Verifies real-time database queries returning active catalog equipment.
- Verifies the zero-hallucination guard against non-existent hardware.

---

## 3. Running the Test Suite

```bash
# Run all 4 automated test suites
npm test

# Run production build validation
npm run build
```
