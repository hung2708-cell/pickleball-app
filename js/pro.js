/* =========================================================
   js/pro.js — GÓI NÂNG CẤP SPORTCONNECT PRO (v36)
   1. Giao diện Hero Mở Cổng Đăng Ký chuẩn SportConnect (Banner, Tiến độ slot, Lệ phí, CTA)
   2. Cổng VĐV tự đăng ký + Vé VietQR (có nút Sao chép STK & Nội dung CK)
   3. Bảng điều khiển Admin chuẩn SportConnect (KPI Doanh thu, Lọc đơn chờ duyệt, Duyệt & Nhắn Zalo)
   4. Khung tỷ số Livestream nền trong suốt (?obs=1, ?obs=2...) & BXH Điểm trình CLB (Elo)
   ========================================================= */
window.PB = window.PB || {};

PB.pro = {
  obsCourt: null,
  regFilter: "all", // 'all' | 'pending' | 'approved'
  countdownInterval: null,

  ensureData() {
    const d = PB.state.data;
    if (!d) return;
    if (!d.info) {
      d.info = { banner: "", subtitle: "", announcement: "", startTime: "", sponsors: [], gallery: [] };
    }
    if (typeof d.info.startTime !== "string") d.info.startTime = "";
    if (!Array.isArray(d.info.sponsors)) d.info.sponsors = [];
    if (!Array.isArray(d.info.gallery)) d.info.gallery = [];
    if (!d.paymentConfig) {
      d.paymentConfig = { enabled: true, bankId: "MB", accountNo: "", accountName: "", fee: 200000, prefix: "PB2026", maxSlots: 32 };
    }
    if (!d.paymentConfig.maxSlots) d.paymentConfig.maxSlots = 32;
    if (!Array.isArray(d.registrations)) d.registrations = [];
    if (!Array.isArray(d.clubRanking)) d.clubRanking = [];
  },

  compressImage(file, maxWidth = 1000, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  copyText(txt, label = "Đã sao chép!") {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => PB.app.toast(label)).catch(() => PB.ui.alert(txt, label));
    } else {
      PB.ui.alert(txt, label);
    }
  },

  // =========================================================
  // 1. GIAO DIỆN HERO MỞ CỔNG ĐĂNG KÝ CHUẨN SPORTCONNECT
  // =========================================================
  renderPublicInfo() {
    const el = document.getElementById("proPublicInfoSection");
    if (!el || !PB.state.data) return;
    this.ensureData();
    const d = PB.state.data;
    const info = d.info;
    const cfg = d.paymentConfig;
    const hasBanner = !!(info.banner && info.banner.trim());
    const hasText = !!(info.subtitle || info.announcement);
    const hasGallery = info.gallery.length > 0;
    const hasSponsors = info.sponsors.length > 0;

    // Luôn hiển thị Hero Cổng Đăng Ký nếu đang mở đăng ký hoặc có thông tin giải
    if (!cfg.enabled && !hasBanner && !hasText && !hasGallery && !hasSponsors) {
      el.innerHTML = "";
      el.classList.add("hidden");
      return;
    }

    const maxSlots = Number(cfg.maxSlots) || 32;
    const curTeams = d.teams.length;
    const pendingCount = d.registrations.filter((r) => r.status === "pending").length;
    const pct = Math.min(100, Math.round((curTeams / maxSlots) * 100));
    const feeTxt = Number(cfg.fee || 0) > 0 ? Number(cfg.fee).toLocaleString("vi-VN") + "đ" : "Miễn phí";

    el.classList.remove("hidden");
    el.innerHTML = `
      <div class="sc-hero-card">
        <div class="sc-hero-cover ${hasBanner ? "has-img" : ""}" ${hasBanner ? `style="background-image:url('${PB.app.escape(info.banner)}')"` : ""}>
          <div class="sc-hero-overlay">
            <div class="sc-hero-top-badges">
              ${cfg.enabled
                ? `<span class="sc-status-pill open">● ĐANG MỞ ĐĂNG KÝ</span>`
                : `<span class="sc-status-pill closed">ĐÃ ĐÓNG ĐĂNG KÝ</span>`}
              <span class="sc-fee-pill">Lệ phí: ${feeTxt}</span>
            </div>
            <div class="sc-hero-title-block">
              <h2>${PB.app.escape(d.tournamentName)}</h2>
              ${info.subtitle ? `<div class="sc-hero-sub">📍 ${PB.app.escape(info.subtitle)}</div>` : ""}
            </div>
          </div>
        </div>

        <div class="sc-hero-body">
          ${info.startTime ? `<div id="scCountdownBox" class="sc-countdown-box"></div>` : ""}

          ${cfg.enabled ? `
            <div class="sc-reg-progress-wrap">
              <div class="sc-reg-progress-meta">
                <span>Suất thi đấu: <strong>${curTeams}/${maxSlots}</strong> đội ${pendingCount ? `<span class="muted">(${pendingCount} chờ duyệt)</span>` : ""}</span>
                <strong>${pct}%</strong>
              </div>
              <div class="sc-progress-track">
                <div class="sc-progress-fill" style="width:${pct}%;"></div>
              </div>
            </div>
            <div class="sc-hero-cta-row">
              <button class="btn sc-btn-register" onclick="PB.pro.openRegisterModal()">
                <span>+ Đăng ký ngay</span>
              </button>
              ${d.teams.length ? `<button class="btn btn-success sc-btn-checkin" onclick="PB.pro.openCheckInModal()">✓ Check-in</button>` : ""}
              <button class="btn btn-secondary sc-btn-qr" onclick="PB.viewer.openQrModal()">QR</button>
            </div>
          ` : (d.teams.length ? `
            <div class="sc-hero-cta-row">
              <button class="btn btn-success sc-btn-checkin" style="flex:1;" onclick="PB.pro.openCheckInModal()">✓ Check-in đến sân (${d.teams.filter(t => t.checkedIn).length}/${d.teams.length})</button>
              <button class="btn btn-secondary sc-btn-qr" onclick="PB.viewer.openQrModal()">Mã QR</button>
            </div>
          ` : "")}

          ${info.announcement ? `
            <div class="sc-announcement-box">
              <div class="sc-ann-title">Thông báo & Điều lệ BTC</div>
              <div class="sc-ann-text">${PB.app.escape(info.announcement).replace(/\n/g, "<br/>")}</div>
            </div>
          ` : ""}
        </div>

        ${hasSponsors ? `
          <div class="pro-sponsors-bar">
            <span class="pro-bar-label">Nhà tài trợ:</span>
            <div class="pro-sponsors-list">
              ${info.sponsors.map((s) => `
                <div class="pro-sponsor-pill">
                  ${s.logo ? `<img src="${PB.app.escape(s.logo)}" alt="${PB.app.escape(s.name)}" />` : ""}
                  <span>${PB.app.escape(s.name)}</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        ${hasGallery ? `
          <div class="pro-gallery-strip">
            ${info.gallery.map((g, idx) => `
              <div class="pro-gallery-item" onclick="PB.pro.openLightbox(${idx})">
                <img src="${PB.app.escape(g.url)}" alt="${PB.app.escape(g.caption || "Ảnh giải")}" loading="lazy" />
                ${g.caption ? `<div class="pro-gallery-cap">${PB.app.escape(g.caption)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
      ${!(d.matches && d.matches.length) ? `
        <div class="card" style="margin-top:12px;">
          <div class="section-header" style="margin-bottom:8px;">
            <h3>Thông tin giải đấu</h3>
            <span class="badge badge-serieA">${d.settings.category === "doubles" ? "Đánh Đôi" : "Đồng đội"}</span>
          </div>
          <div class="sc-bank-ticket" style="margin-top:0;">
            <div class="sc-bank-row"><span>Thể thức tính điểm</span><strong>${d.settings.scoringMode === "sideout" ? "Side-out" : "Rally"} • ${d.settings.targetPoints}đ (BO${d.settings.bestOf})</strong></div>
            <div class="sc-bank-row"><span>Số sân thi đấu</span><strong>${d.settings.numCourts || 4} sân</strong></div>
            <div class="sc-bank-row"><span>Số đội đã đăng ký</span><strong>${curTeams} / ${maxSlots} đội</strong></div>
            <div class="sc-bank-row"><span>Lệ phí tham dự</span><strong style="color:var(--primary);">${feeTxt}</strong></div>
          </div>
          ${(d.teams.length || pendingCount) ? `
            <div style="margin-top:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;flex-wrap:wrap;">
                <span class="muted" style="font-size:0.76rem;font-weight:800;">VĐV / ĐỘI ĐÃ ĐĂNG KÝ (${d.teams.length + pendingCount})</span>
                <span class="badge badge-done">Đã đến sân: ${d.teams.filter(t => t.checkedIn).length}/${d.teams.length}</span>
              </div>
              <div class="sc-public-roster">
                ${d.teams.map((t, idx) => `
                  <div class="sc-roster-row ${t.checkedIn ? "is-checkedin" : ""}" onclick="PB.pro.openCheckInModal()">
                    <div class="sc-roster-name">
                      <strong>${idx + 1}. ${PB.app.escape(t.name)}</strong>
                      ${t.club ? `<span class="muted" style="font-size:0.74rem;"> • ${PB.app.escape(t.club)}</span>` : ""}
                    </div>
                    ${t.checkedIn
                      ? `<span class="badge badge-done">✓ Đã đến${t.checkedInAt ? " " + PB.app.escape(t.checkedInAt) : ""}</span>`
                      : `<span class="badge badge-wait">Chưa đến</span>`}
                  </div>
                `).join("")}
                ${d.registrations.filter(r => r.status === "pending").map((r) => `
                  <div class="sc-roster-row is-pending">
                    <div class="sc-roster-name">
                      <strong>${PB.app.escape(r.name)}</strong>
                      ${r.club ? `<span class="muted" style="font-size:0.74rem;"> • ${PB.app.escape(r.club)}</span>` : ""}
                    </div>
                    <span class="badge badge-serieA">⏳ Chờ duyệt</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>
      ` : ""}
    `;
    this.startCountdown(info.startTime);
  },

  startCountdown(startTimeStr) {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (!startTimeStr) return;
    const targetMs = new Date(startTimeStr).getTime();
    if (isNaN(targetMs)) return;

    const update = () => {
      const box = document.getElementById("scCountdownBox");
      if (!box) return;
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        box.innerHTML = `<div class="sc-cd-live">🔥 GIẢI ĐẤU ĐANG DIỄN RA</div>`;
        if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const pad = (n) => String(n).padStart(2, "0");
      box.innerHTML = `
        <div class="sc-cd-label">Đếm ngược đến giờ khai mạc</div>
        <div class="sc-cd-grid">
          <div class="sc-cd-cell"><strong>${pad(days)}</strong><span>Ngày</span></div>
          <div class="sc-cd-cell"><strong>${pad(hours)}</strong><span>Giờ</span></div>
          <div class="sc-cd-cell"><strong>${pad(mins)}</strong><span>Phút</span></div>
          <div class="sc-cd-cell"><strong>${pad(secs)}</strong><span>Giây</span></div>
        </div>
      `;
    };
    update();
    this.countdownInterval = setInterval(update, 1000);
  },

  openCheckInModal() {
    this.ensureData();
    const teams = PB.state.data.teams || [];
    if (!teams.length) {
      return PB.ui.alert("Chưa có đội/VĐV chính thức nào trong danh sách để check-in.", "Check-in đến sân");
    }
    const checkedCount = teams.filter((t) => t.checkedIn).length;
    PB.app.openInfoModal(
      `Check-in đến sân (${checkedCount}/${teams.length})`,
      `
        <p class="muted" style="margin:0 0 10px;">Bấm vào tên đội/VĐV của bạn để báo đã có mặt tại sân thi đấu:</p>
        <div class="ios27-picker-list" style="padding:0;max-height:52vh;">
          ${teams.map((t, idx) => `
            <button type="button" class="ios27-picker-item ${t.checkedIn ? "active" : ""}" onclick="PB.pro.toggleCheckIn('${t.id}', true)">
              <div>
                <div>${idx + 1}. ${PB.app.escape(t.name)}</div>
                <div class="muted" style="font-size:0.74rem;">
                  ${t.checkedIn ? `✓ Đã có mặt tại sân${t.checkedInAt ? " (" + PB.app.escape(t.checkedInAt) + ")" : ""}` : "Chưa check-in"}
                </div>
              </div>
              <span class="ios27-picker-check">${t.checkedIn ? "✓" : ""}</span>
            </button>
          `).join("")}
        </div>
      `
    );
  },

  toggleCheckIn(teamId, reopenModal = false) {
    const t = PB.state.data.teams.find((x) => x.id === teamId);
    if (!t) return;
    t.checkedIn = !t.checkedIn;
    t.checkedInAt = t.checkedIn ? new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
    PB.state.save();
    PB.app.toast(t.checkedIn ? `✓ ${t.name} đã check-in đến sân!` : `Đã hủy check-in của ${t.name}`);
    if (reopenModal) this.openCheckInModal();
  },

  openLightbox(idx) {
    this.ensureData();
    const g = PB.state.data.info.gallery[idx];
    if (!g) return;
    PB.app.openInfoModal(
      g.caption || "Ảnh giải đấu",
      `<div class="text-center"><img src="${PB.app.escape(g.url)}" style="max-width:100%;border-radius:14px;" /></div>`
    );
  },

  // =========================================================
  // 2. CỔNG VĐV TỰ ĐĂNG KÝ + VÉ VIETQR CHUẨN SPORTCONNECT
  // =========================================================
  openRegisterModal() {
    this.ensureData();
    const d = PB.state.data;
    const cfg = d.paymentConfig;
    if (!cfg.enabled) {
      return PB.ui.alert("Ban tổ chức hiện đã đóng cổng đăng ký trực tuyến.", "Thông báo");
    }
    const feeTxt = Number(cfg.fee || 0) > 0 ? Number(cfg.fee).toLocaleString("vi-VN") + "đ" : "Miễn phí";
    const maxSlots = Number(cfg.maxSlots) || 32;
    const remain = Math.max(0, maxSlots - d.teams.length);

    PB.app.openInfoModal(
      "Đăng ký thi đấu",
      `
        <div class="sc-reg-modal-banner">
          <div>
            <div style="font-weight:800;font-size:0.92rem;color:var(--text);">${PB.app.escape(d.tournamentName)}</div>
            <div class="muted" style="font-size:0.76rem;">Còn trống: <strong>${remain}/${maxSlots}</strong> suất</div>
          </div>
          <div class="sc-reg-fee-tag">${feeTxt}</div>
        </div>

        <div class="form-group">
          <label>Nội dung đăng ký</label>
          <input type="hidden" id="regGender" value="Nam Nữ" />
          <div class="sc-cat-grid" id="regCatGrid">
            ${["Nam Nữ", "Nam", "Nữ", "Đồng đội"].map((c, i) => `
              <button type="button" class="sc-cat-pill ${i === 0 ? "active" : ""}" onclick="PB.pro.selectRegCat(this, '${c}')">${c}</button>
            `).join("")}
          </div>
        </div>

        <div class="form-group">
          <label>Tên VĐV / Cặp đấu *</label>
          <input type="text" id="regName" class="input" placeholder="VD: Hùng / Dương" />
        </div>
        <div class="form-grid" style="gap:8px;">
          <div class="form-group">
            <label>Số điện thoại / Zalo *</label>
            <input type="tel" id="regPhone" class="input" placeholder="09xx..." />
          </div>
          <div class="form-group">
            <label>CLB</label>
            <input type="text" id="regClub" class="input" placeholder="VD: CLB Bính Dần" />
          </div>
        </div>
        <div class="form-group">
          <label>Trình dự kiến (Rating)</label>
          <input type="text" id="regRating" class="input" placeholder="VD: 3.0" />
        </div>

        <button class="btn ios27-btn-primary mt-12" onclick="PB.pro.submitRegistration()">Xác nhận đăng ký & Lấy mã VietQR</button>
      `
    );
  },

  selectRegCat(btn, val) {
    document.getElementById("regGender").value = val;
    document.querySelectorAll("#regCatGrid .sc-cat-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  },

  submitRegistration() {
    this.ensureData();
    const name = (document.getElementById("regName")?.value || "").trim();
    const phone = (document.getElementById("regPhone")?.value || "").trim();
    const club = (document.getElementById("regClub")?.value || "").trim();
    const gender = (document.getElementById("regGender")?.value || "Nam Nữ").trim();
    const rating = (document.getElementById("regRating")?.value || "").trim();
    if (!name || !phone) return PB.ui.alert("Vui lòng nhập đầy đủ Tên và Số điện thoại.");

    const reg = {
      id: "REG_" + Date.now(),
      name, phone, club, gender, rating,
      status: "pending",
      createdAt: new Date().toLocaleString("vi-VN")
    };
    PB.state.data.registrations.unshift(reg);
    PB.state.save();

    const cfg = PB.state.data.paymentConfig;
    if (cfg.accountNo && cfg.bankId) {
      const memo = `${cfg.prefix || "PB"} ${name}`.replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 40);
      const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(cfg.bankId)}-${encodeURIComponent(cfg.accountNo)}-compact2.png?amount=${Number(cfg.fee || 0)}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(cfg.accountName || "")}`;
      PB.app.openInfoModal(
        "Thanh toán lệ phí VietQR",
        `
          <div class="text-center">
            <div class="badge badge-done" style="margin-bottom:8px;">✓ Đã tiếp nhận đơn của ${PB.app.escape(name)}</div>
            <img src="${qrUrl}" alt="VietQR" style="max-width:235px;width:100%;border-radius:16px;border:1px solid var(--border);padding:6px;background:#fff;box-shadow:var(--shadow-sm);" />
            <div class="sc-bank-ticket">
              <div class="sc-bank-row"><span>Ngân hàng</span><strong>${PB.app.escape(cfg.bankId)}</strong></div>
              <div class="sc-bank-row">
                <span>Số tài khoản</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <strong>${PB.app.escape(cfg.accountNo)}</strong>
                  <button class="btn btn-sm btn-secondary" style="padding:2px 7px;font-size:0.7rem;" onclick="PB.pro.copyText('${PB.app.escape(cfg.accountNo)}','Đã chép STK!')">Chép</button>
                </div>
              </div>
              ${cfg.accountName ? `<div class="sc-bank-row"><span>Chủ tài khoản</span><strong>${PB.app.escape(cfg.accountName)}</strong></div>` : ""}
              <div class="sc-bank-row"><span>Số tiền</span><strong style="color:var(--primary);">${Number(cfg.fee || 0).toLocaleString("vi-VN")}đ</strong></div>
              <div class="sc-bank-row">
                <span>Nội dung CK</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <strong>${PB.app.escape(memo)}</strong>
                  <button class="btn btn-sm btn-secondary" style="padding:2px 7px;font-size:0.7rem;" onclick="PB.pro.copyText('${PB.app.escape(memo)}','Đã chép nội dung CK!')">Chép</button>
                </div>
              </div>
            </div>
          </div>
        `
      );
    } else {
      PB.app.closeModal("infoModal");
      PB.app.toast("Đã gửi đơn đăng ký! Chờ Ban tổ chức duyệt.");
    }
  },

  approveRegistration(regId) {
    this.ensureData();
    const reg = PB.state.data.registrations.find((r) => r.id === regId);
    if (!reg || reg.status === "approved") return;
    reg.status = "approved";
    PB.state.data.teams.push({
      id: "T" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name: reg.name,
      club: reg.club,
      gender: reg.gender,
      rating: reg.rating,
      group: "A",
      seed: 0,
      roster: []
    });
    PB.state.save();
    PB.app.toast(`Đã duyệt ${reg.name} vào danh sách thi đấu!`);
  },

  deleteRegistration(regId) {
    this.ensureData();
    PB.state.data.registrations = PB.state.data.registrations.filter((r) => r.id !== regId);
    PB.state.save();
    PB.app.toast("Đã xóa đơn đăng ký");
  },

  openZalo(regId) {
    this.ensureData();
    const reg = PB.state.data.registrations.find((r) => r.id === regId);
    if (!reg || !reg.phone) return PB.ui.alert("Đơn đăng ký này chưa có số điện thoại.");
    let phone = String(reg.phone).replace(/[^0-9+]/g, "");
    if (phone.startsWith("+84")) phone = "0" + phone.slice(3);
    else if (phone.startsWith("84") && phone.length >= 10) phone = "0" + phone.slice(2);

    const tName = PB.state.data.tournamentName || "Giải Pickleball";
    const link = window.location.origin + window.location.pathname;
    const msg = reg.status === "approved"
      ? `BTC ${tName} xác nhận đã DUYỆT đăng ký cho ${reg.name} (${reg.gender || "Thi đấu"}). Xem lịch & tỷ số trực tiếp tại: ${link}`
      : `BTC ${tName} đã nhận đăng ký của ${reg.name}. Vui lòng hoàn tất lệ phí để BTC duyệt danh sách nhé!`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    PB.app.toast("Đã chép sẵn tin nhắn — Đang mở Zalo...");
    window.open(`https://zalo.me/${encodeURIComponent(phone)}`, "_blank");
  },

  // =========================================================
  // 3. KHUNG TỶ SỐ LIVESTREAM (OBS OVERLAY - NỀN TRONG SUỐT)
  // =========================================================
  checkObsMode() {
    const params = new URLSearchParams(window.location.search);
    const obs = params.get("obs");
    if (!obs) return false;
    this.obsCourt = obs;
    document.body.classList.add("obs-mode");
    return true;
  },

  renderObsOverlay() {
    if (!this.obsCourt || !PB.state.data) return;
    const el = document.getElementById("obsOverlay");
    if (!el) return;
    el.classList.remove("hidden");

    const matches = PB.state.data.matches || [];
    let m = null;
    if (this.obsCourt === "live") {
      m = matches.find((x) => x.status === "live");
    } else {
      m = matches.find((x) => String(x.court) === String(this.obsCourt) && x.status === "live")
       || matches.find((x) => String(x.court) === String(this.obsCourt) && x.status === "pending");
    }

    if (!m) {
      el.innerHTML = `
        <div class="obs-bug">
          <div class="obs-head">
            <img src="logo.png" class="obs-logo" alt="" />
            <span>${PB.app.escape(PB.state.data.tournamentName)} • Sân ${PB.app.escape(this.obsCourt)}</span>
          </div>
          <div class="obs-wait">Chờ trận đấu tiếp theo...</div>
        </div>
      `;
      return;
    }

    let nameA = PB.state.getTeamName(m.teamA);
    let nameB = PB.state.getTeamName(m.teamB);
    let sA = m.scoreA, sB = m.scoreB, srv = m.server, srvNum = m.serverNum;
    let subLabel = m.roundName;

    if (m.matchType === "team" && Array.isArray(m.subMatches)) {
      const liveSub = m.subMatches.find((s) => s.status === "live") || m.subMatches[0];
      if (liveSub) {
        nameA = (liveSub.playersA || []).filter(Boolean).join(" / ") || nameA;
        nameB = (liveSub.playersB || []).filter(Boolean).join(" / ") || nameB;
        sA = liveSub.scoreA; sB = liveSub.scoreB; srv = liveSub.server; srvNum = liveSub.serverNum;
        subLabel = `${m.roundName} • ${liveSub.label} (${m.scoreA}-${m.scoreB})`;
      }
    }

    el.innerHTML = `
      <div class="obs-bug">
        <div class="obs-head">
          <img src="logo.png" class="obs-logo" alt="" />
          <span class="obs-title">${PB.app.escape(subLabel)}</span>
          <span class="obs-court-tag">SÂN ${m.court || this.obsCourt}</span>
        </div>
        <div class="obs-row ${srv === "A" ? "is-srv" : ""}">
          <span class="obs-dot">${srv === "A" ? "●" : ""}</span>
          <span class="obs-name">${PB.app.escape(nameA)}</span>
          <span class="obs-srvnum">${srv === "A" && srvNum ? "T" + srvNum : ""}</span>
          <span class="obs-score">${sA}</span>
        </div>
        <div class="obs-row ${srv === "B" ? "is-srv" : ""}">
          <span class="obs-dot">${srv === "B" ? "●" : ""}</span>
          <span class="obs-name">${PB.app.escape(nameB)}</span>
          <span class="obs-srvnum">${srv === "B" && srvNum ? "T" + srvNum : ""}</span>
          <span class="obs-score">${sB}</span>
        </div>
      </div>
    `;
  },

  copyObsLink(courtNum) {
    const base = window.location.origin + window.location.pathname;
    const url = `${base}?obs=${courtNum}`;
    this.copyText(url, `Đã chép link OBS Sân ${courtNum}!`);
  },

  // =========================================================
  // 4. BXH ĐIỂM TRÌNH CLB (ELO PICKLEBALL)
  // =========================================================
  renderClubRanking() {
    const el = document.getElementById("standingsRankingView");
    if (!el || !PB.state.data) return;
    this.ensureData();
    const list = [...PB.state.data.clubRanking].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));

    el.innerHTML = `
      <div class="card">
        <div class="section-header">
          <h3>Bảng Xếp Hạng Trình CLB (Tích lũy)</h3>
          <span class="muted">Cập nhật theo kết quả các giải đấu</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>#</th><th>VĐV / Cặp đấu</th><th>CLB</th><th>Trận</th><th>Thắng-Thua</th><th>Điểm trình</th></tr>
            </thead>
            <tbody>
              ${list.length ? list.map((p, idx) => `
                <tr class="${idx < 3 ? "qualify-a" : ""}">
                  <td><strong>${idx + 1}</strong></td>
                  <td><strong>${PB.app.escape(p.name)}</strong></td>
                  <td>${PB.app.escape(p.club || "-")}</td>
                  <td>${p.matches || 0}</td>
                  <td>${p.wins || 0} - ${p.losses || 0}</td>
                  <td><strong style="color:var(--primary);font-size:1rem;">${Number(p.rating || 3.0).toFixed(2)}</strong></td>
                </tr>
              `).join("") : `<tr><td colspan="6" class="muted text-center">Chưa có dữ liệu điểm trình. BTC vào Quản lý → Ảnh, QR & Pro để chốt điểm trình sau giải.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async applyTournamentRatings() {
    this.ensureData();
    const finished = PB.state.data.matches.filter((m) => m.status === "finished" && !m.ratingApplied && (m.winner === "A" || m.winner === "B"));
    if (!finished.length) {
      return PB.ui.alert("Không có trận đấu mới kết thúc nào chưa được tính điểm trình.", "Đã cập nhật hết");
    }
    if (!(await PB.ui.confirm(`Tính điểm trình (Elo Pickleball) cho ${finished.length} trận đấu đã kết thúc?`, "Chốt điểm trình giải"))) return;

    const findOrCreate = (teamId) => {
      const t = PB.state.getTeam(teamId);
      const name = t ? t.name : PB.state.getTeamName(teamId);
      let rec = PB.state.data.clubRanking.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!rec) {
        rec = {
          id: "P_" + Date.now() + "_" + Math.floor(Math.random() * 999),
          name,
          club: t?.club || "",
          rating: parseFloat(t?.rating) || 3.0,
          wins: 0, losses: 0, matches: 0
        };
        PB.state.data.clubRanking.push(rec);
      }
      return rec;
    };

    const K = 0.16;
    finished.forEach((m) => {
      const pA = findOrCreate(m.teamA);
      const pB = findOrCreate(m.teamB);
      const expA = 1 / (1 + Math.pow(10, (pB.rating - pA.rating)));
      const actA = m.winner === "A" ? 1 : 0;
      const delta = K * (actA - expA);
      pA.rating = Math.max(2.0, Math.min(6.5, Number((pA.rating + delta).toFixed(2))));
      pB.rating = Math.max(2.0, Math.min(6.5, Number((pB.rating - delta).toFixed(2))));
      pA.matches++; pB.matches++;
      if (m.winner === "A") { pA.wins++; pB.losses++; } else { pB.wins++; pA.losses++; }
      m.ratingApplied = true;
    });

    PB.state.save();
    PB.app.toast(`Đã chốt điểm trình cho ${finished.length} trận đấu!`);
  },

  // =========================================================
  // 5. THANH DASHBOARD TÀI KHOẢN ADMIN CHUẨN SPORTCONNECT
  // =========================================================
  renderAdminDashboardHeader() {
    const el = document.getElementById("adminDashboardHeader");
    if (!el || !PB.state.data) return;
    this.ensureData();
    const d = PB.state.data;
    const pendingRegs = d.registrations.filter((r) => r.status === "pending").length;
    const approvedRegs = d.registrations.filter((r) => r.status === "approved").length;
    const estRevenue = approvedRegs * Number(d.paymentConfig.fee || 0);
    const doneMatches = d.matches.filter((m) => m.status === "finished").length;

    el.innerHTML = `
      <div class="sc-admin-banner">
        <div class="sc-admin-profile">
          <div class="sc-admin-avatar">BTC</div>
          <div>
            <div class="sc-admin-title">Quản trị viên giải đấu</div>
            <div class="sc-admin-sub">${PB.app.escape(d.tournamentName)} • ${d.paymentConfig.enabled ? "Cổng ĐK đang mở" : "Cổng ĐK đã đóng"}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="PB.app.logout()">Đăng xuất</button>
      </div>
      <div class="sc-admin-kpi-grid">
        <div class="sc-kpi-card" onclick="PB.admin.switchSubTab('teams')">
          <div class="sc-kpi-lbl">Đội chính thức</div>
          <div class="sc-kpi-val">${d.teams.length} <span class="muted" style="font-size:0.75rem;">/${d.paymentConfig.maxSlots || 32}</span></div>
        </div>
        <div class="sc-kpi-card ${pendingRegs ? "has-alert" : ""}" onclick="PB.admin.switchSubTab('pro')">
          <div class="sc-kpi-lbl">Đơn chờ duyệt</div>
          <div class="sc-kpi-val ${pendingRegs ? "accent-live" : ""}">${pendingRegs}</div>
        </div>
        <div class="sc-kpi-card" onclick="PB.admin.switchSubTab('pro')">
          <div class="sc-kpi-lbl">Lệ phí đã duyệt</div>
          <div class="sc-kpi-val accent-ok">${estRevenue.toLocaleString("vi-VN")}đ</div>
        </div>
        <div class="sc-kpi-card" onclick="PB.admin.switchSubTab('schedule')">
          <div class="sc-kpi-lbl">Tiến độ trận</div>
          <div class="sc-kpi-val">${doneMatches}/${d.matches.length}</div>
        </div>
      </div>
    `;
  },

  setRegFilter(f) {
    this.regFilter = f;
    this.renderAdminProSub();
  },

  renderAdminProSub() {
    const el = document.getElementById("admin-sub-pro");
    if (!el || !PB.state.data) return;
    this.ensureData();
    const info = PB.state.data.info;
    const cfg = PB.state.data.paymentConfig;
    const regs = PB.state.data.registrations;
    const pendingRegs = regs.filter((r) => r.status === "pending");
    const filteredRegs = regs.filter((r) => this.regFilter === "all" || r.status === this.regFilter);
    const numCourts = Number(PB.state.data.settings.numCourts) || 4;

    el.innerHTML = `
      <!-- 1. QUẢN LÝ ĐƠN ĐĂNG KÝ (SPORTCONNECT STYLE) -->
      <div class="card">
        <div class="section-header">
          <h3>Quản lý Đơn đăng ký (${regs.length})</h3>
          <div class="sc-filter-pills">
            <button class="sc-fpill ${this.regFilter === "all" ? "active" : ""}" onclick="PB.pro.setRegFilter('all')">Tất cả (${regs.length})</button>
            <button class="sc-fpill ${this.regFilter === "pending" ? "active" : ""}" onclick="PB.pro.setRegFilter('pending')">Chờ duyệt (${pendingRegs.length})</button>
            <button class="sc-fpill ${this.regFilter === "approved" ? "active" : ""}" onclick="PB.pro.setRegFilter('approved')">Đã duyệt</button>
          </div>
        </div>

        ${filteredRegs.length ? `
          <div class="match-list">
            ${filteredRegs.map((r) => {
              const initials = (r.name || "VĐ").trim().slice(0, 2).toUpperCase();
              return `
                <div class="sc-reg-item">
                  <div class="sc-reg-left">
                    <div class="sc-reg-avatar">${PB.app.escape(initials)}</div>
                    <div style="min-width:0;">
                      <div class="match-meta">
                        ${r.status === "approved" ? '<span class="badge badge-done">Đã duyệt</span>' : '<span class="badge badge-serieA">Chờ duyệt</span>'}
                        <strong>${PB.app.escape(r.name)}</strong>
                        ${r.rating ? `<span class="badge-rating">${PB.app.escape(r.rating)}</span>` : ""}
                      </div>
                      <div class="muted" style="font-size:0.78rem;margin-top:2px;">
                        📞 ${PB.app.escape(r.phone)} • ${PB.app.escape(r.gender)} • CLB: ${PB.app.escape(r.club || "-")}
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${r.status !== "approved" ? `<button class="btn btn-sm btn-success" onclick="PB.pro.approveRegistration('${r.id}')">Duyệt</button>` : ""}
                    <button class="btn btn-sm btn-secondary" style="color:#0068ff;border-color:#93c5fd;" onclick="PB.pro.openZalo('${r.id}')">Nhắn Zalo</button>
                    <button class="btn btn-sm btn-danger" onclick="PB.pro.deleteRegistration('${r.id}')">Xóa</button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : '<p class="muted text-center" style="margin:8px 0;">Không có đơn đăng ký nào trong mục này.</p>'}
      </div>

      <!-- 2. CẤU HÌNH CỔNG ĐĂNG KÝ & VIETQR -->
      <div class="card">
        <h3>Cấu hình Cổng đăng ký & VietQR</h3>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Trạng thái cổng đăng ký</label>
            <select id="payEnabled" class="input">
              <option value="true" ${cfg.enabled ? "selected" : ""}>Đang mở đăng ký</option>
              <option value="false" ${!cfg.enabled ? "selected" : ""}>Đóng cổng đăng ký</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Giới hạn số đội (Max Slots)</label>
            <input type="number" id="payMaxSlots" class="input" value="${Number(cfg.maxSlots || 32)}" min="2" max="256" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Lệ phí (VNĐ)</label>
            <input type="number" id="payFee" class="input" value="${Number(cfg.fee || 0)}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Mã Ngân hàng (VietQR)</label>
            <input type="text" id="payBankId" class="input" value="${PB.app.escape(cfg.bankId)}" placeholder="MB, VCB, BIDV, TCB..." />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Số tài khoản nhận lệ phí</label>
            <input type="text" id="payAccNo" class="input" value="${PB.app.escape(cfg.accountNo)}" placeholder="Nhập STK..." />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Tên chủ tài khoản</label>
            <input type="text" id="payAccName" class="input" value="${PB.app.escape(cfg.accountName)}" placeholder="NGUYEN VAN A" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Tiền tố nội dung CK</label>
            <input type="text" id="payPrefix" class="input" value="${PB.app.escape(cfg.prefix)}" placeholder="PB2026" />
          </div>
        </div>
        <button class="btn btn-primary" onclick="PB.pro.savePaymentConfig()">Lưu cấu hình Cổng ĐK & VietQR</button>
      </div>

      <!-- 3. ĐĂNG BANNER, THÔNG TIN & ẢNH GIẢI -->
      <div class="card">
        <h3>Đăng Banner, Thông tin & Ảnh giải đấu</h3>
        <div class="form-group">
          <label>Ảnh Banner đầu trang (tự động nén nhẹ)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input type="file" accept="image/*" class="input-sm" style="flex:1;" onchange="PB.pro.onUploadBanner(this)" />
            ${info.banner ? `<button class="btn btn-sm btn-danger" onclick="PB.pro.removeBanner()">Xóa Banner</button>` : ""}
          </div>
          ${info.banner ? `<img src="${PB.app.escape(info.banner)}" style="margin-top:8px;max-height:140px;border-radius:10px;max-width:100%;object-fit:cover;" />` : ""}
        </div>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Giờ khai mạc (Đếm ngược)</label>
            <input type="datetime-local" id="proStartTime" class="input" value="${PB.app.escape(info.startTime || "")}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Địa điểm sân / Ghi chú ngắn</label>
            <input type="text" id="proSubtitle" class="input" value="${PB.app.escape(info.subtitle)}" placeholder="VD: Cụm sân Pickleball Cao Bằng" />
          </div>
        </div>
        <div class="form-group">
          <label>Thông báo / Điều lệ / Cơ cấu giải thưởng</label>
          <textarea id="proAnnouncement" rows="3" placeholder="Nhập thông báo BTC, cơ cấu giải thưởng, lưu ý cho VĐV...">${PB.app.escape(info.announcement)}</textarea>
        </div>
        <button class="btn btn-primary" onclick="PB.pro.saveInfoText()">Lưu thông tin giải</button>

        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;" />

        <div class="form-group">
          <label>Thư viện ảnh giải đấu (${info.gallery.length} ảnh)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input type="text" id="proGalleryCap" class="input-sm" style="flex:1;" placeholder="Chú thích ảnh (tùy chọn)..." />
            <input type="file" accept="image/*" class="input-sm" onchange="PB.pro.onUploadGallery(this)" />
          </div>
          ${info.gallery.length ? `
            <div class="pro-gallery-strip" style="margin-top:8px;">
              ${info.gallery.map((g, i) => `
                <div class="pro-gallery-item" style="position:relative;">
                  <img src="${PB.app.escape(g.url)}" />
                  <button class="btn btn-sm btn-danger" style="position:absolute;top:4px;right:4px;padding:2px 6px;" onclick="PB.pro.removeGallery(${i})">✕</button>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>

      <!-- 4. OBS LIVESTREAM & CHỐT ĐIỂM TRÌNH -->
      <div class="card">
        <h3>Livestream OBS & Điểm trình CLB</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          ${Array.from({ length: numCourts }, (_, i) => i + 1).map((c) => `
            <button class="btn btn-sm btn-secondary" onclick="PB.pro.copyObsLink(${c})">Link OBS Sân ${c}</button>
          `).join("")}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border);">
          <span class="muted">BXH Trình CLB hiện có <strong>${PB.state.data.clubRanking.length}</strong> VĐV</span>
          <button class="btn btn-sm btn-warning" onclick="PB.pro.applyTournamentRatings()">Chốt điểm trình giải này (Elo)</button>
        </div>
      </div>
    `;
  },

  async onUploadBanner(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await this.compressImage(file, 1100, 0.72);
      this.ensureData();
      PB.state.data.info.banner = dataUrl;
      PB.state.save();
      PB.app.toast("Đã tải lên ảnh Banner!");
    } catch { PB.ui.alert("Không thể đọc file ảnh này."); }
  },

  removeBanner() {
    this.ensureData();
    PB.state.data.info.banner = "";
    PB.state.save();
    PB.app.toast("Đã xóa Banner");
  },

  async onUploadGallery(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await this.compressImage(file, 900, 0.7);
      const caption = (document.getElementById("proGalleryCap")?.value || "").trim();
      this.ensureData();
      PB.state.data.info.gallery.unshift({ url: dataUrl, caption });
      PB.state.save();
      PB.app.toast("Đã thêm ảnh vào thư viện giải!");
    } catch { PB.ui.alert("Không thể đọc file ảnh này."); }
  },

  removeGallery(idx) {
    this.ensureData();
    PB.state.data.info.gallery.splice(idx, 1);
    PB.state.save();
  },

  saveInfoText() {
    this.ensureData();
    PB.state.data.info.startTime = (document.getElementById("proStartTime")?.value || "").trim();
    PB.state.data.info.subtitle = (document.getElementById("proSubtitle")?.value || "").trim();
    PB.state.data.info.announcement = (document.getElementById("proAnnouncement")?.value || "").trim();
    PB.state.save();
    PB.app.toast("Đã lưu thông tin & giờ đếm ngược!");
  },

  savePaymentConfig() {
    this.ensureData();
    PB.state.data.paymentConfig = {
      enabled: document.getElementById("payEnabled")?.value === "true",
      maxSlots: Number(document.getElementById("payMaxSlots")?.value) || 32,
      bankId: (document.getElementById("payBankId")?.value || "MB").trim().toUpperCase(),
      accountNo: (document.getElementById("payAccNo")?.value || "").trim(),
      accountName: (document.getElementById("payAccName")?.value || "").trim().toUpperCase(),
      fee: Number(document.getElementById("payFee")?.value) || 0,
      prefix: (document.getElementById("payPrefix")?.value || "PB2026").trim()
    };
    PB.state.save();
    PB.app.toast("Đã lưu cấu hình Cổng đăng ký & VietQR!");
  }
};
