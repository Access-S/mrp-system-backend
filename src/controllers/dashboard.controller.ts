// src/controllers/dashboard.controller.ts

// ============================================================================
// BLOCK 1: Imports
// ============================================================================
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// ============================================================================
// BLOCK 2: Interfaces
// ============================================================================

interface DashboardKPIs {
  totalOpenOrders: number;
  totalOpenValue: number;
  totalOpenWorkHours: number;
  ordersRequiringAttention: number;
  componentsAtRisk: number;
  averageTurnaroundDays: number;
  completedThisMonth: number;
  revenueThisMonth: number;
  // Add sparkline data
  trends: {
    openOrders: number[];
    openValue: number[];
    workHours: number[];
    attentionRequired: number[];
    componentsAtRisk: number[];
    turnaroundDays: number[];
    completedMonthly: number[];
    revenueMonthly: number[];
  };
}

interface POStatusDistribution {
  status: string;
  count: number;
  value: number;
}

interface MonthlyTrend {
  month: string;
  ordersReceived: number;
  ordersDespatched: number;
  revenue: number;
}

interface TopCustomer {
  customerName: string;
  orderCount: number;
  totalValue: number;
}

interface TopProduct {
  productCode: string;
  description: string;
  orderCount: number;
  totalQuantity: number;
}

interface LowStockAlert {
  productId: string;
  description: string;
  stockOnHand: number;
  safetyStock: number;
  deficit: number;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

interface DashboardData {
  kpis: DashboardKPIs;
  poStatusDistribution: POStatusDistribution[];
  completedOrdersTotal: number;
  activeOrdersTotal: number;
  monthlyTrends: MonthlyTrend[];
  topCustomers: TopCustomer[];
  topProducts: TopProduct[];
  lowStockAlerts: LowStockAlert[];
  recentActivity: RecentActivity[];
  forecastSummary: {
    totalForecastedUnits: number;
    monthsCovered: number;
    topForecastedProduct: string;
  };
  lastUpdated: string;
}
// ============================================================================
// BLOCK 3: Helper Functions
// ============================================================================

/**
 * Get the start of current month in ISO format
 */
const getMonthStart = (monthsAgo: number = 0): string => {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

/**
 * Format month for display (e.g., "Jan 2025")
 */
const formatMonth = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// ============================================================================
// BLOCK 4: Main Dashboard Data Endpoint
// ============================================================================
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    logger.info('📊 Fetching dashboard data...');

    // Run all queries in parallel for maximum performance
    const [
      kpisResult,
      statusDistributionResult,
      monthlyTrendsResult,
      topCustomersResult,
      topProductsResult,
      lowStockResult,
      recentActivityResult,
      forecastSummaryResult
    ] = await Promise.all([
      fetchKPIs(),
      fetchStatusDistribution(),
      fetchMonthlyTrends(),
      fetchTopCustomers(),
      fetchTopProducts(),
      fetchLowStockAlerts(),
      fetchRecentActivity(),
      fetchForecastSummary()
    ]);

        const dashboardData: DashboardData = {
          kpis: kpisResult,
          poStatusDistribution: statusDistributionResult.activeStatuses,
          completedOrdersTotal: statusDistributionResult.completedTotal,
          activeOrdersTotal: statusDistributionResult.activeTotal,
          monthlyTrends: monthlyTrendsResult,
          topCustomers: topCustomersResult,
          topProducts: topProductsResult,
          lowStockAlerts: lowStockResult,
          recentActivity: recentActivityResult,
          forecastSummary: forecastSummaryResult,
          lastUpdated: new Date().toISOString()
        };

    const duration = Date.now() - startTime;
    logger.info(`✅ Dashboard data fetched in ${duration}ms`);

    res.status(200).json({
      success: true,
      data: dashboardData,
      meta: {
        fetchDuration: duration,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    logger.error('❌ Error fetching dashboard data', { error: error.message });
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch dashboard data'
    });
  }
};

// ============================================================================
// BLOCK 5: KPIs Calculation with Trends
// ============================================================================
async function fetchKPIs(): Promise<DashboardKPIs> {
  try {
    // Fetch all POs with their statuses and product info
    const { data: allPOs, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        customer_amount,
        system_amount,
        ordered_qty_shippers,
        po_received_date,
        delivery_date,
        current_status,
        created_at,
        product:products(mins_per_shipper)
      `);

    if (poError) {
      logger.error('Error fetching POs for KPIs', { error: poError });
      throw poError;
    }

    // Fetch components at risk
    const { data: sohData, error: sohError } = await supabase
      .from('soh')
      .select('stock_on_hand');

    // Current KPIs
    let totalOpenOrders = 0;
    let totalOpenValue = 0;
    let totalOpenWorkHours = 0;
    let ordersRequiringAttention = 0;
    let completedThisMonth = 0;
    let revenueThisMonth = 0;
    let totalTurnaroundDays = 0;
    let completedCount = 0;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Track last 6 months data for sparklines
    const last6Months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push(d.toISOString().substring(0, 7));
    }

    const monthlyData: { [key: string]: {
      openOrders: number;
      openValue: number;
      workHours: number;
      attention: number;
      completed: number;
      revenue: number;
      turnaroundTotal: number;
      turnaroundCount: number;
    }} = {};

    last6Months.forEach(m => {
      monthlyData[m] = {
        openOrders: 0,
        openValue: 0,
        workHours: 0,
        attention: 0,
        completed: 0,
        revenue: 0,
        turnaroundTotal: 0,
        turnaroundCount: 0
      };
    });

    (allPOs || []).forEach((po: any) => {
      const status = po.current_status || 'Open';
      const isCompleted = status.includes('Despatched') || status.includes('Completed') || status === 'Closed';
      const needsAttention = status.includes('PO Check');

      const minsPerShipper = po.product?.mins_per_shipper || 0;
      const workHours = ((po.ordered_qty_shippers || 0) * minsPerShipper) / 60;
      const orderValue = po.customer_amount || po.system_amount || 0;

      // Get month key from received date or delivery date
      const receivedMonth = po.po_received_date?.substring(0, 7);
      const deliveryMonth = po.delivery_date?.substring(0, 7);

      if (!isCompleted) {
        totalOpenOrders++;
        totalOpenValue += orderValue;
        totalOpenWorkHours += workHours;

        // Track by received month
        if (receivedMonth && monthlyData[receivedMonth]) {
          monthlyData[receivedMonth].openOrders++;
          monthlyData[receivedMonth].openValue += orderValue;
          monthlyData[receivedMonth].workHours += workHours;
        }
      } else {
        // Completed orders
        if (deliveryMonth && monthlyData[deliveryMonth]) {
          monthlyData[deliveryMonth].completed++;
          monthlyData[deliveryMonth].revenue += orderValue;
        }

        // This month completed
        if (po.delivery_date && new Date(po.delivery_date) >= monthStart) {
          completedThisMonth++;
          revenueThisMonth += orderValue;
        }

        // Turnaround calculation
        if (po.delivery_date && po.po_received_date) {
          const received = new Date(po.po_received_date);
          const delivered = new Date(po.delivery_date);
          const days = Math.ceil((delivered.getTime() - received.getTime()) / (1000 * 60 * 60 * 24));
          if (days > 0) {
            totalTurnaroundDays += days;
            completedCount++;

            if (deliveryMonth && monthlyData[deliveryMonth]) {
              monthlyData[deliveryMonth].turnaroundTotal += days;
              monthlyData[deliveryMonth].turnaroundCount++;
            }
          }
        }
      }

      if (needsAttention) {
        ordersRequiringAttention++;
        if (receivedMonth && monthlyData[receivedMonth]) {
          monthlyData[receivedMonth].attention++;
        }
      }
    });

    // Components at risk
    const componentsAtRisk = (sohData || []).filter(
      (item: any) => (item.stock_on_hand || 0) < 100
    ).length;

    // Build sparkline arrays
    const trends = {
      openOrders: last6Months.map(m => monthlyData[m]?.openOrders || 0),
      openValue: last6Months.map(m => Math.round(monthlyData[m]?.openValue || 0)),
      workHours: last6Months.map(m => Math.round((monthlyData[m]?.workHours || 0) * 10) / 10),
      attentionRequired: last6Months.map(m => monthlyData[m]?.attention || 0),
      componentsAtRisk: last6Months.map(() => componentsAtRisk), // Static for now
      turnaroundDays: last6Months.map(m => {
        const data = monthlyData[m];
        return data && data.turnaroundCount > 0 
          ? Math.round((data.turnaroundTotal / data.turnaroundCount) * 10) / 10 
          : 0;
      }),
      completedMonthly: last6Months.map(m => monthlyData[m]?.completed || 0),
      revenueMonthly: last6Months.map(m => Math.round(monthlyData[m]?.revenue || 0)),
    };

    return {
      totalOpenOrders,
      totalOpenValue: Math.round(totalOpenValue * 100) / 100,
      totalOpenWorkHours: Math.round(totalOpenWorkHours * 10) / 10,
      ordersRequiringAttention,
      componentsAtRisk,
      averageTurnaroundDays: completedCount > 0 
        ? Math.round((totalTurnaroundDays / completedCount) * 10) / 10 
        : 0,
      completedThisMonth,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      trends
    };

  } catch (error) {
    logger.error('Error in fetchKPIs', { error });
    return {
      totalOpenOrders: 0,
      totalOpenValue: 0,
      totalOpenWorkHours: 0,
      ordersRequiringAttention: 0,
      componentsAtRisk: 0,
      averageTurnaroundDays: 0,
      completedThisMonth: 0,
      revenueThisMonth: 0,
      trends: {
        openOrders: [],
        openValue: [],
        workHours: [],
        attentionRequired: [],
        componentsAtRisk: [],
        turnaroundDays: [],
        completedMonthly: [],
        revenueMonthly: [],
      }
    };
  }
}

// ============================================================================
// BLOCK 6: PO Status Distribution (Active Only) + Completed Total
// ============================================================================
async function fetchStatusDistribution(): Promise<{ 
  activeStatuses: POStatusDistribution[]; 
  completedTotal: number;
  activeTotal: number;
}> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('current_status, customer_amount');

    if (error) throw error;

    const statusMap = new Map<string, { count: number; value: number }>();
    let completedTotal = 0;
    let activeTotal = 0;

    (data || []).forEach((po: any) => {
      const status = po.current_status || 'Open';
      const value = po.customer_amount || 0;

      // Count completed/despatched orders separately
      if (status.includes('Despatched') || status.includes('Completed') || status === 'Closed') {
        completedTotal++;
      } else {
        // Track active statuses
        activeTotal++;
        if (statusMap.has(status)) {
          const existing = statusMap.get(status)!;
          existing.count++;
          existing.value += value;
        } else {
          statusMap.set(status, { count: 1, value });
        }
      }
    });

    // Convert to array and filter out zero counts
    const activeStatuses = Array.from(statusMap.entries())
      .filter(([_, data]) => data.count > 0)
      .map(([status, data]) => ({
        status,
        count: data.count,
        value: Math.round(data.value * 100) / 100
      }))
      .sort((a, b) => b.count - a.count);

    return { activeStatuses, completedTotal, activeTotal };

  } catch (error) {
    logger.error('Error in fetchStatusDistribution', { error });
    return { activeStatuses: [], completedTotal: 0, activeTotal: 0 };
  }
}

// ============================================================================
// BLOCK 7: Monthly Trends (Last 6 Months) - Orders Received vs Despatched
// ============================================================================
async function fetchMonthlyTrends(): Promise<MonthlyTrend[]> {
  try {
    const sixMonthsAgo = getMonthStart(6);

    // Fetch all POs from last 6 months
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('po_received_date, delivery_date, customer_amount, current_status')
      .or(`po_received_date.gte.${sixMonthsAgo},delivery_date.gte.${sixMonthsAgo}`)
      .order('po_received_date', { ascending: true });

    if (error) throw error;

    // Track both received and despatched per month
    const monthlyMap = new Map<string, { 
      received: number; 
      despatched: number; 
      revenue: number 
    }>();

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().substring(0, 7);
      monthlyMap.set(monthKey, { received: 0, despatched: 0, revenue: 0 });
    }

    (data || []).forEach((po: any) => {
      // Count RECEIVED orders by po_received_date
      if (po.po_received_date) {
        const receivedMonthKey = po.po_received_date.substring(0, 7);
        if (monthlyMap.has(receivedMonthKey)) {
          const existing = monthlyMap.get(receivedMonthKey)!;
          existing.received++;
        }
      }

      // Count DESPATCHED orders by delivery_date (only completed orders)
      const status = po.current_status || '';
      const isCompleted = status.includes('Despatched') || 
                          status.includes('Completed') || 
                          status === 'Closed';

      if (po.delivery_date && isCompleted) {
        const deliveryMonthKey = po.delivery_date.substring(0, 7);
        if (monthlyMap.has(deliveryMonthKey)) {
          const existing = monthlyMap.get(deliveryMonthKey)!;
          existing.despatched++;
          existing.revenue += po.customer_amount || 0;
        }
      }
    });

    return Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month: formatMonth(month + '-01'),
        ordersReceived: data.received,
        ordersDespatched: data.despatched,
        revenue: Math.round(data.revenue * 100) / 100
      }));

  } catch (error) {
    logger.error('Error in fetchMonthlyTrends', { error });
    return [];
  }
}

// ============================================================================
// BLOCK 8: Top Customers
// ============================================================================
async function fetchTopCustomers(): Promise<TopCustomer[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('customer_name, customer_amount');

    if (error) throw error;

    const customerMap = new Map<string, { count: number; value: number }>();

    (data || []).forEach((po: any) => {
      const customer = po.customer_name || 'Unknown';
      const value = po.customer_amount || 0;

      if (customerMap.has(customer)) {
        const existing = customerMap.get(customer)!;
        existing.count++;
        existing.value += value;
      } else {
        customerMap.set(customer, { count: 1, value });
      }
    });

    return Array.from(customerMap.entries())
      .map(([name, data]) => ({
        customerName: name,
        orderCount: data.count,
        totalValue: Math.round(data.value * 100) / 100
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

  } catch (error) {
    logger.error('Error in fetchTopCustomers', { error });
    return [];
  }
}

// ============================================================================
// BLOCK 9: Top Products
// ============================================================================
async function fetchTopProducts(): Promise<TopProduct[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        ordered_qty_pieces,
        product:products(product_code, description)
      `);

    if (error) throw error;

    const productMap = new Map<string, { 
      description: string; 
      count: number; 
      quantity: number 
    }>();

    (data || []).forEach((po: any) => {
      const productCode = po.product?.product_code || 'Unknown';
      const description = po.product?.description || '';
      const quantity = po.ordered_qty_pieces || 0;

      if (productMap.has(productCode)) {
        const existing = productMap.get(productCode)!;
        existing.count++;
        existing.quantity += quantity;
      } else {
        productMap.set(productCode, { description, count: 1, quantity });
      }
    });

    return Array.from(productMap.entries())
      .map(([code, data]) => ({
        productCode: code,
        description: data.description,
        orderCount: data.count,
        totalQuantity: data.quantity
      }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);

  } catch (error) {
    logger.error('Error in fetchTopProducts', { error });
    return [];
  }
}

// ============================================================================
// BLOCK 10: Low Stock Alerts
// ============================================================================
async function fetchLowStockAlerts(): Promise<LowStockAlert[]> {
  try {
    const { data, error } = await supabase
      .from('soh')
      .select('product_id, description, stock_on_hand')
      .lt('stock_on_hand', 100) // Items with stock < 100
      .order('stock_on_hand', { ascending: true })
      .limit(10);

    if (error) throw error;

    return (data || []).map((item: any) => ({
      productId: item.product_id || '',
      description: item.description || '',
      stockOnHand: item.stock_on_hand || 0,
      safetyStock: 100, // Default safety stock threshold
      deficit: Math.max(0, 100 - (item.stock_on_hand || 0))
    }));

  } catch (error) {
    logger.error('Error in fetchLowStockAlerts', { error });
    return [];
  }
}

// ============================================================================
// BLOCK 11: Recent Activity
// ============================================================================
async function fetchRecentActivity(): Promise<RecentActivity[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        customer_name,
        customer_amount,
        updated_at,
        statuses:po_status_history(status)
      `)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return (data || []).map((po: any) => {
      const statuses = po.statuses?.map((s: any) => s.status) || ['Open'];
      return {
        id: po.id,
        type: 'purchase_order',
        title: `PO ${po.po_number}`,
        description: `${po.customer_name} - $${(po.customer_amount || 0).toFixed(2)}`,
        timestamp: po.updated_at,
        status: statuses[statuses.length - 1] || 'Open'
      };
    });

  } catch (error) {
    logger.error('Error in fetchRecentActivity', { error });
    return [];
  }
}

// ============================================================================
// BLOCK 12: Forecast Summary
// ============================================================================
async function fetchForecastSummary(): Promise<{
  totalForecastedUnits: number;
  monthsCovered: number;
  topForecastedProduct: string;
}> {
  try {
    const { data, error } = await supabase
      .from('forecasts')
      .select('product_code, quantity, forecast_date');

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        totalForecastedUnits: 0,
        monthsCovered: 0,
        topForecastedProduct: 'N/A'
      };
    }

    const totalUnits = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const uniqueMonths = new Set(data.map(item => item.forecast_date?.substring(0, 7)));

    // Find top forecasted product
    const productTotals = new Map<string, number>();
    data.forEach(item => {
      const current = productTotals.get(item.product_code) || 0;
      productTotals.set(item.product_code, current + (item.quantity || 0));
    });

    let topProduct = 'N/A';
    let maxQuantity = 0;
    productTotals.forEach((quantity, product) => {
      if (quantity > maxQuantity) {
        maxQuantity = quantity;
        topProduct = product;
      }
    });

    return {
      totalForecastedUnits: totalUnits,
      monthsCovered: uniqueMonths.size,
      topForecastedProduct: topProduct
    };

  } catch (error) {
    logger.error('Error in fetchForecastSummary', { error });
    return {
      totalForecastedUnits: 0,
      monthsCovered: 0,
      topForecastedProduct: 'N/A'
    };
  }
}

// ============================================================================
// BLOCK 13: Quick Stats Endpoint (Lightweight)
// ============================================================================
export const getQuickStats = async (req: Request, res: Response) => {
  try {
    logger.info('📊 Fetching quick stats...');

    const kpis = await fetchKPIs();

    res.status(200).json({
      success: true,
      data: kpis
    });

  } catch (error: any) {
    logger.error('Error fetching quick stats', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quick stats'
    });
  }
};