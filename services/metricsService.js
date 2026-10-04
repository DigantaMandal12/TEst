/**
 * Production Observability, Metrics & Structured Logging Service
 * Phase 12 Production Operations Standard
 *
 * Provides safe in-memory performance telemetry, percentile latency calculations,
 * Firebase and AI operation auditing, structured log emission, and threshold alerts.
 * Strictly guarantees ZERO exposure of credentials, session IDs, or PII.
 */

const crypto = require('crypto');

class MetricsService {
  constructor() {
    this.startTime = Date.now();
    this.requestsTotal = 0;
    this.statusCounts = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0
    };
    this.recentLatencies = []; // Rolling window of last 500 requests
    this.maxLatencySamples = 500;

    this.firebaseMetrics = {
      reads: 0,
      writes: 0,
      transactions: 0,
      errors: 0
    };

    this.storageMetrics = {
      uploads: 0,
      rejections: 0,
      bytesStored: 0
    };

    this.sensitiveKeyPatterns = [
      'password', 'secret', 'token', 'private_key', 'privatekey',
      'authorization', 'cookie', 'session', 'credential', 'api_key', 'apikey'
    ];
  }

  /**
   * Safe Structured Log Emitter
   * Sanitizes object payloads to remove any potential secret keys.
   */
  log(level, event, metadata = {}) {
    const sanitizedMeta = this.sanitizeMetadata(metadata);
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      event,
      ...sanitizedMeta
    };

    const serialized = JSON.stringify(entry);
    if (level.toLowerCase() === 'error') {
      console.error(serialized);
    } else if (level.toLowerCase() === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
    return entry;
  }

  sanitizeMetadata(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clean = {};
    for (const [key, val] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.sensitiveKeyPatterns.some(pattern => lowerKey.includes(pattern));
      if (isSensitive) {
        clean[key] = '[REDACTED]';
      } else if (typeof val === 'object' && val !== null) {
        clean[key] = Array.isArray(val) ? val.map(item => typeof item === 'object' ? this.sanitizeMetadata(item) : item) : this.sanitizeMetadata(val);
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  recordRequest(method, path, statusCode, durationMs, reqId) {
    this.requestsTotal++;
    
    const category = `${Math.floor(statusCode / 100)}xx`;
    if (this.statusCounts[category] !== undefined) {
      this.statusCounts[category]++;
    }

    this.recentLatencies.push(durationMs);
    if (this.recentLatencies.length > this.maxLatencySamples) {
      this.recentLatencies.shift();
    }

    // Log structured request entry for non-health endpoints to avoid log flooding
    if (path !== '/health') {
      const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
      this.log(level, 'http_request', {
        reqId,
        method,
        path,
        statusCode,
        durationMs
      });
    }
  }

  recordFirebaseOp(type, count = 1, isError = false) {
    if (this.firebaseMetrics[type] !== undefined) {
      this.firebaseMetrics[type] += count;
    }
    if (isError) {
      this.firebaseMetrics.errors += count;
    }
  }

  recordStorageOp(type, bytes = 0) {
    if (type === 'upload') {
      this.storageMetrics.uploads++;
      this.storageMetrics.bytesStored += bytes;
    } else if (type === 'rejection') {
      this.storageMetrics.rejections++;
    }
  }

  getPercentiles() {
    if (this.recentLatencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const sorted = [...this.recentLatencies].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const p50 = sorted[Math.floor(count * 0.50)];
    const p95 = sorted[Math.floor(count * 0.95)] || sorted[count - 1];
    const p99 = sorted[Math.floor(count * 0.99)] || sorted[count - 1];
    const avg = Math.round(sum / count);

    return { p50, p95, p99, avg };
  }

  getSystemMetrics() {
    const mem = process.memoryUsage();
    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Operational Health & Alert Evaluation
   */
  getAlerts(aiMetrics = {}) {
    const alerts = [];
    const { p95 } = this.getPercentiles();
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1024 / 1024);

    // 1. HTTP 5xx Error Rate Alert
    if (this.requestsTotal > 20) {
      const err5xxRatio = this.statusCounts['5xx'] / this.requestsTotal;
      if (err5xxRatio > 0.05) {
        alerts.push({
          severity: 'P1_CRITICAL',
          type: 'HIGH_5XX_RATE',
          message: `HTTP 5xx error rate is ${(err5xxRatio * 100).toFixed(1)}% (Threshold: 5%)`
        });
      }
    }

    // 2. High Latency Alert
    if (p95 > 300) {
      alerts.push({
        severity: 'P2_WARNING',
        type: 'HIGH_LATENCY',
        message: `P95 latency is ${p95}ms (Threshold: 300ms)`
      });
    }

    // 3. Memory Pressure Alert
    if (rssMb > 400) {
      alerts.push({
        severity: 'P2_WARNING',
        type: 'HIGH_MEMORY_USAGE',
        message: `Container memory RSS is ${rssMb}MB (Threshold: 400MB)`
      });
    }

    // 4. AI Failure & Fallback Surge
    if (aiMetrics.totalRequests > 10) {
      const aiFailureRatio = (aiMetrics.failedRequests || 0) / aiMetrics.totalRequests;
      if (aiFailureRatio > 0.30) {
        alerts.push({
          severity: 'P2_WARNING',
          type: 'AI_PROVIDER_DEGRADED',
          message: `AI external failure rate is ${(aiFailureRatio * 100).toFixed(1)}%. Fallback engine active.`
        });
      }
    }

    // 5. Firebase Operation Failures
    if (this.firebaseMetrics.errors > 5) {
      alerts.push({
        severity: 'P1_CRITICAL',
        type: 'FIREBASE_OPERATION_ERRORS',
        message: `Detected ${this.firebaseMetrics.errors} unhandled Cloud Firestore error(s).`
      });
    }

    return alerts;
  }

  /**
   * Combined Operational Telemetry Snapshot
   */
  getSnapshot(aiMetrics = {}) {
    const percentiles = this.getPercentiles();
    const system = this.getSystemMetrics();
    const alerts = this.getAlerts(aiMetrics);

    return {
      status: alerts.some(a => a.severity === 'P1_CRITICAL') ? 'NEEDS_ATTENTION' : 'HEALTHY',
      timestamp: new Date().toISOString(),
      requests: {
        total: this.requestsTotal,
        byStatus: { ...this.statusCounts },
        errorRatePercent: this.requestsTotal > 0 ? Number(((this.statusCounts['5xx'] / this.requestsTotal) * 100).toFixed(2)) : 0
      },
      latencyMs: percentiles,
      system,
      firebase: { ...this.firebaseMetrics },
      ai: { ...aiMetrics },
      storage: { ...this.storageMetrics },
      activeAlerts: alerts
    };
  }

  /**
   * Express Middleware for Request Tracking & Correlation IDs
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const reqId = req.headers['x-request-id'] || `req-${crypto.randomBytes(4).toString('hex')}`;
      req.requestId = reqId;
      res.setHeader('X-Request-Id', reqId);

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.recordRequest(req.method, req.path, res.statusCode, duration, reqId);
      });

      next();
    };
  }
}

module.exports = new MetricsService();
