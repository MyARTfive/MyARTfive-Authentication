const API = 'http://localhost:4000/api';
let token = null;
let currentUser = null;
let settingsCache = null;
let selectedStars = 0;
let viewingPortalAsAdmin = false;

const screens = {
  splash: document.getElementById('screen-splash'),
  login: document.getElementById('screen-login'),
  register: document.getElementById('screen-register'),
  portal: document.getElementById('screen-portal'),
  admin: document.getElementById('screen-admin')
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function show(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function msg(el, text, type) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg' + (type ? ' ' + type : '');
}
function blockAutofill() {
  ['b-phone','b-pass','a-email','a-pass','r-phone','r-pass','r-name','r-company'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('autocomplete', 'off');
    el.value = '';
  });
}
function headers() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
}
async function loadPublic() {
  try {
    const r = await fetch(API + '/public');
    const d = await r.json();
    if (d.counts) {
      document.getElementById('c-sub').textContent = d.counts.subscribers || 0;
      document.getElementById('c-rate').textContent = d.counts.ratings || 0;
      document.getElementById('c-user').textContent = d.counts.users || 0;
    }
    if (d.business_types) fillTypes(d.business_types);
  } catch (_) {}
}
async function loadSettings() {
  const r = await fetch(API + '/settings');
  const d = await r.json();
  settingsCache = d;
  paintMenus();
  return d;
}
function fillTypes(list) {
  const sel = document.getElementById('r-type');
  sel.innerHTML = '';
  (list || []).forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
}
function paintMenus() {
  const s = settingsCache || {};
  const pMenu = document.getElementById('p-menu');
  if (!pMenu) return;
  pMenu.innerHTML = '';
  const items = (s.portal_menu && s.portal_menu.length)
    ? s.portal_menu
    : [
        { id: 'home', title: '1. Home' },
        { id: 'account', title: '2. My Account' },
        { id: 'payments', title: '3. Payments (UPI + QR)' },
        { id: 'bill', title: '4. My Bill' },
        { id: 'recharge', title: '5. Recharge My Bill' },
        { id: 'notifications', title: '6. My Notifications' },
        { id: 'updates', title: '7. New App Update' },
        { id: 'settings', title: '8. My Settings' }
      ];
  items.forEach(item => {
    const b = document.createElement('button');
    b.className = 'menu-btn';
    b.dataset.page = item.id;
    b.textContent = item.title;
    b.onclick = () => openPortal(item.id);
    pMenu.appendChild(b);
  });
  // Always last item under option 8
  if (viewingPortalAsAdmin) {
    const back = document.createElement('button');
    back.className = 'menu-btn';
    back.id = 'portal-end-btn';
    back.textContent = '← Back to My Dashboard';
    back.onclick = () => {
      viewingPortalAsAdmin = false;
      show('admin');
      resetAdmin();
    };
    pMenu.appendChild(back);
  } else {
    const lo = document.createElement('button');
    lo.className = 'menu-btn danger';
    lo.id = 'portal-end-btn';
    lo.style.cssText = 'background:#fdecea;color:#c0392b;border:1px solid #f5c6c2;font-weight:700;margin-top:0.5rem;';
    lo.textContent = 'Logout';
    lo.onclick = () => {
      const ok = confirm((settingsCache && settingsCache.logout_message) ||
        'My ARTfive! will remove you from all sessions on this device. Log out?');
      if (ok) doLogout();
    };
    pMenu.appendChild(lo);
  }
}
function paintAdminMenu(list) {
  const aMenu = document.getElementById('a-menu');
  aMenu.innerHTML = '';
  (list || []).forEach(item => {
    const b = document.createElement('button');
    b.className = 'menu-btn';
    b.dataset.page = item.id;
    b.textContent = item.title;
    b.onclick = () => openAdmin(item.id);
    aMenu.appendChild(b);
  });
  const lo = document.createElement('button');
  lo.className = 'menu-btn danger';
  lo.textContent = 'Logout';
  lo.onclick = doLogout;
  aMenu.appendChild(lo);
}
function descOf(list, id) {
  const item = (list || []).find(x => x.id === id);
  return item ? item.description : '';
}
function titleOf(list, id, fallback) {
  const item = (list || []).find(x => x.id === id);
  return item ? item.title : fallback;
}

document.getElementById('btn-enter').onclick = () => {
  show('login');
  loadPublic();
};
function openAdminLogin(e) {
  if (e) e.preventDefault();
  show('login');
  document.getElementById('card-portal-login').classList.add('hidden');
  document.getElementById('card-admin-login').classList.remove('hidden');
  const el = document.getElementById('admin-msg');
  if (el) { el.textContent = ''; el.className = 'msg'; }
}
document.getElementById('open-admin').onclick = openAdminLogin;
document.getElementById('open-admin-2').onclick = openAdminLogin;
document.getElementById('open-admin').ontouchend = function(e){ e.preventDefault(); openAdminLogin(e); };
document.getElementById('open-admin-2').ontouchend = function(e){ e.preventDefault(); openAdminLogin(e); };
document.getElementById('hide-admin').onclick = () => {
  document.getElementById('card-admin-login').classList.add('hidden');
  document.getElementById('card-portal-login').classList.remove('hidden');
};

document.getElementById('go-register').onclick = () => { show('register'); loadPublic(); };
document.getElementById('go-login').onclick = () => show('login');
document.getElementById('forgot-pass').onclick = () => {
  msg(document.getElementById('login-msg'), 'Contact My ARTfive! owner to reset your password from My Dashboard.', 'error');
};
document.getElementById('login-logout').onclick = () => {
  const ok = confirm((settingsCache && settingsCache.logout_message) ||
    'My ARTfive! will remove you from this page. Do you want to log out?');
  if (!ok) return;
  token = null;
  currentUser = null;
  document.getElementById('b-phone').value = '';
  document.getElementById('b-pass').value = '';
  document.getElementById('a-email').value = '';
  document.getElementById('a-pass').value = '';
  blockAutofill();
  show('splash');
  msg(document.getElementById('login-msg'), '', '');
};

document.getElementById('star-row').querySelectorAll('button').forEach(btn => {
  btn.onclick = () => {
    selectedStars = Number(btn.dataset.s);
    document.getElementById('star-row').querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.s) <= selectedStars);
    });
  };
});
function clearStars() {
  selectedStars = 0;
  document.getElementById('star-row').querySelectorAll('button').forEach(b => b.classList.remove('on'));
}
document.getElementById('btn-rate').onclick = async () => {
  const el = document.getElementById('rate-msg');
  if (!token || !currentUser || currentUser.role !== 'business') {
    msg(el, 'Login to My Portal first, then rate.');
    return;
  }
  if (!selectedStars) { msg(el, 'Select stars first'); return; }
  try {
    const r = await fetch(API + '/portal/rate', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ stars: selectedStars })
    });
    const d = await r.json();
    msg(el, d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
    clearStars();
    loadPublic();
  } catch { msg(el, 'Cannot connect'); }
};
document.getElementById('btn-subscribe').onclick = async () => {
  const el = document.getElementById('rate-msg');
  if (!token || !currentUser || currentUser.role !== 'business') {
    msg(el, 'Login to My Portal first, then subscribe.');
    return;
  }
  try {
    const r = await fetch(API + '/portal/subscribe', { method: 'POST', headers: headers() });
    const d = await r.json();
    msg(el, d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
    loadPublic();
  } catch { msg(el, 'Cannot connect'); }
};

document.getElementById('btn-register').onclick = async () => {
  const el = document.getElementById('reg-msg');
  const custom = document.getElementById('r-type-custom').value.trim();
  const business_type = custom || document.getElementById('r-type').value;
  try {
    const r = await fetch(API + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: document.getElementById('r-company').value.trim(),
        full_name: document.getElementById('r-name').value.trim(),
        phone: document.getElementById('r-phone').value.trim(),
        password: document.getElementById('r-pass').value,
        business_type
      })
    });
    const d = await r.json();
    if (d.success) {
      msg(el, d.message, 'ok');
      setTimeout(() => show('login'), 1200);
      loadPublic();
    } else msg(el, d.error || 'Failed');
  } catch { msg(el, 'Cannot connect'); }
};

document.getElementById('btn-login-business').onclick = async () => {
  const el = document.getElementById('login-msg');
  try {
    const r = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'business',
        identifier: document.getElementById('b-phone').value.trim(),
        password: document.getElementById('b-pass').value
      })
    });
    const d = await r.json();
    if (!d.success) { msg(el, d.error || 'Login failed'); return; }
    token = d.token;
    currentUser = d.user;
    viewingPortalAsAdmin = false;
    document.getElementById('b-phone').value = '';
    document.getElementById('b-pass').value = '';
    blockAutofill();
    await loadSettings();
    document.getElementById('portal-title').textContent = 'My Portal';
    document.getElementById('portal-welcome').textContent = 'Welcome. Your My ARTfive! account is active.';
    show('portal');
    viewingPortalAsAdmin = false;
    resetPortal();
    paintMenus();
    loadPublic();
  } catch { msg(el, 'Cannot connect'); }
};

document.getElementById('btn-login-admin').onclick = async () => {
  const el = document.getElementById('admin-msg');
  try {
    const r = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'admin',
        identifier: document.getElementById('a-email').value.trim(),
        password: document.getElementById('a-pass').value
      })
    });
    const d = await r.json();
    if (!d.success) { msg(el, d.error || 'Login failed'); return; }
    token = d.token;
    currentUser = d.user;
    viewingPortalAsAdmin = false;
    document.getElementById('a-email').value = '';
    document.getElementById('a-pass').value = '';
    blockAutofill();
    const full = await fetch(API + '/admin/settings', { headers: headers() });
    const fd = await full.json();
    settingsCache = Object.assign({}, settingsCache || {}, fd.settings || {});
    paintMenus();
    paintAdminMenu(settingsCache.admin_menu);
    show('admin');
    resetAdmin();
    const loBtn = document.getElementById('btn-logout-a');
    if (loBtn) loBtn.classList.add('hidden');
  } catch { msg(el, 'Cannot connect'); }
};

async function doLogout() {
  try {
    if (token) await fetch(API + '/auth/logout', { method: 'POST', headers: headers() });
  } catch (_) {}
  token = null;
  currentUser = null;
  viewingPortalAsAdmin = false;
  show('login');
  document.getElementById('card-admin-login').classList.add('hidden');
  document.getElementById('card-portal-login').classList.remove('hidden');
  msg(document.getElementById('login-msg'), (settingsCache && settingsCache.logout_message) || 'Logged out', 'ok');
  loadPublic();
}
document.getElementById('btn-logout-a').onclick = doLogout;
document.getElementById('btn-back-dash').onclick = () => {
  viewingPortalAsAdmin = false;
  show('admin');
  resetAdmin();
};

const pContent = document.getElementById('p-content');
const pBack = document.getElementById('p-back');
const pMenu = document.getElementById('p-menu');
function resetPortal() {
  pContent.classList.add('hidden');
  pBack.classList.add('hidden');
  pMenu.classList.remove('hidden');
  const backDash = document.getElementById('btn-back-dash');
  if (backDash) backDash.classList.add('hidden');
  paintMenus();
}
pBack.onclick = () => {
  // Always return to My Portal menu (not logout, not dashboard)
  resetPortal();
};

async function openPortal(page) {
  pMenu.classList.add('hidden');
  pContent.classList.remove('hidden');
  pBack.classList.remove('hidden');
  const s = settingsCache || await loadSettings();
  const title = titleOf(s.portal_menu, page, page);
  const desc = descOf(s.portal_menu, page);
  const u = currentUser || {};

  if (page === 'home') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p>Welcome. Your My ARTfive! account is active.</p>
      <p class="note">My Portal</p>`;
  } else if (page === 'account') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <div class="stat-row"><span>Full name</span><strong>${esc(u.full_name || '—')}</strong></div>
      <div class="stat-row"><span>Contact number</span><strong>${esc(u.phone || '—')}</strong></div>
      <div class="stat-row"><span>Company name</span><strong>${esc(u.company_name || '—')}</strong></div>
      <div class="stat-row"><span>Business type</span><strong>${esc(u.business_type || '—')}</strong></div>`;
  } else if (page === 'payments') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p class="upi">${esc(s.upi || '')}</p>
      <img class="qr-img" alt="QR" src="${esc(s.qr_image || '/qr-demo.png')}" />`;
  } else if (page === 'bill') {
    const amount = Number(s.bill_amount != null ? s.bill_amount : s.plan_amount) || 100;
    const months = Number(s.bill_months) || 1;
    const text = (s.bill_text || '').split('\n').map(line => `<div class="stat-row"><span>${esc(line)}</span></div>`).join('');
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <div class="stat-row"><span>Amount to pay</span><strong>$${amount}/-</strong></div>
      <div class="stat-row"><span>Months</span><strong>${months}</strong></div>
      ${text}
      <p class="note">Your months paid: ${esc(u.plan_months || 0)}</p>`;
  } else if (page === 'recharge') {
    const amount = Number(s.bill_amount != null ? s.bill_amount : s.plan_amount) || 100;
    const months = Number(s.bill_months) || 1;
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <div class="stat-row"><span>Total amount</span><strong>$${amount}/-</strong></div>
      <div class="stat-row"><span>Total month count</span><strong>${months}</strong></div>
      <p class="upi">${esc(s.upi || '')}</p>
      <img class="qr-img" alt="QR" src="${esc(s.qr_image || '/qr-demo.png')}" />
      <button class="btn primary" id="do-recharge">I paid — confirm recharge</button>
      <p id="rec-msg" class="msg"></p>`;
    document.getElementById('do-recharge').onclick = async () => {
      const r = await fetch(API + '/portal/recharge', {
        method: 'POST', headers: headers(), body: JSON.stringify({ months: 1 })
      });
      const d = await r.json();
      msg(document.getElementById('rec-msg'), d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
      if (d.success) {
        currentUser.plan_months = (Number(currentUser.plan_months) || 0) + 1;
        openPortal('recharge');
      }
    };
  } else if (page === 'notifications') {
    pContent.innerHTML = `<h3>${esc(title)}</h3>
      <p class="desc">Messages from My ARTfive!</p>
      <p>${esc(s.auto_notification || '')}</p>
      <p style="margin-top:0.6rem">${esc(s.manual_notification || '')}</p>`;
  } else if (page === 'updates') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p>${esc(s.update_text || '')}</p>`;
  } else if (page === 'settings') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <label>Old password</label><input type="password" id="old-p" autocomplete="off" />
      <label>New password</label><input type="password" id="new-p" autocomplete="off" />
      <button class="btn primary" id="save-p">Save</button>
      <p id="set-msg" class="msg"></p>`;
    document.getElementById('save-p').onclick = async () => {
      const r = await fetch(API + '/portal/change-password', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          current_password: document.getElementById('old-p').value,
          new_password: document.getElementById('new-p').value
        })
      });
      const d = await r.json();
      msg(document.getElementById('set-msg'), d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
    };
  }
}

const aContent = document.getElementById('a-content');
const aBack = document.getElementById('a-back');
const aMenu = document.getElementById('a-menu');
function resetAdmin() {
  aContent.classList.add('hidden');
  aBack.classList.add('hidden');
  aMenu.classList.remove('hidden');
  const lo = document.getElementById('btn-logout-a');
  if (lo) lo.classList.add('hidden');
}
aBack.onclick = resetAdmin;

async function openAdmin(page) {
  aMenu.classList.add('hidden');
  aContent.classList.remove('hidden');
  aBack.classList.remove('hidden');
  const loBtn = document.getElementById('btn-logout-a');
  if (loBtn) loBtn.classList.add('hidden');

  const full = await fetch(API + '/admin/settings', { headers: headers() });
  const fd = await full.json();
  const s = fd.settings || settingsCache || {};
  settingsCache = Object.assign({}, settingsCache || {}, s);
  const title = titleOf(s.admin_menu, page, page);
  const desc = descOf(s.admin_menu, page);

  if (page === 'home') {
    aContent.innerHTML = `<h3>${esc(title)}</h3><p>${esc(desc || 'Welcome to My Dashboard!')}</p>`;
  } else if (page === 'businesses' || page === 'allow') {
    const r = await fetch(API + '/admin/businesses', { headers: headers() });
    const d = await r.json();
    let html = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p class="note">Total customers: ${d.count || 0}</p>`;
    (d.businesses || []).forEach(b => {
      html += `<div class="stat-row"><span>
        <strong>${esc(b.full_name || '—')}</strong><br>
        <small>${esc(b.phone || '')}</small><br>
        <small>${esc(b.company_name || '')} · ${esc(b.business_type || '')}</small>
      </span><strong>${b.allowed ? 'Yes' : 'No'}</strong></div>`;
      if (page === 'allow') {
        html += `<div class="row-actions">
          <button class="btn primary" data-id="${esc(b.id)}" data-allow="1">Yes</button>
          <button class="btn danger" data-id="${esc(b.id)}" data-allow="0">No</button>
        </div>`;
      }
    });
    aContent.innerHTML = html;
    aContent.querySelectorAll('[data-allow]').forEach(btn => {
      btn.onclick = async () => {
        await fetch(API + '/admin/allow', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ user_id: btn.dataset.id, allowed: btn.dataset.allow === '1' })
        });
        openAdmin('allow');
      };
    });
  } else if (page === 'reset') {
    const r = await fetch(API + '/admin/businesses', { headers: headers() });
    const d = await r.json();
    let opts = '<option value="">Select company</option>';
    (d.businesses || []).forEach(b => {
      opts += `<option value="${esc(b.id)}" data-phone="${esc(b.phone)}">${esc(b.company_name)} — ${esc(b.full_name || '')} — ${esc(b.phone)}</option>`;
    });
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <h3>Reset a Company Password</h3>
      <label>Company</label><select id="rst-user">${opts}</select>
      <p class="note" id="rst-meta"></p>
      <button class="btn danger" id="rst-clear">Delete the company's old password</button>
      <label>Create a new password</label><input type="password" id="rst-pass" />
      <button class="btn primary" id="rst-save">Save the password and send it</button>
      <p id="rst-msg" class="msg"></p>
      <h3 style="margin-top:1rem">Change My Email and Password</h3>
      <label>Current Password</label><input type="password" id="cur-pass" />
      <label>New Email</label><input type="email" id="new-email" placeholder="your@gmail.com" />
      <label>New Password</label><input type="password" id="new-pass" />
      <button class="btn primary" id="save-login">Save and Logout</button>
      <p id="own-msg" class="msg"></p>`;
    const meta = () => {
      const sel = document.getElementById('rst-user');
      const o = sel.options[sel.selectedIndex];
      document.getElementById('rst-meta').textContent = o && o.value
        ? 'Company Login ID Number: ' + (o.dataset.phone || '')
        : '';
    };
    document.getElementById('rst-user').onchange = meta;
    document.getElementById('rst-clear').onclick = async () => {
      const id = document.getElementById('rst-user').value;
      if (!id) return msg(document.getElementById('rst-msg'), 'Select company');
      const res = await fetch(API + '/admin/clear-password', {
        method: 'POST', headers: headers(), body: JSON.stringify({ user_id: id })
      });
      const data = await res.json();
      msg(document.getElementById('rst-msg'), data.success ? data.message : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
    document.getElementById('rst-save').onclick = async () => {
      const res = await fetch(API + '/admin/reset-password', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          user_id: document.getElementById('rst-user').value,
          password: document.getElementById('rst-pass').value
        })
      });
      const data = await res.json();
      msg(document.getElementById('rst-msg'), data.success ? data.message : (data.error || 'Failed'), data.success ? 'ok' : 'error');
    };
    document.getElementById('save-login').onclick = async () => {
      const res = await fetch(API + '/admin/change-login', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          current_password: document.getElementById('cur-pass').value,
          email: document.getElementById('new-email').value.trim(),
          new_password: document.getElementById('new-pass').value
        })
      });
      const data = await res.json();
      if (!data.success) return msg(document.getElementById('own-msg'), data.error || 'Failed');
      msg(document.getElementById('own-msg'), data.message, 'ok');
      setTimeout(doLogout, 1000);
    };
  } else if (page === 'notifications') {
    const suggestions = (s.notification_suggestions || []).map(t =>
      `<button type="button" data-sug="${esc(t)}">${esc(t)}</button>`
    ).join('');
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <div class="suggest">${suggestions}</div>
      <label>Automatic notification</label>
      <textarea id="auto-n">${esc(s.auto_notification || '')}</textarea>
      <label>Message to My Portal</label>
      <textarea id="man-n">${esc(s.manual_notification || '')}</textarea>
      <button class="btn primary" id="save-n">Save</button>
      <p id="n-msg" class="msg"></p>`;
    aContent.querySelectorAll('[data-sug]').forEach(btn => {
      btn.onclick = () => {
        const t = document.getElementById('man-n');
        t.value = (t.value ? t.value + '\n' : '') + btn.dataset.sug;
      };
    });
    document.getElementById('save-n').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          auto_notification: document.getElementById('auto-n').value,
          manual_notification: document.getElementById('man-n').value
        })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('n-msg'), data.success ? 'Saved' : 'Failed', data.success ? 'ok' : 'error');
    };
  } else if (page === 'payment') {
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <label>Change UPI number</label>
      <input id="edit-upi" value="${esc(s.upi || '')}" autocomplete="off" />
      <label>Upload QR code photo</label>
      <input type="file" id="edit-qr-file" accept="image/*" />
      <label>Or QR image link (optional)</label>
      <input id="edit-qr" value="" placeholder="Leave empty to keep current QR" autocomplete="off" />
      <img class="qr-img" id="qr-preview" src="${esc(s.qr_image || '/qr-demo.png')}" alt="QR" />
      <button class="btn primary" id="save-pay">Save</button>
      <p id="pay-msg" class="msg"></p>`;
    let pendingQr = null;
    document.getElementById('edit-qr-file').onchange = (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      if (file.size > 900000) {
        msg(document.getElementById('pay-msg'), 'Photo too large. Use a smaller QR image.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        pendingQr = reader.result;
        document.getElementById('qr-preview').src = pendingQr;
      };
      reader.readAsDataURL(file);
    };
    document.getElementById('save-pay').onclick = async () => {
      const body = { upi: document.getElementById('edit-upi').value.trim() };
      const link = document.getElementById('edit-qr').value.trim();
      if (pendingQr) body.qr_image = pendingQr;
      else if (link) body.qr_image = link;
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: headers(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('pay-msg'), data.success ? 'Saved' : 'Failed', data.success ? 'ok' : 'error');
    };
  } else if (page === 'bill') {
    const amount = Number(s.bill_amount != null ? s.bill_amount : s.plan_amount) || 100;
    const months = Number(s.bill_months) || 1;
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <label>Company Number / Login ID (phone)</label>
      <input id="bill-phone" placeholder="Customer phone" autocomplete="off" />
      <label>Bill amount ($)</label>
      <input type="number" id="plan-amt" value="${amount}" />
      <label>Month count</label>
      <input type="number" id="plan-months" value="${months}" min="1" />
      <label>Bill message for My Portal</label>
      <textarea id="bill-text">${esc(s.bill_text || '')}</textarea>
      <button class="btn primary" id="save-bill">Send bill to My Portal</button>
      <p id="bill-msg" class="msg"></p>`;
    document.getElementById('save-bill').onclick = async () => {
      const amt = Number(document.getElementById('plan-amt').value) || 100;
      const m = Math.max(1, Number(document.getElementById('plan-months').value) || 1);
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          bill_text: document.getElementById('bill-text').value,
          plan_amount: amt,
          bill_amount: amt,
          bill_months: m
        })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('bill-msg'), data.success ? 'Bill sent. Customers can see the amount in My Portal.' : 'Failed', data.success ? 'ok' : 'error');
    };
  } else if (page === 'analysis') {
    const r = await fetch(API + '/admin/analysis', { headers: headers() });
    const d = await r.json();
    const c = d.data || {};
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <div class="stat-row"><span>Total Subscribers Count</span><strong>${c.subscribers || 0}</strong></div>
      <div class="stat-row"><span>Total Ratings Count</span><strong>${c.ratings || 0}</strong></div>
      <div class="stat-row"><span>Total User Count</span><strong>${c.users || 0}</strong></div>
      <div class="stat-row"><span>Total App Download Count</span><strong>${c.downloads || 0}</strong></div>
      <p class="note">User count rises when customers register. Subscribe and rating rise when they submit.</p>`;
  } else if (page === 'updates') {
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <label>App update text</label>
      <textarea id="up-text">${esc(s.update_text || '')}</textarea>
      <button class="btn primary" id="save-up">Save</button>
      <p id="up-msg" class="msg"></p>`;
    document.getElementById('save-up').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ update_text: document.getElementById('up-text').value })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('up-msg'), data.success ? 'Saved' : 'Failed', data.success ? 'ok' : 'error');
    };
  } else if (page === 'view') {
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p class="note">Open My Portal to see the company screen. Under option 8 you will see Back to My Dashboard. My Portal cannot open My Dashboard.</p>
      <button class="btn primary" id="go-portal-view">Open My Portal</button>`;
    document.getElementById('go-portal-view').onclick = async () => {
      viewingPortalAsAdmin = true;
      await loadSettings();
      document.getElementById('portal-title').textContent = 'My Portal';
      document.getElementById('portal-welcome').textContent = 'Welcome. Your My ARTfive! account is active.';
      show('portal');
      resetPortal();
    };
  } else if (page === 'all-edit') {
    let html = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p><h3>My Portal options</h3>`;
    (s.portal_menu || []).forEach((m, i) => {
      html += `<label>Title</label><input data-pk="title" data-pi="${i}" value="${esc(m.title)}" />
               <label>Description</label><input data-pk="description" data-pi="${i}" value="${esc(m.description)}" />`;
    });
    html += `<h3>My Dashboard options</h3>`;
    (s.admin_menu || []).forEach((m, i) => {
      html += `<label>Title</label><input data-ak="title" data-ai="${i}" value="${esc(m.title)}" />
               <label>Description</label><input data-ak="description" data-ai="${i}" value="${esc(m.description)}" />`;
    });
    html += `<label>Business type suggestions (comma separated)</label>
      <input id="btypes" value="${esc((s.business_types || []).join(', '))}" />
      <label>Logout message</label>
      <textarea id="logout-m">${esc(s.logout_message || '')}</textarea>
      <label>Notification suggestions (one per line)</label>
      <textarea id="nsug">${esc((s.notification_suggestions || []).join('\n'))}</textarea>
      <button class="btn primary" id="save-all">Save all</button>
      <p id="all-msg" class="msg"></p>`;
    aContent.innerHTML = html;
    document.getElementById('save-all').onclick = async () => {
      const portal_menu = (s.portal_menu || []).map(m => ({ ...m }));
      const admin_menu = (s.admin_menu || []).map(m => ({ ...m }));
      aContent.querySelectorAll('[data-pi]').forEach(inp => {
        portal_menu[Number(inp.dataset.pi)][inp.dataset.pk] = inp.value;
      });
      aContent.querySelectorAll('[data-ai]').forEach(inp => {
        admin_menu[Number(inp.dataset.ai)][inp.dataset.ak] = inp.value;
      });
      const business_types = document.getElementById('btypes').value.split(',').map(x => x.trim()).filter(Boolean);
      const notification_suggestions = document.getElementById('nsug').value.split('\n').map(x => x.trim()).filter(Boolean);
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          portal_menu, admin_menu, business_types, notification_suggestions,
          logout_message: document.getElementById('logout-m').value
        })
      });
      const data = await res.json();
      if (data.success) {
        settingsCache = Object.assign(settingsCache || {}, data.settings);
        paintMenus();
        paintAdminMenu(settingsCache.admin_menu);
      }
      msg(document.getElementById('all-msg'), data.success ? 'Saved' : 'Failed', data.success ? 'ok' : 'error');
    };
  }
}

show('splash');
loadPublic();
