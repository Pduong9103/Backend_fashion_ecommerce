const prisma = require('../config/prisma');
const inventoryEngine = require('./inventoryEngine');

class GoodsIssueService {
  generateCode() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `GIN-${dateStr}-${rand}`;
  }

  async getAll({ warehouseId, issueType, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (warehouseId) where.warehouse_id = warehouseId;
    if (issueType) where.issue_type = issueType;
    if (status) where.status = status;

    const [total, data] = await Promise.all([
      prisma.goods_issue_notes.count({ where }),
      prisma.goods_issue_notes.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          items: true,
          warehouse: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data };
  }

  async getById(id) {
    const gin = await prisma.goods_issue_notes.findUnique({
      where: { id },
      include: {
        items: true,
        warehouse: true,
      },
    });

    if (!gin) {
      const err = new Error('Không tìm thấy phiếu xuất kho (GIN)');
      err.statusCode = 404;
      throw err;
    }

    return gin;
  }

  async create(data, userId) {
    const {
      order_id,
      order_code,
      warehouse_id,
      issue_type = 'order_fulfillment',
      status = 'shipped',
      carrier_code,
      tracking_number,
      notes,
      items,
    } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      const err = new Error('Danh sách mặt hàng xuất kho không được để trống');
      err.statusCode = 400;
      throw err;
    }

    const code = this.generateCode();
    let totalQty = 0;

    const issueItemsData = items.map((it) => {
      const qty = parseInt(it.quantity);
      totalQty += qty;
      return {
        variant_id: it.variant_id,
        sku: it.sku || null,
        product_name: it.product_name || null,
        color_name: it.color_name || null,
        size_label: it.size_label || null,
        quantity: qty,
        unit_price: Number(it.unit_price || 0),
      };
    });

    return prisma.$transaction(async (tx) => {
      const isAutoShipped = status === 'shipped';
      // 1. Tạo phiếu xuất kho
      const gin = await tx.goods_issue_notes.create({
        data: {
          code,
          order_id: order_id || null,
          order_code: order_code || null,
          warehouse_id,
          issue_type,
          status: status || 'draft',
          total_qty: totalQty,
          carrier_code,
          tracking_number,
          notes,
          created_by: userId || null,
          shipped_by: isAutoShipped ? userId || null : null,
          shipped_at: isAutoShipped ? new Date() : null,
          items: {
            create: issueItemsData,
          },
        },
        include: { items: true },
      });

      // 2. Nếu status là 'shipped' -> Trừ tồn kho ngay
      if (isAutoShipped) {
        for (const item of issueItemsData) {
          if (issue_type === 'order_fulfillment') {
            await inventoryEngine.fulfillStock(
              {
                warehouseId: warehouse_id,
                variantId: item.variant_id,
                sku: item.sku,
                qty: item.quantity,
                refType: 'goods_issue',
                refId: gin.id,
                refCode: gin.code,
                userId,
                notes: `Xuất kho đơn hàng ${order_code || gin.code}`,
              },
              tx
            );
          } else if (issue_type === 'damaged_write_off') {
            await inventoryEngine.writeOffStock(
              {
                warehouseId: warehouse_id,
                variantId: item.variant_id,
                sku: item.sku,
                qty: item.quantity,
                reason: notes || 'Xuất hủy hàng lỗi mốt/hư hỏng',
                refId: gin.id,
                refCode: gin.code,
                userId,
              },
              tx
            );
          }
        }
      }

      return gin;
    });
  }

  async updateStatus(id, newStatus, userId) {
    const gin = await this.getById(id);

    if (gin.status === 'shipped') {
      const err = new Error('Phiếu xuất đã giao hàng, không thể thay đổi trạng thái');
      err.statusCode = 400;
      throw err;
    }

    if (gin.status === 'cancelled') {
      const err = new Error('Phiếu xuất đã bị hủy');
      err.statusCode = 400;
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      if (newStatus === 'shipped') {
        // Trừ tồn kho khi xuất hàng
        for (const item of gin.items) {
          if (gin.issue_type === 'order_fulfillment') {
            await inventoryEngine.fulfillStock(
              {
                warehouseId: gin.warehouse_id,
                variantId: item.variant_id,
                sku: item.sku,
                qty: item.quantity,
                refType: 'goods_issue',
                refId: gin.id,
                refCode: gin.code,
                userId,
                notes: `Xuất kho bàn giao vận chuyển đơn hàng ${gin.order_code || gin.code}`,
              },
              tx
            );
          } else if (gin.issue_type === 'damaged_write_off') {
            await inventoryEngine.writeOffStock(
              {
                warehouseId: gin.warehouse_id,
                variantId: item.variant_id,
                sku: item.sku,
                qty: item.quantity,
                reason: gin.notes || 'Xuất hủy hàng lỗi mốt/hư hỏng',
                refId: gin.id,
                refCode: gin.code,
                userId,
              },
              tx
            );
          }
        }

        return tx.goods_issue_notes.update({
          where: { id },
          data: {
            status: 'shipped',
            shipped_by: userId || null,
            shipped_at: new Date(),
          },
          include: { items: true, warehouse: true },
        });
      }

      // Cập nhật trạng thái trung gian (picking, packed, cancelled, ...)
      return tx.goods_issue_notes.update({
        where: { id },
        data: { status: newStatus },
        include: { items: true, warehouse: true },
      });
    });
  }
}

module.exports = new GoodsIssueService();
