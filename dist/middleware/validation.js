"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateQuery = exports.validateParams = exports.validateRequest = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            logger_1.default.warn('Validation error', {
                error: error.details[0].message,
                path: req.path,
                method: req.method
            });
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                details: error.details[0].message
            });
        }
        next();
    };
};
exports.validateRequest = validateRequest;
const validateParams = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.params);
        if (error) {
            logger_1.default.warn('Parameter validation error', {
                error: error.details[0].message,
                path: req.path
            });
            return res.status(400).json({
                success: false,
                message: 'Invalid parameters',
                details: error.details[0].message
            });
        }
        next();
    };
};
exports.validateParams = validateParams;
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.query);
        if (error) {
            logger_1.default.warn('Query validation error', {
                error: error.details[0].message,
                path: req.path
            });
            return res.status(400).json({
                success: false,
                message: 'Invalid query parameters',
                details: error.details[0].message
            });
        }
        next();
    };
};
exports.validateQuery = validateQuery;
