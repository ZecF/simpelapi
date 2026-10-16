require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Koneksi ke MongoDB
connectDB();

// Middleware Global
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyajikan file statis frontend (Dark/Light Mode)
app.use(express.static(path.join(__dirname, 'public')));

// Registrasi Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', apiRoutes);

// Global 404 Handler
app.use((req, res) => {
  res.status(404).json({ status: false, message: 'Endpoint tidak ditemukan' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Berjalan di http://localhost:${PORT}`);
});
