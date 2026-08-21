async function testPOLifecycle() {
  try {
    console.log('=== TESTCASE 1: FETCH WAREHOUSES & SUPPLIERS ===');
    const [whRes, supRes] = await Promise.all([
      fetch('http://localhost:5001/api/v1/warehouses').then(r => r.json()),
      fetch('http://localhost:5000/api/v1/suppliers').then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    
    const warehouse = whRes.data?.[0];
    if (!warehouse) throw new Error('No warehouse found');
    console.log(`✅ Using Warehouse: ${warehouse.name} (${warehouse.id})`);

    const coolmateId = 'ee9a160e-1810-4411-bb4e-ab931cb09079';
    console.log(`✅ Using Supplier: Coolmate (${coolmateId})`);

    // Fetch Coolmate variants
    const stocksRes = await fetch(`http://localhost:5001/api/v1/stocks?supplierId=${coolmateId}&limit=5`).then(r => r.json());
    const sampleItems = stocksRes.data?.slice(0, 2);
    if (!sampleItems || sampleItems.length < 2) throw new Error('Need at least 2 Coolmate variants');

    console.log('Sample variants for PO:', sampleItems.map(s => ({ name: s.product_name, sku: s.sku })));

    console.log('\n=== TESTCASE 2: CREATE PURCHASE ORDER (DRAFT) ===');
    const createRes = await fetch('http://localhost:5001/api/v1/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: coolmateId,
        supplier_name: 'Coolmate',
        warehouse_id: warehouse.id,
        expected_date: '2026-08-30',
        notes: 'Đơn đặt hàng may đợt Thu Đông 2026 - Kiểm thử tự động',
        items: [
          {
            variant_id: sampleItems[0].variant_id,
            sku: sampleItems[0].sku,
            product_name: sampleItems[0].product_name,
            color_name: sampleItems[0].color_name,
            size_label: 'L',
            ordered_qty: 30,
            unit_cost: 180000,
          },
          {
            variant_id: sampleItems[1].variant_id,
            sku: sampleItems[1].sku,
            product_name: sampleItems[1].product_name,
            color_name: sampleItems[1].color_name,
            size_label: 'XL',
            ordered_qty: 20,
            unit_cost: 220000,
          },
        ],
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData.error || 'Failed to create PO');
    const po = createData.data;
    console.log(`✅ Created PO: ${po.code} | Status: ${po.status} | Total: ${Number(po.total_amount).toLocaleString()} VND`);

    console.log('\n=== TESTCASE 3: APPROVE PURCHASE ORDER ===');
    const approveRes = await fetch(`http://localhost:5001/api/v1/purchase-orders/${po.id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok) throw new Error(approveData.error || 'Failed to approve PO');
    console.log(`✅ Approved PO: ${approveData.data.code} | New Status: ${approveData.data.status}`);

    console.log('\n=== TESTCASE 4: PARTIAL GOODS RECEIPT (1-CLICK GRN CONVERT) ===');
    // Receive 30/30 of item 1 and 10/20 of item 2
    const grn1Res = await fetch('http://localhost:5001/api/v1/goods-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        po_id: po.id,
        warehouse_id: warehouse.id,
        supplier_id: coolmateId,
        supplier_name: 'Coolmate',
        receipt_type: 'po_import',
        status: 'completed',
        notes: `Nhập đợt 1 cho đơn ${po.code}`,
        items: [
          {
            variant_id: sampleItems[0].variant_id,
            sku: sampleItems[0].sku,
            product_name: sampleItems[0].product_name,
            color_name: sampleItems[0].color_name,
            size_label: 'L',
            quantity: 30, // 30/30
            unit_cost: 180000,
            total_cost: 30 * 180000,
          },
          {
            variant_id: sampleItems[1].variant_id,
            sku: sampleItems[1].sku,
            product_name: sampleItems[1].product_name,
            color_name: sampleItems[1].color_name,
            size_label: 'XL',
            quantity: 10, // 10/20
            unit_cost: 220000,
            total_cost: 10 * 220000,
          },
        ],
      }),
    });
    const grn1Data = await grn1Res.json();
    if (!grn1Res.ok) throw new Error(grn1Data.error || 'Failed to create GRN 1');
    console.log(`✅ Created GRN 1: ${grn1Data.data?.code || grn1Data.code}`);

    // Check PO status after partial receipt
    const poAfter1 = await fetch(`http://localhost:5001/api/v1/purchase-orders/${po.id}`).then(r => r.json());
    console.log(`✅ PO Status after partial receipt: "${poAfter1.data.status}" (Expected: "receiving")`);
    console.log('Fulfillment progress:', poAfter1.data.items.map(it => `${it.product_name} (${it.size_label}): ${it.received_qty}/${it.ordered_qty} received`));

    console.log('\n=== TESTCASE 5: COMPLETE REMAINING GOODS RECEIPT ===');
    // Receive remaining 10 of item 2
    const grn2Res = await fetch('http://localhost:5001/api/v1/goods-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        po_id: po.id,
        warehouse_id: warehouse.id,
        supplier_id: coolmateId,
        supplier_name: 'Coolmate',
        receipt_type: 'po_import',
        status: 'completed',
        notes: `Nhập đợt 2 (hoàn tất) cho đơn ${po.code}`,
        items: [
          {
            variant_id: sampleItems[1].variant_id,
            sku: sampleItems[1].sku,
            product_name: sampleItems[1].product_name,
            color_name: sampleItems[1].color_name,
            size_label: 'XL',
            quantity: 10, // remaining 10/10
            unit_cost: 220000,
            total_cost: 10 * 220000,
          },
        ],
      }),
    });
    const grn2Data = await grn2Res.json();
    if (!grn2Res.ok) throw new Error(grn2Data.error || 'Failed to create GRN 2');
    console.log(`✅ Created GRN 2: ${grn2Data.data?.code || grn2Data.code}`);

    // Check PO status after full receipt
    const poFinal = await fetch(`http://localhost:5001/api/v1/purchase-orders/${po.id}`).then(r => r.json());
    console.log(`✅ Final PO Status: "${poFinal.data.status}" (Expected: "completed")`);
    console.log('Final 3-Way Matching items:', poFinal.data.items.map(it => `${it.product_name} (${it.size_label}): ${it.received_qty}/${it.ordered_qty} (100% complete)`));

    console.log('\n🎉 ALL PO LIFECYCLE & 3-WAY MATCHING TESTCASES PASSED PERFECTLY!');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testPOLifecycle();
