/* =========================================================
   js/admin.js
   - Khu vực Quản lý (BTC):
     + Nhập nhanh VĐV từ Zalo/Excel, tự động chia bảng ngẫu nhiên
     + Tạo lịch vòng bảng & Chốt vòng bảng đẩy nhánh Serie A/B
     + Điều phối sân thông minh (cảnh báo trùng VĐV đang đánh sân khác)
     + Sửa điểm thủ công, xuất file Excel (CSV UTF-8), đổi mật khẩu
   ========================================================= */
window.PB = window.PB || {};

PB.admin = {
  subTab: "teams",

  render() {
    const allowed = PB.auth.isAdmin();
    document.getElementById("adminLockedView").classList.toggle("hidden", allowed);
    document.getElementById("adminContent").classList.toggle("hidden", !allowed);
    if (!allowed) return;

    this.renderTeamsSub();
    this.renderScheduleSub();
    this.renderSettingsSub();
  },

  switchSubTab(tab) {
    this.subTab = tab;
    document.querySelectorAll("[data-admintab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.admintab === tab);
    });
    ["teams", "schedule", "settings"].forEach((t) => {
      document.getElementById(`admin-sub-${t}`).classList.toggle("hidden", t !== tab);
    });
  },

  renderTeamsSub() {
    const teams = PB.state.data.teams;
    const el = document.getElementById("admin-sub-teams");
    el.innerHTML = `
      <div class="card">
        <div class="section-header">
          <h3>Nhập nhanh danh sách VĐV / Cặp đấu</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-sm btn-secondary" onclick="PB.admin.loadSample('doubles')">Mẫu Đôi (8 cặp)</button><button class="btn btn-sm btn-warning" onclick="PB.admin.loadSample('team')">Mẫu Đồng đội (6 đội)</button></div>
        </div>
        <div class="form-group">
          <label>Dán danh sách từ Zalo / Excel (mỗi dòng 1 cặp VĐV):</label>
          <textarea id="bulkTeamsInput" rows="4" placeholder="Mỗi dòng 1 đội (có thể kèm trình độ sau dấu -):&#10;Hùng / Dương - 3.2&#10;Nam / Khánh - 3.0&#10;Dũng / Hạnh - 2.8"></textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-primary" onclick="PB.admin.addBulkTeams()">+ Thêm vào danh sách</button>
          <select id="autoGroupCount" class="input-sm">
            <option value="2">Chia đều 2 bảng (A, B)</option>
            <option value="4">Chia đều 4 bảng (A, B, C, D)</option>
            <option value="1">Gộp 1 bảng (A)</option>
          </select>
          <button class="btn btn-warning" onclick="PB.admin.autoDrawGroups()">Bốc thăm chia bảng</button>
        </div>
      </div>

      <div class="card">
        <div class="section-header">
          <h3>Danh sách đã đăng ký (${teams.length} đội)</h3>
          <button class="btn btn-sm btn-danger" onclick="PB.admin.clearAllTeams()">Xóa hết đội</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>Tên đội / Cặp VĐV</th><th>Bảng</th><th>Thao tác</th></tr></thead>
            <tbody>
              ${teams.length ? teams.map((t, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${PB.app.escape(t.name)}</strong></td>
                  <td>
                    <select class="input-sm" onchange="PB.admin.changeTeamGroup('${t.id}', this.value)">
                      ${["A", "B", "C", "D"].map((g) => `<option value="${g}" ${t.group === g ? "selected" : ""}>Bảng ${g}</option>`).join("")}
                    </select>
                  </td>
                  <td><div style="display:flex;gap:6px;">${PB.state.data.settings.category === "team" ? `<button class="btn btn-sm btn-secondary" onclick="PB.admin.editRosterPrompt('${t.id}')">VĐV (${(t.roster||[]).length})</button>` : ""}<button class="btn btn-sm btn-danger" onclick="PB.admin.deleteTeam('${t.id}')">Xóa</button></div></td>
                </tr>
              `).join("") : `<tr><td colspan="4" class="muted text-center">Chưa có đội nào.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderScheduleSub() {
    const matches = PB.state.data.matches;
    const numCourts = Number(PB.state.data.settings.numCourts) || 4;
    const busyTeams = new Set();
    const busyCourts = new Set();
    matches.filter((m) => m.status === "live").forEach((m) => {
      if (m.court) busyCourts.add(Number(m.court));
      if (m.teamA) busyTeams.add(m.teamA);
      if (m.teamB) busyTeams.add(m.teamB);
    });

    const freeCourts = [];
    for (let c = 1; c <= numCourts; c++) if (!busyCourts.has(c)) freeCourts.push(`Sân ${c}`);

    const el = document.getElementById("admin-sub-schedule");
    el.innerHTML = `
      <div class="card">
        <div class="section-header">
          <h3>Điều phối giải đấu & Sân thi đấu</h3>
          <span class="badge badge-cloud">Sân trống: ${freeCourts.length ? freeCourts.join(", ") : "Đang kín sân"}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="PB.admin.generateGroupSchedule()">Tạo lịch vòng bảng</button>
          <button class="btn btn-success" onclick="PB.admin.generateKnockout()">Chốt vòng bảng → Đẩy nhánh</button>
          <button class="btn btn-secondary" onclick="PB.admin.exportCsv()">Xuất kết quả Excel (CSV)</button>
        </div>
      </div>

      <div class="card">
        <h3>Danh sách trận đấu (${matches.length} trận)</h3>
        <div class="match-list">
          ${matches.length ? matches.map((m) => {
            const conflict = m.status === "pending" && (busyTeams.has(m.teamA) || busyTeams.has(m.teamB));
            let courtOpts = `<option value="0">-- Chưa xếp sân --</option>`;
            for (let c = 1; c <= numCourts; c++) {
              courtOpts += `<option value="${c}" ${Number(m.court) === c ? "selected" : ""}>Sân ${c}</option>`;
            }
            return `
              <div class="match-item">
                <div>
                  <div class="match-meta">
                    <strong>${PB.app.escape(m.roundName)}</strong>
                    <span>• Trạng thái: ${m.status}</span>
                    ${conflict ? '<span class="badge badge-live">Có VĐV đang đánh sân khác</span>' : ""}
                  </div>
                  <div class="match-teams">
                    ${PB.app.escape(PB.state.getTeamName(m.teamA))} <span class="muted">vs</span> ${PB.app.escape(PB.state.getTeamName(m.teamB))}
                    ${m.status !== "pending" ? `<span class="muted"> (${m.scoreA} - ${m.scoreB})</span>` : ""}
                  </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                  <select class="input-sm" onchange="PB.admin.assignCourt('${m.id}', this.value)">${courtOpts}</select>
                  <button class="btn btn-sm btn-secondary" onclick="PB.admin.editScorePrompt('${m.id}')">Sửa điểm</button>
                </div>
              </div>
            `;
          }).join("") : '<p class="muted text-center">Chưa có trận nào. Bấm "Tạo lịch vòng bảng" ở trên.</p>'}
        </div>
      </div>
    `;
  },

  renderSettingsSub() {
    const d = PB.state.data;
    const s = d.settings;
    const el = document.getElementById("admin-sub-settings");
    el.innerHTML = `
      <div class="card">
        <h3>Cấu hình Điều lệ giải đấu</h3>
        <div class="form-group">
          <label>Tên giải đấu</label>
          <input type="text" id="cfgName" class="input" value="${PB.app.escape(d.tournamentName)}" />
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Nội dung thi đấu</label>
            <select id="cfgCategory" class="input">
              <option value="doubles" ${s.category === "doubles" ? "selected" : ""}>Đánh Đôi (chuẩn 0-0-2)</option>
              <option value="team" ${s.category === "team" ? "selected" : ""}>Đồng đội</option>
            </select>
          </div>
          <div class="form-group">
            <label>Cách tính điểm</label>
            <select id="cfgScoring" class="input">
              <option value="sideout" ${s.scoringMode === "sideout" ? "selected" : ""}>Side-out (Giao bóng mới ghi điểm)</option>
              <option value="rally" ${s.scoringMode === "rally" ? "selected" : ""}>Rally (Tính điểm trực tiếp)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Điểm kết thúc set</label>
            <select id="cfgTarget" class="input">
              <option value="11" ${Number(s.targetPoints) === 11 ? "selected" : ""}>11 điểm</option>
              <option value="15" ${Number(s.targetPoints) === 15 ? "selected" : ""}>15 điểm</option>
            </select>
          </div>
          <div class="form-group">
            <label>Số set thi đấu</label>
            <select id="cfgBestOf" class="input">
              <option value="1" ${Number(s.bestOf) === 1 ? "selected" : ""}>1 Set (BO1)</option>
              <option value="3" ${Number(s.bestOf) === 3 ? "selected" : ""}>3 Set thắng 2 (BO3)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Luật thắng cách 2 điểm</label>
            <select id="cfgWinByTwo" class="input">
              <option value="true" ${s.winByTwo ? "selected" : ""}>Có (Cách 2 điểm)</option>
              <option value="false" ${!s.winByTwo ? "selected" : ""}>Không (Chạm điểm cứng)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Điểm đổi sân</label>
            <input type="number" id="cfgSwitch" class="input" value="${s.switchPoint}" min="1" max="15" />
          </div>
          <div class="form-group">
            <label>Số sân thi đấu</label>
            <input type="number" id="cfgCourts" class="input" value="${s.numCourts}" min="1" max="20" />
          </div>
          <div class="form-group">
            <label>Thể thức vòng loại trực tiếp</label>
            <select id="cfgKoMode" class="input">
              <option value="serieAB" ${s.knockoutMode === "serieAB" ? "selected" : ""}>Chia nhánh Serie A & Serie B</option>
              <option value="single" ${s.knockoutMode === "single" ? "selected" : ""}>1 Nhánh chính (Nhất/Nhì bảng)</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary mt-12" onclick="PB.admin.saveSettings()">Lưu điều lệ</button>
      </div>

      <div class="card">
        <h3>Đổi Mật khẩu phân quyền</h3>
        <p class="muted" style="margin-top:0;">Vì lý do bảo mật, mật khẩu hiện tại được ẩn. Nhập mật khẩu mới vào ô cần đổi rồi bấm Lưu.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>Mật khẩu Trọng tài mới</label>
            <input type="password" id="cfgRefPass" class="input" placeholder="Để trống nếu giữ nguyên..." autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Mật khẩu Quản lý (BTC) mới</label>
            <input type="password" id="cfgAdminPass" class="input" placeholder="Để trống nếu giữ nguyên..." autocomplete="new-password" />
          </div>
        </div>
        <button class="btn btn-warning" onclick="PB.admin.savePasswords()">Lưu mật khẩu mới</button>
      </div>
    `;
  },

  addBulkTeams() {
    const raw = document.getElementById("bulkTeamsInput").value;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return PB.app.toast("Vui lòng nhập ít nhất 1 tên đội.");
    lines.forEach((line) => {
      const parts = line.split("-");
      const name = parts[0].trim();
      const rating = parts[1] ? parts[1].trim() : "";
      PB.state.data.teams.push({
        id: "T" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        name,
        rating,
        group: "A",
        seed: 0
      });
    });
    PB.state.save();
    PB.app.toast(`Đã thêm ${lines.length} đội!`);
  },

  autoDrawGroups() {
    const teams = [...PB.state.data.teams];
    if (teams.length < 2) return PB.app.toast("Cần ít nhất 2 đội để chia bảng.");
    const count = Number(document.getElementById("autoGroupCount").value) || 2;
    const letters = ["A", "B", "C", "D"];
    // Xáo trộn Fisher-Yates
    for (let i = teams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teams[i], teams[j]] = [teams[j], teams[i]];
    }
    teams.forEach((t, idx) => { t.group = letters[idx % count]; });
    PB.state.data.teams = teams;
    PB.state.save();
    PB.app.toast(`Đã bốc thăm chia đều vào ${count} bảng!`);
  },

  changeTeamGroup(id, group) {
    const t = PB.state.data.teams.find((x) => x.id === id);
    if (t) { t.group = group; PB.state.save(); }
  },

  async deleteTeam(id) {
    if (!(await PB.ui.confirm("Bạn có chắc muốn xóa đội này khỏi giải đấu?", "Xóa đội", true))) return;
    PB.state.data.teams = PB.state.data.teams.filter((x) => x.id !== id);
    PB.state.save();
  },

  async clearAllTeams() {
    if (!(await PB.ui.confirm("Toàn bộ danh sách đội và lịch thi đấu hiện tại sẽ bị xóa sạch.", "Xóa toàn bộ giải", true))) return;
    PB.state.data.teams = [];
    PB.state.data.matches = [];
    PB.state.save();
  },

  async loadSample(cat = "doubles") {
    const label = cat === "team" ? "Đồng đội (6 đội, sẵn VĐV Nam/Nữ)" : "Đôi (8 cặp)";
    if (!(await PB.ui.confirm(`Tải dữ liệu mẫu ${label} sẽ ghi đè dữ liệu hiện tại.`, "Tải dữ liệu mẫu"))) return;
    PB.state.loadSampleData(cat);
    PB.app.toast(`Đã tải dữ liệu mẫu ${label}!`);
  },
  async editRosterPrompt(teamId) {
    const t = PB.state.getTeam(teamId);
    if (!t) return;
    const cur = (t.roster || []).map((p) => `${p.name}(${p.gender === "M" ? "Nam" : "Nữ"})`).join(", ");
    const inp = await PB.ui.prompt(`Nhập danh sách VĐV (cách nhau dấu phẩy):\nVD: Hùng(Nam), Nam(Nam), Dương(Nữ), Hạnh(Nữ)`, cur, `Danh sách VĐV — ${t.name}`);
    if (inp === null) return;
    t.roster = inp.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const isF = /nữ|nu|\(f\)/i.test(s);
      return { name: s.replace(/\(.*?\)/g, "").trim(), gender: isF ? "F" : "M" };
    });
    PB.state.save();
    PB.app.toast(`Đã cập nhật ${t.roster.length} VĐV cho ${t.name}`);
  },

  async generateGroupSchedule() {
    if (PB.state.data.teams.length < 2) return PB.app.toast("Chưa đủ đội để tạo lịch.");
    if (PB.state.data.matches.length && !(await PB.ui.confirm("Tạo lại lịch vòng bảng sẽ làm mới toàn bộ lịch thi đấu hiện tại.", "Tạo lịch vòng bảng"))) return;
    PB.bracket.generateGroupMatches();
    PB.app.toast("Đã tạo lịch thi đấu vòng bảng!");
  },

  async generateKnockout() {
    const res = PB.bracket.generateKnockoutFromGroups();
    if (!res.ok) return PB.ui.alert(res.msg);
    PB.app.toast(`Đã tạo ${res.count} trận vòng loại trực tiếp!`);
  },

  async assignCourt(matchId, courtNum) {
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (!m) return;
    const cNum = Number(courtNum);
    if (cNum > 0) {
      const conflict = PB.state.findLiveConflict(matchId);
      if (conflict) {
        await PB.ui.alert(
          `Không thể xếp vào Sân ${cNum} vì [${conflict.who}] hiện đang thi đấu trực tiếp tại Sân ${conflict.court}.`,
          "Trùng lịch thi đấu VĐV"
        );
        this.renderScheduleSub();
        return;
      }
    }
    m.court = cNum;
    PB.state.save();
    PB.app.toast(m.court ? `Đã xếp vào Sân ${m.court}` : "Đã bỏ xếp sân");
  },

  async editScorePrompt(matchId) {
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (!m) return;
    const input = await PB.ui.prompt(
      `${PB.state.getTeamName(m.teamA)} vs ${PB.state.getTeamName(m.teamB)}\nNhập theo định dạng: điểmA-điểmB (VD: 11-8)`,
      `${m.scoreA}-${m.scoreB}`,
      "Cập nhật tỷ số thủ công"
    );
    if (!input) return;
    const parts = input.split("-").map((x) => Number(x.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return PB.ui.alert("Sai định dạng tỷ số (VD đúng: 11-8).");

    m.scoreA = parts[0];
    m.scoreB = parts[1];
    m.sets = [{ a: m.scoreA, b: m.scoreB }];
    m.status = "finished";
    m.winner = m.scoreA >= m.scoreB ? "A" : "B";
    m.setsA = m.winner === "A" ? 1 : 0;
    m.setsB = m.winner === "B" ? 1 : 0;
    m.logs.unshift(`[${PB.rules.nowTime()}] BTC cập nhật thủ công tỷ số: ${m.scoreA}-${m.scoreB}`);
    PB.bracket.onMatchFinished(m);
    PB.state.save();
    PB.app.toast("Đã cập nhật tỷ số thủ công!");
  },

  saveSettings() {
    const d = PB.state.data;
    d.tournamentName = document.getElementById("cfgName").value.trim() || "Giải Pickleball";
    d.settings = {
      category: document.getElementById("cfgCategory").value,
      scoringMode: document.getElementById("cfgScoring").value,
      targetPoints: Number(document.getElementById("cfgTarget").value),
      bestOf: Number(document.getElementById("cfgBestOf").value),
      winByTwo: document.getElementById("cfgWinByTwo").value === "true",
      switchPoint: Number(document.getElementById("cfgSwitch").value) || 6,
      numCourts: Number(document.getElementById("cfgCourts").value) || 4,
      knockoutMode: document.getElementById("cfgKoMode").value
    };
    PB.state.save();
    PB.app.toast("Đã lưu cấu hình điều lệ!");
  },

  async savePasswords() {
    const refP = document.getElementById("cfgRefPass").value.trim();
    const admP = document.getElementById("cfgAdminPass").value.trim();
    if (!refP && !admP) return PB.ui.alert("Vui lòng nhập ít nhất 1 mật khẩu mới để cập nhật.");
    if (refP) PB.state.data.passwords.referee = refP;
    if (admP) PB.state.data.passwords.admin = admP;
    PB.state.save();
    PB.app.toast("Đã cập nhật mật khẩu mới!");
  },

  exportCsv() {
    const rows = [["Vong", "San", "Doi A", "Diem A", "Diem B", "Doi B", "Trang thai"]];
    PB.state.data.matches.forEach((m) => {
      rows.push([
        m.roundName,
        m.court || "",
        PB.state.getTeamName(m.teamA),
        m.scoreA,
        m.scoreB,
        PB.state.getTeamName(m.teamB),
        m.status
      ]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ket-qua-pickleball.csv";
    a.click();
  }
};
