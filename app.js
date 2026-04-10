/* ============================================================
   FOOD BRIDGE — APP.JS
   Complete Frontend Application Logic (Full-Stack API Edition)
   - Auth System (JWT + localStorage token)
   - Donor: Post / Edit / Delete / Track listings via API
   - Receiver: Browse / Claim / Order / Track via API
   - OTP verification via real backend + NodeMailer
   - Email notifications for all key events
============================================================ */

'use strict';

// ============================================================
// API UTILITY (communicates with Node.js backend on port 5000)
// ============================================================
const API_URL = 'http://localhost:5000/api';

const API = {
  get: async (endpoint) => {
    const token = localStorage.getItem('fb_token');
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  post: async (endpoint, data) => {
    const token = localStorage.getItem('fb_token');
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  put: async (endpoint, data) => {
    const token = localStorage.getItem('fb_token');
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  delete: async (endpoint) => {
    const token = localStorage.getItem('fb_token');
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  }
};

// ============================================================
// SESSION HELPER
// ============================================================
function currentUser() {
  const user = localStorage.getItem('fb_user');
  return user ? JSON.parse(user) : null;
}

function setCurrentUser(user, token) {
  if (user) {
    localStorage.setItem('fb_user', JSON.stringify(user));
    if (token) localStorage.setItem('fb_token', token);
  } else {
    localStorage.removeItem('fb_user');
    localStorage.removeItem('fb_token');
  }
}

// ============================================================
// UTILITIES
// ============================================================
let _pendingRequest = null;
let _toastTimer;

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.className = 'toast', 3200);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dt) {
  const diff = (Date.now() - new Date(dt)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function getExpiryStatus(expiryDt) {
  if (!expiryDt) return { label: '', cls: 'urgency-ok', expired: false };
  const ms = new Date(expiryDt) - Date.now();
  if (ms <= 0) return { label: '⛔ Expired', cls: 'urgency-critical', expired: true };
  const h = ms / 3600000;
  if (h <= 2) return { label: `⚠️ Expires in ${Math.ceil(ms / 60000)}m`, cls: 'urgency-critical', expired: false };
  if (h <= 8) return { label: `⏰ Expires in ${Math.ceil(h)}h`, cls: 'urgency-warning', expired: false };
  if (h <= 24) return { label: '🕐 Expires today', cls: 'urgency-ok', expired: false };
  const d = Math.ceil(h / 24);
  return { label: `📅 Expires in ${d}d`, cls: 'urgency-ok', expired: false };
}

function categoryEmoji(cat) {
  const map = { cooked: '🍽️', bakery: '🥐', raw: '🥦', packaged: '📦', fruits: '🍎', beverages: '🥤', other: '🍴' };
  return map[cat] || '🍴';
}

function logout() {
  setCurrentUser(null);
  showPage('page-landing');
  showToast('Signed out successfully.', 'info');
}

// ============================================================
// PAGE / SECTION ROUTING
// ============================================================
function showPage(pageId, subView) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  if (pageId === 'page-auth') {
    switchAuth(subView === 'login' ? 'login' : 'signup');
    if (subView === 'signup-donor') selectRoleByValue('donor');
    if (subView === 'signup-receiver') selectRoleByValue('receiver');
  }
  if (pageId === 'page-donor') initDonorDashboard();
  if (pageId === 'page-receiver') initReceiverDashboard();
}

function showDonorSection(sectionId, el) {
  document.querySelectorAll('#page-donor .content-section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('donor-' + sectionId);
  if (sec) sec.classList.add('active');
  if (el) {
    document.querySelectorAll('#page-donor .nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
  }
  if (sectionId === 'my-listings') renderDonorListings('all');
  if (sectionId === 'requests') renderDonorRequests();
  if (sectionId === 'dashboard') renderDonorDashboard();
  if (sectionId === 'post-food') setMinExpiry();
  if (sectionId === 'browse') renderDonorBrowse();
}

function showReceiverSection(sectionId, el) {
  document.querySelectorAll('#page-receiver .content-section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('receiver-' + sectionId);
  if (sec) sec.classList.add('active');
  if (el) {
    document.querySelectorAll('#page-receiver .nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
  }
  if (sectionId === 'browse') renderBrowseListings();
  if (sectionId === 'my-claims') renderReceiverClaims();
  if (sectionId === 'my-orders') renderReceiverOrders();
}

function switchAuth(view) {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  const f = document.getElementById('auth-' + view);
  if (f) f.classList.add('active');
}

// ============================================================
// AUTH
// ============================================================
let _selectedRole = 'donor';

function selectRole(el, role) {
  document.querySelectorAll('.role-option').forEach(r => r.classList.remove('active'));
  el.classList.add('active');
  _selectedRole = role;
}

function selectRoleByValue(role) {
  _selectedRole = role;
  document.querySelectorAll('.role-option').forEach(el => {
    el.classList.toggle('active', el.dataset.role === role);
  });
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }

  const btn = document.querySelector('#auth-login .btn-primary');
  btn.textContent = 'Signing in...';
  btn.disabled = true;

  const res = await API.post('/auth/login', { email, password });
  btn.textContent = 'Sign In';
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error;
    errEl.style.display = 'block';
    return;
  }

  setCurrentUser(res.user, res.token);
  showToast(`Welcome back, ${res.user.name.split(' ')[0]}! 👋`);
  if (res.user.role === 'donor') showPage('page-donor');
  else showPage('page-receiver');
}

async function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const location = document.getElementById('signup-location').value.trim();
  const phone = document.getElementById('signup-phone') ? document.getElementById('signup-phone').value.trim() : '';
  const errEl = document.getElementById('signup-error');
  errEl.style.display = 'none';

  if (!name || !email || !password) { errEl.textContent = 'Please fill in all required fields.'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; return; }

  const btn = document.querySelector('#auth-signup .btn-primary');
  btn.textContent = 'Creating account...';
  btn.disabled = true;

  const res = await API.post('/auth/signup', { name, email, password, phone, role: _selectedRole, location });
  btn.textContent = 'Create Account';
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error;
    errEl.style.display = 'block';
    return;
  }

  showToast(`Account created! 📧 Check your email (${email}) to verify your account.`, 'success');
  // Show info message below form
  errEl.style.background = '#d8f3dc';
  errEl.style.color = '#2d6a4f';
  errEl.style.borderColor = '#2d6a4f';
  errEl.textContent = '✅ Verification email sent! Please check your inbox, then come back to sign in.';
  errEl.style.display = 'block';
  setTimeout(() => switchAuth('login'), 4000);
}

// ============================================================
// DONOR DASHBOARD INIT
// ============================================================
function initDonorDashboard() {
  const user = currentUser();
  if (!user) return showPage('page-auth', 'login');

  // Set name in sidebar
  const nameEl = document.getElementById('donor-user-name');
  if (nameEl) nameEl.textContent = user.name;

  const displayEl = document.getElementById('donor-name-display');
  if (displayEl) displayEl.textContent = user.name.split(' ')[0];

  const h = new Date().getHours();
  const greetEl = document.getElementById('donor-greeting-time');
  if (greetEl) greetEl.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';

  // Set avatar initial
  const av = document.querySelector('#page-donor .user-avatar');
  if (av) av.textContent = user.name.charAt(0).toUpperCase();

  // Show verified badge
  if (user.isVerified) {
    const badge = document.getElementById('donor-verified-badge');
    if (badge) badge.style.display = 'inline-block';
  }

  renderDonorDashboard();
  setMinExpiry();
}

async function renderDonorDashboard() {
  const user = currentUser();
  if (!user) return;
  const res = await API.get(`/donor/dashboard/${user.id}`);

  if (res.error) return showToast(res.error, 'error');

  const { listings, requests } = res;

  const active = listings.filter(l => !getExpiryStatus(l.expiryTime).expired && l.status !== 'completed');
  const completed = listings.filter(l => l.status === 'completed');
  const pending = requests.filter(r => r.status === 'pending');

  document.getElementById('d-stat-active').textContent = active.length;
  document.getElementById('d-stat-completed').textContent = completed.length;
  document.getElementById('d-stat-pending').textContent = pending.length;
  document.getElementById('d-stat-meals').textContent = completed.length * 4;

  // Badge
  const badge = document.getElementById('donor-req-badge');
  if (badge) badge.textContent = pending.length;

  // Recent listings
  const recentEl = document.getElementById('donor-recent-listings');
  if (listings.length === 0) {
    recentEl.innerHTML = '<p class="empty-state">No listings yet. <a href="#" onclick="showDonorSection(\'post-food\')">Post your first food!</a></p>';
  } else {
    recentEl.innerHTML = listings.slice(0, 4).map(l => `
      <div class="mini-list-item">
        <span class="mini-emoji">${categoryEmoji(l.category)}</span>
        <div class="mini-info">
          <strong>${l.name}</strong>
          <small>${formatDate(l.createdAt)}</small>
        </div>
        <span class="mini-badge ${l.type === 'free' ? 'badge-free' : 'badge-paid'}">${l.type === 'free' ? 'FREE' : '₹' + l.price}</span>
      </div>
    `).join('');
  }

  // Latest requests
  const reqEl = document.getElementById('donor-latest-requests');
  if (requests.length === 0) {
    reqEl.innerHTML = '<p class="empty-state">No requests yet.</p>';
  } else {
    reqEl.innerHTML = requests.slice(0, 4).map(r => `
      <div class="mini-list-item">
        <span class="mini-emoji">📬</span>
        <div class="mini-info">
          <strong>${r.foodName}</strong>
          <small>by ${r.receiverName} · ${timeAgo(r.createdAt)}</small>
        </div>
        <span class="mini-badge badge-${r.status}">${r.status}</span>
      </div>
    `).join('');
  }
}

// ============================================================
// POST FOOD LISTING
// ============================================================
function setMinExpiry() {
  const inp = document.getElementById('pf-expiry');
  if (inp) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    inp.min = now.toISOString().slice(0, 16);
  }
}

function togglePriceField() {
  const type = document.getElementById('pf-type').value;
  document.getElementById('price-field').style.display = type === 'paid' ? 'flex' : 'none';
}

function previewImage(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const wrap = document.getElementById('image-preview-wrap');
    wrap.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
  };
  reader.readAsDataURL(input.files[0]);
}

function resetPostFoodForm() {
  ['pf-name', 'pf-quantity', 'pf-price', 'pf-location', 'pf-desc', 'pf-expiry', 'pf-pickup-from', 'pf-pickup-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('pf-type').value = 'free';
  document.getElementById('pf-category').value = 'cooked';
  document.getElementById('price-field').style.display = 'none';
  document.getElementById('image-preview-wrap').innerHTML = `
    <div class="upload-placeholder">
      <span class="upload-icon">📷</span>
      <span>Click to upload photo</span>
      <small>JPG, PNG up to 5MB</small>
    </div>`;
  document.getElementById('post-food-error').style.display = 'none';
}

async function submitFoodListing() {
  const errEl = document.getElementById('post-food-error');
  errEl.style.display = 'none';
  errEl.style.background = '';
  errEl.style.color = '';
  errEl.style.borderColor = '';

  const name = document.getElementById('pf-name').value.trim();
  const type = document.getElementById('pf-type').value;
  const price = document.getElementById('pf-price').value;
  const quantity = document.getElementById('pf-quantity').value.trim();
  const expiryTime = document.getElementById('pf-expiry').value;
  const location = document.getElementById('pf-location').value.trim();
  const category = document.getElementById('pf-category').value;
  const description = document.getElementById('pf-desc').value.trim();

  if (!name) { errEl.textContent = 'Food name is required.'; errEl.style.display = 'block'; return; }
  if (!quantity) { errEl.textContent = 'Quantity is required.'; errEl.style.display = 'block'; return; }
  if (!expiryTime) { errEl.textContent = 'Expiry date & time is required.'; errEl.style.display = 'block'; return; }
  if (!location) { errEl.textContent = 'Location is required.'; errEl.style.display = 'block'; return; }
  if (type === 'paid' && (!price || parseFloat(price) <= 0)) {
    errEl.textContent = 'Please enter a valid price for paid listings.'; errEl.style.display = 'block'; return;
  }
  if (new Date(expiryTime) <= new Date()) {
    errEl.textContent = 'Expiry time must be in the future.'; errEl.style.display = 'block'; return;
  }

  const user = currentUser();
  if (!user.isVerified) {
    errEl.textContent = '⚠️ Please verify your email before posting food.'; errEl.style.display = 'block'; return;
  }

  const imgInput = document.getElementById('pf-image');
  let image = null;
  if (imgInput.files && imgInput.files[0]) {
    image = await new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.readAsDataURL(imgInput.files[0]);
    });
  }

  const btn = document.querySelector('#donor-post-food .btn-primary');
  btn.textContent = 'Publishing...';
  btn.disabled = true;

  const res = await API.post('/listings', {
    donorId: user.id,
    name,
    type,
    price: type === 'paid' ? parseFloat(price) : 0,
    quantity,
    category,
    expiryTime,
    location,
    description,
    image,
    status: 'active'
  });

  btn.textContent = '🚀 Publish Listing';
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error;
    errEl.style.display = 'block';
    return;
  }

  showToast('🎉 Listing published successfully!');
  resetPostFoodForm();
  showDonorSection('my-listings', null);
}

// ============================================================
// DONOR: MY LISTINGS
// ============================================================
let _donorListingFilter = 'all';

function filterDonorListings(filter, el) {
  _donorListingFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderDonorListings(filter);
}

async function renderDonorListings(filter) {
  const user = currentUser();
  if (!user) return;
  const res = await API.get(`/donor/dashboard/${user.id}`);
  if (res.error) return showToast(res.error, 'error');

  let listings = res.listings;
  const grid = document.getElementById('donor-listings-grid');

  if (filter === 'active') listings = listings.filter(l => !getExpiryStatus(l.expiryTime).expired && l.status !== 'completed');
  else if (filter === 'completed') listings = listings.filter(l => l.status === 'completed');
  else if (filter === 'expired') listings = listings.filter(l => getExpiryStatus(l.expiryTime).expired);

  if (listings.length === 0) {
    grid.innerHTML = `<div class="empty-full">
      <div class="empty-icon">📭</div>
      <h3>No listings here</h3>
      <p>Post your first food listing to get started!</p>
      <button class="btn btn-primary" onclick="showDonorSection('post-food')">Post Food Now</button>
    </div>`;
    return;
  }

  const requests = res.requests;

  grid.innerHTML = listings.map(l => {
    const listRequests = requests.filter(r => String(r.listingId) === String(l._id));
    return buildDonorCard(l, listRequests);
  }).join('');
}

function buildDonorCard(l, requests = []) {
  const exp = getExpiryStatus(l.expiryTime);
  const imgHtml = l.image
    ? `<img src="${l.image}" class="food-card-img" style="object-fit:cover;height:160px;width:100%" alt="${l.name}">`
    : `<div class="food-card-img">${categoryEmoji(l.category)}</div>`;
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return `
    <div class="food-card ${exp.expired ? 'expired' : ''}">
      ${imgHtml}
      <div class="food-card-body">
        <div class="food-card-header">
          <div class="food-card-title">${l.name}</div>
          <span class="food-type-badge ${l.type === 'free' ? 'type-free' : 'type-paid'}">${l.type === 'free' ? 'FREE' : '₹' + l.price}</span>
        </div>
        <div class="food-card-meta">
          <div class="meta-row">📍 ${l.location}</div>
          <div class="meta-row">📦 ${l.quantity}</div>
        </div>
        <div class="food-urgency ${exp.cls}">${exp.label || '📅 ' + formatDate(l.expiryTime)}</div>
        <div class="food-card-footer">
          <div>
            <div style="font-size:11px;color:var(--text-muted)">Requests</div>
            <div style="font-weight:700;font-size:18px">${requests.length} ${pendingCount > 0 ? `<span style="color:var(--amber);font-size:12px">(${pendingCount} pending)</span>` : ''}</div>
          </div>
          <span class="mini-badge badge-${l.status === 'completed' ? 'completed' : exp.expired ? 'expired' : 'accepted'}">${l.status === 'completed' ? 'Done' : exp.expired ? 'Expired' : 'Active'}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost" onclick="openEditModal('${l._id}', ${JSON.stringify(l).replace(/"/g, '&quot;')})">✏️ Edit</button>
        <button class="btn btn-danger" onclick="deleteListing('${l._id}')">🗑️ Delete</button>
        ${!exp.expired && l.status !== 'completed' ? `<button class="btn btn-primary" onclick="markListingComplete('${l._id}')">✅ Mark Done</button>` : ''}
      </div>
    </div>`;
}

async function deleteListing(id) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;
  const res = await API.delete(`/listings/${id}`);
  if (res.error) return showToast(res.error, 'error');
  showToast('Listing deleted.', 'info');
  renderDonorListings(_donorListingFilter);
  renderDonorDashboard();
}

async function markListingComplete(id) {
  const res = await API.put(`/listings/${id}`, { status: 'completed' });
  if (res.error) return showToast(res.error, 'error');
  showToast('🎉 Marked as completed!');
  renderDonorListings(_donorListingFilter);
  renderDonorDashboard();
}

// Edit Modal — pass the listing object directly
let _editListingData = null;
function openEditModal(id, listingObj) {
  _editListingData = listingObj;
  document.getElementById('edit-name').value = listingObj.name || '';
  document.getElementById('edit-quantity').value = listingObj.quantity || '';
  document.getElementById('edit-price').value = listingObj.price || '';
  document.getElementById('edit-desc').value = listingObj.description || '';
  document.getElementById('edit-listing-id').value = id;
  document.getElementById('edit-price-wrap').style.display = listingObj.type === 'paid' ? 'flex' : 'none';
  document.getElementById('modal-edit-listing').classList.add('active');
}

async function saveEditListing() {
  const id = document.getElementById('edit-listing-id').value;
  const updates = {
    name: document.getElementById('edit-name').value.trim() || _editListingData?.name,
    quantity: document.getElementById('edit-quantity').value.trim() || _editListingData?.quantity,
    price: parseFloat(document.getElementById('edit-price').value) || _editListingData?.price,
    description: document.getElementById('edit-desc').value.trim()
  };

  const res = await API.put(`/listings/${id}`, updates);
  if (res.error) return showToast(res.error, 'error');

  document.getElementById('modal-edit-listing').classList.remove('active');
  showToast('✅ Listing updated!');
  renderDonorListings(_donorListingFilter);
}

// ============================================================
// DONOR: BROWSE OTHER FOOD
// ============================================================
async function renderDonorBrowse() {
  const user = currentUser();
  if (!user) return;

  const listings = await API.get('/listings');
  if (listings.error) return showToast(listings.error, 'error');

  // Filter out own listings
  const others = listings.filter(l =>
    String(l.donorId) !== String(user.id) &&
    l.status === 'active' &&
    !getExpiryStatus(l.expiryTime).expired
  );

  const grid = document.getElementById('donor-browse-grid');

  if (others.length === 0) {
    grid.innerHTML = `<div class="empty-full">
      <div class="empty-icon">🔍</div>
      <h3>No other listings found</h3>
      <p>Check back later to see what others are offering.</p>
    </div>`;
    return;
  }

  grid.innerHTML = others.map(l => {
    const exp = getExpiryStatus(l.expiryTime);
    const imgHtml = l.image
      ? `<img src="${l.image}" style="width:100%;height:160px;object-fit:cover;display:block" alt="${l.name}">`
      : `<div class="food-card-img">${categoryEmoji(l.category)}</div>`;

    return `
      <div class="food-card">
        ${imgHtml}
        <div class="food-card-body">
          <div class="food-card-header">
            <div class="food-card-title">${l.name}</div>
            <span class="food-type-badge ${l.type === 'free' ? 'type-free' : 'type-paid'}">${l.type === 'free' ? 'FREE' : '₹' + l.price}</span>
          </div>
          <div class="food-card-meta">
            <div class="meta-row">📍 ${l.location}</div>
            <div class="meta-row">📦 ${l.quantity}</div>
          </div>
          <div class="food-urgency ${exp.cls}" style="margin-top:6px">${exp.label || '📅 ' + formatDate(l.expiryTime)}</div>
          <div class="food-card-footer">
            <div class="${l.type === 'free' ? 'food-price free-price' : 'food-price'}">${l.type === 'free' ? '🆓 Free' : '₹' + l.price + ' <span style="font-size:11px;color:var(--text-muted);font-weight:normal">lowered cost</span>'}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// DONOR: REQUESTS
// ============================================================
async function renderDonorRequests() {
  const user = currentUser();
  if (!user) return;

  const res = await API.get(`/donor/dashboard/${user.id}`);
  if (res.error) return showToast(res.error, 'error');

  const requests = res.requests;
  const el = document.getElementById('donor-requests-list');

  if (requests.length === 0) {
    el.innerHTML = `<div class="empty-full">
      <div class="empty-icon">📬</div>
      <h3>No requests yet</h3>
      <p>Once someone claims or orders your food, requests appear here.</p>
    </div>`;
    return;
  }

  el.innerHTML = requests.map(r => `
    <div class="request-card">
      <span class="req-emoji">${categoryEmoji(r.category)}</span>
      <div class="req-body">
        <div class="req-title">${r.foodName}</div>
        <div class="req-meta">
          <span>👤 ${r.receiverName}</span>
          <span>📦 ${r.quantity}</span>
          <span>${r.amount > 0 ? '💰 ₹' + r.amount : '🆓 Free Claim'}</span>
          ${r.receiverEmail ? `<span>✉️ ${r.receiverEmail}</span>` : ''}
        </div>
      </div>
      <div class="req-status">
        <span class="mini-badge badge-${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
        <div class="req-timestamp">${timeAgo(r.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// RECEIVER DASHBOARD INIT
// ============================================================
function initReceiverDashboard() {
  const user = currentUser();
  if (!user) return showPage('page-auth', 'login');

  const nameEl = document.getElementById('receiver-user-name');
  if (nameEl) nameEl.textContent = user.name;

  const emailEl = document.getElementById('receiver-user-email');
  if (emailEl) emailEl.textContent = user.email;

  const av = document.querySelector('.user-avatar-blue');
  if (av) av.textContent = user.name.charAt(0).toUpperCase();

  // Show verified badge
  if (user.isVerified) {
    const badge = document.getElementById('receiver-verified-badge');
    if (badge) badge.style.display = 'inline-block';
  }

  renderBrowseListings();
}

// ============================================================
// RECEIVER: BROWSE LISTINGS
// ============================================================
async function renderBrowseListings() {
  const listings = await API.get('/listings');
  if (listings.error) return showToast(listings.error, 'error');

  const search = (document.getElementById('browse-search')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('browse-type')?.value || 'all';
  const catFilter = document.getElementById('browse-category')?.value || 'all';
  const urgencyFilter = document.getElementById('browse-urgency')?.value || 'all';

  let filtered = listings.filter(l => {
    const exp = getExpiryStatus(l.expiryTime);
    if (exp.expired) return false;
    if (l.status === 'completed') return false;
    if (typeFilter !== 'all' && l.type !== typeFilter) return false;
    if (catFilter !== 'all' && l.category !== catFilter) return false;
    if (search && !l.name.toLowerCase().includes(search) && !l.description?.toLowerCase().includes(search)) return false;

    if (urgencyFilter === 'urgent') {
      const ms = new Date(l.expiryTime) - Date.now();
      if (ms > 8 * 3600000) return false;
    }
    if (urgencyFilter === 'today') {
      const ms = new Date(l.expiryTime) - Date.now();
      if (ms > 24 * 3600000) return false;
    }
    return true;
  });

  const grid = document.getElementById('browse-food-grid');
  const info = document.getElementById('browse-results-info');
  if (info) info.textContent = `${filtered.length} listing${filtered.length !== 1 ? 's' : ''} available`;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-full">
      <div class="empty-icon">🔍</div>
      <h3>No listings found</h3>
      <p>Try adjusting your filters or check back soon!</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.reverse().map(l => buildReceiverCard(l)).join('');
}

function buildReceiverCard(l) {
  const exp = getExpiryStatus(l.expiryTime);
  const imgHtml = l.image
    ? `<img src="${l.image}" style="width:100%;height:160px;object-fit:cover;display:block" alt="${l.name}">`
    : `<div class="food-card-img">${categoryEmoji(l.category)}</div>`;

  return `
    <div class="food-card" onclick="openFoodDetail('${l._id}')" style="cursor:pointer">
      ${imgHtml}
      <div class="food-card-body">
        <div class="food-card-header">
          <div class="food-card-title">${l.name}</div>
          <span class="food-type-badge ${l.type === 'free' ? 'type-free' : 'type-paid'}">${l.type === 'free' ? 'FREE' : '₹' + l.price}</span>
        </div>
        <div class="food-card-meta">
          <div class="meta-row">📍 ${l.location}</div>
          <div class="meta-row">📦 ${l.quantity}</div>
        </div>
        <div class="food-urgency ${exp.cls}">${exp.label}</div>
        <div class="food-card-footer">
          <div class="${l.type === 'free' ? 'food-price free-price' : 'food-price'}">${l.type === 'free' ? '🆓 Free' : '₹' + l.price}</div>
          <button class="btn ${l.type === 'free' ? 'btn-primary' : 'btn-amber'} btn-sm" onclick="event.stopPropagation(); openFoodDetail('${l._id}')">
            ${l.type === 'free' ? '🎁 Claim' : '🛍️ Order'}
          </button>
        </div>
      </div>
    </div>`;
}

// ============================================================
// FOOD DETAIL MODAL
// ============================================================
async function openFoodDetail(id) {
  const listings = await API.get('/listings');
  const l = listings.find(x => x._id === id);
  if (!l) return;
  const exp = getExpiryStatus(l.expiryTime);
  const user = currentUser();

  const modal = document.getElementById('modal-food-content');
  modal.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div class="modal-food-emoji">${categoryEmoji(l.category)}</div>
      <h2 class="modal-food-title">${l.name}</h2>
      <div class="modal-badges">
        <span class="food-type-badge ${l.type === 'free' ? 'type-free' : 'type-paid'}" style="margin:0 auto">${l.type === 'free' ? '🆓 FREE DONATION' : '💰 DISCOUNTED'}</span>
        <span class="food-urgency ${exp.cls}" style="margin:0 auto">${exp.label}</span>
      </div>
    </div>
    ${l.image ? `<img src="${l.image}" style="width:100%;border-radius:12px;margin-bottom:16px;max-height:220px;object-fit:cover" alt="${l.name}">` : ''}
    <p class="modal-desc">${l.description || 'No additional description provided.'}</p>
    <div class="modal-info-grid">
      <div class="modal-info-item"><div class="label">📦 Quantity</div><div class="value">${l.quantity}</div></div>
      <div class="modal-info-item"><div class="label">📍 Pickup Location</div><div class="value">${l.location}</div></div>
      <div class="modal-info-item"><div class="label">⏰ Expires</div><div class="value">${formatDate(l.expiryTime)}</div></div>
    </div>
    <div class="modal-price">${l.type === 'free' ? '🆓 Free' : '₹' + l.price + ' <span style="font-size:14px;color:var(--text-muted);font-family:DM Sans">discounted</span>'}</div>
    ${user && user.role === 'receiver' ? `
      <button class="btn btn-primary btn-full btn-lg" onclick="claimOrOrder('${l._id}')">Request Food</button>` : ''}`;

  document.getElementById('modal-food-detail').classList.add('active');
}

async function claimOrOrder(listingId) {
  const user = currentUser();
  if (!user) { showToast('Please login first.', 'error'); return; }

  if (!user.isVerified) {
    showToast('⚠️ Please verify your email first! Check your inbox.', 'error');
    return;
  }

  // Fetch listing from API
  const listings = await API.get('/listings');
  const listing = listings.find(l => l._id === listingId);
  if (!listing) return showToast('Listing not found.', 'error');

  const orderBtn = document.querySelector('#modal-food-content .btn');
  if (orderBtn) { orderBtn.textContent = '⏳ Sending OTP...'; orderBtn.disabled = true; }

  const res = await API.post('/orders', {
    listingId,
    receiverId: user.id,
    donorId: listing.donorId,
    amount: listing.price
  });

  if (orderBtn) { orderBtn.textContent = 'Request Food'; orderBtn.disabled = false; }

  if (res.error) return showToast(res.error, 'error');

  _pendingRequest = { ...listing, orderId: res.orderId };

  document.getElementById('modal-food-detail').classList.remove('active');
  showToast('📧 OTP sent to your Gmail! Check your inbox.');

  // Show OTP modal after a brief moment
  setTimeout(() => {
    clearOTPInputs();
    startOTPTimer();
    document.getElementById('modal-otp-verify').classList.add('active');
    setTimeout(() => document.getElementById('otp-1').focus(), 100);
  }, 1000);
}

let otpInterval;
function startOTPTimer() {
  let timeLeft = 300;
  const disp = document.getElementById('otp-timer-display');
  if (!disp) return;
  clearInterval(otpInterval);
  disp.textContent = "05:00 MIN";
  otpInterval = setInterval(() => {
    timeLeft--;
    if(timeLeft <= 0) {
      clearInterval(otpInterval);
      disp.textContent = "00:00 - EXPIRED";
    } else {
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      disp.textContent = "0" + m + ":" + (s < 10 ? '0' : '') + s + " MIN";
    }
  }, 1000);
}

function clearOTPInputs() {
  ['otp-1','otp-2','otp-3','otp-4','otp-5','otp-6'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('otp-error');
  if (errEl) errEl.style.display = 'none';
}

function moveOTP(el, nextId) {
  if (el.value.length === 1 && nextId) {
    document.getElementById(nextId).focus();
  }
}

function backOTP(event, prevId) {
  if (event.key === 'Backspace' && !event.target.value && prevId) {
    document.getElementById(prevId).focus();
  }
}

function cancelOTP() {
  document.getElementById('modal-otp-verify').classList.remove('active');
  _pendingRequest = null;
  clearOTPInputs();
  clearInterval(otpInterval);
}

async function verifyOrderOTP() {
  const otp = [
    document.getElementById('otp-1').value,
    document.getElementById('otp-2').value,
    document.getElementById('otp-3').value,
    document.getElementById('otp-4').value,
    document.getElementById('otp-5').value,
    document.getElementById('otp-6').value
  ].join('');

  if (otp.length < 6) {
    const errEl = document.getElementById('otp-error');
    errEl.textContent = 'Please enter the full 6-digit OTP.';
    errEl.style.display = 'block';
    return;
  }

  const errEl = document.getElementById('otp-error');
  errEl.style.display = 'none';

  const verifyBtn = document.querySelector('#modal-otp-verify .btn-primary');
  if (verifyBtn) { verifyBtn.textContent = 'Verifying...'; verifyBtn.disabled = true; }

  const res = await API.post('/orders/verify', {
    orderId: _pendingRequest.orderId,
    otp
  });

  if (verifyBtn) { verifyBtn.textContent = 'Verify & Confirm'; verifyBtn.disabled = false; }

  if (res.error) {
    errEl.textContent = res.error === 'Invalid OTP' ? '❌ Invalid OTP. Please check your email.' : '⏰ OTP has expired. Please request a new one.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('modal-otp-verify').classList.remove('active');
  clearInterval(otpInterval);
  showToast('🎉 Order verified and completed! Check your email for confirmation.', 'success');

  _pendingRequest = null;
  clearOTPInputs();

  // Refresh listings
  renderBrowseListings();
  renderReceiverOrders();
}

async function resendOrderOTP() {
  if (!_pendingRequest) return;
  const user = currentUser();

  // Delete old order and create a new one to get fresh OTP
  const btn = document.querySelector('#modal-otp-verify .auth-switch a');

  const listings = await API.get('/listings');
  const listing = listings.find(l => l._id === _pendingRequest._id);
  if (!listing) return showToast('Listing no longer available.', 'error');

  const res = await API.post('/orders', {
    listingId: _pendingRequest._id,
    receiverId: user.id,
    donorId: listing.donorId,
    amount: listing.price
  });

  if (res.error) return showToast(res.error, 'error');

  _pendingRequest = { ..._pendingRequest, orderId: res.orderId };
  clearOTPInputs();
  showToast('📧 New OTP sent to your Gmail!', 'info');
}

// ============================================================
// RECEIVER: MY CLAIMS & ORDERS
// ============================================================
async function renderReceiverClaims() {
  const user = currentUser();
  if (!user) return;

  const res = await API.get(`/receiver/dashboard/${user.id}`);
  if (res.error) return showToast(res.error, 'error');

  const claims = (res.requests || []).filter(r => r.type === 'free');
  const el = document.getElementById('receiver-claims-list');

  if (claims.length === 0) {
    el.innerHTML = `<div class="empty-full"><div class="empty-icon">🎁</div><h3>No claims yet</h3><p>Browse free food listings and claim your first one!</p></div>`;
    return;
  }

  el.innerHTML = claims.map(r => buildRequestCard(r)).join('');
}

async function renderReceiverOrders() {
  const user = currentUser();
  if (!user) return;

  const res = await API.get(`/receiver/dashboard/${user.id}`);
  if (res.error) return showToast(res.error, 'error');

  const orders = (res.requests || []).filter(r => r.type === 'paid' || r.amount > 0);
  const el = document.getElementById('receiver-orders-list');

  if (orders.length === 0) {
    el.innerHTML = `<div class="empty-full"><div class="empty-icon">🛍️</div><h3>No orders yet</h3><p>Browse discounted food and place your first order!</p></div>`;
    return;
  }

  el.innerHTML = orders.map(r => buildRequestCard(r)).join('');
}

function buildRequestCard(r) {
  const statusColors = { pending: '#E65100', verified: '#1565C0', completed: '#2D6A4F', rejected: '#C62828' };
  const statusIcons = { pending: '⏳', verified: '✅', completed: '🎉', rejected: '❌' };
  const icon = statusIcons[r.status] || '📦';

  const imgHtml = r.image
    ? `<img src="${r.image}" style="width:70px;height:70px;border-radius:8px;object-fit:cover;flex-shrink:0" alt="${r.foodName}">`
    : `<span class="req-emoji" style="width:70px;height:70px;display:flex;align-items:center;justify-content:center;background:var(--ivory-dark);border-radius:8px;font-size:32px;flex-shrink:0">${categoryEmoji(r.category)}</span>`;

  const progress = r.status === 'pending' ? '10%' : r.status === 'verified' ? '65%' : r.status === 'completed' ? '100%' : '0';

  return `
    <div class="request-card">
      ${imgHtml}
      <div class="req-body">
        <div class="req-title">${r.foodName}</div>
        <div class="req-meta">
          <span>🎁 From ${r.donorName || 'Donor'}</span>
          <span>📦 ${r.quantity}</span>
          ${r.amount > 0 ? `<span>💰 ₹${r.amount}</span>` : '<span>🆓 Free</span>'}
        </div>
        <div class="req-meta" style="margin-top:6px;gap:12px">
          ${r.expiryTime ? `<span>⏰ Exp: ${formatDate(r.expiryTime)}</span>` : ''}
          ${r.location ? `<span>📍 ${r.location}</span>` : ''}
        </div>
        ${r.status !== 'rejected' ? `
        <div class="journey-timeline">
          <div class="journey-track">
            <div class="journey-progress" style="width: ${progress}"></div>
          </div>
          <div class="journey-steps">
            <div class="journey-step active">
              <div class="js-dot"></div><div class="js-label">Requested</div>
            </div>
            <div class="journey-step ${['verified','completed'].includes(r.status) ? 'active' : ''}">
              <div class="js-dot"></div><div class="js-label">OTP Verified</div>
            </div>
            <div class="journey-step ${r.status === 'completed' ? 'active' : ''} ${r.status === 'verified' ? 'pulsing' : ''}">
              <div class="js-dot"></div><div class="js-label">Pickup</div>
            </div>
            <div class="journey-step ${r.status === 'completed' ? 'active' : ''}">
              <div class="js-dot"></div><div class="js-label">Done</div>
            </div>
          </div>
        </div>
        ` : ''}
        ${r.status === 'rejected' ? '<div style="margin-top:8px;font-size:13px;color:#C62828;font-weight:600">❌ This request was declined.</div>' : ''}
      </div>
      <div class="req-status">
        <span class="mini-badge badge-${r.status}">${icon} ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
        <div class="req-timestamp">${timeAgo(r.createdAt)}</div>
      </div>
    </div>`;
}

// ============================================================
// MODAL CLOSE
// ============================================================
function closeModal(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.classList.remove('active');
  }
}

// Email preview modal (legacy — kept for UI) 
function closeEmailPreview() {
  document.getElementById('modal-email-preview').classList.remove('active');
  document.getElementById('modal-otp-verify').classList.add('active');
  setTimeout(() => document.getElementById('otp-1').focus(), 100);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Restore session if user was logged in
  const user = currentUser();
  if (user) {
    if (user.role === 'donor') showPage('page-donor');
    else showPage('page-receiver');
  }

  // Animate landing stats
  animateCounter('stat-meals', 12480);
  animateCounter('stat-donors', 843);

  // Refresh expiry indicators every 60 seconds
  setInterval(() => {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    if (activePage.id === 'page-receiver') {
      const browseSection = document.getElementById('receiver-browse');
      if (browseSection && browseSection.classList.contains('active')) renderBrowseListings();
    }
    if (activePage.id === 'page-donor') {
      const myListings = document.getElementById('donor-my-listings');
      if (myListings && myListings.classList.contains('active')) renderDonorListings(_donorListingFilter);
    }
  }, 60000);
});

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let count = 0;
  const step = Math.ceil(target / 60);
  const timer = setInterval(() => {
    count = Math.min(count + step, target);
    el.textContent = count.toLocaleString('en-IN');
    if (count >= target) clearInterval(timer);
  }, 25);
}
