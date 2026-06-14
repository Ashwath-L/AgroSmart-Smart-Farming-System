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

// Crop data with yield (kg/acre) and market price (INR/kg)
const cropData = {
  Wheat: { yieldPerAcre: 1200, marketPrice: 25 },
  Barley: { yieldPerAcre: 1000, marketPrice: 20 },
  Rice: { yieldPerAcre: 1500, marketPrice: 30 },
  Maize: { yieldPerAcre: 1300, marketPrice: 22 },
  Corn: { yieldPerAcre: 1400, marketPrice: 25 },
  Soybean: { yieldPerAcre: 900, marketPrice: 40 },
  Potato: { yieldPerAcre: 8000, marketPrice: 15 },
  Carrot: { yieldPerAcre: 6000, marketPrice: 20 },
  Cabbage: { yieldPerAcre: 10000, marketPrice: 12 },
  Lettuce: { yieldPerAcre: 8000, marketPrice: 18 },
  Sorghum: { yieldPerAcre: 1100, marketPrice: 22 },
  Millet: { yieldPerAcre: 900, marketPrice: 25 },
};

// Decision table for crop and fertilizer recommendations
const cropRules = {
  Sandy: {
    crops: ['Wheat', 'Barley'],
    fertilizers: {
      Wheat: ['Urea', 'Potassium Sulfate'],
      Barley: ['Ammonium Nitrate', 'Potassium Sulfate'],
    },
    reason: 'Sandy soil has good drainage but low nutrient retention, suitable for drought-resistant crops like Wheat and Barley.',
  },
  Clay: {
    crops: ['Rice', 'Maize'],
    fertilizers: {
      Rice: ['Superphosphate', 'Compost'],
      Maize: ['DAP (Diammonium Phosphate)', 'Compost'],
    },
    reason: 'Clay soil retains water and nutrients, ideal for water-loving crops like Rice and Maize.',
  },
  Loamy: {
    crops: ['Corn', 'Soybean'],
    fertilizers: {
      Corn: ['NPK 10-10-10', 'Urea'],
      Soybean: ['NPK 10-10-10', 'Rhizobium Inoculant'],
    },
    reason: 'Loamy soil is fertile and well-balanced, supporting a wide range of crops like Corn and Soybean.',
  },
  Silty: {
    crops: ['Potato', 'Carrot'],
    fertilizers: {
      Potato: ['Potassium Chloride', 'Gypsum'],
      Carrot: ['Bone Meal', 'Gypsum'],
    },
    reason: 'Silty soil is fertile but needs better drainage, suitable for root crops like Potato and Carrot.',
  },
  Peaty: {
    crops: ['Cabbage', 'Lettuce'],
    fertilizers: {
      Cabbage: ['Lime', 'Bone Meal'],
      Lettuce: ['Lime', 'Superphosphate'],
    },
    reason: 'Peaty soil is acidic and organic-rich, good for leafy vegetables like Cabbage and Lettuce with pH adjustment.',
  },
};

// Default fallback
const defaultRecommendation = {
  crops: ['Sorghum', 'Millet'],
  fertilizers: {
    Sorghum: ['NPK 15-15-15', 'Urea'],
    Millet: ['NPK 15-15-15', 'Compost'],
  },
  reason: 'Default recommendation for unknown or unsupported soil types, focusing on hardy crops like Sorghum and Millet.',
  profit: 0, // Default profit if calculation fails
};

// Determine season based on month
const getSeason = () => {
  const month = new Date().getMonth(); // 0-11 (Jan-Dec)
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Fall';
  return 'Winter';
};

// POST /api/recommendation - Get crop and fertilizer recommendations with profit estimation
router.post('/', auth, async (req, res) => {
  try {
    const { soilType, acres } = req.body;
    console.log('Received soilType:', soilType, 'and acres:', acres);
    if (!soilType) {
      console.log('Soil type missing in request');
      return res.status(400).json({ message: 'Soil type is required' });
    }
    if (!acres || acres <= 0) {
      console.log('Invalid or missing acres in request');
      return res.status(400).json({ message: 'Land area (acres) must be a positive number' });
    }

    // Fetch farmer's district
    const farmer = await Farmer.findById(req.user.id);
    if (!farmer) {
      console.log('Farmer not found for user ID:', req.user.id);
      return res.status(404).json({ message: 'Farmer not found' });
    }
    console.log('Farmer district:', farmer.district);

    // Validate OpenWeatherMap API key
    if (!process.env.OPENWEATHER_API_KEY) {
      console.error('OPENWEATHER_API_KEY is not set in environment variables');
      return res.status(500).json({
        message: 'Server configuration error: Weather API key missing',
        recommendations: defaultRecommendation,
      });
    }

    // Fetch weather data for the farmer's district with retry
    let weatherResponse;
    let retries = 3;
    while (retries > 0) {
      try {
        weatherResponse = await axios.get(
          `http://api.openweathermap.org/data/2.5/weather?q=${farmer.district}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );
        break; // Exit loop on success
      } catch (err) {
        retries--;
        console.error(`Weather API attempt ${4 - retries} failed:`, err.message);
        if (retries === 0) {
          console.error('All retries failed for weather API');
          return res.status(500).json({
            message: 'Failed to fetch weather data after retries',
            error: err.message,
            recommendations: defaultRecommendation,
          });
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
      }
    }
    console.log('OpenWeatherMap API Response:', weatherResponse.data);

    const climateData = {
      temperature: weatherResponse.data.main.temp,
      humidity: weatherResponse.data.main.humidity,
    };

    // Get season
    const season = getSeason();
    console.log('Determined season:', season);

    // Get recommendation based on soil type
    const normalizedSoilType = soilType.charAt(0).toUpperCase() + soilType.slice(1).toLowerCase();
    console.log('Normalized soil type:', normalizedSoilType);
    const recommendation = cropRules[normalizedSoilType] || defaultRecommendation;
    console.log('Selected recommendation:', recommendation);

    // Combine fertilizers for all recommended crops
    const fertilizers = [];
    recommendation.crops.forEach(crop => {
      if (recommendation.fertilizers[crop]) {
        fertilizers.push(...recommendation.fertilizers[crop]);
      }
    });
    const uniqueFertilizers = [...new Set(fertilizers)]; // Remove duplicates
    console.log('Recommended fertilizers:', uniqueFertilizers);

    // Calculate profit
    let totalProfit = 0;
    const costPercentage = 0.4; // Assume 40% of revenue goes to costs (fertilizers, labor, etc.)
    console.log('Crops for profit calculation:', recommendation.crops);
    recommendation.crops.forEach(crop => {
      // Normalize crop name to match cropData keys
      const normalizedCrop = crop.charAt(0).toUpperCase() + crop.slice(1).toLowerCase();
      const cropInfo = cropData[normalizedCrop];
      if (cropInfo) {
        const yieldTotal = cropInfo.yieldPerAcre * acres; // Total yield in kg
        const revenue = yieldTotal * cropInfo.marketPrice; // Revenue in INR
        const costs = revenue * costPercentage; // Estimated costs
        const profit = revenue - costs; // Profit for this crop
        totalProfit += profit;
        console.log(`Profit for ${normalizedCrop}: ₹${Math.round(profit)} (Yield: ${yieldTotal} kg, Revenue: ₹${revenue}, Costs: ₹${costs})`);
      } else {
        console.warn(`No crop data found for ${normalizedCrop}, skipping profit calculation for this crop`);
      }
    });
    totalProfit = Math.round(totalProfit || 0); // Default to 0 if no profit calculated
    console.log('Calculated total profit:', totalProfit);

    const responseData = {
      soilType: normalizedSoilType,
      climateData,
      season,
      recommendations: {
        crops: recommendation.crops,
        fertilizers: uniqueFertilizers,
        profit: totalProfit, // Ensure profit is always defined
        reason: recommendation.reason,
      },
    };
    console.log('Sending response:', responseData);

    res.json(responseData);
  } catch (err) {
    console.error('Error in recommendation route:', err.message, err);
    res.status(500).json({
      message: 'Error fetching recommendation',
      error: err.message,
      recommendations: { ...defaultRecommendation, profit: 0 }, // Ensure profit in fallback
    });
  }
});

module.exports = router;