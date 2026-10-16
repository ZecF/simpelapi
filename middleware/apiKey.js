const User = require('../models/User');

exports.verifyApiKey = async (req, res, next) => {
  const apiKey = req.query.apikey || req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      status: false,
      message: 'Masukkan parameter ?apikey=APIKEY_ANDA atau header x-api-key'
    });
  }

  try {
    const user = await User.findOne({ apiKey });

    if (!user) {
      return res.status(403).json({
        status: false,
        message: 'API Key tidak valid atau tidak terdaftar'
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        status: false,
        message: 'Akun belum diverifikasi. Silakan cek email Anda terlebih dahulu.'
      });
    }

    // Sinkronisasi masa aktif plan 30 hari & reset harian
    await user.syncPlanAndLimit();

    const isUnlimited = user.role === 'vip' || user.role === 'owner';

    if (!isUnlimited) {
      if (user.limit.used >= user.limit.max) {
        return res.status(429).json({
          status: false,
          message: `Limit harian Anda telah habis (${user.limit.used}/${user.limit.max}). Hubungi owner (@${process.env.OWNER_USERNAME}) untuk upgrade ke Premium atau VIP.`
        });
      }

      // Tambah penggunaan limit
      user.limit.used += 1;
      await user.save({ validateBeforeSave: false });
    }

    req.apiUser = user;
    next();
  } catch (error) {
    return res.status(500).json({ status: false, message: 'Terjadi kesalahan saat memvalidasi API Key', error: error.message });
  }
};
