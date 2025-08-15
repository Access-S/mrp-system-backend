"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSohSummary = exports.deleteAllSoh = exports.importSohData = exports.analyzeExcelHeaders = exports.getAllSoh = void 0;
const supabase_1 = require("../config/supabase");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
const XLSX = __importStar(require("xlsx"));
// BLOCK 2: Get All SOH Records Controller
const getAllSoh = async (req, res) => {
    try {
        logger_1.default.info('Fetching all SOH records');
        const { data, error } = await supabase_1.supabase
            .from('soh')
            .select('*')
            .order('product_id', { ascending: true });
        if (error) {
            logger_1.default.error('Supabase error fetching SOH', { error });
            throw (0, errorHandler_1.createError)('Failed to fetch SOH records from database', 500);
        }
        logger_1.default.info(`Successfully fetched ${data?.length || 0} SOH records`);
        res.status(200).json({
            success: true,
            data,
            count: data?.length || 0
        });
    }
    catch (error) {
        logger_1.default.error('Error in getAllSoh', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to fetch SOH records"
        });
    }
};
exports.getAllSoh = getAllSoh;
// BLOCK 3: Analyze Excel Headers Controller
const analyzeExcelHeaders = async (req, res) => {
    try {
        if (!req.file) {
            throw (0, errorHandler_1.createError)('No file uploaded', 400);
        }
        logger_1.default.info('Analyzing Excel file headers', { filename: req.file.originalname });
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Get the range and extract headers from first row
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const headers = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
                headers.push(String(cell.v).trim());
            }
        }
        // Get sample data from first few rows
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            range: 0,
            defval: null
        });
        const sampleData = jsonData.slice(1, 6); // Get first 5 data rows
        logger_1.default.info(`Excel analysis complete: ${headers.length} headers found`);
        res.status(200).json({
            success: true,
            data: {
                headers,
                sampleData,
                totalRows: jsonData.length - 1, // Exclude header row
                filename: req.file.originalname
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error analyzing Excel headers', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to analyze Excel file'
        });
    }
};
exports.analyzeExcelHeaders = analyzeExcelHeaders;
// BLOCK 4: Import SOH Data Controller (Simplified)
const importSohData = async (req, res) => {
    try {
        const { selectedColumns, replaceExisting = false } = req.body;
        if (!req.file) {
            throw (0, errorHandler_1.createError)('No file uploaded', 400);
        }
        if (!selectedColumns || !Array.isArray(selectedColumns) || selectedColumns.length === 0) {
            throw (0, errorHandler_1.createError)('No columns selected for import', 400);
        }
        logger_1.default.info('Starting SOH import', {
            filename: req.file.originalname,
            selectedColumns,
            replaceExisting
        });
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null
        });
        if (jsonData.length < 2) {
            throw (0, errorHandler_1.createError)('Excel file must contain at least a header row and one data row', 400);
        }
        const headers = jsonData[0];
        const dataRows = jsonData.slice(1);
        logger_1.default.info('Excel data parsed', {
            totalHeaders: headers.length,
            totalDataRows: dataRows.length,
            excelHeaders: headers
        });
        // Map selected columns to their indices
        const columnMapping = {};
        selectedColumns.forEach((colName) => {
            const index = headers.findIndex(h => h === colName);
            if (index !== -1) {
                columnMapping[colName] = index;
            }
        });
        logger_1.default.info('Column mapping created', { columnMapping });
        // Clean column names for database (remove spaces, special chars)
        const cleanColumnNames = {};
        selectedColumns.forEach((colName) => {
            cleanColumnNames[colName] = colName
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
        });
        logger_1.default.info('Clean column names generated', { cleanColumnNames });
        // Predefined columns that should exist
        const predefinedColumns = [
            'product_id', 'description', 'stock_on_hand',
            'default_uom', 'locations', 'ean', 'weight_kg', 'volume_m3'
        ];
        // Check if all selected columns are supported
        const unsupportedColumns = Object.values(cleanColumnNames).filter(cleanCol => !predefinedColumns.includes(cleanCol));
        if (unsupportedColumns.length > 0) {
            logger_1.default.warn('Unsupported columns detected', { unsupportedColumns });
            throw (0, errorHandler_1.createError)(`Unsupported columns: ${unsupportedColumns.join(', ')}. Supported columns are: ${predefinedColumns.join(', ')}`, 400);
        }
        logger_1.default.info('All columns are supported', {
            selectedColumns: Object.values(cleanColumnNames),
            supportedColumns: predefinedColumns
        });
        // Clear existing data if replace mode
        if (replaceExisting) {
            const { error: deleteError } = await supabase_1.supabase
                .from('soh')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
            if (deleteError) {
                logger_1.default.warn('Could not clear existing data', { error: deleteError });
            }
            else {
                logger_1.default.info('Existing data cleared successfully');
            }
        }
        // Import data
        const batchId = crypto.randomUUID();
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        logger_1.default.info('Starting data insertion', { batchId, totalRows: dataRows.length });
        // Process in batches
        const batchSize = 100;
        for (let i = 0; i < dataRows.length; i += batchSize) {
            const batch = dataRows.slice(i, i + batchSize);
            const insertData = [];
            batch.forEach((row, index) => {
                try {
                    const record = {
                        import_batch_id: batchId,
                        import_source: req.file.originalname
                    };
                    // Map selected columns to clean column names
                    selectedColumns.forEach((originalCol) => {
                        const cleanCol = cleanColumnNames[originalCol];
                        const colIndex = columnMapping[originalCol];
                        let value = row[colIndex]; // <-- Fix: cast row to any[]
                        // Handle empty/null values
                        if (value === null || value === undefined || value === '') {
                            // Set default values based on column type
                            if (cleanCol.includes('stock') || cleanCol.includes('weight') || cleanCol.includes('volume')) {
                                value = 0;
                            }
                            else {
                                value = null;
                            }
                        }
                        // Convert to appropriate type
                        if (cleanCol.includes('stock') || cleanCol.includes('weight') || cleanCol.includes('volume')) {
                            value = value === null ? 0 : Number(value) || 0;
                        }
                        else {
                            value = value === null ? null : String(value);
                        }
                        // Special handling for product_id
                        if (cleanCol === 'product_id' || originalCol.toLowerCase().includes('product')) {
                            record.product_id = String(value || '');
                        }
                        record[cleanCol] = value;
                    });
                    insertData.push(record);
                    // Log first record of first batch for debugging
                    if (i === 0 && index === 0) {
                        logger_1.default.info('Sample record', {
                            sampleRecord: record,
                            recordKeys: Object.keys(record)
                        });
                    }
                }
                catch (error) {
                    errorCount++;
                    errors.push(`Row ${i + index + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
            // Insert batch
            if (insertData.length > 0) {
                logger_1.default.info(`Inserting batch ${Math.floor(i / batchSize) + 1}`, {
                    batchSize: insertData.length,
                    startRow: i + 2
                });
                const { error: insertError } = await supabase_1.supabase
                    .from('soh')
                    .insert(insertData);
                if (insertError) {
                    logger_1.default.error('Batch insert error', {
                        error: insertError,
                        batchStart: i,
                        batchNumber: Math.floor(i / batchSize) + 1
                    });
                    errorCount += insertData.length;
                    errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
                }
                else {
                    successCount += insertData.length;
                    logger_1.default.info(`Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
                }
            }
        }
        logger_1.default.info(`SOH import completed`, {
            successCount,
            errorCount,
            batchId,
            filename: req.file.originalname
        });
        res.status(200).json({
            success: true,
            data: {
                successCount,
                errorCount,
                totalRows: dataRows.length,
                batchId,
                errors: errors.slice(0, 10),
                columnsImported: Object.keys(cleanColumnNames)
            },
            message: `Import completed: ${successCount} records imported, ${errorCount} errors. Imported columns: ${Object.keys(cleanColumnNames).join(', ')}`
        });
    }
    catch (error) {
        logger_1.default.error('Error in importSohData', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to import SOH data'
        });
    }
};
exports.importSohData = importSohData;
// BLOCK 5: Delete All SOH Data Controller
const deleteAllSoh = async (req, res) => {
    try {
        logger_1.default.info('Deleting all SOH data');
        const { error } = await supabase_1.supabase
            .from('soh')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
        if (error) {
            logger_1.default.error('Error deleting SOH data', { error });
            throw (0, errorHandler_1.createError)('Failed to delete SOH data', 500);
        }
        logger_1.default.info('All SOH data deleted successfully');
        res.status(200).json({
            success: true,
            message: 'All SOH data deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error in deleteAllSoh', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to delete SOH data'
        });
    }
};
exports.deleteAllSoh = deleteAllSoh;
const getSohSummary = async (req, res) => {
    try {
        logger_1.default.info('Fetching SOH summary');
        const { count, error } = await supabase_1.supabase
            .from('soh')
            .select('*', { count: 'exact', head: true });
        if (error) {
            throw (0, errorHandler_1.createError)('Failed to get SOH count', 500);
        }
        // Get latest import info
        const { data: latestImport, error: importError } = await supabase_1.supabase
            .from('soh')
            .select('import_batch_id, import_source, created_at')
            .order('created_at', { ascending: false })
            .limit(1);
        res.status(200).json({
            success: true,
            data: {
                totalRecords: count || 0,
                latestImport: latestImport?.[0] || null
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error in getSohSummary', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to get SOH summary'
        });
    }
};
exports.getSohSummary = getSohSummary;
