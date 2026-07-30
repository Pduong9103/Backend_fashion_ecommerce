# 🛍️ Fashion E-Commerce Backend & AI Stylist Platform

Hệ thống Backend cho nền tảng Thương mại Điện tử Thời trang tích hợp **AI Stylist Engine ("Luna")** tư vấn phối đồ thông minh, hệ thống Caching Redis tối ưu hiệu năng, bảo mật đa lớp và tích hợp cổng thanh toán quốc tế PayPal.

---

## 🌟 Các Tính Năng Đã Triển Khai (Implemented Features)

### 🤖 1. AI Stylist Engine & Gợi Ý Trang Phục Thông Minh ("Luna")
- **Tư vấn Outfit theo Ngữ cảnh:** Tích hợp OpenAI API (`gpt-4o-mini`) xử lý ngôn ngữ tự nhiên, tư vấn phối đồ dựa trên hoàn cảnh (đi làm, đi chơi, hẹn hò), thời tiết và sở thích.
- **Thuật toán Chọn Size theo Chỉ số Cơ thể:** Tự động đối chiếu thông tin thể hình người dùng (chiều cao, cân nặng, vòng 1/2/3) với bảng quy đổi `size_guides` theo từng danh mục sản phẩm để đưa ra gợi ý size chính xác.
- **Chống AI Hallucination bằng Fuzzy Matching:** Áp dụng kỹ thuật Prompt Engineering (Few-shot learning) kết hợp thuật toán `fuzzyMatchVariant` trong Backend để map tên sản phẩm AI tạo ra thành `variant_id` thực tế trong kho.
- **Phân trang Lịch sử Chat AI (Cursor Pagination):** Quản lý phiên hội thoại chatbox AI hỗ trợ tải trước/tải thêm tin nhắn theo Cursor (`created_at`), giảm latency khi đọc lịch sử chat dài.
- **User Behavior Tracking:** Ghi nhận chuỗi sự kiện hành vi (`view`, `add_to_cart`, `favorite`) vào bảng `user_behavior_events` làm dữ liệu đầu vào bổ trợ cho AI.

### ⚡ 2. Hiệu Năng & Cấu Trúc Dữ Liệu (Performance & Optimization)
- **Redis Caching & Graceful Fallback:** Tự động đệm (Cache) danh mục và sản phẩm. Khi Redis gặp sự cố, hệ thống không bị crash mà tự động fallback query trực tiếp về PostgreSQL.
- **PostgreSQL Materialized Views:** Sử dụng Materialized View (`mv_revenue_by_week`) phục vụ API báo cáo doanh thu theo tuần, làm mới bất đồng bộ qua Cron Job (`REFRESH MATERIALIZED VIEW CONCURRENTLY`).
- **Phân Trang Linh Hoạt (Cursor & Offset):** Áp dụng Cursor-based Pagination cho danh sách sản phẩm Flash Sale/Newest để tối ưu truy vấn dữ liệu lớn, kết hợp Offset Pagination cho tìm kiếm & lọc sản phẩm.
- **Tối ưu DB với JSON Aggregation:** Sử dụng `json_agg` và `jsonb_build_object` để aggregate dữ liệu phức tạp (favorites, order items, behavior events) ngay tại tầng cơ sở dữ liệu.

### 🛡️ 3. Bảo Mật & Quản Lý Xác Thực (Security & Auth)
- **Xác thực Đa phương thức:** Đăng nhập truyền thống bằng JWT (Access Token ngắn hạn & Refresh Token Rotation) và đăng nhập bằng Google OAuth 2.0 (Passport.js).
- **Xác thực OTP qua Email:** Quy trình Đăng ký tài khoản và Quên mật khẩu qua mã OTP có thời hạn (Nodemailer SMTP).
- **Dual-Layer Rate Limiting:** Chống Brute-force/DDoS ở 2 cấp độ (Per-User & Per-IP), tích hợp hàm chuẩn hóa IP an toàn đằng sau Reverse Proxy (`x-forwarded-for`, IPv6 `::ffff:`).
- **Phân quyền RBAC:** Middleware kiểm soát quyền truy cập chặt chẽ giữa Guest, User và Admin (`requireAdmin`, `requireUser`).

### 💳 4. Đơn Hàng, Khuyến Mãi & Thanh Toán
- **Thanh toán PayPal SDK & Webhook:** Tích hợp `@paypal/checkout-server-sdk` tạo giao dịch, bắt giữ tiền (`capture`) và nhận sự kiện tự động qua Webhook (`/payment/paypal/webhook`).
- **ACID Transactions cho Đơn Hàng:** Đảm bảo tính toàn vẹn dữ liệu khi đặt hàng (trừ tồn kho, tính toán chiết khấu mã giảm giá) bằng PostgreSQL Multi-statement Transactions (`BEGIN...COMMIT/ROLLBACK`).
- **Công cụ Tính Toán Khuyến Mãi (Promotions):** Cho phép người dùng thu thập mã, kiểm tra điều kiện áp dụng, xem trước chiết khấu (`preview`) phân bổ trên từng item trước khi chốt đơn.
- **Địa Chỉ Giao Hàng & Đánh Giá Sản Phẩm:** Quản lý sổ địa chỉ (thiết lập mặc định) và gửi đánh giá (Rating, Comment, Hình ảnh) kèm kiểm tra quyền đánh giá dựa trên đơn hàng thực tế.

### ⏰ 5. Tự Động Hóa Tiến Trình Ngầm (Node-Cron Jobs)
- **Dọn dẹp Refresh Tokens:** Tự động xóa các token hết hạn hàng ngày.
- **Tự động Hết hạn Promotions:** Kiểm tra và cập nhật trạng thái các mã giảm giá quá hạn mỗi 5 phút.
- **Refresh Báo cáo Doanh thu:** Làm mới Materialized View báo cáo doanh thu mỗi giờ.
- **Gửi Email Thông Báo Đơn Hàng:** Kiểm tra đơn hàng đã giao và gửi email nhắc đánh giá sản phẩm tự động mỗi 5 phút.
- **Data Retention Policy:** Tự động dọn dẹp các bản ghi chat AI quá 90 ngày và gợi ý quá 365 ngày lúc 03:30 AM hàng ngày để tránh phình cơ sở dữ liệu.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

- **Core Framework:** Node.js, Express.js (v5.1)
- **Database:** PostgreSQL (`pg` connection pool)
- **Caching Layer:** Redis (v5)
- **AI Integration:** OpenAI API (`gpt-4o-mini`)
- **Payment Gateway:** PayPal Checkout Server SDK (`@paypal/checkout-server-sdk`)
- **Authentication:** Passport.js (Google OAuth 2.0), JSON Web Token (`jsonwebtoken`, `express-jwt`), Bcrypt
- **Email Service:** Nodemailer (SMTP - Gmail)
- **Security & Automation:** `express-rate-limit`, `node-cron`, CORS, Validator

---

## 📂 Cấu Trúc Thư Mục (Project Structure)

```text
fashion-ecommerce-backend/
├── config/                  # Cấu hình DB, Redis, Passport, OpenAI, PayPal
│   ├── db.js
│   ├── redis.js
│   ├── passport.js
│   └── paypal.js
├── controllers/             # Xử lý Controller
│   ├── adminController.js
│   ├── aiRecommendationController.js
│   ├── authController.js
│   ├── publicController.js
│   ├── userBehaviorController.js
│   ├── cart/
│   ├── categories/
│   ├── favorite/
│   ├── news/
│   ├── orders/
│   ├── payments/
│   ├── products/
│   ├── promotions/
│   ├── revenue/
│   ├── suppliers/
│   └── users/
├── services/                # Tầng Xử lý Nghiệp vụ (Business Logic Layer)
│   ├── aiRecommendationService.js  # Engine AI Stylist & Recommendation
│   ├── authService.js
│   ├── orderNotificationService.js # Tự động gửi mail thông báo
│   ├── paymentService.js           # Xử lý tích hợp PayPal
│   ├── productService.js
│   ├── promotionServices.js        # Logic mã giảm giá
│   ├── revenueService.js          # Thống kê doanh thu từ Materialized View
│   ├── userCartService.js
│   └── userOrderServices.js
├── routes/                  # Định nghĩa API Routes
│   ├── adminRoutes.js
│   ├── aiChatRoutes.js
│   ├── authRoutes.js
│   ├── paymentsRoutes.js
│   ├── publicRoutes.js
│   └── userRoutes.js
├── middleware/              # Middlewares (Auth, Rate Limit, Error Handler)
├── utils/                   # Error handling, Helper functions
├── cleanupRefreshTokens.js  # Task dọn dẹp refresh token
├── app.js                   # Application Entry Point
└── package.json
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng (Getting Started)

### 1. Yêu Cầu Tiền Đề (Prerequisites)
- **Node.js**: `>= v18.x`
- **PostgreSQL**: `>= 14.x`
- **Redis**: `>= 6.x` (Tùy chọn, ứng dụng tự động Fallback nếu không kết nối được Redis)

### 2. Cài Đặt Ứng Dụng
```bash
# Clone repository
git clone <YOUR_REPOSITORY_URL>
cd fashion-ecommerce-backend

# Cài đặt các dependencies
npm install
```

### 3. Cấu Hình Biến Môi Trường (Environment Variables)
Tạo file `.env` tại thư mục gốc của project (tham khảo template tại file `.env.example`):

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

# OpenAI API Key
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
Ứng dụng sẽ chạy tại địa chỉ `http://localhost:3000`.

---

## 🌐 Các Danh Mục API Chính (API Endpoints Overview)

| Phương thức | Endpoint | Mô tả | Phân quyền |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/register` | Gửi mã OTP đăng ký tài khoản qua Email | Public |
| **POST** | `/api/verify-otp` | Xác thực OTP & tạo tài khoản người dùng | Public |
| **POST** | `/api/login` | Đăng nhập hệ thống & cấp phát JWT Tokens | Public |
| **POST** | `/api/refresh` | Cấp mới Access Token bằng Refresh Token | Public |
| **GET** | `/api/auth/google` | Đăng nhập bằng Google OAuth 2.0 | Public |
| **POST** | `/api/ai/chat/start` | Khởi tạo / tiếp tục phiên chat với AI Stylist | User |
| **POST** | `/api/ai/chat` | Gửi tin nhắn chat & nhận gợi ý outfit từ AI "Luna" | User |
| **GET** | `/api/ai/chat/load-messages` | Tải lịch sử chat (Cursor Pagination) | User |
| **POST** | `/api/events` | Ghi nhận sự kiện hành vi người dùng (View, Favorite,...) | Public/User |
| **GET** | `/public/home-products` | Lấy danh sách sản phẩm trang chủ (Cursor Pagination) | Public |
| **POST** | `/user/orders` | Tạo đơn hàng mới (Multi-statement Transaction) | User |
| **GET** | `/user/cart` | Lấy danh sách giỏ hàng của người dùng | User |
| **POST** | `/payment/paypal/create` | Khởi tạo giao dịch thanh toán PayPal | User |
| **POST** | `/payment/paypal/capture` | Bắt giữ (Capture) tiền giao dịch PayPal | User |
| **POST** | `/payment/paypal/webhook` | Lắng nghe Webhook tự động từ PayPal | Public |
| **GET** | `/admin/stats/revenue` | Báo cáo doanh thu (Sử dụng Materialized View) | Admin |
| **GET** | `/admin/products` | Quản lý danh sách sản phẩm hệ thống | Admin |

---

## 📜 Giấy Phép (License)
Dự án được bảo lưu mọi quyền phục vụ cho Đồ Án Tốt Nghiệp (DATN).
