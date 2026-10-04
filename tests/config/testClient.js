process.env.ALLOW_DEMO_LOGIN = 'false';
const http = require('http');
const app = require('../../app');
const { ACCOUNTS } = require('./testAccounts');

class TestClient {
  constructor() {
    this.server = null;
    this.port = null;
    this.baseUrl = '';
  }

  async start() {
    if (this.server) return;
    this.port = 15000 + Math.floor(Math.random() * 8000);
    this.server = http.createServer(app);
    await new Promise((resolve) => this.server.listen(this.port, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${this.port}`;
  }

  async stop() {
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
  }

  request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const reqHeaders = Object.assign({
        'X-Forwarded-Proto': 'https',
        'Host': `127.0.0.1:${this.port}`
      }, options.headers || {});

      if (options.cookie) {
        reqHeaders['Cookie'] = options.cookie;
      }

      const reqOpts = {
        method: options.method || 'GET',
        headers: reqHeaders
      };

      const req = http.request(url, reqOpts, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (e) {}

          const rawCookies = res.headers['set-cookie'];
          const cookie = rawCookies ? rawCookies[0].split(';')[0] : options.cookie;

          resolve({
            status: res.statusCode,
            statusCode: res.statusCode,
            headers: res.headers,
            body,
            json,
            cookie
          });
        });
      });

      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async loginAs(accountKey) {
    const account = ACCOUNTS[accountKey];
    if (!account) throw new Error(`Unknown test account key: ${accountKey}`);

    const body = `email=${encodeURIComponent(account.email)}&password=${encodeURIComponent(account.password)}`;
    const res = await this.request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });

    if (res.status !== 302 || !res.cookie) {
      throw new Error(`Failed to login as ${account.email} - status: ${res.status}`);
    }

    return res.cookie;
  }
}

module.exports = TestClient;
