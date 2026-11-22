/* =========================================================
   js/pro.js — GÓI NÂNG CẤP SPORTCONNECT PRO (v34)
   1. Admin đăng Banner, Thông báo/Điều lệ, Ảnh giải đấu & Nhà tài trợ (tự nén ảnh)
   2. Cổng VĐV tự đăng ký + VietQR lệ phí tự động + Admin duyệt đơn
   3. Khung tỷ số Livestream nền trong suốt (?obs=1, ?obs=2...)
   4. BXH Điểm trình CLB tích lũy qua nhiều giải (Elo Pickleball)
   ========================================================= */
window.PB = window.PB || {};

PB.pro = {
  obsCourt: null,

  ensureData() {
    const d = PB.state.data;
    if (!d) return;
    if (!d.info) {
      d.info = { banner: "", subtitle: "", announcement: "", sponsors: [], gallery: [] };
    }
    if (!Array.isArray(d.info.sponsors)) d.info.sponsors = [];
    if (!Array.isArray(d.info.gallery)) d.info.gallery = [];
    if (!d.paymentConfig) {
      d.paymentConfig = { enabled: true, bankId: "MB", accountNo: "", accountName: "", fee: 200000, prefix: "PB2026" };
    }
    if (!Array.isArray(d.registrations)) d.registrations = [];
    if (!Array.isArray(d.clubRanking)) d.clubRanking = [];
  },

  // Tự động nén ảnh upload trên trình duyệt để lưu nhẹ trên Firebase (~80-130KB)
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

  // =========================================================
  // 1. HIỂN THỊ BANNER, THÔNG TIN & ẢNH GIẢI CHO KHÁN GIẢ
  // =========================================================
  renderPublicInfo() {
    const el = document.getElementById("proPublicInfoSection");
    if (!el || !PB.state.data) return;
    this.ensureData();
    const info = PB.state.data.info;
    const hasBanner = !!(info.banner && info.banner.trim());
    const hasText = !!(info.subtitle || info.announcement);
    const hasGallery = info.gallery.length > 0;
    const hasSponsors = info.sponsors.length > 0;

    if (!hasBanner && !hasText && !hasGallery && !hasSponsors) {
      el.innerHTML = "";
      el.classList.add("hidden");
      return;
    }

    el.classList.remove("hidden");
    el.innerHTML = `
      <div class="pro-info-card">
        ${hasBanner ? `<div class="pro-banner-wrap"><img src="${PB.app.escape(info.banner)}" alt="Banner giải đấu" /></div>` : ""}
        ${hasText ? `
          <div class="pro-info-body">
            ${info.subtitle ? `<div class="pro-subtitle">${PB.app.escape(info.subtitle)}</div>` : ""}
            ${info.announcement ? `<div class="pro-announcement">${PB.app.escape(info.announcement).replace(/\n/g, "<br/>")}</div>` : ""}
          </div>
        ` : ""}
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
    `;
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
  // 2. CỔNG VĐV TỰ ĐĂNG KÝ + VIETQR ĐÓNG LỆ PHÍ
  // =========================================================
  openRegisterModal() {
    this.ensureData();
    const cfg = PB.state.data.paymentConfig;
    if (!cfg.enabled) {
      return PB.ui.alert("Ban tổ chức hiện đã đóng cổng đăng ký trực tuyến.", "Thông báo");
    }
    const feeTxt = Number(cfg.fee || 0).toLocaleString("vi-VN") + "đ";
    PB.app.openInfoModal(
      "Đăng ký thi đấu trực tuyến",
      `
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
        <div class="form-grid" style="gap:8px;">
          <div class="form-group">
            <label>Giới tính / Nội dung</label>
            <select id="regGender" class="input">
              <option value="Nam Nữ">Đôi Nam Nữ</option>
              <option value="Nam">Đôi Nam</option>
              <option value="Nữ">Đôi Nữ</option>
              <option value="Đồng đội">Đồng đội</option>
            </select>
          </div>
          <div class="form-group">
            <label>Trình dự kiến</label>
            <input type="text" id="regRating" class="input" placeholder="VD: 3.0" />
          </div>
        </div>
        <div class="toss-summary-pill" style="margin-top:6px;">
          Lệ phí giải: <strong style="color:var(--primary);">${feeTxt}</strong>
          ${cfg.accountNo ? `<br/><span class="muted">Sau khi bấm Đăng ký, hệ thống sẽ hiện mã VietQR để chuyển khoản nhanh.</span>` : ""}
        </div>
        <button class="btn ios27-btn-primary mt-12" onclick="PB.pro.submitRegistration()">Gửi đăng ký & Lấy mã VietQR</button>
      `
    );
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
        "Quét VietQR đóng lệ phí",
        `
          <div class="text-center">
            <div class="badge badge-done" style="margin-bottom:8px;">✓ Đã ghi nhận đơn đăng ký của ${PB.app.escape(name)}</div>
            <p class="muted" style="margin:4px 0 8px;">Quét mã bên dưới để chuyển lệ phí <strong>${Number(cfg.fee || 0).toLocaleString("vi-VN")}đ</strong>. BTC sẽ duyệt ngay khi nhận được tiền.</p>
            <img src="${qrUrl}" alt="VietQR" style="max-width:250px;width:100%;border-radius:14px;border:1px solid var(--border);padding:6px;background:#fff;" />
            <div class="toss-summary-pill" style="margin-top:8px;text-align:left;font-size:0.8rem;">
              <div>Ngân hàng: <strong>${PB.app.escape(cfg.bankId)}</strong></div>
              <div>Số TK: <strong>${PB.app.escape(cfg.accountNo)}</strong></div>
              ${cfg.accountName ? `<div>Chủ TK: <strong>${PB.app.escape(cfg.accountName)}</strong></div>` : ""}
              <div>Nội dung: <strong>${PB.app.escape(memo)}</strong></div>
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
    navigator.clipboard?.writeText(url).then(() => PB.app.toast(`Đã chép link OBS Sân ${courtNum}!`)).catch(() => PB.ui.alert(url, `Link OBS Sân ${courtNum}`));
  },

  // =========================================================
  // 4. HỒ SƠ VĐV & ĐIỂM TRÌNH TÍCH LŨY CLB (ELO PICKLEBALL)
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
              `).join("") : `<tr><td colspan="6" class="muted text-center">Chưa có dữ liệu điểm trình. BTC vào Quản lý → Truyền thông & Pro để chốt điểm trình sau giải.</td></tr>`}
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

    const K = 0.16; // Hệ số biến động điểm trình chuẩn thang 2.0 - 6.0
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
  // 5. GIAO DIỆN ADMIN: TRUYỀN THÔNG, ĐĂNG KÝ, OBS & TRÌNH CLB
  // =========================================================
  renderAdminProSub() {
    const el = document.getElementById("admin-sub-pro");
    if (!el || !PB.state.data) return;
    this.ensureData();
    const info = PB.state.data.info;
    const cfg = PB.state.data.paymentConfig;
    const regs = PB.state.data.registrations;
    const pendingRegs = regs.filter((r) => r.status === "pending");
    const numCourts = Number(PB.state.data.settings.numCourts) || 4;

    el.innerHTML = `
      <!-- 1. ĐĂNG ẢNH & THÔNG TIN GIẢI -->
      <div class="card">
        <h3>1. Đăng Banner, Thông tin & Ảnh giải đấu</h3>
        <div class="form-group">
          <label>Ảnh Banner đầu trang (tải từ máy hoặc dán link)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input type="file" accept="image/*" class="input-sm" style="flex:1;" onchange="PB.pro.onUploadBanner(this)" />
            ${info.banner ? `<button class="btn btn-sm btn-danger" onclick="PB.pro.removeBanner()">Xóa Banner</button>` : ""}
          </div>
          ${info.banner ? `<img src="${PB.app.escape(info.banner)}" style="margin-top:8px;max-height:140px;border-radius:10px;max-width:100%;object-fit:cover;" />` : ""}
        </div>
        <div class="form-group">
          <label>Dòng thông tin ngắn (Thời gian • Địa điểm sân)</label>
          <input type="text" id="proSubtitle" class="input" value="${PB.app.escape(info.subtitle)}" placeholder="VD: 07:30 Chủ nhật 22/11/2026 • Cụm sân Pickleball Cao Bằng" />
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

      <!-- 2. CỔNG ĐĂNG KÝ & VIETQR -->
      <div class="card">
        <div class="section-header">
          <h3>2. Cổng VĐV tự đăng ký & VietQR</h3>
          <span class="badge badge-live">${pendingRegs.length} đơn chờ duyệt</span>
        </div>
        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Trạng thái cổng đăng ký</label>
            <select id="payEnabled" class="input">
              <option value="true" ${cfg.enabled ? "selected" : ""}>Đang mở đăng ký</option>
              <option value="false" ${!cfg.enabled ? "selected" : ""}>Đóng cổng đăng ký</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Mã Ngân hàng (VietQR)</label>
            <input type="text" id="payBankId" class="input" value="${PB.app.escape(cfg.bankId)}" placeholder="MB, VCB, BIDV, TCB, ACB..." />
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
            <label>Lệ phí (VNĐ)</label>
            <input type="number" id="payFee" class="input" value="${Number(cfg.fee || 0)}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Tiền tố nội dung CK</label>
            <input type="text" id="payPrefix" class="input" value="${PB.app.escape(cfg.prefix)}" placeholder="PB2026" />
          </div>
        </div>
        <button class="btn btn-primary" onclick="PB.pro.savePaymentConfig()">Lưu cấu hình VietQR</button>

        ${regs.length ? `
          <div class="match-list mt-12">
            ${regs.map((r) => `
              <div class="match-item">
                <div>
                  <div class="match-meta">
                    ${r.status === "approved" ? '<span class="badge badge-done">Đã duyệt</span>' : '<span class="badge badge-serieA">Chờ duyệt</span>'}
                    <strong>${PB.app.escape(r.name)}</strong>
                    <span>• ${PB.app.escape(r.phone)}</span>
                  </div>
                  <div class="muted" style="font-size:0.78rem;margin-top:3px;">
                    CLB: ${PB.app.escape(r.club || "-")} • ${PB.app.escape(r.gender)} • Trình: ${PB.app.escape(r.rating || "-")}
                  </div>
                </div>
                <div style="display:flex;gap:6px;">
                  ${r.status !== "approved" ? `<button class="btn btn-sm btn-success" onclick="PB.pro.approveRegistration('${r.id}')">Duyệt</button>` : ""}
                  <button class="btn btn-sm btn-danger" onclick="PB.pro.deleteRegistration('${r.id}')">Xóa</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : '<p class="muted mt-12">Chưa có đơn đăng ký trực tuyến nào.</p>'}
      </div>

      <!-- 3. OBS LIVESTREAM OVERLAY -->
      <div class="card">
        <h3>3. Khung tỷ số Livestream (OBS / PRISM Live)</h3>
        <p class="muted" style="margin-top:0;">Sao chép đường link nền trong suốt dưới đây dán vào nguồn Web (Browser Source) trên OBS hoặc PRISM Live:</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${Array.from({ length: numCourts }, (_, i) => i + 1).map((c) => `
            <button class="btn btn-sm btn-secondary" onclick="PB.pro.copyObsLink(${c})">Chép link OBS Sân ${c}</button>
          `).join("")}
        </div>
      </div>

      <!-- 4. CHỐT ĐIỂM TRÌNH CLB -->
      <div class="card">
        <div class="section-header">
          <h3>4. Điểm trình CLB tích lũy (${PB.state.data.clubRanking.length} VĐV)</h3>
          <button class="btn btn-sm btn-warning" onclick="PB.pro.applyTournamentRatings()">Chốt điểm trình giải này (Elo)</button>
        </div>
        <p class="muted" style="margin:0;">Sau khi các trận kết thúc, bấm nút trên để tự động cộng/trừ điểm trình vào <strong>BXH Trình CLB</strong> (mỗi trận chỉ tính 1 lần, không bị trùng).</p>
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
    PB.state.data.info.subtitle = (document.getElementById("proSubtitle")?.value || "").trim();
    PB.state.data.info.announcement = (document.getElementById("proAnnouncement")?.value || "").trim();
    PB.state.save();
    PB.app.toast("Đã lưu thông tin giải đấu!");
  },

  savePaymentConfig() {
    this.ensureData();
    PB.state.data.paymentConfig = {
      enabled: document.getElementById("payEnabled")?.value === "true",
      bankId: (document.getElementById("payBankId")?.value || "MB").trim().toUpperCase(),
      accountNo: (document.getElementById("payAccNo")?.value || "").trim(),
      accountName: (document.getElementById("payAccName")?.value || "").trim().toUpperCase(),
      fee: Number(document.getElementById("payFee")?.value) || 0,
      prefix: (document.getElementById("payPrefix")?.value || "PB2026").trim()
    };
    PB.state.save();
    PB.app.toast("Đã lưu cấu hình VietQR & Cổng đăng ký!");
  }
};
