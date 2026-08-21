// services/agents/agentTools.js
const pool = require('../../config/db');

/**
 * Searches active products with full filters and stock check.
 */
async function searchProductsDB({ query, category_name, color, min_price, max_price, limit = 6 }) {
  const client = await pool.connect();
  try {
    let sql = `
      SELECT 
        p.id,
        p.name,
        p.price,
        p.status,
        p.description,
        c.name as category_name,
        c.id as category_id,
        s.name as supplier_name,
        (SELECT pv.id FROM product_variants pv JOIN product_variant_sizes pvs ON pvs.variant_id = pv.id WHERE pv.product_id = p.id AND pvs.stock_qty > 0 LIMIT 1) as variant_id,
        (SELECT pv.color_name FROM product_variants pv JOIN product_variant_sizes pvs ON pvs.variant_id = pv.id WHERE pv.product_id = p.id AND pvs.stock_qty > 0 LIMIT 1) as color_name,
        COALESCE(
          (SELECT json_agg(json_build_object('url', pi.url)) FROM product_images pi WHERE pi.product_id = p.id),
          '[]'::json
        ) as product_images
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.status = 'active'
    `;
    const params = [];
    let pIdx = 1;

    if (query && query.trim() !== '') {
      const terms = query.trim().split(/\s+/).filter(Boolean);
      for (const term of terms) {
        sql += ` AND (p.name ILIKE $${pIdx} OR p.description ILIKE $${pIdx} OR c.name ILIKE $${pIdx})`;
        params.push(`%${term}%`);
        pIdx++;
      }
    }

    if (category_name && category_name.trim() !== '') {
      sql += ` AND c.name ILIKE $${pIdx}`;
      params.push(`%${category_name.trim()}%`);
      pIdx++;
    }

    if (color && color.trim() !== '') {
      sql += ` AND EXISTS (
        SELECT 1 FROM product_variants pv 
        JOIN product_variant_sizes pvs ON pvs.variant_id = pv.id
        WHERE pv.product_id = p.id AND pvs.stock_qty > 0 AND pv.color_name ILIKE $${pIdx}
      )`;
      params.push(`%${color.trim()}%`);
      pIdx++;
    }

    if (min_price && !isNaN(min_price)) {
      sql += ` AND p.price >= $${pIdx}`;
      params.push(Number(min_price));
      pIdx++;
    }

    if (max_price && !isNaN(max_price)) {
      sql += ` AND p.price <= $${pIdx}`;
      params.push(Number(max_price));
      pIdx++;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT $${pIdx}`;
    params.push(limit);

    const res = await client.query(sql, params);
    return res.rows.map(row => ({
      id: row.id,
      product_id: row.id,
      variant_id: row.variant_id || row.id,
      name: row.name,
      price: Number(row.price),
      category_id: row.category_id,
      category_name: row.category_name,
      supplier_name: row.supplier_name,
      image_url: row.product_images && row.product_images[0] ? row.product_images[0].url : '/placeholder.jpg',
      color: row.color_name
    }));
  } finally {
    client.release();
  }
}

/**
 * Gets user orders with status, shipping address, and item summary.
 */
async function getUserOrdersDB({ userId, limit = 5 }) {
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId))) {
    return [];
  }
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        o.id,
        COALESCE(o.final_amount, o.total_amount) as total_amount,
        COALESCE(o.order_status, 'pending') as order_status,
        COALESCE(o.payment_status, 'unpaid') as payment_status,
        o.payment_method,
        o.shipping_address_snapshot,
        o.created_at,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'name', oi.name_snapshot,
            'price', COALESCE(oi.final_price, oi.unit_price),
            'quantity', oi.qty,
            'size', oi.size_snapshot,
            'color', oi.color_snapshot
          ))
           FROM order_items oi WHERE oi.order_id = o.id),
          '[]'::json
        ) as items
      FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2
    `, [userId, limit]);
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Gets admin revenue metrics with dynamic timeframe filtering (Year, Month, Range, or All-Time).
 */
async function getAdminMetricsDB({ startDate = null, endDate = null, label = 'Toàn Thời Gian' } = {}) {
  const client = await pool.connect();
  try {
    const whereConditions = [
      `(payment_status = 'paid' OR order_status IN ('completed', 'confirmed', 'delivered', 'delivering'))`
    ];
    const params = [];
    let pIdx = 1;

    if (startDate) {
      whereConditions.push(`created_at >= $${pIdx++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`created_at <= $${pIdx++}`);
      params.push(endDate);
    }

    const whereSql = `WHERE ${whereConditions.join(' AND ')}`;

    // 1. Period Revenue & Orders
    const revSql = `
      SELECT 
        COALESCE(SUM(COALESCE(final_amount, total_amount)), 0) as total_revenue,
        COUNT(id) as total_orders
      FROM orders
      ${whereSql}
    `;
    const revRes = await client.query(revSql, params);

    // 2. Top Best Selling Products in this Period
    const topWhereConditions = [
      `(o.payment_status = 'paid' OR o.order_status IN ('completed', 'confirmed', 'delivered', 'delivering'))`
    ];
    const topParams = [];
    let tIdx = 1;

    if (startDate) {
      topWhereConditions.push(`o.created_at >= $${tIdx++}`);
      topParams.push(startDate);
    }
    if (endDate) {
      topWhereConditions.push(`o.created_at <= $${tIdx++}`);
      topParams.push(endDate);
    }

    const topSql = `
      SELECT 
        COALESCE(oi.name_snapshot, p.name, 'Sản phẩm may đo') as name,
        COALESCE(SUM(oi.qty), 0) as total_sold,
        COALESCE(SUM(COALESCE(oi.final_price, oi.unit_price) * oi.qty), 0) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN product_variants pv ON oi.variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      WHERE ${topWhereConditions.join(' AND ')}
      GROUP BY oi.name_snapshot, p.name
      ORDER BY revenue DESC, total_sold DESC
      LIMIT 5
    `;
    const topRes = await client.query(topSql, topParams);

    // 3. All-time baseline for reference
    const allTimeRes = await client.query(`
      SELECT 
        COALESCE(SUM(COALESCE(final_amount, total_amount)), 0) as total_revenue,
        COUNT(id) as total_orders
      FROM orders
      WHERE payment_status = 'paid' OR order_status IN ('completed', 'confirmed', 'delivered', 'delivering')
    `);

    const periodRev = Number(revRes.rows[0]?.total_revenue || 0);
    const periodOrders = Number(revRes.rows[0]?.total_orders || 0);
    const aov = periodOrders > 0 ? Math.round(periodRev / periodOrders) : 0;

    return {
      period: {
        label,
        startDate,
        endDate,
        revenue: periodRev,
        orders: periodOrders,
        aov,
      },
      topProducts: topRes.rows.map(r => ({
        name: r.name,
        total_sold: Number(r.total_sold || 0),
        revenue: Number(r.revenue || 0),
      })),
      allTime: {
        total_revenue: Number(allTimeRes.rows[0]?.total_revenue || 0),
        total_orders: Number(allTimeRes.rows[0]?.total_orders || 0),
      }
    };
  } finally {
    client.release();
  }
}

module.exports = {
  searchProductsDB,
  getUserOrdersDB,
  getAdminMetricsDB
};
