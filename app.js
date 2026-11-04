const API = 'http://localhost:4000/api';
let token = null;
let currentUser = null;
let loginType = 'business';

const screens = {
  login: document.getElementById('screen-login'),
  register: document.getElementById('screen-register'),
  business: document.getElementById('screen-business'),
  admin: document.getElementById('screen-admin')
};

function show(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function msg(el, text, type = 'error') {
  el.textContent = text;
  el.className = 'msg ' + type;
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loginType = tab.dataset.type;
    document.getElementById('login-business').classList.toggle('hidden', loginType !== 'business');
    document.getElementById('login-admin').classList.toggle('hidden', loginType !== 'admin');
  });
});

document.getElementById('go-register').onclick = () => show('register');
document.getElementById('go-login').onclick = () => show('login');

// Register Business
document.getElementById('btn-register').onclick = async () => {
  const company_name = document.getElementById('r-company').value.trim();
  const name = document.getElementById('r-name').value.trim();
  const phone = document.getElementById('r-phone').value.trim();
  const password = document.getElementById('r-pass').value;
  const el = document.getElementById('reg-msg');

  try {
    const r = await fetch(API + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name, name, phone, password })
    });
    const d = await r.json();
    if (d.success) {
      msg(el, d.message, 'ok');
      setTimeout(() => show('login'), 1500);
    } else msg(el, d.error || 'Registration failed');
  } catch {
    msg(el, 'Cannot connect to server');
  }
};

// Login Business
document.getElementById('btn-login-business').onclick = async () => {
  const phone = document.getElementById('b-phone').value.trim();
  const password = document.getElementById('b-pass').value;
  await doLogin({ type: 'business', identifier: phone, password }, document.getElementById('login-msg'), 'business');
};

// Login Admin
document.getElementById('btn-login-admin').onclick = async () => {
  const email = document.getElementById('a-email').value.trim();
  const password = document.getElementById('a-pass').value;
  await doLogin({ type: 'admin', identifier: email, password }, document.getElementById('login-msg'), 'admin');
};

async function doLogin(payload, el, role) {
  try {
    const r = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.success) {
      token = d.token;
      currentUser = d.user;
      msg(el, 'Login successful', 'ok');
      setTimeout(() => {
        if (role === 'admin') {
          show('admin');
          resetAdmin();
        } else {
          document.getElementById('b-welcome').textContent =
            (d.user.company_name || d.user.name || d.user.phone);
          document.getElementById('b-title').textContent = d.user.company_name || 'Business Dashboard';
          show('business');
          resetBusiness();
        }
      }, 400);
    } else msg(el, d.error || 'Login failed');
  } catch {
    msg(el, 'Cannot connect. Is server running on port 4000?');
  }
}

function logout() {
  token = null;
  currentUser = null;
  show('login');
  document.getElementById('login-msg').textContent = '';
}
document.getElementById('btn-logout-b').onclick = logout;
document.getElementById('btn-logout-a').onclick = logout;

// Business menu
const bContent = document.getElementById('b-content');
const bBack = document.getElementById('b-back');
const bMenu = document.getElementById('b-menu');
function resetBusiness() {
  bContent.classList.add('hidden');
  bBack.classList.add('hidden');
  bMenu.classList.remove('hidden');
}
bBack.onclick = resetBusiness;

document.querySelectorAll('#b-menu .menu-btn[data-page]').forEach(btn => {
  btn.onclick = () => openBusiness(btn.dataset.page);
});

async function openBusiness(page) {
  bMenu.classList.add('hidden');
  bContent.classList.remove('hidden');
  bBack.classList.remove('hidden');

  if (page === 'home') {
    const r = await fetch(API + '/analysis');
    const d = await r.json();
    bContent.innerHTML = `
      <h3>Home</h3>
      <div class="stat-row"><span>Total Companies</span><strong>${d.data?.companies ?? 0}</strong></div>
      <div class="stat-row"><span>Total Subscribers</span><strong>${d.data?.subscribers ?? 0}</strong></div>
      <div class="stat-row"><span>Total Users</span><strong>${d.data?.users ?? 0}</strong></div>
    `;
  } else if (page === 'account') {
    bContent.innerHTML = `
      <h3>My Account</h3>
      <p><strong>Company:</strong> ${currentUser?.company_name || '—'}</p>
      <p><strong>Name:</strong> ${currentUser?.name || '—'}</p>
      <p><strong>Phone:</strong> ${currentUser?.phone || '—'}</p>
      <p style="margin-top:0.8rem;font-size:0.85rem;color:#5a6a7a">Password is secure. Admin cannot see it.</p>
    `;
  } else if (page === 'payments') {
    const r = await fetch(API + '/settings');
    const d = await r.json();
    bContent.innerHTML = `
      <h3>Payments (UPI + QR)</h3>
      <p><strong>UPI:</strong></p>
      <p style="background:#eef3fb;padding:0.6rem;border-radius:8px">${d.upi || 'Not set yet'}</p>
      <p style="margin-top:0.8rem"><strong>QR:</strong> ${d.qr_image ? 'Available' : 'Not uploaded'}</p>
    `;
  } else if (page === 'bill') {
    bContent.innerHTML = `<h3>My Bill</h3><p>No bill at the moment.</p>`;
  } else if (page === 'notifications') {
    bContent.innerHTML = `
      <h3>Notifications</h3>
      <div class="stat-row">1. Payment Notification</div>
      <div class="stat-row">2. Recharge Notification</div>
    `;
  } else if (page === 'updates') {
    bContent.innerHTML = `<h3>New App Update</h3><p>No new features yet.</p>`;
  }
}

// Admin menu
const aContent = document.getElementById('a-content');
const aBack = document.getElementById('a-back');
const aMenu = document.getElementById('a-menu');
function resetAdmin() {
  aContent.classList.add('hidden');
  aBack.classList.add('hidden');
  aMenu.classList.remove('hidden');
}
aBack.onclick = resetAdmin;

document.querySelectorAll('#a-menu .menu-btn[data-page]').forEach(btn => {
  btn.onclick = () => openAdmin(btn.dataset.page);
});

async function openAdmin(page) {
  aMenu.classList.add('hidden');
  aContent.classList.remove('hidden');
  aBack.classList.remove('hidden');

  if (page === 'home') {
    aContent.innerHTML = `<h3>Dashboard Home</h3><p>Welcome to My Dashboard!</p><p style="font-size:0.85rem;color:#5a6a7a;margin-top:0.5rem">Authentication as a Service – Full Control</p>`;
  } else if (page === 'businesses') {
    const r = await fetch(API + '/admin/businesses', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!d.success) { aContent.innerHTML = `<p class="msg error">${d.error}</p>`; return; }
    let html = `<h3>Businesses / Companies (${d.count})</h3>`;
    (d.businesses || []).forEach(b => {
      html += `<div class="stat-row">
        <span><strong>${b.company_name || '—'}</strong><br><small>${b.phone}</small></span>
        <strong>${b.allowed ? 'Allowed' : 'Denied'}</strong>
      </div>`;
    });
    aContent.innerHTML = html || '<p>No businesses registered yet</p>';
  } else if (page === 'analysis') {
    const r = await fetch(API + '/admin/analysis', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    aContent.innerHTML = `
      <h3>App Analysis</h3>
      <div class="stat-row"><span>1. Total Companies</span><strong>${d.data?.companies ?? 0}</strong></div>
      <div class="stat-row"><span>2. Total Subscribers</span><strong>${d.data?.subscribers ?? 0}</strong></div>
      <div class="stat-row"><span>3. Total Users</span><strong>${d.data?.users ?? 0}</strong></div>
      <div class="stat-row"><span>4. Total Downloads</span><strong>${d.data?.downloads ?? 0}</strong></div>
    `;
  } else if (page === 'payment') {
    const r = await fetch(API + '/settings');
    const d = await r.json();
    aContent.innerHTML = `
      <h3>Payment Settings</h3>
      <label>UPI Number</label>
      <input type="text" id="edit-upi" value="${d.upi || ''}" placeholder="your-upi@bank" />
      <label>QR Image URL</label>
      <input type="text" id="edit-qr" value="${d.qr_image || ''}" placeholder="https://..." />
      <button class="btn primary" id="save-pay">Save</button>
      <p id="pay-msg" class="msg"></p>
    `;
    document.getElementById('save-pay').onclick = async () => {
      const upi = document.getElementById('edit-upi').value.trim();
      const qr = document.getElementById('edit-qr').value.trim();
      const res = await fetch(API + '/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ upi, qr_image: qr })
      });
      const data = await res.json();
      msg(document.getElementById('pay-msg'), data.success ? 'Saved' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
  } else if (page === 'allow') {
    aContent.innerHTML = `<h3>Allow / Deny</h3><p>Go to “Businesses / Companies” to see list. Full allow/deny control coming next update.</p>`;
  } else if (page === 'all-edit') {
    aContent.innerHTML = `<h3>All Edit</h3><p>Edit UPI, QR and settings from Payment Settings. More edit options coming.</p>`;
  } else if (page === 'notifications') {
    aContent.innerHTML = `<h3>Notifications</h3><div class="stat-row">1. Auto Notifications</div><div class="stat-row">2. Manual Notifications</div>`;
  } else if (page === 'reset') {
    aContent.innerHTML = `<h3>Reset Password</h3><p>Admin can reset business password (next update).</p>`;
  } else if (page === 'bill') {
    aContent.innerHTML = `<h3>Send Bill</h3><p>Send bill to businesses (next update).</p>`;
  } else if (page === 'updates') {
    aContent.innerHTML = `<h3>App Updates</h3><p>Publish new features for businesses.</p>`;
  } else if (page === 'view') {
    aContent.innerHTML = `<h3>View Business Dashboard</h3><p>View any business dashboard (next update).</p>`;
  }
}

show('login');
