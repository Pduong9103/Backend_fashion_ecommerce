// services/agents/inventoryAgent.js
const pool = require('../../config/db');

/**
 * Handles WMS / Warehouse Inventory inquiries for Admin & Staff.
 * - Checks stock levels by variant & size (3-tier).
 * - Identifies low-stock items (< reorder threshold).
 * - Summarizes stock across warehouses.
 */
async function handleInventoryInquiry({ userRole = 'staff', query }) {
  const client = await pool.connect();
  try {
    const q = (query || '').toLowerCase();

    // 1. Low stock / Reorder alert query
    if (/sắp hết|het hang|cảnh báo|canh bao|low stock|cần nhập|can nhap|nhập hàng|reorder|tồn ít/i.test(q)) {
      const lowStockRes = await client.query(`
        SELECT 
          p.name as product_name,
          pv.sku as color_sku,
          pv.color_name,
          pvs.size_label,
          pvs.sku as size_sku,
          pvs.stock_qty,
          pvs.sold_qty,
          COALESCE(s.name, 'Chưa gán') as supplier_name
        FROM product_variant_sizes pvs
        JOIN product_variants pv ON pv.id = pvs.variant_id
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE pvs.stock_qty <= 10
        ORDER BY pvs.stock_qty ASC, pvs.sold_qty DESC
        LIMIT 8;
      `);

      if (lowStockRes.rows.length === 0) {
        return {
          type: 'inventory_report',
          reply: '📊 **Báo cáo Kho WMS:** Tất cả các mặt hàng hiện tại đều có mức tồn kho an toàn (> 10 chiếc/size). Không có cảnh báo thiếu hụt.',
          followUp: {
            question: 'Bạn muốn kiểm tra thông tin kho nào khác?',
            quickReplies: ['Thống kê tổng tồn kho', 'Báo cáo doanh thu', 'Kiểm tra đơn đặt hàng PO'],
          },
        };
      }

      const rowsText = lowStockRes.rows.map((r, i) => 
        `🚨 **${i + 1}. ${r.product_name}** (${r.color_name} - Size ${r.size_label})\n   • SKU: \`${r.size_sku}\` | NCC: **${r.supplier_name}**\n   • Tồn kho khả dụng: **${r.stock_qty} chiếc** (Đã bán: ${r.sold_qty})`
      ).join('\n\n');

      return {
        type: 'inventory_report',
        reply: `⚠️ **CẢNH BÁO TỒN KHO THẤP (LOW STOCK ALERT):**\nPhát hiện các phân loại mặt hàng sắp hết dưới ngưỡng an toàn:\n\n${rowsText}\n\n💡 *Khuyến nghị WMS:* Bạn nên tạo **Đơn Đặt Hàng Nhà Cung Cấp (PO)** tại mục *Quản lý Kho -> Đơn đặt hàng PO* để kịp thời bổ sung hàng hóa.`,
        lowStockItems: lowStockRes.rows,
        followUp: {
          question: 'Bạn muốn thực hiện thao tác nào tiếp theo?',
          quickReplies: ['Tạo đơn PO nhà cung cấp', 'Xem sổ kho chi tiết', 'Báo cáo doanh thu tuần'],
        },
      };
    }

    // 2. Specific product search stock
    const searchRes = await client.query(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        pv.color_name,
        pv.sku as color_sku,
        json_agg(
          json_build_object(
            'size', pvs.size_label,
            'sku', pvs.sku,
            'stock', pvs.stock_qty,
            'sold', pvs.sold_qty
          ) ORDER BY pvs.size_label
        ) as sizes,
        SUM(pvs.stock_qty) as total_variant_stock
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id
      JOIN product_variant_sizes pvs ON pvs.variant_id = pv.id
      GROUP BY p.id, p.name, pv.id, pv.color_name, pv.sku
      ORDER BY p.name ASC
      LIMIT 5;
    `);

    const summaryText = searchRes.rows.map(r => {
      const sizeBreakdown = (r.sizes || []).map(s => `Size ${s.size}: **${s.stock}**`).join(', ');
      return `📦 **${r.product_name}** [${r.color_name}]\n   • Mã SKU: \`${r.color_sku}\`\n   • Chi tiết: ${sizeBreakdown} (Tổng tồn: **${r.total_variant_stock}** chiếc)`;
    }).join('\n\n');

    return {
      type: 'inventory_report',
      reply: `📊 **TỔNG QUAN TỒN KHO THỜI GIAN THỰC (3 LỚP):**\n\n${summaryText}\n\n*Hệ thống quản lý kho WMS đang vận hành ổn định với Single Source of Truth trên từng Size.*`,
      followUp: {
        question: 'Bạn muốn xem báo cáo nào khác?',
        quickReplies: ['Cảnh báo mặt hàng sắp hết', 'Thống kê doanh thu', 'Xem sổ kho'],
      },
    };
  } catch (err) {
    console.error('[inventoryAgent] Error:', err);
    return {
      type: 'text',
      reply: 'Lỗi truy vấn dữ liệu kho vận WMS. Vui lòng kiểm tra lại kết nối cơ sở dữ liệu.',
    };
  } finally {
    client.release();
  }
}

module.exports = {
  handleInventoryInquiry,
};
