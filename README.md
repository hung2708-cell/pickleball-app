# Pickleball Tournament Manager (Cấu trúc tách module)

## 1. Cấu trúc thư mục ("Sai đâu sửa đấy")
- `index.html`: Khung giao diện chính.
- `style.css`: Toàn bộ giao diện (Mobile, PC, chế độ màn hình TV).
- `js/config.js`: **Cấu hình Firebase Realtime Database** & mật khẩu mặc định.
- `js/state.js`: Lưu trữ dữ liệu & tự động đồng bộ Firebase (hoặc LocalStorage khi test offline).
- `js/rules.js`: Luật chấm điểm Pickleball (Side-out `0-0-2`, Rally, đổi sân, Timeout, Lỗi kỹ thuật, Undo, Match Log).
- `js/bracket.js`: Xếp hạng vòng bảng chuẩn điều lệ & đẩy nhánh loại trực tiếp (Serie A/B).
- `js/viewer.js`: Màn hình Khán giả, tra cứu lịch cá nhân, chế độ TV, mã QR.
- `js/referee.js`: Giao diện chấm điểm cho Trọng tài (có khóa lọc theo sân).
- `js/admin.js`: Khu vực Quản lý (nhập VĐV, chia bảng, xếp sân cảnh báo trùng, xuất CSV, đổi mật khẩu).
- `js/app.js`: Điều hướng tab & đăng nhập phân quyền.

## 2. Cách chạy thử ngay trên máy
1. Giải nén thư mục `pickleball-manager`.
2. Nháy đúp mở thẳng file `index.html` bằng Chrome/Safari/Edge (không cần cài server).
3. Mật khẩu mặc định ban đầu:
   - **Trọng tài:** `tt123`
   - **Quản lý (BTC):** `admin123`

## 3. Kết nối Firebase & đưa lên GitHub Pages
1. Mở file `js/config.js`, dán thông số `firebaseConfig` (đặc biệt là `apiKey` và `databaseURL`) từ Firebase Console của bạn.
2. Đẩy toàn bộ thư mục này lên repository GitHub Pages là dùng được ngay trên điện thoại trọng tài và khán giả.
