/* =========================================================
   js/app.js
   - Khởi tạo ứng dụng, chuyển tab, quản lý đăng nhập & modal
   ========================================================= */
window.PB = window.PB || {};

PB.app = {
  currentTab: "live",

  init() {
    PB.state.subscribe(() => this.renderAll());
    PB.state.init(() => {
      // Nếu lần đầu mở chưa có dữ liệu, tự nạp mẫu để dễ trải nghiệm ngay
      if (!PB.state.data.teams.length && !PB.state.data.matches.length) {
        PB.state.loadSampleData();
      }
      this.renderAll();
    });
  },

  renderAll() {
    const d = PB.state.data;
    if (!d) return;

    // Header
    document.getElementById("headerTournamentName").textContent = d.tournamentName;
    const syncEl = document.getElementById("syncBadge");
    if (PB.state.isCloud) {
      syncEl.textContent = "● Realtime Cloud";
      syncEl.className = "chip chip-cloud";
    } else {
      syncEl.textContent = "Chế độ Local";
      syncEl.className = "chip chip-local";
    }

    const s = d.settings;
    document.getElementById("ruleSummaryBadge").textContent =
      `${s.category === "doubles" ? "Đôi" : "Đồng đội"} • ${s.scoringMode === "sideout" ? "Side-out" : "Rally"} • ${s.targetPoints}đ (BO${s.bestOf})`;

    // Role UI
    const role = PB.auth.getRole();
    const roleBadge = document.getElementById("roleBadge");
    const btnAuth = document.getElementById("btnAuth");
    if (role === "admin") {
      roleBadge.textContent = "Quản lý";
      roleBadge.className = "role-pill role-admin";
      btnAuth.textContent = "Đăng xuất";
      btnAuth.onclick = () => this.logout();
    } else if (role === "referee") {
      roleBadge.textContent = "Trọng tài";
      roleBadge.className = "role-pill role-referee";
      btnAuth.textContent = "Đăng xuất";
      btnAuth.onclick = () => this.logout();
    } else {
      roleBadge.textContent = "Khán giả";
      roleBadge.className = "role-pill role-viewer";
      btnAuth.textContent = "Đăng nhập";
      btnAuth.onclick = () => this.openAuthModal();
    }

    PB.viewer.renderAll();
    PB.referee.render();
    PB.admin.render();
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === `tab-${tab}`);
    });
    this.renderAll();
  },

  openAuthModal(defaultRole = "referee") {
    document.getElementById("authRoleSelect").value = defaultRole;
    document.getElementById("authPasswordInput").value = "";
    document.getElementById("authErrorMsg").classList.add("hidden");
    document.getElementById("authModal").classList.remove("hidden");
    setTimeout(() => document.getElementById("authPasswordInput").focus(), 50);
  },

  submitLogin() {
    const role = document.getElementById("authRoleSelect").value;
    const pass = document.getElementById("authPasswordInput").value;
    if (PB.auth.login(role, pass)) {
      this.closeModal("authModal");
      this.toast(role === "admin" ? "✅ Đã đăng nhập Quản lý" : "✅ Đã đăng nhập Trọng tài");
      this.renderAll();
    } else {
      const err = document.getElementById("authErrorMsg");
      err.textContent = "Sai mật khẩu! Vui lòng thử lại.";
      err.classList.remove("hidden");
    }
  },

  logout() {
    PB.auth.logout();
    PB.referee.exitMatch();
    this.toast("Đã đăng xuất về chế độ Khán giả");
    this.renderAll();
  },

  openInfoModal(title, html) {
    document.getElementById("infoModalTitle").textContent = title;
    document.getElementById("infoModalBody").innerHTML = html;
    document.getElementById("infoModal").classList.remove("hidden");
  },

  closeModal(id) {
    document.getElementById(id).classList.add("hidden");
  },

  toast(msg) {
    const c = document.getElementById("toastContainer");
    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = msg;
    c.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  },

  escape(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
};

window.addEventListener("DOMContentLoaded", () => PB.app.init());
