require('dotenv').config();
const pool = require('../config/db');

async function setupLookbookSchema() {
  console.log('🚀 Setting up Lookbook Exhibition Schema...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS lookbook_slides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        season_tag VARCHAR(150) NOT NULL,
        title VARCHAR(255) NOT NULL,
        subtitle TEXT,
        manifesto TEXT NOT NULL,
        material_info VARCHAR(255),
        artisan_hours VARCHAR(100),
        image VARCHAR(500) NOT NULL,
        look_number VARCHAR(50) DEFAULT 'ARCHIVE N°01',
        shop_link VARCHAR(255) DEFAULT '/product',
        combo_title VARCHAR(255),
        combo_discount NUMERIC(5,2) DEFAULT 10.00,
        sort_order INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
    `);

    console.log('✅ Created table `lookbook_slides` successfully.');

    // Seed 4 Curated Real Fashion Slides
    await client.query(`DELETE FROM lookbook_slides;`);
    await client.query(`
      INSERT INTO lookbook_slides (season_tag, title, subtitle, manifesto, material_info, artisan_hours, image, look_number, shop_link, combo_title, combo_discount, sort_order)
      VALUES 
        (
          'COLLECTION ISSUE 01 / HAUTE STREETWEAR',
          'The Heritage Preppy Varsity Jacket',
          'Nghệ thuật thêu chần nổi và kỹ thuật ghép dạ phối da mang hơi thở thời trang học viện',
          'Lấy cảm hứng từ phong cách Ivy League cổ điển kết hợp tinh thần đường phố đương đại. Thân áo dạ dệt nguyên bản dày dặn, tay áo phối gân da bền bỉ cùng hệ thống khuy bấm hợp kim dập nổi tỉ mỉ.',
          'Dạ Dệt Mật Độ Cao • Da Phối Cao Cấp • Thêu Thủ Công Nổi 3D',
          '18 Giờ Đính Kết Thủ Công',
          'https://res.cloudinary.com/dge8dkqyt/image/upload/v1766845582/fashion_ecommerce/product/%C3%81o%20Kho%C3%A1c%20Teelab%20Preppy%20Varsity%20Jacket/qnwsrzcul44aefve3y3y.webp',
          'ARCHIVE N°01',
          '/product/eca6636e-a344-45e8-92c8-bd6f9127bee8',
          'Combo Set Lookbook 01: Heritage Preppy & Monogram',
          10.00,
          1
        ),
        (
          'COLLECTION ISSUE 02 / LEATHER CRAFTSMANSHIP',
          'The Sculptural Lea Chain Bag',
          'Biểu tượng túi xách phom hộp kiến trúc với quai xích kim loại mạ vàng sang trọng',
          'Đường nét hình học sắc sảo kết hợp cùng chất da PU xử lý vân sần tự nhiên chống xước và kháng nước. Điểm nhấn chuỗi xích mạ tĩnh điện tôn vinh khí chất thanh lịch của quý cô hiện đại.',
          'Da PU Cao Cấp Chống Xước • Quai Xích Kim Loại Mạ Vàng • Lót Vải Nhung',
          '12 Giờ Thuộc Da & Gò Phom',
          'https://res.cloudinary.com/dge8dkqyt/image/upload/v1763737314/fashion_ecommerce/product/T%C3%BAi%20%C4%90eo%20Vai%20N%E1%BB%AF%20Quai%20X%C3%ADch%20Lea%20Chain%20HAPAS/iougp1lrl6mbwijqml8a.webp',
          'ARCHIVE N°02',
          '/product/b486bb46-094f-4e92-9543-fb12aaa640fc',
          'Combo Set Lookbook 02: Chic Elegance & Chain Luxe',
          10.00,
          2
        ),
        (
          'COLLECTION ISSUE 03 / SARTORIAL LINEN',
          'The Raw Linen Resort Shirt',
          'Bản tuyên ngôn tự do của sợi đũi thô mộc với nếp gập mềm mại cho những chuyến viễn du',
          'Dệt từ sợi đũi tự nhiên với bề mặt thoáng khí tuyệt đối và độ rũ tự nhiên đặc trưng. Thiết kế cổ áo chuẩn may đo cùng đường kim mũi chỉ tỉ mỉ tôn trọn phong thái phóng khoáng, thanh lịch.',
          '100% Sợi Đũi Tự Nhiên • Khuy Xà Cừ Cao Cấp • Giữ Phom Mềm Mại',
          '14 Giờ Dệt & May Đo Chuẩn Mực',
          'https://res.cloudinary.com/dge8dkqyt/image/upload/v1763832519/fashion_ecommerce/product/%C3%81o%20S%C6%A1%20Mi%20Nam%20D%C3%A0i%20Tay%20V%E1%BA%A3i%20%C4%90%C5%A9i/kx3xxawz4wtc03r5te37.webp',
          'ARCHIVE N°03',
          '/product/2796f05d-c729-48bd-983e-8e3d48923fe2',
          'Combo Set Lookbook 03: Sartorial Resort Capsule',
          10.00,
          3
        ),
        (
          'COLLECTION ISSUE 04 / TIMELESS ACCESSORY',
          'The Monogram Barrel Keepal',
          'Cấu trúc túi trống da hình học đa năng hòa quyện cùng họa tiết monogram tráng phủ bền bỉ',
          'Biểu tượng du hành mang hơi thở thời đại với khoang chứa rộng rãi, dây đeo bản to êm ái và chi tiết phụ kiện kim loại đúc đặc chống oxy hóa. Hoàn hảo cho mọi hành trình dạo phố hay công tác ngắn ngày.',
          'Da Tổng Hợp Tráng Phủ Monogram • Phụ Kiện Kim Loại Chống Gỉ • Quai Dệt Chịu Lực',
          '16 Giờ Định Hình & Khâu Viền',
          'https://res.cloudinary.com/dge8dkqyt/image/upload/v1766842849/fashion_ecommerce/product/Tr%E1%BB%91ng%20Da%20%C4%90eo%20Ch%C3%A9o%20Nam%20Monogram%20Keepal/nbjkm4yra7tlicc23wy7.webp',
          'ARCHIVE N°04',
          '/product/febe7db9-7a6f-4e7a-8167-ee7a816ade5c',
          'Combo Set Lookbook 04: Voyager Monogram Kit',
          10.00,
          4
        );
    `);

    await client.query('COMMIT');
    console.log('🎉 Seeded 4 Curated Lookbook Slides successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed setting up lookbook schema:', err);
  } finally {
    client.release();
    pool.end();
  }
}

setupLookbookSchema();
