const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

// 1. REGISTER & KIRIM EMAIL VERIFIKASI
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ status: false, message: 'Username, email, dan password wajib diisi' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username: username.toLowerCase() }] });
    if (existingUser) {
      return res.status(400).json({ status: false, message: 'Username atau Email sudah digunakan' });
    }

    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');

    const user = await User.create({
      username,
      email,
      password,
      verificationToken: hashedVerifyToken,
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000 // Berlaku 24 jam
    });

    const verifyUrl = `${process.env.BASE_URL}/api/auth/verify-email/${rawVerifyToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Verifikasi Email - REST API Bot WhatsApp',
      html: `
        <h3>Halo, ${user.username}!</h3>
        <p>Terima kasih telah mendaftar. Silakan klik tombol/tautan di bawah ini untuk memverifikasi akun dan mengaktifkan API Key Anda:</p>
        <a href="${verifyUrl}" style="padding:10px 15px; background:#4F46E5; color:#fff; text-decoration:none; border-radius:5px;">Verifikasi Email</a>
        <p>Atau salin URL ini: ${verifyUrl}</p>
        <p>Tautan ini berlaku selama 24 jam.</p>
      `
    });

    res.status(201).json({
      status: true,
      message: 'Registrasi berhasil! Silakan cek inbox/spam email Anda untuk verifikasi akun.'
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal melakukan registrasi', error: error.message });
  }
});

// 2. VERIFIKASI EMAIL DARI LINK SMTP
router.get('/verify-email/:token', async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ status: false, message: 'Token verifikasi tidak valid atau sudah kedaluwarsa' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({
      status: true,
      message: 'Email berhasil diverifikasi! Sekarang Anda dapat login dan menggunakan API Key.',
      apiKey: user.apiKey
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal memverifikasi email', error: error.message });
  }
});

// 3. LOGIN
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ status: false, message: 'Masukkan username/email dan password' });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername.toLowerCase() }]
    }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ status: false, message: 'Kredensial tidak valid' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ status: false, message: 'Email belum diverifikasi. Silakan cek email Anda.' });
    }

    await user.syncPlanAndLimit();
    const token = generateToken(user._id);

    res.json({
      status: true,
      message: 'Login berhasil',
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        apiKey: user.apiKey,
        themePreference: user.profile.themePreference
      }
    });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal login', error: error.message });
  }
});

// 4. FORGOT PASSWORD (KIRIM EMAIL RESET)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });

    if (!user) {
      return res.status(404).json({ status: false, message: 'Email tidak terdaftar' });
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // Berlaku 30 menit
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.BASE_URL}/api/auth/reset-password/${rawResetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset Password - REST API Bot WhatsApp',
      html: `
        <h3>Permintaan Reset Password</h3>
        <p>Gunakan tautan berikut untuk mengatur ulang password Anda (berlaku 30 menit):</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Jika Anda tidak merasa meminta reset password, abaikan email ini.</p>
      `
    });

    res.json({ status: true, message: 'Tautan reset password telah dikirim ke email Anda' });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mengirim email reset password', error: error.message });
  }
});

// 5. RESET PASSWORD
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ status: false, message: 'Password baru minimal 6 karakter' });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ status: false, message: 'Token tidak valid atau sudah kedaluwarsa' });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ status: true, message: 'Password berhasil diubah, silakan login kembali' });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mereset password', error: error.message });
  }
});

module.exports = router;
