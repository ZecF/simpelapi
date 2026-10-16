const express = require('express');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// 1. GET PROFIL USER SAAT INI
router.get('/profile', protect, async (req, res) => {
  const user = req.user;
  const isUnlimited = user.role === 'vip' || user.role === 'owner';

  res.json({
    status: true,
    data: {
      username: user.username,
      email: user.email,
      role: user.role,
      profile: user.profile,
      apiKey: user.apiKey,
      limit: {
        used: user.limit.used,
        max: isUnlimited ? 'Unlimited' : user.limit.max,
        remaining: isUnlimited ? 'Unlimited' : Math.max(0, user.limit.max - user.limit.used),
        resetDate: user.limit.lastResetDate
      },
      planExpiredAt: user.planExpiredAt
    }
  });
});

// 2. EDIT PROFIL & PREFERENSI TEMA (DARK / LIGHT MODE)
router.put('/profile', protect, async (req, res) => {
  try {
    const { username, fullName, bio, avatar, whatsapp, themePreference } = req.body;
    const user = req.user;

    if (username && username.toLowerCase() !== user.username) {
      const exists = await User.findOne({ username: username.toLowerCase() });
      if (exists) {
        return res.status(400).json({ status: false, message: 'Username sudah digunakan pengguna lain' });
      }
      user.username = username.toLowerCase();
    }

    if (fullName !== undefined) user.profile.fullName = fullName;
    if (bio !== undefined) user.profile.bio = bio;
    if (avatar !== undefined) user.profile.avatar = avatar;
    if (whatsapp !== undefined) user.profile.whatsapp = whatsapp;
    if (themePreference && ['light', 'dark'].includes(themePreference)) {
      user.profile.themePreference = themePreference;
    }

    await user.save({ validateBeforeSave: false });

    res.json({
      status: true,
      message: 'Profil berhasil diperbarui',
      profile: user.profile,
      username: user.username
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal memperbarui profil', error: error.message });
  }
});

// 3. CUSTOM API KEY (HANYA UNTUK PREMIUM, VIP, ATAU OWNER)
router.put('/custom-apikey', protect, authorize('premium', 'vip', 'owner'), async (req, res) => {
  try {
    const { newApiKey } = req.body;

    if (!newApiKey || !/^[a-zA-Z0-9_-]{5,32}$/.test(newApiKey)) {
      return res.status(400).json({
        status: false,
        message: 'Custom API Key harus terdiri dari 5-32 karakter alfanumerik (huruf, angka, strip, atau underscore)'
      });
    }

    const keyUsed = await User.findOne({ apiKey: newApiKey });
    if (keyUsed) {
      return res.status(400).json({ status: false, message: 'API Key tersebut sudah digunakan, pilih kombinasi lain' });
    }

    req.user.apiKey = newApiKey;
    await req.user.save({ validateBeforeSave: false });

    res.json({
      status: true,
      message: 'Custom API Key berhasil disimpan',
      apiKey: req.user.apiKey
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mengubah API Key', error: error.message });
  }
});

// 4. MANAJEMEN PLAN OLEH OWNER (UPGRADE USER KE PREMIUM / VIP SELAMA 30 HARI)
router.put('/owner/set-plan', protect, authorize('owner'), async (req, res) => {
  try {
    const { targetUsername, role, durationDays = 30 } = req.body;

    if (!['user', 'premium', 'vip'].includes(role)) {
      return res.status(400).json({ status: false, message: 'Role target harus berupa user, premium, atau vip' });
    }

    const targetUser = await User.findOne({ username: targetUsername?.toLowerCase() });
    if (!targetUser) {
      return res.status(404).json({ status: false, message: `User @${targetUsername} tidak ditemukan` });
    }

    targetUser.role = role;
    targetUser.limit.used = 0;

    if (role === 'user') {
      targetUser.limit.max = parseInt(process.env.LIMIT_USER) || 50;
      targetUser.planExpiredAt = null;
    } else if (role === 'premium') {
      targetUser.limit.max = parseInt(process.env.LIMIT_PREMIUM) || 1000;
      targetUser.planExpiredAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    } else if (role === 'vip') {
      targetUser.limit.max = 999999999; // Unlimited indicator
      targetUser.planExpiredAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    }

    await targetUser.save({ validateBeforeSave: false });

    res.json({
      status: true,
      message: `Berhasil mengubah role @${targetUser.username} menjadi ${role.toUpperCase()} selama ${role === 'user' ? 'permanen' : durationDays + ' hari'}`,
      data: {
        username: targetUser.username,
        role: targetUser.role,
        limitMax: role === 'vip' ? 'Unlimited' : targetUser.limit.max,
        planExpiredAt: targetUser.planExpiredAt
      }
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mengubah plan user', error: error.message });
  }
});

module.exports = router;
