/* =========================================================
   js/viewer.js
   - Màn hình Khán giả / VĐV:
     + Tỷ số Live theo sân + Chế độ màn hình TV toàn màn hình
     + Tra cứu lịch cá nhân theo tên VĐV
     + Bảng xếp hạng vòng bảng & Sơ đồ nhánh loại trực tiếp
     + Mã QR truy cập nhanh cho khán giả
   ========================================================= */
window.PB = window.PB || {};

PB.viewer = {
  standingView: "groups",
  activeTvMatchId: null,
  expandedLiveCards: {},

  toggleLiveDetail(matchId) {
    this.expandedLiveCards[matchId] = !this.expandedLiveCards[matchId];
    this.renderLive();
  },

  openMatchAsReferee(matchId) {
    if (PB.auth.isReferee()) {
      PB.app.switchTab("referee");
      PB.referee.openMatch(matchId);
    } else {
      this._pendingRefMatchId = matchId;
      PB.app.openAuthModal("referee");
    }
  },


  _teamBadgeHtml(teamId) {
    if (!teamId) return "";
    const t = PB.state.data.teams.find((x) => x.id === teamId);
    if (!t || !t.rating) return "";
    return `<span class="badge-rating">${PB.app.escape(t.rating)}</span>`;
  },

  renderStatsStrip() {
    const el = document.getElementById("tournamentStatsStrip");
    if (!el || !PB.state.data) return;
    const teams = PB.state.data.teams.length;
    const matches = PB.state.data.matches;
    const live = matches.filter((m) => m.status === "live").length;
    const done = matches.filter((m) => m.status === "finished").length;
    const pct = matches.length ? Math.round((done / matches.length) * 100) : 0;
    el.innerHTML = `
      <div class="stat-card"><div class="stat-label">Đội tham dự</div><div class="stat-value">${teams}</div></div>
      <div class="stat-card"><div class="stat-label">Tổng số trận</div><div class="stat-value">${matches.length}</div></div>
      <div class="stat-card"><div class="stat-label">Đang thi đấu</div><div class="stat-value accent-live">${live}</div></div>
      <div class="stat-card"><div class="stat-label">Tiến độ giải</div><div class="stat-value accent-ok">${done}/${matches.length} (${pct}%)</div></div>
    `;
  },

  renderAll() {
    this.renderStatsStrip();
    this.renderLive();
    this.renderStandings();
    if (this.activeTvMatchId) this.renderTvOverlay(this.activeTvMatchId);
  },

  _renderTeamSubMatchesLiveHtml(m) {
    if (m.matchType !== "team" || !Array.isArray(m.subMatches)) return "";
    const nA = PB.state.getTeamName(m.teamA);
    const nB = PB.state.getTeamName(m.teamB);
    const rows = m.subMatches.map((sm) => {
      const pA = (sm.playersA || []).filter(Boolean).join(" / ") || nA;
      const pB = (sm.playersB || []).filter(Boolean).join(" / ") || nB;
      const cls = sm.status === "live" ? "is-live" : sm.status === "finished" ? "is-done" : "";
      const stBadge = sm.status === "live"
        ? '<span class="badge badge-live" style="padding:1px 6px;font-size:0.64rem;">● LIVE</span>'
        : sm.status === "finished"
          ? '<span class="badge badge-done" style="padding:1px 6px;font-size:0.64rem;">Xong</span>'
          : '<span class="muted" style="font-size:0.68rem;">Chờ</span>';
      const scoreTxt = sm.status === "pending" ? "vs" : `${sm.scoreA} - ${sm.scoreB}`;
      return `
        <div class="team-sub-row ${cls}">
          <div class="team-sub-info">
            <div class="team-sub-title">
              <span>${PB.app.escape(sm.label)}</span>
              ${stBadge}
            </div>
            <div class="team-sub-players">
              <span style="${sm.winner === "A" ? "color:var(--emerald);font-weight:800;" : ""}">${PB.app.escape(pA)}</span>
              <span class="muted"> vs </span>
              <span style="${sm.winner === "B" ? "color:var(--emerald);font-weight:800;" : ""}">${PB.app.escape(pB)}</span>
            </div>
          </div>
          <div class="team-sub-score">${scoreTxt}</div>
        </div>
      `;
    }).join("");

    let dbRow = "";
    if (m.dreambreaker && m.dreambreaker.status !== "pending") {
      const db = m.dreambreaker;
      const cls = db.status === "live" ? "is-live" : "is-done";
      dbRow = `
        <div class="team-sub-row ${cls}">
          <div class="team-sub-info">
            <div class="team-sub-title">
              <span>Trận Đơn (Dreambreaker)</span>
              ${db.status === "live" ? '<span class="badge badge-live" style="padding:1px 6px;font-size:0.64rem;">● LIVE</span>' : '<span class="badge badge-done" style="padding:1px 6px;font-size:0.64rem;">Xong</span>'}
            </div>
          </div>
          <div class="team-sub-score">${db.scoreA} - ${db.scoreB}</div>
        </div>
      `;
    }

    return `<div class="team-sub-list">${rows}${dbRow}</div>`;
  },

  _renderTeamSubMiniStrip(m) {
    if (m.matchType !== "team" || !Array.isArray(m.subMatches)) return "";
    if (m.status === "pending" && !m.lineupLocked) return "";
    const shortLabels = ["Đôi Nữ", "Đôi Nam", "Nam Nữ 1", "Nam Nữ 2"];
    const chips = m.subMatches.map((sm, i) => {
      const cls = sm.status === "live" ? "is-live" : sm.status === "finished" ? "is-done" : "";
      const sc = sm.status === "pending" ? "Chờ" : `${sm.scoreA}-${sm.scoreB}`;
      return `<span class="team-sub-mini-chip ${cls}">${shortLabels[i] || sm.code}: ${sc}${sm.status === "live" ? " ●" : ""}</span>`;
    }).join("");
    return `<div class="team-sub-mini-strip">${chips}</div>`;
  },

  renderLive() {
    const data = PB.state.data;
    if (!data) return;

    // 1. Tra cứu tên VĐV
    const q = (document.getElementById("playerSearchInput")?.value || "").trim().toLowerCase();
    const searchBox = document.getElementById("playerSearchResults");
    if (q.length >= 1) {
      const matched = data.matches.filter((m) => {
        const a = PB.state.getTeamName(m.teamA).toLowerCase();
        const b = PB.state.getTeamName(m.teamB).toLowerCase();
        return a.includes(q) || b.includes(q);
      });
      searchBox.classList.remove("hidden");
      searchBox.innerHTML = `
        <div class="section-header">
          <strong>Kết quả tra cứu cho "${PB.app.escape(q)}" (${matched.length} trận)</strong>
        </div>
        ${matched.length ? matched.map((m) => this._matchRowHtml(m)).join("") : '<p class="muted">Không tìm thấy trận nào.</p>'}
      `;
    } else {
      searchBox.classList.add("hidden");
    }

    // 2. Các trận đang đánh Live + Các trận tiếp theo đã được tự động gán sân
    const liveMatches = data.matches.filter((m) => m.status === "live");
    const queuedOnCourt = data.matches
      .filter((m) => m.status === "pending" && Number(m.court) > 0 && m.teamA && m.teamB)
      .sort((a, b) => Number(a.court) - Number(b.court));
    const displayMatches = [...liveMatches, ...queuedOnCourt];

    document.getElementById("liveCountLabel").textContent =
      liveMatches.length
        ? `${liveMatches.length} đang đánh${queuedOnCourt.length ? ` • ${queuedOnCourt.length} chờ vào sân` : ""}`
        : (queuedOnCourt.length ? `${queuedOnCourt.length} trận đã gán sân chờ đánh` : "0 trận đang đánh");
    const grid = document.getElementById("liveCourtsGrid");

    if (!displayMatches.length) {
      grid.innerHTML = `<div class="card muted text-center">Hiện chưa có trận nào trên sân.</div>`;
    } else {
      grid.innerHTML = displayMatches.map((m) => {
        const nameA = PB.state.getTeamName(m.teamA);
        const nameB = PB.state.getTeamName(m.teamB);
        const callout = PB.rules.getCallout(m, data.settings);
        const setsHtml = m.sets.length ? `<div class="set-pills">Các set: ${m.sets.map((s) => `${s.a}-${s.b}`).join(", ")}</div>` : "";
        return `
          <div class="court-card">
            <div class="court-card-head">
              <div>
                <span class="court-pill">Sân ${m.court || "?"}</span> <span class="muted" style="margin-left:6px;">${PB.app.escape(m.roundName)}</span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                ${m.status === "live" ? '<span class="badge badge-live">● LIVE</span>' : '<span class="badge badge-serieA">Sắp đánh</span>'}
                <button class="btn btn-sm btn-secondary" onclick="PB.viewer.openTv('${m.id}')" title="Mở chế độ màn hình TV">TV</button>
              </div>
            </div>
            <div class="score-row ${m.server === "A" ? "serving" : ""}">
              <div class="team-name-line">
                ${m.server === "A" ? '<span class="serve-dot"></span>' : ""}
                <span>${PB.app.escape(nameA)}</span> ${this._teamBadgeHtml(m.teamA)}
              </div>
              <div class="score-num">${m.scoreA}</div>
            </div>
            <div class="score-row ${m.server === "B" ? "serving" : ""}">
              <div class="team-name-line">
                ${m.server === "B" ? '<span class="serve-dot"></span>' : ""}
                <span>${PB.app.escape(nameB)}</span> ${this._teamBadgeHtml(m.teamB)}
              </div>
              <div class="score-num">${m.scoreB}</div>
            </div>
            <div class="muted" style="display:flex;justify-content:space-between;margin-top:6px;">
              <span>${m.matchType === "team" ? "Tổng tỷ số trận đôi" : "Đọc điểm"}: <strong>${callout}</strong></span>
              <span>${m.matchType === "team" ? "Đồng đội (4 trận)" : `Set: ${m.setsA} - ${m.setsB}`}</span>
            </div>
            ${setsHtml}
            <div class="court-card-actions">
              <button class="btn btn-sm btn-primary" onclick="PB.viewer.openMatchAsReferee('${m.id}')">Trọng tài</button>
              ${m.matchType === "team"
                ? `<button class="btn btn-sm btn-secondary" onclick="PB.viewer.toggleLiveDetail('${m.id}')">${this.expandedLiveCards[m.id] ? "Ẩn chi tiết ▴" : "Chi tiết ▾"}</button>`
                : `<button class="btn btn-sm btn-secondary" onclick="PB.viewer.openMatchLog('${m.id}')">Chi tiết</button>`}
            </div>
            ${m.matchType === "team" && this.expandedLiveCards[m.id] ? this._renderTeamSubMatchesLiveHtml(m) : ""}
          </div>
        `;
      }).join("");
    }

    // 3. Toàn bộ danh sách trận
    const filter = document.getElementById("liveStatusFilter")?.value || "all";
    const list = data.matches.filter((m) => filter === "all" || m.status === filter);
    const listEl = document.getElementById("allMatchesList");
    listEl.innerHTML = list.length
      ? list.map((m) => this._matchRowHtml(m)).join("")
      : `<div class="card muted text-center">Chưa có lịch thi đấu. Ban tổ chức hãy vào mục Quản lý để tạo giải hoặc tải dữ liệu mẫu.</div>`;
  },

  _matchRowHtml(m) {
    const nameA = PB.state.getTeamName(m.teamA);
    const nameB = PB.state.getTeamName(m.teamB);
    const statusBadge =
      m.status === "live" ? '<span class="badge badge-live">Đang đánh</span>' :
      m.status === "finished" ? '<span class="badge badge-done">Kết thúc</span>' :
      '<span class="badge badge-wait">Chờ đánh</span>';
    const stageBadge =
      m.stage === "serieA" ? '<span class="badge badge-serieA">Serie A</span>' :
      m.stage === "serieB" ? '<span class="badge badge-serieB">Serie B</span>' : "";

    const scoreText = m.status === "pending"
      ? "vs"
      : (m.sets && m.sets.length > 1
        ? m.sets.map((s) => `${s.a}-${s.b}`).join(" / ")
        : `${m.scoreA} - ${m.scoreB}`);

    return `
      <div class="match-item">
        <div>
          <div class="match-meta">
            ${statusBadge} ${stageBadge}
            <strong>${PB.app.escape(m.roundName)}</strong>
            <span>• ${m.court ? "Sân " + m.court : "Chưa xếp sân"}</span>
            ${m.finishReason ? `<span>(${m.finishReason})</span>` : ""}
          </div>
          <div class="match-teams">
            <span style="${m.winner === "A" ? "color:var(--success)" : ""}">${PB.app.escape(nameA)}</span>
            <span class="muted"> vs </span>
            <span style="${m.winner === "B" ? "color:var(--success)" : ""}">${PB.app.escape(nameB)}</span>
          </div>
          ${this._renderTeamSubMiniStrip(m)}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="match-score-pill">${scoreText}</div>
          ${m.logs && m.logs.length ? `<button class="btn btn-sm btn-secondary" onclick="PB.viewer.openMatchLog('${m.id}')">Log</button>` : ""}
        </div>
      </div>
    `;
  },

  switchStandingView(view, silent = false) {
    this.standingView = view;
    if (!silent && PB.app.saveUiState) PB.app.saveUiState({ standingView: view });
    document.getElementById("subtabGroupsBtn").classList.toggle("active", view === "groups");
    document.getElementById("subtabBracketBtn").classList.toggle("active", view === "bracket");
    document.getElementById("standingsGroupsView").classList.toggle("hidden", view !== "groups");
    document.getElementById("standingsBracketView").classList.toggle("hidden", view !== "bracket");
    this.renderStandings();
  },

  renderStandings() {
    const standings = PB.bracket.calculateStandings();
    const gNames = Object.keys(standings).sort();
    const groupsEl = document.getElementById("standingsGroupsView");

    if (!gNames.length) {
      groupsEl.innerHTML = `<div class="card muted text-center">Chưa có dữ liệu bảng đấu.</div>`;
    } else {
      groupsEl.innerHTML = gNames.map((g) => `
        <div class="card">
          <div class="section-header">
            <h3>Bảng ${PB.app.escape(g)}</h3>
            <span class="muted">${PB.state.data.settings.category === "team" ? "Thắng 3đ • Hòa 2đ • Thua 1đ • Bỏ cuộc 0đ (Đối kháng → Hệ số → Bốc thăm)" : "Ưu tiên: Thắng → Đối đầu → Hiệu số → Tổng điểm → Bốc thăm"}</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                ${PB.state.data.settings.category === "team"
                  ? `<tr><th>#</th><th>Đội</th><th>Trận</th><th>T-H-B (BC)</th><th>Điểm BXH</th><th>Hệ số trận</th><th>Hệ số điểm</th></tr>`
                  : `<tr><th>#</th><th>Đội / Cặp VĐV</th><th>Trận</th><th>Thắng</th><th>Thua</th><th>Ghi/Thua</th><th>Hiệu số</th></tr>`}
              </thead>
              <tbody>
                ${standings[g].map((row, idx) => `
                  ${PB.state.data.settings.category === "team" ? `
                  <tr class="${idx < 2 ? "qualify-a" : "qualify-b"}">
                    <td><strong>${idx + 1}</strong></td>
                    <td><strong>${PB.app.escape(row.name)}</strong> ${row.tieDrawNote ? '<span class="badge badge-serieA">Bốc thăm</span>' : ""}</td>
                    <td>${row.played}</td>
                    <td>${row.wins}-${row.draws}-${row.losses} ${row.forfeits ? `(BC:${row.forfeits})` : ""}</td>
                    <td><strong style="color:var(--primary);font-size:1rem;">${row.tablePts}</strong></td>
                    <td>${row.subWins}-${row.subLosses} (${row.subDiff > 0 ? "+" + row.subDiff : row.subDiff})</td>
                    <td>${row.diff > 0 ? "+" + row.diff : row.diff}</td>
                  </tr>` : `
                  <tr class="${idx < 2 ? "qualify-a" : "qualify-b"}">
                    <td><strong>${idx + 1}</strong></td>
                    <td><strong>${PB.app.escape(row.name)}</strong> ${row.tieDrawNote ? '<span class="badge badge-serieA">Bốc thăm</span>' : ""}</td>
                    <td>${row.played}</td>
                    <td><strong>${row.wins}</strong></td>
                    <td>${row.losses}</td>
                    <td>${row.ptsFor} / ${row.ptsAgainst}</td>
                    <td><strong>${row.diff > 0 ? "+" + row.diff : row.diff}</strong></td>
                  </tr>`}
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `).join("");
    }

    // Sơ đồ cây loại trực tiếp (Ghi rõ Nhất A, Nhì B, Ba A, Tư B...)
    const bracketEl = document.getElementById("standingsBracketView");
    const koMatches = PB.state.data.matches.filter((m) => m.stage !== "group");
    if (!koMatches.length) {
      bracketEl.innerHTML = `<div class="card muted text-center">Chưa có sơ đồ nhánh đấu. Hãy tạo lịch vòng bảng trong mục Quản lý.</div>`;
    } else {
      const stages = ["serieA", "serieB", "knockout"].filter((st) => koMatches.some((m) => m.stage === st));
      bracketEl.innerHTML = stages.map((st) => {
        const list = koMatches.filter((m) => m.stage === st);
        const title = st === "serieA" ? "Nhánh Serie A (Nhất & Nhì bảng)" : st === "serieB" ? "Nhánh Serie B (Ba & Tư bảng)" : "Vòng loại trực tiếp";
        const badgeCls = st === "serieA" ? "badge-serieA" : st === "serieB" ? "badge-serieB" : "badge-done";

        // Nhóm theo vòng (roundOrder: 1=Tứ kết, 2=Bán kết, 3=Chung kết)
        const orders = [...new Set(list.map((m) => m.roundOrder || 3))].sort((a, b) => a - b);
        const colName = (ord) => ord === 1 ? "Tứ kết" : ord === 2 ? "Bán kết" : "Chung kết";

        return `
          <div class="bracket-tree-section">
            <div class="bracket-tree-header">
              <div class="bracket-tree-title">
                <span class="badge ${badgeCls}">${st === "serieA" ? "SERIE A" : st === "serieB" ? "SERIE B" : "KNOCKOUT"}</span>
                <span>${title}</span>
              </div>
              <span class="muted">Tự động cập nhật & xếp sân khi đủ đội</span>
            </div>
            <div class="bracket-tree">
              ${gNames.length ? `
                <div class="bt-col bt-col-groups">
                  <div class="bt-col-title">Vòng bảng</div>
                  <div class="bt-matches">
                    ${gNames.map((g) => {
                      const rows = standings[g] || [];
                      const gMatches = PB.state.data.matches.filter((m) => m.stage === "group" && m.group === g);
                      const gDone = gMatches.filter((m) => m.status === "finished").length;
                      const gStatus = gMatches.length && gDone === gMatches.length ? "Xong" : `${gDone}/${gMatches.length}`;
                      return `
                        <div class="bt-node bt-group-node has-next">
                          <div class="bt-node-meta">
                            <span><strong>Bảng ${PB.app.escape(g)}</strong></span>
                            <strong>${gStatus}</strong>
                          </div>
                          ${rows.map((r, rIdx) => {
                            const rank = rIdx + 1;
                            const isAdv = (st === "serieB") ? (rank === 3 || rank === 4) : (rank === 1 || rank === 2);
                            const rankTag = rank === 1 ? `Nhất ${g}` : rank === 2 ? `Nhì ${g}` : rank === 3 ? `Ba ${g}` : rank === 4 ? `Tư ${g}` : `#${rank}`;
                            const ptsTxt = PB.state.data.settings.category === "team" ? `${r.tablePts}đ` : `${r.wins}T`;
                            return `
                              <div class="bt-slot ${isAdv ? "winner" : ""}">
                                <span class="bt-seed-tag">${rankTag}</span>
                                <span class="bt-slot-name">${PB.app.escape(r.name)}</span>
                                <span class="bt-slot-score">${ptsTxt}</span>
                              </div>
                            `;
                          }).join("")}
                        </div>
                      `;
                    }).join("")}
                  </div>
                </div>
              ` : ""}
              ${orders.map((ord, colIdx) => {
                const colMatches = list.filter((m) => (m.roundOrder || 3) === ord);
                const hasNextCol = colIdx < orders.length - 1;
                return `
                  <div class="bt-col">
                    <div class="bt-col-title">${colName(ord)}</div>
                    <div class="bt-matches">
                      ${colMatches.map((m) => {
                        const nameA = m.teamA ? PB.state.getTeamName(m.teamA) : "Chờ xác định";
                        const nameB = m.teamB ? PB.state.getTeamName(m.teamB) : "Chờ xác định";
                        const statusTxt = m.status === "live" ? "Đang đánh" : m.status === "finished" ? "Xong" : (m.court ? `Sân ${m.court}` : "Chờ");
                        return `
                          <div class="bt-node ${m.status === "live" ? "is-live" : ""} ${hasNextCol ? "has-next" : ""}">
                            <div class="bt-node-meta">
                              <span>${PB.app.escape(m.roundName)}</span>
                              <strong>${statusTxt}</strong>
                            </div>
                            <div class="bt-slot ${m.winner === "A" ? "winner" : ""}">
                              ${m.labelA ? `<span class="bt-seed-tag">${PB.app.escape(m.labelA)}</span>` : ""}
                              <span class="bt-slot-name">${PB.app.escape(nameA)}</span>
                              <span class="bt-slot-score">${m.status === "pending" ? "-" : m.scoreA}</span>
                            </div>
                            <div class="bt-slot ${m.winner === "B" ? "winner" : ""}">
                              ${m.labelB ? `<span class="bt-seed-tag">${PB.app.escape(m.labelB)}</span>` : ""}
                              <span class="bt-slot-name">${PB.app.escape(nameB)}</span>
                              <span class="bt-slot-score">${m.status === "pending" ? "-" : m.scoreB}</span>
                            </div>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("");
    }
  },

  openTv(matchId) {
    this.activeTvMatchId = matchId;
    document.getElementById("tvOverlay").classList.remove("hidden");
    this.renderTvOverlay(matchId);
  },

  closeTv() {
    this.activeTvMatchId = null;
    document.getElementById("tvOverlay").classList.add("hidden");
  },

  renderTvOverlay(matchId) {
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    const el = document.getElementById("tvOverlay");
    if (!m) { this.closeTv(); return; }

    const callout = PB.rules.getCallout(m, PB.state.data.settings);
    el.innerHTML = `
      <div class="tv-header">
        <div>
          <span class="badge badge-live">● LIVE SCOREBOARD</span>
          <strong style="margin-left:10px;font-size:1.2rem;">${PB.app.escape(PB.state.data.tournamentName)} — Sân ${m.court || "?"} (${PB.app.escape(m.roundName)})</strong>
        </div>
        <button class="btn btn-secondary" onclick="PB.viewer.closeTv()">✕ Thoát TV</button>
      </div>
      <div class="tv-board">
        <div class="tv-team ${m.server === "A" ? "serving" : ""}">
          <div class="tv-team-name">${m.server === "A" ? "<svg style="width:0.95em;height:0.95em;vertical-align:-0.12em;margin-right:6px;" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="3" width="16" height="19" rx="7" fill="#f97316" stroke="#fde047" stroke-width="1.8"/><rect x="12" y="22" width="4" height="7.5" rx="1.6" fill="#cbd5e1"/><circle cx="24" cy="22" r="5" fill="#fde047" stroke="#ea580c" stroke-width="1.4"/><circle cx="22.6" cy="20.8" r="0.85" fill="#ea580c"/><circle cx="25.5" cy="21" r="0.85" fill="#ea580c"/><circle cx="24" cy="23.5" r="0.85" fill="#ea580c"/></svg>" : ""}${PB.app.escape(PB.state.getTeamName(m.teamA))}</div>
          <div class="tv-score">${m.scoreA}</div>
          <div class="muted" style="font-size:1.2rem;margin-top:8px;">Sets: ${m.setsA}</div>
        </div>
        <div class="tv-vs">
          <div style="font-size:1rem;color:#94a3b8;">ĐỌC ĐIỂM</div>
          <div style="font-size:2.6rem;color:#facc15;">${callout}</div>
        </div>
        <div class="tv-team ${m.server === "B" ? "serving" : ""}">
          <div class="tv-team-name">${m.server === "B" ? "<svg style="width:0.95em;height:0.95em;vertical-align:-0.12em;margin-right:6px;" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="3" width="16" height="19" rx="7" fill="#f97316" stroke="#fde047" stroke-width="1.8"/><rect x="12" y="22" width="4" height="7.5" rx="1.6" fill="#cbd5e1"/><circle cx="24" cy="22" r="5" fill="#fde047" stroke="#ea580c" stroke-width="1.4"/><circle cx="22.6" cy="20.8" r="0.85" fill="#ea580c"/><circle cx="25.5" cy="21" r="0.85" fill="#ea580c"/><circle cx="24" cy="23.5" r="0.85" fill="#ea580c"/></svg>" : ""}${PB.app.escape(PB.state.getTeamName(m.teamB))}</div>
          <div class="tv-score" style="color:#fb923c;">${m.scoreB}</div>
          <div class="muted" style="font-size:1.2rem;margin-top:8px;">Sets: ${m.setsB}</div>
        </div>
      </div>
      <div class="text-center muted">Tự động cập nhật theo thời gian thực từ máy Trọng tài</div>
    `;
  },

  openMatchLog(matchId) {
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (!m) return;
    const logs = (m.logs || []).map((l) => `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:0.86rem;">${PB.app.escape(l)}</div>`).join("");
    PB.app.openInfoModal(
      `Nhật ký trận: ${PB.state.getTeamName(m.teamA)} vs ${PB.state.getTeamName(m.teamB)}`,
      logs || '<p class="muted">Chưa có nhật ký.</p>'
    );
  },

  openQrModal() {
    const url = window.location.href;
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
    PB.app.openInfoModal(
      "Mã QR xem tỷ số trực tiếp",
      `
        <div class="text-center">
          <p class="muted">In hoặc chia sẻ mã này để khán giả & VĐV quét xem tỷ số Live trên điện thoại:</p>
          <img src="${qrImg}" alt="QR Code" style="border:1px solid #e2e8f0;border-radius:12px;padding:8px;margin:10px 0;" />
          <div style="word-break:break-all;font-size:0.82rem;color:var(--muted);">${PB.app.escape(url)}</div>
        </div>
      `
    );
  }
};
