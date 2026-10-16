const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username wajib diisi'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 25
  },
  email: {
    type: String,
    required: [true, 'Email wajib diisi'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password wajib diisi'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'premium', 'vip', 'owner'],
    default: 'user'
  },
  profile: {
    fullName: { type: String, default: '' },
    bio: { type: String, default: 'Pengguna REST API Bot WhatsApp' },
    avatar: { type: String, default: 'https://i.ibb.co/4pDNDk1/avatar.png' },
    whatsapp: { type: String, default: '' },
    themePreference: { type: String, enum: ['light', 'dark'], default: 'dark' }
  },
  apiKey: {
    type: String,
    unique: true,
    index: true
  },
  limit: {
    used: { type: Number, default: 0 },
    max: { type: Number, default: () => parseInt(process.env.LIMIT_USER) || 50 },
    lastResetDate: { type: String, default: () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) }
  },
  planExpiredAt: {
    type: Date,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, { timestamps: true });

// Hash password & generate default API key sebelum simpan
userSchema.pre('save', async function (next) {
  if (!this.apiKey) {
    this.apiKey = 'key_' + crypto.randomBytes(12).toString('hex');
  }
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method verifikasi password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method sinkronisasi masa aktif 30 hari & reset limit harian
userSchema.methods.syncPlanAndLimit = async function () {
  let isModified = false;
  const now = new Date();
  const todayWIB = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // Format YYYY-MM-DD

  // 1. Cek kedaluwarsa plan (untuk premium dan vip)
  if ((this.role === 'premium' || this.role === 'vip') && this.planExpiredAt && now > this.planExpiredAt) {
    this.role = 'user';
    this.planExpiredAt = null;
    this.limit.max = parseInt(process.env.LIMIT_USER) || 50;
    isModified = true;
  }

  // 2. Cek pergantian hari untuk reset limit harian
  if (this.limit.lastResetDate !== todayWIB) {
    this.limit.used = 0;
    this.limit.lastResetDate = todayWIB;

    if (this.role === 'user') {
      this.limit.max = parseInt(process.env.LIMIT_USER) || 50;
    } else if (this.role === 'premium') {
      this.limit.max = parseInt(process.env.LIMIT_PREMIUM) || 1000;
    }
    isModified = true;
  }

  if (isModified) {
    await this.save({ validateBeforeSave: false });
  }
};

module.exports = mongoose.model('User', userSchema);
