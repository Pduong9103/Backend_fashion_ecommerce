const prisma = require('../config/prisma');
const inventoryEngine = require('./inventoryEngine');

class GoodsReceiptService {
  generateCode() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `GRN-${dateStr}-${rand}`;
  }

  async getAll({ warehouseId, receiptType, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (warehouseId) where.warehouse_id = warehouseId;
    if (receiptType) where.receipt_type = receiptType;
    if (status) where.status = status;

    const [total, data] = await Promise.all([
      prisma.goods_receipt_notes.count({ where }),
      prisma.goods_receipt_notes.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          items: true,
          warehouse: { select: { id: true, code: true, name: true } },
          purchase_order: { select: { id: true, code: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data };
  }

  async getById(id) {
    const grn = await prisma.goods_receipt_notes.findUnique({
      where: { id },
      include: {
        items: true,
        warehouse: true,
        purchase_order: true,
      },
    });

    if (!grn) {
      const err = new Error('Không tìm thấy phiếu nhập kho (GRN)');
      err.statusCode = 404;
      throw err;
    }

    return grn;
  }

  async create(data, userId) {
    const {
      po_id,
      warehouse_id,
      supplier_id,
      supplier_name,
      receipt_type = 'po_import',
      status = 'completed',
      notes,
      items,
    } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      const err = new Error('Danh sách mặt hàng nhập kho không được để trống');
      err.statusCode = 400;
      throw err;
    }

    const code = this.generateCode();
    let totalQty = 0;
    let totalValue = 0;

    const receiptItemsData = items.map((it) => {
      const qty = parseInt(it.quantity);
      const unitCost = Number(it.unit_cost || 0);
      const lineTotal = Number(it.total_cost) || qty * unitCost;
      totalQty += qty;
      totalValue += lineTotal;

      return {
        variant_id: it.variant_id,
        sku: it.sku || null,
        product_name: it.product_name || null,
        color_name: it.color_name || null,
        size_label: it.size_label || null,
        quantity: qty,
        unit_cost: unitCost,
        total_cost: lineTotal,
        batch_number: it.batch_number || null,
      };
    });

    return prisma.$transaction(async (tx) => {
      // 1. Tạo phiếu nhập
      const isAutoComplete = status === 'completed';
      const grn = await tx.goods_receipt_notes.create({
        data: {
          code,
          po_id: po_id || null,
          warehouse_id,
          supplier_id: supplier_id || null,
          supplier_name: supplier_name || null,
          receipt_type,
          status: status || 'draft',
          total_qty: totalQty,
          total_value: totalValue,
          notes,
          created_by: userId || null,
          confirmed_by: isAutoComplete ? userId || null : null,
          received_at: isAutoComplete ? new Date() : null,
          items: {
            create: receiptItemsData,
          },
        },
        include: { items: true },
      });

      // 2. Nếu status là 'completed' -> Tăng tồn ngay lập tức
      if (isAutoComplete) {
        const transType = receipt_type === 'return_import' ? 'CUSTOMER_RETURN' : 'PURCHASE_RECEIPT';
        for (const item of receiptItemsData) {
          await inventoryEngine.receiveStock(
            {
              warehouseId: warehouse_id,
              variantId: item.variant_id,
              sku: item.sku,
              qty: item.quantity,
              transType,
              refType: 'goods_receipt',
              refId: grn.id,
              refCode: grn.code,
              userId,
              notes: `Nhập kho theo phiếu ${grn.code}`,
            },
            tx
          );
        }

        // 3. Nếu nhập theo PO -> Cập nhật PO
        if (po_id) {
          for (const item of receiptItemsData) {
            await tx.purchase_order_items.updateMany({
              where: { po_id, variant_id: item.variant_id },
              data: { received_qty: { increment: item.quantity } },
            });
          }

          const poItems = await tx.purchase_order_items.findMany({ where: { po_id } });
          const allReceived = poItems.every((it) => it.received_qty >= it.ordered_qty);

          await tx.purchase_orders.update({
            where: { id: po_id },
            data: {
              status: allReceived ? 'completed' : 'receiving',
              updated_at: new Date(),
            },
          });
        }
      }

      return grn;
    });
  }

  async updateStatus(id, newStatus, userId) {
    const grn = await this.getById(id);

    if (grn.status === 'completed') {
      const err = new Error('Phiếu nhập đã hoàn tất, không thể thay đổi trạng thái');
      err.statusCode = 400;
      throw err;
    }

    if (grn.status === 'cancelled') {
      const err = new Error('Phiếu nhập đã bị hủy');
      err.statusCode = 400;
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      if (newStatus === 'completed') {
        // Tăng tồn kho khi chuyển sang completed
        const transType = grn.receipt_type === 'return_import' ? 'CUSTOMER_RETURN' : 'PURCHASE_RECEIPT';
        for (const item of grn.items) {
          await inventoryEngine.receiveStock(
            {
              warehouseId: grn.warehouse_id,
              variantId: item.variant_id,
              sku: item.sku,
              qty: item.quantity,
              transType,
              refType: 'goods_receipt',
              refId: grn.id,
              refCode: grn.code,
              userId,
              notes: `Xác nhận hoàn tất nhập kho theo phiếu ${grn.code}`,
            },
            tx
          );
        }

        return tx.goods_receipt_notes.update({
          where: { id },
          data: {
            status: 'completed',
            confirmed_by: userId || null,
            received_at: new Date(),
          },
          include: { items: true, warehouse: true },
        });
      }

      // Cập nhật trạng thái khác (qc_pending, cancelled, ...)
      return tx.goods_receipt_notes.update({
        where: { id },
        data: { status: newStatus },
        include: { items: true, warehouse: true },
      });
    });
  }
}

module.exports = new GoodsReceiptService();
