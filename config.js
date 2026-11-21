/* =========================================================
   js/config.js - Tích hợp Firebase dự án caycoi
   ========================================================= */
window.PB = window.PB || {};

PB.config = {
  firebaseConfig: {
    apiKey: "AIzaSyBjVdEBn_qh0DhPGLBkxE5KUa8i45n7G9E",
    authDomain: "caycoi.firebaseapp.com",
    databaseURL: "https://caycoi-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "caycoi",
    storageBucket: "caycoi.firebasestorage.app",
    messagingSenderId: "60507496138",
    appId: "1:60507496138:web:dc4a76e5805ca3fc115e33"
  },
  dbPath: "pickleball_tournament_v1",
  localStorageKey: "pb_tournament_state_v1",
  roleStorageKey: "pb_user_role_v1",
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
