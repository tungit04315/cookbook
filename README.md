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

### Cách lưu ảnh (theo đúng mô hình bạn yêu cầu)

- **Bảng 1 — `recipes`**: chỉ lưu `imageId` (id của document ảnh tương ứng trong bảng 2), không lưu ảnh trực tiếp.
- **Bảng 2 — `recipe_images`**: mỗi ảnh người dùng tải lên được **nén nhỏ ngay trên trình duyệt** (resize còn tối đa ~900px, xuất JPEG chất lượng ~70%, tự giảm chất lượng thêm nếu vẫn còn nặng) rồi lưu thành 1 document riêng dưới dạng base64. Việc này tránh phải dùng Firebase Storage (vốn cần cấu hình CORS/bucket rule riêng — chính là lỗi CORS bạn gặp trước đó) và cũng giữ mỗi document nằm trong giới hạn 1MB của Firestore.
- **Khi hiển thị**: app lắng nghe realtime toàn bộ `recipe_images` vào bộ nhớ (`State.images`, dạng `{ [imageId]: base64 }`), rồi tra theo `recipe.imageId` để lấy ảnh — đúng luồng "truy vấn theo ID đã tạo từ bảng 1 để lấy ảnh tương ứng ở bảng 2".
- Ảnh mẫu có sẵn khi mới cài (Bánh Flan, Thịt Kho Tàu...) dùng link Unsplash trực tiếp qua field `imageUrl` (không tốn dung lượng Firestore); ảnh do bạn tự thêm luôn đi qua `recipe_images` như trên.
- Khi xoá công thức, app tự kiểm tra nếu không còn công thức nào khác dùng chung `imageId` đó thì sẽ xoá luôn ảnh trong `recipe_images` để không tồn ảnh rác. Khi sửa công thức và đổi ảnh mới, ảnh cũ cũng được xoá tương tự.

> Vì ảnh nằm trong Firestore (không phải Storage) nên **không còn lỗi CORS** như trước — mọi request chỉ là đọc/ghi Firestore bình thường.

## 2. Luồng hoạt động

- Mở app → không có màn hình đăng nhập, kết nối Firestore ngay và lắng nghe realtime (`onSnapshot`) toàn bộ 5 collection trên → tự render lại UI mỗi khi dữ liệu đổi.
- Lần đầu mở mà Firestore đang trống → tự tạo danh mục & công thức mẫu để giao diện đẹp ngay.
- Thêm/sửa công thức, chọn ảnh mới → nén ảnh → lưu vào `recipe_images` → lưu `imageId` vào `recipes`.
- Bấm ❤️ → cập nhật Firestore ngay lập tức (optimistic realtime).
- Tìm kiếm & lọc → xử lý phía client (đủ nhanh cho quy mô dữ liệu cá nhân).
- Xuất/nhập dữ liệu → xuất toàn bộ ra file `.json` (bao gồm cả ảnh base64), nhập lại bằng cách ghi `batch` vào Firestore.

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
- **Công thức**: thêm / sửa / xoá / sao chép / đánh dấu yêu thích / lưu nháp, đầy đủ trường (ảnh, danh mục, mô tả, thời gian, khẩu phần, độ khó, nguyên liệu, các bước, mẹo, ghi chú, video).
- **Ảnh món ăn**: chọn ảnh từ máy → tự nén nhỏ ngay trên trình duyệt → lưu vào Firestore (không cần Storage, không lỗi CORS).
- **Danh mục**: thêm / sửa / xoá, hiển thị số lượng món.
- **Tìm kiếm & lọc**: theo tên/nguyên liệu, danh mục, độ khó, thời gian, yêu thích, sắp xếp.
- **Nhật ký nấu ăn**: ghi ngày nấu, đánh giá sao, ghi chú, đếm số lần đã nấu theo món.
- **Yêu thích**: bấm tim để thêm/bỏ, xem danh sách riêng.
- **Import/Export**: xuất toàn bộ dữ liệu (kể cả ảnh) ra JSON, nhập lại từ file JSON.
- **Cài đặt**: đổi tên app, đổi logo (emoji), theme sáng/tối, quản lý danh mục, xem nhật ký.
- **Empty state** thân thiện khi chưa có dữ liệu ở mọi màn hình.

## 6. Gợi ý mở rộng thêm

- Nếu muốn ảnh nét hơn nữa cho những công thức "đặc biệt", có thể tăng `maxDim`/`quality` trong hàm `compressImageFile` (file `js/app.js`) — đổi lại là dung lượng Firestore tăng theo.
- Thêm PWA (manifest + service worker) để cài lên màn hình chính điện thoại.
- Thêm xác nhận 2 bước khi import (preview trước khi ghi vào Firestore).
- Nếu sau này chia sẻ app cho nhiều người dùng hoặc public link, nên bật lại Firebase Authentication để tránh rủi ro bảo mật đã nêu ở mục 3.
