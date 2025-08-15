"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = __importDefault(require("../utils/logger"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
    const error = 'Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file';
    logger_1.default.error(error);
    throw new Error(error);
}
// Validate URL format
try {
    new URL(supabaseUrl);
}
catch {
    throw new Error('Invalid SUPABASE_URL format');
}
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
logger_1.default.info('✅ Supabase client initialized successfully');
