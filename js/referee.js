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
  activeSubIdx: null, // null = màn hình tổng quan 4 trận | 0..3 = chấm trận con | 'db' = chấm đơn Dreambreaker
  timerInterval: null,
  timerSeconds: 0,
  timerLabel: "",

  render() {
    const allowed = PB.auth.isReferee();
    document.getElementById("refereeLockedView").classList.toggle("hidden", allowed);
    document.getElementById("refereeContent").classList.toggle("hidden", !allowed);
    if (!allowed) return;

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

  openMatch(matchId) {
    this.activeMatchId = matchId;
    this.activeSubIdx = null;
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (m && m.matchType !== "team" && m.status === "pending") {
      PB.rules.startMatch(m);
      PB.state.save();
    }
    this.renderConsole();
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
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.unlockLineup()">✏️ Sửa đội hình</button>
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
            ⚡ HÒA 2-2! MỞ TRẬN ĐƠN ĂN ĐIỂM TRỰC TIẾP (DREAMBREAKER)
            <div style="margin-top:8px;">
              <button class="btn btn-danger" onclick="PB.referee.openSubMatch('db')">🔥 Bắt đầu chấm Trận Đơn</button>
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
          <button class="btn btn-sm btn-danger" onclick="PB.referee.forfeitTeamPrompt()">🏳 Bỏ cuộc cả đội (4-0)</button>
        </div>
      </div>
    `;
  },

  _renderTeamLineupForm(tie, el) {
    const teamA = PB.state.getTeam(tie.teamA);
    const teamB = PB.state.getTeam(tie.teamB);
    const nA = teamA ? teamA.name : "Đội A";
    const nB = teamB ? teamB.name : "Đội B";

    const renderSelect = (teamObj, gender, curVal, idAttr) => {
      const roster = (teamObj && teamObj.roster) ? teamObj.roster : [];
      const filtered = roster.filter((p) => !gender || p.gender === gender);
      if (filtered.length) {
        return `
          <select id="${idAttr}" class="input-sm" style="width:100%;">
            <option value="">-- Chọn VĐV (${gender === "M" ? "Nam" : "Nữ"}) --</option>
            ${filtered.map((p) => `<option value="${PB.app.escape(p.name)}" ${curVal === p.name ? "selected" : ""}>${PB.app.escape(p.name)}</option>`).join("")}
          </select>
        `;
      }
      return `<input type="text" id="${idAttr}" class="input-sm" style="width:100%;" placeholder="Tên VĐV (${gender === "M" ? "Nam" : "Nữ"})" value="${PB.app.escape(curVal || "")}" />`;
    };

    const singlesA = (tie.singlesOrder?.A || []).map((x) => `${x.name}(${x.gender === "M" ? "Nam" : "Nữ"})`).join(", ");
    const singlesB = (tie.singlesOrder?.B || []).map((x) => `${x.name}(${x.gender === "M" ? "Nam" : "Nữ"})`).join(", ");

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.exitMatch()">← Quay lại</button>
          <strong>Đăng ký đội hình 4 trận đôi & Thứ tự Đơn</strong>
          <span class="badge badge-serieA">Tối đa 2 trận / VĐV</span>
        </div>

        <p class="muted" style="margin-top:0;">Trước khi thi đấu, hai đội phải đăng ký đội hình cả 4 trận đôi. Hệ thống tự động kiểm tra quy định <strong>mỗi VĐV không quá 02 trận đôi</strong>.</p>

        ${tie.subMatches.map((sm, i) => `
          <div class="card" style="padding:12px;margin-bottom:10px;">
            <strong style="color:var(--primary);">${sm.label}</strong>
            <div class="form-grid mt-12">
              <div>
                <div class="muted" style="margin-bottom:4px;"><strong>${PB.app.escape(nA)}</strong></div>
                <div style="display:flex;gap:6px;">
                  ${renderSelect(teamA, sm.reqGender[0], sm.playersA[0], `lu_A_${i}_0`)}
                  ${renderSelect(teamA, sm.reqGender[1], sm.playersA[1], `lu_A_${i}_1`)}
                </div>
              </div>
              <div>
                <div class="muted" style="margin-bottom:4px;"><strong>${PB.app.escape(nB)}</strong></div>
                <div style="display:flex;gap:6px;">
                  ${renderSelect(teamB, sm.reqGender[0], sm.playersB[0], `lu_B_${i}_0`)}
                  ${renderSelect(teamB, sm.reqGender[1], sm.playersB[1], `lu_B_${i}_1`)}
                </div>
              </div>
            </div>
          </div>
        `).join("")}

        <div class="card" style="padding:12px;">
          <strong>Thứ tự thi đấu Đơn (nếu hòa 2-2 vòng loại trực tiếp — Nam gặp Nam, Nữ gặp Nữ)</strong>
          <div class="form-grid mt-12">
            <div class="form-group">
              <label>Thứ tự Đơn — ${PB.app.escape(nA)} (cách nhau dấu phẩy)</label>
              <input type="text" id="singlesOrderA" class="input" placeholder="VD: Dương(Nữ), Hùng(Nam), Hạnh(Nữ), Nam(Nam)" value="${PB.app.escape(singlesA)}" />
            </div>
            <div class="form-group">
              <label>Thứ tự Đơn — ${PB.app.escape(nB)} (cách nhau dấu phẩy)</label>
              <input type="text" id="singlesOrderB" class="input" placeholder="VD: Thư(Nữ), Minh(Nam), Mai(Nữ), Tuấn(Nam)" value="${PB.app.escape(singlesB)}" />
            </div>
          </div>
        </div>

        <div id="lineupErrorBox" class="error-text hidden" style="margin-bottom:10px;"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-primary" onclick="PB.referee.saveTeamLineup()">✅ Khóa đội hình & Vào trận</button>
        </div>
      </div>
    `;
  },

  saveTeamLineup() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!tie) return;

    const draftSubs = tie.subMatches.map((sm, i) => ({
      ...sm,
      playersA: [
        (document.getElementById(`lu_A_${i}_0`)?.value || "").trim(),
        (document.getElementById(`lu_A_${i}_1`)?.value || "").trim()
      ],
      playersB: [
        (document.getElementById(`lu_B_${i}_0`)?.value || "").trim(),
        (document.getElementById(`lu_B_${i}_1`)?.value || "").trim()
      ]
    }));

    const valA = PB.rules.validateTeamLineup(draftSubs, "A");
    const valB = PB.rules.validateTeamLineup(draftSubs, "B");
    const errBox = document.getElementById("lineupErrorBox");

    if (!valA.ok || !valB.ok) {
      const msgs = [];
      if (!valA.ok) msgs.push(`${PB.state.getTeamName(tie.teamA)} vi phạm tối đa 2 trận: ${valA.violations.map(([n, c]) => `${n} (${c} trận)`).join(", ")}`);
      if (!valB.ok) msgs.push(`${PB.state.getTeamName(tie.teamB)} vi phạm tối đa 2 trận: ${valB.violations.map(([n, c]) => `${n} (${c} trận)`).join(", ")}`);
      errBox.textContent = "⚠️ " + msgs.join(" | ");
      errBox.classList.remove("hidden");
      return;
    }

    const parseOrder = (str) => str.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const isF = /nữ|nu|\(f\)/i.test(s);
      return { name: s.replace(/\(.*?\)/g, "").trim(), gender: isF ? "F" : "M" };
    });

    tie.subMatches = draftSubs;
    tie.singlesOrder = {
      A: parseOrder(document.getElementById("singlesOrderA")?.value || ""),
      B: parseOrder(document.getElementById("singlesOrderB")?.value || "")
    };
    tie.lineupLocked = true;
    if (tie.status === "pending") tie.status = "live";
    PB.state.save();
    PB.app.toast("✅ Đã khóa đội hình hợp lệ!");
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
    const sm = tie.subMatches[subIdx];
    const isKO = tie.stage !== "group";
    const srvScore = sm.server === "A" ? sm.scoreA : sm.scoreB;
    const rcvScore = sm.server === "A" ? sm.scoreB : sm.scoreA;
    const callout = `${srvScore} - ${rcvScore} - ${sm.serverNum}`;
    const leftSide = sm.swapped ? "B" : "A";
    const rightSide = sm.swapped ? "A" : "B";

    const renderSide = (sideKey) => {
      const isA = sideKey === "A";
      const pairName = (isA ? sm.playersA : sm.playersB).filter(Boolean).join(" / ") || PB.state.getTeamName(isA ? tie.teamA : tie.teamB);
      const score = isA ? sm.scoreA : sm.scoreB;
      const isServing = sm.server === sideKey;
      return `
        <div class="ref-side ${isA ? "side-a" : "side-b"} ${isServing ? "is-serving" : ""}">
          <div class="ref-side-name">${PB.app.escape(pairName)}</div>
          <div>${isServing ? `<span class="ref-serve-badge">GIAO BÓNG (Lượt ${sm.serverNum})</span>` : `<span class="muted">Đỡ giao bóng</span>`}</div>
          <div class="ref-big-score">${score}</div>
          ${sm.status === "finished" ? `<div class="badge badge-done">Đã chốt</div>` : (
            isServing
              ? `<button class="ref-action-btn ${isA ? "btn-point-a" : "btn-point-b"}" onclick="PB.referee.teamSubPoint('${sideKey}')">+1 ĐIỂM</button>`
              : `<button class="ref-action-btn btn-sideout" onclick="PB.referee.teamSubSideOut()">ĐỔI GIAO / LỖI</button>`
          )}
        </div>
      `;
    };

    el.innerHTML = `
      <div class="ref-console">
        <div class="ref-topbar">
          <button class="btn btn-sm btn-secondary" onclick="PB.referee.backToTeamHub()">← Về 4 trận</button>
          <strong>${sm.label}</strong>
          <span class="muted">${isKO ? "15đ (14-14 cách 2, max 18)" : "Chạm 15đ"}</span>
        </div>

        <div class="callout-banner">
          <div class="callout-label">Đọc điểm (${sm.label}) • Đổi sân ở điểm 8</div>
          <div class="callout-score">${callout}</div>
        </div>

        ${sm.switchedAlerted && (sm.scoreA === 8 || sm.scoreB === 8) ? `<div class="switch-alert">🔄 CHẠM ĐIỂM 8 — YÊU CẦU HAI ĐỘI ĐỔI SÂN!</div>` : ""}

        <div class="ref-courts-split">
          ${renderSide(leftSide)}
          ${renderSide(rightSide)}
        </div>

        <div class="ref-tools-grid">
          <button class="btn btn-warning" onclick="PB.referee.teamSubSideOut()" ${sm.status === "finished" ? "disabled" : ""}>🔄 Lỗi giao bóng</button>
          <button class="btn btn-secondary" onclick="PB.referee.teamSubUndo()" ${!sm.history?.length ? "disabled" : ""}>↩ Hoàn tác</button>
          <button class="btn btn-secondary" onclick="PB.referee.teamSubSwap()">⇄ Đảo bên sân</button>
          <button class="btn btn-success" onclick="PB.referee.teamSubFinishManual()" ${sm.status === "finished" ? "disabled" : ""}>🏁 Chốt trận</button>
        </div>
      </div>
    `;
  },

  teamSubPoint(side) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const res = PB.rules.addTeamSubPoint(tie, this.activeSubIdx, side);
    PB.state.save();
    if (res.needSwitchAlert) PB.app.toast("🔄 Chạm điểm 8 — Đổi sân!");
    if (res.event === "sub_point_reached") {
      const sm = tie.subMatches[this.activeSubIdx];
      setTimeout(() => {
        if (confirm(`🏆 Chốt kết thúc ${sm.label} với tỷ số ${sm.scoreA} - ${sm.scoreB}?`)) {
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

  teamSubFinishManual() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const sm = tie.subMatches[this.activeSubIdx];
    if (sm.scoreA === sm.scoreB) return alert("Tỷ số đang hòa!");
    if (!confirm(`Chốt ${sm.label} (${sm.scoreA} - ${sm.scoreB})?`)) return;
    PB.rules.confirmFinishTeamSub(tie, this.activeSubIdx);
    PB.state.save();
    this.backToTeamHub();
  },

  forfeitSubPrompt(subIdx) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const nA = PB.state.getTeamName(tie.teamA);
    const nB = PB.state.getTeamName(tie.teamB);
    const c = prompt(`Bỏ cuộc đôi (tính 15-0).\nNhập "A" nếu [${nA}] thắng 15-0, nhập "B" nếu [${nB}] thắng 15-0:`);
    if (!c) return;
    const w = c.trim().toUpperCase();
    if (w !== "A" && w !== "B") return alert("Chỉ nhập A hoặc B.");
    PB.rules.forfeitTeamSub(tie, subIdx, w);
    PB.state.save();
    PB.app.toast("🏳 Đã chốt bỏ cuộc đôi 15-0");
  },

  forfeitTeamPrompt() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const nA = PB.state.getTeamName(tie.teamA);
    const nB = PB.state.getTeamName(tie.teamB);
    const c = prompt(`Bỏ cuộc CẢ ĐỘI (tính 4-0, đội bỏ cuộc 0 điểm BXH).\nNhập "A" nếu [${nA}] thắng 4-0, nhập "B" nếu [${nB}] thắng 4-0:`);
    if (!c) return;
    const w = c.trim().toUpperCase();
    if (w !== "A" && w !== "B") return alert("Chỉ nhập A hoặc B.");
    PB.rules.forfeitEntireTeam(tie, w);
    PB.state.save();
    PB.app.toast("🏳 Đã chốt bỏ cuộc cả đội (4-0)");
    this.exitMatch();
  },

  // Bàn chấm Đơn Dreambreaker (Hòa 2-2 vòng loại trực tiếp)
  _renderDreambreakerConsole(tie, el) {
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
          <strong>🔥 TRẬN ĐƠN DREAMBREAKER (ĂN ĐIỂM TRỰC TIẾP)</strong>
          <span class="badge badge-live">Xoay tua mỗi 4đ</span>
        </div>

        <div class="callout-banner">
          <div class="callout-label">Lượt cặp số #${rotIdx + 1} (Điểm ${total % 4 + 1}/4 của cặp này) • 11đ đổi sân • Chạm 21đ</div>
          <div class="callout-score">${db.scoreA} - ${db.scoreB}</div>
        </div>

        ${db.switchedAlerted && (db.scoreA === 11 || db.scoreB === 11) ? `<div class="switch-alert">🔄 CHẠM ĐIỂM 11 — HAI ĐỘI ĐỔI SÂN!</div>` : ""}

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
          <button class="btn btn-secondary" onclick="PB.referee.dbUndo()" ${!db.history?.length ? "disabled" : ""}>↩ Hoàn tác</button>
          <button class="btn btn-success" onclick="PB.referee.dbFinishManual()">🏁 Chốt trận Đơn</button>
        </div>
      </div>
    `;
  },

  dbPoint(side) {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const res = PB.rules.addDreambreakerPoint(tie, side);
    PB.state.save();
    if (res.rotated) PB.app.toast("🔁 Đủ 4 điểm — Đổi cặp VĐV tiếp theo!");
    if (res.needSwitchAlert) PB.app.toast("🔄 Chạm điểm 11 — Đổi sân!");
    if (res.event === "db_point_reached") {
      const db = tie.dreambreaker;
      setTimeout(() => {
        if (confirm(`🏆 Chốt kết thúc Trận Đơn (${db.scoreA} - ${db.scoreB})?`)) {
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

  dbFinishManual() {
    const tie = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    const db = tie.dreambreaker;
    if (db.scoreA === db.scoreB) return alert("Tỷ số đang hòa!");
    if (!confirm(`Chốt Trận Đơn (${db.scoreA} - ${db.scoreB})?`)) return;
    PB.rules.confirmFinishDreambreaker(tie);
    PB.state.save();
    this.exitMatch();
  },

  // =========================================================
  // GIAO DIỆN TRỌNG TÀI: THỂ THỨC ĐÔI (DOUBLES)
  // =========================================================
  _renderDoublesConsole(m, el) {
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
              ? `<span class="ref-serve-badge">GIAO BÓNG ${settings.scoringMode === "sideout" ? "(Lượt " + m.serverNum + ")" : ""}</span>`
              : `<span class="muted" style="font-size:0.78rem;">Đỡ giao bóng</span>`}
          </div>
          <div class="ref-big-score">${score}</div>
          <div class="muted" style="margin-bottom:8px;">Set: <strong>${sets}</strong> • TO: <strong>${toLeft}</strong></div>
          ${canPoint
            ? `<button class="ref-action-btn ${isA ? "btn-point-a" : "btn-point-b"}" onclick="PB.referee.point('${sideKey}')">+1 ĐIỂM</button>`
            : `<button class="ref-action-btn btn-sideout" onclick="PB.referee.sideOut()">ĐỔI GIAO / LỖI</button>`}
          <div style="display:flex;gap:6px;margin-top:8px;">
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
        ${showSwitchBanner ? `<div class="switch-alert">🔄 CHẠM ĐIỂM ${switchPt} — YÊU CẦU HAI ĐỘI ĐỔI SÂN!</div>` : ""}
        ${this.timerSeconds > 0 ? `
          <div class="timeout-banner">
            <span>⏱ ${PB.app.escape(this.timerLabel)}: <strong>${this._fmtSec(this.timerSeconds)}</strong></span>
            <button class="btn btn-sm btn-danger" onclick="PB.referee.stopTimer()">Dừng</button>
          </div>
        ` : ""}
        <div class="ref-courts-split">
          ${renderSide(leftSide)}
          ${renderSide(rightSide)}
        </div>
        <div class="ref-tools-grid">
          <button class="btn btn-warning" onclick="PB.referee.sideOut()">Lỗi giao bóng</button>
          <button class="btn btn-secondary" onclick="PB.referee.undo()" ${!m.history?.length ? "disabled" : ""}>Hoàn tác</button>
          <button class="btn btn-secondary" onclick="PB.referee.swapSides()">Đảo bên sân</button>
          <button class="btn btn-secondary" onclick="PB.referee.startMedicalTimer()">Y tế (15p)</button>
          <button class="btn btn-secondary" onclick="PB.referee.walkoverPrompt()">Bỏ cuộc (WO)</button>
          <button class="btn btn-success" onclick="PB.referee.finishManual()">Chốt kết thúc</button>
        </div>
      </div>
    `;
  },

  point(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const res = PB.rules.addPoint(m, side, PB.state.data.settings);
    PB.state.save();
    if (res.needSwitchAlert) PB.app.toast("🔄 Đã chạm điểm đổi sân!");
    if (res.event === "set_point_reached") {
      const wName = PB.state.getTeamName(res.winnerSide === "A" ? m.teamA : m.teamB);
      setTimeout(() => {
        if (confirm(`🏆 ${wName} đủ điểm thắng Set (${m.scoreA} - ${m.scoreB})!\nXác nhận chốt?`)) {
          const outcome = PB.rules.confirmFinishSetOrMatch(m, PB.state.data.settings);
          PB.state.save();
          if (outcome === "match_finished") { PB.app.toast(`🏁 Chiến thắng: ${wName}`); this.exitMatch(); }
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
  startTimer(sec, label) {
    this.stopTimer(); this.timerSeconds = sec; this.timerLabel = label; this.renderConsole();
    this.timerInterval = setInterval(() => {
      this.timerSeconds -= 1;
      if (this.timerSeconds <= 0) { this.stopTimer(); PB.app.toast(`⏰ Hết giờ ${label}!`); }
      else this.renderConsole();
    }, 1000);
  },
  stopTimer() { if (this.timerInterval) clearInterval(this.timerInterval); this.timerInterval = null; this.timerSeconds = 0; this.timerLabel = ""; if (this.activeMatchId) this.renderConsole(); },
  techFoul(side) {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m || !confirm("Phạt Lỗi Kỹ Thuật (+1 điểm đối thủ)?")) return;
    PB.rules.addTechnicalFoul(m, side, PB.state.data.settings); PB.state.save();
  },
  walkoverPrompt() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m) return;
    const c = prompt(`Nhập "A" nếu [${PB.state.getTeamName(m.teamA)}] thắng WO, hoặc "B" nếu [${PB.state.getTeamName(m.teamB)}] thắng WO:`);
    if (!c) return;
    const w = c.trim().toUpperCase();
    if (w !== "A" && w !== "B") return;
    PB.rules.finishByDefault(m, w, "Walkover"); PB.state.save(); this.exitMatch();
  },
  finishManual() {
    const m = PB.state.data.matches.find((x) => x.id === this.activeMatchId);
    if (!m || m.scoreA === m.scoreB) return alert("Tỷ số đang hòa!");
    if (!confirm(`Chốt kết quả (${m.scoreA} - ${m.scoreB})?`)) return;
    const out = PB.rules.confirmFinishSetOrMatch(m, PB.state.data.settings); PB.state.save();
    if (out === "match_finished") this.exitMatch();
  },
  _fmtSec(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
};
