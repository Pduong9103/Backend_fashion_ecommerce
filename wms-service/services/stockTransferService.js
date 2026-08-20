const prisma = require('../config/prisma');

class StockTransferService {
  /**
   * Tạo phiếu điều chuyển kho mới
   */
  async createTransfer({ from_warehouse_id, to_warehouse_id, notes, created_by, items = [], status = 'pending' }) {
    if (!from_warehouse_id || !to_warehouse_id) {
      const err = new Error('Vui lòng chọn Kho xuất và Kho nhận');
      err.statusCode = 400;
      throw err;
    }

    if (from_warehouse_id === to_warehouse_id) {
      const err = new Error('Kho xuất và Kho nhận không được trùng nhau');
      err.statusCode = 400;
      throw err;
    }

    if (!items || items.length === 0) {
      const err = new Error('Vui lòng chọn ít nhất 1 mặt hàng để điều chuyển');
      err.statusCode = 400;
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      // 1. Kiểm tra số lượng tồn kho khả dụng tại Kho Xuất
      for (const item of items) {
        const stock = await tx.inventory_stocks.findUnique({
          where: {
            warehouse_id_variant_id: {
              warehouse_id: from_warehouse_id,
              variant_id: item.variant_id,
            },
          },
        });

        const available = stock ? stock.available_qty : 0;
        if (available < item.quantity) {
          const err = new Error(`Hàng SKU [${item.sku || item.variant_id}] tại Kho xuất không đủ (Khả dụng: ${available}, Cần chuyển: ${item.quantity})`);
          err.statusCode = 400;
          throw err;
        }
      }

      // 2. Tạo mã phiếu tự động: TRF-YYYYMMDD-XXX
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countToday = await tx.stock_transfers.count({
        where: {
          code: { startsWith: `TRF-${todayStr}` },
        },
      });
      const code = `TRF-${todayStr}-${String(countToday + 1).padStart(3, '0')}`;

      const totalQty = items.reduce((sum, i) => sum + parseInt(i.quantity || 0), 0);

      // 3. Tạo bản ghi Phiếu Chuyển Kho
      const transfer = await tx.stock_transfers.create({
        data: {
          code,
          from_warehouse_id,
          to_warehouse_id,
          status, // pending, in_transit, completed
          total_qty: totalQty,
          notes: notes || null,
          created_by: created_by || null,
          items: {
            create: items.map((i) => ({
              variant_id: i.variant_id,
              sku: i.sku || null,
              quantity: parseInt(i.quantity),
            })),
          },
        },
        include: {
          from_warehouse: { select: { id: true, code: true, name: true } },
          to_warehouse: { select: { id: true, code: true, name: true } },
          items: true,
        },
      });

      // 4. Nếu trạng thái là in_transit ngay từ đầu: trừ tồn kho xuất (TRANSFER_OUT)
      if (status === 'in_transit') {
        for (const item of items) {
          const stock = await tx.inventory_stocks.findUnique({
            where: {
              warehouse_id_variant_id: {
                warehouse_id: from_warehouse_id,
                variant_id: item.variant_id,
              },
            },
          });

          const updated = await tx.inventory_stocks.update({
            where: { id: stock.id },
            data: {
              on_hand_qty: { decrement: item.quantity },
              available_qty: { decrement: item.quantity },
              updated_at: new Date(),
            },
          });

          await tx.inventory_transactions.create({
            data: {
              warehouse_id: from_warehouse_id,
              variant_id: item.variant_id,
              sku: item.sku || null,
              trans_type: 'TRANSFER_OUT',
              change_on_hand: -item.quantity,
              change_allocated: 0,
              change_available: -item.quantity,
              balance_on_hand: updated.on_hand_qty,
              balance_allocated: updated.allocated_qty,
              balance_available: updated.available_qty,
              ref_type: 'stock_transfers',
              ref_id: transfer.id,
              ref_code: transfer.code,
              notes: `Xuất chuyển sang kho ${transfer.to_warehouse.name}`,
              created_by: created_by || null,
            },
          });
        }
      }

      return transfer;
    });
  }

  /**
   * Danh sách phiếu điều chuyển
   */
  async getTransfers({ fromWarehouseId, toWarehouseId, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (fromWarehouseId) where.from_warehouse_id = fromWarehouseId;
    if (toWarehouseId) where.to_warehouse_id = toWarehouseId;
    if (status) where.status = status;

    const [total, data] = await Promise.all([
      prisma.stock_transfers.count({ where }),
      prisma.stock_transfers.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          from_warehouse: { select: { id: true, code: true, name: true } },
          to_warehouse: { select: { id: true, code: true, name: true } },
          items: true,
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return { total, page: parseInt(page), limit: parseInt(limit), data };
  }

  /**
   * Chi tiết phiếu chuyển kho
   */
  async getTransferById(id) {
    const transfer = await prisma.stock_transfers.findUnique({
      where: { id },
      include: {
        from_warehouse: true,
        to_warehouse: true,
        items: true,
      },
    });

    if (!transfer) {
      const err = new Error('Không tìm thấy phiếu điều chuyển');
      err.statusCode = 404;
      throw err;
    }

    return transfer;
  }

  /**
   * Cập nhật trạng thái phiếu chuyển kho:
   * pending -> in_transit (xuất kho nguồn)
   * in_transit -> completed (nhập kho đích)
   * in_transit -> cancelled (hoàn lại kho nguồn)
   */
  async updateTransferStatus(id, newStatus, userId = null) {
    const transfer = await this.getTransferById(id);

    if (transfer.status === newStatus) return transfer;
    if (transfer.status === 'completed' || transfer.status === 'cancelled') {
      const err = new Error(`Phiếu chuyển kho đã ở trạng thái kết thúc [${transfer.status}], không thể thay đổi`);
      err.statusCode = 400;
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      // 1. Chuyển sang Đang vận chuyển (in_transit): Trừ tồn Kho Xuất
      if (transfer.status === 'pending' && newStatus === 'in_transit') {
        for (const item of transfer.items) {
          const stock = await tx.inventory_stocks.findUnique({
            where: {
              warehouse_id_variant_id: {
                warehouse_id: transfer.from_warehouse_id,
                variant_id: item.variant_id,
              },
            },
          });

          if (!stock || stock.available_qty < item.quantity) {
            const err = new Error(`Hàng SKU [${item.sku}] tại kho nguồn không đủ để xuất chuyển`);
            err.statusCode = 400;
            throw err;
          }

          const updated = await tx.inventory_stocks.update({
            where: { id: stock.id },
            data: {
              on_hand_qty: { decrement: item.quantity },
              available_qty: { decrement: item.quantity },
              updated_at: new Date(),
            },
          });

          await tx.inventory_transactions.create({
            data: {
              warehouse_id: transfer.from_warehouse_id,
              variant_id: item.variant_id,
              sku: item.sku,
              trans_type: 'TRANSFER_OUT',
              change_on_hand: -item.quantity,
              change_allocated: 0,
              change_available: -item.quantity,
              balance_on_hand: updated.on_hand_qty,
              balance_allocated: updated.allocated_qty,
              balance_available: updated.available_qty,
              ref_type: 'stock_transfers',
              ref_id: transfer.id,
              ref_code: transfer.code,
              notes: `Xuất kho điều chuyển sang kho ${transfer.to_warehouse.name}`,
              created_by: userId,
            },
          });
        }
      }

      // 2. Chuyển sang Hoàn Tất (completed): Nhập vào Kho Đích
      if ((transfer.status === 'in_transit' || transfer.status === 'pending') && newStatus === 'completed') {
        // Nếu chuyển thẳng từ pending sang completed mà chưa trừ kho nguồn thì trừ kho nguồn trước
        if (transfer.status === 'pending') {
          for (const item of transfer.items) {
            const stockFrom = await tx.inventory_stocks.findUnique({
              where: {
                warehouse_id_variant_id: {
                  warehouse_id: transfer.from_warehouse_id,
                  variant_id: item.variant_id,
                },
              },
            });

            await tx.inventory_stocks.update({
              where: { id: stockFrom.id },
              data: {
                on_hand_qty: { decrement: item.quantity },
                available_qty: { decrement: item.quantity },
                updated_at: new Date(),
              },
            });
          }
        }

        // Nhập vào kho đích
        for (const item of transfer.items) {
          let stockTo = await tx.inventory_stocks.findUnique({
            where: {
              warehouse_id_variant_id: {
                warehouse_id: transfer.to_warehouse_id,
                variant_id: item.variant_id,
              },
            },
          });

          if (!stockTo) {
            stockTo = await tx.inventory_stocks.create({
              data: {
                warehouse_id: transfer.to_warehouse_id,
                variant_id: item.variant_id,
                sku: item.sku,
                on_hand_qty: 0,
                available_qty: 0,
                allocated_qty: 0,
                min_alert_qty: 5,
              },
            });
          }

          const updatedTo = await tx.inventory_stocks.update({
            where: { id: stockTo.id },
            data: {
              on_hand_qty: { increment: item.quantity },
              available_qty: { increment: item.quantity },
              sku: item.sku || stockTo.sku,
              updated_at: new Date(),
            },
          });

          await tx.inventory_transactions.create({
            data: {
              warehouse_id: transfer.to_warehouse_id,
              variant_id: item.variant_id,
              sku: item.sku,
              trans_type: 'TRANSFER_IN',
              change_on_hand: item.quantity,
              change_allocated: 0,
              change_available: item.quantity,
              balance_on_hand: updatedTo.on_hand_qty,
              balance_allocated: updatedTo.allocated_qty,
              balance_available: updatedTo.available_qty,
              ref_type: 'stock_transfers',
              ref_id: transfer.id,
              ref_code: transfer.code,
              notes: `Nhập kho từ điều chuyển kho ${transfer.from_warehouse.name}`,
              created_by: userId,
            },
          });
        }
      }

      // 3. Hủy phiếu (cancelled): Nếu đang in_transit thì hoàn tồn về kho nguồn
      if (transfer.status === 'in_transit' && newStatus === 'cancelled') {
        for (const item of transfer.items) {
          const stock = await tx.inventory_stocks.findUnique({
            where: {
              warehouse_id_variant_id: {
                warehouse_id: transfer.from_warehouse_id,
                variant_id: item.variant_id,
              },
            },
          });

          const updated = await tx.inventory_stocks.update({
            where: { id: stock.id },
            data: {
              on_hand_qty: { increment: item.quantity },
              available_qty: { increment: item.quantity },
              updated_at: new Date(),
            },
          });

          await tx.inventory_transactions.create({
            data: {
              warehouse_id: transfer.from_warehouse_id,
              variant_id: item.variant_id,
              sku: item.sku,
              trans_type: 'TRANSFER_IN',
              change_on_hand: item.quantity,
              change_allocated: 0,
              change_available: item.quantity,
              balance_on_hand: updated.on_hand_qty,
              balance_allocated: updated.allocated_qty,
              balance_available: updated.available_qty,
              ref_type: 'stock_transfers',
              ref_id: transfer.id,
              ref_code: transfer.code,
              notes: `Hủy phiếu chuyển kho [${transfer.code}] - Hoàn hàng về kho xuất`,
              created_by: userId,
            },
          });
        }
      }

      // Cập nhật trạng thái phiếu
      return tx.stock_transfers.update({
        where: { id },
        data: {
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date() : null,
          approved_by: userId || null,
        },
        include: {
          from_warehouse: true,
          to_warehouse: true,
          items: true,
        },
      });
    });
  }
}

module.exports = new StockTransferService();
