const prisma = require('../config/prisma');

/**
 * ĐỘNG CƠ XỬ LÝ TỒN KHO 3 LỚP VÀ SỔ KHO BẤT BIẾN (INVENTORY STATE ENGINE)
 * Đảm bảo tính toàn vẹn dữ liệu ACID và lưu trữ nhật ký audit log.
 */

class InventoryEngine {
  /**
   * Lấy hoặc khởi tạo bản ghi tồn kho cho (warehouse_id, variant_id)
   */
  async getOrCreateStock(tx, warehouseId, variantId, sku = null) {
    let stock = await tx.inventory_stocks.findUnique({
      where: {
        warehouse_id_variant_id: {
          warehouse_id: warehouseId,
          variant_id: variantId,
        },
      },
    });

    if (!stock) {
      stock = await tx.inventory_stocks.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || null,
          on_hand_qty: 0,
          allocated_qty: 0,
          available_qty: 0,
          min_alert_qty: 5,
        },
      });
    }

    return stock;
  }

  /**
   * 1. KHÓA TỒN CHO ĐƠN HÀNG (STOCK ALLOCATION)
   * Tác động: +allocated_qty, -available_qty (on_hand_qty giữ nguyên)
   */
  async allocateStock({ warehouseId, variantId, sku, qty, refType = 'orders', refId, refCode, userId, notes }, externalTx = null) {
    const execute = async (tx) => {
      const stock = await this.getOrCreateStock(tx, warehouseId, variantId, sku);

      if (stock.available_qty < qty) {
        const err = new Error(`Không đủ hàng khả dụng (Khả dụng: ${stock.available_qty}, Yêu cầu: ${qty})`);
        err.statusCode = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      const updated = await tx.inventory_stocks.update({
        where: { id: stock.id },
        data: {
          allocated_qty: { increment: qty },
          available_qty: { decrement: qty },
          sku: sku || stock.sku,
          updated_at: new Date(),
        },
      });

      // Ghi sổ kho
      await tx.inventory_transactions.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || stock.sku,
          trans_type: 'ORDER_ALLOCATE',
          change_on_hand: 0,
          change_allocated: qty,
          change_available: -qty,
          balance_on_hand: updated.on_hand_qty,
          balance_allocated: updated.allocated_qty,
          balance_available: updated.available_qty,
          ref_type: refType,
          ref_id: refId,
          ref_code: refCode,
          notes: notes || 'Khóa tồn kho cho đơn hàng',
          created_by: userId || null,
        },
      });

      return updated;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * 2. MỞ KHÓA TỒN KHI HỦY ĐƠN HÀNG (STOCK RELEASE)
   * Tác động: -allocated_qty, +available_qty (on_hand_qty giữ nguyên)
   */
  async releaseStock({ warehouseId, variantId, sku, qty, refType = 'orders', refId, refCode, userId, notes }, externalTx = null) {
    const execute = async (tx) => {
      const stock = await this.getOrCreateStock(tx, warehouseId, variantId, sku);
      const actualReleaseQty = Math.min(stock.allocated_qty, qty);

      const updated = await tx.inventory_stocks.update({
        where: { id: stock.id },
        data: {
          allocated_qty: { decrement: actualReleaseQty },
          available_qty: { increment: actualReleaseQty },
          updated_at: new Date(),
        },
      });

      await tx.inventory_transactions.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || stock.sku,
          trans_type: 'ORDER_RELEASE',
          change_on_hand: 0,
          change_allocated: -actualReleaseQty,
          change_available: actualReleaseQty,
          balance_on_hand: updated.on_hand_qty,
          balance_allocated: updated.allocated_qty,
          balance_available: updated.available_qty,
          ref_type: refType,
          ref_id: refId,
          ref_code: refCode,
          notes: notes || 'Hủy đơn hàng - Phục hồi tồn bán khả dụng',
          created_by: userId || null,
        },
      });

      return updated;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * 3. XUẤT KHO THỰC TẾ GIAO ĐƠN HÀNG (STOCK FULFILLMENT)
   * Tác động: -on_hand_qty, -allocated_qty (available_qty không đổi vì đã trừ lúc allocate)
   */
  async fulfillStock({ warehouseId, variantId, sku, qty, refType = 'goods_issue', refId, refCode, userId, notes }, externalTx = null) {
    const execute = async (tx) => {
      const stock = await this.getOrCreateStock(tx, warehouseId, variantId, sku);

      const updated = await tx.inventory_stocks.update({
        where: { id: stock.id },
        data: {
          on_hand_qty: { decrement: qty },
          allocated_qty: { decrement: Math.min(stock.allocated_qty, qty) },
          updated_at: new Date(),
        },
      });

      await tx.inventory_transactions.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || stock.sku,
          trans_type: 'ORDER_FULFILLMENT',
          change_on_hand: -qty,
          change_allocated: -Math.min(stock.allocated_qty, qty),
          change_available: 0,
          balance_on_hand: updated.on_hand_qty,
          balance_allocated: updated.allocated_qty,
          balance_available: updated.available_qty,
          ref_type: refType,
          ref_id: refId,
          ref_code: refCode,
          notes: notes || 'Xuất kho bàn giao vận chuyển',
          created_by: userId || null,
        },
      });

      return updated;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * 4. NHẬP KHO (GOODS RECEIPT) - TỪ NCC HOẶC HÀNG HOÀN TRẢ
   * Tác động: +on_hand_qty, +available_qty
   */
  async receiveStock({ warehouseId, variantId, sku, qty, transType = 'PURCHASE_RECEIPT', refType = 'goods_receipt', refId, refCode, userId, notes }, externalTx = null) {
    const execute = async (tx) => {
      const stock = await this.getOrCreateStock(tx, warehouseId, variantId, sku);

      const updated = await tx.inventory_stocks.update({
        where: { id: stock.id },
        data: {
          on_hand_qty: { increment: qty },
          available_qty: { increment: qty },
          sku: sku || stock.sku,
          updated_at: new Date(),
        },
      });

      await tx.inventory_transactions.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || stock.sku,
          trans_type: transType,
          change_on_hand: qty,
          change_allocated: 0,
          change_available: qty,
          balance_on_hand: updated.on_hand_qty,
          balance_allocated: updated.allocated_qty,
          balance_available: updated.available_qty,
          ref_type: refType,
          ref_id: refId,
          ref_code: refCode,
          notes: notes || 'Nhập hàng vào kho',
          created_by: userId || null,
        },
      });

      return updated;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * 5. ĐIỀU CHỈNH / CÂN BẰNG TỒN SAU KIỂM KÊ (STOCK ADJUSTMENT)
   * Tác động: Cập nhật on_hand_qty = actualQty, tính lại available_qty
   */
  async adjustStock({ warehouseId, variantId, sku, actualQty, reason, refId, refCode, userId }, externalTx = null) {
    const execute = async (tx) => {
      const stock = await this.getOrCreateStock(tx, warehouseId, variantId, sku);
      const diffOnHand = actualQty - stock.on_hand_qty;
      const newAvailable = Math.max(0, actualQty - stock.allocated_qty);
      const diffAvailable = newAvailable - stock.available_qty;

      const updated = await tx.inventory_stocks.update({
        where: { id: stock.id },
        data: {
          on_hand_qty: actualQty,
          available_qty: newAvailable,
          updated_at: new Date(),
        },
      });

      await tx.inventory_transactions.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || stock.sku,
          trans_type: 'STOCKTAKE_ADJUST',
          change_on_hand: diffOnHand,
          change_allocated: 0,
          change_available: diffAvailable,
          balance_on_hand: updated.on_hand_qty,
          balance_allocated: updated.allocated_qty,
          balance_available: updated.available_qty,
          ref_type: 'stocktakes',
          ref_id: refId,
          ref_code: refCode,
          notes: reason ? `Cân bằng kiểm kê: ${reason}` : 'Cân bằng tồn kho sau kiểm kê',
          created_by: userId || null,
        },
      });

      return updated;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * 6. XUẤT HỦY / TỔN THẤT (WRITE-OFF DAMAGED GOODS)
   * Tác động: -on_hand_qty, -available_qty
   */
  async writeOffStock({ warehouseId, variantId, sku, qty, reason, refId, refCode, userId }, externalTx = null) {
    const execute = async (tx) => {
      const stock = await this.getOrCreateStock(tx, warehouseId, variantId, sku);

      if (stock.available_qty < qty) {
        const err = new Error(`Không đủ số lượng hàng khả dụng để xuất hủy (Khả dụng: ${stock.available_qty})`);
        err.statusCode = 400;
        throw err;
      }

      const updated = await tx.inventory_stocks.update({
        where: { id: stock.id },
        data: {
          on_hand_qty: { decrement: qty },
          available_qty: { decrement: qty },
          updated_at: new Date(),
        },
      });

      await tx.inventory_transactions.create({
        data: {
          warehouse_id: warehouseId,
          variant_id: variantId,
          sku: sku || stock.sku,
          trans_type: 'WRITE_OFF',
          change_on_hand: -qty,
          change_allocated: 0,
          change_available: -qty,
          balance_on_hand: updated.on_hand_qty,
          balance_allocated: updated.allocated_qty,
          balance_available: updated.available_qty,
          ref_type: 'goods_issue',
          ref_id: refId,
          ref_code: refCode,
          notes: reason ? `Xuất hủy hàng lỗi/hao hụt: ${reason}` : 'Xuất hủy hàng hư hỏng',
          created_by: userId || null,
        },
      });

      return updated;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }
}

module.exports = new InventoryEngine();
