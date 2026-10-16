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

module.exports = router;
