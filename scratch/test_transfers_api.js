async function testWms() {
  try {
    const res = await fetch('http://localhost:5001/api/v1/transfers');
    const data = await res.json();
    console.log('Transfers API response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

testWms();
