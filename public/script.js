const htmlEl = document.documentElement;
const toggleBtn = document.getElementById('themeToggle');

// 1. Inisialisasi Tema dari localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

toggleBtn.addEventListener('click', async () => {
  const nextTheme = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);

  // Jika user sudah login (memiliki JWT), simpan juga preferensi tema ke MongoDB
  const token = localStorage.getItem('jwt_token');
  if (token) {
    await fetch('/api/user/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ themePreference: nextTheme })
    });
  }
});

function setTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  toggleBtn.textContent = theme === 'dark' ? 'Ubah ke Light Mode' : 'Ubah ke Dark Mode';
}

// 2. Fungsi Cek API Key
async function checkKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  const res = await fetch(`/api/check-apikey?apikey=${encodeURIComponent(key)}`);
  const data = await res.json();
  document.getElementById('keyResult').textContent = JSON.stringify(data, null, 2);
}

// 3. Muat Pricing List & Info Owner
async function loadPricing() {
  const res = await fetch('/api/pricing');
  const data = await res.json();
  if (data.status) {
    const html = data.plans.map(p => `
      <div style="border-bottom: 1px solid var(--border); padding: 10px 0;">
        <strong>${p.name} (${p.price} / ${p.duration})</strong><br/>
        <small>Limit: ${p.dailyLimit} | Custom Key: ${p.customApiKey ? 'Ya' : 'Tidak'}</small>
      </div>
    `).join('');
    document.getElementById('pricingContainer').innerHTML = `
      ${html}
      <p style="margin-top: 12px;">
        <strong>Ingin Upgrade?</strong> ${data.ownerContact.instruction}<br/>
        <a href="${data.ownerContact.whatsappUrl}" target="_blank" style="color: var(--accent);">
          Hubungi Owner (${data.ownerContact.username})
        </a>
      </p>
    `;
  }
}

loadPricing();
