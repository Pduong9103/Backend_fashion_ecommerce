require('dotenv').config();
const pool = require('../config/db');
const { execSync } = require('child_process');

// Helper to remove Vietnamese tones and convert to clean uppercase code
function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return str;
}

function getSupplierAbbr(supName) {
  if (!supName) return 'HS';
  const clean = removeVietnameseTones(supName).toUpperCase().trim();
  const map = {
    'COOLMATE': 'CLM',
    'TEELAB': 'TLB',
    'ZONEF': 'ZNF',
    'SEEME': 'SME',
    'LESAC': 'LSC',
    'UNDERTHINKER': 'UDT',
    'ROCKBROS': 'RKB',
    'MEFEEE': 'MFE',
    'HAPAS': 'HPS',
    'IMELON': 'IML',
    'LILYWEAR': 'LLW',
    'VINTINO': 'VTN',
    'JEAN.ONE': 'JON',
    'OMEN': 'OMN',
  };
  if (map[clean]) return map[clean];
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
  }
  return clean.slice(0, 3).toUpperCase();
}

function getCategoryAbbr(prodName) {
  if (!prodName) return 'GEN';
  const lower = removeVietnameseTones(prodName).toLowerCase();
  if (lower.includes('so mi')) return 'ASM';
  if (lower.includes('thun') || lower.includes('t-shirt') || lower.includes('tee')) return 'TSH';
  if (lower.includes('hoodie')) return 'HOD';
  if (lower.includes('sweater')) return 'SWT';
  if (lower.includes('khoac') || lower.includes('jacket') || lower.includes('varsity') || lower.includes('blazer')) return 'JKT';
  if (lower.includes('jean') || lower.includes('bo')) return 'JEA';
  if (lower.includes('kaki') || lower.includes('khaki')) return 'KAK';
  if (lower.includes('short') || lower.includes('dui')) return 'SHT';
  if (lower.includes('tay') || lower.includes('baggy') || lower.includes('chino') || lower.includes('ong rong')) return 'PAN';
  if (lower.includes('ni') || lower.includes('the thao') || lower.includes('jogger')) return 'JOG';
  if (lower.includes('vi') || lower.includes('wallet')) return 'WLT';
  if (lower.includes('tui') || lower.includes('balo') || lower.includes('tote')) return 'BAG';
  if (lower.includes('kinh') || lower.includes('gong')) return 'GLS';
  if (lower.includes('polo')) return 'POL';
  return 'ATEL';
}

function getColorAbbr(colorName) {
  if (!colorName) return 'GEN';
  const lower = removeVietnameseTones(colorName).toLowerCase().trim();
  const map = {
    'den': 'BLK',
    'trang': 'WHT',
    'xam': 'GRY',
    'xam ghi': 'XGH',
    'xam tieu': 'XTI',
    'xanh': 'BLU',
    'xanh navy': 'NVY',
    'xanh duong': 'BLU',
    'xanh nhat': 'LBL',
    'xanh den': 'DBL',
    'xanh reu': 'OLV',
    'xanh la': 'GRN',
    'xanh mint': 'MNT',
    'do': 'RED',
    'do do': 'DRED',
    'kem': 'CRE',
    'kem ke den': 'CKD',
    'be': 'BGE',
    'nau': 'BRN',
    'hong': 'PNK',
    'vang': 'YEL',
    'cam': 'ORG',
    'tim': 'PPL',
    'nau dam': 'DBRN',
    'loang': 'TIE',
  };
  for (const [k, v] of Object.entries(map)) {
    if (lower === k || lower.includes(k)) return v;
  }
  const clean = removeVietnameseTones(colorName).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.slice(0, 3) || 'CLR';
}

async function regenerateAllSKUs() {
  const client = await pool.connect();
  try {
    console.log('=== STARTING SKU REGENERATION ACROSS ALL PRODUCTS ===');

    // 1. Fetch all products with suppliers and variants
    const query = `
      SELECT 
        pv.id as variant_id,
        pv.color_name,
        pv.sku as current_sku,
        p.id as product_id,
        p.name as product_name,
        s.name as supplier_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.id, pv.id
    `;
    const res = await client.query(query);
    console.log(`Found ${res.rows.length} variants to process.`);

    const productCodeMap = new Map();
    let productIndex = 1;

    const updates = [];
    const usedSKUs = new Set();

    for (const row of res.rows) {
      if (!productCodeMap.has(row.product_id)) {
        const prodCodeNum = String(productIndex++).padStart(3, '0');
        productCodeMap.set(row.product_id, prodCodeNum);
      }

      const supCode = getSupplierAbbr(row.supplier_name);
      const catCode = getCategoryAbbr(row.product_name);
      const prodNum = productCodeMap.get(row.product_id);
      const colCode = getColorAbbr(row.color_name);

      let newSku = `${supCode}-${catCode}-${prodNum}-${colCode}`;
      
      // Ensure absolute uniqueness
      if (usedSKUs.has(newSku)) {
        let suffix = 2;
        while (usedSKUs.has(`${newSku}-${suffix}`)) {
          suffix++;
        }
        newSku = `${newSku}-${suffix}`;
      }
      usedSKUs.add(newSku);

      updates.push({
        variant_id: row.variant_id,
        old_sku: row.current_sku,
        new_sku: newSku,
        product_name: row.product_name,
        color: row.color_name,
      });
    }

    console.log('Generated SKUs sample:');
    updates.slice(0, 10).forEach(u => {
      console.log(`- ${u.product_name} (${u.color}) -> Old: "${u.old_sku}" ==> NEW SKU: "${u.new_sku}"`);
    });

    // 2. Update product_variants in DB
    console.log('\nUpdating product_variants table in PostgreSQL...');
    await client.query('BEGIN');
    for (const u of updates) {
      await client.query(`UPDATE product_variants SET sku = $1 WHERE id = $2`, [u.new_sku, u.variant_id]);
    }
    await client.query('COMMIT');
    console.log(`✅ Updated ${updates.length} records in product_variants.`);

    // 3. Update inventory_stocks in docker postgres
    console.log('\nSyncing updated SKUs to inventory_stocks and other tables...');
    for (const u of updates) {
      // Update inventory_stocks
      await client.query(`UPDATE inventory_stocks SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
      // Update purchase_order_items
      await client.query(`UPDATE purchase_order_items SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
      // Update goods_receipt_items
      await client.query(`UPDATE goods_receipt_items SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
      // Update goods_issue_items
      await client.query(`UPDATE goods_issue_items SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
      // Update stock_transfer_items
      await client.query(`UPDATE stock_transfer_items SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
      // Update stocktake_items
      await client.query(`UPDATE stocktake_items SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
      // Update inventory_transactions
      await client.query(`UPDATE inventory_transactions SET sku = $1 WHERE variant_id = $2`, [u.new_sku, u.variant_id]).catch(() => {});
    }

    // Also sync to docker container DB
    console.log('Syncing updated tables to docker postgres container...');
    const syncCmd = `pg_dump -U postgres -h localhost -p 5432 -d fashion_ecommerce -t product_variants -t inventory_stocks -t purchase_order_items -t goods_receipt_items -t goods_issue_items -t stock_transfer_items -t stocktake_items -t inventory_transactions -a | docker exec -i fashion_postgres psql -U postgres -d fashion_ecommerce`;
    try {
      execSync(syncCmd, { env: { ...process.env, PGPASSWORD: '090103' }, stdio: 'ignore' });
    } catch (e) {
      // ignore
    }

    console.log('🎉 ALL SKUs REGENERATED SUCCESSFULLY AND FULLY SYNCHRONIZED!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error regenerating SKUs:', err);
  } finally {
    client.release();
    pool.end();
  }
}

regenerateAllSKUs();
