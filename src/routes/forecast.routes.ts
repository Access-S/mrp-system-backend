import express from 'express';
import { 
  getAllForecasts,
  getForecastByProductCode,
  getForecastByMonth,
  updateForecast,
  getForecastSummary,
  searchForecasts,
  importForecastData,
  deleteAllForecasts
} from '../controllers/forecast.controller';

const router = express.Router();

// GET /api/forecasts - Get all forecasts
router.get('/', getAllForecasts);

// GET /api/forecasts/summary - Get forecast summary
router.get('/summary', getForecastSummary);

// GET /api/forecasts/search - Search forecasts
router.get('/search', searchForecasts);

// POST /api/forecasts/import - Import forecast data
router.post('/import', importForecastData);

// GET /api/forecasts/month/:month - Get forecasts by month
router.get('/month/:month', getForecastByMonth);

// GET /api/forecasts/:productCode - Get forecast by product code
router.get('/:productCode', getForecastByProductCode);

// PUT /api/forecasts/:productCode - Update forecast
router.put('/:productCode', updateForecast);

router.delete('/', deleteAllForecasts);

export default router;