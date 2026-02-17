"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePurchaseOrder = exports.updatePoStatus = exports.updatePurchaseOrder = exports.createPurchaseOrder = exports.getPurchaseOrderById = exports.getPurchaseOrders = void 0;
const supabase_1 = require("../config/supabase");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
const getPurchaseOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 25, 100);
        const searchQuery = req.query.search || '';
        const statusFilter = req.query.status || '';
        const sortDirection = req.query.sort_direction || 'desc';
        const offset = (page - 1) * limit;
        logger_1.default.info('Fetching purchase orders', {
            page,
            limit,
            searchQuery,
            statusFilter,
            sortDirection
        });
        const query = supabase_1.supabase.rpc('search_purchase_orders', {
            search_term: searchQuery,
            status_filter: statusFilter
        }, { count: 'exact' });
        const { data, error, count } = await query
            .order('sequence', { ascending: sortDirection === 'asc' })
            .range(offset, offset + limit - 1);
        if (error) {
            logger_1.default.error('Supabase RPC error', { error, searchQuery, statusFilter });
            throw (0, errorHandler_1.createError)('Failed to fetch purchase orders from database', 500);
        }
        const totalPages = Math.ceil((count || 0) / limit);
        logger_1.default.info(`Successfully fetched ${data?.length || 0} purchase orders`, {
            total: count,
            page,
            totalPages
        });
        res.status(200).json({
            success: true,
            data,
            pagination: {
                total: count,
                page,
                limit,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error in getPurchaseOrders', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch purchase orders'
        });
    }
};
exports.getPurchaseOrders = getPurchaseOrders;
const getPurchaseOrderById = async (req, res) => {
    try {
        const { poId } = req.params;
        logger_1.default.info('Fetching purchase order by ID', { poId });
        const { data, error } = await supabase_1.supabase
            .from('purchase_orders')
            .select(`
        *, 
        product:products (
            *, 
            bom_components(*)
        ), 
        statuses:po_status_history(status)
      `)
            .eq('id', poId)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                logger_1.default.warn('Purchase order not found', { poId });
                throw (0, errorHandler_1.createError)('Purchase order not found', 404);
            }
            logger_1.default.error('Supabase error fetching purchase order', { error, poId });
            throw (0, errorHandler_1.createError)('Failed to fetch purchase order from database', 500);
        }
        logger_1.default.info('Successfully fetched purchase order', { poId });
        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        logger_1.default.error('Error in getPurchaseOrderById', { error: error.message, poId: req.params.poId });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch purchase order'
        });
    }
};
exports.getPurchaseOrderById = getPurchaseOrderById;
const createPurchaseOrder = async (req, res) => {
    try {
        const { poNumber, productCode, customerName, poCreatedDate, poReceivedDate, orderedQtyPieces, customerAmount } = req.body;
        logger_1.default.info('Creating new purchase order', { poNumber, productCode, customerName });
        const { data: rpcData, error: rpcError } = await supabase_1.supabase.rpc('create_new_po', {
            p_po_number: poNumber,
            p_product_code: productCode,
            p_customer_name: customerName,
            p_po_created_date: poCreatedDate,
            p_po_received_date: poReceivedDate,
            p_ordered_qty_pieces: orderedQtyPieces,
            p_customer_amount: customerAmount
        });
        if (rpcError) {
            logger_1.default.error('RPC error creating purchase order', { rpcError, poNumber });
            throw (0, errorHandler_1.createError)(rpcError.message, 400);
        }
        const newPoId = rpcData[0].created_po_id;
        logger_1.default.info('Purchase order created successfully', { newPoId, poNumber });
        const { data: newPo, error: fetchError } = await supabase_1.supabase
            .from('purchase_orders')
            .select(`*, product:products(*), statuses:po_status_history(status)`)
            .eq('id', newPoId)
            .single();
        if (fetchError) {
            logger_1.default.error('Error fetching created purchase order', { fetchError, newPoId });
            throw (0, errorHandler_1.createError)('Purchase order created but failed to fetch details', 500);
        }
        res.status(201).json({
            success: true,
            data: newPo,
            message: 'Purchase order created successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error in createPurchaseOrder', { error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to create purchase order'
        });
    }
};
exports.createPurchaseOrder = createPurchaseOrder;
const updatePurchaseOrder = async (req, res) => {
    try {
        const { poId } = req.params;
        const { poNumber, customerName, poCreatedDate, poReceivedDate, orderedQtyPieces, customerAmount } = req.body;
        logger_1.default.info('Updating purchase order', { poId, poNumber });
        const { data: rpcData, error: rpcError } = await supabase_1.supabase.rpc('update_po_details', {
            p_po_id: poId,
            p_po_number: poNumber,
            p_customer_name: customerName,
            p_po_created_date: poCreatedDate,
            p_po_received_date: poReceivedDate,
            p_ordered_qty_pieces: orderedQtyPieces,
            p_customer_amount: customerAmount
        });
        if (rpcError) {
            logger_1.default.error('RPC error updating purchase order', { rpcError, poId });
            throw (0, errorHandler_1.createError)(rpcError.message, 400);
        }
        const updatedPoId = rpcData[0].updated_po_id;
        logger_1.default.info('Purchase order updated successfully', { updatedPoId });
        const { data: updatedPo, error: fetchError } = await supabase_1.supabase
            .from('purchase_orders')
            .select(`*, product:products(*), statuses:po_status_history(status)`)
            .eq('id', updatedPoId)
            .single();
        if (fetchError) {
            logger_1.default.error('Error fetching updated purchase order', { fetchError, updatedPoId });
            throw (0, errorHandler_1.createError)('Purchase order updated but failed to fetch details', 500);
        }
        res.status(200).json({
            success: true,
            data: updatedPo,
            message: 'Purchase order updated successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error in updatePurchaseOrder', { error: error.message, poId: req.params.poId });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to update purchase order'
        });
    }
};
exports.updatePurchaseOrder = updatePurchaseOrder;
const updatePoStatus = async (req, res) => {
    try {
        const { poId } = req.params;
        const { status } = req.body;
        logger_1.default.info('Updating purchase order status', { poId, status });
        const { data, error } = await supabase_1.supabase.rpc('toggle_po_status', {
            target_po_id: poId,
            status_to_toggle: status
        });
        if (error) {
            logger_1.default.error('RPC error updating PO status', { error, poId, status });
            throw (0, errorHandler_1.createError)(error.message, 400);
        }
        const updatedStatuses = data.length > 0 && data[0].statuses ? data[0].statuses : ['Open'];
        logger_1.default.info('Purchase order status updated successfully', { poId, updatedStatuses });
        res.status(200).json({
            success: true,
            data: { statuses: updatedStatuses },
            message: 'Status updated successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error in updatePoStatus', { error: error.message, poId: req.params.poId });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to update PO status'
        });
    }
};
exports.updatePoStatus = updatePoStatus;
const deletePurchaseOrder = async (req, res) => {
    try {
        const { poId } = req.params;
        logger_1.default.info('Deleting purchase order', { poId });
        const { error } = await supabase_1.supabase
            .from('purchase_orders')
            .delete()
            .eq('id', poId);
        if (error) {
            logger_1.default.error('Supabase error deleting purchase order', { error, poId });
            throw (0, errorHandler_1.createError)('Failed to delete purchase order', 500);
        }
        logger_1.default.info('Purchase order deleted successfully', { poId });
        res.status(200).json({
            success: true,
            message: 'Purchase order deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error in deletePurchaseOrder', { error: error.message, poId: req.params.poId });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to delete purchase order'
        });
    }
};
exports.deletePurchaseOrder = deletePurchaseOrder;
