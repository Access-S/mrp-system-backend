// src/controllers/snapshot.controller.ts

import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';

// ============================================================================
// BLOCK 1: Calculate Current KPI Values
// ============================================================================
async function calculateCurrentKPIs() {
  // Fetch all open POs (not completed/closed/canceled)
  const { data: openPOs, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      customer_amount,
      system_amount,
      ordered_qty_shippers,
      po_received_date,
      delivery_date,
      current_status,
      product:products(mins_per_shipper)
    `)
    .not('current_status', 'ilike', '%Despatched%')
    .not('current_status', 'ilike', '%Completed%')
    .not('current_status', 'eq', 'Closed')
    .not('current_status', 'eq', 'PO Canceled');

  if (poError) throw poError;

  // Fetch components at risk
  const { data: sohData } = await supabase
    .from('soh')
    .select('stock_on_hand');

  // Fetch completed POs for turnaround calculation (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: completedPOs } = await supabase
    .from('purchase_orders')
    .select('po_received_date, delivery_date, current_status')
    .or('current_status.ilike.%Despatched%,current_status.ilike.%Completed%,current_status.eq.Closed')
    .gte('delivery_date', ninetyDaysAgo.toISOString().split('T')[0]);

  // Calculate values
  let totalOpenOrders = 0;
  let totalOpenValue = 0;
  let totalOpenWorkHours = 0;
  let ordersRequiringAttention = 0;

  (openPOs || []).forEach((po: any) => {
    const status = po.current_status || 'Open';
    const orderValue = po.customer_amount || po.system_amount || 0;
    const minsPerShipper = po.product?.mins_per_shipper || 0;
    const workHours = ((po.ordered_qty_shippers || 0) * minsPerShipper) / 60;

    totalOpenOrders++;
    totalOpenValue += orderValue;
    totalOpenWorkHours += workHours;

    if (status.includes('PO Check')) {
      ordersRequiringAttention++;
    }
  });

  const componentsAtRisk = (sohData || []).filter(
    (item: any) => (item.stock_on_hand || 0) < 100
  ).length;

  // Calculate average turnaround
  let totalTurnaroundDays = 0;
  let completedCount = 0;

  (completedPOs || []).forEach((po: any) => {
    if (po.delivery_date && po.po_received_date) {
      const received = new Date(po.po_received_date);
      const delivered = new Date(po.delivery_date);
      const days = Math.ceil((delivered.getTime() - received.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        totalTurnaroundDays += days;
        completedCount++;
      }
    }
  });

  const avgTurnaroundDays = completedCount > 0
    ? Math.round((totalTurnaroundDays / completedCount) * 10) / 10
    : 0;

  return {
    openOrders: totalOpenOrders,
    openOrderValue: Math.round(totalOpenValue * 100) / 100,
    workHoursPending: Math.round(totalOpenWorkHours * 10) / 10,
    attentionRequired: ordersRequiringAttention,
    componentsAtRisk,
    avgTurnaroundDays
  };
}

// ============================================================================
// BLOCK 2: Save Snapshot
// ============================================================================
export const saveSnapshot = async (req: Request, res: Response) => {
  try {
    const snapshotType = (req.query.type as string) || 'manual';
    
    logger.info(`📸 Saving KPI snapshot (${snapshotType})...`);

    const kpis = await calculateCurrentKPIs();
    const today = new Date();
    const snapshotDate = today.toISOString().split('T')[0];

    // Generate period label
    let periodLabel = '';
    switch (snapshotType) {
      case 'weekly':
        periodLabel = `Week ending ${today.toLocaleDateString('en-AU', { 
          day: 'numeric', month: 'short', year: 'numeric' 
        })}`;
        break;
      case 'monthly':
        periodLabel = today.toLocaleDateString('en-AU', { 
          month: 'long', year: 'numeric' 
        });
        break;
      default:
        periodLabel = `Snapshot ${today.toLocaleDateString('en-AU', { 
          day: 'numeric', month: 'short', year: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        })}`;
    }

    // Upsert snapshot (update if same type+date exists)
    const { data, error } = await supabase
      .from('kpi_snapshots')
      .upsert({
        snapshot_type: snapshotType,
        snapshot_date: snapshotDate,
        period_label: periodLabel,
        open_orders: kpis.openOrders,
        open_order_value: kpis.openOrderValue,
        work_hours_pending: kpis.workHoursPending,
        attention_required: kpis.attentionRequired,
        components_at_risk: kpis.componentsAtRisk,
        avg_turnaround_days: kpis.avgTurnaroundDays
      }, {
        onConflict: 'snapshot_type,snapshot_date'
      })
      .select();

    if (error) throw error;

    logger.info(`✅ KPI snapshot saved: ${periodLabel}`);

    res.status(200).json({
      success: true,
      message: `Snapshot saved: ${periodLabel}`,
      data: {
        snapshot: data?.[0],
        kpis
      }
    });

  } catch (error: any) {
    logger.error('❌ Error saving snapshot', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save snapshot'
    });
  }
};

// ============================================================================
// BLOCK 3: Get Snapshots for a Period
// ============================================================================
export const getSnapshots = async (req: Request, res: Response) => {
  try {
    const snapshotType = req.query.type as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    logger.info(`📊 Fetching snapshots: type=${snapshotType}, ${startDate} to ${endDate}`);

    let query = supabase
      .from('kpi_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false });

    if (snapshotType) {
      query = query.eq('snapshot_type', snapshotType);
    }
    if (startDate) {
      query = query.gte('snapshot_date', startDate);
    }
    if (endDate) {
      query = query.lte('snapshot_date', endDate);
    }

    const { data, error } = await query.limit(50);

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || []
    });

  } catch (error: any) {
    logger.error('❌ Error fetching snapshots', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch snapshots'
    });
  }
};

// ============================================================================
// BLOCK 4: Auto Snapshot (Called by CRON)
// ============================================================================
export const autoSnapshot = async (req: Request, res: Response) => {
  try {
    // Verify CRON secret for security
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    
    if (cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid CRON secret'
      });
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const dayOfMonth = today.getDate();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    const kpis = await calculateCurrentKPIs();
    const snapshotDate = today.toISOString().split('T')[0];
    const snapshots: any[] = [];

    // Weekly snapshot on Sunday
    if (dayOfWeek === 0) {
      const weeklyLabel = `Week ending ${today.toLocaleDateString('en-AU', { 
        day: 'numeric', month: 'short', year: 'numeric' 
      })}`;

      const { error } = await supabase
        .from('kpi_snapshots')
        .upsert({
          snapshot_type: 'weekly',
          snapshot_date: snapshotDate,
          period_label: weeklyLabel,
          open_orders: kpis.openOrders,
          open_order_value: kpis.openOrderValue,
          work_hours_pending: kpis.workHoursPending,
          attention_required: kpis.attentionRequired,
          components_at_risk: kpis.componentsAtRisk,
          avg_turnaround_days: kpis.avgTurnaroundDays
        }, { onConflict: 'snapshot_type,snapshot_date' });

      if (error) throw error;
      snapshots.push({ type: 'weekly', label: weeklyLabel });
    }

    // Monthly snapshot on last day of month
    if (dayOfMonth === lastDayOfMonth) {
      const monthlyLabel = today.toLocaleDateString('en-AU', { 
        month: 'long', year: 'numeric' 
      });

      const { error } = await supabase
        .from('kpi_snapshots')
        .upsert({
          snapshot_type: 'monthly',
          snapshot_date: snapshotDate,
          period_label: monthlyLabel,
          open_orders: kpis.openOrders,
          open_order_value: kpis.openOrderValue,
          work_hours_pending: kpis.workHoursPending,
          attention_required: kpis.attentionRequired,
          components_at_risk: kpis.componentsAtRisk,
          avg_turnaround_days: kpis.avgTurnaroundDays
        }, { onConflict: 'snapshot_type,snapshot_date' });

      if (error) throw error;
      snapshots.push({ type: 'monthly', label: monthlyLabel });
    }

    logger.info(`✅ Auto snapshot complete: ${snapshots.length} snapshots saved`);

    res.status(200).json({
      success: true,
      message: `Auto snapshot complete`,
      data: { snapshots, kpis }
    });

  } catch (error: any) {
    logger.error('❌ Auto snapshot error', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Auto snapshot failed'
    });
  }
};