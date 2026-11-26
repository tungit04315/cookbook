# Yummy Recipes 🍳

Ứng dụng sổ tay công thức nấu ăn cá nhân — pastel, bo góc mềm, mobile-first.
Vanilla HTML/CSS/JS + Firebase — **chỉ dùng Firestore**, không dùng Authentication,
không dùng Firebase Storage, không dùng Firebase Hosting. Mở link lên là dùng
được ngay, không cần đăng nhập.

## 1. Kiến trúc dữ liệu

| Collection        | Mục đích                                   | Field chính |
|--------------------|---------------------------------------------|-------------|
| `recipes`          | Toàn bộ công thức (Bảng 1)                  | name, **imageId** (trỏ tới ảnh ở bảng 2), imageUrl (dự phòng cho ảnh mẫu/link ngoài), categoryId, description, prepTime, cookTime, servings, difficulty, ingredients[], steps[], tips, notes, videoLink, status, isFavorite, cookCount, createdAt, updatedAt |
| `recipe_images`    | Kho ảnh (Bảng 2) — mỗi document là 1 ảnh đã nén nhỏ | **data** (chuỗi base64 dạng `data:image/jpeg;base64,...`), createdAt |
| `categories`       | Danh mục món ăn                             | name, icon, createdAt |
| `cooking_logs`     | Nhật ký các lần đã nấu                      | recipeId, date, rating, note, createdAt |
| `app_settings`     | Cài đặt chung (1 document cố định, id = `main`) | appName, logoEmoji, theme |

### Cách lưu ảnh

- Người dùng dán **link ảnh** (`http://` hoặc `https://`, trỏ thẳng tới file ảnh), app lưu vào field `imageUrl` của `recipes`. App không tải ảnh lên đâu cả.
- Ảnh phụ thuộc nơi lưu trữ bên ngoài: nếu link bị xoá hoặc nơi đó chặn nhúng ảnh thì ảnh sẽ không hiển thị.
- **Ảnh cũ:** công thức đã có `imageId` vẫn đọc ảnh base64 từ `recipe_images`. Khi thay bằng link mới, ảnh cũ được xoá nếu không còn công thức nào dùng chung.

## 2. Luồng hoạt động

- Mở app → không có màn hình đăng nhập, kết nối Firestore ngay và lắng nghe realtime (`onSnapshot`) toàn bộ 5 collection trên → tự render lại UI mỗi khi dữ liệu đổi.
- Lần đầu mở mà Firestore đang trống → tự tạo danh mục & công thức mẫu để giao diện đẹp ngay.
- Thêm/sửa công thức → dán link ảnh → lưu vào `imageUrl` của `recipes`.
- Bấm ❤️ → cập nhật Firestore ngay lập tức (optimistic realtime).
- Tìm kiếm & lọc → xử lý phía client (đủ nhanh cho quy mô dữ liệu cá nhân).
- Xuất dữ liệu → file `.json` gồm công thức, danh mục, nhật ký, cài đặt và các ảnh base64 mà công thức đang dùng. Ảnh dạng link chỉ lưu link, không sao chép file ảnh.
- Nhập dữ liệu → kiểm tra file, hỏi xác nhận, rồi ghi theo nhiều `batch` và **giữ nguyên ID**. Bản ghi trùng ID (và cài đặt) bị ghi đè theo file, dữ liệu khác được giữ nguyên, nhập lại cùng một file không tạo bản trùng. Nếu lỗi giữa chừng, chỉ một phần được nhập: hãy nhập lại file.
- File xuất từ phiên bản cũ vẫn nhập được, nhưng không chứa ảnh base64.

**Cấu trúc thư mục**
```
yummy-recipes/
├── index.html            # khung SPA (app shell, không có màn đăng nhập)
├── css/style.css          # toàn bộ style pastel + dark mode
├── js/firebase-config.js
├── js/app.js               # router, CRUD, nén ảnh, render UI
├── firestore.rules
└── README.md
```

## 3. Cài đặt Firebase (bắt buộc trước khi chạy)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên bất kỳ.
2. **Build → Firestore Database → Create database** → chọn **Production mode** → chọn khu vực gần bạn.
3. Vào **Project settings (⚙️) → General → Your apps → </> Web app** → đặt tên → **Register app**.
   Firebase sẽ hiển thị đoạn `firebaseConfig`. Copy nó.
4. Mở file `js/firebase-config.js`, dán đè object `firebaseConfig` bằng đoạn vừa copy.
5. Publish rule bảo mật: mở tab **Rules** của Firestore, dán nội dung file `firestore.rules` → **Publish**.
   (Không cần bật Authentication, không cần bật Storage.)

> ⚠️ **Lưu ý bảo mật:** vì không có đăng nhập, rule đang mở quyền đọc/ghi tự do (`allow read, write: if true`) để app dùng được ngay khi mở link. Bất kỳ ai có được các giá trị trong `firebaseConfig` đều có thể xem/sửa dữ liệu (kể cả ảnh). Không đăng repo lên GitHub public, không chia sẻ link app cho người khác.

> **Lưu ý composite index:** app dùng `orderBy('createdAt', ...)` trên các collection. Lần chạy đầu, nếu Firestore báo lỗi "The query requires an index" trong Console trình duyệt (F12), bấm vào link Firebase đưa ra trong lỗi đó để tự động tạo index — chỉ cần làm 1 lần cho mỗi collection (`recipes`, `categories`, `cooking_logs`).

## 4. Chạy thử

Không cần build/bundler, không cần Firebase Hosting. Chỉ cần chạy 1 server tĩnh bất kỳ (bắt buộc phải qua `http://`, vì Firebase SDK không chạy được khi mở file trực tiếp bằng `file://`):

```bash
cd yummy-recipes
npx serve .
# hoặc: python3 -m http.server 5500
```

Mở trình duyệt tới địa chỉ được in ra (vd `http://localhost:3000` hoặc `http://127.0.0.1:5500`) — vào là dùng được ngay.

Muốn dùng lâu dài, có thể host tĩnh bằng bất kỳ dịch vụ nào bạn thích (Netlify, Vercel, GitHub Pages, VPS riêng...) — chỉ cần upload đúng các file trong thư mục này.

## 5. Tính năng đã có

- **Dashboard**: thống kê tổng công thức / mới / yêu thích / danh mục, công thức mới nhất, danh mục phổ biến.
- **Vòng quay món ngon**: mở từ Trang chủ, chọn ngẫu nhiên 1 món trong toàn bộ công thức hợp lệ (có tên, không phải bản nháp). Món trùng tên (không phân biệt hoa/thường, khoảng trắng thừa, hậu tố "(bản sao)"; có phân biệt dấu) chỉ tính 1 lần. 6 ô trên vòng quay chỉ để minh hoạ. Có âm thanh vui khi quay và khi trúng (tạo bằng Web Audio, không cần file), kèm nút 🔊/🔇 và ghi nhớ lựa chọn trên thiết bị.
- **Công thức**: thêm / sửa / xoá / sao chép / đánh dấu yêu thích / lưu nháp, đầy đủ trường (ảnh, danh mục, mô tả, thời gian, khẩu phần, độ khó, nguyên liệu, các bước, mẹo, ghi chú, video).
- **Ảnh món ăn**: dán link ảnh, có xem trước.
- **Danh mục**: thêm / sửa / xoá, hiển thị số lượng món.
- **Tìm kiếm & lọc**: theo tên/nguyên liệu, danh mục, độ khó, thời gian, yêu thích, sắp xếp.
- **Nhật ký nấu ăn**: ghi ngày nấu, đánh giá sao, ghi chú, đếm số lần đã nấu theo món.
- **Yêu thích**: bấm tim để thêm/bỏ, xem danh sách riêng.
- **Import/Export**: sao lưu ra JSON và khôi phục lại, giữ nguyên liên kết giữa công thức, danh mục, ảnh và nhật ký.
- **Cài đặt**: đổi tên app, đổi logo (emoji), theme sáng/tối, quản lý danh mục, xem nhật ký.
- **Empty state** thân thiện khi chưa có dữ liệu ở mọi màn hình.

## 6. Gợi ý mở rộng thêm

- Thêm PWA (manifest + service worker) để cài lên màn hình chính điện thoại.
- Nếu sau này chia sẻ app cho nhiều người dùng hoặc public link, nên bật lại Firebase Authentication để tránh rủi ro bảo mật đã nêu ở mục 3.
