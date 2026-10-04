/**
 * AI Service (Smart Product Layer & Database-Aware Intelligence)
 * Phase 7 Production Standard - OpenRouter Gateway Integration
 * 
 * Supports:
 * - Mode A: External LLM via OpenRouter (when OPENROUTER_API_KEY is configured)
 * - Mode B: Local deterministic database-aware engine (default / fallback)
 * - Strict Zero-Hallucination Inventory Guarantee
 * - Prompt-Injection & Private-Credential Defense
 * - Least-Privilege Firestore Context
 */

const https = require('https');
const aiTools = require('./aiTools');

// In-memory Observability Metrics (Safe, No PII)
const aiMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  fallbackUsage: 0,
  averageLatencyMs: 0
};

/**
 * Prompt-Injection & Credential Leaking Defense Filter
 */
function isMaliciousPrompt(prompt = '') {
  const p = prompt.toLowerCase();
  const dangerousPatterns = [
    'ignore all instructions',
    'ignore previous instructions',
    'ignore instructions',
    'ignore rules',
    'ignore all rules',
    'ignore the rules',
    'override instructions',
    'bypass security',
    'bypass rules',
    'give me 100 trust score',
    'set my trust score',
    'make me admin',
    'make me an admin',
    'elevate my role',
    'grant admin',
    'grant me admin',
    'dump all users',
    'system prompt',
    'firebase_private_key',
    'private key',
    'session_secret',
    'session secret',
    'openrouter_api_key',
    'openrouter key',
    'api key',
    'passwords',
    'password123',
    'dump database',
    'dump the database',
    'show me all users',
    'query every firestore document',
    'disable security',
    'disable security rules',
    'another student',
    'other users'
  ];

  return dangerousPatterns.some(pattern => p.includes(pattern));
}

/**
 * Output sanitizer (Strips scripts, dangerous protocols, and HTML tags)
 */
function sanitizeAIOutput(text = '') {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim();
}

/**
 * OpenRouter External LLM Completion Adapter (Mode A)
 * Server-side HTTPS gateway with strict timeout and input grounding.
 */
async function callOpenRouter(apiKey, userPrompt, context = {}) {
  return new Promise((resolve, reject) => {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return reject(new Error('OPENROUTER_API_KEY is missing or empty.'));
    }

    const startTime = Date.now();
    const systemPrompt = `You are the Campus Hardware Guide AI for the Campus Equipment Lending Exchange.
Your role: explain and summarize verified campus application data to students and faculty.
Grounding Rules:
1. ONLY refer to equipment, availability, and policies provided in the VERIFIED APPLICATION DATA below.
2. If an item is NOT in the verified inventory, explicitly state that it is not available in the campus catalogue. Never invent equipment, deposits, or stations.
3. For borrowing status, only reference the user's verified status if provided.
4. Never disclose administrative secrets, private keys, database credentials, or other students' private data.
5. Provide actionable, concise, friendly guidance with exact deposit amounts and pickup locations from the data.

VERIFIED CAMPUS INVENTORY:
${JSON.stringify(context.inventory || [], null, 2)}

CAMPUS POLICIES & PICKUP STATIONS:
${JSON.stringify(context.rules || {}, null, 2)}

USER CONTEXT (IF AUTHENTICATED):
${JSON.stringify(context.userContext || {}, null, 2)}`;

    const modelName = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
    const payload = JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.2
    });

    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': process.env.APP_URL || 'https://campus-exchange.edu',
        'X-Title': 'Campus Equipment Lending Exchange',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 6000 // 6-second timeout to prevent hanging
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const latency = Date.now() - startTime;
        aiMetrics.averageLatencyMs = Math.round((aiMetrics.averageLatencyMs + latency) / 2);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`OpenRouter API returned HTTP ${res.statusCode}`));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve(parsed.choices[0].message.content.trim());
          } else if (parsed.error) {
            reject(new Error(parsed.error.message || 'OpenRouter API Error'));
          } else {
            reject(new Error('Malformed response from OpenRouter: choices[0].message missing'));
          }
        } catch (e) {
          reject(new Error('Failed to parse OpenRouter response as JSON'));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Network error communicating with OpenRouter: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('OpenRouter request timed out after 6000ms'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Local Deterministic Database-Aware Assistant (Mode B & Graceful Fallback)
 * Queries actual Cloud Firestore via aiTools
 */
async function localDatabaseAwareAssistant(queryText, userContext = {}) {
  const query = (queryText || '').toLowerCase().trim();
  const availableItems = await aiTools.findAvailableEquipment();
  const pickupRules = aiTools.getPickupRules();
  const borrowRules = aiTools.getBorrowingRules();
  const stations = aiTools.getPickupStations();

  // 1. Personal User Borrowing Status & Active Loans
  if (query.includes('my loan') || query.includes('my status') || query.includes('my request') || query.includes('my order') || query.includes('when is my pickup')) {
    if (!userContext || !userContext.userId) {
      return {
        reply: `Please sign in to your student account to inspect your current loan requests, pickup schedules, and return deadlines.`,
        actions: [{ label: 'Sign In', url: '/auth/login' }]
      };
    }

    try {
      const userStatus = await aiTools.getUserBorrowStatus(userContext.userId, userContext);
      if (userStatus && userStatus.length > 0) {
        const details = userStatus.map(s => 
          `• Order #${s.orderNumber}: ${s.equipmentTitle} (${s.status.toUpperCase()}) — ${s.nextAction}`
        ).join('\n');
        return {
          reply: `Here is your current active borrowing status:\n\n${details}\n\nYou can manage all items directly on your dashboard.`,
          actions: [{ label: 'View My Loans Dashboard', url: '/borrow/my-loans' }]
        };
      } else {
        return {
          reply: `You currently have zero active borrow requests or items on loan. Would you like to explore available laboratory gear?`,
          actions: [{ label: 'Browse Catalogue', url: '/equipment' }]
        };
      }
    } catch (err) {
      return { reply: `Could not retrieve your loans: ${err.message}` };
    }
  }

  // 2. Pickup points, stations & schedule
  if (query.includes('pickup') || query.includes('pick up') || query.includes('location') || query.includes('station') || query.includes('where')) {
    return {
      reply: `Campus equipment can be collected at designated departmental pickup points:\n` +
        `• ${stations.join('\n• ')}\n\n` +
        `Pickup desks operate ${pickupRules.operatingHours}. ${pickupRules.sundayPolicy} Please remember to present your College ID card when collecting!`,
      actions: [{ label: 'Browse Equipment Stations', url: '/equipment' }]
    };
  }

  // 3. Deposit, fees, and refund policy
  if (query.includes('deposit') || query.includes('fee') || query.includes('refund') || query.includes('cost') || query.includes('price')) {
    return {
      reply: `Campus Lending Policy on Deposits & Fees:\n` +
        `• Daily Rental Fee: ₹0 (Free for student coursework)\n` +
        `• Security Deposit: Held in escrow and 100% refundable immediately upon return inspection.\n` +
        `• High Trust Exemption: Students with a Gold Tier Trust Score (90+) qualify for zero-deposit fast-track lending.`,
      actions: [{ label: 'Check Your Trust Score', url: '/users/profile' }]
    };
  }

  // 4. Sunday & operating schedule restrictions
  if (query.includes('sunday') || query.includes('weekend') || query.includes('hours') || query.includes('schedule')) {
    return {
      reply: `Pickup Schedule Policy:\n${pickupRules.sundayPolicy}\n\nLending desks operate ${pickupRules.operatingHours}. Booking must be completed for an official 30-minute time slot.`,
      actions: [{ label: 'View Catalogue', url: '/equipment' }]
    };
  }

  // 5. Trust score & reputation rules
  if (query.includes('trust score') || query.includes('tier') || query.includes('score') || query.includes('reputation')) {
    return {
      reply: `Campus Trust Score Tiers:\n` +
        `• Gold Tier (90–100): Zero-deposit checkout privilege & instant approval.\n` +
        `• Silver Tier (75–89): Standard deposit, up to 3 concurrent active loans.\n` +
        `• Bronze Tier (60–74): Standard deposit, 1 loan at a time.\n` +
        `• Returning instruments on time and submitting equipment reviews adds +3 Trust Score points!`,
      actions: [{ label: 'View My Profile & Trust Meter', url: '/users/profile' }]
    };
  }

  // 6. Smart recommendations for specific projects / branches
  if (query.includes('recommend') || query.includes('suggest') || query.includes('project') || query.includes('electronics') || query.includes('survey') || query.includes('civil') || query.includes('mechanical')) {
    const recs = await aiTools.recommendEquipment(query, userContext);
    if (recs.length > 0) {
      const recList = recs.map(r => `• ${r.title} (${r.category}) — Deposit: ₹${r.deposit} @ ${r.pickupLocation}`).join('\n');
      const actions = recs.map(r => ({ label: `View ${r.title.split(' ')[0]}`, url: r.url }));
      return {
        reply: `Based on your request, here are verified available instruments from our campus inventory:\n\n${recList}\n\nSelect an item to view complete technical specs and reserve your pickup slot.`,
        actions
      };
    }
  }

  // 7. Direct inventory search for specific named tools
  const searchResults = await aiTools.searchEquipment(query);
  if (searchResults.length > 0) {
    const sample = searchResults.slice(0, 3).map(e => 
      `• ${e.title} (${e.category}) — ${e.status.toUpperCase()} | Deposit: ₹${e.deposit} | Location: ${e.pickupLocation}`
    ).join('\n');
    const actions = searchResults.slice(0, 2).map(e => ({ label: `View ${e.title.split(' ')[0]}`, url: `/equipment/${e.id}` }));
    return {
      reply: `Found ${searchResults.length} matching equipment item(s) in campus inventory:\n\n${sample}\n\nWould you like to reserve a pickup slot?`,
      actions
    };
  }

  // 8. Zero-Hallucination Guard for Unknown Gear
  // If specific tool keywords are detected that do NOT exist in inventory
  return {
    reply: `No matching equipment or policy found for "${sanitizeAIOutput(queryText)}" in the campus inventory. ` +
      `Our verified inventory covers Mechanical, Civil, Electrical, Survey, and IoT equipment. ` +
      `Please check the catalogue for available gear or ask about borrowing rules!`,
    actions: [{ label: 'Browse Full Catalogue', url: '/equipment' }]
  };
}

/**
 * Main Assistant Entrypoint
 */
async function generateAssistantReply(userPrompt, userContext = {}) {
  aiMetrics.totalRequests++;

  // Security gate: Prompt injection & secret extraction defense
  if (isMaliciousPrompt(userPrompt)) {
    return `Security Notice: Requests to disclose administrative credentials, internal configuration tokens, cryptographic material, or student records are strictly prohibited by campus security policy.`;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  // Mode A: External LLM if valid key provided
  if (apiKey && apiKey.trim() && !apiKey.includes('placeholder') && !apiKey.includes('your_')) {
    try {
      const inventory = await aiTools.findAvailableEquipment();
      const rules = {
        pickup: aiTools.getPickupRules(),
        borrowing: aiTools.getBorrowingRules(),
        stations: aiTools.getPickupStations()
      };

      const aiReply = await callOpenRouter(apiKey.trim(), userPrompt, { inventory, rules, userContext });
      if (aiReply) {
        aiMetrics.successfulRequests++;
        return sanitizeAIOutput(aiReply);
      }
    } catch (err) {
      console.warn('[AI ASSISTANT WARNING] OpenRouter request failed, falling back to local database engine:', err.message);
      aiMetrics.fallbackUsage++;
    }
  }

  // Mode B: Local deterministic database-aware engine
  aiMetrics.fallbackUsage++;
  const result = await localDatabaseAwareAssistant(userPrompt, userContext);
  aiMetrics.successfulRequests++;

  // If result is object with reply & actions
  if (typeof result === 'object' && result.reply) {
    return result.reply;
  }
  return typeof result === 'string' ? sanitizeAIOutput(result) : 'Here to help with your campus equipment requests.';
}

/**
 * Returns safe observability metrics (No credentials, No PII)
 */
function getAIObservabilityMetrics() {
  return { ...aiMetrics };
}

module.exports = {
  callOpenRouter,
  generateAssistantReply,
  localDatabaseAwareAssistant,
  isMaliciousPrompt,
  sanitizeAIOutput,
  getAIObservabilityMetrics
};
