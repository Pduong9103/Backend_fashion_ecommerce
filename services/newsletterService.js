const pool = require('../config/db');
const { sendNewsletterWelcomeEmail } = require('../config/email');

exports.subscribeNewsletter = async (email) => {
  if (!email || !email.includes('@')) {
    const error = new Error('Địa chỉ email không hợp lệ');
    error.status = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Kiểm tra xem email đã đăng ký chưa
  const existing = await pool.query(
    'SELECT id, is_active FROM newsletter_subscribers WHERE email = $1',
    [normalizedEmail]
  );

  let isNew = false;
  if (existing.rows.length > 0) {
    if (!existing.rows[0].is_active) {
      await pool.query(
        'UPDATE newsletter_subscribers SET is_active = TRUE, updated_at = NOW() WHERE email = $1',
        [normalizedEmail]
      );
      isNew = true;
    }
  } else {
    await pool.query(
      'INSERT INTO newsletter_subscribers (email, is_active, created_at, updated_at) VALUES ($1, TRUE, NOW(), NOW())',
      [normalizedEmail]
    );
    isNew = true;
  }

  // Gửi email chào mừng may đo nếu là đăng ký mới
  if (isNew) {
    sendNewsletterWelcomeEmail(normalizedEmail).catch((err) => {
      console.error('[subscribeNewsletter] sendNewsletterWelcomeEmail error:', err && err.message ? err.message : err);
    });
  }

  return {
    success: true,
    message: isNew
      ? 'Đăng ký nhận đặc quyền thành công! Thư mời chào mừng và mã ưu đãi đã được gửi đến email của Quý khách.'
      : 'Email này đã nằm trong danh sách đặc quyền của HS Atelier.',
    isNew,
  };
};
