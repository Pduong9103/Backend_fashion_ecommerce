async function testPOEndpoints() {
  try {
    const res = await fetch('http://localhost:5001/api/v1/purchase-orders');
    const data = await res.json();
    console.log('PO list response:', data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testPOEndpoints();
