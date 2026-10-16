const mongoose = require('mongoose');

const featureRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  featureName: {
    type: String,
    required: [true, 'Nama fitur wajib diisi'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Deskripsi atau contoh URL wajib diisi']
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('FeatureRequest', featureRequestSchema);
