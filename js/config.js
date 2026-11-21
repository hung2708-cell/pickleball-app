/* =========================================================
   js/config.js
   - Dán firebaseConfig của bạn vào đây để đồng bộ Realtime.
   - Nếu để trống apiKey, web tự chạy ở chế độ Local (Offline)
     để bạn test giao diện & tính năng ngay trên máy.
   ========================================================= */
window.PB = window.PB || {};

PB.config = {
  // HƯỚNG DẪN: Thay bằng cấu hình Firebase Realtime Database của bạn
  firebaseConfig: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // Đường dẫn gốc lưu dữ liệu giải trên Firebase Realtime Database
  dbPath: "pickleball_tournament_v1",

  // Khóa lưu trữ LocalStorage
  localStorageKey: "pb_tournament_state_v1",
  roleStorageKey: "pb_user_role_v1",

  // Mật khẩu mặc định ban đầu (Quản lý có thể đổi ngay trên web)
  defaultPasswords: {
    admin: "admin123",
    referee: "tt123"
  }
};

PB.auth = {
  getRole() {
    return localStorage.getItem(PB.config.roleStorageKey) || "viewer";
  },
  isAdmin() {
    return this.getRole() === "admin";
  },
  isReferee() {
    const r = this.getRole();
    return r === "referee" || r === "admin";
  },
  login(role, password) {
    const pw = (PB.state.data && PB.state.data.passwords) || PB.config.defaultPasswords;
    if (role === "admin" && password === pw.admin) {
      localStorage.setItem(PB.config.roleStorageKey, "admin");
      return true;
    }
    if (role === "referee" && (password === pw.referee || password === pw.admin)) {
      localStorage.setItem(PB.config.roleStorageKey, "referee");
      return true;
    }
    return false;
  },
  logout() {
    localStorage.setItem(PB.config.roleStorageKey, "viewer");
  }
};
