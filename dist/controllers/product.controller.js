"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBomForProduct = exports.getAllProducts = void 0;
const supabase_1 = require("../config/supabase");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
const getAllProducts = async (req, res) => {
    try {
        logger_1.default.info('Fetching all products');
        const { data, error } = await supabase_1.supabase
            .from('products')
            .select('*')
            .order('product_code', { ascending: true });
        if (error) {
            logger_1.default.error('Supabase error fetching products', { error });
            throw (0, errorHandler_1.createError)('Failed to fetch products from database', 500);
        }
        logger_1.default.info(`Successfully fetched ${data?.length || 0} products`);
        res.status(200).json({
            success: true,
            data,
            count: data?.length || 0
        });
    }
    catch (error) {
        logger_1.default.error('Error in getAllProducts', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to fetch products"
        });
    }
};
exports.getAllProducts = getAllProducts;
const getBomForProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        logger_1.default.info('Fetching BOM for product', { productId });
        const { data, error } = await supabase_1.supabase
            .from('bom_components')
            .select('*')
            .eq('product_id', productId);
        if (error) {
            logger_1.default.error('Supabase error fetching BOM', { error, productId });
            throw (0, errorHandler_1.createError)('Failed to fetch BOM components from database', 500);
        }
        logger_1.default.info(`Successfully fetched ${data?.length || 0} BOM components for product ${productId}`);
        res.status(200).json({
            success: true,
            data,
            count: data?.length || 0,
            productId
        });
    }
    catch (error) {
        logger_1.default.error('Error in getBomForProduct', { error: error.message, productId: req.params.productId });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to fetch BOM components"
        });
    }
};
exports.getBomForProduct = getBomForProduct;
