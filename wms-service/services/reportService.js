const prisma = require('../config/prisma');

class ReportService {
  async getDashboardSummary() {
    const [warehouseCount, stocks, lowStockCount, outOfStockCount, recentTransactions] = await Promise.all([
      prisma.warehouses.count({ where: { is_active: true } }),
      prisma.inventory_stocks.findMany(),
      prisma.inventory_stocks.count({
        where: {
          available_qty: { gt: 0, lte: 5 },
        },
      }),
      prisma.inventory_stocks.count({
        where: { available_qty: { lte: 0 } },
      }),
      prisma.inventory_transactions.findMany({
        take: 10,
        orderBy: [{ created_at: 'desc' }],
        include: {
          warehouse: { select: { code: true, name: true } },
        },
      }),
    ]);

    const totalOnHand = stocks.reduce((sum, s) => sum + s.on_hand_qty, 0);
    const totalAllocated = stocks.reduce((sum, s) => sum + s.allocated_qty, 0);
    const totalAvailable = stocks.reduce((sum, s) => sum + s.available_qty, 0);

    // Tính toán tài chính thực tế (Doanh thu bán ra & Giá vốn COGS từ các phiếu xuất hàng)
    const shippedIssues = await prisma.goods_issue_notes.findMany({
      where: { status: 'shipped' },
      include: { items: true },
    });

    let totalRevenue = 0;
    let totalCogs = 0;

    for (const issue of shippedIssues) {
      for (const item of issue.items) {
        const qty = item.quantity || 0;
        const sellPrice = Number(item.unit_price) || 0;
        // Ước tính giá vốn từ 50-60% giá bán hoặc 150k nếu không có giá nhập
        const costPrice = Math.round(sellPrice * 0.55) || 150000;
        totalRevenue += qty * sellPrice;
        totalCogs += qty * costPrice;
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const profitMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0';

    return {
      active_warehouses: warehouseCount,
      total_variants_tracked: stocks.length,
      total_on_hand_stock: totalOnHand,
      total_allocated_stock: totalAllocated,
      total_available_stock: totalAvailable,
      out_of_stock_variants: outOfStockCount,
      low_stock_variants: lowStockCount,
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      profit_margin_pct: Number(profitMarginPct),
      recent_stock_ledger: recentTransactions,
    };
  }

  async getStockMovementReport({ warehouseId, fromDate, toDate }) {
    const where = {};
    if (warehouseId) where.warehouse_id = warehouseId;

    if (fromDate || toDate) {
      where.created_at = {};
      if (fromDate) where.created_at.gte = new Date(fromDate);
      if (toDate) where.created_at.lte = new Date(toDate);
    }

    const transactions = await prisma.inventory_transactions.findMany({
      where,
    });

    let totalImported = 0;
    let totalExported = 0;
    let totalAdjusted = 0;
    let totalAllocated = 0;

    for (const t of transactions) {
      if (t.trans_type === 'PURCHASE_RECEIPT' || t.trans_type === 'CUSTOMER_RETURN' || t.trans_type === 'TRANSFER_IN') {
        totalImported += t.change_on_hand;
      } else if (t.trans_type === 'ORDER_FULFILLMENT' || t.trans_type === 'PURCHASE_RETURN' || t.trans_type === 'TRANSFER_OUT' || t.trans_type === 'WRITE_OFF') {
        totalExported += Math.abs(t.change_on_hand);
      } else if (t.trans_type === 'STOCKTAKE_ADJUST') {
        totalAdjusted += t.change_on_hand;
      } else if (t.trans_type === 'ORDER_ALLOCATE') {
        totalAllocated += t.change_allocated;
      }
    }

    return {
      period: { fromDate: fromDate || null, toDate: toDate || null },
      total_imported: totalImported,
      total_exported: totalExported,
      total_adjusted: totalAdjusted,
      total_allocated: totalAllocated,
      transaction_count: transactions.length,
    };
  }
}

module.exports = new ReportService();
