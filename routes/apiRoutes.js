const express = require('express');
const User = require('../models/User');
const FeatureRequest = require('../models/FeatureRequest');
const { protect } = require('../middleware/auth');
const { verifyApiKey } = require('../middleware/apiKey');

const router = express.Router();

// 1. CEK STATUS API KEY (Bisa diakses langsung via Bot WA: GET /api/check-apikey?apikey=xxx)
router.get('/check-apikey', async (req, res) => {
  try {
    const apiKey = req.query.apikey || req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(400).json({ status: false, message: 'Masukkan parameter ?apikey=' });
    }

    const user = await User.findOne({ apiKey });
    if (!user) {
      return res.status(404).json({ status: false, message: 'API Key tidak ditemukan' });
    }

    await user.syncPlanAndLimit();
    const isUnlimited = user.role === 'vip' || user.role === 'owner';

    res.json({
      status: true,
      result: {
        username: user.username,
        role: user.role.toUpperCase(),
        limitUsed: user.limit.used,
        limitMax: isUnlimited ? 'Unlimited' : user.limit.max,
        limitRemaining: isUnlimited ? 'Unlimited' : Math.max(0, user.limit.max - user.limit.used),
        customApiKeyAllowed: ['premium', 'vip', 'owner'].includes(user.role),
        expiredAt: user.planExpiredAt ? user.planExpiredAt.toISOString() : 'Tidak ada masa kedaluwarsa (Free Plan)'
      }
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mengecek API Key', error: error.message });
  }
});

// 2. PRICING / PREMIUM LIST (Mengarahkan user menghubungi Owner via Username)
router.get('/pricing', async (req, res) => {
  const ownerUsername = process.env.OWNER_USERNAME || 'owner';
  const ownerWhatsapp = process.env.OWNER_WHATSAPP || '6281234567890';

  res.json({
    status: true,
    ownerContact: {
      username: `@${ownerUsername}`,
      whatsappUrl: `https://wa.me/${ownerWhatsapp}?text=Halo%20@${ownerUsername},%20saya%20ingin%20upgrade%20akun%20REST%20API`,
      instruction: `Untuk melakukan upgrade ke paket Premium atau VIP, silakan hubungi Owner melalui username @${ownerUsername} dan sertakan username akun Anda.`
    },
    plans: [
      {
        name: 'Free / User Biasa',
        role: 'user',
        price: 'Rp 0',
        duration: 'Selamanya',
        dailyLimit: `${process.env.LIMIT_USER || 50} Request / Hari`,
        customApiKey: false,
        features: ['Akses fitur dasar Bot WA', 'Reset limit otomatis setiap pukul 00:00 WIB']
      },
      {
        name: 'Premium Plan',
        role: 'premium',
        price: 'Rp 15.000',
        duration: '30 Hari',
        dailyLimit: '1.000 Request / Hari',
        customApiKey: true,
        features: ['1.000 request per hari', 'Bebas kustomisasi API Key', 'Akses fitur Premium Downloader & AI', 'Masa aktif 30 hari']
      },
      {
        name: 'VIP Plan',
        role: 'vip',
        price: 'Rp 35.000',
        duration: '30 Hari',
        dailyLimit: 'Unlimited Request',
        customApiKey: true,
        features: ['Request Tanpa Batas (Unlimited)', 'Bebas kustomisasi API Key', 'Prioritas server & semua fitur VIP', 'Masa aktif 30 hari']
      }
    ]
  });
});

// 3. REQUEST FITUR BARU (User mengajukan pembuatan fitur baru ke Owner)
router.post('/request-feature', protect, async (req, res) => {
  try {
    const { featureName, description } = req.body;
    if (!featureName || !description) {
      return res.status(400).json({ status: false, message: 'Nama fitur dan deskripsi wajib diisi' });
    }

    const request = await FeatureRequest.create({
      user: req.user._id,
      featureName,
      description
    });

    res.status(201).json({
      status: true,
      message: `Request fitur berhasil dikirim. Anda juga dapat berdiskusi langsung dengan owner @${process.env.OWNER_USERNAME}.`,
      data: request
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mengirim request fitur', error: error.message });
  }
});

// 4. CONTOH ENDPOINT FITUR BOT WA (Memotong Limit Harian)
// Cara panggil: GET /api/feature/tiktok?url=https://vt.tiktok.com/xxx&apikey=KEY_ANDA
router.get('/feature/tiktok', verifyApiKey, async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ status: false, message: 'Parameter ?url= wajib diisi' });
  }

  const user = req.apiUser;
  const isUnlimited = user.role === 'vip' || user.role === 'owner';

  // Contoh simulasi respons fitur downloader untuk Bot WhatsApp
  res.json({
    status: true,
    creator: `@${process.env.OWNER_USERNAME}`,
    remainingLimit: isUnlimited ? 'Unlimited' : user.limit.max - user.limit.used,
    result: {
      url,
      title: 'Contoh Video TikTok Tanpa Watermark',
      videoNoWatermark: 'https://cdn.example.com/video-nowm.mp4',
      audio: 'https://cdn.example.com/audio.mp3'
    }
  });
});
// Tambahkan di dalam routes/apiRoutes.js

// DAFTAR ENDPOINT UNTUK UI DOCS (Gaya zelapi.eu.cc)
router.get('/docs-list', (req, res) => {
  res.json({
    status: true,
    apiName: 'Zel-Style WA Bot API',
    version: 'v1.0',
    owner: `@${process.env.OWNER_USERNAME || 'admin_owner'}`,
    categories: ['Downloader', 'AI', 'Tools', 'Account'],
    endpoints: [
      {
        category: 'Downloader',
        name: 'TikTok No Watermark',
        method: 'GET',
        path: '/api/feature/tiktok',
        description: 'Download video & audio TikTok tanpa watermark.',
        status: 'Active',
        params: [
          { name: 'url', type: 'text', required: true, placeholder: 'https://vt.tiktok.com/ZSxxxx/' },
          { name: 'apikey', type: 'apikey', required: true, placeholder: 'API Key Anda' }
        ]
      },
      {
        category: 'Downloader',
        name: 'Instagram Reels / Post',
        method: 'GET',
        path: '/api/feature/igdl',
        description: 'Download video Reels atau foto dari Instagram.',
        status: 'Active',
        params: [
          { name: 'url', type: 'text', required: true, placeholder: 'https://www.instagram.com/reel/xxxx/' },
          { name: 'apikey', type: 'apikey', required: true, placeholder: 'API Key Anda' }
        ]
      },
      {
        category: 'AI',
        name: 'AI Chat Assistant',
        method: 'GET',
        path: '/api/feature/ai-chat',
        description: 'Tanya jawab dengan AI pintar untuk kebutuhan auto-reply bot WA.',
        status: 'Active',
        params: [
          { name: 'prompt', type: 'text', required: true, placeholder: 'Jelaskan apa itu Node.js secara singkat' },
          { name: 'apikey', type: 'apikey', required: true, placeholder: 'API Key Anda' }
        ]
      },
      {
        category: 'Tools',
        name: 'Screenshot Website (SSWeb)',
        method: 'GET',
        path: '/api/feature/ssweb',
        description: 'Mengambil tangkapan layar penuh dari URL website.',
        status: 'Active',
        params: [
          { name: 'url', type: 'text', required: true, placeholder: 'https://google.com' },
          { name: 'apikey', type: 'apikey', required: true, placeholder: 'API Key Anda' }
        ]
      },
      {
        category: 'Account',
        name: 'Check API Key & Limit',
        method: 'GET',
        path: '/api/check-apikey',
        description: 'Mengecek status role, sisa limit harian, dan masa aktif paket.',
        status: 'Active',
        params: [
          { name: 'apikey', type: 'apikey', required: true, placeholder: 'API Key Anda' }
        ]
      }
    ]
  });
});

// Contoh tambahan endpoint AI & IG agar bisa langsung dites di Docs
router.get('/feature/igdl', verifyApiKey, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ status: false, message: 'Parameter ?url= wajib diisi' });
  res.json({
    status: true,
    creator: `@${process.env.OWNER_USERNAME}`,
    result: { url, type: 'video', mediaUrl: 'https://cdn.example.com/ig-reel.mp4' }
  });
});

router.get('/feature/ai-chat', verifyApiKey, async (req, res) => {
  const { prompt } = req.query;
  if (!prompt) return res.status(400).json({ status: false, message: 'Parameter ?prompt= wajib diisi' });
  res.json({
    status: true,
    creator: `@${process.env.OWNER_USERNAME}`,
    result: { prompt, reply: `Ini adalah respons simulasi AI untuk: "${prompt}"` }
  });
});

router.get('/feature/ssweb', verifyApiKey, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ status: false, message: 'Parameter ?url= wajib diisi' });
  res.json({
    status: true,
    creator: `@${process.env.OWNER_USERNAME}`,
    result: { website: url, screenshotUrl: 'https://cdn.example.com/ssweb-preview.png' }
  });
});
module.exports = router;
