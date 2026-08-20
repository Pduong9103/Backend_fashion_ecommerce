// services/agents/catalogAgent.js
const { searchProductsDB } = require('./agentTools');
const { validateAndEnrichProducts } = require('./productValidator');

async function handleCatalogSearch({ query, minPrice, maxPrice, categoryName }) {
  const rawResults = await searchProductsDB({
    query,
    min_price: minPrice,
    max_price: maxPrice,
    category_name: categoryName,
    limit: 6
  });

  const verifiedProducts = await validateAndEnrichProducts(rawResults);

  return {
    type: 'product_search',
    reply: verifiedProducts.length > 0
      ? `Luna đã tìm thấy ${verifiedProducts.length} thiết kế phù hợp với yêu cầu của bạn nè:`
      : 'Hiện tại Luna chưa tìm thấy sản phẩm chính xác như yêu cầu. Bạn có thể tham khảo các bộ sưu tập mới nhất bên dưới nhé!',
    data: verifiedProducts,
    products: verifiedProducts,
    followUp: {
      question: "Bạn có muốn lọc thêm theo màu sắc hay khoảng giá không?",
      quickReplies: ["Xem sản phẩm mới nhất", "Tư vấn phối đồ", "Bảng quy đổi size"]
    }
  };
}

module.exports = {
  handleCatalogSearch
};
