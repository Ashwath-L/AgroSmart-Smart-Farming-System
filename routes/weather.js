const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Farmer = require('../models/Farmer');
const axios = require('axios');
require('dotenv').config();

// Middleware to authenticate JWT
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /api/weather - Fetch weather data for the farmer's district
router.get('/', auth, async (req, res) => {
  try {
    // Fetch farmer's district
    const farmer = await Farmer.findById(req.user.id);
    if (!farmer) {
      return res.status(404).json({ message: 'Farmer not found' });
    }

    // Fetch weather data from OpenWeatherMap API
    const response = await axios.get(
      `http://api.openweathermap.org/data/2.5/weather?q=${farmer.district}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );

    // Log the full response for debugging
    console.log('OpenWeatherMap API Response:', response.data);

    // Extract relevant weather data with validation
    const weatherData = {
      location: farmer.district,
      temperature: response.data.main.temp ?? 'N/A',
      humidity: response.data.main.humidity ?? 'N/A',
      description: response.data.weather[0]?.description ?? 'N/A',
      icon: response.data.weather[0]?.icon ?? '01d', // Default icon if missing
      windSpeed: response.data.wind?.speed ?? 'N/A',
      pressure: response.data.main?.pressure ?? 'N/A',
      sunrise: response.data.sys?.sunrise ?? 0, // Default to 0 if missing
      sunset: response.data.sys?.sunset ?? 0, // Default to 0 if missing
    };

    res.json(weatherData);
  } catch (err) {
    console.error('Error fetching weather data:', err.message);
    res.status(500).json({ message: 'Error fetching weather data', error: err.message });
  }
});

module.exports = router;