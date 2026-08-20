// services/newsService.js
const pool = require('../config/db');

/**
 * Chuẩn hóa các khối nội dung (Content Blocks) linh hoạt
 */
function normalizeContentBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return [];
  const out = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== 'object') continue;

    const blockType = String(b.type || 'text').toLowerCase();

    // 1. Heading Block (H2 / H3)
    if (blockType === 'heading') {
      const text = String(b.text || '').trim();
      if (text) {
        out.push({
          type: 'heading',
          level: Number(b.level) === 3 ? 3 : 2,
          text,
        });
      }
    }
    // 2. Text / Paragraph Block
    else if (blockType === 'text' || blockType === 'paragraph') {
      const text = String(b.text || '').trim();
      if (text) {
        out.push({
          type: 'text',
          text,
        });
      }
    }
    // 3. Single Image Block
    else if (blockType === 'image') {
      let mainUrl = '';
      if (typeof b.url === 'string' && b.url.trim()) {
        mainUrl = b.url.trim();
      } else if (Array.isArray(b.urls) && b.urls.length > 0) {
        mainUrl = typeof b.urls[0] === 'string' ? b.urls[0].trim() : b.urls[0]?.url?.trim() || '';
      }

      if (mainUrl) {
        out.push({
          type: 'image',
          url: mainUrl,
          urls: [{ url: mainUrl, position: 1 }], // Giữ backward compatibility cho dữ liệu cũ
          caption: b.caption ? String(b.caption).trim() : undefined,
          alt: b.alt ? String(b.alt).trim() : undefined,
        });
      }
    }
    // 4. Image Grid / Lookbook Block (2 hoặc 3 ảnh cạnh nhau)
    else if (blockType === 'image_grid' || blockType === 'lookbook') {
      const imgs = Array.isArray(b.images) ? b.images : Array.isArray(b.urls) ? b.urls : [];
      const validImgs = imgs
        .map((img) => {
          if (typeof img === 'string') return { url: img.trim() };
          if (img && typeof img === 'object' && img.url) {
            return {
              url: String(img.url).trim(),
              caption: img.caption ? String(img.caption).trim() : undefined,
            };
          }
          return null;
        })
        .filter((img) => img && img.url);

      if (validImgs.length > 0) {
        out.push({
          type: 'image_grid',
          layout: b.layout === '3-col' ? '3-col' : '2-col',
          images: validImgs,
        });
      }
    }
    // 5. Quote / Callout Block
    else if (blockType === 'quote' || blockType === 'callout') {
      const text = String(b.text || '').trim();
      if (text) {
        out.push({
          type: 'quote',
          text,
          author: b.author ? String(b.author).trim() : undefined,
        });
      }
    }
    // 6. Product Embed Card Block
    else if (blockType === 'product_embed' || blockType === 'product') {
      const pid = String(b.product_id || b.productId || '').trim();
      if (pid) {
        out.push({
          type: 'product_embed',
          product_id: pid,
          note: b.note ? String(b.note).trim() : undefined,
        });
      }
    }
  }

  return out;
}

/**
 * Validate nội dung bài viết
 */
function validateContentBlocks(blocks = []) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw Object.assign(new Error('Bài viết cần có ít nhất 1 khối nội dung (Đoạn văn, ảnh hoặc tiêu đề).'), {
      status: 400,
    });
  }

  const maxBlocks = 50; // Cho phép bài viết phong phú lên đến 50 block
  if (blocks.length > maxBlocks) {
    throw Object.assign(new Error(`Bài viết vượt quá giới hạn tối đa ${maxBlocks} khối nội dung.`), {
      status: 400,
    });
  }

  return true;
}

exports.createNews = async ({ title, content_blocks = [], image = null }) => {
  if (!title || !title.trim()) {
    throw Object.assign(new Error('Tiêu đề bài viết là bắt buộc'), { status: 400 });
  }

  const normalizedBlocks = normalizeContentBlocks(content_blocks);
  validateContentBlocks(normalizedBlocks);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let leadImage = image;
    if (!leadImage) {
      // Tìm ảnh đại diện đầu tiên trong các block nếu chưa có thumbnail
      const firstImageBlock = normalizedBlocks.find((b) => b.type === 'image' && b.url);
      if (firstImageBlock) {
        leadImage = firstImageBlock.url;
      } else {
        const firstGrid = normalizedBlocks.find((b) => b.type === 'image_grid' && b.images?.length > 0);
        if (firstGrid) leadImage = firstGrid.images[0].url;
      }
    }

    const q = `
      INSERT INTO news (id, title, content, image, content_blocks, created_at, updated_at)
      VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, NOW(), NOW())
      RETURNING id, title, image, content_blocks, created_at, updated_at
    `;

    const contentText = normalizedBlocks.length
      ? normalizedBlocks
          .map((b) => (b.type === 'text' || b.type === 'heading' || b.type === 'quote' ? b.text : ''))
          .filter(Boolean)
          .join('\n\n')
      : null;

    const params = [title.trim(), contentText, leadImage, JSON.stringify(normalizedBlocks)];
    const { rows } = await client.query(q, params);
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.updateNews = async (newsId, { title, content_blocks, image } = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields = [];
    const params = [];
    let idx = 1;

    if (title !== undefined) {
      fields.push(`title = $${idx++}`);
      params.push(title.trim());
    }

    if (content_blocks !== undefined) {
      const normalized = normalizeContentBlocks(content_blocks);
      validateContentBlocks(normalized);
      const contentText = normalized.length
        ? normalized
            .map((b) => (b.type === 'text' || b.type === 'heading' || b.type === 'quote' ? b.text : ''))
            .filter(Boolean)
            .join('\n\n')
        : null;

      fields.push(`content_blocks = $${idx++}`);
      params.push(JSON.stringify(normalized));
      fields.push(`content = $${idx++}`);
      params.push(contentText);

      if (image === undefined) {
        const firstImg = normalized.find((b) => b.type === 'image' && b.url);
        if (firstImg) {
          fields.push(`image = $${idx++}`);
          params.push(firstImg.url);
        }
      }
    }

    if (image !== undefined) {
      fields.push(`image = $${idx++}`);
      params.push(image);
    }

    if (fields.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    params.push(newsId);
    const q = `UPDATE news SET ${fields.join(
      ', '
    )}, updated_at = NOW() WHERE id = $${idx} RETURNING id, title, image, content_blocks, created_at, updated_at`;
    const { rows } = await client.query(q, params);
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.deleteNews = async (newsId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = `DELETE FROM news WHERE id = $1 RETURNING id`;
    const { rows } = await client.query(q, [newsId]);
    await client.query('COMMIT');
    return !!rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.getNewsById = async (newsId) => {
  const { rows } = await pool.query(
    `SELECT id, title, image, content_blocks, created_at, updated_at FROM news WHERE id = $1 LIMIT 1`,
    [newsId]
  );
  return rows[0] || null;
};

exports.getNewsList = async ({ q = null, page = 1, limit = 10 } = {}) => {
  const offset = (Math.max(1, page) - 1) * limit;
  const params = [];
  let where = '';
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where = `WHERE title ILIKE $1 OR content ILIKE $1`;
  }
  const sql = `
    SELECT id, title, image, content_blocks, created_at, updated_at
    FROM news
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(limit, offset);
  const { rows } = await pool.query(sql, params);
  return rows;
};

module.exports = {
  normalizeContentBlocks,
  validateContentBlocks,
  createNews: exports.createNews,
  updateNews: exports.updateNews,
  deleteNews: exports.deleteNews,
  getNewsById: exports.getNewsById,
  getNewsList: exports.getNewsList,
};
