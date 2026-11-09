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

function selectedCountry(id) {
  const el = document.getElementById(id);
  return el ? (el.value || '').trim() : '';
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
  document.getElementById('card-portal-login').classList.add('hidden');
  document.getElementById('card-forgot').classList.remove('hidden');
  msg(document.getElementById('forgot-msg'), '', '');
};
document.getElementById('forgot-back').onclick = () => {
  document.getElementById('card-forgot').classList.add('hidden');
  document.getElementById('card-portal-login').classList.remove('hidden');
};
document.getElementById('btn-forgot-submit').onclick = async () => {
  const el = document.getElementById('forgot-msg');
  const phone = document.getElementById('f-phone').value.trim();
  const p1 = document.getElementById('f-pass').value;
  const p2 = document.getElementById('f-pass2').value;
  if (!selectedCountry('f-country')) { msg(el, 'Select your country'); return; }
  if (p1 !== p2) { msg(el, 'New passwords do not match'); return; }
  try {
    const r = await fetch(API + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        country_code: selectedCountry('f-country'),
        new_password: p1
      })
    });
    const d = await r.json();
    if (d.success) {
      msg(el, d.message, 'ok');
      document.getElementById('f-pass').value = '';
      document.getElementById('f-pass2').value = '';
    } else msg(el, d.error || 'Failed');
  } catch {
    msg(el, 'Cannot connect');
  }
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
  
document.getElementById('r-type').onchange = function() {
  const v = (this.value || '').toLowerCase();
  const student = v.includes('student');
  document.getElementById('reg-customer').classList.toggle('hidden', student);
  document.getElementById('reg-student').classList.toggle('hidden', !student);
};
function fillCourses(list) {
  const sel = document.getElementById('s-course');
  if (!sel) return;
  const opts = (list && list.length) ? list : ['Class 1','Class 10','B.A','B.Sc','B.Tech','Other'];
  sel.innerHTML = opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
}
const _loadPublic = loadPublic;
loadPublic = async function() {
  await _loadPublic();
  try {
    const r = await fetch(API + '/public');
    const d = await r.json();
    fillCourses(d.course_options);
  } catch (_) {}
};
document.getElementById('go-connect').onclick = () => {
  document.getElementById('card-portal-login').classList.add('hidden');
  document.getElementById('card-connect').classList.remove('hidden');
};
document.getElementById('connect-back').onclick = () => {
  document.getElementById('card-connect').classList.add('hidden');
  document.getElementById('card-portal-login').classList.remove('hidden');
};
document.getElementById('btn-connect').onclick = async () => {
  const el = document.getElementById('connect-msg');
  try {
    const r = await fetch(API + '/connect/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: document.getElementById('c-app').value.trim(),
        website: document.getElementById('c-web').value.trim(),
        contact_email: document.getElementById('c-email').value.trim(),
        contact_phone: document.getElementById('c-phone').value.trim(),
        note: document.getElementById('c-note').value.trim()
      })
    });
    const d = await r.json();
    msg(el, d.success ? (d.message + (d.request ? ' Request id: ' + d.request.id : '')) : (d.error || 'Failed'), d.success ? 'ok' : 'error');
  } catch { msg(el, 'Cannot connect'); }
};

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
  if (!selectedCountry('r-country')) { msg(el, 'Select your country'); return; }
  if (!document.getElementById('r-phone').value.trim()) { msg(el, 'Enter mobile number'); return; }
  try {
    const r = await fetch(API + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reg_kind: 'customer',
        business_type: document.getElementById('r-type').value,
        company_name: document.getElementById('r-company').value.trim(),
        full_name: document.getElementById('r-name').value.trim(),
        phone: document.getElementById('r-phone').value.trim(),
        country_code: selectedCountry('r-country'),
        password: document.getElementById('r-pass').value
      })
    });
    const d = await r.json();
    if (d.success) {
      msg(el, d.message, 'ok');
      document.getElementById('r-pass').value = '';
    } else msg(el, d.error || 'Failed');
  } catch { msg(el, 'Cannot connect'); }
};
document.getElementById('btn-register-student').onclick = async () => {
  const el = document.getElementById('reg-msg');
  if (!selectedCountry('s-country')) { msg(el, 'Select country'); return; }
  try {
    const r = await fetch(API + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reg_kind: 'student',
        business_type: 'Create Students login id',
        school_name: document.getElementById('s-school').value.trim(),
        company_name: document.getElementById('s-school').value.trim(),
        full_name: document.getElementById('s-name').value.trim(),
        roll_number: document.getElementById('s-roll').value.trim(),
        registration_number: document.getElementById('s-regno').value.trim(),
        course: document.getElementById('s-course').value,
        phone: document.getElementById('s-phone').value.trim(),
        email: document.getElementById('s-email').value.trim(),
        school_contact: document.getElementById('s-school-phone').value.trim(),
        country_code: selectedCountry('s-country'),
        school_country_code: selectedCountry('s-country'),
        password: document.getElementById('s-pass').value
      })
    });
    const d = await r.json();
    if (d.success) {
      msg(el, d.message, 'ok');
      // keep school name for next student, clear student fields
      document.getElementById('s-name').value = '';
      document.getElementById('s-roll').value = '';
      document.getElementById('s-regno').value = '';
      document.getElementById('s-phone').value = '';
      document.getElementById('s-email').value = '';
      document.getElementById('s-pass').value = '';
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
    const pendPhone = u.phone_pending
      ? `<p class="note">New phone waiting for admin approval: ${esc(u.pending_phone_local || '')}</p>`
      : '';
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <div class="stat-row"><span>Full name</span><strong>${esc(u.full_name || '—')}</strong></div>
      <div class="stat-row"><span>Contact number</span><strong>${esc(u.phone || '—')}</strong></div>
      <div class="stat-row"><span>Company name</span><strong>${esc(u.company_name || '—')}</strong></div>
      <div class="stat-row"><span>Business type</span><strong>${esc(u.business_type || '—')}</strong></div>
      ${pendPhone}
      ${viewingPortalAsAdmin ? '' : `
      <h3 style="margin-top:1rem">Change phone number</h3>
      <p class="note">Admin must approve before this becomes your login ID.</p>
      <label>Country</label>
      <select id="chg-country">
        <option value="">Select country</option>
        <option value="91">India (+91)</option>
        <option value="1">USA / Canada (+1)</option>
        <option value="44">United Kingdom (+44)</option>
        <option value="971">UAE (+971)</option>
        <option value="966">Saudi Arabia (+966)</option>
        <option value="65">Singapore (+65)</option>
        <option value="94">Sri Lanka (+94)</option>
        <option value="977">Nepal (+977)</option>
        <option value="880">Bangladesh (+880)</option>
      </select>
      <label>New mobile number</label>
      <input type="tel" id="chg-phone" maxlength="12" placeholder="Without country code" inputmode="numeric" autocomplete="off" />
      <button class="btn primary" id="btn-chg-phone">Submit for approval</button>
      <p id="chg-phone-msg" class="msg"></p>
      <h3 style="margin-top:1rem">Delete my account</h3>
      <p class="note">Admin must approve. Account is removed from permanent storage only after approval.</p>
      ${u.delete_pending
        ? `<p class="note">Delete request is pending.</p>
           <button class="btn back" id="btn-cancel-del">Cancel delete request</button>`
        : `<button class="btn danger" id="btn-req-del">Request permanent delete</button>`}
      <p id="del-msg" class="msg"></p>`}`;
    if (!viewingPortalAsAdmin) {
      const btnChg = document.getElementById('btn-chg-phone');
      if (btnChg) btnChg.onclick = async () => {
        const el = document.getElementById('chg-phone-msg');
        const country = document.getElementById('chg-country').value;
        const phone = document.getElementById('chg-phone').value.trim();
        if (!country) { msg(el, 'Select country'); return; }
        const r = await fetch(API + '/portal/request-phone-change', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ phone, country_code: country })
        });
        const d = await r.json();
        msg(el, d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
        if (d.success) {
          currentUser.phone_pending = true;
          currentUser.pending_phone_local = phone;
        }
      };
      const btnDel = document.getElementById('btn-req-del');
      if (btnDel) btnDel.onclick = async () => {
        if (!confirm('Request permanent account delete? Admin must approve.')) return;
        const r = await fetch(API + '/portal/request-delete', { method: 'POST', headers: headers() });
        const d = await r.json();
        msg(document.getElementById('del-msg'), d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
        if (d.success) { currentUser.delete_pending = true; openPortal('account'); }
      };
      const btnCancel = document.getElementById('btn-cancel-del');
      if (btnCancel) btnCancel.onclick = async () => {
        const r = await fetch(API + '/portal/cancel-delete', { method: 'POST', headers: headers() });
        const d = await r.json();
        msg(document.getElementById('del-msg'), d.success ? d.message : (d.error || 'Failed'), d.success ? 'ok' : 'error');
        if (d.success) { currentUser.delete_pending = false; openPortal('account'); }
      };
    }
  } else if (page === 'payments') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p class="upi">${esc(s.upi || '')}</p>
      <img class="qr-img" alt="QR" src="${esc(s.qr_image || '/qr-demo.png')}" />`;
  } else if (page === 'bill') {
    const amount = Number(s.bill_amount != null ? s.bill_amount : s.plan_amount) || 100;
    const months = Number(s.bill_months) || 1;
    const text = (s.bill_text || '').split('\n').map(line => `<div class="stat-row"><span>${esc(line)}</span></div>`).join('');
    const force = s.force_upgrade ? '<p class="note">Force upgrade is ON. When plan time ends you must upgrade.</p>' : '<p class="note">Force upgrade is OFF. You can use freely; upgrade is optional.</p>';
    const until = u.free_until ? new Date(u.free_until).toLocaleString() : '—';
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      ${force}
      <div class="stat-row"><span>Plan active until</span><strong>${esc(until)}</strong></div>
      <div class="stat-row"><span>Upgrade amount</span><strong>$${amount}/-</strong></div>
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
    let extra = '';
    try {
      if (s.force_upgrade && u.free_until && new Date(u.free_until).getTime() < Date.now()) {
        extra = `<p style="margin-top:0.6rem">${esc(s.plan_expire_notification || 'Your plan time is over. Please upgrade.')}</p>`;
      }
    } catch (_) {}
    pContent.innerHTML = `<h3>${esc(title)}</h3>
      <p class="desc">Messages from My ARTfive!</p>
      <p>${esc(s.auto_notification || '')}</p>
      <p style="margin-top:0.6rem">${esc(s.manual_notification || '')}</p>
      ${extra}`;
  } else if (page === 'updates') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p>${esc(s.update_text || '')}</p>`;
  } else if (page === 'settings') {
    pContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p class="note">Create your new password here. Enter old password, then new password.</p>
      <label>Old password</label><input type="password" id="old-p" autocomplete="off" placeholder="Current password" />
      <label>New password</label><input type="password" id="new-p" autocomplete="off" placeholder="Create new password" />
      <label>Confirm new password</label><input type="password" id="new-p2" autocomplete="off" placeholder="Type new password again" />
      <button class="btn primary" id="save-p">Save new password</button>
      <p id="set-msg" class="msg"></p>`;
    document.getElementById('save-p').onclick = async () => {
      const n1 = document.getElementById('new-p').value;
      const n2 = document.getElementById('new-p2').value;
      if (n1 !== n2) {
        msg(document.getElementById('set-msg'), 'New passwords do not match');
        return;
      }
      const r = await fetch(API + '/portal/change-password', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          current_password: document.getElementById('old-p').value,
          new_password: n1
        })
      });
      const d = await r.json();
      msg(document.getElementById('set-msg'), d.success ? 'New password saved. Use it next login.' : (d.error || 'Failed'), d.success ? 'ok' : 'error');
      if (d.success) {
        document.getElementById('old-p').value = '';
        document.getElementById('new-p').value = '';
        document.getElementById('new-p2').value = '';
      }
    };
  }

  // Single Back to Menu via #p-back only (no duplicate inside content)
  if (viewingPortalAsAdmin) {
    pContent.insertAdjacentHTML('beforeend',
      `<button class="btn back" id="page-back-dash">← Back to My Dashboard</button>`);
    const bd = document.getElementById('page-back-dash');
    if (bd) bd.onclick = () => {
      viewingPortalAsAdmin = false;
      show('admin');
      resetAdmin();
    };
  }
  pBack.classList.remove('hidden');
  pBack.textContent = '← Back to Menu';
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
      const flags = [
        b.pending ? 'Pending login approval' : (b.allowed ? 'Allowed' : 'Denied'),
        b.password_pending ? 'Password pending' : '',
        b.phone_pending ? ('Phone pending: ' + (b.pending_phone || '')) : '',
        b.delete_pending ? 'DELETE requested' : ''
      ].filter(Boolean).join(' · ');
      html += `<div class="stat-row"><span>
        <strong>${esc(b.full_name || '—')}</strong><br>
        <small>${esc(b.phone || '')}</small><br>
        <small>${esc(b.company_name || '')} · ${esc(b.business_type || '')}</small>
        <br><small>${esc(flags)}</small>
      </span><strong>${b.allowed ? 'Yes' : 'No'}</strong></div>
      <div class="row-actions">`;
      if (page === 'allow') {
        html += `
          <button class="btn primary" data-id="${esc(b.id)}" data-allow="1">Yes</button>
          <button class="btn danger" data-id="${esc(b.id)}" data-allow="0">No</button>`;
      }
      if (b.phone_pending) {
        html += `
          <button class="btn primary" data-ph="1" data-id="${esc(b.id)}">Approve phone</button>
          <button class="btn danger" data-ph="0" data-id="${esc(b.id)}">Reject phone</button>`;
      }
      if (b.delete_pending) {
        html += `
          <button class="btn danger" data-delappr="1" data-id="${esc(b.id)}">Approve permanent delete</button>
          <button class="btn back" data-delappr="0" data-id="${esc(b.id)}">Reject delete</button>`;
      }
      html += `
        <button class="btn danger" data-delnow="${esc(b.id)}">Delete account now</button>
      </div>`;
    });
    aContent.innerHTML = html;
    aContent.querySelectorAll('[data-allow]').forEach(btn => {
      btn.onclick = async () => {
        await fetch(API + '/admin/allow', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ user_id: btn.dataset.id, allowed: btn.dataset.allow === '1' })
        });
        openAdmin(page);
      };
    });
    aContent.querySelectorAll('[data-ph]').forEach(btn => {
      btn.onclick = async () => {
        const res = await fetch(API + '/admin/approve-phone', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ user_id: btn.dataset.id, approve: btn.dataset.ph === '1' })
        });
        const data = await res.json();
        alert(data.success ? data.message : (data.error || 'Failed'));
        if (data.success) openAdmin(page);
      };
    });
    aContent.querySelectorAll('[data-delappr]').forEach(btn => {
      btn.onclick = async () => {
        if (btn.dataset.delappr === '1' && !confirm('Permanently delete this account from database?')) return;
        const res = await fetch(API + '/admin/approve-delete', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ user_id: btn.dataset.id, approve: btn.dataset.delappr === '1' })
        });
        const data = await res.json();
        alert(data.success ? data.message : (data.error || 'Failed'));
        if (data.success) openAdmin(page);
      };
    });
    aContent.querySelectorAll('[data-delnow]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this account now from permanent storage? This cannot be undone.')) return;
        const res = await fetch(API + '/admin/delete-account', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ user_id: btn.dataset.delnow })
        });
        const data = await res.json();
        alert(data.success ? data.message : (data.error || 'Failed'));
        if (data.success) openAdmin(page);
      };
    });
  } else if (page === 'reset') {
    const r = await fetch(API + '/admin/businesses', { headers: headers() });
    const d = await r.json();
    let opts = '<option value="">Select company</option>';
    (d.businesses || []).forEach(b => {
      opts += `<option value="${esc(b.id)}" data-phone="${esc(b.phone)}">${esc(b.company_name)} — ${esc(b.full_name || '')} — ${esc(b.phone)}</option>`;
    });
    let pendingHtml = '<h3>Customer new password requests</h3>';
    const pending = (d.businesses || []).filter(b => b.password_pending);
    if (!pending.length) pendingHtml += '<p class="note">No pending password requests.</p>';
    pending.forEach(b => {
      pendingHtml += `<div class="stat-row"><span><strong>${esc(b.company_name || '')}</strong><br><small>91 ${esc(b.phone_local || '')}</small></span></div>
        <div class="row-actions">
          <button class="btn primary" data-appr="1" data-id="${esc(b.id)}">Approve new password</button>
          <button class="btn danger" data-appr="0" data-id="${esc(b.id)}">Reject</button>
        </div>`;
    });
    aContent.innerHTML = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      ${pendingHtml}
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
    aContent.querySelectorAll('[data-appr]').forEach(btn => {
      btn.onclick = async () => {
        const res = await fetch(API + '/admin/approve-password', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ user_id: btn.dataset.id, approve: btn.dataset.appr === '1' })
        });
        const data = await res.json();
        alert(data.success ? data.message : (data.error || 'Failed'));
        if (data.success) openAdmin('reset');
      };
    });
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
      <label>Upgrade plans text (shown in My Portal)</label>
      <textarea id="bill-text">${esc(s.bill_text || '')}</textarea>
      <label>Upgrade amount ($)</label>
      <input type="number" id="plan-amt" value="${amount}" />
      <label>Month count</label>
      <input type="number" id="plan-months" value="${months}" min="1" />
      <label>Force upgrade</label>
      <select id="force-upgrade">
        <option value="0" ${s.force_upgrade ? '' : 'selected'}>OFF — free use without forcing upgrade</option>
        <option value="1" ${s.force_upgrade ? 'selected' : ''}>ON — must upgrade when plan time ends</option>
      </select>
      <label>Plan expired notification</label>
      <textarea id="plan-exp-msg">${esc(s.plan_expire_notification || '')}</textarea>
      <button class="btn primary" id="save-bill">Save upgrade plans</button>
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
          bill_months: m,
          force_upgrade: document.getElementById('force-upgrade').value === '1',
          plan_expire_notification: document.getElementById('plan-exp-msg').value
        })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings);
      msg(document.getElementById('bill-msg'), data.success ? 'Upgrade plans saved.' : 'Failed', data.success ? 'ok' : 'error');
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
  } else if (page === 'connections') {
    const r = await fetch(API + '/admin/access-requests', { headers: headers() });
    const d = await r.json();
    let html = `<h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p>
      <p class="note">Outside apps request connection like Supabase. Accept to authorise them.</p>
      <label>Authorised success message</label>
      <textarea id="auth-msg">${esc(s.auth_success_message || '')}</textarea>
      <button class="btn primary" id="save-auth-msg">Save message</button>
      <p id="auth-save-msg" class="msg"></p>
      <h3>Requests</h3>`;
    (d.requests || []).forEach(req => {
      html += `<div class="stat-row"><span>
        <strong>${esc(req.app_name)}</strong><br>
        <small>${esc(req.contact_email || '')} ${esc(req.contact_phone || '')}</small><br>
        <small>${esc(req.website || '')}</small><br>
        <small>${esc(req.note || '')}</small><br>
        <small>Status: ${esc(req.status)}</small>
        ${req.api_key ? '<br><small>API key: ' + esc(req.api_key) + '</small>' : ''}
      </span></div>`;
      if (req.status === 'pending') {
        html += `<div class="row-actions">
          <button class="btn primary" data-acc="1" data-id="${esc(req.id)}">Accept to access</button>
          <button class="btn danger" data-acc="0" data-id="${esc(req.id)}">Reject</button>
        </div>`;
      }
    });
    if (!(d.requests || []).length) html += '<p class="note">No connection requests yet.</p>';
    aContent.innerHTML = html;
    document.getElementById('save-auth-msg').onclick = async () => {
      const res = await fetch(API + '/admin/settings', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ auth_success_message: document.getElementById('auth-msg').value })
      });
      const data = await res.json();
      if (data.success) settingsCache = Object.assign(settingsCache || {}, data.settings || {});
      msg(document.getElementById('auth-save-msg'), data.success ? 'Saved' : 'Failed', data.success ? 'ok' : 'error');
    };
    aContent.querySelectorAll('[data-acc]').forEach(btn => {
      btn.onclick = async () => {
        const res = await fetch(API + '/admin/access-decide', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ id: btn.dataset.id, approve: btn.dataset.acc === '1' })
        });
        const data = await res.json();
        alert(data.success ? (data.message + (data.api_key ? '\nAPI key: ' + data.api_key : '')) : (data.error || 'Failed'));
        if (data.success) openAdmin('connections');
      };
    });
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


document.getElementById('r-type').onchange = function() {
  const v = (this.value || '').toLowerCase();
  const student = v.includes('student');
  document.getElementById('reg-customer').classList.toggle('hidden', student);
  document.getElementById('reg-student').classList.toggle('hidden', !student);
};
function fillCourses(list) {
  const sel = document.getElementById('s-course');
  if (!sel) return;
  const opts = (list && list.length) ? list : ['Class 1','Class 10','B.A','B.Sc','B.Tech','Other'];
  sel.innerHTML = opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
}
const _loadPublic = loadPublic;
loadPublic = async function() {
  await _loadPublic();
  try {
    const r = await fetch(API + '/public');
    const d = await r.json();
    fillCourses(d.course_options);
  } catch (_) {}
};
document.getElementById('go-connect').onclick = () => {
  document.getElementById('card-portal-login').classList.add('hidden');
  document.getElementById('card-connect').classList.remove('hidden');
};
document.getElementById('connect-back').onclick = () => {
  document.getElementById('card-connect').classList.add('hidden');
  document.getElementById('card-portal-login').classList.remove('hidden');
};
document.getElementById('btn-connect').onclick = async () => {
  const el = document.getElementById('connect-msg');
  try {
    const r = await fetch(API + '/connect/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: document.getElementById('c-app').value.trim(),
        website: document.getElementById('c-web').value.trim(),
        contact_email: document.getElementById('c-email').value.trim(),
        contact_phone: document.getElementById('c-phone').value.trim(),
        note: document.getElementById('c-note').value.trim()
      })
    });
    const d = await r.json();
    msg(el, d.success ? (d.message + (d.request ? ' Request id: ' + d.request.id : '')) : (d.error || 'Failed'), d.success ? 'ok' : 'error');
  } catch { msg(el, 'Cannot connect'); }
};

show('splash');
loadPublic();
