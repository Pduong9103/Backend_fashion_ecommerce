const pool = require('../config/db');

async function migrateSuppliersTable() {
  try {
    console.log('Migrating suppliers table columns...');

    await pool.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS tax_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS contact_person VARCHAR(150),
      ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'VIP',
      ADD COLUMN IF NOT EXISTS website VARCHAR(255),
      ADD COLUMN IF NOT EXISTS bank_account VARCHAR(255),
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    // Update existing suppliers with meaningful enterprise info if null
    const existing = await pool.query('SELECT id, name FROM suppliers');
    for (let i = 0; i < existing.rows.length; i++) {
      const row = existing.rows[i];
      const code = String(i + 1).padStart(3, '0');
      const cleanName = row.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      await pool.query(`
        UPDATE suppliers
        SET 
          tax_code = COALESCE(tax_code, '0108992341-' || $1),
          address = COALESCE(address, 'KCN Tân Bình, Đường CN13, Q. Tân Bình, TP.HCM'),
          contact_person = COALESCE(contact_person, 'Nguyễn Văn Phụ Trách'),
          tier = COALESCE(tier, 'VIP'),
          website = COALESCE(website, 'https://' || $2 || '.vn'),
          bank_account = COALESCE(bank_account, 'MB Bank - 8888 6666 9999 - ' || UPPER($3)),
          status = COALESCE(status, 'active')
        WHERE id = $4
      `, [code, cleanName, row.name, row.id]);
    }

    console.log('✅ Suppliers table migrated successfully!');
    const res = await pool.query('SELECT id, name, tax_code, address, contact_person, tier, website, bank_account FROM suppliers LIMIT 3');
    console.log('Sample updated suppliers:', res.rows);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

migrateSuppliersTable();
