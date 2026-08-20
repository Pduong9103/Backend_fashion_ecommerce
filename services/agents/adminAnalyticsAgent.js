// services/agents/adminAnalyticsAgent.js
const { getAdminMetricsDB } = require('./agentTools');

/**
 * Parses user message to detect requested timeframe.
 */
function parseTimeframe(message) {
  const m = (message || '').toLowerCase().trim();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // 1. Specific Month & Year (e.g. "tháng 8/2025", "tháng 8 năm 2025", "t8/2026")
  const monthYearMatch = m.match(/\b(?:tháng|thang|t)\s*(\d{1,2})[\/\s]+(?:năm|nam)?\s*(\d{4})\b/);
  if (monthYearMatch) {
    const month = parseInt(monthYearMatch[1], 10);
    const year = parseInt(monthYearMatch[2], 10);
    if (month >= 1 && month <= 12) {
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
      return { startDate: start, endDate: end, label: `tháng ${month}/${year}`, type: 'month' };
    }
  }

  // 2. Specific Year (e.g. "năm 2025", "2025", "năm 2024", "năm 2026")
  const yearMatch = m.match(/\b(?:năm|nam)\s*(\d{4})\b/) || m.match(/\b(202[0-9]|201[0-9])\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const start = new Date(Date.UTC(year, 0, 1)).toISOString();
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString();
    return { startDate: start, endDate: end, label: `năm ${year}`, type: 'year', year };
  }

  // 3. Today
  if (/\b(hôm nay|hom nay|today)\b/i.test(m)) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    return { startDate: start, endDate: end, label: `hôm nay (${now.toLocaleDateString('vi-VN')})`, type: 'day' };
  }

  // 4. Yesterday
  if (/\b(hôm qua|hom qua|yesterday)\b/i.test(m)) {
    const yest = new Date(now.getTime() - 86400000);
    const start = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0).toISOString();
    const end = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999).toISOString();
    return { startDate: start, endDate: end, label: `hôm qua (${yest.toLocaleDateString('vi-VN')})`, type: 'day' };
  }

  // 5. This Month
  if (/\b(tháng này|thang nay|this month)\b/i.test(m)) {
    const start = new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString();
    const end = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999)).toISOString();
    return { startDate: start, endDate: end, label: `tháng này (${currentMonth}/${currentYear})`, type: 'month' };
  }

  // 6. Last Month
  if (/\b(tháng trước|thang truoc|last month)\b/i.test(m)) {
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const start = new Date(Date.UTC(prevYear, prevMonth - 1, 1)).toISOString();
    const end = new Date(Date.UTC(prevYear, prevMonth, 0, 23, 59, 59, 999)).toISOString();
    return { startDate: start, endDate: end, label: `tháng trước (${prevMonth}/${prevYear})`, type: 'month' };
  }

  // 7. This Year
  if (/\b(năm nay|nam nay|this year)\b/i.test(m)) {
    const start = new Date(Date.UTC(currentYear, 0, 1)).toISOString();
    const end = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999)).toISOString();
    return { startDate: start, endDate: end, label: `năm nay (${currentYear})`, type: 'year', year: currentYear };
  }

  // 8. Last Year
  if (/\b(năm ngoái|nam ngoai|last year)\b/i.test(m)) {
    const lastY = currentYear - 1;
    const start = new Date(Date.UTC(lastY, 0, 1)).toISOString();
    const end = new Date(Date.UTC(lastY, 11, 31, 23, 59, 59, 999)).toISOString();
    return { startDate: start, endDate: end, label: `năm ${lastY}`, type: 'year', year: lastY };
  }

  // 9. Last 7 Days
  if (/\b(tuần này|tuan nay|7 ngày|7 ngay)\b/i.test(m)) {
    const start = new Date(now.getTime() - 7 * 86400000).toISOString();
    const end = now.toISOString();
    return { startDate: start, endDate: end, label: `7 ngày gần nhất`, type: 'period' };
  }

  // Default: All-Time
  return { startDate: null, endDate: null, label: 'toàn thời gian', type: 'all' };
}

async function handleAdminAnalytics({ query = '', userRole = 'admin' } = {}) {
  const isAdmin = ['admin', 'superadmin', 'manager', 'staff'].includes(String(userRole || '').toLowerCase().trim());
  if (!isAdmin) {
    return {
      type: 'text',
      reply: 'Thông tin doanh thu và số liệu kinh doanh là dữ liệu nội bộ chỉ dành riêng cho tài khoản Quản trị viên. Bạn có thể hỏi mình về tư vấn trang phục, tìm kiếm sản phẩm hoặc kiểm tra đơn hàng cá nhân nhé!',
    };
  }

  try {
    const timeframe = parseTimeframe(query);
    const metrics = await getAdminMetricsDB(timeframe);

    const formatPrice = (p) =>
      new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p || 0);

    const periodRev = formatPrice(metrics.period.revenue);
    const periodOrders = metrics.period.orders;
    const aov = formatPrice(metrics.period.aov);
    const allTimeRev = formatPrice(metrics.allTime.total_revenue);
    const allTimeOrders = metrics.allTime.total_orders;

    let reply = '';

    if (periodOrders === 0) {
      reply = `Trong ${timeframe.label}, hệ thống chưa ghi nhận đơn hàng hoàn tất nào (Doanh thu: 0 ₫).\n\nTổng doanh thu tích lũy toàn sàn hiện tại là ${allTimeRev} với ${allTimeOrders} đơn hàng thành công.`;
    } else {
      let topList = '';
      if (metrics.topProducts && metrics.topProducts.length > 0) {
        topList = metrics.topProducts
          .map((p, idx) => `${idx + 1}. ${p.name} (${p.total_sold} sản phẩm - ${formatPrice(p.revenue)})`)
          .join('\n');
      }

      reply = `Báo cáo doanh thu ${timeframe.label}:\n\n` +
        `• Tổng doanh thu: ${periodRev}\n` +
        `• Số đơn hàng thành công: ${periodOrders} đơn\n` +
        `• Giá trị trung bình / đơn: ${aov}\n\n` +
        `Top sản phẩm bán chạy nhất trong ${timeframe.label}:\n` +
        `${topList}`;

      if (timeframe.type !== 'all') {
        reply += `\n\n(Lũy kế toàn thời gian: ${allTimeRev} / ${allTimeOrders} đơn hàng)`;
      }
    }

    return {
      type: 'admin_report',
      reply,
      data: metrics,
    };
  } catch (error) {
    console.error('[adminAnalyticsAgent] Lỗi truy vấn doanh thu:', error);
    return {
      type: 'admin_report',
      reply: 'Hệ thống đang gặp sự cố khi trích xuất dữ liệu doanh thu. Vui lòng thử lại sau ít phút.',
      error: error.message,
    };
  }
}

module.exports = {
  handleAdminAnalytics,
  parseTimeframe,
};
