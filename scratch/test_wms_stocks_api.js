async function testWmsSuppliers() {
  try {
    const seemeId = '845a0b36-8552-4a05-af91-bae94ef9c37b';
    const res = await fetch(`http://localhost:5001/api/v1/stocks?supplierId=${seemeId}&limit=50`);
    const data = await res.json();
    console.log('Total items for SEEME:', data.total, 'returned:', data.data?.length);
    console.log('SEEME products sample:', data.data?.slice(0, 5).map(s => ({
      product_name: s.product_name,
      supplier_name: s.supplier_name,
    })));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testWmsSuppliers();
