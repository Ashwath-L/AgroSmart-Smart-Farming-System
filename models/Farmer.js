const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  district: { type: String, required: true },
});

module.exports = mongoose.model('Farmer', farmerSchema);