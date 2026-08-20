# BÁO CÁO TOÀN DIỆN HỆ THỐNG QUẢN LÝ KHO (WAREHOUSE MANAGEMENT SYSTEM - WMS)
**Dự án:** Nền Tảng Thương Mại Điện Tử Thời Trang May Đo Cao Cấp (HS Atelier E-Commerce)  
**Kiến trúc:** Microservices & Multi-Container Docker Architecture  
**Tác giả:** Đội ngũ Kỹ thuật & Kiến trúc Hệ thống  
**Ngày cập nhật:** 20/08/2026  
**Trạng thái tài liệu:** Bản đặc tả nghiệp vụ & kỹ thuật chính thức (Official Specification)  

---

## MỤC LỤC
1. [TỔNG QUAN HỆ THỐNG & MỤC TIÊU NGHIỆP VỤ](#1-tổng-quan-hệ-thống--mục-tiêu-nghiệp-vụ)
2. [KIẾN TRÚC CÔNG NGHỆ & SƠ ĐỒ HỆ THỐNG](#2-kiến-trúc-công-nghệ--sơ-đồ-hệ-thống)
3. [NGUYÊN TẮC CỐT LÕI: MÔ HÌNH TỒN KHO 3 LỚP (KÈM VÍ DỤ SỐ LIỆU)](#3-nguyên-tắc-cốt-lõi-mô-hình-tồn-kho-3-lớp-kèm-ví-dụ-số-liệu)
4. [CHI TIẾT 5 LUỒNG NGHIỆP VỤ KHO (LỒNG GHÉP VÍ DỤ VẬN HÀNH THỰC TẾ)](#4-chi-tiết-5-luồng-nghiệp-vụ-kho-lồng-ghép-ví-dụ-vận-hành-thực-tế)
   - [4.1. Luồng 1: Nhập Kho Nhà Cung Cấp (Inbound - Đơn PO & Phiếu GRN)](#41-luồng-1-nhập-kho-nhà-cung-cấp-inbound---đơn-po--phiếu-grn)
   - [4.2. Luồng 2: Xuất Kho Đơn Hàng & Vận Hành (Outbound Fulfillment - GIN)](#42-luồng-2-xuất-kho-đơn-hàng--vận-hành-outbound-fulfillment---gin)
   - [4.3. Luồng 3: Hàng Hoàn Trả & Xử Lý Hàng Boom (Reverse Logistics)](#43-luồng-3-hàng-hoàn-trả--xử-lý-hàng-boom-reverse-logistics)
   - [4.4. Luồng 4: Kiểm Kê Định Kỳ & Cân Bằng Lệch Tồn (Stocktake & Variance)](#44-luồng-4-kiểm-kê-định-kỳ--cân-bằng-lệch-tồn-stocktake--variance)
   - [4.5. Luồng 5: Điều Chuyển Kho & Xuất Hủy Hao Hụt (Transfer & Write-off)](#45-luồng-5-điều-chuyển-kho--xuất-hủy-hao-hụt-transfer--write-off)
5. [CƠ CHẾ ĐỒNG BỘ DỮ LIỆU & CHỐNG BÁN QUÁ TỒN (SAGA & REDLOCK)](#5-cơ-chế-đồng-bộ-dữ-liệu--chống-bán-quá-tồn-saga--redlock)
6. [BẢNG TRA CỨU MÃ GIAO DỊCH SỔ KHO BẤT BIẾN (INVENTORY LEDGER)](#6-bảng-tra-cứu-mã-giao-dịch-sổ-kho-bất-biến-inventory-ledger)
7. [DANH MỤC RESTFUL API WMS DÀNH CHO ADMIN](#7-danh-mục-restful-api-wms-dành-cho-admin)

---

# 1. TỔNG QUAN HỆ THỐNG & MỤC TIÊU NGHIỆP VỤ

### 1.1. Bối cảnh
Trong nền tảng E-commerce thời trang may đo cao cấp (Haute Couture), quản trị kho hàng (**Warehouse Management System - WMS**) là trái tim điều phối chuỗi cung ứng: từ nhập hàng nhà phân phối, kiểm đếm chất lượng (QC), lưu kho theo vị trí ô kệ (`bin_location`), phân bổ tồn kho (`stock allocation`) cho đơn hàng trực tuyến, đến kiểm kê và xử lý hàng hoàn/boom.

Khi có chiến dịch Flash Sale với hàng chục ngàn lượt truy cập, việc tách WMS thành một **Microservice độc lập chạy trong Docker Container riêng** mang lại các lợi ích vượt trội:
- **Độc lập vận hành (Fault Isolation):** Lỗi gián đoạn ở phần thanh toán đơn hàng online không làm tê liệt hoạt động quét mã xuất/nhập thực tế tại cửa kho.
- **Tối ưu hóa tài nguyên (Scalability):** Dễ dàng mở rộng riêng WMS Service hoặc Database khi lưu lượng hàng hóa tăng cao.
- **Codebase phân định rõ ràng:** Không bị xung đột giữa logic bán hàng (Cart/Checkout) và logic nghiệp vụ kho bãi (Stock/PO/GRN/GIN).

---

# 2. KIẾN TRÚC CÔNG NGHỆ & SƠ ĐỒ HỆ THỐNG

### Sơ đồ kiến trúc dạng khối trực quan (Dễ đọc trên mọi trình soạn thảo):

```
+-----------------------------------------------------------------------------------+
|                        TẦNG GIAO DIỆN NGƯỜI DÙNG (CLIENTS)                        |
|   - Admin Dashboard Portal (Next.js 14 / TypeScript)                             |
|   - Customer Storefront Web (Next.js 14 / Tailwind CSS)                          |
+-----------------------------------------+-----------------------------------------+
                                          | (HTTP REST API)
                                          v
+-----------------------------------------------------------------------------------+
|                          TẦNG ỨNG DỤNG BACKEND SERVICES                           |
|                                                                                   |
|   [ MAIN BACKEND CORE ] (Port 5000)      |   [ WMS INVENTORY SERVICE ] (Port 5001)|
|   - Auth & Quản lý User                  |   - Quản lý Nhà kho & Vị trí kệ        |
|   - Catalog Sản phẩm & Biến thể          |   - Quản lý Tồn kho 3 lớp (Stock)      |
|   - Giỏ hàng, Đơn hàng & Thanh toán      |   - Phiếu Nhập GRN / Phiếu Xuất GIN    |
|   - Khuyến mãi & Flash Sale              |   - Kiểm kê kho & Sổ kho (Audit Log)   |
+--------------------+---------------------+--------------------+-------------------+
                     |                                          |
                     +--------------------+---------------------+
                                          |
                                          v (AMQP Event Bus)
+-----------------------------------------------------------------------------------+
|                          TẦNG HẠ TẦNG DỮ LIỆU (INFRASTRUCTURE)                    |
|                                                                                   |
|   [ RABBITMQ EVENT BUS ] (Port 5672)     -> Điều phối SAGA bất đồng bộ            |
|   [ REDIS CACHE & REDLOCK ] (Port 6379)  -> Cache tồn tức thời & Khóa chống bán quá |
|   [ POSTGRESQL 16 ENGINE ] (Port 5432)   -> DB: fashion_ecommerce & fashion_wms   |
+-----------------------------------------------------------------------------------+
```

### Bảng công nghệ chi tiết:
| Thành phần | Công nghệ | Vai trò kỹ thuật |
| :--- | :--- | :--- |
| **Frontend UI** | Next.js 14, TypeScript, Tailwind CSS | Giao diện điều phối kho, lập phiếu nhập/xuất, quét mã barcode, theo dõi tồn kho. |
| **Core Backend** | Node.js, Express.js, Prisma ORM | Quản lý người dùng, giỏ hàng, đặt hàng, khuyến mãi và thanh toán online. |
| **WMS Service** | Node.js, Express.js, Native PG Pool | Xử lý chuyên sâu: Quản lý vị trí kệ, tồn kho 3 lớp, phiếu kho, kiểm kê và sổ kho. |
| **Database** | PostgreSQL 16 Alpine | Lưu trữ quan hệ ACID, ràng buộc khóa ngoại UUID, dữ liệu biến thể JSONB. |
| **Message Queue**| RabbitMQ 3 Management | Truyền nhận thông điệp bất đồng bộ (SAGA Pattern) giữa 2 service. |
| **Cache & Lock** | Redis 7 Alpine | Caching tồn kho khả dụng thời gian thực và khóa phân tán (Distributed Redlock). |

---

# 3. NGUYÊN TẮC CỐT LÕI: MÔ HÌNH TỒN KHO 3 LỚP (KÈM VÍ DỤ SỐ LIỆU)

Để ngăn ngừa triệt để tình trạng **Bán Vượt Quá Số Lượng Tồn Thực Tế (Overselling)** khi khách đã đặt đơn nhưng bưu tá chưa tới lấy hàng, hệ thống bắt buộc áp dụng công thức:

```
[TỒN KHẢ DỤNG ĐỂ BÁN] = [TỒN VẬT LÝ TRONG KHO] - [TỒN TẠM GIỮ (ĐÃ ĐẶT HÀNG)]

Công thức chuẩn: available_qty = on_hand_qty - allocated_qty
```

### Sơ đồ cấu trúc tồn kho 3 lớp:
```
+-------------------------------------------------------------------------+
|                        TỔN THỰC TẾ (on_hand_qty)                        |
|                                100 chiếc                                |
+------------------------------------+------------------------------------+
|    TỒN TẠM GIỮ (allocated_qty)     |    TỒN KHẢ DỤNG (available_qty)    |
|    20 chiếc (Khách đặt, chờ xuất)  |    80 chiếc (Cho phép khách mua)   |
+------------------------------------+------------------------------------+
```

### Bảng giải thích chi tiết kèm ví dụ minh họa:
Giả sử tại **Kho Tân Bình**, sản phẩm **"Áo Blazer Silk Lụa Tằm - Size L - Đen Tuyển" (Mã SKU: BLAZER-L-BLK)** có các trạng thái như sau:

| Thuộc tính | Tên gọi | Định nghĩa nghiệp vụ | Ví dụ số liệu thực tế |
| :--- | :--- | :--- | :--- |
| **`on_hand_qty`** | Tồn vật lý thực tế | Số lượng áo thực sự đang nằm trên giá kệ trong kho. | Trong kho có đúng **100 chiếc** áo Blazer. |
| **`allocated_qty`** | Tồn tạm giữ (Khóa đơn) | Số lượng áo khách đã bấm đặt mua thành công trên web, đang chờ nhân viên lấy hàng & đóng gói. | Khách vừa đặt mua **20 chiếc** (đang gom hàng). |
| **`available_qty`** | Tồn khả dụng bán | Số lượng còn lại cho phép khách hàng mới tiếp tục đặt mua trên website (`100 - 20 = 80`). | Khách mới vào web chỉ thấy còn **80 chiếc** để mua. |
| **`inventory_transactions`** | Sổ kho Bất biến (Ledger) | Nhật ký ghi nhận toàn bộ biến động theo nguyên tắc **Chỉ thêm mới (Append-Only)**, không bao giờ sửa/xóa. | Ghi nhận: *Ngày 20/08, Đơn hàng #DH-102 khóa tạm giữ 2 chiếc, ai thực hiện, số dư sau giao dịch.* |

---

# 4. CHI TIẾT 5 LUỒNG NGHIỆP VỤ KHO (LỒNG GHÉP VÍ DỤ VẬN HÀNH THỰC TẾ)

### Sơ đồ tổng quát 5 luồng nghiệp vụ:
```
+-------------------+      1. Đơn Mua PO & Nhập GRN      +-----------------------+
| NHÀ CUNG CẤP /    | ---------------------------------> | KHO VẬT LÝ            |
| ĐỐI TÁC PHÂN PHỐI |                                    | (on_hand_qty tăng lên)|
+-------------------+                                    +-----------+-----------+
                                                                     |
                     +-----------------------------------------------+
                     |
                     | 2. Khách đặt đơn (allocated tăng / available giảm)
                     v
             +---------------+    Giao hàng thành công (Xuất GIN)   +-------------------+
             | XỬ LÝ ĐƠN HÀNG| -----------------------------------> | KHÁCH HÀNG        |
             +-------+-------+                                      | NHẬN ĐƯỢC HÀNG    |
                     |                                              +-------------------+
                     | 3. Hàng hoàn / Boom hàng (Nhập lại RETURN_GRN)
                     v
             +---------------+
             | KHO VẬT LÝ    | <--- 4. Kiểm kê định kỳ (Stocktake & Cân bằng tồn)
             +-------+-------+
                     |
                     | 5. Xuất hủy hàng rách, ẩm mốc (Xuất WRITE_OFF)
                     v
             +---------------+
             | KHU PHẾ PHẨM  |
             +---------------+
```

---

### 4.1. Luồng 1: Nhập Kho Nhà Cung Cấp (Inbound - Đơn PO & Phiếu GRN)
* **Mục tiêu:** Quản lý vòng đời mua hàng từ Đối tác/Nhà phân phối cho đến khi hàng được xếp gọn gàng vào ô kệ.

#### Các bước thực hiện:
```
[Bước 1: Quản lý tạo Đơn Mua PO] -> Trạng thái: DRAFT -> APPROVED -> Gửi sang NCC
  |
[Bước 2: Xe hàng tới cửa kho] -> Thủ kho quét mã Barcode, kiểm đếm chất lượng (QC)
  |
[Bước 3: Tạo Phiếu Nhập GRN] -> Hệ thống tự động:
  + Tăng tồn vật lý: on_hand_qty = on_hand_qty + Số lượng nhập
  + Tăng tồn khả dụng: available_qty = available_qty + Số lượng nhập
  + Gán vị trí ô kệ lưu trữ: Ví dụ KE-A1-TANG2
  + Ghi 1 dòng vào Sổ kho bất biến (Mã giao dịch: INBOUND_PO)
  |
[Bước 4: Đồng bộ] -> Cập nhật Redis Cache và in biên bản nhập kho
```

#### 📦 VÍ DỤ VẬN HÀNH LUỒNG 1:
* **Tình huống:** Quản lý kho tạo đơn mua **PO-20260820-001** đặt mua **50 chiếc Áo Sơ Mi Lụa (Size M)** từ Nhà phân phối Coolmate.
* **Số liệu trước khi nhập:** `on_hand_qty = 10`, `allocated_qty = 0`, `available_qty = 10`.
* **Diễn biến khi xe giao 50 chiếc tới:** Thủ kho kiểm tra đường may đạt chuẩn, tạo phiếu nhập **GRN-9912**:
  - `on_hand_qty` tăng: `10 + 50 = 60 chiếc`.
  - `available_qty` tăng: `10 + 50 = 60 chiếc`.
  - Sổ kho ghi nhận: `[20/08/2026 14:00] | SKU: SOMI-M-WHT | Type: INBOUND_PO | Số lượng: +50 | Ref: GRN-9912 | Vị trí: KE-A1-T2`.

---

### 4.2. Luồng 2: Xuất Kho Đơn Hàng & Vận Hành (Outbound Fulfillment - GIN)
* **Mục tiêu:** Tự động giữ hàng khi khách bấm mua và trừ tồn vật lý khi bàn giao cho bưu tá giao vận.

#### Các bước thực hiện:
```
[Bước 1: Khách bấm Mua trên Web] 
  -> Main Backend phát event sang WMS Service
  -> Tăng tồn tạm giữ: allocated_qty = allocated_qty + Số lượng mua
  -> Tồn khả dụng tự động giảm: available_qty = on_hand_qty - allocated_qty
  -> (Lúc này tồn vật lý on_hand_qty vẫn giữ nguyên vì hàng vẫn nằm trên kệ)
  |
[Bước 2: In Phiếu Lấy Hàng (Pick List)]
  -> Nhân viên đến đúng vị trí kệ lấy áo -> Bàn đóng gói hộp quà cao cấp
  |
[Bước 3: Bàn giao bưu tá & Kích hoạt Phiếu Xuất GIN]
  -> Nhân viên quét mã vận đơn Viettel Post / GHTK -> Tạo phiếu GIN
  -> Trừ tồn vật lý: on_hand_qty = on_hand_qty - Số lượng xuất
  -> Trừ tồn tạm giữ: allocated_qty = allocated_qty - Số lượng xuất
  -> Ghi 1 dòng vào Sổ kho bất biến (Mã giao dịch: OUTBOUND_ORDER)
```

#### 📦 VÍ DỤ VẬN HÀNH LUỒNG 2:
* **Tình huống:** Khách hàng Nguyễn Văn A lên website bấm mua **02 chiếc Áo Blazer Lụa (Size L)**.
* **Giai đoạn 1 (Lúc khách bấm Đặt Hàng lúc 10:00):**
  - Tồn kho ban đầu: `on_hand_qty = 100`, `allocated_qty = 0`, `available_qty = 100`.
  - Hệ thống tự động khóa 2 chiếc: `allocated_qty = 2`, `available_qty = 100 - 2 = 98 chiếc` (khách khác chỉ thấy còn 98 chiếc để mua).
  - Tồn vật lý trong kho `on_hand_qty` vẫn là **100 chiếc** (vì áo vẫn còn nằm trên kệ, nhân viên chưa lấy đi).
* **Giai đoạn 2 (Lúc đóng gói và bàn giao bưu tá lúc 14:00):**
  - Nhân viên quét mã vận đơn, kích hoạt phiếu xuất **GIN-8831**:
  - `on_hand_qty` giảm: `100 - 2 = 98 chiếc`.
  - `allocated_qty` giảm: `2 - 2 = 0 chiếc`.
  - `available_qty` giữ nguyên: `98 chiếc`.
  - Sổ kho ghi nhận: `Type: OUTBOUND_ORDER | Số lượng: -2 | Ref: GIN-8831 | Đơn hàng: #DH-102`.

---

### 4.3. Luồng 3: Hàng Hoàn Trả & Xử Lý Hàng Boom (Reverse Logistics)
* **Mục tiêu:** Kiểm định chất lượng hàng khách đổi trả hoặc hàng không giao được (Boom hàng) để nhập lại kho hoặc chuyển thanh lý.

#### Các bước thực hiện:
```
[Kiện hàng hoàn về cửa kho] -> Thủ kho mở gói và kiểm tra chất lượng (QC)
  |
  +---> [Trường hợp 1: Hàng nguyên tem mác, đạt chuẩn]
  |       -> Tạo Phiếu Nhập Hoàn (RETURN_GRN)
  |       -> Tăng on_hand_qty + 1 và Tăng available_qty + 1
  |       -> Ghi Sổ kho: RETURN_RESTOCK
  |       -> Đưa sản phẩm trở lại kệ để tiếp tục mở bán trên web
  |
  +---> [Trường hợp 2: Hàng bị rách vải, ố bẩn hoặc hỏng hóc]
          -> Chuyển sang khu vực cách ly hàng lỗi
          -> Tạo Phiếu Xuất Hủy (WRITE_OFF)
          -> Trừ hẳn khỏi tồn vật lý: on_hand_qty = on_hand_qty - 1
          -> Ghi Sổ kho: DAMAGED_WRITE_OFF
```

#### 📦 VÍ DỤ VẬN HÀNH LUỒNG 3:
* **Tình huống:** Đơn hàng 01 Áo Polo bị khách từ chối nhận (Boom hàng) được bưu tá hoàn về kho.
* **Trường hợp 1 (Hàng nguyên vẹn 100%):** Thủ kho kiểm tra áo còn nguyên tag mác, tạo phiếu **RETURN_GRN-101**:
  - Tăng `on_hand_qty` +1, tăng `available_qty` +1. Chiếc áo ngay lập tức xuất hiện trở lại trên website để người khác mua.
* **Trường hợp 2 (Hàng bị ướt/rách bao bì trong lúc vận chuyển):** Tạo phiếu **WRITE_OFF**, ghi nhận lỗi vận chuyển, trừ hẳn khỏi kho hàng bán để làm việc với đơn vị bảo hiểm bưu cục.

---

### 4.4. Luồng 4: Kiểm Kê Định Kỳ & Cân Bằng Lệch Tồn (Stocktake & Variance)
* **Mục tiêu:** Đối soát số lượng thực tế tại kho với số lượng trên phần mềm, phát hiện thất thoát và cân bằng sổ sách.

#### 📦 VÍ DỤ VẬN HÀNH LUỒNG 4:
1. **Khởi tạo:** Ngày 31/08, Admin lập phiếu kiểm kê **STK-20260831** cho toàn bộ nhóm **Quần Tây May Đo**.
2. **Số liệu trên phần mềm (System Qty):** Hệ thống ghi nhận tồn là **100 chiếc**.
3. **Thủ kho đi đếm thực tế (Physical Count):** Cầm máy quét barcode đếm từng chiếc trên kệ, thực tế chỉ có **98 chiếc** (bị mất 2 chiếc do rách hoặc nhầm size).
4. **Tính toán chênh lệch:**
   ```
   Chênh lệch (Variance) = Tồn thực tế (98) - Tồn hệ thống (100) = -2 chiếc (Lệch âm)
   ```
5. **Phê duyệt cân bằng kho:**
   - Quản lý kho duyệt biên bản giải trình lý do: *"Hao hụt rách sợi vải 02 chiếc"*.
   - Hệ thống tự động giảm `on_hand_qty` từ `100` thành `98 chiếc`.
   - Ghi sổ kho: `Type: STOCKTAKE_ADJ | Số lượng: -2 | Ref: STK-20260831 | Ghi chú: Cân bằng kiểm kê định kỳ`.

---

### 4.5. Luồng 5: Điều Chuyển Kho & Xuất Hủy Hao Hụt (Transfer & Write-off)
* **Mục tiêu:** Điều phối hàng hóa giữa các chi nhánh kho (Kho Tổng Tân Bình sang Kho Outlet Quận 1) hoặc xuất hủy phế phẩm.

#### 📦 VÍ DỤ VẬN HÀNH LUỒNG 5:
* **Tình huống Điều chuyển:** Chuyển **20 chiếc Áo Thun** từ **Kho Tổng (Tân Bình)** sang **Kho Chi Nhánh (Quận 1)**.
  - **Kho Tổng:** Lập phiếu `TRANSFER_OUT-01`, trừ 20 chiếc tại Kho Tổng, hàng chuyển sang trạng thái đang trên đường đi (`in_transit_qty = 20`).
  - **Kho Chi Nhánh:** Khi xe hàng đến, thủ kho Quận 1 quét mã nhận hàng, tạo phiếu `TRANSFER_IN-01`, cộng 20 chiếc vào tồn kho Quận 1.

---

# 5. CƠ CHẾ ĐỒNG BỘ DỮ LIỆU & CHỐNG BÁN QUÁ TỒN (SAGA & REDLOCK)

Khi diễn ra sự kiện Flash Sale với hàng ngàn người cùng bấm mua 1 chiếc áo trong cùng 1 giây:

### 1. Khóa phân tán Redis Redlock (Distributed Locking)
Trước khi trừ tồn kho, Main Backend bắt buộc phải xin quyền khóa (`acquire lock`) trên Redis theo khóa `lock:stock:variant:<id>`:
```javascript
// Mã nguồn minh họa cơ chế khóa tồn kho an toàn
const lock = await redlock.acquire([`lock:stock:${variantId}`], 1000); // Khóa trong 1000ms
try {
    const available = await getAvailableStock(variantId);
    if (available < requestedQty) {
        throw new Error('Sản phẩm đã hết hàng trong chớp mắt!');
    }
    // Khóa tạm giữ tồn kho an toàn
    await allocateStock(variantId, requestedQty);
} finally {
    // Giải phóng khóa cho request tiếp theo
    await lock.release();
}
```

### 2. Mô hình SAGA Pattern qua RabbitMQ
Nếu ngân hàng từ chối thẻ tín dụng của khách sau khi hệ thống đã tạm giữ tồn kho, Main Backend sẽ phát ra sự kiện `PAYMENT_FAILED`. WMS lắng nghe và tự động thực hiện **Giao Dịch Bù Trừ (Compensating Transaction)** để nhả lại `allocated_qty` về lại cho người mua khác.

---

# 6. BẢNG TRA CỨU MÃ GIAO DỊCH SỔ KHO BẤT BIẾN (INVENTORY LEDGER)

Mọi giao dịch trong bảng `inventory_transactions` đều có mã định danh chuẩn hóa:

| Mã giao dịch (`type`) | Nghiệp vụ thực tế | Tác động `on_hand_qty` | Tác động `allocated_qty` | Ý nghĩa vận hành |
| :--- | :--- | :---: | :---: | :--- |
| **`INBOUND_PO`** | Nhập hàng theo đơn mua từ NCC | Tăng (+) | Không đổi | Hàng mới về kho lưu trữ. |
| **`OUTBOUND_ORDER`** | Xuất kho giao đơn hàng cho khách | Giảm (-) | Giảm (-) | Bàn giao cho bưu tá giao vận. |
| **`RETURN_RESTOCK`** | Nhập lại hàng đổi trả/boom hàng đạt chuẩn | Tăng (+) | Không đổi | Sản phẩm đạt QC mở bán lại. |
| **`STOCKTAKE_ADJ`** | Cân bằng kho sau kiểm kê | Tăng (+) hoặc Giảm (-) | Không đổi | Đồng bộ sai lệch thực tế. |
| **`WRITE_OFF`** | Xuất hủy hàng lỗi, hỏng | Giảm (-) | Không đổi | Thanh lý hàng phế phẩm. |
| **`TRANSFER_OUT`** | Xuất kho điều chuyển đi | Giảm (-) | Không đổi | Hàng rời khỏi kho nguồn. |
| **`TRANSFER_IN`** | Nhập kho điều chuyển đến | Tăng (+) | Không đổi | Hàng nhập vào kho đích. |

---

# 7. DANH MỤC RESTFUL API WMS DÀNH CHO ADMIN

WMS Microservice cung cấp bộ API chuẩn trên cổng **Port 5001**:

### 1. Quản lý Kho & Tồn Kho:
* `GET /api/wms/warehouses` — Lấy danh sách các nhà kho vật lý.
* `GET /api/wms/inventory/stocks` — Xem tồn kho 3 lớp theo từng SKU và từng vị trí ô kệ.
* `GET /api/wms/inventory/transactions` — Tra cứu Sổ kho bất biến (Audit Trail Log).

### 2. Quản lý Nhập Kho (Inbound):
* `POST /api/wms/purchase-orders` — Khởi tạo đơn đặt hàng mua từ Nhà phân phối (PO).
* `POST /api/wms/goods-receipt-notes` — Tạo phiếu nhập kho thực tế (GRN).

### 3. Quản lý Xuất Kho & Kiểm Kê:
* `POST /api/wms/goods-issue-notes` — Tạo phiếu xuất kho đơn hàng (GIN).
* `POST /api/wms/stocktakes` — Khởi tạo đợt kiểm kê kho vật lý.
* `POST /api/wms/stocktakes/:id/approve` — Phê duyệt biên bản cân bằng chênh lệch tồn.

---

### TỔNG KẾT
Tài liệu này đã được chuẩn hóa định dạng văn bản trực quan 100%, loại bỏ hoàn toàn các ký hiệu toán học LaTeX gây lỗi hiển thị, sử dụng sơ đồ khối ASCII và bảng biểu rõ ràng giúp người đọc dễ dàng tiếp thu toàn bộ kiến trúc công nghệ và quy trình vận hành kho.
