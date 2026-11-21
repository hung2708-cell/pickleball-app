/* =========================================================
   js/referee.js
   - Hỗ trợ chấm điểm cả thể thức Đôi và Đồng đội (4 trận đôi + Đơn)
   - Đồng đội:
     + Đăng ký đội hình 4 trận (Đôi nữ, Đôi nam, Đôi nam nữ 1, Đôi nam nữ 2)
       & thứ tự đánh đơn (Nam gặp Nam, Nữ gặp Nữ) trước khi thi đấu.
     + Tự động chặn nếu 1 VĐV đăng ký quá 02 trận đôi.
     + Vòng bảng: chạm 15đ, 8đ đổi sân. Loại trực tiếp: 14-14 cách 2đ, max 18đ.
     + Hòa 2-2 (loại trực tiếp): Mở bàn chấm Đơn ăn điểm trực tiếp,
       xoay tua mỗi 4 điểm, 11đ đổi sân, chạm 21đ.
     + Bỏ cuộc đôi (15-0) & Bỏ cuộc cả đội (4-0).
   ========================================================= */
window.PB = window.PB || {};

PB.referee = {
  activeMatchId: null,
  activeSubIdx: null,
  lineupStep: "A",     // 'A' | 'B'
  lineupDraft: null,   // { A: [[p1,p2],...], B: [[p1,p2],...], singlesA: "", singlesB: "" }
  timerInterval: null,
  timerSeconds: 0,
  timerTotal: 60,
  timerLabel: "",

  _setScoringLock(locked) {
    document.body.classList.toggle("ref-scoring-mode", !!locked);
  },

  render() {
    const allowed = PB.auth.isReferee();
    document.getElementById("refereeLockedView").classList.toggle("hidden", allowed);
    document.getElementById("refereeContent").classList.toggle("hidden", !allowed);
    if (!allowed) { this._setScoringLock(false); return; }

    this._populateCourtFilter();
    if (this.activeMatchId) this.renderConsole();
    else this.renderList();
  },

  _populateCourtFilter() {
    const sel = document.getElementById("refCourtFilter");
    if (!sel) return;
    const prev = sel.value || "all";
    const num = Number(PB.state.data.settings.numCourts) || 4;
    let opts = `<option value="all">Tất cả các sân</option>`;
    for (let i = 1; i <= num; i++) opts += `<option value="${i}">Chỉ Sân ${i}</option>`;
    sel.innerHTML = opts;
    sel.value = prev;
  },

  renderList() {
    this._setScoringLock(false);
    document.getElementById("refMatchListView").classList.remove("hidden");
    document.getElementById("refConsoleView").classList.add("hidden");

    const filterCourt = document.getElementById("refCourtFilter")?.value || "all";
    const matches = PB.state.data.matches.filter((m) => {
      if (m.status === "finished") return false;
      if (!m.teamA || !m.teamB) return false;
      if (filterCourt !== "all" && String(m.court) !== String(filterCourt)) return false;
      return true;
    });

    document.getElementById("refMatchCount").textContent = `${matches.length} trận sẵn sàng`;
    const container = document.getElementById("refMatchesContainer");
    if (!matches.length) {
      container.innerHTML = `<div class="card muted text-center">Không có trận nào đang chờ hoặc đang đánh ở sân đã chọn.</div>`;
      return;
    }

    container.innerHTML = matches.map((m) => `
      <div class="match-item">
        <div>
          <div class="match-meta">
            ${m.status === "live" ? '<span class="badge badge-live">Đang đánh</span>' : '<span class="badge badge-wait">Chờ đánh</span>'}
            ${m.matchType === "team" ? '<span class="badge badge-serieA">Đồng đội (4 trận)</span>' : ""}
            <strong>${PB.app.escape(m.roundName)}</strong>
            <span>• ${m.court ? "Sân " + m.court : "Chưa xếp sân"}</span>
          </div>
          <div class="match-teams">
            ${PB.app.escape(PB.state.getTeamName(m.teamA))} <span class="muted">vs</span> ${PB.app.escape(PB.state.getTeamName(m.teamB))}
          </div>
        </div>
        <button class="btn btn-primary" onclick="PB.referee.openMatch('${m.id}')">
          ${m.status === "live" ? "Tiếp tục chấm" : "Mở trận"}
        </button>
      </div>
    `).join("");
  },

  async openMatch(matchId) {
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (!m) return;
    if (m.status === "pending") {
      const conflict = PB.state.findLiveConflict(matchId);
      if (conflict) {
        await PB.ui.alert(
          `Không thể bắt đầu trận này vì VĐV/Đội [${conflict.who}] đang thi đấu trên Sân ${conflict.court}.\nVĐV không thể thi đấu cùng lúc trên 2 sân.`,
          "Trùng sân thi đấu"
        );
        return;
      }
    }
    this.activeMatchId = matchId;
    this.activeSubIdx = null;
    this.lineupStep = "A";
    this.lineupDraft = null;
    if (m.matchType !== "team" && m.status === "pending") {
      PB.rules.startMatch(m);
      PB.state.save();
    }
    this.renderConsole();
  },

  // Tách tên 2 VĐV từ mảng hoặc chuỗi "Tên 1 / Tên 2"
  _splitTwoPlayers(playersArr, fallbackTeamName) {
    if (Array.isArray(playersArr)) {
      const clean = playersArr.map((x) => (x || "").trim()).filter(Boolean);
      if (clean.length >= 2) return [clean[0], clean[1]];
      if (clean.length === 1) return [clean[0], "Tay 2"];
    }
    if (fallbackTeamName) {
      const parts = String(fallbackTeamName).split(/[\/,&\-]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return [parts[0], parts[1]];
      if (parts.length === 1) return [parts[0] + " 1", parts[0] + " 2"];
    }
    return ["VĐV 1", "VĐV 2"];
  },

  // Vẽ sơ đồ sân 2D chuẩn USAP (44ft x 20ft) với 4 chấm tròn phát sáng, tên VĐV & Tay 1 / Tay 2
  _renderCourtDiagram({ leftSide, rightSide, leftName, rightName, leftPlayers, rightPlayers, serverSide, scoreA, scoreB, serverNum }) {
    const scoreLeft = leftSide === "A" ? scoreA : scoreB;
    const scoreRight = rightSide === "A" ? scoreA : scoreB;
    const serverScore = serverSide === "A" ? scoreA : scoreB;
    const isServerEven = (serverScore % 2) === 0;
    const serverOnLeft = (serverSide === leftSide);

    const pLeft = this._splitTwoPlayers(leftPlayers, leftName);   // [Tay 1, Tay 2]
    const pRight = this._splitTwoPlayers(rightPlayers, rightName); // [Tay 1, Tay 2]

    // Vị trí Tay 1 / Tay 2 trên sân dựa theo điểm của từng đội (không ghi chữ chẵn/lẻ):
    // - Nửa sân TRÁI (nhìn sang phải): ô DƯỚI là ô phải, ô TRÊN là ô trái
    //   Điểm chẵn -> Tay 1 ở DƯỚI, Tay 2 ở TRÊN; Điểm lẻ -> Tay 1 ở TRÊN, Tay 2 ở DƯỚI
    const leftBotPlayer = (scoreLeft % 2 === 0) ? { name: pLeft[0], hand: "Tay 1" } : { name: pLeft[1], hand: "Tay 2" };
    const leftTopPlayer = (scoreLeft % 2 === 0) ? { name: pLeft[1], hand: "Tay 2" } : { name: pLeft[0], hand: "Tay 1" };

    // - Nửa sân PHẢI (nhìn sang trái): ô TRÊN là ô phải, ô DƯỚI là ô trái
    //   Điểm chẵn -> Tay 1 ở TRÊN, Tay 2 ở DƯỚI; Điểm lẻ -> Tay 1 ở DƯỚI, Tay 2 ở TRÊN
    const rightTopPlayer = (scoreRight % 2 === 0) ? { name: pRight[0], hand: "Tay 1" } : { name: pRight[1], hand: "Tay 2" };
    const rightBotPlayer = (scoreRight % 2 === 0) ? { name: pRight[1], hand: "Tay 2" } : { name: pRight[0], hand: "Tay 1" };

    // Xác định ô Phát bóng và ô Đỡ bóng (chéo sân)
    let lTopState = "", lBotState = "", rTopState = "", rBotState = "";
    let arrow = { x1: 0, y1: 0, x2: 0, y2: 0 };

    if (serverOnLeft) {
      if (isServerEven) {
        lBotState = "serve"; rTopState = "receive";
        arrow = { x1: 95, y1: 162, x2: 385, y2: 62 };
      } else {
        lTopState = "serve"; rBotState = "receive";
        arrow = { x1: 95, y1: 62, x2: 385, y2: 162 };
      }
    } else {
      if (isServerEven) {
        rTopState = "serve"; lBotState = "receive";
        arrow = { x1: 385, y1: 62, x2: 95, y2: 162 };
      } else {
        rBotState = "serve"; lTopState = "receive";
        arrow = { x1: 385, y1: 162, x2: 95, y2: 62 };
      }
    }

    const shortName = (n) => (n && n.length > 11 ? n.slice(0, 10) + "…" : n);

    const renderPlayerBox = (x, y, state, player) => {
      const cx = x + 75;
      const cy = y + 46;
      const boxFill = state === "serve" ? "rgba(234, 88, 12, 0.25)" : state === "receive" ? "rgba(5, 150, 105, 0.25)" : "#1d4ed8";

      let dotMarkup = `
        <circle cx="${cx}" cy="${cy - 6}" r="9" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" />
      `;
      let statusBadge = "";

      if (state === "serve") {
        dotMarkup = `
          <circle cx="${cx}" cy="${cy - 6}" r="14" class="player-ring-serve" />
          <circle cx="${cx}" cy="${cy - 6}" r="11" fill="#f97316" stroke="#fde047" stroke-width="2.5" class="player-dot-serve" />
        `;
        statusBadge = `
          <rect x="${cx - 46}" y="${y + 4}" width="92" height="17" rx="8.5" fill="rgba(0,0,0,0.62)" />
          <text x="${cx}" y="${y + 15.5}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="800">PHÁT${serverNum ? ` • TAY ${serverNum}` : ""}</text>
        `;
      } else if (state === "receive") {
        dotMarkup = `
          <circle cx="${cx}" cy="${cy - 6}" r="14" class="player-ring-receive" />
          <circle cx="${cx}" cy="${cy - 6}" r="11" fill="#10b981" stroke="#6ee7b7" stroke-width="2.5" class="player-dot-receive" />
        `;
        statusBadge = `
          <rect x="${cx - 38}" y="${y + 4}" width="76" height="17" rx="8.5" fill="rgba(0,0,0,0.62)" />
          <text x="${cx}" y="${y + 15.5}" text-anchor="middle" fill="#6ee7b7" font-size="9.5" font-weight="800">ĐỠ BÓNG</text>
        `;
      }

      return `
        <rect x="${x}" y="${y}" width="150" height="100" fill="${boxFill}" stroke="#ffffff" stroke-width="2" />
        ${statusBadge}
        ${dotMarkup}
        <rect x="${cx - 56}" y="${cy + 11}" width="112" height="20" rx="6" fill="rgba(15,23,42,0.72)" />
        <text x="${cx}" y="${cy + 24.5}" text-anchor="middle" fill="#ffffff" font-size="10.5" font-weight="800">${PB.app.escape(shortName(player.name))}</text>
        <text x="${cx}" y="${cy + 42}" text-anchor="middle" fill="#cbd5e1" font-size="9.5" font-weight="700">${player.hand}</text>
      `;
    };

    return `
      <div class="pb-court-2d-wrap">
        <div class="pb-court-2d-header">
          <span class="pb-court-2d-side-tag"><strong>Trái:</strong> ${PB.app.escape(leftName)}</span>
          <span class="pb-court-2d-side-tag"><strong>Phải:</strong> ${PB.app.escape(rightName)}</span>
        </div>
        <div class="pb-court-svg-box">
          <svg class="pb-court-svg" viewBox="0 0 480 230" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <marker id="serveArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 8 3.5, 0 7" fill="#fde047" />
              </marker>
            </defs>
            <rect x="0" y="0" width="480" height="230" rx="12" fill="#0f766e" opacity="0.35" />

            <!-- Nền sân xanh dương -->
            <rect x="20" y="15" width="440" height="200" fill="#1d4ed8" />

            <!-- 4 ô VĐV kèm chấm tròn phát sáng, tên & Tay 1 / Tay 2 -->
            ${renderPlayerBox(20, 15, lTopState, leftTopPlayer)}
            ${renderPlayerBox(20, 115, lBotState, leftBotPlayer)}
            ${renderPlayerBox(310, 15, rTopState, rightTopPlayer)}
            ${renderPlayerBox(310, 115, rBotState, rightBotPlayer)}

            <!-- 2 vùng Kitchen -->
            <rect x="170" y="15" width="70" height="200" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
            <rect x="240" y="15" width="70" height="200" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
            <text x="205" y="119" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="11" font-weight="800" transform="rotate(-90 205 115)">KITCHEN</text>
            <text x="275" y="119" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="11" font-weight="800" transform="rotate(90 275 115)">KITCHEN</text>

            <!-- Đường viền ngoài sân & Lưới -->
            <rect x="20" y="15" width="440" height="200" fill="none" stroke="#ffffff" stroke-width="3" />
            <line x1="240" y1="7" x2="240" y2="223" stroke="#f8fafc" stroke-width="4" stroke-dasharray="6,4" />
            <circle cx="240" cy="7" r="4.5" fill="#fbbf24" stroke="#0f172a" stroke-width="1.5" />
            <circle cx="240" cy="223" r="4.5" fill="#fbbf24" stroke="#0f172a" stroke-width="1.5" />

            <!-- Mũi tên giao bóng chéo sân -->
            <line x1="${arrow.x1}" y1="${arrow.y1}" x2="${arrow.x2}" y2="${arrow.y2}" stroke="#fde047" stroke-width="2.5" stroke-dasharray="6,5" opacity="0.9" marker-end="url(#serveArrowHead)" />
          </svg>
        </div>
        <div class="pb-court-2d-legend">
          <span><i class="pb-legend-dot" style="background:#f97316;box-shadow:0 0 6px #fde047;"></i>VĐV Phát bóng</span>
          <span><i class="pb-legend-dot" style="background:#10b981;box-shadow:0 0 6px #6ee7b7;"></i>VĐV Đỡ bóng</span>
        </div>
      </div>
    `;
  },

  // =========================================================
  // BỐC THĂM 2 BƯỚC CHUẨN LUẬT:
  // Bước 1: Tung đồng xu -> Đội thắng chọn Sân HOẶC Bóng
  // Bước 2: Đội còn lại chọn phần còn lại (Bóng HOẶC Sân)
  // =========================================================
  openTossModal() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const isSub = m.matchType === "team" && typeof this.activeSubIdx === "number";
    const nA = isSub
      ? ((m.subMatches[this.activeSubIdx].playersA || []).filter(Boolean).join(" / ") || PB.state.getTeamName(m.teamA))
      : PB.state.getTeamName(m.teamA);
    const nB = isSub
      ? ((m.subMatches[this.activeSubIdx].playersB || []).filter(Boolean).join(" / ") || PB.state.getTeamName(m.teamB))
      : PB.state.getTeamName(m.teamB);

    this._tossState = {
      nameA: nA,
      nameB: nB,
      winner: null,        // 'A' | 'B'
      loser: null,         // 'B' | 'A'
      firstCategory: null, // 'ball' | 'side'
      server: null,        // 'A' | 'B'
      swapped: null        // boolean (true = B bên trái, A bên phải)
    };

    this._renderTossModalContent();
    document.getElementById("infoModal").classList.remove("hidden");
  },

  _renderTossModalContent() {
    const st = this._tossState;
    if (!st) return;
    document.getElementById("infoModalTitle").textContent = "Bốc thăm chọn bóng & chọn sân";
    const body = document.getElementById("infoModalBody");

    if (!st.winner) {
      body.innerHTML = `
        <div class="text-center">
          <div class="toss-step-badge">Bước 1/3 • Tung đồng xu</div>
          <div id="tossCoinEl" class="toss-coin">?</div>
          <div style="font-weight:700;margin-bottom:14px;">
            ${PB.app.escape(st.nameA)} <span class="muted">vs</span> ${PB.app.escape(st.nameB)}
          </div>
          <button class="btn btn-primary" style="width:100%;" onclick="PB.referee.runCoinToss()">
            Tung đồng xu bốc thăm
          </button>
        </div>
      `;
      return;
    }

    const winName = st.winner === "A" ? st.nameA : st.nameB;
    const loseName = st.loser === "A" ? st.nameA : st.nameB;

    if (!st.firstCategory) {
      body.innerHTML = `
        <div class="text-center">
          <div class="toss-step-badge">Bước 2/3 • Đội thắng chọn trước</div>
          <div class="toss-coin">${st.winner}</div>
          <div style="font-weight:800;font-size:1rem;margin-bottom:6px;">
            Thắng bốc thăm: <span style="color:var(--primary);">${PB.app.escape(winName)}</span>
          </div>
          <p class="muted" style="margin:0 0 12px;">Chọn quyền <strong>Bóng</strong> hoặc quyền <strong>Sân</strong>. Đội còn lại sẽ chọn phần còn lại.</p>

          <div style="text-align:left;margin-bottom:10px;">
            <div class="muted" style="font-weight:700;margin-bottom:6px;">1. Chọn quyền Bóng:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button class="btn btn-primary" onclick="PB.referee.pickTossStep1('ball','serve')">Giao bóng trước</button>
              <button class="btn btn-secondary" onclick="PB.referee.pickTossStep1('ball','receive')">Đỡ bóng trước</button>
            </div>
          </div>

          <div style="text-align:left;">
            <div class="muted" style="font-weight:700;margin-bottom:6px;">2. Hoặc chọn Sân:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button class="btn btn-secondary" onclick="PB.referee.pickTossStep1('side','left')">Chọn Sân Trái</button>
              <button class="btn btn-secondary" onclick="PB.referee.pickTossStep1('side','right')">Chọn Sân Phải</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Bước 3: Đội còn lại chọn phần còn lại
    const summaryText = st.firstCategory === "ball"
      ? `<strong>${PB.app.escape(winName)}</strong> đã chọn: <strong>${st.server === st.winner ? "Giao bóng trước" : "Đỡ bóng trước"}</strong>.`
      : `<strong>${PB.app.escape(winName)}</strong> đã chọn: <strong>${(st.swapped ? "B" : "A") === st.winner ? "Sân Trái" : "Sân Phải"}</strong>.`;

    body.innerHTML = `
      <div class="text-center">
        <div class="toss-step-badge" style="background:var(--emerald-soft);color:var(--emerald);">Bước 3/3 • Đội còn lại chọn phần còn lại</div>
        <div class="toss-summary-pill">${summaryText}</div>
        <div style="font-weight:800;font-size:1rem;margin-bottom:10px;">
          Mời <span style="color:var(--emerald);">${PB.app.escape(loseName)}</span> chọn ${st.firstCategory === "ball" ? "Sân thi đấu" : "quyền Bóng"}:
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${st.firstCategory === "ball" ? `
            <button class="btn btn-success" onclick="PB.referee.pickTossStep2('left')">Chọn Sân Trái</button>
            <button class="btn btn-success" onclick="PB.referee.pickTossStep2('right')">Chọn Sân Phải</button>
          ` : `
            <button class="btn btn-success" onclick="PB.referee.pickTossStep2('serve')">Giao bóng trước</button>
            <button class="btn btn-success" onclick="PB.referee.pickTossStep2('receive')">Đỡ bóng trước</button>
          `}
        </div>
      </div>
    `;
  },

  runCoinToss() {
    const coin = document.getElementById("tossCoinEl");
    if (coin) {
      coin.classList.remove("spinning");
      void coin.offsetWidth;
      coin.classList.add("spinning");
    }
    const winner = Math.random() < 0.5 ? "A" : "B";
    setTimeout(() => {
      this._tossState.winner = winner;
      this._tossState.loser = winner === "A" ? "B" : "A";
      this._renderTossModalContent();
    }, 380);
  },

  pickTossStep1(category, choice) {
    const st = this._tossState;
    if (!st) return;
    st.firstCategory = category;
    if (category === "ball") {
      st.server = (choice === "serve") ? st.winner : st.loser;
    } else {
      // Nếu winner chọn Trái -> nếu winner là B thì swapped = true; nếu winner là A thì swapped = false
      st.swapped = (choice === "left") ? (st.winner === "B") : (st.winner === "A");
    }
    this._renderTossModalContent();
  },

  pickTossStep2(choice) {
    const st = this._tossState;
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!st || !m) return;

    if (st.firstCategory === "ball") {
      // Đội thua chọn Sân
      st.swapped = (choice === "left") ? (st.loser === "B") : (st.loser === "A");
    } else {
      // Đội thua chọn Bóng
      st.server = (choice === "serve") ? st.loser : st.winner;
    }

    const target = (m.matchType === "team" && typeof this.activeSubIdx === "number")
      ? m.subMatches[this.activeSubIdx]
      : m;

    target.server = st.server;
    target.serverNum = 2;
    target.swapped = !!st.swapped;

    PB.state.save();
    PB.app.closeModal("infoModal");
    PB.app.toast("Đã áp dụng đầy đủ kết quả bốc thăm Sân & Bóng!");
  },

  exitMatch() {
    this.stopTimer();
    this.activeMatchId = null;
    this.activeSubIdx = null;
    this.renderList();
  },

  renderConsole() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) { this.exitMatch(); return; }
    document.getElementById("refMatchListView").classList.add("hidden");
    const el = document.getElementById("refConsoleView");
    el.classList.remove("hidden");

    if (m.matchType === "team") {
      this._renderTeamConsole(m, el);
    } else {
      this._renderDoublesConsole(m, el);
    }
  },

  // =========================================================
  // GIAO DIỆN TRỌNG TÀI: THỂ THỨC ĐỒNG ĐỘI
  // =========================================================
  _renderTeamConsole(tie, el) {
    if (!tie.lineupLocked) {
      this._setScoringLock(false);
      this._renderTeamLineupForm(tie, el);
      return;
    }
    if (this.activeSubIdx === "db") {
      this._renderDreambreakerConsole(tie, el);
      return;
    }
    if (this.activeSubIdx !== null) {
      this._renderTeamSubMatchConsole(tie, this.activeSubIdx, el);
      return;
    }

    this._setScoringLock(false);
    // Màn hình tổng quan 4 trận đôi của cuộc đối đầu
    const nA = PB.state.getTeamName(tie.teamA);
    const nB = PB.state.getTeamName(tie.teamB);
    const isKO = tie.stage !== "group";
    const all4Done = tie.subMatches.every((s) => s.status === "finished");
    const needDreambreaker = isKO && all4Done && tie.scoreA === 2 && tie.scoreB === 2;

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.exitMatch()">← Danh sách trận</button>
          <div><strong>Sân ${tie.court || "?"}</strong> • ${PB.app.escape(tie.roundName)} (${isKO ? "Loại trực tiếp" : "Vòng bảng"})</div>
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.unlockLineup()">Sửa đội hình</button>
        </div>

        <div class="callout-banner">
          <div class="callout-label">${PB.app.escape(nA)} vs ${PB.app.escape(nB)}</div>
          <div class="callout-score">${tie.scoreA} - ${tie.scoreB}</div>
          <div class="callout-label" style="margin-top:4px;">
            ${isKO ? "Loại trực tiếp: Chạm 15đ (14-14 cách 2đ, max 18đ) • 8đ đổi sân • Hòa 2-2 đánh Đơn" : "Vòng bảng: 4 trận đôi chạm 15đ • 8đ đổi sân"}
          </div>
        </div>

        ${needDreambreaker ? `
          <div class="switch-alert" style="margin-bottom:14px;">
            HÒA 2-2! MỞ TRẬN ĐƠN ĂN ĐIỂM TRỰC TIẾP (DREAMBREAKER)
            <div style="margin-top:8px;">
              <button class="btn btn-danger" onclick="PB.referee.openSubMatch('db')">Bắt đầu chấm Trận Đơn</button>
            </div>
          </div>
        ` : ""}

        <div class="match-list">
          ${tie.subMatches.map((sm, idx) => `
            <div class="match-item">
              <div>
                <div class="match-meta">
                  ${sm.status === "live" ? '<span class="badge badge-live">Đang đánh</span>' : sm.status === "finished" ? '<span class="badge badge-done">Kết thúc</span>' : '<span class="badge badge-wait">Chờ đánh</span>'}
                  <strong>${sm.label}</strong>
                  ${sm.finishReason ? `<span class="muted">(${sm.finishReason})</span>` : ""}
                </div>
                <div class="match-teams" style="font-size:0.88rem;">
                  <span style="${sm.winner === "A" ? "color:var(--emerald)" : ""}">${PB.app.escape((sm.playersA || []).filter(Boolean).join(" / ") || nA)}</span>
                  <span class="muted"> vs </span>
                  <span style="${sm.winner === "B" ? "color:var(--emerald)" : ""}">${PB.app.escape((sm.playersB || []).filter(Boolean).join(" / ") || nB)}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <div class="match-score-pill">${sm.scoreA} - ${sm.scoreB}</div>
                ${sm.status !== "finished"
                  ? `<button class="btn btn-sm btn-primary" onclick="PB.referee.openSubMatch(${idx})">Chấm</button>
                     <button class="btn btn-sm btn-secondary" onclick="PB.referee.forfeitSubPrompt(${idx})">WO 15-0</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="PB.referee.openSubMatch(${idx})">Xem</button>`}
              </div>
            </div>
          `).join("")}
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-danger" onclick="PB.referee.forfeitTeamPrompt()">Bỏ cuộc cả đội (4-0)</button>
        </div>
      </div>
    `;
  },

  _initLineupDraft(tie) {
    if (this.lineupDraft && this.lineupDraft.matchId === tie.id) return;
    const fmtSingles = (arr) => (arr || []).map((x) => `${x.name}(${x.gender === "M" ? "Nam" : "Nữ"})`).join(", ");
    this.lineupDraft = {
      matchId: tie.id,
      A: tie.subMatches.map((sm) => [sm.playersA?.[0] || "", sm.playersA?.[1] || ""]),
      B: tie.subMatches.map((sm) => [sm.playersB?.[0] || "", sm.playersB?.[1] || ""]),
      singlesA: fmtSingles(tie.singlesOrder?.A),
      singlesB: fmtSingles(tie.singlesOrder?.B)
    };
  },

  _getUsageCounts(side) {
    const counts = {};
    const pairs = this.lineupDraft?.[side] || [];
    pairs.forEach((pair) => {
      pair.forEach((name) => {
        if (name) counts[name] = (counts[name] || 0) + 1;
      });
    });
    return counts;
  },

  onLineupSelect(side, subIdx, slotIdx, value) {
    if (!this.lineupDraft) return;
    this.lineupDraft[side][subIdx][slotIdx] = value;
    this.renderConsole();
  },

  onSinglesInput(side, value) {
    if (!this.lineupDraft) return;
    if (side === "A") this.lineupDraft.singlesA = value;
    else this.lineupDraft.singlesB = value;
  },

  _renderTeamLineupForm(tie, el) {
    this._initLineupDraft(tie);
    const side = this.lineupStep; // 'A' hoặc 'B'
    const teamA = PB.state.getTeam(tie.teamA);
    const teamB = PB.state.getTeam(tie.teamB);
    const curTeam = side === "A" ? teamA : teamB;
    const nA = teamA ? teamA.name : "Đội A";
    const nB = teamB ? teamB.name : "Đội B";
    const curName = side === "A" ? nA : nB;
    const roster = (curTeam && curTeam.roster) ? curTeam.roster : [];
    const counts = this._getUsageCounts(side);
    const pairs = this.lineupDraft[side];

    // Render dropdown thông minh:
    // 1. Lọc đúng giới tính (Đôi nữ chỉ hiện Nữ, Đôi nam chỉ hiện Nam, Đôi nam nữ: ô 1 Nam, ô 2 Nữ)
    // 2. Ẩn VĐV đã chọn ở ô còn lại trong CÙNG trận đó
    // 3. Ẩn VĐV đã đủ 2/2 nội dung ở các trận khác
    const renderSmartSelect = (subIdx, slotIdx, reqGender) => {
      const curVal = pairs[subIdx][slotIdx] || "";
      const otherVal = pairs[subIdx][slotIdx === 0 ? 1 : 0] || "";
      const genderLabel = reqGender === "M" ? "Nam" : "Nữ";

      if (!roster.length) {
        return `<input type="text" class="input-sm" style="width:100%;" placeholder="Nhập VĐV (${genderLabel})" value="${PB.app.escape(curVal)}" onchange="PB.referee.onLineupSelect('${side}', ${subIdx}, ${slotIdx}, this.value.trim())" />`;
      }

      const available = roster.filter((p) => {
        if (reqGender && p.gender !== reqGender) return false;
        // Luôn giữ lại người đang được chọn ở chính ô này
        if (p.name === curVal) return true;
        // Ẩn nếu đã được chọn ở ô còn lại trong cùng nội dung/trận này
        if (p.name === otherVal) return false;
        // Ẩn nếu đã tham gia đủ 2 nội dung (tối đa 2 trận theo điều lệ)
        if ((counts[p.name] || 0) >= 2) return false;
        return true;
      });

      return `
        <select class="input-sm" style="width:100%;" onchange="PB.referee.onLineupSelect('${side}', ${subIdx}, ${slotIdx}, this.value)">
          <option value="">-- Chọn VĐV ${genderLabel} --</option>
          ${available.map((p) => {
            const c = counts[p.name] || 0;
            return `<option value="${PB.app.escape(p.name)}" ${curVal === p.name ? "selected" : ""}>${PB.app.escape(p.name)} (${c}/2 trận)</option>`;
          }).join("")}
        </select>
      `;
    };

    const quotaHtml = roster.length ? `
      <div class="roster-quota-bar">
        ${roster.map((p) => {
          const c = counts[p.name] || 0;
          const cls = c >= 2 ? "used-2" : c === 1 ? "used-1" : "";
          return `<span class="quota-chip ${cls}">${PB.app.escape(p.name)} (${p.gender === "M" ? "Nam" : "Nữ"}): ${c}/2</span>`;
        }).join("")}
      </div>
    ` : "";

    const singlesVal = side === "A" ? this.lineupDraft.singlesA : this.lineupDraft.singlesB;

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.exitMatch()">← Quay lại</button>
          <strong>Đăng ký đội hình Đồng đội</strong>
          <span class="badge badge-serieA">Tối đa 2 trận / VĐV</span>
        </div>

        <div class="lineup-stepper">
          <div class="step-pill ${side === "A" ? "active" : "done"}">1. Đội A: ${PB.app.escape(nA)}</div>
          <div class="step-pill ${side === "B" ? "active" : ""}">2. Đội B: ${PB.app.escape(nB)}</div>
        </div>

        <p class="muted" style="margin:0 0 10px;">
          Đang chọn đội hình cho <strong style="color:var(--primary);">${PB.app.escape(curName)}</strong>.
          Hệ thống tự lọc Nam/Nữ và tự ẩn VĐV đã chọn trong trận hoặc đã đủ 2/2 nội dung.
        </p>

        ${quotaHtml}

        ${tie.subMatches.map((sm, i) => `
          <div class="card" style="padding:12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="color:var(--primary);">${sm.label}</strong>
              <span class="muted" style="font-size:0.76rem;">Yêu cầu: ${sm.reqGender.map((g) => g === "M" ? "Nam" : "Nữ").join(" + ")}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${renderSmartSelect(i, 0, sm.reqGender[0])}
              ${renderSmartSelect(i, 1, sm.reqGender[1])}
            </div>
          </div>
        `).join("")}

        <div class="card" style="padding:12px;margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Thứ tự đánh Đơn của ${PB.app.escape(curName)} (nếu hòa 2-2 loại trực tiếp — Nam gặp Nam, Nữ gặp Nữ)</label>
            <input type="text" class="input" placeholder="VD: Dương(Nữ), Hùng(Nam), Hạnh(Nữ), Nam(Nam)" value="${PB.app.escape(singlesVal)}" oninput="PB.referee.onSinglesInput('${side}', this.value)" />
          </div>
        </div>

        <div id="lineupErrorBox" class="error-text hidden" style="margin-bottom:10px;"></div>

        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          ${side === "B"
            ? `<button class="btn btn-secondary" onclick="PB.referee.goLineupStep('A')">← Sửa lại Đội A</button>`
            : `<span></span>`}
          ${side === "A"
            ? `<button class="btn btn-primary" onclick="PB.referee.confirmSideA()">Xác nhận Đội A → Chọn Đội B</button>`
            : `<button class="btn btn-success" onclick="PB.referee.confirmSideBAndStart()">Xác nhận Đội B & Vào trận</button>`}
        </div>
      </div>
    `;
  },

  goLineupStep(step) {
    this.lineupStep = step;
    this.renderConsole();
  },

  confirmSideA() {
    const errBox = document.getElementById("lineupErrorBox");
    const counts = this._getUsageCounts("A");
    const over = Object.entries(counts).filter(([, c]) => c > 2);
    if (over.length) {
      errBox.textContent = "Đội A có VĐV vượt quá 2 nội dung: " + over.map(([n, c]) => `${n} (${c}/2)`).join(", ");
      errBox.classList.remove("hidden");
      return;
    }
    this.lineupStep = "B";
    PB.app.toast("Đã xác nhận Đội A — Mời chọn Đội B");
    this.renderConsole();
  },

  confirmSideBAndStart() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!tie || !this.lineupDraft) return;
    const errBox = document.getElementById("lineupErrorBox");
    const countsB = this._getUsageCounts("B");
    const overB = Object.entries(countsB).filter(([, c]) => c > 2);
    if (overB.length) {
      errBox.textContent = "Đội B có VĐV vượt quá 2 nội dung: " + overB.map(([n, c]) => `${n} (${c}/2)`).join(", ");
      errBox.classList.remove("hidden");
      return;
    }

    const parseOrder = (str) => (str || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const isF = /nữ|nu|\(f\)/i.test(s);
      return { name: s.replace(/\(.*?\)/g, "").trim(), gender: isF ? "F" : "M" };
    });

    tie.subMatches.forEach((sm, i) => {
      sm.playersA = [...this.lineupDraft.A[i]];
      sm.playersB = [...this.lineupDraft.B[i]];
    });
    tie.singlesOrder = {
      A: parseOrder(this.lineupDraft.singlesA),
      B: parseOrder(this.lineupDraft.singlesB)
    };
    tie.lineupLocked = true;
    if (tie.status === "pending") tie.status = "live";
    PB.state.save();
    PB.app.toast("Đã khóa đội hình 2 đội — Bắt đầu thi đấu!");
    this.renderConsole();
  },

  unlockLineup() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!tie) return;
    tie.lineupLocked = false;
    PB.state.save();
    this.renderConsole();
  },

  openSubMatch(idx) {
    this.activeSubIdx = idx;
    this.renderConsole();
  },

  backToTeamHub() {
    this.stopTimer();
    this.activeSubIdx = null;
    this.renderConsole();
  },

  _renderTeamSubMatchConsole(tie, subIdx, el) {
    this._setScoringLock(true);
    const sm = tie.subMatches[subIdx];
    const isKO = tie.stage !== "group";
    const srvScore = sm.server === "A" ? sm.scoreA : sm.scoreB;
    const rcvScore = sm.server === "A" ? sm.scoreB : sm.scoreA;
    const callout = `${srvScore} - ${rcvScore} - ${sm.serverNum}`;
    const leftSide = sm.swapped ? "B" : "A";
    const rightSide = sm.swapped ? "A" : "B";
    if (!sm.timeouts) sm.timeouts = { A: 2, B: 2 };

    const renderSide = (sideKey) => {
      const isA = sideKey === "A";
      const pairName = (isA ? sm.playersA : sm.playersB).filter(Boolean).join(" / ") || PB.state.getTeamName(isA ? tie.teamA : tie.teamB);
      const score = isA ? sm.scoreA : sm.scoreB;
      const isServing = sm.server === sideKey;
      const toLeft = sm.timeouts[sideKey] ?? 2;
      return `
        <div class="ref-side ${isA ? "side-a" : "side-b"} ${isServing ? "is-serving" : ""}">
          <div class="ref-side-name">${PB.app.escape(pairName)}</div>
          <div>${isServing ? `<span class="ref-serve-badge">GIAO BÓNG (Tay ${sm.serverNum})</span>` : `<span class="muted">Đỡ giao bóng</span>`}</div>
          <div class="ref-big-score">${score}</div>
          ${sm.status === "finished" ? `<div class="badge badge-done">Đã chốt</div>` : (
            isServing
              ? `<button class="ref-action-btn ${isA ? "btn-point-a" : "btn-point-b"}" onclick="PB.referee.teamSubPoint('${sideKey}')">+1 ĐIỂM</button>`
              : `<button class="ref-action-btn btn-sideout" onclick="PB.referee.teamSubSideOut()">ĐỔI GIAO / LỖI</button>`
          )}
          <div class="ref-side-subbtns">
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="PB.referee.teamSubTimeout('${sideKey}')" ${toLeft <= 0 || sm.status === "finished" ? "disabled" : ""}>Timeout (${toLeft})</button>
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="PB.referee.teamSubMedicalSub('${sideKey}')" ${sm.status === "finished" ? "disabled" : ""}>Thay Y tế</button>
          </div>
        </div>
      `;
    };

    const all4Done = tie.subMatches.every((s) => s.status === "finished");
    const canDB = isKO && all4Done && tie.scoreA === 2 && tie.scoreB === 2;

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.backToTeamHub()">← 4 trận</button>
          <button class="ref-sub-pill-btn" onclick="PB.referee.openSubPicker()">
            <span>${PB.app.escape(sm.label)}</span>
            <span style="font-size:0.7rem;opacity:0.8;">▾</span>
          </button>
          <span class="muted">${isKO ? "15đ (max 18)" : "Chạm 15đ"}</span>
        </div>

        <div class="callout-banner">
          <div class="callout-label">Đọc điểm (${sm.label}) • Đổi sân ở điểm 8</div>
          <div class="callout-score">${callout}</div>
        </div>

        ${sm.switchedAlerted && (sm.scoreA === 8 || sm.scoreB === 8) ? `<div class="switch-alert">CHẠM ĐIỂM 8 — YÊU CẦU HAI ĐỘI ĐỔI SÂN!</div>` : ""}



        <div class="ref-body-layout">
          <div class="ref-court-pane">
            ${this._renderCourtDiagram({
              leftSide, rightSide,
              leftName: (leftSide === "A" ? sm.playersA : sm.playersB).filter(Boolean).join(" / ") || PB.state.getTeamName(leftSide === "A" ? tie.teamA : tie.teamB),
              rightName: (rightSide === "A" ? sm.playersA : sm.playersB).filter(Boolean).join(" / ") || PB.state.getTeamName(rightSide === "A" ? tie.teamA : tie.teamB),
              leftPlayers: leftSide === "A" ? sm.playersA : sm.playersB,
              rightPlayers: rightSide === "A" ? sm.playersA : sm.playersB,
              serverSide: sm.server,
              scoreA: sm.scoreA, scoreB: sm.scoreB,
              serverNum: sm.serverNum
            })}
          </div>
          <div class="ref-controls-pane">
            <div class="ref-courts-split">
              ${renderSide(leftSide)}
              ${renderSide(rightSide)}
            </div>
            <div class="ref-tools-grid">
              <button class="btn btn-warning" onclick="PB.referee.teamSubSideOut()" ${sm.status === "finished" ? "disabled" : ""}>Lỗi giao bóng</button>
              <button class="btn btn-secondary" onclick="PB.referee.teamSubUndo()" ${!sm.history?.length ? "disabled" : ""}>Hoàn tác</button>
              <button class="btn btn-secondary" onclick="PB.referee.openTossModal()">Bốc thăm</button>
              <button class="btn btn-secondary" onclick="PB.referee.teamSubSwap()">Đảo bên sân</button>
              <button class="btn btn-secondary" onclick="PB.referee.startMedicalTimer()">Y tế (15p)</button>
              <button class="btn btn-success" onclick="PB.referee.teamSubFinishManual()" ${sm.status === "finished" ? "disabled" : ""}>Chốt trận</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  openSubPicker() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!tie || tie.matchType !== "team") return;
    const isKO = tie.stage !== "group";
    const all4Done = tie.subMatches.every((s) => s.status === "finished");
    const canDB = isKO && all4Done && tie.scoreA === 2 && tie.scoreB === 2;

    const listEl = document.getElementById("iosPickerList");
    document.getElementById("iosPickerTitle").textContent = "Chọn nội dung thi đấu";
    let html = tie.subMatches.map((item, i) => {
      const active = this.activeSubIdx === i;
      const st = item.status === "finished" ? `(${item.scoreA}-${item.scoreB})` : item.status === "live" ? "Đang đánh" : "";
      return `
        <button class="ios27-picker-item ${active ? "active" : ""}" onclick="PB.referee.switchTeamSub(${i})">
          <div>
            <div>${PB.app.escape(item.label)}</div>
            ${st ? `<div class="muted" style="font-size:0.74rem;">${st}</div>` : ""}
          </div>
          <span class="ios27-picker-check">${active ? "✓" : ""}</span>
        </button>
      `;
    }).join("");

    if (canDB) {
      const active = this.activeSubIdx === "db";
      html += `
        <button class="ios27-picker-item ${active ? "active" : ""}" onclick="PB.referee.switchTeamSub('db')">
          <div><div>Trận Đơn (Hòa 2-2)</div><div class="muted" style="font-size:0.74rem;">Ăn điểm trực tiếp</div></div>
          <span class="ios27-picker-check">${active ? "✓" : ""}</span>
        </button>
      `;
    }
    listEl.innerHTML = html;
    document.getElementById("iosPickerModal").classList.remove("hidden");
  },

  switchTeamSub(val) {
    PB.app.closeModal("iosPickerModal");
    this.stopTimer();
    this.activeSubIdx = (val === "db") ? "db" : Number(val);
    this.renderConsole();
  },

  teamSubTimeout(side) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const sm = tie?.subMatches?.[this.activeSubIdx];
    if (!sm) return;
    if (!sm.timeouts) sm.timeouts = { A: 2, B: 2 };
    if (sm.timeouts[side] <= 0) return;
    sm.timeouts[side] -= 1;
    sm.logs.unshift(`[${PB.rules.nowTime()}] Đội ${side} xin Timeout (60s)`);
    PB.state.save();
    this.startTimer(60, `Timeout — Đội ${side}`);
  },

  async teamSubMedicalSub(side) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const sm = tie?.subMatches?.[this.activeSubIdx];
    if (!sm) return;
    const key = side === "A" ? "playersA" : "playersB";
    const curPair = (sm[key] || []).filter(Boolean).join(" / ");
    const inp = await PB.ui.prompt(
      `Thay VĐV chấn thương (Y tế) cho ${sm.label} — Đội ${side}.\nNhập tên 2 VĐV mới cách nhau dấu "/" (VD: Hùng / Nam):`,
      curPair,
      "Thay VĐV (Y tế)"
    );
    if (!inp) return;
    const parts = inp.split("/").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return PB.ui.alert("Vui lòng nhập đủ tên 2 VĐV cách nhau dấu /.");
    sm[key] = [parts[0], parts[1]];
    sm.logs.unshift(`[${PB.rules.nowTime()}] Thay VĐV (Y tế) Đội ${side}: ${parts[0]} / ${parts[1]}`);
    PB.state.save();
    PB.app.toast(`Đã thay VĐV (Y tế) cho Đội ${side}`);
  },

  teamSubPoint(side) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const res = PB.rules.addTeamSubPoint(tie, this.activeSubIdx, side);
    PB.state.save();
    if (res.needSwitchAlert) PB.app.toast("Chạm điểm 8 — Đổi sân!");
    if (res.event === "sub_point_reached") {
      const sm = tie.subMatches[this.activeSubIdx];
      setTimeout(async () => {
        if (await PB.ui.confirm(`Chốt kết thúc ${sm.label} với tỷ số ${sm.scoreA} - ${sm.scoreB}?`, "Xác nhận kết thúc")) {
          PB.rules.confirmFinishTeamSub(tie, this.activeSubIdx);
          PB.state.save();
          this.backToTeamHub();
        }
      }, 80);
    }
  },

  teamSubSideOut() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    PB.rules.sideOutTeamSub(tie, this.activeSubIdx);
    PB.state.save();
  },

  teamSubUndo() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (PB.rules.undoTeamSub(tie, this.activeSubIdx)) PB.state.save();
  },

  teamSubSwap() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    tie.subMatches[this.activeSubIdx].swapped = !tie.subMatches[this.activeSubIdx].swapped;
    PB.state.save();
  },

  async teamSubFinishManual() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const sm = tie.subMatches[this.activeSubIdx];
    if (sm.scoreA === sm.scoreB) return PB.ui.alert("Tỷ số đang hòa, chưa thể chốt kết thúc.");
    if (!(await PB.ui.confirm(`Xác nhận chốt ${sm.label} (${sm.scoreA} - ${sm.scoreB})?`, "Chốt trận"))) return;
    PB.rules.confirmFinishTeamSub(tie, this.activeSubIdx);
    PB.state.save();
    this.backToTeamHub();
  },

  async forfeitSubPrompt(subIdx) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const nA = PB.state.getTeamName(tie.teamA);
    const nB = PB.state.getTeamName(tie.teamB);
    const c = await PB.ui.prompt(`Nhập "A" nếu [${nA}] thắng 15-0, nhập "B" nếu [${nB}] thắng 15-0:`, "", "Bỏ cuộc đôi (15-0)");
    if (!c) return;
    const w = c.trim().toUpperCase();
    if (w !== "A" && w !== "B") return PB.ui.alert("Chỉ nhập A hoặc B.");
    PB.rules.forfeitTeamSub(tie, subIdx, w);
    PB.state.save();
    PB.app.toast("Đã chốt bỏ cuộc đôi 15-0");
  },

  async forfeitTeamPrompt() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const nA = PB.state.getTeamName(tie.teamA);
    const nB = PB.state.getTeamName(tie.teamB);
    const c = await PB.ui.prompt(`Nhập "A" nếu [${nA}] thắng 4-0, nhập "B" nếu [${nB}] thắng 4-0:`, "", "Bỏ cuộc cả đội (4-0)");
    if (!c) return;
    const w = c.trim().toUpperCase();
    if (w !== "A" && w !== "B") return PB.ui.alert("Chỉ nhập A hoặc B.");
    PB.rules.forfeitEntireTeam(tie, w);
    PB.state.save();
    PB.app.toast("Đã chốt bỏ cuộc cả đội (4-0)");
    this.exitMatch();
  },

  // Bàn chấm Đơn Dreambreaker (Hòa 2-2 vòng loại trực tiếp)
  _renderDreambreakerConsole(tie, el) {
    this._setScoringLock(true);
    const db = tie.dreambreaker;
    const total = db.scoreA + db.scoreB;
    const rotIdx = Math.floor(total / 4);
    const ordA = tie.singlesOrder?.A || [];
    const ordB = tie.singlesOrder?.B || [];
    const pA = ordA.length ? ordA[rotIdx % ordA.length] : { name: PB.state.getTeamName(tie.teamA), gender: "" };
    const pB = ordB.length ? ordB[rotIdx % ordB.length] : { name: PB.state.getTeamName(tie.teamB), gender: "" };

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.backToTeamHub()">← Về 4 trận</button>
          <strong>TRẬN ĐƠN DREAMBREAKER (ĂN ĐIỂM TRỰC TIẾP)</strong>
          <span class="badge badge-live">Xoay tua mỗi 4đ</span>
        </div>

        <div class="callout-banner">
          <div class="callout-label">Lượt cặp số #${rotIdx + 1} (Điểm ${total % 4 + 1}/4 của cặp này) • 11đ đổi sân • Chạm 21đ</div>
          <div class="callout-score">${db.scoreA} - ${db.scoreB}</div>
        </div>

        ${db.switchedAlerted && (db.scoreA === 11 || db.scoreB === 11) ? `<div class="switch-alert">CHẠM ĐIỂM 11 — HAI ĐỘI ĐỔI SÂN!</div>` : ""}

        <div class="ref-courts-split">
          <div class="ref-side side-a">
            <div class="ref-side-name">${PB.app.escape(pA.name)} ${pA.gender ? `(${pA.gender === "M" ? "Nam" : "Nữ"})` : ""}</div>
            <div class="ref-big-score">${db.scoreA}</div>
            <button class="ref-action-btn btn-point-a" onclick="PB.referee.dbPoint('A')">+1 ĐIỂM (RALLY)</button>
          </div>
          <div class="ref-side side-b">
            <div class="ref-side-name">${PB.app.escape(pB.name)} ${pB.gender ? `(${pB.gender === "M" ? "Nam" : "Nữ"})` : ""}</div>
            <div class="ref-big-score">${db.scoreB}</div>
            <button class="ref-action-btn btn-point-b" onclick="PB.referee.dbPoint('B')">+1 ĐIỂM (RALLY)</button>
          </div>
        </div>

        <div class="ref-tools-grid">
          <button class="btn btn-secondary" onclick="PB.referee.dbUndo()" ${!db.history?.length ? "disabled" : ""}>Hoàn tác</button>
          <button class="btn btn-success" onclick="PB.referee.dbFinishManual()">Chốt trận Đơn</button>
        </div>
      </div>
    `;
  },

  dbPoint(side) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const res = PB.rules.addDreambreakerPoint(tie, side);
    PB.state.save();
    if (res.rotated) PB.app.toast("Đủ 4 điểm — Đổi cặp VĐV tiếp theo!");
    if (res.needSwitchAlert) PB.app.toast("Chạm điểm 11 — Đổi sân!");
    if (res.event === "db_point_reached") {
      const db = tie.dreambreaker;
      setTimeout(async () => {
        if (await PB.ui.confirm(`Chốt kết thúc Trận Đơn (${db.scoreA} - ${db.scoreB})?`, "Kết thúc Trận Đơn")) {
          PB.rules.confirmFinishDreambreaker(tie);
          PB.state.save();
          this.exitMatch();
        }
      }, 80);
    }
  },

  dbUndo() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (PB.rules.undoDreambreaker(tie)) PB.state.save();
  },

  async dbFinishManual() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const db = tie.dreambreaker;
    if (db.scoreA === db.scoreB) return PB.ui.alert("Tỷ số đang hòa!");
    if (!(await PB.ui.confirm(`Chốt Trận Đơn (${db.scoreA} - ${db.scoreB})?`, "Chốt Trận Đơn"))) return;
    PB.rules.confirmFinishDreambreaker(tie);
    PB.state.save();
    this.exitMatch();
  },

  // =========================================================
  // GIAO DIỆN TRỌNG TÀI: THỂ THỨC ĐÔI (DOUBLES)
  // =========================================================
  _renderDoublesConsole(m, el) {
    this._setScoringLock(true);
    const settings = PB.state.data.settings;
    const callout = PB.rules.getCallout(m, settings);
    const leftSide = m.swapped ? "B" : "A";
    const rightSide = m.swapped ? "A" : "B";

    const renderSide = (sideKey) => {
      const isA = sideKey === "A";
      const name = PB.state.getTeamName(isA ? m.teamA : m.teamB);
      const score = isA ? m.scoreA : m.scoreB;
      const sets = isA ? m.setsA : m.setsB;
      const isServing = m.server === sideKey;
      const canPoint = settings.scoringMode === "rally" || isServing;
      const toLeft = m.timeouts[sideKey];

      return `
        <div class="ref-side ${isA ? "side-a" : "side-b"} ${isServing ? "is-serving" : ""}">
          <div class="ref-side-name">${PB.app.escape(name)}</div>
          <div>
            ${isServing
              ? `<span class="ref-serve-badge">GIAO BÓNG ${settings.scoringMode === "sideout" ? "(Tay " + m.serverNum + ")" : ""}</span>`
              : `<span class="muted" style="font-size:0.78rem;">Đỡ giao bóng</span>`}
          </div>
          <div class="ref-big-score">${score}</div>
          <div class="muted" style="margin-bottom:8px;">Set: <strong>${sets}</strong> • TO: <strong>${toLeft}</strong></div>
          ${canPoint
            ? `<button class="ref-action-btn ${isA ? "btn-point-a" : "btn-point-b"}" onclick="PB.referee.point('${sideKey}')">+1 ĐIỂM</button>`
            : `<button class="ref-action-btn btn-sideout" onclick="PB.referee.sideOut()">ĐỔI GIAO / LỖI</button>`}
          <div class="ref-side-subbtns">
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="PB.referee.timeout('${sideKey}')" ${toLeft <= 0 ? "disabled" : ""}>TO (${toLeft})</button>
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="PB.referee.techFoul('${sideKey}')">Lỗi KT</button>
          </div>
        </div>
      `;
    };

    const target = Number(settings.targetPoints) || 11;
    const switchPt = Number(settings.switchPoint) || Math.ceil(target / 2);
    const showSwitchBanner = m.switchedAlerted && (m.scoreA === switchPt || m.scoreB === switchPt);

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.exitMatch()">← Danh sách trận</button>
          <div><strong>Sân ${m.court || "?"}</strong> • ${PB.app.escape(m.roundName)}</div>
          <button class="btn btn-sm btn-secondary" onclick="PB.viewer.openMatchLog('${m.id}')">Nhật ký</button>
        </div>
        <div class="callout-banner">
          <div class="callout-label">Đọc điểm (${settings.scoringMode === "sideout" ? "Side-out" : "Rally"} • BO${settings.bestOf})</div>
          <div class="callout-score">${callout}</div>
        </div>
        ${showSwitchBanner ? `<div class="switch-alert">CHẠM ĐIỂM ${switchPt} — YÊU CẦU HAI ĐỘI ĐỔI SÂN!</div>` : ""}

        <div class="ref-body-layout">
          <div class="ref-court-pane">
            ${this._renderCourtDiagram({
              leftSide, rightSide,
              leftName: PB.state.getTeamName(leftSide === "A" ? m.teamA : m.teamB),
              rightName: PB.state.getTeamName(rightSide === "A" ? m.teamA : m.teamB),
              leftPlayers: null, rightPlayers: null,
              serverSide: m.server,
              scoreA: m.scoreA, scoreB: m.scoreB,
              serverNum: settings.scoringMode === "sideout" ? m.serverNum : 0
            })}
          </div>
          <div class="ref-controls-pane">
            <div class="ref-courts-split">
              ${renderSide(leftSide)}
              ${renderSide(rightSide)}
            </div>
            <div class="ref-tools-grid">
          <button class="btn btn-warning" onclick="PB.referee.sideOut()">Lỗi giao bóng</button>
          <button class="btn btn-secondary" onclick="PB.referee.undo()" ${!m.history?.length ? "disabled" : ""}>Hoàn tác</button>
          <button class="btn btn-secondary" onclick="PB.referee.openTossModal()">Bốc thăm</button>
          <button class="btn btn-secondary" onclick="PB.referee.swapSides()">Đảo bên sân</button>
          <button class="btn btn-secondary" onclick="PB.referee.startMedicalTimer()">Y tế (15p)</button>
          <button class="btn btn-secondary" onclick="PB.referee.walkoverPrompt()">Bỏ cuộc (WO)</button>
          <button class="btn btn-success" onclick="PB.referee.finishManual()">Chốt kết thúc</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  point(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const res = PB.rules.addPoint(m, side, PB.state.data.settings);
    PB.state.save();
    if (res.needSwitchAlert) PB.app.toast("Đã chạm điểm đổi sân!");
    if (res.event === "set_point_reached") {
      const wName = PB.state.getTeamName(res.winnerSide === "A" ? m.teamA : m.teamB);
      setTimeout(async () => {
        if (await PB.ui.confirm(`${wName} đủ điểm thắng Set (${m.scoreA} - ${m.scoreB}). Xác nhận chốt?`, "Kết thúc Set")) {
          const outcome = PB.rules.confirmFinishSetOrMatch(m, PB.state.data.settings);
          PB.state.save();
          if (outcome === "match_finished") { PB.app.toast(`Chiến thắng: ${wName}`); this.exitMatch(); }
        }
      }, 100);
    }
  },
  sideOut() { const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId); if (m) { PB.rules.sideOut(m, PB.state.data.settings); PB.state.save(); } },
  undo() { const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId); if (m && PB.rules.undo(m)) PB.state.save(); },
  swapSides() { const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId); if (m) { m.swapped = !m.swapped; PB.state.save(); } },
  timeout(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (m && PB.rules.useTimeout(m, side)) { PB.state.save(); this.startTimer(60, `Hội ý Đội ${side}`); }
  },
  startMedicalTimer() { this.startTimer(15 * 60, "Medical Timeout (15p)"); },
  _updateTimerModalDom() {
    const clockEl = document.getElementById("iosTimerClock");
    const progEl = document.getElementById("iosTimerProgress");
    if (clockEl) clockEl.textContent = this._fmtSec(this.timerSeconds);
    if (progEl && this.timerTotal > 0) {
      const circ = 376.99;
      const ratio = Math.max(0, Math.min(1, this.timerSeconds / this.timerTotal));
      progEl.setAttribute("stroke-dashoffset", String(circ * (1 - ratio)));
    }
  },
  startTimer(sec, label) {
    this.stopTimer(true);
    this.timerSeconds = sec;
    this.timerTotal = sec;
    this.timerLabel = label;
    const isMed = sec > 120;
    const badgeEl = document.getElementById("iosTimerBadge");
    const titleEl = document.getElementById("iosTimerTitle");
    const subEl = document.getElementById("iosTimerSub");
    if (badgeEl) {
      badgeEl.textContent = isMed ? "MEDICAL TIMEOUT (15 PHÚT)" : "TIMEOUT (60 GIÂY)";
      badgeEl.style.background = isMed ? "var(--danger-soft)" : "var(--primary-soft)";
      badgeEl.style.color = isMed ? "var(--danger)" : "var(--primary)";
    }
    if (titleEl) titleEl.textContent = label;
    if (subEl) subEl.textContent = isMed ? "Thời gian chăm sóc y tế cho VĐV" : "Hết giờ hệ thống sẽ tự báo tiếp tục thi đấu";
    this._updateTimerModalDom();
    document.getElementById("iosTimerModal")?.classList.remove("hidden");

    this.timerInterval = setInterval(() => {
      this.timerSeconds -= 1;
      if (this.timerSeconds <= 0) {
        this.stopTimer(true);
        PB.ui.alert(`Đã hết thời gian ${label}. Mời hai đội trở lại sân thi đấu.`, "Hết giờ nghỉ");
      } else {
        this._updateTimerModalDom();
      }
    }, 1000);
  },
  stopTimer(silent = false) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerSeconds = 0;
    this.timerLabel = "";
    document.getElementById("iosTimerModal")?.classList.add("hidden");
    if (!silent && this.activeMatchId) PB.app.toast("Đã kết thúc thời gian nghỉ");
  },
  async techFoul(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m || !(await PB.ui.confirm("Phạt Lỗi Kỹ Thuật (+1 điểm trực tiếp cho đối thủ)?", "Lỗi Kỹ Thuật", true))) return;
    PB.rules.addTechnicalFoul(m, side, PB.state.data.settings); PB.state.save();
  },
  async walkoverPrompt() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const c = await PB.ui.prompt(`Nhập "A" nếu [${PB.state.getTeamName(m.teamA)}] thắng WO, hoặc "B" nếu [${PB.state.getTeamName(m.teamB)}] thắng WO:`, "", "Bỏ cuộc (Walkover)");
    if (!c) return;
    const w = c.trim().toUpperCase();
    if (w !== "A" && w !== "B") return;
    PB.rules.finishByDefault(m, w, "Walkover"); PB.state.save(); this.exitMatch();
  },
  async finishManual() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m || m.scoreA === m.scoreB) return PB.ui.alert("Tỷ số đang hòa, chưa thể chốt.");
    if (!(await PB.ui.confirm(`Xác nhận chốt kết quả (${m.scoreA} - ${m.scoreB})?`, "Chốt kết thúc"))) return;
    const out = PB.rules.confirmFinishSetOrMatch(m, PB.state.data.settings); PB.state.save();
    if (out === "match_finished") this.exitMatch();
  },
  _fmtSec(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
};
