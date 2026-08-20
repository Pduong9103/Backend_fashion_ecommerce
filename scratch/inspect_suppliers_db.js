require('dotenv').config();
const pool = require('../config/db');

async function inspectDb() {
  try {
    const suppliers = await pool.query('SELECT id, name FROM suppliers');
    console.log('Suppliers in DB:', suppliers.rows);

    const prodSuppliers = await pool.query('SELECT count(*) as total, count(supplier_id) as with_supplier FROM products');
    console.log('Products count:', prodSuppliers.rows[0]);

    const distinctSuppliersInProducts = await pool.query(`
      SELECT p.supplier_id, s.name as supplier_name, count(p.id) as product_count
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      GROUP BY p.supplier_id, s.name
    `);
    console.log('Products grouped by supplier:', distinctSuppliersInProducts.rows);
  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await pool.end();
  }
}

inspectDb();
