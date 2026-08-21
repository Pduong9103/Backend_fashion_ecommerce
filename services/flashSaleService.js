// services/flashSaleService.js
const prisma = require('../config/prisma');

/**
 * Lấy danh sách tất cả các chiến dịch Flash Sale (Dành cho Admin)
 */
async function getAllCampaigns({ status, page = 1, limit = 20 } = {}) {
  const where = {};
  if (status && status !== 'all') {
    where.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const [total, campaigns] = await Promise.all([
    prisma.flash_sale_campaigns.count({ where }),
    prisma.flash_sale_campaigns.findMany({
      where,
      skip,
      take,
      orderBy: { start_time: 'desc' },
      include: {
        flash_sale_items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                status: true,
                product_images: { take: 1, select: { url: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const formatted = campaigns.map((camp) => {
    const totalItems = camp.flash_sale_items.length;
    const totalQuota = camp.flash_sale_items.reduce((sum, i) => sum + (i.flash_quota || 0), 0);
    const totalSold = camp.flash_sale_items.reduce((sum, i) => sum + (i.sold_count || 0), 0);
    const progressPercent = totalQuota > 0 ? Math.min(100, Math.round((totalSold / totalQuota) * 100)) : 0;

    return {
      id: camp.id,
      name: camp.name,
      description: camp.description,
      start_time: camp.start_time,
      end_time: camp.end_time,
      status: camp.status,
      banner_url: camp.banner_url,
      totalItems,
      totalQuota,
      totalSold,
      progressPercent,
      created_at: camp.created_at,
      updated_at: camp.updated_at,
    };
  });

  return {
    campaigns: formatted,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Lấy chi tiết một chiến dịch Flash Sale
 */
async function getCampaignById(id) {
  const camp = await prisma.flash_sale_campaigns.findUnique({
    where: { id },
    include: {
      flash_sale_items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              status: true,
              product_images: { select: { url: true } },
            },
          },
        },
      },
    },
  });

  if (!camp) {
    throw Object.assign(new Error('Chiến dịch Flash Sale không tồn tại'), { status: 404 });
  }

  return camp;
}

/**
 * Tạo chiến dịch Flash Sale mới
 */
async function createCampaign({ name, description, start_time, end_time, banner_url, items = [] }) {
  const startDate = new Date(start_time);
  const endDate = new Date(end_time);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw Object.assign(new Error('Thời gian bắt đầu hoặc kết thúc không hợp lệ'), { status: 400 });
  }
  if (endDate <= startDate) {
    throw Object.assign(new Error('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu'), { status: 400 });
  }

  const now = new Date();
  let initialStatus = 'scheduled';
  if (startDate <= now && endDate > now) {
    initialStatus = 'active';
  } else if (endDate <= now) {
    initialStatus = 'ended';
  }

  const createdCampaign = await prisma.$transaction(async (tx) => {
    const campaign = await tx.flash_sale_campaigns.create({
      data: {
        name,
        description,
        start_time: startDate,
        end_time: endDate,
        status: initialStatus,
        banner_url,
      },
    });

    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const product = await tx.products.findUnique({
          where: { id: it.product_id },
          select: { id: true, price: true },
        });

        if (!product) continue;

        const basePrice = Number(product.price || 0);
        const discountPercent = Number(it.discount_percent || 0);
        const flashPrice =
          it.flash_price && Number(it.flash_price) > 0
            ? Number(it.flash_price)
            : Math.round(basePrice * (1 - discountPercent / 100));

        await tx.flash_sale_items.create({
          data: {
            campaign_id: campaign.id,
            product_id: it.product_id,
            discount_percent: discountPercent,
            flash_price: flashPrice,
            flash_quota: Number(it.flash_quota || 0),
            sold_count: 0,
            purchase_limit_per_user: Number(it.purchase_limit_per_user || 2),
          },
        });

        // Nếu campaign lập tức active, cập nhật cờ trên bảng products
        if (initialStatus === 'active') {
          await tx.products.update({
            where: { id: it.product_id },
            data: {
              is_flash_sale: true,
              sale_percent: discountPercent,
            },
          });
        }
      }
    }

    return campaign;
  });

  return getCampaignById(createdCampaign.id);
}

/**
 * Cập nhật chiến dịch Flash Sale
 */
async function updateCampaign(id, { name, description, start_time, end_time, status, banner_url, items }) {
  const existing = await prisma.flash_sale_campaigns.findUnique({ where: { id } });
  if (!existing) {
    throw Object.assign(new Error('Chiến dịch Flash Sale không tồn tại'), { status: 404 });
  }

  const startDate = start_time ? new Date(start_time) : existing.start_time;
  const endDate = end_time ? new Date(end_time) : existing.end_time;

  if (endDate <= startDate) {
    throw Object.assign(new Error('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu'), { status: 400 });
  }

  const now = new Date();
  let targetStatus = status || existing.status;
  if (!status) {
    if (startDate <= now && endDate > now && existing.status === 'scheduled') {
      targetStatus = 'active';
    } else if (endDate <= now && existing.status === 'active') {
      targetStatus = 'ended';
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.flash_sale_campaigns.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        description: description !== undefined ? description : existing.description,
        start_time: startDate,
        end_time: endDate,
        status: targetStatus,
        banner_url: banner_url !== undefined ? banner_url : existing.banner_url,
        updated_at: new Date(),
      },
    });

    if (Array.isArray(items)) {
      // Xóa các items cũ không còn trong danh sách
      const itemProductIds = items.map((i) => i.product_id);
      
      // Nếu chuyển từ active sang trạng thái khác, reset cờ trên các product bị xóa
      const oldItems = await tx.flash_sale_items.findMany({ where: { campaign_id: id } });
      const removedProductIds = oldItems
        .filter((oi) => !itemProductIds.includes(oi.product_id))
        .map((oi) => oi.product_id);

      if (removedProductIds.length > 0 && existing.status === 'active') {
        await tx.products.updateMany({
          where: { id: { in: removedProductIds } },
          data: { is_flash_sale: false, sale_percent: 0 },
        });
      }

      await tx.flash_sale_items.deleteMany({
        where: {
          campaign_id: id,
          product_id: { notIn: itemProductIds },
        },
      });

      for (const it of items) {
        const product = await tx.products.findUnique({
          where: { id: it.product_id },
          select: { id: true, price: true },
        });
        if (!product) continue;

        const basePrice = Number(product.price || 0);
        const discountPercent = Number(it.discount_percent || 0);
        const flashPrice =
          it.flash_price && Number(it.flash_price) > 0
            ? Number(it.flash_price)
            : Math.round(basePrice * (1 - discountPercent / 100));

        await tx.flash_sale_items.upsert({
          where: {
            campaign_id_product_id: {
              campaign_id: id,
              product_id: it.product_id,
            },
          },
          update: {
            discount_percent: discountPercent,
            flash_price: flashPrice,
            flash_quota: Number(it.flash_quota || 0),
            purchase_limit_per_user: Number(it.purchase_limit_per_user || 2),
            updated_at: new Date(),
          },
          create: {
            campaign_id: id,
            product_id: it.product_id,
            discount_percent: discountPercent,
            flash_price: flashPrice,
            flash_quota: Number(it.flash_quota || 0),
            sold_count: 0,
            purchase_limit_per_user: Number(it.purchase_limit_per_user || 2),
          },
        });

        if (targetStatus === 'active') {
          await tx.products.update({
            where: { id: it.product_id },
            data: {
              is_flash_sale: true,
              sale_percent: discountPercent,
            },
          });
        }
      }
    }
  });

  return getCampaignById(id);
}

/**
 * Xóa chiến dịch Flash Sale
 */
async function deleteCampaign(id) {
  const existing = await prisma.flash_sale_campaigns.findUnique({
    where: { id },
    include: { flash_sale_items: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Chiến dịch Flash Sale không tồn tại'), { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    if (existing.status === 'active') {
      const productIds = existing.flash_sale_items.map((i) => i.product_id);
      if (productIds.length > 0) {
        await tx.products.updateMany({
          where: { id: { in: productIds } },
          data: { is_flash_sale: false, sale_percent: 0 },
        });
      }
    }

    await tx.flash_sale_items.deleteMany({ where: { campaign_id: id } });
    await tx.flash_sale_campaigns.delete({ where: { id } });
  });

  return { success: true, message: 'Đã xóa chiến dịch Flash Sale thành công' };
}

/**
 * Cập nhật trạng thái chiến dịch (Ví dụ: Dừng khẩn cấp / Hủy)
 */
async function updateCampaignStatus(id, newStatus) {
  const validStatuses = ['scheduled', 'active', 'ended', 'cancelled'];
  if (!validStatuses.includes(newStatus)) {
    throw Object.assign(new Error('Trạng thái chiến dịch không hợp lệ'), { status: 400 });
  }

  const existing = await prisma.flash_sale_campaigns.findUnique({
    where: { id },
    include: { flash_sale_items: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Chiến dịch Flash Sale không tồn tại'), { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.flash_sale_campaigns.update({
      where: { id },
      data: { status: newStatus, updated_at: new Date() },
    });

    const productIds = existing.flash_sale_items.map((i) => i.product_id);
    if (productIds.length > 0) {
      if (newStatus === 'active') {
        for (const item of existing.flash_sale_items) {
          await tx.products.update({
            where: { id: item.product_id },
            data: { is_flash_sale: true, sale_percent: item.discount_percent },
          });
        }
      } else {
        await tx.products.updateMany({
          where: { id: { in: productIds } },
          data: { is_flash_sale: false, sale_percent: 0 },
        });
      }
    }
  });

  return { success: true, status: newStatus, message: `Đã chuyển trạng thái chiến dịch thành ${newStatus}` };
}

/**
 * Lấy chiến dịch Flash Sale đang diễn ra phục vụ phía khách hàng (Public Page)
 */
async function getCurrentActiveFlashSale() {
  const now = new Date();

  // Tìm campaign đang active hoặc sắp diễn ra gần nhất
  let campaign = await prisma.flash_sale_campaigns.findFirst({
    where: {
      status: 'active',
      start_time: { lte: now },
      end_time: { gt: now },
    },
    orderBy: { start_time: 'asc' },
    include: {
      flash_sale_items: {
        include: {
          product: {
            include: {
              product_images: { select: { url: true, position: true } },
              product_variants: {
                select: {
                  id: true,
                  sku: true,
                  color_name: true,
                  color_code: true,
                  sold_qty: true,
                  product_variant_sizes: {
                    select: {
                      id: true,
                      size_label: true,
                      sku: true,
                      stock_qty: true,
                    },
                  },
                },
              },
              categories: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  // Nếu không có campaign active, lấy campaign scheduled gần nhất
  let isUpcoming = false;
  if (!campaign) {
    campaign = await prisma.flash_sale_campaigns.findFirst({
      where: {
        OR: [
          { status: 'active' },
          {
            status: 'scheduled',
            start_time: { lte: now },
            end_time: { gt: now },
          },
          {
            status: 'scheduled',
            start_time: { gt: now },
          },
        ],
      },
      orderBy: { start_time: 'asc' },
      include: {
        flash_sale_items: {
          include: {
            product: {
              include: {
                product_images: { select: { url: true, position: true } },
                product_variants: {
                  select: {
                    id: true,
                    sku: true,
                    color_name: true,
                    color_code: true,
                    sold_qty: true,
                    product_variant_sizes: {
                      select: {
                        id: true,
                        size_label: true,
                        sku: true,
                        stock_qty: true,
                      },
                    },
                  },
                },
                categories: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (campaign && new Date(campaign.start_time) > now) {
      isUpcoming = true;
    }
  }

  if (!campaign) {
    return {
      has_active_campaign: false,
      campaign: null,
      products: [],
    };
  }

  const products = campaign.flash_sale_items.map((item) => {
    const p = item.product;
    const basePrice = Number(p.price || 0);
    const flashPrice = Number(item.flash_price || Math.round(basePrice * (1 - Number(item.discount_percent) / 100)));
    const totalStock = (p.product_variants || []).reduce((sum, v) => {
      const vSizesStock = (v.product_variant_sizes || []).reduce((sSum, sz) => sSum + (sz.stock_qty || 0), 0);
      return sum + vSizesStock;
    }, 0);
    const flashQuota = item.flash_quota > 0 ? item.flash_quota : (totalStock > 0 ? totalStock : 10);
    const soldCount = item.sold_count || 0;
    const soldPercent = flashQuota > 0 ? Math.min(100, Math.round((soldCount / flashQuota) * 100)) : 0;

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.categories?.name || 'Haute Couture',
      category_id: p.category_id,
      original_price: basePrice,
      flash_price: flashPrice,
      discount_percent: Number(item.discount_percent),
      flash_quota: flashQuota,
      sold_count: soldCount,
      sold_percent: soldPercent,
      stock_qty: totalStock,
      purchase_limit: item.purchase_limit_per_user,
      images: p.product_images.map((img) => img.url),
      image_url: p.product_images[0]?.url || '/placeholder.jpg',
      variants: p.product_variants,
    };
  });

  return {
    has_active_campaign: true,
    is_upcoming: isUpcoming,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      start_time: campaign.start_time,
      end_time: campaign.end_time,
      status: campaign.status,
      banner_url: campaign.banner_url,
    },
    products,
  };
}

/**
 * Cron Job tự động đồng bộ trạng thái chiến dịch Flash Sale theo thời gian
 */
async function syncFlashSaleStatusCron() {
  try {
    const now = new Date();

    // 1. Kích hoạt các campaign đã đến giờ bắt đầu
    const pendingToActive = await prisma.flash_sale_campaigns.findMany({
      where: {
        status: 'scheduled',
        start_time: { lte: now },
        end_time: { gt: now },
      },
      include: { flash_sale_items: true },
    });

    for (const camp of pendingToActive) {
      await prisma.$transaction(async (tx) => {
        await tx.flash_sale_campaigns.update({
          where: { id: camp.id },
          data: { status: 'active', updated_at: new Date() },
        });

        for (const it of camp.flash_sale_items) {
          await tx.products.update({
            where: { id: it.product_id },
            data: { is_flash_sale: true, sale_percent: it.discount_percent },
          });
        }
      });
      console.log(`[FlashSaleCron] Đã kích hoạt chiến dịch: "${camp.name}" (#${camp.id})`);
    }

    // 2. Đóng các campaign đã hết giờ
    const activeToEnded = await prisma.flash_sale_campaigns.findMany({
      where: {
        status: 'active',
        end_time: { lte: now },
      },
      include: { flash_sale_items: true },
    });

    for (const camp of activeToEnded) {
      await prisma.$transaction(async (tx) => {
        await tx.flash_sale_campaigns.update({
          where: { id: camp.id },
          data: { status: 'ended', updated_at: new Date() },
        });

        const productIds = camp.flash_sale_items.map((i) => i.product_id);
        if (productIds.length > 0) {
          await tx.products.updateMany({
            where: { id: { in: productIds } },
            data: { is_flash_sale: false, sale_percent: 0 },
          });
        }
      });
      console.log(`[FlashSaleCron] Đã kết thúc chiến dịch: "${camp.name}" (#${camp.id})`);
    }
  } catch (error) {
    console.error('[FlashSaleCron] Lỗi đồng bộ trạng thái chiến dịch:', error.message);
  }
}

module.exports = {
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  updateCampaignStatus,
  getCurrentActiveFlashSale,
  syncFlashSaleStatusCron,
};
