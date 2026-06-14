const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Farmer = require('../models/Farmer');

// Signup
router.post('/signup', async (req, res) => {
  const { name, email, password, district } = req.body;
  try {
    let farmer = await Farmer.findOne({ email });
    if (farmer) {
      return res.status(400).json({ message: 'Farmer already exists' });
    }

    farmer = new Farmer({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      district,
    });

    await farmer.save();

    const token = jwt.sign({ id: farmer._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token, farmer: { id: farmer._id, name, email, district } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const farmer = await Farmer.findOne({ email });
    if (!farmer) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, farmer.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: farmer._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token, farmer: { id: farmer._id, name: farmer.name, email, district: farmer.district } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;