const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

// Fungsi otomatis mendeteksi domain Heroku (https) atau Localhost
const getBaseUrl = (req) => {
  if (process.env.BASE_URL && !process.env.BASE_URL.includes('localhost')) {
    return process.env.BASE_URL.replace(/\/+$/, ''); // Hapus garis miring (/) berlebih di ujung URL
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
};

// 1. REGISTER & KIRIM EMAIL VERIFIKASI
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ status: false, message: 'Username, email, dan password wajib diisi' });
    }

    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
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

    const baseUrl = getBaseUrl(req);
    const verifyUrl = `${baseUrl}/api/auth/verify-email/${rawVerifyToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Verifikasi Email - REST API Bot WhatsApp',
      html: `
        <h3>Halo, ${user.username}!</h3>
        <p>Terima kasih telah mendaftar. Silakan klik tombol/tautan di bawah ini untuk memverifikasi akun dan mengaktifkan API Key Anda:</p>
        <a href="${verifyUrl}" style="padding:10px 15px; background:#4F46E5; color:#fff; text-decoration:none; border-radius:5px; display:inline-block;">Verifikasi Email</a>
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

    const baseUrl = getBaseUrl(req);
    const resetUrl = `${baseUrl}/api/auth/reset-password/${rawResetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset Password - REST API Bot WhatsApp',
      html: `
        <h3>Permintaan Reset Password</h3>
        <p>Gunakan tautan berikut untuk mengatur ulang password Anda (berlaku 30 menit):</p>
        <p><a href="${resetUrl}" style="padding:10px 15px; background:#4F46E5; color:#fff; text-decoration:none; border-radius:5px; display:inline-block;">Reset Password</a></p>
        <p>Atau salin URL ini: ${resetUrl}</p>
        <p>Jika Anda tidak merasa meminta reset password, abaikan email ini.</p>
      `
    });

    res.json({ status: true, message: 'Tautan reset password telah dikirim ke email Anda' });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal mengirim email reset password', error: error.message });
  }
});

// 5A. HALAMAN FORM SAAT LINK RESET PASSWORD DIKLIK DARI EMAIL (GET)
router.get('/reset-password/:token', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password</title>
      <style>
        body { background: #0b0f19; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .box { background: #111827; padding: 24px; border-radius: 12px; border: 1px solid #1e293b; width: 100%; max-width: 360px; }
        input { width: 100%; padding: 10px; margin: 12px 0; border-radius: 8px; border: 1px solid #334155; background: #0b0f19; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="box">
        <h3>Buat Password Baru</h3>
        <input type="password" id="newPass" placeholder="Minimal 6 karakter" required />
        <button onclick="submitNewPass()">Simpan Password</button>
        <p id="msg" style="font-size: 13px; margin-top: 12px;"></p>
      </div>
      <script>
        async function submitNewPass() {
          const newPassword = document.getElementById('newPass').value;
          const res = await fetch(window.location.pathname, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword })
          });
          const data = await res.json();
          const msg = document.getElementById('msg');
          msg.style.color = data.status ? '#34d399' : '#f87171';
          msg.textContent = data.message;
          if (data.status) setTimeout(() => window.location.href = '/', 1500);
        }
      </script>
    </body>
    </html>
  `);
});

// 5B. PROSES SIMPAN PASSWORD BARU (POST)
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
