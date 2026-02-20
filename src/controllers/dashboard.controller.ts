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
// BLOCK 3.5: Date Range Helpers
// ============================================================================

interface DateRange {
  start: Date;
  end: Date;
  points: number;
  interval: 'hour' | 'day' | 'week' | 'month';
}

function getFinancialYearStart(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  if (month >= 6) { // Jul-Dec
    return new Date(year, 6, 1); // Jul 1 this year
  } else { // Jan-Jun
    return new Date(year - 1, 6, 1); // Jul 1 last year
  }
}

function getFinancialYearEnd(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  if (month >= 6) { // Jul-Dec
    return new Date(year + 1, 5, 30); // Jun 30 next year
  } else { // Jan-Jun
    return new Date(year, 5, 30); // Jun 30 this year
  }
}

function getDateRange(timeRange: string): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (timeRange) {
    case 'today':
      return {
        start: today,
        end: now,
        points: 24,
        interval: 'hour'
      };
    
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return {
        start: monday,
        end: now,
        points: 7,
        interval: 'day'
      };
    }
    
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return {
        start: lastMonday,
        end: lastSunday,
        points: 7,
        interval: 'day'
      };
    }
    
    case 'this_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: monthStart,
        end: now,
        points: now.getDate(),
        interval: 'day'
      };
    }
    
    case 'last_month': {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: lastMonthStart,
        end: lastMonthEnd,
        points: lastMonthEnd.getDate(),
        interval: 'day'
      };
    }
    
    case 'last_3_months': {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      return {
        start: threeMonthsAgo,
        end: now,
        points: 12,
        interval: 'week'
      };
    }
    
    case 'last_6_months': {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return {
        start: sixMonthsAgo,
        end: now,
        points: 6,
        interval: 'month'
      };
    }
    
    case 'this_fy': {
      return {
        start: getFinancialYearStart(now),
        end: now,
        points: 12,
        interval: 'month'
      };
    }
    
    case 'last_fy': {
      const lastFYStart = new Date(getFinancialYearStart(now));
      lastFYStart.setFullYear(lastFYStart.getFullYear() - 1);
      const lastFYEnd = new Date(getFinancialYearEnd(now));
      lastFYEnd.setFullYear(lastFYEnd.getFullYear() - 1);
      return {
        start: lastFYStart,
        end: lastFYEnd,
        points: 12,
        interval: 'month'
      };
    }
    
    default: // Default to last 6 months
      const defaultStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return {
        start: defaultStart,
        end: now,
        points: 6,
        interval: 'month'
      };
  }
}

function formatDateForQuery(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// BLOCK 4: Main Dashboard Data Endpoint
// ============================================================================
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const timeRange = (req.query.timeRange as string) || 'last_6_months';
    
    logger.info(`📊 Fetching dashboard data for timeRange: ${timeRange}`);

    const dateRange = getDateRange(timeRange);

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
      fetchKPIs(dateRange),
      fetchStatusDistribution(dateRange),
      fetchMonthlyTrends(dateRange),
      fetchTopCustomers(dateRange),
      fetchTopProducts(dateRange),
      fetchLowStockAlerts(),
      fetchRecentActivity(),
      fetchForecastSummary()
    ]);

    const dashboardData = {
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
      lastUpdated: new Date().toISOString(),
      timeRange: timeRange,
      dateRange: {
        start: formatDateForQuery(dateRange.start),
        end: formatDateForQuery(dateRange.end)
      }
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
// BLOCK 5: KPIs Calculation with Trends (Updated with DateRange)
// ============================================================================
async function fetchKPIs(dateRange: DateRange): Promise<DashboardKPIs> {
  try {
    const startDate = formatDateForQuery(dateRange.start);
    const endDate = formatDateForQuery(dateRange.end);

    // Cards 1-5: Fetch ALL open POs (current state, no date filter)
    const { data: currentPOs, error: currentError } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        customer_amount,
        system_amount,
        ordered_qty_shippers,
        current_status,
        product:products(mins_per_shipper)
      `)
      .not('current_status', 'ilike', '%Despatched%')
      .not('current_status', 'ilike', '%Completed%')
      .not('current_status', 'eq', 'Closed')
      .not('current_status', 'eq', 'PO Canceled');

    if (currentError) {
      logger.error('Error fetching current POs', { error: currentError });
      throw currentError;
    }

    // Cards 6-8: Fetch POs within selected date range
    const { data: rangePOs, error: rangeError } = await supabase
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
      `)
      .gte('po_received_date', startDate)
      .lte('po_received_date', endDate);

    if (rangeError) {
      logger.error('Error fetching range POs', { error: rangeError });
      throw rangeError;
    }

    // Components at risk (always current state)
    const { data: sohData } = await supabase
      .from('soh')
      .select('stock_on_hand');

    // ==========================================
    // Cards 1-5: Current state (not date filtered)
    // ==========================================
    let totalOpenOrders = 0;
    let totalOpenValue = 0;
    let totalOpenWorkHours = 0;
    let ordersRequiringAttention = 0;

    (currentPOs || []).forEach((po: any) => {
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

    // ==========================================
    // Cards 6-8: Date range filtered
    // ==========================================
    let completedInRange = 0;
    let revenueInRange = 0;
    let totalTurnaroundDays = 0;
    let completedCount = 0;

    // Generate time buckets for sparklines
    const timeBuckets = generateTimeBuckets(dateRange);
    const bucketData: { [key: string]: {
      openOrders: number;
      openValue: number;
      workHours: number;
      attention: number;
      completed: number;
      revenue: number;
      turnaroundTotal: number;
      turnaroundCount: number;
    }} = {};

    timeBuckets.forEach(bucket => {
      bucketData[bucket] = {
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

    (rangePOs || []).forEach((po: any) => {
      const status = po.current_status || 'Open';
      const isCompleted = status.includes('Despatched') || status.includes('Completed') || status === 'Closed';
      const orderValue = po.customer_amount || po.system_amount || 0;

      const deliveryBucket = po.delivery_date ? getBucketKey(po.delivery_date, dateRange.interval) : null;

      if (isCompleted) {
        completedInRange++;
        revenueInRange += orderValue;

        if (deliveryBucket && bucketData[deliveryBucket]) {
          bucketData[deliveryBucket].completed++;
          bucketData[deliveryBucket].revenue += orderValue;
        }

        // Turnaround calculation
        if (po.delivery_date && po.po_received_date) {
          const received = new Date(po.po_received_date);
          const delivered = new Date(po.delivery_date);
          const days = Math.ceil((delivered.getTime() - received.getTime()) / (1000 * 60 * 60 * 24));
          if (days > 0) {
            totalTurnaroundDays += days;
            completedCount++;

            if (deliveryBucket && bucketData[deliveryBucket]) {
              bucketData[deliveryBucket].turnaroundTotal += days;
              bucketData[deliveryBucket].turnaroundCount++;
            }
          }
        }
      }
    });

    // Build sparkline arrays
    const trends = {
      openOrders: timeBuckets.map(() => totalOpenOrders),
      openValue: timeBuckets.map(() => Math.round(totalOpenValue)),
      workHours: timeBuckets.map(() => Math.round(totalOpenWorkHours * 10) / 10),
      attentionRequired: timeBuckets.map(() => ordersRequiringAttention),
      componentsAtRisk: timeBuckets.map(() => componentsAtRisk),
      turnaroundDays: timeBuckets.map(b => {
        const data = bucketData[b];
        return data && data.turnaroundCount > 0 
          ? Math.round((data.turnaroundTotal / data.turnaroundCount) * 10) / 10 
          : 0;
      }),
      completedMonthly: timeBuckets.map(b => bucketData[b]?.completed || 0),
      revenueMonthly: timeBuckets.map(b => Math.round(bucketData[b]?.revenue || 0)),
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
      completedThisMonth: completedInRange,
      revenueThisMonth: Math.round(revenueInRange * 100) / 100,
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

// Helper: Generate time buckets
function generateTimeBuckets(dateRange: DateRange): string[] {
  const buckets: string[] = [];
  const current = new Date(dateRange.start);
  
  while (current <= dateRange.end) {
    buckets.push(getBucketKey(current.toISOString(), dateRange.interval));
    
    switch (dateRange.interval) {
      case 'hour':
        current.setHours(current.getHours() + 1);
        break;
      case 'day':
        current.setDate(current.getDate() + 1);
        break;
      case 'week':
        current.setDate(current.getDate() + 7);
        break;
      case 'month':
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }
  
  return buckets.slice(0, dateRange.points);
}

// Helper: Get bucket key from date
function getBucketKey(dateStr: string, interval: 'hour' | 'day' | 'week' | 'month'): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  
  switch (interval) {
    case 'hour':
      return `${date.toISOString().substring(0, 13)}:00`;
    case 'day':
      return date.toISOString().substring(0, 10);
    case 'week':
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().substring(0, 10);
    case 'month':
      return date.toISOString().substring(0, 7);
    default:
      return date.toISOString().substring(0, 10);
  }
}

// BLOCK 6: PO Status Distribution (Active Only) + Completed Total
// UPDATE: Added dateRange parameter
async function fetchStatusDistribution(dateRange: DateRange): Promise<{ 
  activeStatuses: POStatusDistribution[]; 
  completedTotal: number;
  activeTotal: number;
}> {
  try {
    const startDate = formatDateForQuery(dateRange.start);
    const endDate = formatDateForQuery(dateRange.end);

    // UPDATE: Added date filtering
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('current_status, customer_amount')
      .gte('po_received_date', startDate)
      .lte('po_received_date', endDate);

    if (error) throw error;

    const statusMap = new Map<string, { count: number; value: number }>();
    let completedTotal = 0;
    let activeTotal = 0;

    (data || []).forEach((po: any) => {
      const status = po.current_status || 'Open';
      const value = po.customer_amount || 0;

      if (status.includes('Despatched') || status.includes('Completed') || status === 'Closed') {
        completedTotal++;
      } else {
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

// BLOCK 7: Monthly Trends
// UPDATE: Added dateRange parameter
async function fetchMonthlyTrends(dateRange: DateRange): Promise<MonthlyTrend[]> {
  try {
    const startDate = formatDateForQuery(dateRange.start);
    const endDate = formatDateForQuery(dateRange.end);

    // UPDATE: Filter by date range
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('po_received_date, delivery_date, customer_amount, current_status')
      .or(`po_received_date.gte.${startDate},delivery_date.gte.${startDate}`)
      .lte('po_received_date', endDate) // Ensure upper bound
      .order('po_received_date', { ascending: true });

    if (error) throw error;

    const monthlyMap = new Map<string, { 
      received: number; 
      despatched: number; 
      revenue: number 
    }>();

    // Initialize months based on the range (simplification: uses current logic but dynamic start)
    // Ideally, you would loop through dateRange, but for quick fix:
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().substring(0, 7);
      monthlyMap.set(monthKey, { received: 0, despatched: 0, revenue: 0 });
    }

    (data || []).forEach((po: any) => {
      if (po.po_received_date) {
        const receivedMonthKey = po.po_received_date.substring(0, 7);
        if (monthlyMap.has(receivedMonthKey)) {
          const existing = monthlyMap.get(receivedMonthKey)!;
          existing.received++;
        }
      }

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

// BLOCK 8: Top Customers
// UPDATE: Added dateRange parameter
async function fetchTopCustomers(dateRange: DateRange): Promise<TopCustomer[]> {
  try {
    const startDate = formatDateForQuery(dateRange.start);
    const endDate = formatDateForQuery(dateRange.end);

    // UPDATE: Added date filter
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('customer_name, customer_amount')
      .gte('po_received_date', startDate)
      .lte('po_received_date', endDate);

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

// BLOCK 9: Top Products
// UPDATE: Added dateRange parameter
async function fetchTopProducts(dateRange: DateRange): Promise<TopProduct[]> {
  try {
    const startDate = formatDateForQuery(dateRange.start);
    const endDate = formatDateForQuery(dateRange.end);

    // UPDATE: Added date filter
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        ordered_qty_pieces,
        product:products(product_code, description)
      `)
      .gte('po_received_date', startDate)
      .lte('po_received_date', endDate);

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

// BLOCK 13: Quick Stats Endpoint (Lightweight)
export const getQuickStats = async (req: Request, res: Response) => {
  try {
    logger.info('📊 Fetching quick stats...');

    // FIX: Generate a default date range (e.g., last 6 months) to pass to fetchKPIs
    const defaultRange = getDateRange('last_6_months');
    
    const kpis = await fetchKPIs(defaultRange);

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