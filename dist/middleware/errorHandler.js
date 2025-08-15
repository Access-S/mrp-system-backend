"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = exports.createError = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const createError = (message, statusCode = 500) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
};
exports.createError = createError;
const errorHandler = (err, req, res, next) => {
    const { statusCode = 500, message, stack } = err;
    logger_1.default.error('Request error', {
        message,
        statusCode,
        stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
    });
    const response = {
        success: false,
        message: statusCode === 500 ? 'Internal Server Error' : message,
        ...(process.env.NODE_ENV === 'development' && { stack }),
    };
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
const notFoundHandler = (req, res) => {
    logger_1.default.warn('Route not found', {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
    });
};
exports.notFoundHandler = notFoundHandler;
