# Lời Nhắc

Ứng dụng nhắc việc & quản lý thời gian cá nhân (web app / PWA, chạy được trên điện thoại và máy tính, lưu dữ liệu ngay trên thiết bị).

## Chạy thử

Mở thẳng `index.html` bằng trình duyệt là dùng được. Để có thông báo + cài lên màn hình chính (PWA), chạy qua một server tĩnh:

```bash
npx serve .
# hoặc
python -m http.server 8080
```

rồi mở `http://localhost:8080`.

## Tính năng

- **Nhập nhanh bằng ngôn ngữ tự nhiên (tiếng Việt)** — gõ `Họp marketing thứ 6 tuần sau lúc 9h sáng tại phòng 201`, app tự tách tiêu đề / ngày / giờ / địa điểm. Có xem trước trước khi thêm.
- **Nói để tạo việc** — bấm micro, nói nhiều việc cách nhau bằng "và", "rồi", app tách thành từng việc.
- **Hai góc nhìn**: Danh sách (Hôm nay / Sắp tới / Tất cả / Đã xong) và Lịch (tuần + dòng thời gian trong ngày). Vuốt ngang để đổi.
- **Thao tác vuốt**: vuốt phải = xong, vuốt trái = để sau (15 phút / 1 giờ / tối nay / sáng mai / tuần sau).
- **Kéo thả** việc chưa có giờ vào khung giờ trên lịch; chạm vào khung giờ trống để tạo sự kiện.
- **Xếp giờ tự động** cho việc chưa có giờ dựa trên khoảng trống trong giờ làm việc; **cảnh báo trùng lịch** kèm gợi ý giờ khác.
- **Chia nhỏ việc** lớn thành các bước có hạn dự kiến (chạy offline, không cần API).
- **Nút hành động nhanh**: tự nhận link họp, số điện thoại, mã vận đơn, email trong ghi chú.
- **Tóm tắt sáng / xem lại tối**, dời toàn bộ việc chưa xong sang mai bằng một chạm.
- **Giao diện**: sáng / tối / theo máy, đổi màu chủ đạo (6 màu sẵn + màu tuỳ chọn), đặt ảnh từ máy làm hình nền (chỉnh độ mờ, làm mờ ảnh).
- Xuất / nhập dữ liệu dạng JSON.

## Cấu trúc

```
index.html       giao diện
css/styles.css   kiểu dáng, theme
js/nlp.js        bóc tách ngôn ngữ tự nhiên, chia nhỏ việc, nhận diện hành động
js/store.js      lưu trữ (localStorage + IndexedDB cho ảnh nền)
js/theme.js      sáng/tối, màu, hình nền
js/app.js        logic ứng dụng
fonts/           đặt font Delight vào đây nếu có (xem fonts/README.md)
```

## Font

Dùng **Archivo** (Google Fonts). Có thể thay bằng Delight — xem `fonts/README.md`.
