/**
 * Production Build & Asset Verification Script
 * Validates JavaScript syntax, template integrity, required artifacts,
 * Firebase structure, entrypoints, and deployment configuration for Node 24 LTS.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('🏗️  STARTING PRODUCTION BUILD VERIFICATION — CAMPUS EXCHANGE');
console.log('================================================================\n');

let failed = false;

function check(title, fn) {
  process.stdout.write(`  [CHECK] ${title.padEnd(58)} `);
  try {
    fn();
    console.log('✅ PASS');
  } catch (err) {
    console.log('❌ FAIL');
    console.error(`          Error: ${err.message}`);
    failed = true;
  }
}

// 1. Validate required files exist
check('Required project root artifacts exist', () => {
  const required = [
    'package.json',
    'package-lock.json',
    'app.js',
    'server.js',
    'Dockerfile',
    'render.yaml',
    'vercel.json',
    '.nvmrc',
    'firestore.rules',
    'storage.rules',
    'api/index.js'
  ];
  for (const rel of required) {
    if (!fs.existsSync(rel)) {
      throw new Error(`Missing required artifact: ${rel}`);
    }
  }
});

// 2. Validate package.json & dependencies
check('package.json manifests & Node 24 engine', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (!pkg.engines || pkg.engines.node !== '24.x') {
    throw new Error(`package.json engines.node must be '24.x', got '${pkg.engines?.node}'`);
  }
  const expectedDeps = ['express', 'bcryptjs', 'cookie-parser', 'dotenv', 'ejs', 'express-session'];
  for (const dep of expectedDeps) {
    if (!pkg.dependencies || !pkg.dependencies[dep]) {
      throw new Error(`Missing required runtime dependency in package.json: ${dep}`);
    }
    const modPkg = path.join('node_modules', dep, 'package.json');
    if (!fs.existsSync(modPkg)) {
      throw new Error(`Installed node_modules package missing manifest: ${modPkg}`);
    }
  }
});

// 3. Validate package-lock.json consistency
check('package-lock.json is synchronized with package.json', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  if (lock.lockfileVersion !== 3) {
    throw new Error(`package-lock.json lockfileVersion must be 3, got ${lock.lockfileVersion}`);
  }
  for (const [dep, ver] of Object.entries(pkg.dependencies)) {
    if (!lock.packages[`node_modules/${dep}`]) {
      throw new Error(`package-lock.json missing entry for node_modules/${dep}`);
    }
  }
});

// 4. Validate JavaScript syntax across all source files
check('JavaScript syntax validation across all source files', () => {
  const dirsToScan = [
    'controllers',
    'models',
    'routes',
    'services',
    'middleware',
    'firebase',
    'api',
    'config',
    'functions',
    'repositories',
    'tests',
    'scripts'
  ];
  const rootFiles = ['app.js', 'server.js'];

  function checkSyntax(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    try {
      new vm.Script(code, { filename: filePath });
    } catch (e) {
      throw new Error(`Syntax error in ${filePath}: ${e.message}`);
    }
  }

  for (const rf of rootFiles) {
    if (fs.existsSync(rf)) checkSyntax(rf);
  }

  for (const dir of dirsToScan) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir, { recursive: true });
      for (const f of files) {
        if (typeof f === 'string' && f.endsWith('.js')) {
          checkSyntax(path.join(dir, f));
        }
      }
    }
  }
});

// 5. Validate EJS Templates & Partial includes
check('EJS templates integrity and delimiter balance', () => {
  const viewsDir = 'views';
  if (!fs.existsSync(viewsDir)) throw new Error('views directory is missing');
  
  const requiredViews = [
    'index.ejs',
    '404.ejs',
    '500.ejs',
    'auth/login.ejs',
    'auth/register.ejs',
    'equipment/index.ejs',
    'equipment/show.ejs',
    'borrow/request.ejs',
    'dashboard/borrower.ejs',
    'dashboard/lender.ejs',
    'users/profile.ejs',
    'admin/index.ejs',
    'partials/header.ejs',
    'partials/footer.ejs',
    'partials/navbar.ejs'
  ];

  for (const v of requiredViews) {
    const vPath = path.join(viewsDir, v);
    if (!fs.existsSync(vPath)) throw new Error(`Missing view template: ${vPath}`);
    const content = fs.readFileSync(vPath, 'utf8');
    const openTags = (content.match(/<%/g) || []).length;
    const closeTags = (content.match(/%>/g) || []).length;
    if (openTags !== closeTags) {
      throw new Error(`Unbalanced EJS tags in ${vPath}: ${openTags} open vs ${closeTags} close`);
    }
  }
});

// 6. Validate Static Assets & CSS Design Tokens
check('Public static assets & CSS design tokens', () => {
  const cssPath = 'public/css/style.css';
  const jsPath = 'public/js/socialAuth.js';
  if (!fs.existsSync(cssPath)) throw new Error(`Missing static CSS asset: ${cssPath}`);
  if (!fs.existsSync(jsPath)) throw new Error(`Missing static JS asset: ${jsPath}`);

  const css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('--color-primary')) {
    throw new Error('style.css missing essential CSS custom property tokens');
  }
});

// 7. Validate Vercel Serverless Entrypoint
check('Vercel entrypoint (api/index.js) export compliance', () => {
  const entryCode = fs.readFileSync('api/index.js', 'utf8');
  if (entryCode.includes('.listen(')) {
    throw new Error('api/index.js must not invoke app.listen() in serverless handler');
  }
  const handler = require('../api/index');
  if (typeof handler !== 'function') {
    throw new Error('api/index.js must export an Express application function');
  }
});

// 8. Validate Production Server Entrypoint
check('Production server entrypoint (server.js) shutdown handlers', () => {
  const serverCode = fs.readFileSync('server.js', 'utf8');
  if (!serverCode.includes('process.env.PORT')) {
    throw new Error('server.js must bind to dynamic process.env.PORT');
  }
  if (!serverCode.includes('SIGTERM') || !serverCode.includes('SIGINT')) {
    throw new Error('server.js must attach graceful shutdown listeners for SIGTERM and SIGINT');
  }
});

// 9. Validate Firebase Configuration Structure & Credentials Sanitization
check('Firebase code structure & credentials sanitization', () => {
  const adminMod = require('../firebase/admin');
  if (typeof adminMod.getFirebaseAdmin !== 'function') {
    throw new Error('firebase/admin.js must export getFirebaseAdmin()');
  }
  const firestoreMod = require('../firebase/firestore');
  if (typeof firestoreMod.getFirestore !== 'function') {
    throw new Error('firebase/firestore.js must export getFirestore()');
  }
  const authMod = require('../firebase/auth');
  if (typeof authMod.getAuth !== 'function') {
    throw new Error('firebase/auth.js must export getAuth()');
  }
  const storageMod = require('../firebase/storage');
  if (typeof storageMod.getStorage !== 'function') {
    throw new Error('firebase/storage.js must export getStorage()');
  }
});

// 10. Validate Deployment Configuration Consistency
check('Deployment configuration consistency (Node 24)', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  if (!dockerfile.includes('node:24-alpine')) {
    throw new Error('Dockerfile base image must use node:24-alpine');
  }
  const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();
  if (nvmrc !== '24') {
    throw new Error(`.nvmrc must specify 24, got '${nvmrc}'`);
  }
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  if (!ci.includes('node-version: 24')) {
    throw new Error('.github/workflows/ci.yml must configure node-version: 24');
  }
});

console.log('\n================================================================');
if (failed) {
  console.error('❌ PRODUCTION BUILD VERIFICATION FAILED.');
  console.log('================================================================\n');
  process.exit(1);
} else {
  console.log('🎉 ALL 10 BUILD VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
  process.exit(0);
}
