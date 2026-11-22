/* =========================================================
   js/app.js
   - Khởi tạo ứng dụng, chuyển tab, quản lý đăng nhập & modal
   ========================================================= */
window.PB = window.PB || {};


PB.ui = {
  _open({ title, message, type = "confirm", defaultValue = "", okText = "Xác nhận", cancelText = "Hủy", danger = false, mandatory = false }) {
    return new Promise((resolve) => {
      const modal = document.getElementById("iosDialogModal");
      const titleEl = document.getElementById("iosDialogTitle");
      const msgEl = document.getElementById("iosDialogMsg");
      const inputWrap = document.getElementById("iosDialogInputWrap");
      const inputEl = document.getElementById("iosDialogInput");
      const okBtn = document.getElementById("iosDialogOkBtn");
      const cancelBtn = document.getElementById("iosDialogCancelBtn");
      const backdrop = document.getElementById("iosDialogBackdrop");

      titleEl.textContent = title || "Thông báo";
      msgEl.textContent = message || "";
      okBtn.textContent = okText;
      okBtn.style.background = danger ? "linear-gradient(135deg,#ef4444,#dc2626)" : "";
      cancelBtn.textContent = cancelText;
      cancelBtn.classList.toggle("hidden", type === "alert" || mandatory);
      inputWrap.classList.toggle("hidden", type !== "prompt");
      inputEl.value = defaultValue || "";

      const cleanup = (val) => {
        modal.classList.add("hidden");
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        backdrop.onclick = null;
        inputEl.onkeydown = null;
        resolve(val);
      };

      okBtn.onclick = () => cleanup(type === "prompt" ? inputEl.value : true);
      cancelBtn.onclick = () => cleanup(type === "prompt" ? null : false);
      backdrop.onclick = mandatory ? null : () => cleanup(type === "prompt" ? null : false);
      inputEl.onkeydown = (e) => { if (e.key === "Enter") okBtn.click(); };

      modal.classList.remove("hidden");
      if (type === "prompt") setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
    });
  },
  alert(message, title = "Thông báo") {
    return this._open({ title, message, type: "alert", okText: "Đã hiểu" });
  },
  confirm(message, title = "Xác nhận", danger = false) {
    return this._open({ title, message, type: "confirm", danger });
  },
  forceConfirm(message, title = "Xác nhận", okText = "Xác nhận đổi sân") {
    return this._open({ title, message, type: "alert", okText, mandatory: true });
  },
  prompt(message, defaultValue = "", title = "Nhập thông tin") {
    return this._open({ title, message, type: "prompt", defaultValue });
  },
  openPicker({ title = "Lựa chọn", options = [], value = "", onSelect }) {
    const modal = document.getElementById("iosPickerModal");
    const titleEl = document.getElementById("iosPickerTitle");
    const listEl = document.getElementById("iosPickerList");
    if (!modal || !listEl) return;
    titleEl.textContent = title;
    this._pickerCallback = onSelect;
    listEl.innerHTML = options.map((opt, idx) => {
      const val = typeof opt === "object" ? opt.value : opt;
      const lbl = typeof opt === "object" ? opt.label : opt;
      const sub = typeof opt === "object" ? (opt.sub || "") : "";
      const active = String(val) === String(value);
      return `
        <button type="button" class="ios27-picker-item ${active ? "active" : ""}" onclick="PB.ui._pickOption(${idx})">
          <div>
            <div>${PB.app.escape(lbl)}</div>
            ${sub ? `<div class="muted" style="font-size:0.74rem;">${PB.app.escape(sub)}</div>` : ""}
          </div>
          <span class="ios27-picker-check">${active ? "✓" : ""}</span>
        </button>
      `;
    }).join("");
    this._pickerOptions = options;
    modal.classList.remove("hidden");
  },
  _pickOption(idx) {
    const opt = (this._pickerOptions || [])[idx];
    const val = typeof opt === "object" ? opt.value : opt;
    document.getElementById("iosPickerModal")?.classList.add("hidden");
    if (this._pickerCallback) this._pickerCallback(val);
  },
  initGlobalIosSelects() {
    // Trên điện thoại, chặn menu <select> mặc định của Android/iOS và mở Popup iOS 27 thống nhất
    document.addEventListener("mousedown", (e) => {
      if (window.innerWidth > 820) return;
      const sel = e.target.closest("select");
      if (!sel || sel.disabled) return;
      e.preventDefault();
      sel.blur();
      const opts = Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent }));
      const labelEl = sel.closest(".form-group")?.querySelector("label");
      const title = labelEl ? labelEl.textContent.trim() : "Lựa chọn";
      this.openPicker({
        title,
        options: opts,
        value: sel.value,
        onSelect: (newVal) => {
          if (sel.value !== newVal) {
            sel.value = newVal;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      });
    });
  }
};

PB.app = {
  currentTab: "live",

  saveUiState(patch) {
    try {
      const cur = JSON.parse(localStorage.getItem("pb_ui_state_v1") || "{}");
      localStorage.setItem("pb_ui_state_v1", JSON.stringify({ ...cur, ...patch }));
    } catch {}
  },

  loadUiState() {
    try {
      return JSON.parse(localStorage.getItem("pb_ui_state_v1") || "{}");
    } catch {
      return {};
    }
  },


  _navTabs: ["live", "standings", "referee", "admin"],

  updateNavSlider(tab) {
    const pill = document.getElementById("navSliderPill");
    if (!pill) return;
    const idx = Math.max(0, this._navTabs.indexOf(tab || this.currentTab));
    pill.classList.remove("dragging");
    pill.style.transform = `translateX(${idx * 100}%)`;
  },

  initMobileNavSlider() {
    const navInner = document.getElementById("mainNavInner");
    const pill = document.getElementById("navSliderPill");
    if (!navInner || !pill) return;

    let isDragging = false;
    let startX = 0;
    let navRect = null;

    const getIdxFromX = (clientX) => {
      const rel = Math.max(0, Math.min(navRect.width - 10, clientX - navRect.left - 5));
      const tabW = (navRect.width - 10) / 4;
      return Math.max(0, Math.min(3, Math.floor(rel / tabW)));
    };

    navInner.addEventListener("touchstart", (e) => {
      if (window.innerWidth > 820) return;
      navRect = navInner.getBoundingClientRect();
      startX = e.touches[0].clientX;
      isDragging = false;
    }, { passive: true });

    navInner.addEventListener("touchmove", (e) => {
      if (window.innerWidth > 820 || !navRect) return;
      const curX = e.touches[0].clientX;
      if (!isDragging && Math.abs(curX - startX) > 10) {
        isDragging = true;
        pill.classList.add("dragging");
      }
      if (isDragging) {
        const tabW = (navRect.width - 10) / 4;
        const maxTx = tabW * 3;
        const rawTx = (curX - navRect.left - 5) - (tabW / 2);
        const clamped = Math.max(0, Math.min(maxTx, rawTx));
        pill.style.transform = `translateX(${clamped}px)`;
      }
    }, { passive: true });

    navInner.addEventListener("touchend", (e) => {
      if (!isDragging || !navRect) return;
      isDragging = false;
      const endX = e.changedTouches[0].clientX;
      const targetIdx = getIdxFromX(endX);
      const targetTab = this._navTabs[targetIdx];
      pill.classList.remove("dragging");
      if (targetTab && targetTab !== this.currentTab) {
        this.switchTab(targetTab);
      } else {
        this.updateNavSlider(this.currentTab);
      }
    });
  },

  init() {
    if (PB.pro) PB.pro.checkObsMode();
    PB.ui.initGlobalIosSelects();
    this.initMobileNavSlider();
    PB.state.subscribe(() => this.renderAll());
    PB.state.init(() => {
      // Không tự nạp lại dữ liệu mẫu khi danh sách trống (tránh tự khôi phục VĐV cũ sau khi xóa)
      if (PB.state.data.matches.length && PB.auth.isReferee() && PB.bracket.ensureAutoSchedule()) {
        PB.state.save();
      }
      // Khôi phục đúng vị trí trước khi F5
      const saved = this.loadUiState();
      if (saved.standingView) PB.viewer.switchStandingView(saved.standingView, true);
      if (saved.adminSubTab) PB.admin.switchSubTab(saved.adminSubTab, true);
      if (saved.refActiveMatchId && PB.auth.isReferee()) {
        const exists = PB.state.data.matches.find((m) => m.id === saved.refActiveMatchId && m.status !== "finished");
        if (exists) {
          PB.referee.activeMatchId = saved.refActiveMatchId;
          PB.referee.activeSubIdx = saved.refActiveSubIdx !== undefined ? saved.refActiveSubIdx : null;
        }
      }
      if (saved.currentTab && ["live", "standings", "referee", "admin"].includes(saved.currentTab)) {
        this.switchTab(saved.currentTab, true);
      } else {
        this.renderAll();
      }
    });
  },

  renderAll() {
    const d = PB.state.data;
    if (!d) return;
    if (PB.pro && PB.pro.obsCourt) { PB.pro.renderObsOverlay(); return; }

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

    if (this.currentTab === "live" || this.currentTab === "standings") PB.viewer.renderAll();
    else if (this.currentTab === "referee") PB.referee.render();
    else if (this.currentTab === "admin") PB.admin.render();
  },

  switchTab(tab, silent = false) {
    this.currentTab = tab;
    if (!silent) this.saveUiState({ currentTab: tab });
    if (tab !== "referee") document.body.classList.remove("ref-scoring-mode", "ref-lineup-mode");
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === `tab-${tab}`);
    });
    this.updateNavSlider(tab);
    this.renderAll();
  },

  selectAuthRole(role) {
    document.getElementById("authRoleSelect").value = role;
    const btnRef = document.getElementById("segRoleReferee");
    const btnAdm = document.getElementById("segRoleAdmin");
    if (btnRef) btnRef.classList.toggle("active", role === "referee");
    if (btnAdm) btnAdm.classList.toggle("active", role === "admin");
    document.getElementById("authErrorMsg").classList.add("hidden");
    setTimeout(() => document.getElementById("authPasswordInput")?.focus(), 40);
  },

  openAuthModal(defaultRole = "referee") {
    this.selectAuthRole(defaultRole);
    document.getElementById("authPasswordInput").value = "";
    document.getElementById("authErrorMsg").classList.add("hidden");
    document.getElementById("authModal").classList.remove("hidden");
    setTimeout(() => document.getElementById("authPasswordInput").focus(), 60);
  },

  submitLogin() {
    const role = document.getElementById("authRoleSelect").value;
    const pass = document.getElementById("authPasswordInput").value;
    if (PB.auth.login(role, pass)) {
      this.closeModal("authModal");
      this.toast(role === "admin" ? "Đã đăng nhập Quản lý" : "Đã đăng nhập Trọng tài");
      if (PB.viewer._pendingRefMatchId && PB.auth.isReferee()) {
        const mid = PB.viewer._pendingRefMatchId;
        PB.viewer._pendingRefMatchId = null;
        this.switchTab("referee");
        PB.referee.openMatch(mid);
      } else {
        this.renderAll();
      }
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
