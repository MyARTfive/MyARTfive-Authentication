/**
 * My ARTfive! (Authentication!)
 * Own auth + Neon PostgreSQL permanent storage
 * Owner: email + password
 * Business: phone + password
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = process.env.PORT || 4000;
const SECRET = process.env.AUTH_SECRET || 'myartfive-auth-secret-change-me-in-production';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Add it in Render Environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function createToken(user) {
  const payload = {
    id: user.id,
    role: user.account_type === 'owner' ? 'admin' : 'business',
    exp: Date.now() + 15 * 60 * 1000
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyToken(token) {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
  });
  res.end(JSON.stringify(data, null, 2));
}

function getBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

async function getAuthUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const r = await pool.query(
    'SELECT * FROM my_artfive.accounts WHERE id = $1 LIMIT 1',
    [payload.id]
  );
  if (!r.rows[0]) return null;
  const u = r.rows[0];
  return {
    id: u.id,
    role: u.account_type === 'owner' ? 'admin' : 'business',
    account_type: u.account_type,
    email: u.email,
    phone: u.mobile_number,
    company_name: u.company_name,
    name: u.company_name || u.email || u.mobile_number,
    allowed: u.account_status === 'active',
    account_status: u.account_status
  };
}

async function ensureOwner() {
  const existing = await pool.query(
    "SELECT id FROM my_artfive.accounts WHERE account_type = 'owner' LIMIT 1"
  );
  if (existing.rows.length) return;
  const password_hash = hashPassword('Admin@123');
  await pool.query(
    `INSERT INTO my_artfive.accounts
      (email, mobile_number, company_name, password_hash, account_type, account_status)
     VALUES ($1, NULL, NULL, $2, 'owner', 'active')`,
    ['admin@myartfive.com', password_hash]
  );
  console.log('Owner ready → admin@myartfive.com / Admin@123');
}

const DEFAULT_SETTINGS = {
  upi: '8859063256',
  qr_image: '/qr-demo.png',
  bill: 'No bill yet. Your bill will appear here.',
  update_text: 'No new app update yet.',
  auto_notification: 'Welcome. Your My ARTfive! account is active.',
  manual_notification: 'No new message from admin.',
  subscribers: 0,
  ratings: 0,
  downloads: 0,
  admin_menu: [
    { id: 'home', title: '1. Dashboard Home', description: 'Welcome to My Dashboard. Only you can open this.' },
    { id: 'businesses', title: '2. Businesses / Companies', description: 'Every registered company.' },
    { id: 'allow', title: '3. Allow / Deny Login', description: 'Allow or stop a company from logging in.' },
    { id: 'reset', title: '4. Reset Password', description: 'Reset a company password, or change your own email and password.' },
    { id: 'notifications', title: '5. Notifications', description: 'Automatic notice and the message you send.' },
    { id: 'payment', title: '6. Payment Settings (UPI + QR)', description: 'UPI number and QR photo shown to companies.' },
    { id: 'bill', title: '7. Send Bill', description: 'The bill text companies see.' },
    { id: 'analysis', title: '8. App Analysis', description: 'Counts of companies and users.' },
    { id: 'updates', title: '9. App Updates', description: 'New features text shown to companies.' },
    { id: 'view', title: '10. View Business Dashboard', description: 'See the company screen, then come back here. No company login needed.' },
    { id: 'all-edit', title: '11. All Edit', description: 'Change names and descriptions of every menu.' }
  ],
  business_menu: [
    { id: 'home', title: '1. Home', description: 'Your company home.' },
    { id: 'account', title: '2. My Account', description: 'Your company name and phone.' },
    { id: 'payments', title: '3. Payments (UPI + QR)', description: 'Pay using this UPI number or QR.' },
    { id: 'bill', title: '4. My Bill', description: 'Bill sent by admin.' },
    { id: 'notifications', title: '5. Notifications', description: 'Messages from My ARTfive!' },
    { id: 'updates', title: '6. New App Update', description: 'New features added to the app.' }
  ]
};

async function ensureSettings() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_artfive.app_settings (
      id INT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
  const found = await pool.query('SELECT data FROM my_artfive.app_settings WHERE id = 1');
  if (!found.rows.length) {
    await pool.query('INSERT INTO my_artfive.app_settings (id, data) VALUES (1, $1::jsonb)', [JSON.stringify(DEFAULT_SETTINGS)]);
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  return { ...DEFAULT_SETTINGS, ...found.rows[0].data };
}

async function saveSettings(next) {
  const current = await ensureSettings();
  const merged = { ...current, ...next };
  await pool.query('UPDATE my_artfive.app_settings SET data = $1::jsonb WHERE id = 1', [JSON.stringify(merged)]);
  return merged;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
    });
    return res.end();
  }

  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;

  try {
    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (p === '/css/style.css' || p === '/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'style.css')));
    }
    if (p === '/js/app.js' || p === '/app.js') {
      let js = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
      js = js.replace("const API = 'http://localhost:4000/api';", "const API = '/api';");
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      return res.end(js);
    }

    if (p === '/qr-demo.png') {
      const file = path.join(__dirname, 'qr-demo.png');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
      return res.end(fs.readFileSync(file));
    }
    if (p === '/api/health') {
      let db = 'ok';
      try {
        await pool.query('SELECT 1');
      } catch {
        db = 'error';
      }
      return json(res, 200, {
        success: true,
        app: 'My ARTfive!',
        subtitle: '(Authentication!)',
        type: 'Authentication as a Service',
        version: '2.0.0',
        status: 'running',
        database: db
      });
    }

    // Register business
    if (p === '/api/auth/register' && req.method === 'POST') {
      const body = await getBody(req);
      const company_name = (body.company_name || '').trim();
      const phone = (body.phone || '').trim();
      const password = body.password || '';

      if (!company_name) return json(res, 400, { success: false, error: 'Company / Business name is required' });
      if (!phone || phone.length < 10) return json(res, 400, { success: false, error: 'Valid phone number required' });
      if (password.length < 6) return json(res, 400, { success: false, error: 'Password must be at least 6 characters' });

      const exists = await pool.query(
        'SELECT id FROM my_artfive.accounts WHERE mobile_number = $1 LIMIT 1',
        [phone]
      );
      if (exists.rows.length) {
        return json(res, 400, { success: false, error: 'This phone number is already registered' });
      }

      const password_hash = hashPassword(password);
      const inserted = await pool.query(
        `INSERT INTO my_artfive.accounts
          (email, mobile_number, company_name, password_hash, account_type, account_status)
         VALUES (NULL, $1, $2, $3, 'business', 'active')
         RETURNING id, mobile_number, company_name, account_type`,
        [phone, company_name, password_hash]
      );
      const user = inserted.rows[0];
      return json(res, 201, {
        success: true,
        message: 'Business registered successfully. Please login.',
        user: {
          id: user.id,
          company_name: user.company_name,
          phone: user.mobile_number,
          role: 'business'
        }
      });
    }

    // Login
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await getBody(req);
      const isAdmin = body.type === 'admin';
      const identifier = (body.identifier || '').trim();
      const password = body.password || '';

      let result;
      if (isAdmin) {
        result = await pool.query(
          `SELECT * FROM my_artfive.accounts
           WHERE account_type = 'owner' AND email = $1
           LIMIT 1`,
          [identifier]
        );
      } else {
        result = await pool.query(
          `SELECT * FROM my_artfive.accounts
           WHERE account_type = 'business' AND mobile_number = $1
           LIMIT 1`,
          [identifier]
        );
      }

      const user = result.rows[0];
      if (!user) return json(res, 401, { success: false, error: 'Invalid credentials' });
      if (user.account_status !== 'active') {
        return json(res, 403, { success: false, error: 'Account disabled by Admin' });
      }
      if (!verifyPassword(password, user.password_hash)) {
        return json(res, 401, { success: false, error: 'Invalid credentials' });
      }

      const role = user.account_type === 'owner' ? 'admin' : 'business';
      const token = createToken(user);

      // save session hash (optional audit)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query(
        `INSERT INTO my_artfive.sessions (account_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
        [user.id, tokenHash]
      );

      return json(res, 200, {
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          role,
          name: user.company_name || user.email || user.mobile_number,
          email: user.email,
          phone: user.mobile_number,
          company_name: user.company_name || null
        },
        expires_in_minutes: 15
      });
    }

    if (p === '/api/auth/me') {
      const user = await getAuthUser(req);
      if (!user) return json(res, 401, { success: false, error: 'Please login again' });
      return json(res, 200, {
        success: true,
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          email: user.email,
          phone: user.phone,
          company_name: user.company_name,
          subscribed: false
        }
      });
    }

    if (p === '/api/auth/logout' && req.method === 'POST') {
      return json(res, 200, { success: true, message: 'Logged out' });
    }

    if (p === '/api/analysis') {
      const count = await pool.query(
        "SELECT COUNT(*)::int AS c FROM my_artfive.accounts WHERE account_type = 'business'"
      );
      const c = count.rows[0].c;
      return json(res, 200, {
        success: true,
        data: {
          companies: c,
          subscribers: 0,
          ratings: 0,
          users: c,
          downloads: 0
        }
      });
    }

    if (p === '/api/settings') {
      const s = await ensureSettings();
      return json(res, 200, {
        success: true,
        upi: s.upi,
        qr_image: s.qr_image,
        bill: s.bill,
        update_text: s.update_text,
        auto_notification: s.auto_notification,
        manual_notification: s.manual_notification,
        business_menu: s.business_menu,
        subscribers: s.subscribers,
        ratings: s.ratings,
        downloads: s.downloads
      });
    }

    // Admin routes
    if (p.startsWith('/api/admin')) {
      const adminUser = await getAuthUser(req);
      if (!adminUser || adminUser.role !== 'admin') {
        return json(res, 403, { success: false, error: 'Admin access only' });
      }

      if (p === '/api/admin/businesses') {
        const list = await pool.query(
          `SELECT id, company_name, mobile_number, account_status, created_at
           FROM my_artfive.accounts
           WHERE account_type = 'business'
           ORDER BY created_at DESC`
        );
        const businesses = list.rows.map(u => ({
          id: u.id,
          company_name: u.company_name,
          name: u.company_name,
          phone: u.mobile_number,
          allowed: u.account_status === 'active',
          subscribed: false,
          created_at: u.created_at
        }));
        return json(res, 200, { success: true, count: businesses.length, businesses });
      }

      if (p === '/api/admin/allow' && req.method === 'POST') {
        const body = await getBody(req);
        const status = body.allowed ? 'active' : 'disabled';
        const r = await pool.query(
          `UPDATE my_artfive.accounts
           SET account_status = $1, updated_at = NOW()
           WHERE id = $2 AND account_type = 'business'
           RETURNING id`,
          [status, body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'User not found' });
        return json(res, 200, { success: true, message: body.allowed ? 'Allowed' : 'Denied' });
      }

      // Admin reset business password
      if (p === '/api/admin/reset-password' && req.method === 'POST') {
        const body = await getBody(req);
        const newPassword = body.password || '';
        if (newPassword.length < 6) {
          return json(res, 400, { success: false, error: 'Password must be at least 6 characters' });
        }
        const password_hash = hashPassword(newPassword);
        const r = await pool.query(
          `UPDATE my_artfive.accounts
           SET password_hash = $1, updated_at = NOW()
           WHERE id = $2 AND account_type = 'business'
           RETURNING id`,
          [password_hash, body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'User not found' });
        await pool.query(
          `INSERT INTO my_artfive.password_resets (account_id, token_hash, expires_at, used_at)
           VALUES ($1, $2, NOW(), NOW())`,
          [body.user_id, crypto.randomBytes(16).toString('hex')]
        );
        return json(res, 200, { success: true, message: 'Password reset' });
      }

      if (p === '/api/admin/change-login' && req.method === 'POST') {
        const body = await getBody(req);
        const currentPassword = body.current_password || '';
        const newEmail = (body.email || '').trim().toLowerCase();
        const newPassword = body.new_password || '';
        const row = await pool.query(
          "SELECT * FROM my_artfive.accounts WHERE id = $1 AND account_type = 'owner' LIMIT 1",
          [adminUser.id]
        );
        const owner = row.rows[0];
        if (!owner) return json(res, 404, { success: false, error: 'Owner account not found' });
        if (!verifyPassword(currentPassword, owner.password_hash)) {
          return json(res, 401, { success: false, error: 'Current password is wrong' });
        }
        if (!newEmail || !newEmail.includes('@')) {
          return json(res, 400, { success: false, error: 'Enter a valid email' });
        }
        if (newPassword.length < 6) {
          return json(res, 400, { success: false, error: 'New password must be at least 6 characters' });
        }
        const taken = await pool.query(
          'SELECT id FROM my_artfive.accounts WHERE email = $1 AND id <> $2 LIMIT 1',
          [newEmail, owner.id]
        );
        if (taken.rows.length) return json(res, 400, { success: false, error: 'That email is already used' });
        await pool.query(
          'UPDATE my_artfive.accounts SET email = $1, password_hash = $2, updated_at = NOW() WHERE id = $3',
          [newEmail, hashPassword(newPassword), owner.id]
        );
        return json(res, 200, { success: true, message: 'Email and password updated. Please login again.', email: newEmail });
      }

      if (p === '/api/admin/analysis') {
        const count = await pool.query(
          "SELECT COUNT(*)::int AS c FROM my_artfive.accounts WHERE account_type = 'business'"
        );
        const s = await ensureSettings();
        const companies = count.rows[0].c;
        return json(res, 200, {
          success: true,
          data: {
            companies,
            subscribers: Number(s.subscribers) || 0,
            ratings: Number(s.ratings) || 0,
            users: companies,
            downloads: Number(s.downloads) || 0
          }
        });
      }

      if (p === '/api/admin/settings' && req.method === 'POST') {
        return json(res, 200, { success: true, message: 'Settings saved' });
      }
    }

    if (p === '/api/business/subscribe' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      return json(res, 200, { success: true, message: 'Subscribed', subscribers: 0 });
    }

    if (p === '/api/business/unsubscribe' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      return json(res, 200, { success: true, message: 'Unsubscribed', subscribers: 0 });
    }

    json(res, 404, { success: false, error: 'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { success: false, error: 'Server error' });
  }
});

ensureOwner()
  .then(() => ensureSettings())
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log('My ARTfive! Auth v2 — Neon storage');
      console.log('Owner: admin@myartfive.com / Admin@123');
      console.log('Listening on', PORT);
    });
  })
  .catch(err => {
    console.error('Database startup failed:', err.message);
    process.exit(1);
  });
