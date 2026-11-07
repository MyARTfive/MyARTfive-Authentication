const API = 'http://localhost:4000/api';
let token = null;
let currentUser = null;
let loginType = 'business';
let settingsCache = null;
let viewingAsAdmin = false;

const screens = {
  login: document.getElementById('screen-login'),
  register: document.getElementById('screen-register'),
  business: document.getElementById('screen-business'),
  admin: document.getElementById('screen-admin')
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}
function show(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function msg(el, text, type = 'error') {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + type;
}
function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
}
async function loadSettings() {
  const r = await fetch(API + '/settings');
  const d = await r.json();
  settingsCache = d;
  paintMenus();
  return d;
}
function paintMenus() {
  const s = settingsCache || {};
  (s.business_menu || []).forEach(item => {
    const btn = document.querySelector('#b-menu .menu-btn[data-page="' + item.id + '"]');
    if (btn) btn.textContent = item.title;
  });
  (s.admin_menu || []).forEach(item => {
    const btn = document.querySelector('#a-menu .menu-btn[data-page="' + item.id + '"]');
    if (btn) btn.textContent = item.title;
  });
}
function descOf(list, id) {
  const item = (list || []).find(x => x.id === id);
  return item ? item.description : '';
}

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

document.getElementById('btn-login-business').onclick = async () => {
  const phone = document.getElementById('b-phone').value.trim();
  const password = document.getElementById('b-pass').value;
  await doLogin({ type: 'business', identifier: phone, password }, document.getElementById('login-msg'), 'business');
};
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
      viewingAsAdmin = false;
      msg(el, 'Login successful', 'ok');
      await loadSettings();
      setTimeout(() => {
        if (role === 'admin') {
          show('admin');
          resetAdmin();
        } else {
          document.getElementById('b-welcome').textContent = d.user.company_name || d.user.name || d.user.phone;
          document.getElementById('b-title').textContent = d.user.company_name || 'Business Dashboard';
          show('business');
          resetBusiness();
        }
      }, 300);
    } else msg(el, d.error || 'Login failed');
  } catch {
    msg(el, 'Cannot connect to server');
  }
}

function logout() {
  token = null;
  currentUser = null;
  viewingAsAdmin = false;
  show('login');
  document.getElementById('login-msg').textContent = '';
}
document.getElementById('btn-logout-b').onclick = () => {
  if (viewingAsAdmin) {
    viewingAsAdmin = false;
    show('admin');
    resetAdmin();
    return;
  }
  logout();
};
document.getElementById('btn-logout-a').onclick = logout;

const bContent = document.getElementById('b-content');
const bBack = document.getElementById('b-back');
const bMenu = document.getElementById('b-menu');
function resetBusiness() {
  bContent.classList.add('hidden');
  bBack.classList.add('hidden');
  bMenu.classList.remove('hidden');
  if (viewingAsAdmin) {
    document.getElementById('btn-logout-b').textContent = '← Back to My Dashboard';
  } else {
    document.getElementById('btn-logout-b').textContent = '7. Logout';
  }
}
bBack.onclick = () => {
  if (viewingAsAdmin) {
    viewingAsAdmin = false;
    show('admin');
    resetAdmin();
  } else resetBusiness();
};
document.querySelectorAll('#b-menu .menu-btn[data-page]').forEach(btn => {
  btn.onclick = () => openBusiness(btn.dataset.page, bContent, false);
});

function pageHead(title, description) {
  return `<h3>${esc(title)}</h3><p class="desc">${esc(description || '')}</p>`;
}

async function openBusiness(page, box, preview) {
  if (!preview) {
    bMenu.classList.add('hidden');
    bContent.classList.remove('hidden');
    bBack.classList.remove('hidden');
  }
  const s = settingsCache || await loadSettings();
  const d = descOf(s.business_menu, page);
  const title = ((s.business_menu || []).find(x => x.id === page) || {}).title || page;

  if (page === 'home') {
    box.innerHTML = pageHead(title, d) + `<p>Welcome${currentUser && currentUser.company_name ? ', ' + esc(currentUser.company_name) : ''}.</p>`;
  } else if (page === 'account') {
    const u = currentUser || {};
    box.innerHTML = pageHead(title, d) + `
      <div class="stat-row"><span>Company</span><strong>${esc(u.company_name || '—')}</strong></div>
      <div class="stat-row"><span>Phone</span><strong>${esc(u.phone || '—')}</strong></div>`;
  } else if (page === 'payments') {
    box.innerHTML = pageHead(title, d) + `
      <p class="upi">${esc(s.upi || '')}</p>
      <img class="qr-img" alt="QR code" src="${esc(s.qr_image || '/qr-demo.png')}" />
      <p class="desc">Demo QR for now. Admin can change it.</p>`;
  } else if (page === 'bill') {
    box.innerHTML = pageHead(title, d) + `<p>${esc(s.bill || '')}</p>`;
  } else if (page === 'notifications') {
    box.innerHTML = pageHead(title, d) + `
      <div class="stat-row"><span>1. Automatic</span></div>
      <p>${esc(s.auto_notification || '')}</p>
      <div class="stat-row"><span>2. From admin</span></div>
      <p>${esc(s.manual_notification || '')}</p>`;
  } else if (page === 'updates') {
    box.innerHTML = pageHead(title, d) + `<p>${esc(s.update_text || '')}</p>`;
  }
  box.innerHTML += `<button class="btn back inner-back">← Back to Menu</button>`;
  box.querySelector('.inner-back').onclick = () => {
    if (preview) resetAdmin();
    else if (viewingAsAdmin) { viewingAsAdmin = false; show('admin'); resetAdmin(); }
    else resetBusiness();
  };
}

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

function openPage() {
  aMenu.classList.add('hidden');
  aContent.classList.remove('hidden');
  aBack.classList.remove('hidden');
}

async function openAdmin(page) {
  openPage();
  const s = settingsCache || await loadSettings();
  const list = s.admin_menu || [];
  const item = list.find(x => x.id === page) || { title: page, description: '' };

  if (page === 'home') {
    aContent.innerHTML = pageHead(item.title, item.description) + `<p>Only your owner login can open My Dashboard.</p>`;
  } else if (page === 'businesses' || page === 'allow') {
    const r = await fetch(API + '/admin/businesses', { headers: authHeaders() });
    const d = await r.json();
    if (!d.success) { aContent.innerHTML = `<p class="msg error">${esc(d.error)}</p>`; return; }
    let html = pageHead(item.title, item.description);
    if (!d.businesses || !d.businesses.length) html += '<p>No businesses registered yet.</p>';
    (d.businesses || []).forEach(b => {
      html += `<div class="stat-row"><span><strong>${esc(b.company_name || '—')}</strong><br><small>${esc(b.phone)}</small></span><strong>${b.allowed ? 'Allowed' : 'Denied'}</strong></div>`;
      if (page === 'allow') {
        html += `<div class="row-actions">
          <button class="btn primary" data-allow="1" data-id="${esc(b.id)}">Allow</button>
          <button class="btn danger" data-allow="0" data-id="${esc(b.id)}">Deny</button>
        </div>`;
      }
    });
    aContent.innerHTML = html;
    aContent.querySelectorAll('[data-allow]').forEach(btn => {
      btn.onclick = async () => {
        const res = await fetch(API + '/admin/allow', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ user_id: btn.dataset.id, allowed: btn.dataset.allow === '1' })
        });
        const data = await res.json();
        if (data.success) openAdmin('allow');
        else alert(data.error || 'Failed');
      };
    });
  } else if (page === 'reset') {
    const r = await fetch(API + '/admin/businesses', { headers: authHeaders() });
    const d = await r.json();
    let options = '<option value="">Select company</option>';
    (d.businesses || []).forEach(b => {
      options += `<option value="${esc(b.id)}">${esc(b.company_name || b.phone)} — ${esc(b.phone)}</option>`;
    });
    aContent.innerHTML = pageHead(item.title, item.description) + `
      <h3>Reset a company password</h3>
      <label>Company</label>
      <select id="reset-user">${options}</select>
      <label>New password</label>
      <input type="password" id="reset-pass" />
      <button class="btn primary" id="do-reset">Reset company password</button>
      <p id="reset-msg" class="msg"></p>
      <h3 style="margin-top:1.2rem">Change my email and password</h3>
      <label>Current password</label>
      <input type="password" id="cur-pass" />
      <label>New email</label>
      <input type="email" id="new-email" placeholder="your@gmail.com" />
      <label>New password</label>
      <input type="password" id="new-pass" />
      <button class="btn primary" id="save-login">Save and logout</button>
      <p id="login-change-msg" class="msg"></p>`;
    document.getElementById('do-reset').onclick = async () => {
      const el = document.getElementById('reset-msg');
      const res = await fetch(API + '/admin/reset-password', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ user_id: document.getElementById('reset-user').value, password: document.getElementById('reset-pass').value })
      });
      const data = await res.json();
      msg(el, data.success ? 'Company password reset' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
    document.getElementById('save-login').onclick = async () => {
      const el = document.getElementById('login-change-msg');
      const res = await fetch(API + '/admin/change-login', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          current_password: document.getElementById('cur-pass').value,
          email: document.getElementById('new-email').value.trim(),
          new_password: document.getElementById('new-pass').value
        })
      });
      const data = await res.json();
      if (!data.success) { msg(el, data.error || 'Failed'); return; }
      msg(el, data.message, 'ok');
      setTimeout(logout, 1200);
    };
  } else if (page === 'notifications') {
    aContent.innerHTML = pageHead(item.title, item.description) + `
      <label>1. Automatic notification</label>
      <textarea id="auto-note">${esc(s.auto_notification || '')}</textarea>
      <label>2. Message I send</label>
      <textarea id="manual-note">${esc(s.manual_notification || '')}</textarea>
      <button class="btn primary" id="save-notes">Save notifications</button>
      <p id="note-msg" class="msg"></p>`;
    document.getElementById('save-notes').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          auto_notification: document.getElementById('auto-note').value,
          manual_notification: document.getElementById('manual-note').value
        })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('note-msg'), data.success ? 'Saved' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
  } else if (page === 'payment') {
    aContent.innerHTML = pageHead(item.title, item.description) + `
      <label>UPI number</label>
      <input id="edit-upi" value="${esc(s.upi || '8859063256')}" />
      <label>QR image address (leave demo if you have no new photo yet)</label>
      <input id="edit-qr" value="${esc(s.qr_image || '/qr-demo.png')}" />
      <img class="qr-img" alt="QR" src="${esc(s.qr_image || '/qr-demo.png')}" />
      <button class="btn primary" id="save-pay">Save UPI and QR</button>
      <p id="pay-msg" class="msg"></p>`;
    document.getElementById('save-pay').onclick = async () => {
      const upi = document.getElementById('edit-upi').value.trim();
      const qr_image = document.getElementById('edit-qr').value.trim();
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ upi, qr_image })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('pay-msg'), data.success ? 'Saved' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
  } else if (page === 'bill') {
    aContent.innerHTML = pageHead(item.title, item.description) + `
      <label>Bill text</label>
      <textarea id="edit-bill">${esc(s.bill || '')}</textarea>
      <button class="btn primary" id="save-bill">Send bill</button>
      <p id="bill-msg" class="msg"></p>`;
    document.getElementById('save-bill').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ bill: document.getElementById('edit-bill').value })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('bill-msg'), data.success ? 'Bill saved. Companies can see it.' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
  } else if (page === 'analysis') {
    const r = await fetch(API + '/admin/analysis', { headers: authHeaders() });
    const d = await r.json();
    const data = d.data || {};
    aContent.innerHTML = pageHead(item.title, item.description) + `
      <div class="stat-row"><span>1. Total Companies</span><strong>${data.companies ?? 0}</strong></div>
      <div class="stat-row"><span>2. Total Users</span><strong>${data.users ?? 0}</strong></div>
      <label>3. Subscribers (you can edit)</label>
      <input id="edit-sub" type="number" value="${data.subscribers ?? 0}" />
      <label>4. Ratings count (you can edit)</label>
      <input id="edit-rate" type="number" value="${data.ratings ?? 0}" />
      <label>5. Downloads (you can edit)</label>
      <input id="edit-dl" type="number" value="${data.downloads ?? 0}" />
      <button class="btn primary" id="save-an">Save counts</button>
      <p id="an-msg" class="msg"></p>
      <p class="desc">Companies and users are counted from real registrations.</p>`;
    document.getElementById('save-an').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          subscribers: Number(document.getElementById('edit-sub').value || 0),
          ratings: Number(document.getElementById('edit-rate').value || 0),
          downloads: Number(document.getElementById('edit-dl').value || 0)
        })
      });
      const out = await res.json();
      if (out.success) settingsCache = Object.assign(settingsCache || {}, out.settings);
      msg(document.getElementById('an-msg'), out.success ? 'Saved' : (out.error || 'Failed'), out.success ? 'ok' : 'error');
    };
  } else if (page === 'updates') {
    aContent.innerHTML = pageHead(item.title, item.description) + `
      <label>New app update text</label>
      <textarea id="edit-up">${esc(s.update_text || '')}</textarea>
      <button class="btn primary" id="save-up">Save update</button>
      <p id="up-msg" class="msg"></p>`;
    document.getElementById('save-up').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ update_text: document.getElementById('edit-up').value })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('up-msg'), data.success ? 'Saved' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
  } else if (page === 'view') {
    aContent.innerHTML = pageHead(item.title, item.description) + `<div id="preview-box"></div>`;
    const box = document.getElementById('preview-box');
    const buttons = (s.business_menu || []).map(m =>
      `<button class="menu-btn" data-b="${esc(m.id)}">${esc(m.title)}</button>`
    ).join('');
    box.innerHTML = `<div class="menu" id="preview-menu">${buttons}</div><div id="preview-page"></div>`;
    box.querySelectorAll('[data-b]').forEach(btn => {
      btn.onclick = () => openBusiness(btn.dataset.b, document.getElementById('preview-page'), true);
    });
  } else if (page === 'all-edit') {
    const full = await fetch(API + '/admin/settings', { headers: authHeaders() });
    const fd = await full.json();
    const st = fd.settings || s;
    let html = pageHead(item.title, item.description) + '<h3>My Dashboard names</h3>';
    (st.admin_menu || []).forEach((m, i) => {
      html += `<label>Title</label><input data-ak="title" data-ai="${i}" value="${esc(m.title)}" />
               <label>Description</label><input data-ak="description" data-ai="${i}" value="${esc(m.description)}" />`;
    });
    html += '<h3>Business Dashboard names</h3>';
    (st.business_menu || []).forEach((m, i) => {
      html += `<label>Title</label><input data-bk="title" data-bi="${i}" value="${esc(m.title)}" />
               <label>Description</label><input data-bk="description" data-bi="${i}" value="${esc(m.description)}" />`;
    });
    html += `<button class="btn primary" id="save-edit">Save all names</button><p id="edit-msg" class="msg"></p>`;
    aContent.innerHTML = html;
    document.getElementById('save-edit').onclick = async () => {
      const admin_menu = (st.admin_menu || []).map(m => ({ ...m }));
      const business_menu = (st.business_menu || []).map(m => ({ ...m }));
      aContent.querySelectorAll('[data-ai]').forEach(inp => {
        admin_menu[Number(inp.dataset.ai)][inp.dataset.ak] = inp.value;
      });
      aContent.querySelectorAll('[data-bi]').forEach(inp => {
        business_menu[Number(inp.dataset.bi)][inp.dataset.bk] = inp.value;
      });
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ admin_menu, business_menu })
      });
      const data = await res.json();
      if (data.success) {
        settingsCache = Object.assign(settingsCache || {}, data.settings, { admin_menu, business_menu });
        paintMenus();
      }
      msg(document.getElementById('edit-msg'), data.success ? 'Saved' : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
  }
  if (page !== 'view') {
    aContent.insertAdjacentHTML('beforeend', `<button class="btn back inner-back">← Back to Menu</button>`);
    aContent.querySelector('.inner-back').onclick = resetAdmin;
  }
}

loadSettings().catch(() => {});
show('login');
