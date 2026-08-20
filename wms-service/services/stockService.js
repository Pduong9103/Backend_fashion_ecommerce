const prisma = require('../config/prisma');

class StockService {
  async getStocks({ warehouseId, supplierId, search, isLowStock, isOutOfStock, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (warehouseId) {
      where.warehouse_id = warehouseId;
    }

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { bin_location: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isOutOfStock === 'true' || isOutOfStock === true) {
      where.available_qty = { lte: 0 };
    } else if (isLowStock === 'true' || isLowStock === true) {
      where.available_qty = { gt: 0, lte: 5 };
    }

    // Lọc theo Nhà phân phối / Nhà cung cấp (supplier_id)
    if (supplierId) {
      try {
        const cleanSupplierId = String(supplierId).trim();
        const supplierVariants = await prisma.$queryRawUnsafe(`
          SELECT pv.id as variant_id
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
          WHERE p.supplier_id::text = '${cleanSupplierId}'
        `);
        const sVarIds = (supplierVariants || []).map((sv) => sv.variant_id);
        if (sVarIds.length > 0) {
          where.variant_id = { in: sVarIds };
        } else {
          where.variant_id = { in: ['00000000-0000-0000-0000-000000000000'] };
        }
      } catch (err) {
        console.error('Error filtering stocks by supplierId:', err);
      }
    }

    const [total, stocks] = await Promise.all([
      prisma.inventory_stocks.count({ where }),
      prisma.inventory_stocks.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          warehouse: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: [{ updated_at: 'desc' }],
      }),
    ]);

    // Lấy thông tin sizes và tên sản phẩm từ bảng product_variants
    const variantIds = stocks.map((s) => s.variant_id);
    let variantDetailsMap = new Map();
    if (variantIds.length > 0) {
      try {
        const quotedIds = variantIds.map((id) => `'${id}'`).join(',');
        const variantDetails = await prisma.$queryRawUnsafe(`
          SELECT pv.id as variant_id, pv.color_name, pv.sizes, p.name as product_name, p.supplier_id, s.name as supplier_name
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          WHERE pv.id::text IN (${quotedIds})
        `);
        for (const vd of variantDetails) {
          variantDetailsMap.set(vd.variant_id, vd);
        }
      } catch (e) {
        console.error('Error fetching variant details:', e.message);
      }
    }

    // Gắn thêm cờ cảnh báo & sizes
    const dataWithAlerts = stocks.map((s) => {
      const vd = variantDetailsMap.get(s.variant_id);
      let parsedSizes = [];
      if (vd && vd.sizes) {
        if (Array.isArray(vd.sizes)) {
          parsedSizes = vd.sizes;
        } else if (typeof vd.sizes === 'string') {
          try {
            parsedSizes = JSON.parse(vd.sizes);
          } catch (e) {
            parsedSizes = [vd.sizes];
          }
        }
      }

      return {
        ...s,
        product_name: vd?.product_name || s.sku?.split('-')[0] || 'Sản phẩm thời trang',
        color_name: vd?.color_name || (s.sku?.split('-')[3] || ''),
        supplier_id: vd?.supplier_id || null,
        supplier_name: vd?.supplier_name || null,
        sizes: parsedSizes,
        is_out_of_stock: s.available_qty <= 0,
        is_low_stock: s.available_qty > 0 && s.available_qty <= s.min_alert_qty,
        is_overstock: s.max_alert_qty ? s.on_hand_qty >= s.max_alert_qty : false,
      };
    });

    return { total, page: parseInt(page), limit: parseInt(limit), data: dataWithAlerts };
  }

  async getStockByVariant(variantId) {
    const stocks = await prisma.inventory_stocks.findMany({
      where: { variant_id: variantId },
      include: {
        warehouse: true,
      },
    });

    const totalOnHand = stocks.reduce((sum, s) => sum + s.on_hand_qty, 0);
    const totalAllocated = stocks.reduce((sum, s) => sum + s.allocated_qty, 0);
    const totalAvailable = stocks.reduce((sum, s) => sum + s.available_qty, 0);

    return {
      variant_id: variantId,
      total_on_hand: totalOnHand,
      total_allocated: totalAllocated,
      total_available: totalAvailable,
      warehouses: stocks,
    };
  }

  async updateStockConfig(stockId, { min_alert_qty, max_alert_qty, bin_location }) {
    const data = {};
    if (min_alert_qty !== undefined) data.min_alert_qty = parseInt(min_alert_qty);
    if (max_alert_qty !== undefined) data.max_alert_qty = max_alert_qty ? parseInt(max_alert_qty) : null;
    if (bin_location !== undefined) data.bin_location = bin_location;
    data.updated_at = new Date();

    return prisma.inventory_stocks.update({
      where: { id: stockId },
      data,
    });
  }

  async getTransactions({ warehouseId, variantId, transType, refType, fromDate, toDate, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (warehouseId) where.warehouse_id = warehouseId;
    if (variantId) where.variant_id = variantId;
    if (transType) where.trans_type = transType;
    if (refType) where.ref_type = refType;

    if (fromDate || toDate) {
      where.created_at = {};
      if (fromDate) where.created_at.gte = new Date(fromDate);
      if (toDate) where.created_at.lte = new Date(toDate);
    }

    const [total, data] = await Promise.all([
      prisma.inventory_transactions.count({ where }),
      prisma.inventory_transactions.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data };
  }
}

module.exports = new StockService();
