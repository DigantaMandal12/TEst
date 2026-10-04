const app = require('./app');
const connectDB = require('./config/db');
const { seedInitialData } = require('./config/seedData');

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  try {
    await connectDB();
    if (isProd) {
      console.log('[PRODUCTION DB] Authoritative Cloud Firestore connected successfully.');
    } else {
      console.log('[FIREBASE] Connected to Cloud Firestore in local development mode.');
    }
  } catch (err) {
    console.error('[FATAL STARTUP ERROR] Failed to connect to Cloud Firestore:', err.message);
    if (isProd) process.exit(1);
  }

  try {
    await seedInitialData();
  } catch (err) {
    console.error('[SEED WARNING]:', err.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Campus Equipment Lending Exchange Server is Running`);
    console.log(`Environment:             ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server listening on:     http://localhost:${PORT}`);
    console.log(`Health Check Endpoint:   http://localhost:${PORT}/health`);
    console.log(`Smart Search:            http://localhost:${PORT}/search`);
    console.log(`Catalogue:               http://localhost:${PORT}/equipment`);
    console.log(`My Loans:                http://localhost:${PORT}/borrow/my-loans`);
    console.log(`Lender Dashboard:        http://localhost:${PORT}/borrow/lender`);
    console.log(`AI Hardware Assistant:   http://localhost:${PORT}/chatbot`);
    console.log(`====================================================`);
  });

  // Graceful shutdown handling for container termination
  function handleGracefulShutdown(signal) {
    console.log(`\n[SHUTDOWN] Received ${signal}. Initiating graceful termination sequence...`);
    server.close(async () => {
      console.log('[SHUTDOWN] HTTP server closed to incoming requests.');
      console.log('[SHUTDOWN] Cloud Firestore resources gracefully drained.');
      console.log('[SHUTDOWN] Clean exit complete.');
      process.exit(0);
    });

    // Enforce hard timeout if connections do not drain in 10s
    setTimeout(() => {
      console.error('[SHUTDOWN TIMEOUT] Forced shutdown triggered after 10s.');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
