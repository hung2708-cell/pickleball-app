/* =========================================================
   js/referee.js
   - Giao diện Trọng tài tối giản, nút bấm lớn cho điện thoại
   - Lọc khóa theo sân tránh bấm nhầm
   - Đầy đủ: Side-out / Rally, Đổi sân, Timeout 60s / Medical 15p,
     Lỗi kỹ thuật, Bỏ cuộc (WO), Hoàn tác (Undo), Nhật ký pha bóng.
   ========================================================= */
window.PB = window.PB || {};

PB.referee = {
  activeMatchId: null,
  timerInterval: null,
  timerSeconds: 0,
  timerLabel: "",

  render() {
    const allowed = PB.auth.isReferee();
    document.getElementById("refereeLockedView").classList.toggle("hidden", allowed);
    document.getElementById("refereeContent").classList.toggle("hidden", !allowed);
    if (!allowed) return;

    this._populateCourtFilter();
    if (this.activeMatchId) {
      this.renderConsole();
    } else {
      this.renderList();
    }
  },

  _populateCourtFilter() {
    const sel = document.getElementById("refCourtFilter");
    if (!sel) return;
    const prev = sel.value || "all";
    const num = Number(PB.state.data.settings.numCourts) || 4;
    let opts = `<option value="all">Tất cả các sân</option>`;
    for (let i = 1; i <= num; i++) {
      opts += `<option value="${i}">Chỉ Sân ${i}</option>`;
    }
    sel.innerHTML = opts;
    sel.value = prev;
  },

  renderList() {
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
            <strong>${PB.app.escape(m.roundName)}</strong>
            <span>• ${m.court ? "Sân " + m.court : "Chưa xếp sân"}</span>
          </div>
          <div class="match-teams">
            ${PB.app.escape(PB.state.getTeamName(m.teamA))} <span class="muted">vs</span> ${PB.app.escape(PB.state.getTeamName(m.teamB))}
          </div>
        </div>
        <button class="btn btn-primary" onclick="PB.referee.openMatch('${m.id}')">
          ${m.status === "live" ? "Tiếp tục chấm" : "Bắt đầu chấm"}
        </button>
      </div>
    `).join("");
  },

  openMatch(matchId) {
    this.activeMatchId = matchId;
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (m && m.status === "pending") {
      PB.rules.startMatch(m);
      PB.state.save();
    }
    this.renderConsole();
  },

  exitMatch() {
    this.stopTimer();
    this.activeMatchId = null;
    this.renderList();
  },

  renderConsole() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) { this.exitMatch(); return; }

    document.getElementById("refMatchListView").classList.add("hidden");
    const el = document.getElementById("refConsoleView");
    el.classList.remove("hidden");

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
              ? `<span class="ref-serve-badge">🏓 GIAO BÓNG ${settings.scoringMode === "sideout" && settings.category === "doubles" ? "(Lượt " + m.serverNum + ")" : ""}</span>`
              : `<span class="muted" style="font-size:0.78rem;">Đỡ giao bóng</span>`}
          </div>
          <div class="ref-big-score">${score}</div>
          <div class="muted" style="margin-bottom:8px;">Set thắng: <strong>${sets}</strong> • Timeout: <strong>${toLeft}</strong></div>

          ${canPoint
            ? `<button class="ref-action-btn ${isA ? "btn-point-a" : "btn-point-b"}" onclick="PB.referee.point('${sideKey}')">+1 ĐIỂM</button>`
            : `<button class="ref-action-btn btn-sideout" onclick="PB.referee.sideOut()">ĐỔI GIAO / LỖI</button>`}

          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="PB.referee.timeout('${sideKey}')" ${toLeft <= 0 ? "disabled" : ""}>⏱ TO (${toLeft})</button>
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="PB.referee.techFoul('${sideKey}')">🟨 Lỗi KT</button>
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
          <button class="btn btn-sm btn-secondary" onclick="PB.viewer.openMatchLog('${m.id}')">📋 Nhật ký</button>
        </div>

        <div class="callout-banner">
          <div class="callout-label">Trọng tài đọc điểm (${settings.scoringMode === "sideout" ? "Side-out" : "Rally"} • BO${settings.bestOf})</div>
          <div class="callout-score">${callout}</div>
        </div>

        ${showSwitchBanner ? `<div class="switch-alert">🔄 CHẠM ĐIỂM ${switchPt} — YÊU CẦU HAI ĐỘI ĐỔI SÂN!</div>` : ""}

        ${this.timerSeconds > 0 ? `
          <div class="timeout-banner">
            <span>⏱ ${PB.app.escape(this.timerLabel)}: <strong>${this._fmtSec(this.timerSeconds)}</strong></span>
            <button class="btn btn-sm btn-danger" onclick="PB.referee.stopTimer()">Dừng đồng hồ</button>
          </div>
        ` : ""}

        <div class="ref-courts-split">
          ${renderSide(leftSide)}
          ${renderSide(rightSide)}
        </div>

        <div class="ref-tools-grid">
          <button class="btn btn-warning" onclick="PB.referee.sideOut()">🔄 Lỗi giao bóng</button>
          <button class="btn btn-secondary" onclick="PB.referee.undo()" ${!m.history?.length ? "disabled" : ""}>↩ Hoàn tác</button>
          <button class="btn btn-secondary" onclick="PB.referee.swapSides()">⇄ Đảo bên sân</button>
          <button class="btn btn-secondary" onclick="PB.referee.startMedicalTimer()">🚑 Y tế (15p)</button>
          <button class="btn btn-secondary" onclick="PB.referee.walkoverPrompt()">🏳 Bỏ cuộc (WO)</button>
          <button class="btn btn-success" onclick="PB.referee.finishManual()">🏁 Chốt kết thúc</button>
        </div>
      </div>
    `;
  },

  point(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const res = PB.rules.addPoint(m, side, PB.state.data.settings);
    PB.state.save();

    if (res.needSwitchAlert) {
      PB.app.toast("🔄 Đã chạm điểm đổi sân theo điều lệ!");
    }
    if (res.event === "set_point_reached") {
      const wName = PB.state.getTeamName(res.winnerSide === "A" ? m.teamA : m.teamB);
      setTimeout(() => {
        if (confirm(`🏆 ${wName} đã đủ điểm thắng Set (${m.scoreA} - ${m.scoreB})!\nXác nhận chốt Set / Kết thúc trận?`)) {
          const outcome = PB.rules.confirmFinishSetOrMatch(m, PB.state.data.settings);
          PB.state.save();
          if (outcome === "match_finished") {
            PB.app.toast(`🏁 Trận đấu kết thúc! Chiến thắng: ${wName}`);
            this.exitMatch();
          } else {
            PB.app.toast("▶ Bắt đầu Set tiếp theo!");
          }
        }
      }, 100);
    }
  },

  sideOut() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    PB.rules.sideOut(m, PB.state.data.settings);
    PB.state.save();
  },

  undo() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    if (PB.rules.undo(m)) {
      PB.state.save();
      PB.app.toast("↩ Đã hoàn tác pha bóng trước");
    }
  },

  swapSides() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    m.swapped = !m.swapped;
    PB.state.save();
  },

  timeout(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    if (PB.rules.useTimeout(m, side)) {
      PB.state.save();
      const name = PB.state.getTeamName(side === "A" ? m.teamA : m.teamB);
      this.startTimer(60, `Hội ý - ${name}`);
    }
  },

  startMedicalTimer() {
    this.startTimer(15 * 60, "Medical Timeout (Y tế)");
  },

  startTimer(sec, label) {
    this.stopTimer();
    this.timerSeconds = sec;
    this.timerLabel = label;
    this.renderConsole();
    this.timerInterval = setInterval(() => {
      this.timerSeconds -= 1;
      if (this.timerSeconds <= 0) {
        this.stopTimer();
        PB.app.toast(`⏰ Hết giờ ${label}!`);
      } else {
        this.renderConsole();
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerSeconds = 0;
    this.timerLabel = "";
    if (this.activeMatchId) this.renderConsole();
  },

  techFoul(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const name = PB.state.getTeamName(side === "A" ? m.teamA : m.teamB);
    if (!confirm(`Xác nhận phạt Lỗi Kỹ Thuật (Technical Foul) đối với "${name}"?\n(Đối thủ sẽ được cộng +1 điểm theo luật)`)) return;
    PB.rules.addTechnicalFoul(m, side, PB.state.data.settings);
    PB.state.save();
    PB.app.toast(`🟨 Đã ghi nhận lỗi kỹ thuật cho ${name}`);
  },

  walkoverPrompt() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const nA = PB.state.getTeamName(m.teamA);
    const nB = PB.state.getTeamName(m.teamB);
    const choice = prompt(`Nhập "A" nếu [${nA}] thắng bỏ cuộc, hoặc nhập "B" nếu [${nB}] thắng bỏ cuộc:`);
    if (!choice) return;
    const c = choice.trim().toUpperCase();
    if (c !== "A" && c !== "B") return alert("Chỉ nhập A hoặc B.");
    PB.rules.finishByDefault(m, c, "Walkover/Bỏ cuộc");
    PB.state.save();
    PB.app.toast("🏳 Đã chốt kết quả bỏ cuộc (WO)");
    this.exitMatch();
  },

  finishManual() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    if (m.scoreA === m.scoreB) return alert("Tỷ số đang hòa, chưa thể chốt kết thúc!");
    if (!confirm(`Xác nhận chốt kết quả hiện tại (${m.scoreA} - ${m.scoreB})?`)) return;
    const outcome = PB.rules.confirmFinishSetOrMatch(m, PB.state.data.settings);
    PB.state.save();
    if (outcome === "match_finished") {
      PB.app.toast("🏁 Đã kết thúc trận đấu!");
      this.exitMatch();
    }
  },

  _fmtSec(s) {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }
};
