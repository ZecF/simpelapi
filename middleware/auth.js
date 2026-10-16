const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifikasi Token JWT
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ status: false, message: 'Akses ditolak, token tidak ditemukan' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ status: false, message: 'User tidak ditemukan' });
    }

    await user.syncPlanAndLimit();
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ status: false, message: 'Token tidak valid atau sudah kedaluwarsa' });
  }
};

// Pembatasan akses berdasarkan Role
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: false,
        message: `Role '${req.user.role}' tidak memiliki izin untuk mengakses fitur ini`
      });
    }
    next();
  };
};
