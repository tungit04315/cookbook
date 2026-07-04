/* ============================================================
   FIREBASE CONFIG
   ------------------------------------------------------------
   Ứng dụng chỉ dùng Firestore để lưu dữ liệu (không Authentication,
   không Firebase Storage, không Firebase Hosting). Ảnh món ăn được
   nén nhỏ ngay trên trình duyệt rồi lưu thẳng vào Firestore (collection
   `recipe_images`) — xem chi tiết trong README.md mục "Lưu ảnh".

   1. Vào https://console.firebase.google.com -> Tạo project mới.
   2. Vào Project Settings -> General -> "Your apps" -> Web app (</>).
   3. Copy đoạn config Firebase cung cấp và dán đè vào bên dưới.
   4. Bật dịch vụ trong Console:
        - Firestore Database -> Create database (Production mode),
          rồi publish nội dung file firestore.rules vào tab Rules.
      (Không cần bật Authentication, không cần bật Storage.)
   5. Xem hướng dẫn chạy thử trong README.md.

   LƯU Ý BẢO MẬT: App này không có màn hình đăng nhập, truy cập là dùng
   được ngay. Rule Firestore đi kèm mở "allow read, write: if true" để
   không cần đăng nhập. Vì vậy AI CÓ LINK APP + CONFIG NÀY ĐỀU XEM/SỬA
   ĐƯỢC DỮ LIỆU. Chỉ phù hợp dùng cá nhân trên máy/thiết bị riêng, không
   chia sẻ link công khai. Xem thêm ghi chú trong firestore.rules và
   README.md.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDRA3AYcaque-iXdJRwyp575zu_QgRSbRs",
  authDomain: "yummy-recipes-4c2d6.firebaseapp.com",
  projectId: "yummy-recipes-4c2d6",
  storageBucket: "yummy-recipes-4c2d6.firebasestorage.app",
  messagingSenderId: "626926385295",
  appId: "1:626926385295:web:78c68f013c7beb78bc58fa",
  measurementId: "G-JYVHGQSMDD"
};

// Khởi tạo Firebase (dùng SDK compat để đơn giản, không cần bundler)
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

// Bật cache offline để app phản hồi nhanh hơn (không bắt buộc)
db.enablePersistence().catch(() => {
  /* Bỏ qua lỗi nếu trình duyệt không hỗ trợ hoặc mở nhiều tab */
});
