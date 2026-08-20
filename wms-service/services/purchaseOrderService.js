const prisma = require('../config/prisma');

class PurchaseOrderService {
  generateCode() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PO-${dateStr}-${rand}`;
  }

  async getAll({ warehouseId, supplierId, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (warehouseId) where.warehouse_id = warehouseId;
    if (supplierId) where.supplier_id = supplierId;
    if (status) where.status = status;

    const [total, data] = await Promise.all([
      prisma.purchase_orders.count({ where }),
      prisma.purchase_orders.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          items: true,
          _count: { select: { receipt_notes: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data };
  }

  async getById(id) {
    const po = await prisma.purchase_orders.findUnique({
      where: { id },
      include: {
        items: true,
        receipt_notes: {
          include: { items: true },
        },
      },
    });

    if (!po) {
      const err = new Error('Không tìm thấy đơn đặt hàng NCC (PO)');
      err.statusCode = 404;
      throw err;
    }

    return po;
  }

  async create(data, userId) {
    const { supplier_id, supplier_name, warehouse_id, expected_date, notes, items } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      const err = new Error('Danh sách mặt hàng không được để trống');
      err.statusCode = 400;
      throw err;
    }

    let totalAmount = 0;
    const poItemsData = items.map((it) => {
      const lineTotal = Number(it.ordered_qty) * Number(it.unit_cost);
      totalAmount += lineTotal;
      return {
        variant_id: it.variant_id,
        sku: it.sku || null,
        product_name: it.product_name || null,
        color_name: it.color_name || null,
        size_label: it.size_label || null,
        ordered_qty: parseInt(it.ordered_qty),
        unit_cost: it.unit_cost,
        total_cost: lineTotal,
      };
    });

    const code = this.generateCode();

    return prisma.purchase_orders.create({
      data: {
        code,
        supplier_id,
        supplier_name,
        warehouse_id,
        status: 'draft',
        total_amount: totalAmount,
        expected_date: expected_date ? new Date(expected_date) : null,
        notes,
        created_by: userId || null,
        items: {
          create: poItemsData,
        },
      },
      include: { items: true },
    });
  }

  async approve(id, userId) {
    const po = await this.getById(id);

    if (po.status !== 'draft') {
      const err = new Error(`Không thể duyệt PO ở trạng thái "${po.status}"`);
      err.statusCode = 400;
      throw err;
    }

    return prisma.purchase_orders.update({
      where: { id },
      data: {
        status: 'approved',
        approved_by: userId || null,
        updated_at: new Date(),
      },
    });
  }

  async cancel(id, reason) {
    const po = await this.getById(id);

    if (po.status === 'completed') {
      const err = new Error('Không thể hủy đơn PO đã hoàn tất nhận hàng');
      err.statusCode = 400;
      throw err;
    }

    return prisma.purchase_orders.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: po.notes ? `${po.notes} | Hủy: ${reason}` : `Hủy: ${reason}`,
        updated_at: new Date(),
      },
    });
  }
}

module.exports = new PurchaseOrderService();
