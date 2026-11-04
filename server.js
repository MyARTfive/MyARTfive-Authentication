/**
 * ============================================================
 *  My ARTfive! (Authentication!)
 *  Authentication as a Service – Phase 1.5
 * ============================================================
 *  Admin  → Email + Password → My Dashboard!
 *  Business → Company Name + Phone + Password
 *  Ready for companies, schools, hotels, PRP etc.
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const DATA_DIR = __dirname;
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SECRET = process.env.AUTH_SECRET || 'myartfive-auth-secret-change-me-in-production';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return JSON.parse(JSON.stringify(fallback));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = loadJSON(USERS_FILE, []);
let settings = loadJSON(SETTINGS_FILE, {
  brand: { title: 'My ARTfive!', subtitle: '(Authentication!)' },
  upi: '',
  qr_image: '',
  app_analysis: { subscribers: 0, ratings: 0, users: 0, downloads: 0, companies: 0 },
  free_days: 7
});

// Create default Admin
if (!users.find(u => u.role === 'admin')) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('Admin@123', salt, 64).toString('hex');
  users.push({
    id: crypto.randomUUID(),
    role: 'admin',
    email: 'admin@myartfive.com',
    phone: null,
    company_name: null,
    password_hash: hash,
    salt,
    name: 'Admin',
    allowed: true,
    created_at: new Date().toISOString()
  });
  saveJSON(USERS_FILE, users);
  console.log('✓ Admin ready → admin@myartfive.com / Admin@123');
}

// Update company count
settings.app_analysis.companies = users.filter(u => u.role === 'business').length;
settings.app_analysis.users = users.filter(u => u.role === 'business').length;
saveJSON(SETTINGS_FILE, settings);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}
function createToken(user) {
  const payload = { id: user.id, role: user.role, exp: Date.now() + 15 * 60 * 1000 };
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
  } catch { return null; }
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
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}
function getAuthUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return users.find(u => u.id === payload.id) || null;
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
    // Login page and website files
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
    if (p === '/api/health') {
      return json(res, 200, {
        success: true,
        app: 'My ARTfive!',
        subtitle: '(Authentication!)',
        type: 'Authentication as a Service',
        version: '1.5.0',
        status: 'running'
      });
    }

    // ========== BUSINESS REGISTER ==========
    if (p === '/api/auth/register' && req.method === 'POST') {
      const body = await getBody(req);
      const company_name = (body.company_name || '').trim();
      const phone = (body.phone || '').trim();
      const password = body.password || '';
      const name = (body.name || '').trim() || company_name;

      if (!company_name) return json(res, 400, { success: false, error: 'Company / Business name is required' });
      if (!phone || phone.length < 10) return json(res, 400, { success: false, error: 'Valid phone number required' });
      if (password.length < 6) return json(res, 400, { success: false, error: 'Password must be at least 6 characters' });
      if (users.find(u => u.phone === phone)) {
        return json(res, 400, { success: false, error: 'This phone number is already registered' });
      }

      const { salt, hash } = hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        role: 'business',
        email: null,
        phone,
        company_name,
        password_hash: hash,
        salt,
        name,
        allowed: true,
        subscribed: false,
        created_at: new Date().toISOString()
      };
      users.push(user);
      settings.app_analysis.companies = users.filter(u => u.role === 'business').length;
      settings.app_analysis.users = settings.app_analysis.companies;
      saveJSON(USERS_FILE, users);
      saveJSON(SETTINGS_FILE, settings);

      return json(res, 201, {
        success: true,
        message: 'Business registered successfully. Please login.',
        user: { id: user.id, company_name: user.company_name, phone: user.phone, role: user.role }
      });
    }

    // ========== LOGIN ==========
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await getBody(req);
      const isAdmin = body.type === 'admin';
      const identifier = (body.identifier || '').trim();
      const password = body.password || '';

      let user = null;
      if (isAdmin) {
        user = users.find(u => u.role === 'admin' && u.email === identifier);
      } else {
        user = users.find(u => u.role === 'business' && u.phone === identifier);
      }

      if (!user) return json(res, 401, { success: false, error: 'Invalid credentials' });
      if (!user.allowed) return json(res, 403, { success: false, error: 'Account disabled by Admin' });
      if (!verifyPassword(password, user.salt, user.password_hash)) {
        return json(res, 401, { success: false, error: 'Invalid credentials' });
      }

      const token = createToken(user);
      return json(res, 200, {
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          email: user.email,
          phone: user.phone,
          company_name: user.company_name || null
        },
        expires_in_minutes: 15
      });
    }

    // Me
    if (p === '/api/auth/me') {
      const user = getAuthUser(req);
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
          subscribed: user.subscribed || false
        }
      });
    }

    // Logout
    if (p === '/api/auth/logout' && req.method === 'POST') {
      return json(res, 200, { success: true, message: 'Logged out' });
    }

    // Public analysis
    if (p === '/api/analysis') {
      return json(res, 200, {
        success: true,
        data: {
          companies: settings.app_analysis.companies,
          subscribers: settings.app_analysis.subscribers,
          ratings: settings.app_analysis.ratings,
          users: settings.app_analysis.users,
          downloads: settings.app_analysis.downloads
        }
      });
    }

    // Settings public
    if (p === '/api/settings') {
      return json(res, 200, {
        success: true,
        brand: settings.brand,
        upi: settings.upi,
        qr_image: settings.qr_image,
        free_days: settings.free_days
      });
    }

    // ========== ADMIN ROUTES ==========
    if (p.startsWith('/api/admin')) {
      const adminUser = getAuthUser(req);
      if (!adminUser || adminUser.role !== 'admin') {
        return json(res, 403, { success: false, error: 'Admin access only' });
      }

      // List all businesses
      if (p === '/api/admin/businesses') {
        const list = users.filter(u => u.role === 'business').map(u => ({
          id: u.id,
          company_name: u.company_name,
          name: u.name,
          phone: u.phone,
          allowed: u.allowed,
          subscribed: u.subscribed || false,
          created_at: u.created_at
        }));
        return json(res, 200, { success: true, count: list.length, businesses: list });
      }

      // Allow / Deny
      if (p === '/api/admin/allow' && req.method === 'POST') {
        const body = await getBody(req);
        const user = users.find(u => u.id === body.user_id);
        if (!user) return json(res, 404, { success: false, error: 'User not found' });
        user.allowed = !!body.allowed;
        saveJSON(USERS_FILE, users);
        return json(res, 200, { success: true, message: user.allowed ? 'Allowed' : 'Denied' });
      }

      // Update settings
      if (p === '/api/admin/settings' && req.method === 'POST') {
        const body = await getBody(req);
        if (body.upi !== undefined) settings.upi = body.upi;
        if (body.qr_image !== undefined) settings.qr_image = body.qr_image;
        if (body.brand) settings.brand = { ...settings.brand, ...body.brand };
        saveJSON(SETTINGS_FILE, settings);
        return json(res, 200, { success: true, message: 'Settings saved', settings });
      }

      // Analysis
      if (p === '/api/admin/analysis') {
        return json(res, 200, { success: true, data: settings.app_analysis });
      }
    }

    // Business subscribe
    if (p === '/api/business/subscribe' && req.method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      if (user.subscribed) return json(res, 400, { success: false, error: 'Already subscribed' });
      user.subscribed = true;
      settings.app_analysis.subscribers += 1;
      saveJSON(USERS_FILE, users);
      saveJSON(SETTINGS_FILE, settings);
      return json(res, 200, { success: true, message: 'Subscribed', subscribers: settings.app_analysis.subscribers });
    }

    if (p === '/api/business/unsubscribe' && req.method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.role !== 'business') return json(res, 401, { success: false, error: 'Login required' });
      if (!user.subscribed) return json(res, 400, { success: false, error: 'Not subscribed' });
      user.subscribed = false;
      settings.app_analysis.subscribers = Math.max(0, settings.app_analysis.subscribers - 1);
      saveJSON(USERS_FILE, users);
      saveJSON(SETTINGS_FILE, settings);
      return json(res, 200, { success: true, message: 'Unsubscribed', subscribers: settings.app_analysis.subscribers });
    }

    json(res, 404, { success: false, error: 'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { success: false, error: 'Server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('       My ARTfive!');
  console.log('   (Authentication!)');
  console.log('   Authentication as a Service');
  console.log('══════════════════════════════════════════');
  console.log(`  → http://localhost:${PORT}`);
  console.log('');
  console.log('  Admin: admin@myartfive.com / Admin@123');
  console.log('  Business: Register with Company Name + Phone');
  console.log('══════════════════════════════════════════');
  console.log('');
});
