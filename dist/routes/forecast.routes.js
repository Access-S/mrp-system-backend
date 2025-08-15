"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const forecast_controller_1 = require("../controllers/forecast.controller");
const router = express_1.default.Router();
// GET /api/forecasts - Get all forecasts
router.get('/', forecast_controller_1.getAllForecasts);
// GET /api/forecasts/summary - Get forecast summary
router.get('/summary', forecast_controller_1.getForecastSummary);
// GET /api/forecasts/search - Search forecasts
router.get('/search', forecast_controller_1.searchForecasts);
// POST /api/forecasts/import - Import forecast data
router.post('/import', forecast_controller_1.importForecastData);
// GET /api/forecasts/month/:month - Get forecasts by month
router.get('/month/:month', forecast_controller_1.getForecastByMonth);
// GET /api/forecasts/:productCode - Get forecast by product code
router.get('/:productCode', forecast_controller_1.getForecastByProductCode);
// PUT /api/forecasts/:productCode - Update forecast
router.put('/:productCode', forecast_controller_1.updateForecast);
exports.default = router;
