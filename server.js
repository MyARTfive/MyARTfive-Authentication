/**
 * My ARTfive! Auth (Secure Login!)
 * Permanent Neon storage — owner My Dashboard + business My Portal
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
  console.error('DATABASE_URL missing');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}
function createToken(user) {
  const payload = {
    id: user.id,
    role: user.account_type === 'owner' ? 'admin' : 'business',
    sid: crypto.randomBytes(8).toString('hex'),
    exp: Date.now() + 12 * 60 * 60 * 1000
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return { token: data + '.' + sig, sid: payload.sid, exp: payload.exp };
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
  } catch { return null; }
}
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
  });
  res.end(JSON.stringify(data));
}
function getBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

const DEFAULT_SETTINGS = {
  upi: '8859063256',
  qr_image: '/qr-demo.png',
  bill_text: 'My Plan – 5 days $0/-\nRenew for one month – $0\nAfter one month – $100/-\nOne Month Pro+',
  plan_amount: 100,
  free_days: 5,
  update_text: 'No new app update yet.',
  auto_notification: 'Welcome. Your My ARTfive! account is active.',
  manual_notification: '',
  logout_message: 'My ARTfive! will remove you from all active sessions on this device.',
  subscribers: 0,
  ratings: 0,
  downloads: 0,
  notification_suggestions: [
    'My ARTfive! received your payment successfully.',
    'My ARTfive! Congratulations to you!',
    'You logged in successfully.',
    'Renew your plan.',
    'Your plan has expired.',
    'Recharge your plan to activate your account.',
    'Your Pro+ plan has expired.',
    'Your Free Plan has expired.',
    'Upgrade Now.'
  ],
  business_types: ['Company', 'School', 'College', 'Restaurant', 'Hotel', 'Hospital', 'Shop', 'Other'],
  portal_menu: [
    { id: 'home', title: '1. Home', description: 'Your My Portal home.' },
    { id: 'account', title: '2. My Account', description: 'Your name, phone and company.' },
    { id: 'payments', title: '3. Payments (UPI + QR)', description: 'Pay using UPI or QR.' },
    { id: 'bill', title: '4. My Bill', description: 'Your plan and renew price.' },
    { id: 'recharge', title: '5. Recharge My Bill', description: 'Pay for one month Pro+.' },
    { id: 'notifications', title: '6. My Notifications', description: 'Messages from My ARTfive!' },
    { id: 'updates', title: '7. New App Update', description: 'New features in the app.' },
    { id: 'settings', title: '8. My Settings', description: 'Change your password.' }
  ],
  admin_menu: [
    { id: 'home', title: '1. Dashboard Home', description: 'Welcome to My Dashboard!' },
    { id: 'businesses', title: '2. Businesses / Companies', description: 'Customer name, phone and company.' },
    { id: 'allow', title: '3. Allow / Deny Login', description: 'Yes or No for each company.' },
    { id: 'reset', title: '4. Reset Password', description: 'Reset company password or your own login.' },
    { id: 'notifications', title: '5. Notifications', description: 'Messages sent to My Portal.' },
    { id: 'payment', title: '6. Payment Settings', description: 'Change UPI and QR photo.' },
    { id: 'bill', title: '7. Send Bill', description: 'Bill amount and month count.' },
    { id: 'analysis', title: '8. App Analysis', description: 'Subscribers, ratings, users, downloads.' },
    { id: 'updates', title: '9. App Updates', description: 'Update text for My Portal.' },
    { id: 'view', title: '10. View Business Dashboard', description: 'Open My Portal and return here.' },
    { id: 'all-edit', title: '11. All Edit', description: 'Edit all names and messages.' }
  ]
};

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS my_artfive.app_settings (
      id INT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS full_name TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS business_type TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS subscribed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS plan_months INT DEFAULT 0`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS free_until TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS active_session TEXT`);
  const found = await pool.query('SELECT data FROM my_artfive.app_settings WHERE id = 1');
  if (!found.rows.length) {
    await pool.query('INSERT INTO my_artfive.app_settings (id, data) VALUES (1, $1::jsonb)', [JSON.stringify(DEFAULT_SETTINGS)]);
  }
}
async function getSettings() {
  const r = await pool.query('SELECT data FROM my_artfive.app_settings WHERE id = 1');
  if (!r.rows.length) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...r.rows[0].data };
}
async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await pool.query('UPDATE my_artfive.app_settings SET data = $1::jsonb WHERE id = 1', [JSON.stringify(next)]);
  return next;
}
async function ensureOwner() {
  const existing = await pool.query("SELECT id FROM my_artfive.accounts WHERE account_type = 'owner' LIMIT 1");
  if (existing.rows.length) return;
  await pool.query(
    `INSERT INTO my_artfive.accounts
      (email, mobile_number, company_name, password_hash, account_type, account_status, full_name)
     VALUES ($1, NULL, NULL, $2, 'owner', 'active', 'Owner')`,
    ['admin@myartfive.com', hashPassword('Admin@123')]
  );
  console.log('Owner: admin@myartfive.com / Admin@123');
}
async function getAuthUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const r = await pool.query('SELECT * FROM my_artfive.accounts WHERE id = $1 LIMIT 1', [payload.id]);
  const u = r.rows[0];
  if (!u) return null;
  if (u.account_type === 'owner' && u.active_session && payload.sid && u.active_session !== payload.sid) {
    return null;
  }
  if (u.account_status !== 'active' && u.account_type !== 'owner') return null;
  return {
    id: u.id,
    role: u.account_type === 'owner' ? 'admin' : 'business',
    account_type: u.account_type,
    email: u.email,
    phone: u.mobile_number,
    company_name: u.company_name,
    full_name: u.full_name,
    business_type: u.business_type,
    subscribed: !!u.subscribed,
    plan_months: u.plan_months || 0,
    free_until: u.free_until,
    name: u.full_name || u.company_name || u.email || u.mobile_number
  };
}
async function publicCounts() {
  const s = await getSettings();
  const users = await pool.query("SELECT COUNT(*)::int AS c FROM my_artfive.accounts WHERE account_type = 'business'");
  const subs = await pool.query("SELECT COUNT(*)::int AS c FROM my_artfive.accounts WHERE account_type = 'business' AND subscribed = true");
  return {
    subscribers: Math.max(Number(s.subscribers) || 0, subs.rows[0].c),
    ratings: Number(s.ratings) || 0,
    users: users.rows[0].c,
    downloads: Number(s.downloads) || 0
  };
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
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(fs.readFileSync(path.join(__dirname, 'qr-demo.png')));
    }
    if (p === '/api/health') {
      let db = 'ok';
      try { await pool.query('SELECT 1'); } catch { db = 'error'; }
      return json(res, 200, { success: true, app: 'My ARTfive! Auth', subtitle: '(Secure Login!)', version: '3.0.0', database: db });
    }
    if (p === '/api/public') {
      const counts = await publicCounts();
      const s = await getSettings();
      return json(res, 200, {
        success: true,
        counts,
        business_types: s.business_types,
        logout_message: s.logout_message
      });
    }
    if (p === '/api/settings') {
      const s = await getSettings();
      return json(res, 200, {
        success: true,
        upi: s.upi,
        qr_image: s.qr_image,
        bill_text: s.bill_text,
        bill_amount: s.bill_amount != null ? s.bill_amount : s.plan_amount,
        bill_months: s.bill_months || 1,
        plan_amount: s.plan_amount,
        free_days: s.free_days,
        update_text: s.update_text,
        auto_notification: s.auto_notification,
        manual_notification: s.manual_notification,
        logout_message: s.logout_message,
        portal_menu: s.portal_menu,
        business_types: s.business_types
      });
    }

    // Register
    if (p === '/api/auth/register' && req.method === 'POST') {
      const body = await getBody(req);
      const company_name = (body.company_name || '').trim();
      const full_name = (body.full_name || body.name || '').trim();
      const phone = (body.phone || '').trim();
      const password = body.password || '';
      const business_type = (body.business_type || '').trim() || 'Company';
      if (!company_name) return json(res, 400, { success: false, error: 'Company name required' });
      if (!phone || phone.length < 10) return json(res, 400, { success: false, error: 'Valid phone required' });
      if (password.length < 6) return json(res, 400, { success: false, error: 'Password min 6 characters' });
      const exists = await pool.query('SELECT id FROM my_artfive.accounts WHERE mobile_number = $1', [phone]);
      if (exists.rows.length) return json(res, 400, { success: false, error: 'Phone already registered' });
      const freeUntil = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const ins = await pool.query(
        `INSERT INTO my_artfive.accounts
          (email, mobile_number, company_name, password_hash, account_type, account_status, full_name, business_type, free_until)
         VALUES (NULL, $1, $2, $3, 'business', 'active', $4, $5, $6)
         RETURNING id, mobile_number, company_name, full_name`,
        [phone, company_name, hashPassword(password), full_name || null, business_type, freeUntil]
      );
      const s = await getSettings();
      await saveSettings({ downloads: (Number(s.downloads) || 0) + 1 });
      return json(res, 201, { success: true, message: 'Registered. Please login.', user: ins.rows[0] });
    }

    // Login
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await getBody(req);
      const isAdmin = body.type === 'admin';
      const identifier = (body.identifier || '').trim();
      const password = body.password || '';
      let result;
      if (isAdmin) {
        result = await pool.query("SELECT * FROM my_artfive.accounts WHERE account_type = 'owner' AND lower(email) = lower($1) LIMIT 1", [identifier]);
      } else {
        result = await pool.query("SELECT * FROM my_artfive.accounts WHERE account_type = 'business' AND mobile_number = $1 LIMIT 1", [identifier]);
      }
      const user = result.rows[0];
      if (!user) return json(res, 401, { success: false, error: 'Invalid credentials' });
      if (user.account_type !== 'owner' && user.account_status !== 'active') {
        return json(res, 403, { success: false, error: 'Account disabled by Admin' });
      }
      if (!verifyPassword(password, user.password_hash)) {
        return json(res, 401, { success: false, error: 'Invalid credentials' });
      }
      const { token, sid, exp } = createToken(user);
      // single owner session
      if (user.account_type === 'owner') {
        await pool.query('UPDATE my_artfive.accounts SET active_session = $1 WHERE id = $2', [sid, user.id]);
      }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query(
        `INSERT INTO my_artfive.sessions (account_id, token_hash, expires_at)
         VALUES ($1, $2, to_timestamp($3 / 1000.0))`,
        [user.id, tokenHash, exp]
      );
      return json(res, 200, {
        success: true,
        token,
        user: {
          id: user.id,
          role: user.account_type === 'owner' ? 'admin' : 'business',
          email: user.email,
          phone: user.mobile_number,
          company_name: user.company_name,
          full_name: user.full_name,
          business_type: user.business_type,
          subscribed: !!user.subscribed,
          plan_months: user.plan_months || 0,
          free_until: user.free_until
        }
      });
    }

    if (p === '/api/auth/logout' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (user && user.role === 'admin') {
        await pool.query('UPDATE my_artfive.accounts SET active_session = NULL WHERE id = $1', [user.id]);
      }
      return json(res, 200, { success: true });
    }

    if (p === '/api/auth/me') {
      const user = await getAuthUser(req);
      if (!user) return json(res, 401, { success: false, error: 'Please login again' });
      return json(res, 200, { success: true, user });
    }

    // Business change password
    if (p === '/api/portal/change-password' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      const body = await getBody(req);
      const row = await pool.query('SELECT password_hash FROM my_artfive.accounts WHERE id = $1', [user.id]);
      if (!verifyPassword(body.current_password || '', row.rows[0].password_hash)) {
        return json(res, 401, { success: false, error: 'Current password is wrong' });
      }
      if ((body.new_password || '').length < 6) return json(res, 400, { success: false, error: 'New password min 6 characters' });
      await pool.query('UPDATE my_artfive.accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashPassword(body.new_password), user.id]);
      return json(res, 200, { success: true, message: 'Password changed' });
    }

    // Subscribe / rate public actions after login
    if (p === '/api/portal/subscribe' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      const row = await pool.query('SELECT subscribed FROM my_artfive.accounts WHERE id = $1', [user.id]);
      if (row.rows[0].subscribed) return json(res, 400, { success: false, error: 'Already subscribed' });
      await pool.query('UPDATE my_artfive.accounts SET subscribed = true WHERE id = $1', [user.id]);
      const s = await getSettings();
      await saveSettings({ subscribers: (Number(s.subscribers) || 0) + 1 });
      return json(res, 200, { success: true, message: 'Subscribed' });
    }
    if (p === '/api/portal/rate' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      const body = await getBody(req);
      const stars = Math.min(5, Math.max(1, Number(body.stars) || 0));
      if (!stars) return json(res, 400, { success: false, error: 'Select stars' });
      const s = await getSettings();
      await saveSettings({ ratings: (Number(s.ratings) || 0) + 1 });
      return json(res, 200, { success: true, message: 'Thanks for rating' });
    }
    if (p === '/api/portal/recharge' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      const months = Math.max(1, Number((await getBody(req)).months) || 1);
      await pool.query(
        'UPDATE my_artfive.accounts SET plan_months = COALESCE(plan_months,0) + $1, subscribed = true, updated_at = NOW() WHERE id = $2',
        [months, user.id]
      );
      return json(res, 200, { success: true, message: 'Recharge recorded', months });
    }

    // Admin
    if (p.startsWith('/api/admin')) {
      const admin = await getAuthUser(req);
      if (!admin || admin.role !== 'admin') return json(res, 403, { success: false, error: 'Admin only' });

      if (p === '/api/admin/businesses') {
        const list = await pool.query(
          `SELECT id, full_name, company_name, mobile_number, business_type, account_status, subscribed, plan_months, free_until, created_at
           FROM my_artfive.accounts WHERE account_type = 'business' ORDER BY created_at DESC`
        );
        return json(res, 200, {
          success: true,
          count: list.rows.length,
          businesses: list.rows.map(u => ({
            id: u.id,
            full_name: u.full_name,
            company_name: u.company_name,
            phone: u.mobile_number,
            business_type: u.business_type,
            allowed: u.account_status === 'active',
            subscribed: !!u.subscribed,
            plan_months: u.plan_months || 0,
            free_until: u.free_until,
            created_at: u.created_at
          }))
        });
      }

      if (p === '/api/admin/allow' && req.method === 'POST') {
        const body = await getBody(req);
        const status = body.allowed ? 'active' : 'disabled';
        const r = await pool.query(
          `UPDATE my_artfive.accounts SET account_status = $1, updated_at = NOW()
           WHERE id = $2 AND account_type = 'business' RETURNING id`,
          [status, body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        return json(res, 200, { success: true, message: body.allowed ? 'Allowed' : 'Denied' });
      }

      if (p === '/api/admin/reset-password' && req.method === 'POST') {
        const body = await getBody(req);
        if ((body.password || '').length < 6) return json(res, 400, { success: false, error: 'Password min 6' });
        const r = await pool.query(
          `UPDATE my_artfive.accounts SET password_hash = $1, updated_at = NOW()
           WHERE id = $2 AND account_type = 'business' RETURNING id`,
          [hashPassword(body.password), body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        return json(res, 200, { success: true, message: 'Password saved' });
      }

      if (p === '/api/admin/clear-password' && req.method === 'POST') {
        const body = await getBody(req);
        // set impossible random hash so old password stops working until new one is set
        const r = await pool.query(
          `UPDATE my_artfive.accounts SET password_hash = $1, updated_at = NOW()
           WHERE id = $2 AND account_type = 'business' RETURNING id`,
          [hashPassword(crypto.randomBytes(24).toString('hex')), body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        return json(res, 200, { success: true, message: 'Old password deleted. Create a new one.' });
      }

      if (p === '/api/admin/change-login' && req.method === 'POST') {
        const body = await getBody(req);
        const row = await pool.query("SELECT * FROM my_artfive.accounts WHERE id = $1 AND account_type = 'owner'", [admin.id]);
        const owner = row.rows[0];
        if (!owner) return json(res, 404, { success: false, error: 'Owner not found' });
        if (!verifyPassword(body.current_password || '', owner.password_hash)) {
          return json(res, 401, { success: false, error: 'Current password is wrong' });
        }
        const newEmail = (body.email || '').trim().toLowerCase();
        const newPassword = body.new_password || '';
        if (!newEmail.includes('@')) return json(res, 400, { success: false, error: 'Valid email required' });
        if (newPassword.length < 6) return json(res, 400, { success: false, error: 'New password min 6' });
        await pool.query(
          'UPDATE my_artfive.accounts SET email = $1, password_hash = $2, active_session = NULL, updated_at = NOW() WHERE id = $3',
          [newEmail, hashPassword(newPassword), owner.id]
        );
        return json(res, 200, { success: true, message: 'Saved. Please login again.', email: newEmail });
      }

      if (p === '/api/admin/analysis') {
        const counts = await publicCounts();
        return json(res, 200, { success: true, data: counts });
      }

      if (p === '/api/admin/settings' && req.method === 'GET') {
        return json(res, 200, { success: true, settings: await getSettings() });
      }
      if (p === '/api/admin/settings' && req.method === 'POST') {
        const body = await getBody(req);
        const keys = [
          'upi', 'qr_image', 'bill_text', 'bill_amount', 'bill_months', 'plan_amount', 'free_days', 'update_text',
          'auto_notification', 'manual_notification', 'logout_message',
          'subscribers', 'ratings', 'downloads', 'notification_suggestions',
          'business_types', 'portal_menu', 'admin_menu'
        ];
        const patch = {};
        keys.forEach(k => { if (body[k] !== undefined) patch[k] = body[k]; });
        const saved = await saveSettings(patch);
        return json(res, 200, { success: true, message: 'Saved', settings: saved });
      }
    }

    json(res, 404, { success: false, error: 'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { success: false, error: 'Server error' });
  }
});

ensureSchema()
  .then(() => ensureOwner())
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log('My ARTfive! Auth (Secure Login!) v3 on', PORT);
    });
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
