/**
 * Phase 6 UI/UX & Responsive Design Automated Verification Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runDesignVerification() {
  console.log('🧪 Starting Phase 6 UI/UX & Accessibility Verification Suite...\n');

  // 1. Viewport & Mobile Meta
  console.log('Test 1: Verifying Viewport & Mobile Meta Configuration...');
  const headerPath = path.join(__dirname, 'views', 'partials', 'header.ejs');
  const headerContent = fs.readFileSync(headerPath, 'utf8');
  assert(headerContent.includes('viewport'), 'Must include viewport meta tag');
  assert(headerContent.includes('width=device-width, initial-scale=1.0'), 'Must define standard initial scale');
  console.log('✅ Test 1 Passed: Mobile viewport metadata verified.\n');

  // 2. CSS Design Tokens & Breakpoints
  console.log('Test 2: Verifying CSS Tokens, Spacing Scale & Breakpoints...');
  const cssPath = path.join(__dirname, 'public', 'css', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Color tokens
  assert(css.includes('--color-primary: #2563EB'), 'Primary color token must be defined');
  assert(css.includes('--color-secondary: #0D9488'), 'Secondary color token must be defined');
  assert(css.includes('--color-success: #10B981'), 'Success color token must be defined');
  assert(css.includes('--color-warning: #F59E0B'), 'Warning color token must be defined');
  assert(css.includes('--color-error: #F43F5E'), 'Error color token must be defined');
  assert(css.includes('--color-surface: #FFFFFF'), 'Surface color token must be defined');
  assert(css.includes('--color-background: #F8FAFC'), 'Background color token must be defined');

  // Spacing scale
  assert(css.includes('--space-1: 4px'), '4px baseline spacing must be defined');
  assert(css.includes('--space-4: 16px'), '16px spacing must be defined');
  assert(css.includes('--space-6: 24px'), '24px spacing must be defined');
  assert(css.includes('--space-8: 32px'), '32px spacing must be defined');

  // Breakpoints & Mobile Safe Areas
  assert(css.includes('@media (max-width: 639px)'), 'Mobile breakpoint (<640px) must be defined');
  assert(css.includes('@media (min-width: 640px) and (max-width: 1024px)'), 'Tablet breakpoint (640-1024px) must be defined');
  assert(css.includes('@media (min-width: 1025px)'), 'Desktop breakpoint (1025px+) must be defined');
  assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'WCAG prefers-reduced-motion must be defined');
  assert(css.includes('env(safe-area-inset-bottom'), 'Must support mobile safe area insets in CSS');
  console.log('✅ Test 2 Passed: Design tokens & responsive breakpoints verified.\n');

  // 3. Navigation & Wayfinding
  console.log('Test 3: Verifying Role-Aware Navigation & Breadcrumbs...');
  const navbarPath = path.join(__dirname, 'views', 'partials', 'navbar.ejs');
  const navbar = fs.readFileSync(navbarPath, 'utf8');
  assert(navbar.includes('user.role === \'senior\' || user.role === \'admin\''), 'Must have role-aware Senior link');
  assert(navbar.includes('user.role === \'admin\''), 'Must have role-aware Admin link');
  assert(navbar.includes('role="search"'), 'Search bar must have ARIA search role');
  assert(navbar.includes('aria-current'), 'Active links must have aria-current');

  const bottomNavPath = path.join(__dirname, 'views', 'partials', 'bottom-nav.ejs');
  const bottomNav = fs.readFileSync(bottomNavPath, 'utf8');
  assert(bottomNav.includes('bottom-nav'), 'Mobile bottom navigation must be present');
  console.log('✅ Test 3 Passed: Role-aware navigation & wayfinding verified.\n');

  // 4. Form UX & Double Submission Protection
  console.log('Test 4: Verifying Form Loading States & JavaScript Protection...');
  const jsPath = path.join(__dirname, 'public', 'js', 'main.js');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert(js.includes('initFormLoadingStates'), 'Must have double-submission form guard');
  assert(js.includes('initDateConstraints'), 'Must enforce Sunday closure and date validation');
  assert(js.includes('initChatAssistant'), 'Must have AI assistant asynchronous chat logic');
  assert(js.includes('typing-dots'), 'Must have animated typing indicator for AI assistant');
  console.log('✅ Test 4 Passed: Client script UX and form loading guards verified.\n');

  // 5. Accessibility (ARIA & Semantic HTML)
  console.log('Test 5: Verifying Accessibility Semantics across Core Templates...');
  const showPath = path.join(__dirname, 'views', 'equipment', 'show.ejs');
  const showContent = fs.readFileSync(showPath, 'utf8');
  assert(showContent.includes('class="breadcrumbs"'), 'Equipment show must include breadcrumbs');
  assert(showContent.includes('aria-label="Breadcrumb"'), 'Breadcrumbs must have ARIA label');

  const chatPath = path.join(__dirname, 'views', 'chat', 'index.ejs');
  const chatContent = fs.readFileSync(chatPath, 'utf8');
  assert(chatContent.includes('role="log"'), 'Chat container must have role="log"');
  assert(chatContent.includes('aria-live="polite"'), 'Chat container must have aria-live="polite"');

  const reqPath = path.join(__dirname, 'views', 'borrow', 'request.ejs');
  const reqContent = fs.readFileSync(reqPath, 'utf8');
  assert(reqContent.includes('form-label-required'), 'Required form fields must be clearly indicated');
  console.log('✅ Test 5 Passed: Accessibility semantics verified.\n');

  // 6. Error Pages Protection (No Stack Traces)
  console.log('Test 6: Verifying Error Pages Safety...');
  const error500Path = path.join(__dirname, 'views', '500.ejs');
  const error500 = fs.readFileSync(error500Path, 'utf8');
  assert(!error500.includes('error.stack'), '500 page must never render raw stack traces to users');
  assert(error500.includes('Return to Safety'), '500 page must provide clear recovery options');
  console.log('✅ Test 6 Passed: Error states & security verified.\n');

  console.log('🎉 ALL 6 UI/UX & DESIGN VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runDesignVerification();
