"use strict";
// src/controllers/forecast.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getForecasts = exports.uploadForecasts = void 0;
const supabase_1 = require("../config/supabase");
const asyncHandler_1 = require("../utils/asyncHandler");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
// BLOCK 2: Helper Function
async function processJsonForecastData(jsonData) {
    logger_1.default.info('Processing JSON forecast data:', { recordCount: jsonData.length });
    if (!jsonData || jsonData.length === 0) {
        throw (0, errorHandler_1.createError)('No data found in JSON.', 400);
    }
    const firstRow = jsonData[0];
    const headers = Object.keys(firstRow);
    logger_1.default.info('JSON headers:', headers);
    const productCodeHeader = headers.find(h => h.toLowerCase().trim() === 'product');
    const descriptionHeader = headers.find(h => h.toLowerCase().trim() === 'description');
    if (!productCodeHeader) {
        throw (0, errorHandler_1.createError)("Could not find a 'Product' column in the data.", 400);
    }
    // Clear existing data — SAFE DELETE UNDER RLS
    logger_1.default.info('Deleting existing forecast records...');
    const { error: deleteError } = await supabase_1.supabase
        .from('forecasts')
        .delete()
        .not('id', 'is', null); // ← Always use this under RLS
    if (deleteError) {
        logger_1.default.error('Supabase error deleting old forecasts', { error: deleteError });
        throw (0, errorHandler_1.createError)('Failed to clear old forecast data.', 500);
    }
    const forecastsToInsert = [];
    // Process each JSON row
    for (const row of jsonData) {
        const productCode = row[productCodeHeader]?.toString().trim();
        const description = descriptionHeader ? (row[descriptionHeader]?.toString().trim() || '') : '';
        if (!productCode || productCode === '')
            continue;
        // Process each header that looks like a date
        headers.forEach(header => {
            if (header !== productCodeHeader && header !== descriptionHeader) {
                const headerStr = header.trim();
                const dateMatch = headerStr.match(/^([a-z]{3})[a-z]*\s*[-\s/]\s*(\d{2,4})$/i);
                if (dateMatch) {
                    const monthStr = dateMatch[1].toLowerCase();
                    const yearStr = dateMatch[2];
                    const monthMap = {
                        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                    };
                    const month = monthMap[monthStr];
                    if (month === undefined)
                        return;
                    let year = parseInt(yearStr);
                    if (yearStr.length === 2) {
                        year = 2000 + year;
                    }
                    const quantity = parseInt(row[header], 10);
                    if (!isNaN(quantity)) {
                        const forecastDate = new Date(year, month, 1).toISOString().split('T')[0];
                        forecastsToInsert.push({
                            product_code: productCode,
                            description: description,
                            forecast_date: forecastDate,
                            quantity: quantity
                        });
                    }
                }
            }
        });
    }
    // Insert data
    logger_1.default.info(`Inserting ${forecastsToInsert.length} new forecast records from JSON...`);
    if (forecastsToInsert.length > 0) {
        const { error: forecastError } = await supabase_1.supabase.from('forecasts').insert(forecastsToInsert);
        if (forecastError) {
            logger_1.default.error('Supabase error inserting new forecasts', { error: forecastError });
            throw (0, errorHandler_1.createError)('Failed to insert new forecast data.', 500);
        }
    }
    return {
        success: true,
        message: `Forecast data imported successfully. ${forecastsToInsert.length} forecast entries created.`,
        debug: {
            source: 'json-data',
            productColumn: productCodeHeader,
            descriptionColumn: descriptionHeader || 'Not found'
        }
    };
}
// BLOCK 3: uploadForecasts Controller
exports.uploadForecasts = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    // DEBUG LOGGING
    console.log('=== UPLOAD FORECAST DEBUG START ===');
    console.log('Body keys:', Object.keys(req.body));
    console.log('Body data exists:', !!req.body.data);
    if (req.body.data) {
        console.log('Body data type:', typeof req.body.data);
        console.log('Body data first 100 chars:', req.body.data.substring(0, 100));
    }
    console.log('=== UPLOAD FORECAST DEBUG END ===');
    logger_1.default.info('Upload request received:', {
        bodyKeys: Object.keys(req.body),
        contentType: req.headers['content-type']
    });
    // ONLY accept JSON from frontend (no Excel fallback)
    if (!req.body.data) {
        throw (0, errorHandler_1.createError)('No forecast data provided.', 400);
    }
    try {
        const jsonData = JSON.parse(req.body.data);
        if (!Array.isArray(jsonData) || jsonData.length === 0) {
            throw (0, errorHandler_1.createError)('Invalid or empty forecast data.', 400);
        }
        const result = await processJsonForecastData(jsonData);
        return res.status(201).json(result);
    }
    catch (error) {
        logger_1.default.error('Forecast upload failed:', error);
        throw (0, errorHandler_1.createError)(`Invalid forecast data: ${error.message}`, 400);
    }
});
// BLOCK 4: getForecasts Controller
const getForecasts = async (req, res) => {
    try {
        const { months, search } = req.query;
        logger_1.default.info(`Fetching forecasts with filters: months=${months}, search=${search}`);
        let query = supabase_1.supabase
            .from('forecasts')
            .select('product_code, description, quantity, forecast_date')
            .order('forecast_date', { ascending: true });
        if (months && months !== 'all') {
            const numMonths = parseInt(months, 10);
            const today = new Date();
            const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
            const endDate = new Date(today.getFullYear(), today.getMonth() + numMonths, 0).toISOString().split('T')[0];
            query = query.gte('forecast_date', startDate).lte('forecast_date', endDate);
        }
        if (search) {
            query = query.ilike('description', `%${search}%`);
        }
        const { data, error } = await query;
        if (error) {
            logger_1.default.error('Supabase error fetching forecasts', { error });
            throw (0, errorHandler_1.createError)('Failed to fetch forecast records from database', 500);
        }
        const productData = {};
        data.forEach((item) => {
            const { product_code, description } = item;
            const dateKey = item.forecast_date.substring(0, 7);
            if (!productData[product_code]) {
                productData[product_code] = { product_code, description };
            }
            productData[product_code][dateKey] = item.quantity;
        });
        const rows = Object.values(productData);
        const dateHeaders = [...new Set(data.map((item) => item.forecast_date.substring(0, 7)))].sort();
        const staticHeaders = [
            { key: 'product_code', label: 'Product Code' },
            { key: 'description', label: 'Description' }
        ];
        const dynamicHeaders = dateHeaders.map(dateKey => {
            const [year, month] = dateKey.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1, 1);
            const label = date.toLocaleString('default', { month: 'short' }) + '-' + year.substring(2);
            return { key: dateKey, label: label };
        });
        const headers = [...staticHeaders, ...dynamicHeaders];
        const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
        const summary = {
            totalProducts: rows.length,
            totalQuantity: totalQuantity,
            dateRange: dateHeaders.length > 0 ? `${dateHeaders[0]} to ${dateHeaders[dateHeaders.length - 1]}` : 'No data'
        };
        logger_1.default.info(`Successfully fetched and processed ${rows.length} forecast products.`);
        res.status(200).json({
            success: true,
            summary,
            tableData: { headers, rows }
        });
    }
    catch (error) {
        logger_1.default.error('Error in getForecasts', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to fetch forecast records"
        });
    }
};
exports.getForecasts = getForecasts;
