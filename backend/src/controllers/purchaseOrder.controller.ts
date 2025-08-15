import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

export const getPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const searchQuery = (req.query.search as string) || '';
    const statusFilter = (req.query.status as string) || '';
    const sortDirection = (req.query.sort_direction as string) || 'desc';
    const offset = (page - 1) * limit;

    logger.info('Fetching purchase orders', { 
      page, 
      limit, 
      searchQuery, 
      statusFilter, 
      sortDirection 
    });

    const query = supabase.rpc('search_purchase_orders', {
      search_term: searchQuery,
      status_filter: statusFilter
    }, { count: 'exact' });

    const { data, error, count } = await query
      .order('sequence', { ascending: sortDirection === 'asc' })
      .range(offset, offset + limit - 1);
      
    if (error) {
      logger.error('Supabase RPC error', { error, searchQuery, statusFilter });
      throw createError('Failed to fetch purchase orders from database', 500);
    }

    const totalPages = Math.ceil((count || 0) / limit);
    
    logger.info(`Successfully fetched ${data?.length || 0} purchase orders`, {
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

  } catch (error: any) {
    logger.error('Error in getPurchaseOrders', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch purchase orders'
    });
  }
};

export const getPurchaseOrderById = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    
    logger.info('Fetching purchase order by ID', { poId });
    
    const { data, error } = await supabase
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
        logger.warn('Purchase order not found', { poId });
        throw createError('Purchase order not found', 404);
      }
      logger.error('Supabase error fetching purchase order', { error, poId });
      throw createError('Failed to fetch purchase order from database', 500);
    }

    logger.info('Successfully fetched purchase order', { poId });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error: any) {
    logger.error('Error in getPurchaseOrderById', { error: error.message, poId: req.params.poId });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || 'Failed to fetch purchase order'
    });
  }
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const {
      poNumber, productCode, customerName, poCreatedDate,
      poReceivedDate, orderedQtyPieces, customerAmount
    } = req.body;

    logger.info('Creating new purchase order', { poNumber, productCode, customerName });

    const { data: rpcData, error: rpcError } = await supabase.rpc('create_new_po', {
      p_po_number: poNumber,
      p_product_code: productCode,
      p_customer_name: customerName,
      p_po_created_date: poCreatedDate,
      p_po_received_date: poReceivedDate,
      p_ordered_qty_pieces: orderedQtyPieces,
      p_customer_amount: customerAmount
    });
    
    if (rpcError) {
      logger.error('RPC error creating purchase order', { rpcError, poNumber });
      throw createError(rpcError.message, 400);
    }

    const newPoId = rpcData[0].created_po_id;
    logger.info('Purchase order created successfully', { newPoId, poNumber });

    const { data: newPo, error: fetchError } = await supabase
      .from('purchase_orders')
      .select(`*, product:products(*), statuses:po_status_history(status)`)
      .eq('id', newPoId)
      .single();
    
    if (fetchError) {
      logger.error('Error fetching created purchase order', { fetchError, newPoId });
      throw createError('Purchase order created but failed to fetch details', 500);
    }

    res.status(201).json({
      success: true,
      data: newPo,
      message: 'Purchase order created successfully'
    });

  } catch (error: any) {
    logger.error('Error in createPurchaseOrder', { error: error.message });
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to create purchase order'
    });
  }
};

export const updatePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const {
      poNumber, customerName, poCreatedDate,
      poReceivedDate, orderedQtyPieces, customerAmount
    } = req.body;

    logger.info('Updating purchase order', { poId, poNumber });

    const { data: rpcData, error: rpcError } = await supabase.rpc('update_po_details', {
      p_po_id: poId,
      p_po_number: poNumber,
      p_customer_name: customerName,
      p_po_created_date: poCreatedDate,
      p_po_received_date: poReceivedDate,
      p_ordered_qty_pieces: orderedQtyPieces,
      p_customer_amount: customerAmount
    });

    if (rpcError) {
      logger.error('RPC error updating purchase order', { rpcError, poId });
      throw createError(rpcError.message, 400);
    }

    const updatedPoId = rpcData[0].updated_po_id;
    logger.info('Purchase order updated successfully', { updatedPoId });

    const { data: updatedPo, error: fetchError } = await supabase
      .from('purchase_orders')
      .select(`*, product:products(*), statuses:po_status_history(status)`)
      .eq('id', updatedPoId)
      .single();
    
    if (fetchError) {
      logger.error('Error fetching updated purchase order', { fetchError, updatedPoId });
      throw createError('Purchase order updated but failed to fetch details', 500);
    }

    res.status(200).json({
      success: true,
      data: updatedPo,
      message: 'Purchase order updated successfully'
    });

  } catch (error: any) {
    logger.error('Error in updatePurchaseOrder', { error: error.message, poId: req.params.poId });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || 'Failed to update purchase order'
    });
  }
};

export const updatePoStatus = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const { status } = req.body;
    
    logger.info('Updating purchase order status', { poId, status });

    const { data, error } = await supabase.rpc('toggle_po_status', {
      target_po_id: poId,
      status_to_toggle: status
    });

    if (error) {
      logger.error('RPC error updating PO status', { error, poId, status });
      throw createError(error.message, 400);
    }
    
    const updatedStatuses = data.length > 0 && data[0].statuses ? data[0].statuses : ['Open'];
    
    logger.info('Purchase order status updated successfully', { poId, updatedStatuses });
    
    res.status(200).json({ 
      success: true,
      data: { statuses: updatedStatuses },
      message: 'Status updated successfully'
    });

  } catch (error: any) {
    logger.error('Error in updatePoStatus', { error: error.message, poId: req.params.poId });
    res.status(error.statusCode || 500).json({ 
      success: false, 
      message: error.message || 'Failed to update PO status'
    });
  }
};

export const deletePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;

    logger.info('Deleting purchase order', { poId });

    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', poId);

    if (error) {
      logger.error('Supabase error deleting purchase order', { error, poId });
      throw createError('Failed to delete purchase order', 500);
    }

    logger.info('Purchase order deleted successfully', { poId });

    res.status(200).json({
      success: true,
      message: 'Purchase order deleted successfully'
    });

  } catch (error: any) {
    logger.error('Error in deletePurchaseOrder', { error: error.message, poId: req.params.poId });
    res.status(error.statusCode || 500).json({ 
      success: false,
      message: error.message || 'Failed to delete purchase order'
    });
  }
};