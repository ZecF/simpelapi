let allEndpoints = [];
let activeCategory = 'All';
let currentAuthMode = 'login';

// 1. INISIALISASI SAAT HALAMAN DIMUAT
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const savedKey = localStorage.getItem('api_key') || '';
  document.getElementById('globalApiKey').value = savedKey;

  await loadDocsList();
  await loadPricingModal();

  const token = localStorage.getItem('jwt_token');
  if (token) {
    await fetchUserProfile();
  } else if (savedKey) {
    await verifyGlobalKey();
  }
});

// 2. DARK / LIGHT MODE
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const nextTheme = isDark ? 'light' : 'dark';
  applyTheme(nextTheme);

  const token = localStorage.getItem('jwt_token');
  if (token) {
    fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ themePreference: nextTheme })
    });
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.getElementById('themeBtn').textContent = '☀️';
  } else {
    document.documentElement.classList.remove('dark');
    document.getElementById('themeBtn').textContent = '🌙';
  }
  localStorage.setItem('theme', theme);
}

// 3. MUAT DAFTAR ENDPOINT DARI BACKEND
async function loadDocsList() {
  try {
    const res = await fetch('/api/docs-list');
    const data = await res.json();
    if (!data.status) return;

    document.getElementById('brandTitle').textContent = data.apiName;
    document.getElementById('brandVersion').textContent = `${data.version} • By ${data.owner}`;

    allEndpoints = data.endpoints;
    renderCategoryTabs(['All', ...data.categories]);
    renderEndpoints();
  } catch (err) {
    console.error('Gagal memuat daftar dokumentasi:', err);
  }
}

function renderCategoryTabs(categories) {
  const container = document.getElementById('categoryTabs');
  container.innerHTML = categories.map(cat => {
    const active = cat === activeCategory;
    return `
      <button
        onclick="setCategory('${cat}')"
        class="text-xs font-medium px-3.5 py-1.5 rounded-lg shrink-0 transition ${
          active
            ? 'bg-indigo-600 text-white'
            : 'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-500'
        }">
        ${cat}
      </button>
    `;
  }).join('');
}

function setCategory(cat) {
  activeCategory = cat;
  const categories = ['All', ...new Set(allEndpoints.map(e => e.category))];
  renderCategoryTabs(categories);
  renderEndpoints();
}

// 4. RENDER ACCORDION ENDPOINT (GAYA ZELAPI)
function renderEndpoints() {
  const query = document.getElementById('searchEndpoint').value.toLowerCase();
  const globalKey = document.getElementById('globalApiKey').value.trim();
  const container = document.getElementById('endpointsContainer');

  const filtered = allEndpoints.filter(ep => {
    const matchCategory = activeCategory === 'All' || ep.category === activeCategory;
    const matchQuery = ep.name.toLowerCase().includes(query) || ep.path.toLowerCase().includes(query);
    return matchCategory && matchQuery;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">Endpoint tidak ditemukan.</div>`;
    return;
  }

  container.innerHTML = filtered.map((ep, idx) => `
    <div class="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden transition">
      <!-- Baris Header Endpoint -->
      <button onclick="toggleAccordion(${idx})" class="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            ${ep.method}
          </span>
          <div class="truncate">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-xs">${ep.name}</span>
              <span class="text-[11px] font-mono text-slate-400 hidden sm:inline">${ep.path}</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${ep.description}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">${ep.category}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">${ep.status}</span>
          <span id="arrow-${idx}" class="text-slate-400 text-xs transition-transform">▼</span>
        </div>
      </button>

      <!-- Panel Playground (Try It Out) -->
      <div id="panel-${idx}" class="hidden border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-[#0d1322] text-xs space-y-4">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[11px] text-indigo-400">${ep.method} ${ep.path}</span>
        </div>

        <!-- Form Input Parameter -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${ep.params.map(p => `
            <div>
              <label class="block mb-1 text-[11px] text-slate-400 font-mono">
                ${p.name}${p.required ? '<span class="text-red-400">*</span>' : ''}
              </label>
              <input
                type="text"
                data-param="${p.name}"
                data-apikey-input="${p.type === 'apikey' ? 'true' : 'false'}"
                value="${p.type === 'apikey' ? globalKey : ''}"
                placeholder="${p.placeholder}"
                class="param-input-${idx} w-full font-mono text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          `).join('')}
        </div>

        <!-- Tombol Eksekusi -->
        <div class="flex items-center gap-2">
          <button onclick="executeEndpoint(${idx}, '${ep.path}')" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition">
            ▶ Execute
          </button>
          <button onclick="openRawEndpoint(${idx}, '${ep.path}')" class="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 font-mono text-[11px]">
            Buka URL ↗
          </button>
        </div>

        <!-- Box Hasil Response JSON -->
        <div id="resBox-${idx}" class="hidden space-y-2">
          <div class="flex items-center justify-between text-[11px] font-mono">
            <div>
              Status: <span id="resStatus-${idx}" class="font-bold"></span> •
              Time: <span id="resTime-${idx}" class="text-slate-400"></span>
            </div>
            <button onclick="copyResponse(${idx})" class="text-indigo-400 hover:underline">Copy JSON</button>
          </div>
          <pre id="resJson-${idx}" class="p-3.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-80"></pre>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleAccordion(idx) {
  const panel = document.getElementById(`panel-${idx}`);
  const arrow = document.getElementById(`arrow-${idx}`);
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !isHidden);
  arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

// Sinkronisasi Global API Key ke semua form parameter
function syncGlobalApiKey(val) {
  localStorage.setItem('api_key', val.trim());
  document.querySelectorAll('input[data-apikey-input="true"]').forEach(el => {
    el.value = val.trim();
  });
}

// 5. EKSEKUSI ENDPOINT LANGSUNG DARI DOCS
function buildEndpointUrl(idx, basePath) {
  const inputs = document.querySelectorAll(`.param-input-${idx}`);
  const params = new URLSearchParams();
  inputs.forEach(input => {
    if (input.value.trim() !== '') {
      params.append(input.getAttribute('data-param'), input.value.trim());
    }
  });
  return `${basePath}?${params.toString()}`;
}

async function executeEndpoint(idx, basePath) {
  const url = buildEndpointUrl(idx, basePath);
  const resBox = document.getElementById(`resBox-${idx}`);
  const resStatus = document.getElementById(`resStatus-${idx}`);
  const resTime = document.getElementById(`resTime-${idx}`);
  const resJson = document.getElementById(`resJson-${idx}`);

  resBox.classList.remove('hidden');
  resJson.textContent = 'Loading...';

  const start = performance.now();
  try {
    const response = await fetch(url);
    const elapsed = Math.round(performance.now() - start);
    const data = await response.json();

    resStatus.textContent = `${response.status} ${response.ok ? 'OK' : 'ERROR'}`;
    resStatus.className = response.ok ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
    resTime.textContent = `${elapsed} ms`;
    resJson.textContent = JSON.stringify(data, null, 2);

    // Refresh tampilan limit setelah eksekusi fitur
    verifyGlobalKey();
  } catch (err) {
    resStatus.textContent = '500 ERROR';
    resStatus.className = 'text-red-400 font-bold';
    resJson.textContent = JSON.stringify({ status: false, error: err.message }, null, 2);
  }
}

function openRawEndpoint(idx, basePath) {
  window.open(buildEndpointUrl(idx, basePath), '_blank');
}

function copyResponse(idx) {
  const text = document.getElementById(`resJson-${idx}`).textContent;
  navigator.clipboard.writeText(text);
}

// 6. CEK API KEY & STATUS LIMIT
async function verifyGlobalKey() {
  const key = document.getElementById('globalApiKey').value.trim();
  if (!key) return;

  try {
    const res = await fetch(`/api/check-apikey?apikey=${encodeURIComponent(key)}`);
    const data = await res.json();
    if (data.status) {
      const r = data.result;
      document.getElementById('keyRoleBadge').textContent = `${r.username} • ${r.role}`;
      document.getElementById('limitDisplay').textContent = `${r.limitUsed} / ${r.limitMax}`;
      document.getElementById('expiredDisplay').textContent = `Sisa: ${r.limitRemaining}`;
    } else {
      document.getElementById('keyRoleBadge').textContent = 'Invalid Key';
      document.getElementById('limitDisplay').textContent = '0 / 0';
      document.getElementById('expiredDisplay').textContent = data.message;
    }
  } catch (err) {
    console.error(err);
  }
}

// 7. AUTENTIKASI & PROFIL USER
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function handleAuthButtonClick() {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    openModal('profileModal');
  } else {
    openModal('authModal');
  }
}

function switchAuthTab(mode) {
  currentAuthMode = mode;
  document.getElementById('fieldUsername').classList.toggle('hidden', mode !== 'register');
  document.getElementById('fieldPassword').classList.toggle('hidden', mode === 'forgot');
  document.getElementById('labelEmailOrUser').textContent = mode === 'login' ? 'Email atau Username' : 'Alamat Email';
  document.getElementById('authModalTitle').textContent =
    mode === 'login' ? 'Login Akun' : mode === 'register' ? 'Register Akun Baru' : 'Reset Password via SMTP';
}

async function submitAuth(e) {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const emailOrUser = document.getElementById('authEmailOrUser').value.trim();
  const password = document.getElementById('authPassword').value;
  const fb = document.getElementById('authFeedback');

  let endpoint = '/api/auth/login';
  let body = { emailOrUsername: emailOrUser, password };

  if (currentAuthMode === 'register') {
    endpoint = '/api/auth/register';
    body = { username, email: emailOrUser, password };
  } else if (currentAuthMode === 'forgot') {
    endpoint = '/api/auth/forgot-password';
    body = { email: emailOrUser };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  fb.classList.remove('hidden');
  fb.className = `text-xs p-2.5 rounded-lg ${data.status ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`;
  fb.textContent = data.message;

  if (data.status && currentAuthMode === 'login') {
    localStorage.setItem('jwt_token', data.token);
    syncGlobalApiKey(data.user.apiKey);
    document.getElementById('globalApiKey').value = data.user.apiKey;
    if (data.user.themePreference) applyTheme(data.user.themePreference);
    await fetchUserProfile();
    setTimeout(() => closeModal('authModal'), 600);
  }
}

async function fetchUserProfile() {
  const token = localStorage.getItem('jwt_token');
  if (!token) return;

  const res = await fetch('/api/user/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();

  if (!data.status) {
    localStorage.removeItem('jwt_token');
    return;
  }

  const u = data.data;
  document.getElementById('authActionBtn').textContent = `@${u.username}`;
  document.getElementById('globalApiKey').value = u.apiKey;
  syncGlobalApiKey(u.apiKey);

  document.getElementById('profUsername').value = u.username;
  document.getElementById('profFullName').value = u.profile.fullName || '';
  document.getElementById('profBio').value = u.profile.bio || '';
  document.getElementById('customKeyInput').value = u.apiKey;

  await verifyGlobalKey();
}

async function saveProfile() {
  const token = localStorage.getItem('jwt_token');
  const res = await fetch('/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      username: document.getElementById('profUsername').value.trim(),
      fullName: document.getElementById('profFullName').value.trim(),
      bio: document.getElementById('profBio').value.trim()
    })
  });
  const data = await res.json();
  showProfileFeedback(data.status, data.message);
  if (data.status) fetchUserProfile();
}

async function saveCustomApiKey() {
  const token = localStorage.getItem('jwt_token');
  const newApiKey = document.getElementById('customKeyInput').value.trim();
  const res = await fetch('/api/user/custom-apikey', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ newApiKey })
  });
  const data = await res.json();
  showProfileFeedback(data.status, data.message);
  if (data.status) fetchUserProfile();
}

function showProfileFeedback(ok, msg) {
  const el = document.getElementById('profFeedback');
  el.classList.remove('hidden');
  el.className = `p-2 rounded-lg text-xs ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`;
  el.textContent = msg;
}

function logoutUser() {
  localStorage.removeItem('jwt_token');
  document.getElementById('authActionBtn').textContent = 'Login';
  closeModal('profileModal');
}

// 8. PRICING & REQUEST FITUR
async function loadPricingModal() {
  const res = await fetch('/api/pricing');
  const data = await res.json();
  if (!data.status) return;

  document.getElementById('pricingModalContent').innerHTML = data.plans.map(p => `
    <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
      <div>
        <div class="font-bold text-sm mb-1">${p.name}</div>
        <div class="text-lg font-extrabold text-indigo-400 mb-2">${p.price} <span class="text-[11px] font-normal text-slate-400">/ ${p.duration}</span></div>
        <div class="text-[11px] text-slate-400 mb-3">Limit: <strong>${p.dailyLimit}</strong></div>
        <ul class="space-y-1 text-[11px] text-slate-400">
          ${p.features.map(f => `<li>✓ ${f}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');

  document.getElementById('pricingOwnerBox').innerHTML = `
    <p class="mb-2">${data.ownerContact.instruction}</p>
    <a href="${data.ownerContact.whatsappUrl}" target="_blank" class="inline-block px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold">
      Chat Owner (${data.ownerContact.username}) via WhatsApp ↗
    </a>
  `;
}

async function submitFeatureRequest() {
  const token = localStorage.getItem('jwt_token');
  const fb = document.getElementById('reqFeedback');
  if (!token) {
    fb.classList.remove('hidden');
    fb.className = 'p-2 rounded-lg bg-red-500/10 text-red-400';
    fb.textContent = 'Silakan login terlebih dahulu untuk mengirim request fitur.';
    return;
  }

  const res = await fetch('/api/request-feature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      featureName: document.getElementById('reqFeatureName').value.trim(),
      description: document.getElementById('reqFeatureDesc').value.trim()
    })
  });
  const data = await res.json();
  fb.classList.remove('hidden');
  fb.className = `p-2 rounded-lg ${data.status ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`;
  fb.textContent = data.message;
}
