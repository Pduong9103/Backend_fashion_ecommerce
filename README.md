# 🛍️ Fashion E-Commerce Backend & AI Stylist Platform

Hệ thống Backend cho nền tảng Thương mại Điện tử Thời trang tích hợp **AI Stylist Engine ("Luna")** tư vấn phối đồ thông minh, hệ thống Caching Redis tối ưu hiệu năng, bảo mật đa lớp và tích hợp cổng thanh toán quốc tế PayPal.

---

## 🌟 Tính Năng Nổi Bật (Key Features)

### 1. AI Stylist Engine & Gợi Ý Trang Phục Thông Minh
- **Tư vấn Outfit cá nhân hóa:** Tích hợp OpenAI (GPT-4o-mini) và Pinecone Vector Database để tư vấn phối đồ theo hoàn cảnh (đi làm, hẹn hò, dự tiệc), thời tiết và sở thích cá nhân.
- **Thuật toán gợi ý Size chuẩn xác:** Tự động tính toán và map chỉ số cơ thể người dùng (chiều cao, cân nặng, vòng 1/2/3) với bảng quy đổi size (`size_guides`).
- **Chống AI Hallucination:** Áp dụng kỹ thuật Prompt Engineering với Few-shot learning, Fallback Heuristics và Fuzzy Matching đảm bảo 100% sản phẩm AI gợi ý luôn tồn tại trong kho và đúng danh mục (Top/Bottom).
- **Quản lý Session & Cursor Pagination:** Quản lý lịch sử hội thoại chatbox AI với phân trang dạng cursor, tối ưu bộ nhớ và tốc độ phản hồi.

### 2. Tối Ưu Hiệu Năng & Caching (Performance & Database)
- **Redis Caching với Graceful Fallback:** Đệm dữ liệu danh mục sản phẩm và khuyến mãi bằng Redis. Tự động chuyển sang DB Query khi Redis gặp sự cố mà không làm gián đoạn hệ thống.
- **PostgreSQL Materialized Views:** Tối ưu các câu lệnh thống kê doanh thu phức tạp (`mv_revenue_by_week`) với cơ chế làm mới bất đồng bộ `CONCURRENTLY` qua Cron Job.
- **JSON/JSONB Aggregation:** Tận dụng sức mạnh của PostgreSQL (`json_agg`, `jsonb_build_object`) để aggregate dữ liệu phức tạp ngay tại tầng cơ sở dữ liệu.

### 3. Bảo Mật Đa Lớp & Xác Thực (Security & Authentication)
- **Xác thực Đa phương thức:** Hỗ trợ đăng nhập truyền thống (JWT) và Google OAuth 2.0 (Passport.js).
- **JWT Refresh Token Rotation:** Cơ chế Access Token ngắn hạn và Refresh Token tự động gia hạn an toàn.
- **Dual-Layer Rate Limiting:** Bảo vệ hệ thống khỏi Spam/DDoS ở cả 2 tầng (Per-User & Per-IP), xử lý chuẩn hóa IP an toàn đằng sau Reverse Proxy (`x-forwarded-for`, IPv6 `::ffff:`).
- **Phân quyền RBAC:** Middleware kiểm soát quyền hạn chặt chẽ giữa User, Guest và Admin.

### 4. Thanh Toán & Quản Lý Đơn Hàng (Payment & Orders)
- **Tích hợp PayPal Checkout SDK:** Xử lý thanh toán quốc tế trực tiếp và qua Webhook.
- **ACID Transactions:** Đảm bảo tính toàn vẹn dữ liệu cho luồng đặt hàng, giảm số lượng tồn kho và áp dụng mã giảm giá bằng PostgreSQL Multi-statement Transactions (`BEGIN...COMMIT/ROLLBACK`).

### 5. Tiến Trình Chạy Ngầm (Automated Cron Jobs)
- Tự động thu hồi Refresh Tokens và mã giảm giá (Promotions) hết hạn.
- Tự động kiểm tra đơn hàng đã giao và gửi email/thông báo đánh giá sản phẩm.
- Thực thi **Data Retention Policy** xóa sạch lịch sử chat AI quá hạn (90 - 365 ngày) định kỳ lúc 03:30 AM hàng ngày.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

- **Core Framework:** Node.js, Express.js (v5.1)
- **Database:** PostgreSQL (`pg` connection pool)
- **Caching Layer:** Redis (v5)
- **AI & Vector Search:** OpenAI API (GPT-4o-mini), `@pinecone-database/pinecone`
- **Payment Gateway:** PayPal Checkout Server SDK (`@paypal/checkout-server-sdk`)
- **Authentication:** Passport.js (Google OAuth 2.0), JSON Web Token (`jsonwebtoken`, `express-jwt`), Bcrypt
- **Security:** `express-rate-limit`, CORS, Validator
- **Utilities & Automation:** `node-cron`, Nodemailer (SMTP)

---

## 📂 Cấu Trúc Thư Mục (Project Structure)

```text
fashion-ecommerce-backend/
├── config/                  # Cấu hình DB, Redis, Passport, OpenAI
│   ├── db.js
│   ├── redis.js
│   └── passport.js
├── controllers/             # Xử lý Logic Controller cho các Routes
│   ├── adminController.js
│   ├── aiRecommendationController.js
│   ├── authController.js
│   ├── userBehaviorController.js
│   ├── cart/
│   ├── orders/
│   ├── payments/
│   └── products/
├── services/                # Nghiệp vụ logic chính (Business Logic Layer)
│   ├── aiRecommendationService.js  # Engine AI Stylist & Recommendation
│   ├── authService.js
│   ├── productService.js
│   ├── userCartService.js
│   ├── userOrderServices.js
│   └── ...
├── routes/                  # Định nghĩa API Routes
│   ├── adminRoutes.js
│   ├── aiChatRoutes.js
│   ├── authRoutes.js
│   ├── paymentsRoutes.js
│   ├── publicRoutes.js
│   └── userRoutes.js
├── middleware/              # Authentication & Authorization Middlewares
├── utils/                   # Error handling, Helper functions
├── templates/               # Email HTML templates
├── cleanupRefreshTokens.js  # Task dọn dẹp refresh token
├── app.js                   # Application Entry Point
└── package.json
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng (Getting Started)

### 1. Yêu Cầu Tiền Đề (Prerequisites)
- **Node.js**: `>= v18.x`
- **PostgreSQL**: `>= 14.x`
- **Redis**: `>= 6.x` (Tùy chọn, ứng dụng có cơ chế Fallback nếu không có Redis)

### 2. Cài Đặt Ứng Dụng
```bash
# Clone repository
git clone <YOUR_REPOSITORY_URL>
cd fashion-ecommerce-backend

# Cài đặt các dependencies
npm install
```

### 3. Cấu Hình Biến Môi Trường (Environment Variables)
Tạo file `.env` tại thư mục gốc của project (có thể sao chép từ file `.env.example`):

```env
PORT=3000
FE_URL=http://localhost:5000

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=fashion_ecommerce

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Secrets
JWT_SECRET=your_super_secret_jwt_key

# OpenAI API Key (Dùng cho AI Stylist)
OPENAI_API_KEY=sk-proj-your_openai_api_key

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# PayPal Integration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENV=sandbox

# SMTP Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM_NAME="HS Fashion Store"
```

### 4. Chạy Ứng Dụng

#### Môi trường Development:
```bash
npm run dev
```

#### Môi trường Production:
```bash
npm start
```
Ứng dụng sẽ lắng nghe tại cổng `http://localhost:3000` (hoặc PORT cấu hình trong `.env`).

---

## 🌐 Các Danh Mục API Chính (API Endpoints Overview)

| Phương thức | Endpoint | Mô tả | Phân quyền |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/register` | Đăng ký tài khoản người dùng mới | Public |
| **POST** | `/api/auth/login` | Đăng nhập hệ thống & nhận JWT Tokens | Public |
| **GET** | `/api/auth/google` | Đăng nhập bằng Google OAuth 2.0 | Public |
| **POST** | `/api/chat-recommendations` | Chat với AI Stylist "Luna" nhận gợi ý outfit | User |
| **GET** | `/user/cart` | Lấy thông tin giỏ hàng của người dùng | User |
| **POST** | `/user/orders` | Tạo đơn hàng mới | User |
| **POST** | `/payment/create-paypal-order` | Khởi tạo giao dịch thanh toán PayPal | User |
| **GET** | `/admin/revenue` | Thống kê doanh thu (Sử dụng Materialized View) | Admin |
| **POST** | `/admin/products` | Quản lý thêm/sửa/xóa sản phẩm | Admin |

---

## 📜 Giấy Phép (License)
Dự án được bảo lưu mọi quyền phục vụ cho Đồ Án Tốt Nghiệp (DATN).
