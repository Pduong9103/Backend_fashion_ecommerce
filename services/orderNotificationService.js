const pool = require('../config/db');
const email = require('../config/email');

async function buildOrderSummaryHtml(orderId, client) {
    const q = `
      SELECT oi.qty, oi.final_price, oi.unit_price, oi.name_snapshot, oi.color_snapshot, oi.size_snapshot,
             p.id as product_id,
             (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY COALESCE(pi.position,0) LIMIT 1) as image
      FROM order_items oi
      JOIN product_variants pv ON pv.id = oi.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE oi.order_id = $1
    `;
    const { rows } = await client.query(q, [orderId]);
    if (!rows.length) return '';
    let html = `<table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:8px;">`;
    html += `<thead><tr style="background:#FAF9F6; border-bottom:1px solid rgba(18,18,18,0.08); text-transform:uppercase; font-size:10px; color:#8C827A; letter-spacing:1px;">
      <th style="text-align:left; padding:10px 12px; font-weight:600;">Thiết Kế May Đo</th>
      <th style="text-align:center; padding:10px 12px; font-weight:600;">Số Lượng</th>
      <th style="text-align:right; padding:10px 12px; font-weight:600;">Đơn Giá</th>
      <th style="text-align:right; padding:10px 12px; font-weight:600;">Thành Tiền</th>
    </tr></thead><tbody>`;
    for (const r of rows) {
      const name = r.name_snapshot || 'Sản phẩm may đo';
      const color = r.color_snapshot ? `<span style="display:inline-block; font-size:10px; color:#57514B; background:#ECE8E1; padding:2px 6px; margin-right:4px;">${r.color_snapshot}</span>` : '';
      const size = r.size_snapshot ? `<span style="display:inline-block; font-size:10px; color:#57514B; background:#ECE8E1; padding:2px 6px;">Size: ${r.size_snapshot}</span>` : '';
      const imageTag = r.image ? `<img src="${r.image}" alt="${name}" style="width:44px; height:44px; object-fit:cover; border:1px solid rgba(18,18,18,0.08); vertical-align:middle; margin-right:10px;" />` : '';
      const unitPrice = Number(r.unit_price || r.final_price || 0);
      const lineTotal = Number(r.final_price || 0);

      html += `<tr style="border-bottom:1px solid rgba(18,18,18,0.05);">
        <td style="padding:12px; text-align:left; vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              ${imageTag ? `<td style="vertical-align:middle;">${imageTag}</td>` : ''}
              <td style="vertical-align:middle;">
                <div style="font-weight:500; color:#121212; font-size:12px; margin-bottom:4px;">${name}</div>
                <div>${color}${size}</div>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding:12px; text-align:center; vertical-align:middle; color:#121212; font-weight:600;">×${r.qty}</td>
        <td style="padding:12px; text-align:right; vertical-align:middle; color:#57514B;">${unitPrice.toLocaleString('vi-VN')} ₫</td>
        <td style="padding:12px; text-align:right; vertical-align:middle; color:#121212; font-weight:600;">${lineTotal.toLocaleString('vi-VN')} ₫</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    return html;
}

// Reworked: atomic insert + commit, then send email outside transaction and update notification record
async function sendDeliveryEmailIfNeeded(orderId) {
  const client = await pool.connect();
  let orderDetailsForEmail = null;
  try {
    await client.query('BEGIN');

    // lock order row and read relevant fields
    const oRes = await client.query(
      `SELECT id, order_code, user_id, order_status, updated_at, final_amount
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (oRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const order = oRes.rows[0];
    if (order.order_status !== 'delivered') {
      await client.query('ROLLBACK');
      return false;
    }

    // ensure not already handled: try insert notification atomically
    // insert minimal metadata now; ON CONFLICT prevents duplicates
    const ins = await client.query(
      `INSERT INTO order_notifications (order_id, type, metadata)
       VALUES ($1, 'delivered', $2::jsonb)
       ON CONFLICT (order_id, type) DO NOTHING
       RETURNING id`,
      [orderId, JSON.stringify({ state: 'pending', created_by: 'system' })]
    );
    if (ins.rows.length === 0) {
      // another worker already created notification -> nothing to do
      await client.query('ROLLBACK');
      return false;
    }

    // load user info and build order summary while still inside transaction (read-only)
    const uRes = await client.query(
      `SELECT email, COALESCE(full_name, name) AS full_name FROM users WHERE id = $1 LIMIT 1`,
      [order.user_id]
    );
    if (uRes.rows.length === 0 || !uRes.rows[0].email) {
      // no recipient -> rollback and do not send
      await client.query('ROLLBACK');
      return false;
    }
    const user = uRes.rows[0];

    const orderSummaryHtml = await buildOrderSummaryHtml(orderId, client);

    const feBaseUrl = process.env.FE_URL || 'http://localhost:5000';
    orderDetailsForEmail = {
      id: order.order_code || (`#${orderId.slice(0, 8).toUpperCase()}`),
      updated_at: order.updated_at || new Date().toISOString(),
      user_name: user.full_name || 'Quý khách',
      order_summary_html: orderSummaryHtml,
      total_display: Number(order.final_amount || 0).toLocaleString('vi-VN') + ' ₫',
      fe_order_url: `${feBaseUrl}/customer/order/${orderId}`,
      fe_url: feBaseUrl,
      to: user.email
    };

    // commit so the insert is durable and lock released before external I/O
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    client.release();
    console.error('[orderNotificationService.sendDeliveryEmailIfNeeded] pre-send error', err && err.stack ? err.stack : err);
    throw err;
  } finally {
    // release transaction client if not already released
    try { client.release(); } catch(e){/*ignore*/ }
  }

  // send email outside transaction
  try {
    if (!orderDetailsForEmail) return false;
    await email.sendDeliveredOrderEmail(orderDetailsForEmail.to, orderDetailsForEmail);

    // mark notification as sent
    await pool.query(
      `UPDATE order_notifications
       SET sent_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE order_id = $1 AND type = 'delivered'`,
      [orderId, JSON.stringify({ state: 'sent' })]
    );
    return true;
  } catch (err) {
    // record failure state so we can retry / inspect later
    try {
      await pool.query(
        `UPDATE order_notifications
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE order_id = $1 AND type = 'delivered'`,
        [orderId, JSON.stringify({ state: 'failed', error: String(err.message) })]
      );
    } catch (uErr) {
      console.error('[orderNotificationService.sendDeliveryEmailIfNeeded] failed to update notification metadata', uErr && uErr.stack ? uErr.stack : uErr);
    }
    console.error('[orderNotificationService.sendDeliveryEmailIfNeeded] send email error', err && err.stack ? err.stack : err);
    return false;
  }
}

async function checkAndSendForDeliveredOrders(limit = 50) {
  // find delivered orders that have no notification record
  const client = await pool.connect();
  try {
    const q = `
      SELECT o.id
      FROM orders o
      LEFT JOIN order_notifications n ON n.order_id = o.id AND n.type = 'delivered'
      WHERE o.order_status = 'delivered' AND n.id IS NULL
      ORDER BY o.updated_at DESC
      LIMIT $1
    `;
    const { rows } = await client.query(q, [limit]);
    client.release();

    for (const r of rows) {
      try {
        await sendDeliveryEmailIfNeeded(r.id);
      } catch (e) {
        console.error('[orderNotificationService.checkAndSendForDeliveredOrders] failed for order', r.id, e && e.stack ? e.stack : e);
      }
    }
  } catch (err) {
    client.release();
    throw err;
  }
}

module.exports = { sendDeliveryEmailIfNeeded, checkAndSendForDeliveredOrders };