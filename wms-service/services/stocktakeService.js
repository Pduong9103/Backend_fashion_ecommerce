const prisma = require('../config/prisma');
const inventoryEngine = require('./inventoryEngine');

class StocktakeService {
  generateCode() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `STK-${dateStr}-${rand}`;
  }

  async getAll({ warehouseId, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (warehouseId) where.warehouse_id = warehouseId;
    if (status) where.status = status;

    const [total, data] = await Promise.all([
      prisma.stocktakes.count({ where }),
      prisma.stocktakes.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data };
  }

  async getById(id) {
    const stocktake = await prisma.stocktakes.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: true,
      },
    });

    if (!stocktake) {
      const err = new Error('Không tìm thấy đợt kiểm kê kho (Stocktake)');
      err.statusCode = 404;
      throw err;
    }

    return stocktake;
  }

  async create(data, userId) {
    const { warehouse_id, notes } = data;

    // Snapshot toàn bộ tồn kho hiện tại của kho này
    const currentStocks = await prisma.inventory_stocks.findMany({
      where: { warehouse_id },
    });

    if (currentStocks.length === 0) {
      const err = new Error('Kho chưa có danh mục sản phẩm nào để kiểm kê');
      err.statusCode = 400;
      throw err;
    }

    const code = this.generateCode();
    let totalSystemQty = 0;

    const stocktakeItemsData = currentStocks.map((s) => {
      totalSystemQty += s.on_hand_qty;
      return {
        variant_id: s.variant_id,
        sku: s.sku || null,
        system_qty: s.on_hand_qty,
        actual_qty: s.on_hand_qty, // Mặc định khởi tạo bằng tồn hệ thống
        diff_qty: 0,
        reason: null,
      };
    });

    return prisma.stocktakes.create({
      data: {
        code,
        warehouse_id,
        status: 'in_progress',
        total_system_qty: totalSystemQty,
        total_actual_qty: totalSystemQty,
        total_diff_qty: 0,
        notes,
        created_by: userId || null,
        items: {
          create: stocktakeItemsData,
        },
      },
      include: { items: true },
    });
  }

  async updateCountedItems(stocktakeId, items) {
    const stocktake = await this.getById(stocktakeId);

    if (stocktake.status !== 'in_progress') {
      const err = new Error('Chỉ có thể cập nhật số lượng khi đợt kiểm kê đang diễn ra (in_progress)');
      err.statusCode = 400;
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      for (const item of items) {
        const actual = parseInt(item.actual_qty);
        const existingItem = stocktake.items.find((i) => i.id === item.id || i.variant_id === item.variant_id);

        if (existingItem) {
          const diff = actual - existingItem.system_qty;
          await tx.stocktake_items.update({
            where: { id: existingItem.id },
            data: {
              actual_qty: actual,
              diff_qty: diff,
              reason: item.reason || existingItem.reason,
            },
          });
        }
      }

      // Cập nhật tổng trên header phiếu kiểm kê
      const updatedItems = await tx.stocktake_items.findMany({ where: { stocktake_id: stocktakeId } });
      const totalActual = updatedItems.reduce((sum, i) => sum + i.actual_qty, 0);
      const totalDiff = updatedItems.reduce((sum, i) => sum + i.diff_qty, 0);

      return tx.stocktakes.update({
        where: { id: stocktakeId },
        data: {
          total_actual_qty: totalActual,
          total_diff_qty: totalDiff,
        },
        include: { items: true },
      });
    });
  }

  async completeAndAdjust(stocktakeId, userId) {
    const stocktake = await this.getById(stocktakeId);

    if (stocktake.status !== 'in_progress') {
      const err = new Error(`Không thể cân bằng tồn cho đợt kiểm kê ở trạng thái "${stocktake.status}"`);
      err.statusCode = 400;
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      // 1. Áp dụng cân bằng tồn kho cho từng mã có chênh lệch diff_qty != 0
      for (const item of stocktake.items) {
        if (item.diff_qty !== 0) {
          await inventoryEngine.adjustStock(
            {
              warehouseId: stocktake.warehouse_id,
              variantId: item.variant_id,
              sku: item.sku,
              actualQty: item.actual_qty,
              reason: item.reason,
              refId: stocktake.id,
              refCode: stocktake.code,
              userId,
            },
            tx
          );
        }
      }

      // 2. Chuyển trạng thái đợt kiểm kê thành completed
      return tx.stocktakes.update({
        where: { id: stocktakeId },
        data: {
          status: 'completed',
          approved_by: userId || null,
          completed_at: new Date(),
        },
        include: { items: true },
      });
    });
  }
}

module.exports = new StocktakeService();
