/**
 * Vercel Serverless Function Entry Point
 * Mounts the Express application onto Vercel Functions.
 * Long-running server lifecycle (app.listen) is bypassed.
 */

const connectDB = require('../config/db');
const app = require('../app');

// Initialize database / Firebase Admin upon cold start
connectDB().catch(err => {
  console.warn('[VERCEL STARTUP DB NOTICE]', err.message);
});

module.exports = app;
