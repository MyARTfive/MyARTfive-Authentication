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


function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}
/* Common country dial codes (longest first for parse) */
const DIAL_CODES = [
  '998','996','995','994','993','992','977','976','975','974','973','972','971','970',
  '968','967','966','965','964','963','962','961','960','886','880','856','855','853',
  '852','850','692','691','690','689','688','687','686','685','683','682','681','680',
  '679','678','677','676','675','674','673','672','670','599','598','597','595','593',
  '592','591','590','509','508','507','506','505','504','503','502','501','500','423',
  '421','420','389','387','386','385','383','382','381','380','378','377','376','375',
  '374','373','372','371','370','359','358','357','356','355','354','353','352','351',
  '350','299','298','297','291','290','269','268','267','266','265','264','263','262',
  '261','260','258','257','256','255','254','253','252','251','250','249','248','246',
  '245','244','243','242','241','240','239','238','237','236','235','234','233','232',
  '231','230','229','228','227','226','225','224','223','222','221','220','218','216',
  '213','212','211','98','95','94','93','92','91','90','86','84','82','81','66','65',
  '64','63','62','61','60','58','57','56','55','54','53','52','51','49','48','47','46',
  '45','44','43','41','40','39','36','34','33','32','31','30','27','20','7','1'
];
function parseDialAndLocal(raw) {
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  for (const code of DIAL_CODES) {
    if (d.startsWith(code) && d.length > code.length + 4) {
      return { code, local: d.slice(code.length), full: d };
    }
  }
  return null;
}
function normalizePhone(raw, countryCode) {
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  // Full international with + is accepted as explicit identity
  const parsed = parseDialAndLocal(d);
  if (String(raw || '').trim().startsWith('+') && parsed) {
    return parsed.full;
  }
  let code = digitsOnly(countryCode);
  if (!code) return null; // no silent default / no guess
  if (d.startsWith('0')) d = d.slice(1);
  if (d.startsWith(code) && d.length > code.length + 5) return d;
  if (d.length < 6 || d.length > 12) return null;
  return code + d;
}
function displayPhone(stored, forAdmin) {
  let d = digitsOnly(stored);
  if (!d) return '';
  const parsed = parseDialAndLocal(d);
  if (!parsed) {
    return forAdmin ? d : d;
  }
  if (forAdmin) return parsed.code + ' ' + parsed.local;
  return parsed.local;
}
function phoneCountry(stored) {
  const parsed = parseDialAndLocal(digitsOnly(stored));
  return parsed ? parsed.code : '';
}
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
  bill_text: 'Free plan - 5 days\nUpgrade Plan - 1 month - $100/-\nUpgrade Plan Pro+ - 3 months - $250/-',
  plan_amount: 100,
  bill_amount: 100,
  bill_months: 1,
  free_days: 5,
  force_upgrade: false,
  update_text: 'No new app update yet.',
  auto_notification: 'Welcome. Your My ARTfive! account is active.',
  manual_notification: '',
  plan_expire_notification: 'Your plan time is over. Please open Upgrade Plans and upgrade to continue full access.',
  auth_success_message: "You're authorised from My ARTfive! Auth! Secure login! Successfully!",
  connect_heading: 'Connect your platform',
  connect_intro: 'Like connecting Supabase Auth — request My ARTfive! Auth for your software / web / mobile app.',
  connect_app_label: 'Your app or software name',
  connect_link_label: 'Connect your app to My ARTfive! Auth',
  logout_message: 'My ARTfive! will remove you from all active sessions on this device.',
  subscribers: 0,
  ratings: 0,
  downloads: 0,
  notification_suggestions: [
    'My ARTfive! received your payment successfully.',
    'You logged in successfully.',
    'Your plan has expired.',
    'Upgrade Now.',
    "You're authorised from My ARTfive! Auth! Secure login! Successfully!"
  ],
  course_options: ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','B.A','B.Sc','B.Com','B.Tech','M.A','M.Sc','MBA','Other'],
  business_types: ['Create customer login id','Create Students login id','Company','School','College','Restaurant','Hotel','Hospital','Shop','Other'],
  portal_menu: [
    { id: 'home', title: '1. Home', description: 'Your My Portal home.' },
    { id: 'account', title: '2. My Account', description: 'Your name, phone and company.' },
    { id: 'payments', title: '3. Payments (UPI + QR)', description: 'Pay using UPI or QR.' },
    { id: 'bill', title: '4. Upgrade Plans', description: 'See and choose upgrade plans.' },
    { id: 'recharge', title: '5. Recharge My Bill', description: 'Pay with UPI or QR. Your own plan dates apply.' },
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
    { id: 'bill', title: '7. Upgrade Plans / Bill', description: 'Plans text, amount, force upgrade on/off.' },
    { id: 'analysis', title: '8. App Analysis', description: 'Subscribers, ratings, users, downloads.' },
    { id: 'updates', title: '9. App Updates', description: 'Update text for My Portal.' },
    { id: 'view', title: '10. View Business Dashboard', description: 'Open My Portal and return here.' },
    { id: 'connections', title: '11. See request and give service!', description: 'My ARTfive! Auth! Accept outside app connection requests.' },
    { id: 'last-recharge', title: '12. Last Recharge', description: 'Each customer last recharge date, amount and plan end date.' },
    { id: 'all-edit', title: '13. All Edit', description: 'Edit all names and messages including courses.' }
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
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS pending_password_hash TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS pending_password_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS pending_phone TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS pending_phone_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS pending_delete BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS pending_delete_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS roll_number TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS registration_number TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS course TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS school_contact TEXT`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS plan_expire_notified BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS last_recharge_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS last_recharge_amount NUMERIC`);
  await pool.query(`ALTER TABLE my_artfive.accounts ADD COLUMN IF NOT EXISTS last_recharge_months INT`);
  await pool.query(`ALTER TABLE my_artfive.access_requests ADD COLUMN IF NOT EXISTS service_until TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.access_requests ADD COLUMN IF NOT EXISTS last_recharge_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE my_artfive.access_requests ADD COLUMN IF NOT EXISTS last_recharge_amount NUMERIC`);
  await pool.query(`CREATE TABLE IF NOT EXISTS my_artfive.access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    website TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    api_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
  )`);
  const found = await pool.query('SELECT data FROM my_artfive.app_settings WHERE id = 1');
  if (!found.rows.length) {
    await pool.query('INSERT INTO my_artfive.app_settings (id, data) VALUES (1, $1::jsonb)', [JSON.stringify(DEFAULT_SETTINGS)]);
  }
}
function mergeById(saved, defaults) {
  // Keep default order; append any unknown saved items at end
  const byId = {};
  (Array.isArray(saved) ? saved : []).forEach(x => { if (x && x.id) byId[x.id] = { ...x }; });
  const list = defaults.map(d => {
    const s = byId[d.id];
    if (!s) return { ...d };
    // Force serial title/description from defaults so 10 → 11 → 12 is always correct
    return { ...s, id: d.id, title: d.title, description: d.description };
  });
  (Array.isArray(saved) ? saved : []).forEach(x => {
    if (x && x.id && !defaults.some(d => d.id === x.id)) list.push({ ...x });
  });
  return list;
}
async function getSettings() {
  const r = await pool.query('SELECT data FROM my_artfive.app_settings WHERE id = 1');
  if (!r.rows.length) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS, ...r.rows[0].data };
  merged.portal_menu = mergeById(r.rows[0].data.portal_menu, DEFAULT_SETTINGS.portal_menu);
  merged.admin_menu = mergeById(r.rows[0].data.admin_menu, DEFAULT_SETTINGS.admin_menu);
  const types = Array.isArray(merged.business_types) ? merged.business_types : [];
  if (!types.some(t => /student/i.test(t))) {
    merged.business_types = DEFAULT_SETTINGS.business_types;
  }
  if (!Array.isArray(merged.course_options) || !merged.course_options.length) {
    merged.course_options = DEFAULT_SETTINGS.course_options;
  }
  return merged;
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
    phone: u.account_type === 'owner' ? u.mobile_number : displayPhone(u.mobile_number, false),
    phone_full: u.account_type === 'owner' ? u.mobile_number : displayPhone(u.mobile_number, true),
    phone_pending: !!u.pending_phone,
    pending_phone_local: u.pending_phone ? displayPhone(u.pending_phone, false) : null,
    delete_pending: !!u.pending_delete,
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
        logout_message: s.logout_message,
        course_options: s.course_options || [],
        connect_heading: s.connect_heading,
        connect_intro: s.connect_intro,
        connect_app_label: s.connect_app_label,
        connect_link_label: s.connect_link_label
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
        business_types: s.business_types,
        course_options: s.course_options || [],
        force_upgrade: !!s.force_upgrade,
        plan_expire_notification: s.plan_expire_notification,
        auth_success_message: s.auth_success_message,
        connect_heading: s.connect_heading,
        connect_intro: s.connect_intro,
        connect_app_label: s.connect_app_label,
        connect_link_label: s.connect_link_label
      });
    }

    // Register
        if (p === '/api/auth/register' && req.method === 'POST') {
      const body = await getBody(req);
      const reg_kind = (body.reg_kind || body.business_type || 'customer').toLowerCase();
      const isStudent = reg_kind.includes('student');
      const company_name = (body.company_name || body.school_name || '').trim();
      const full_name = (body.full_name || body.name || '').trim();
      const password = body.password || '';
      const business_type = (body.business_type || (isStudent ? 'Student' : 'Customer')).trim();
      const email = (body.email || '').trim() || null;
      const roll_number = (body.roll_number || '').trim() || null;
      const registration_number = (body.registration_number || '').trim() || null;
      const course = (body.course || '').trim() || null;
      const school_contact = (body.school_contact || '').trim() || null;
      let phone = null;
      if (body.phone && String(body.phone).trim()) {
        phone = normalizePhone(body.phone, body.country_code);
        if (!phone) return json(res, 400, { success: false, error: 'Select country and enter a valid mobile number' });
      }
      if (isStudent) {
        if (!company_name) return json(res, 400, { success: false, error: 'School or College name required' });
        if (!full_name) return json(res, 400, { success: false, error: 'Student full name required' });
        if (!roll_number) return json(res, 400, { success: false, error: 'Roll number required' });
        if (!course) return json(res, 400, { success: false, error: 'Course / Class required' });
        if (!school_contact) return json(res, 400, { success: false, error: 'School / College contact required' });
        if (password.length < 6) return json(res, 400, { success: false, error: 'Password min 6 characters' });
        const dup = await pool.query(
          `SELECT id FROM my_artfive.accounts WHERE company_name = $1 AND roll_number = $2 LIMIT 1`,
          [company_name, roll_number]
        );
        if (dup.rows.length) return json(res, 400, { success: false, error: 'Roll number already registered for this school' });
        if (!phone) {
          phone = normalizePhone(school_contact, body.country_code || body.school_country_code);
          if (!phone) return json(res, 400, { success: false, error: 'Valid school contact number required' });
        } else {
          const parsed = parseDialAndLocal(phone);
          const local = parsed ? parsed.local : phone;
          const exists = await pool.query('SELECT id FROM my_artfive.accounts WHERE mobile_number = $1 OR mobile_number = $2', [phone, local]);
          if (exists.rows.length) return json(res, 400, { success: false, error: 'Phone already registered' });
        }
      } else {
        if (!company_name) return json(res, 400, { success: false, error: 'Name required' });
        if (!phone) return json(res, 400, { success: false, error: 'Select country and enter phone number' });
        if (password.length < 6) return json(res, 400, { success: false, error: 'Password min 6 characters' });
        const parsed = parseDialAndLocal(phone);
        const local = parsed ? parsed.local : phone;
        const exists = await pool.query(
          'SELECT id FROM my_artfive.accounts WHERE mobile_number = $1 OR mobile_number = $2 OR mobile_number = $3',
          [phone, local, '0' + local]
        );
        if (exists.rows.length) return json(res, 400, { success: false, error: 'Phone already registered' });
      }
      let storePhone = phone;
      if (isStudent && roll_number && !(body.phone && String(body.phone).trim())) {
        storePhone = phone + 'R' + String(roll_number).replace(/\W/g, '').slice(0, 12);
      }
      const s0 = await getSettings();
      const freeDays = Number(s0.free_days) || 5;
      const freeUntil = new Date(Date.now() + freeDays * 24 * 60 * 60 * 1000);
      const ins = await pool.query(
        `INSERT INTO my_artfive.accounts
          (email, mobile_number, company_name, password_hash, account_type, account_status, full_name, business_type, free_until,
           roll_number, registration_number, course, school_contact, plan_expire_notified)
         VALUES ($1,$2,$3,$4,'business','disabled',$5,$6,$7,$8,$9,$10,$11,FALSE)
         RETURNING id, company_name, full_name, roll_number, course`,
        [email, storePhone, company_name, hashPassword(password), full_name || null, business_type, freeUntil,
         roll_number, registration_number, course, school_contact]
      );
      await saveSettings({ downloads: (Number(s0.downloads) || 0) + 1 });
      return json(res, 201, {
        success: true,
        message: isStudent ? 'Student registered. Wait for admin approval. You can add another student.' : 'Registered. Wait for admin approval, then login.',
        user: ins.rows[0]
      });
    }

if (p === '/api/auth/forgot-password' && req.method === 'POST') {
      const body = await getBody(req);
      const phone = normalizePhone(body.phone, body.country_code);
      const newPassword = body.new_password || '';
      if (!phone) return json(res, 400, { success: false, error: 'Select country and enter a valid mobile number' });
      if (newPassword.length < 6) return json(res, 400, { success: false, error: 'New password min 6 characters' });
      const parsed = parseDialAndLocal(phone);
      const local = parsed ? parsed.local : phone;
      const result = await pool.query(
        `SELECT id, account_status FROM my_artfive.accounts
         WHERE account_type = 'business'
           AND (mobile_number = $1 OR mobile_number = $2 OR mobile_number = $3)
         LIMIT 1`,
        [phone, local, digitsOnly(body.phone)]
      );
      if (!result.rows[0]) return json(res, 404, { success: false, error: 'No account with this phone' });
      const acc = result.rows[0];
      if (acc.account_status !== 'active') {
        return json(res, 403, { success: false, error: 'Account is not active yet. Wait for admin approval first.' });
      }
      await pool.query(
        `UPDATE my_artfive.accounts
         SET pending_password_hash = $1, pending_password_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [hashPassword(newPassword), acc.id]
      );
      return json(res, 200, {
        success: true,
        message: 'New password submitted. Wait for admin approval, then login with your new password.'
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
        result = await pool.query("SELECT * FROM my_artfive.accounts WHERE account_type = 'owner' AND lower(email) = lower($1) LIMIT 1", [identifier]);
      } else if (body.login_mode === 'student' || body.roll_number) {
        const school = (body.school_name || body.company_name || '').trim();
        const roll = (body.roll_number || identifier || '').trim();
        result = await pool.query(
          `SELECT * FROM my_artfive.accounts WHERE account_type = 'business' AND roll_number = $1
             AND ($2 = '' OR lower(company_name) = lower($2)) LIMIT 1`,
          [roll, school]
        );
      } else {
        const norm = normalizePhone(identifier, body.country_code);
        const parsed = norm ? parseDialAndLocal(norm) : null;
        const local = parsed ? parsed.local : digitsOnly(identifier);
        result = await pool.query(
          `SELECT * FROM my_artfive.accounts
           WHERE account_type = 'business'
             AND (mobile_number = $1 OR mobile_number = $2 OR mobile_number = $3 OR mobile_number = $4 OR mobile_number LIKE $5)
           LIMIT 1`,
          [norm || identifier, local, identifier, digitsOnly(identifier), (norm || local || identifier) + 'R%']
        );
      }
      const user = result.rows[0];
      if (!user) return json(res, 401, { success: false, error: 'Invalid credentials' });
      if (user.account_type !== 'owner' && user.account_status !== 'active') {
        if (user.account_status === 'disabled') {
          return json(res, 403, { success: false, error: 'Waiting for admin approval. You will be able to login after admin allows you.' });
        }
        if (user.account_status === 'suspended') {
          return json(res, 403, { success: false, error: 'Service stopped. Your plan time is over or admin stopped this account. Upgrade and contact My ARTfive! to start again.' });
        }
        return json(res, 403, { success: false, error: 'Account disabled by Admin' });
      }
      const settingsNow = await getSettings();
      if (user.account_type !== 'owner' && settingsNow.force_upgrade && user.free_until && new Date(user.free_until).getTime() < Date.now()) {
        await pool.query(`UPDATE my_artfive.accounts SET account_status = 'suspended', plan_expire_notified = TRUE, updated_at = NOW() WHERE id = $1`, [user.id]);
        return json(res, 403, { success: false, error: 'Service stopped. Free plan or upgrade time is over. Contact My ARTfive! to upgrade and start service again.' });
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
          phone: user.account_type === 'owner' ? user.mobile_number : displayPhone(user.mobile_number, false),
          phone_full: user.account_type === 'owner' ? user.mobile_number : displayPhone(user.mobile_number, true),
          phone_pending: !!user.pending_phone,
          pending_phone_local: user.pending_phone ? displayPhone(user.pending_phone, false) : null,
          delete_pending: !!user.pending_delete,
          company_name: user.company_name,
          full_name: user.full_name,
          business_type: user.business_type,
          subscribed: !!user.subscribed,
          plan_months: user.plan_months || 0,
          free_until: user.free_until,
          last_recharge_at: user.last_recharge_at,
          last_recharge_amount: user.last_recharge_amount
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


    if (p === '/api/portal/request-phone-change' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      const body = await getBody(req);
      const phone = normalizePhone(body.phone, body.country_code);
      if (!phone) return json(res, 400, { success: false, error: 'Select country and enter a valid mobile number' });
      const parsed = parseDialAndLocal(phone);
      const local = parsed ? parsed.local : phone;
      const exists = await pool.query(
        `SELECT id FROM my_artfive.accounts WHERE id <> $1 AND (mobile_number = $2 OR mobile_number = $3) LIMIT 1`,
        [user.id, phone, local]
      );
      if (exists.rows.length) return json(res, 400, { success: false, error: 'This phone is already used by another account' });
      await pool.query(
        `UPDATE my_artfive.accounts SET pending_phone = $1, pending_phone_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [phone, user.id]
      );
      return json(res, 200, { success: true, message: 'New phone submitted. Wait for admin approval.' });
    }

    if (p === '/api/portal/request-delete' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      await pool.query(
        `UPDATE my_artfive.accounts SET pending_delete = TRUE, pending_delete_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [user.id]
      );
      return json(res, 200, { success: true, message: 'Delete request sent. Admin must approve. Your account stays until approved.' });
    }

    if (p === '/api/portal/cancel-delete' && req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      await pool.query(
        `UPDATE my_artfive.accounts SET pending_delete = FALSE, pending_delete_at = NULL, updated_at = NOW() WHERE id = $1`,
        [user.id]
      );
      return json(res, 200, { success: true, message: 'Delete request cancelled.' });
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
      const body = await getBody(req);
      const s = await getSettings();
      const months = Math.max(1, Number(body.months) || Number(s.bill_months) || 1);
      const amount = Number(body.amount) || Number(s.bill_amount) || Number(s.plan_amount) || 100;
      const addDays = months * 30;
      const r = await pool.query(
        `UPDATE my_artfive.accounts
         SET plan_months = COALESCE(plan_months,0) + $1,
             subscribed = true,
             account_status = CASE WHEN account_status = 'suspended' THEN 'active' ELSE account_status END,
             free_until = GREATEST(COALESCE(free_until, NOW()), NOW()) + ($2 || ' days')::interval,
             plan_expire_notified = FALSE,
             last_recharge_at = NOW(),
             last_recharge_amount = $3,
             last_recharge_months = $1,
             updated_at = NOW()
         WHERE id = $4
         RETURNING free_until, last_recharge_at, plan_months`,
        [months, String(addDays), amount, user.id]
      );
      return json(res, 200, {
        success: true,
        message: 'Recharge recorded for your account',
        months,
        amount,
        free_until: r.rows[0].free_until,
        last_recharge_at: r.rows[0].last_recharge_at
      });
    }


    // Public: outside apps request My ARTfive! Auth (like Supabase)
    if (p === '/api/connect/request' && req.method === 'POST') {
      const body = await getBody(req);
      const app_name = (body.app_name || '').trim();
      if (!app_name) return json(res, 400, { success: false, error: 'App / software name required' });
      const ins = await pool.query(
        `INSERT INTO my_artfive.access_requests (app_name, contact_email, contact_phone, website, note, status)
         VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id, app_name, status, created_at`,
        [app_name, (body.contact_email||'').trim()||null, (body.contact_phone||'').trim()||null, (body.website||'').trim()||null, (body.note||'').trim()||null]
      );
      return json(res, 201, {
        success: true,
        message: 'Access request sent. Wait for My ARTfive! Auth approval from the owner.',
        request: ins.rows[0]
      });
    }
    if (p === '/api/connect/status') {
      const id = url.searchParams.get('id');
      if (!id) return json(res, 400, { success: false, error: 'Request id required' });
      const row = await pool.query(
        'SELECT id, app_name, status, api_key, created_at, decided_at FROM my_artfive.access_requests WHERE id = $1',
        [id]
      );
      if (!row.rows[0]) return json(res, 404, { success: false, error: 'Request not found' });
      const s = await getSettings();
      const out = {
        success: true,
        request: {
          id: row.rows[0].id,
          app_name: row.rows[0].app_name,
          status: row.rows[0].status,
          created_at: row.rows[0].created_at,
          decided_at: row.rows[0].decided_at
        }
      };
      if (row.rows[0].status === 'approved') {
        out.message = s.auth_success_message || "You're authorised from My ARTfive! Auth! Secure login! Successfully!";
        out.api_key = row.rows[0].api_key;
        out.connection = {
          auth_base_url: (process.env.PUBLIC_URL || '').replace(/\/$/, '') || null,
          login_path: '/api/auth/login',
          register_path: '/api/auth/register',
          how_to: 'Use api_key in header X-MA-Auth-Key. Call login with phone+password or student roll.'
        };
      } else if (row.rows[0].status === 'pending') {
        out.message = 'Waiting for My ARTfive! Auth owner to Accept.';
      } else {
        out.message = 'Access was rejected.';
      }
      return json(res, 200, out);
    }

    // Admin
    if (p.startsWith('/api/admin')) {
      const admin = await getAuthUser(req);
      if (!admin || admin.role !== 'admin') return json(res, 403, { success: false, error: 'Admin only' });

      if (p === '/api/admin/businesses') {
        const list = await pool.query(
          `SELECT id, full_name, company_name, mobile_number, business_type, account_status, subscribed, plan_months, free_until, created_at,
                  pending_password_hash, pending_password_at, pending_phone, pending_phone_at, pending_delete, pending_delete_at,
                  last_recharge_at, last_recharge_amount, last_recharge_months
           FROM my_artfive.accounts WHERE account_type = 'business' ORDER BY created_at DESC`
        );
        return json(res, 200, {
          success: true,
          count: list.rows.length,
          businesses: list.rows.map(u => ({
            id: u.id,
            full_name: u.full_name,
            company_name: u.company_name,
            phone: displayPhone(u.mobile_number, true),
            phone_local: displayPhone(u.mobile_number, false),
            country_code: phoneCountry(u.mobile_number),
            business_type: u.business_type,
            allowed: u.account_status === 'active',
            pending: u.account_status === 'disabled',
            stopped: u.account_status === 'suspended',
            password_pending: !!u.pending_password_hash,
            phone_pending: !!u.pending_phone,
            pending_phone: u.pending_phone ? displayPhone(u.pending_phone, true) : null,
            pending_phone_local: u.pending_phone ? displayPhone(u.pending_phone, false) : null,
            delete_pending: !!u.pending_delete,
            subscribed: !!u.subscribed,
            plan_months: u.plan_months || 0,
            free_until: u.free_until,
            last_recharge_at: u.last_recharge_at,
            last_recharge_amount: u.last_recharge_amount,
            last_recharge_months: u.last_recharge_months,
            created_at: u.created_at
          }))
        });
      }

      if (p === '/api/admin/allow' && req.method === 'POST') {
        const body = await getBody(req);
        let status = body.allowed ? 'active' : 'disabled';
        if (body.action === 'stop') status = 'suspended';
        if (body.action === 'start') status = 'active';
        const r = await pool.query(
          `UPDATE my_artfive.accounts SET account_status = $1, updated_at = NOW()
             ${body.action === 'start' ? ", free_until = NOW() + interval '5 days', plan_expire_notified = FALSE" : ''}
           WHERE id = $2 AND account_type = 'business' RETURNING id`,
          [status, body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        let msgOut = 'Updated';
        if (body.action === 'stop') msgOut = 'Service stopped. Customer cannot login.';
        else if (body.action === 'start') msgOut = 'Service started. Customer can login.';
        else if (body.allowed === true || body.allowed === 'true' || body.allowed === 1) msgOut = 'Allowed. Customer can login now.';
        else msgOut = 'Denied. Customer cannot login.';
        return json(res, 200, { success: true, message: msgOut, status });
      }


      if (p === '/api/admin/approve-password' && req.method === 'POST') {
        const body = await getBody(req);
        const approve = !!body.approve;
        const row = await pool.query(
          `SELECT id, pending_password_hash FROM my_artfive.accounts
           WHERE id = $1 AND account_type = 'business' LIMIT 1`,
          [body.user_id]
        );
        if (!row.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        if (!row.rows[0].pending_password_hash) {
          return json(res, 400, { success: false, error: 'No pending password for this customer' });
        }
        if (approve) {
          await pool.query(
            `UPDATE my_artfive.accounts
             SET password_hash = pending_password_hash,
                 pending_password_hash = NULL,
                 pending_password_at = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [body.user_id]
          );
          return json(res, 200, { success: true, message: 'New password approved. Customer can login with it now.' });
        }
        await pool.query(
          `UPDATE my_artfive.accounts
           SET pending_password_hash = NULL, pending_password_at = NULL, updated_at = NOW()
           WHERE id = $1`,
          [body.user_id]
        );
        return json(res, 200, { success: true, message: 'New password request rejected.' });
      }


      if (p === '/api/admin/approve-phone' && req.method === 'POST') {
        const body = await getBody(req);
        const approve = !!body.approve;
        const row = await pool.query(
          `SELECT id, pending_phone FROM my_artfive.accounts WHERE id = $1 AND account_type = 'business' LIMIT 1`,
          [body.user_id]
        );
        if (!row.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        if (!row.rows[0].pending_phone) return json(res, 400, { success: false, error: 'No pending phone change' });
        if (approve) {
          const newPhone = row.rows[0].pending_phone;
          const parsed = parseDialAndLocal(newPhone);
          const local = parsed ? parsed.local : newPhone;
          const clash = await pool.query(
            `SELECT id FROM my_artfive.accounts WHERE id <> $1 AND (mobile_number = $2 OR mobile_number = $3) LIMIT 1`,
            [body.user_id, newPhone, local]
          );
          if (clash.rows.length) return json(res, 400, { success: false, error: 'Phone already used by another account' });
          await pool.query(
            `UPDATE my_artfive.accounts
             SET mobile_number = pending_phone, pending_phone = NULL, pending_phone_at = NULL, updated_at = NOW()
             WHERE id = $1`,
            [body.user_id]
          );
          return json(res, 200, { success: true, message: 'New phone approved and saved permanently.' });
        }
        await pool.query(
          `UPDATE my_artfive.accounts SET pending_phone = NULL, pending_phone_at = NULL, updated_at = NOW() WHERE id = $1`,
          [body.user_id]
        );
        return json(res, 200, { success: true, message: 'Phone change rejected.' });
      }

      if (p === '/api/admin/approve-delete' && req.method === 'POST') {
        const body = await getBody(req);
        const approve = !!body.approve;
        const row = await pool.query(
          `SELECT id, pending_delete, company_name FROM my_artfive.accounts WHERE id = $1 AND account_type = 'business' LIMIT 1`,
          [body.user_id]
        );
        if (!row.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        if (approve) {
          // permanent delete from Neon
          await pool.query('DELETE FROM my_artfive.sessions WHERE account_id = $1', [body.user_id]).catch(() => {});
          await pool.query('DELETE FROM my_artfive.password_resets WHERE account_id = $1', [body.user_id]).catch(() => {});
          await pool.query('DELETE FROM my_artfive.accounts WHERE id = $1', [body.user_id]);
          return json(res, 200, { success: true, message: 'Account permanently deleted from database.' });
        }
        await pool.query(
          `UPDATE my_artfive.accounts SET pending_delete = FALSE, pending_delete_at = NULL, updated_at = NOW() WHERE id = $1`,
          [body.user_id]
        );
        return json(res, 200, { success: true, message: 'Delete request rejected. Account kept.' });
      }

      if (p === '/api/admin/delete-account' && req.method === 'POST') {
        const body = await getBody(req);
        const row = await pool.query(
          `SELECT id FROM my_artfive.accounts WHERE id = $1 AND account_type = 'business' LIMIT 1`,
          [body.user_id]
        );
        if (!row.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        await pool.query('DELETE FROM my_artfive.sessions WHERE account_id = $1', [body.user_id]).catch(() => {});
        await pool.query('DELETE FROM my_artfive.password_resets WHERE account_id = $1', [body.user_id]).catch(() => {});
        await pool.query('DELETE FROM my_artfive.accounts WHERE id = $1', [body.user_id]);
        return json(res, 200, { success: true, message: 'Account permanently deleted from database.' });
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


      if (p === '/api/admin/access-requests') {
        const rows = await pool.query(`SELECT id, app_name, contact_email, contact_phone, website, note, status, api_key, created_at, decided_at,
          service_until, last_recharge_at, last_recharge_amount
          FROM my_artfive.access_requests ORDER BY created_at DESC LIMIT 100`);
        return json(res, 200, { success: true, requests: rows.rows });
      }
      if (p === '/api/admin/access-decide' && req.method === 'POST') {
        const body = await getBody(req);
        const approve = !!body.approve;
        const row = await pool.query('SELECT id FROM my_artfive.access_requests WHERE id = $1', [body.id]);
        if (!row.rows[0]) return json(res, 404, { success: false, error: 'Not found' });
        if (approve) {
          const apiKey = 'ma_' + crypto.randomBytes(20).toString('hex');
          const s = await getSettings();
          const freeDays = Number(s.free_days) || 5;
          await pool.query(
            `UPDATE my_artfive.access_requests
             SET status='approved', api_key=$1, decided_at=NOW(),
                 service_until = NOW() + ($2 || ' days')::interval,
                 last_recharge_at = NOW()
             WHERE id=$3`,
            [apiKey, String(freeDays), body.id]
          );
          return json(res, 200, {
            success: true,
            message: s.auth_success_message || "You're authorised from My ARTfive! Auth! Secure login! Successfully!",
            api_key: apiKey,
            service_until_days: freeDays
          });
        }
        await pool.query(`UPDATE my_artfive.access_requests SET status='rejected', decided_at=NOW() WHERE id=$1`, [body.id]);
        return json(res, 200, { success: true, message: 'Access rejected.' });
      }


      if (p === '/api/admin/record-recharge' && req.method === 'POST') {
        const body = await getBody(req);
        const s = await getSettings();
        const months = Math.max(1, Number(body.months) || Number(s.bill_months) || 1);
        const amount = Number(body.amount) || Number(s.bill_amount) || 100;
        const addDays = months * 30;
        if (body.request_id) {
          const r = await pool.query(
            `UPDATE my_artfive.access_requests
             SET last_recharge_at = NOW(),
                 last_recharge_amount = $1,
                 service_until = GREATEST(COALESCE(service_until, NOW()), NOW()) + ($2 || ' days')::interval,
                 status = CASE WHEN status = 'expired' THEN 'approved' ELSE status END
             WHERE id = $3 RETURNING id, service_until, last_recharge_at`,
            [amount, String(addDays), body.request_id]
          );
          if (!r.rows[0]) return json(res, 404, { success: false, error: 'Request not found' });
          return json(res, 200, { success: true, message: 'Auth service recharge recorded', row: r.rows[0] });
        }
        const r = await pool.query(
          `UPDATE my_artfive.accounts
           SET plan_months = COALESCE(plan_months,0) + $1,
               subscribed = true,
               account_status = CASE WHEN account_status = 'suspended' THEN 'active' ELSE account_status END,
               free_until = GREATEST(COALESCE(free_until, NOW()), NOW()) + ($2 || ' days')::interval,
               plan_expire_notified = FALSE,
               last_recharge_at = NOW(),
               last_recharge_amount = $3,
               last_recharge_months = $1,
               updated_at = NOW()
           WHERE id = $4 AND account_type = 'business'
           RETURNING id, company_name, free_until, last_recharge_at, last_recharge_amount`,
          [months, String(addDays), amount, body.user_id]
        );
        if (!r.rows[0]) return json(res, 404, { success: false, error: 'Customer not found' });
        return json(res, 200, { success: true, message: 'Customer recharge recorded', row: r.rows[0] });
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
          'business_types', 'portal_menu', 'admin_menu', 'force_upgrade', 'plan_expire_notification', 'auth_success_message', 'course_options',
          'connect_heading', 'connect_intro', 'connect_app_label', 'connect_link_label'
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
