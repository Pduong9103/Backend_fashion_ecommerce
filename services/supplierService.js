const pool = require('../config/db');
const validator = require('validator');

exports.createSupplier = async (supplierData) => {
  const {
    name,
    contact_email,
    phone,
    logo_url,
    tax_code,
    address,
    contact_person,
    tier,
    website,
    bank_account,
    status,
    notes,
  } = supplierData;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Name is required');
  }

  if (contact_email && !validator.isEmail(contact_email)) {
    throw new Error('Invalid email format');
  }

  if (phone && !validator.isMobilePhone(phone, 'vi-VN')) {
    throw new Error('Invalid phone number');
  }

  const result = await pool.query(
    `INSERT INTO suppliers (
      name, contact_email, phone, logo_url, tax_code, address, contact_person, tier, website, bank_account, status, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    RETURNING id, name, contact_email, phone, logo_url, tax_code, address, contact_person, tier, website, bank_account, status, notes, created_at, updated_at`,
    [
      name.trim(),
      contact_email || null,
      phone || null,
      logo_url || null,
      tax_code || null,
      address || null,
      contact_person || null,
      tier || 'VIP',
      website || null,
      bank_account || null,
      status || 'active',
      notes || null,
    ]
  );
  return result.rows[0];
};

exports.updateSupplier = async (id, data) => {
  const {
    name,
    contact_email,
    phone,
    logo_url,
    tax_code,
    address,
    contact_person,
    tier,
    website,
    bank_account,
    status,
    notes,
  } = data;

  if (contact_email && !validator.isEmail(contact_email)) {
    throw new Error('Invalid contact email');
  }
  if (phone && !validator.isMobilePhone(phone, 'vi-VN')) {
    throw new Error('Invalid phone number');
  }

  const result = await pool.query(
    `UPDATE suppliers SET
      name = COALESCE($1, name),
      contact_email = COALESCE($2, contact_email),
      phone = COALESCE($3, phone),
      logo_url = COALESCE($4, logo_url),
      tax_code = COALESCE($5, tax_code),
      address = COALESCE($6, address),
      contact_person = COALESCE($7, contact_person),
      tier = COALESCE($8, tier),
      website = COALESCE($9, website),
      bank_account = COALESCE($10, bank_account),
      status = COALESCE($11, status),
      notes = COALESCE($12, notes),
      updated_at = NOW()
    WHERE id = $13
    RETURNING id, name, contact_email, phone, logo_url, tax_code, address, contact_person, tier, website, bank_account, status, notes, updated_at`,
    [
      name ? name.trim() : null,
      contact_email || null,
      phone || null,
      logo_url || null,
      tax_code || null,
      address || null,
      contact_person || null,
      tier || null,
      website || null,
      bank_account || null,
      status || null,
      notes || null,
      id,
    ]
  );

  if (result.rowCount === 0) {
    throw new Error('Supplier not found');
  }
  return result.rows[0];
};

exports.getSuppliers = async () => {
  const result = await pool.query(
    `SELECT 
      id, name, contact_email, phone, logo_url, tax_code, address, contact_person, tier, website, bank_account, status, notes, created_at, updated_at
    FROM suppliers
    ORDER BY created_at DESC`
  );
  return result.rows;
};

exports.getSupplierById = async (id) => {
  const result = await pool.query(
    `SELECT 
      id, name, contact_email, phone, logo_url, tax_code, address, contact_person, tier, website, bank_account, status, notes, created_at, updated_at
    FROM suppliers 
    WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

exports.deleteSupplier = async (id, cascade = false) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra sản phẩm liên quan
    const checkProducts = await client.query('SELECT id FROM products WHERE supplier_id = $1', [id]);
    if (checkProducts.rowCount > 0) {
      if (!cascade) throw new Error('Supplier has associated products');
      // Nếu cascade=true, xóa tất cả sản phẩm liên quan trước
      await client.query('DELETE FROM products WHERE supplier_id = $1', [id]);
    }

    // Xóa supplier
    const result = await client.query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) throw new Error('Supplier not found');

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
