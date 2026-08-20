const prisma = require('../config/prisma');

class WarehouseService {
  async getAllWarehouses({ search, isActive, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (isActive !== undefined && isActive !== '') {
      where.is_active = isActive === 'true' || isActive === true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, warehouses] = await Promise.all([
      prisma.warehouses.count({ where }),
      prisma.warehouses.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
        include: {
          _count: {
            select: { inventory_stocks: true },
          },
        },
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data: warehouses };
  }

  async getWarehouseById(id) {
    const warehouse = await prisma.warehouses.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            inventory_stocks: true,
            goods_receipt_notes: true,
            goods_issue_notes: true,
          },
        },
      },
    });

    if (!warehouse) {
      const err = new Error('Không tìm thấy nhà kho');
      err.statusCode = 404;
      throw err;
    }

    return warehouse;
  }

  async createWarehouse(data) {
    const { code, name, address, phone, is_default } = data;

    // Check duplicate code
    const existing = await prisma.warehouses.findUnique({ where: { code } });
    if (existing) {
      const err = new Error(`Mã kho "${code}" đã tồn tại`);
      err.statusCode = 400;
      throw err;
    }

    // Nếu đặt là kho mặc định, unset các kho khác
    if (is_default) {
      await prisma.warehouses.updateMany({
        where: { is_default: true },
        data: { is_default: false },
      });
    }

    return prisma.warehouses.create({
      data: {
        code,
        name,
        address,
        phone,
        is_default: is_default || false,
      },
    });
  }

  async updateWarehouse(id, data) {
    const { name, address, phone, is_active, is_default } = data;

    if (is_default) {
      await prisma.warehouses.updateMany({
        where: { id: { not: id }, is_default: true },
        data: { is_default: false },
      });
    }

    return prisma.warehouses.update({
      where: { id },
      data: {
        name,
        address,
        phone,
        is_active,
        is_default,
        updated_at: new Date(),
      },
    });
  }
}

module.exports = new WarehouseService();
