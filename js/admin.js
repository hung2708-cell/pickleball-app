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

    if (PB.pro) PB.pro.renderAdminDashboardHeader();
    this.renderTeamsSub();
    this.renderScheduleSub();
    this.renderSettingsSub();
    if (PB.pro) PB.pro.renderAdminProSub();
  },

  switchSubTab(tab, silent = false) {
    this.subTab = tab;
    if (!silent && PB.app.saveUiState) PB.app.saveUiState({ adminSubTab: tab });
    document.querySelectorAll("[data-admintab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.admintab === tab);
    });
    ["teams", "schedule", "settings", "pro"].forEach((t) => {
      document.getElementById(`admin-sub-${t}`).classList.toggle("hidden", t !== tab);
    });
  },

  renderTeamsSub() {
    const teams = PB.state.data.teams;
    const isTeamMode = PB.state.data.settings.category === "team";
    const el = document.getElementById("admin-sub-teams");
    el.innerHTML = `
      <div class="card">
        <div class="section-header">
          <h3>Thêm VĐV / Cặp đấu mới</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" onclick="PB.admin.loadSample('doubles')">Mẫu Đôi (8 cặp)</button>
            <button class="btn btn-sm btn-warning" onclick="PB.admin.loadSample('team')">Mẫu Đồng đội (6 đội)</button>
          </div>
        </div>

        <div class="form-grid" style="margin-bottom:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label>${isTeamMode ? "Tên Đội / CLB *" : "Tên VĐV / Cặp đấu *"}</label>
            <input type="text" id="addTeamName" class="input" placeholder="${isTeamMode ? "VD: CLB Bính Dần A" : "VD: Hùng / Dương"}" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>CLB</label>
            <input type="text" id="addTeamClub" class="input" placeholder="VD: CLB Bính Dần 1986" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Giới tính</label>
            <select id="addTeamGender" class="input">
              <option value="Nam Nữ">Nam Nữ</option>
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
              <option value="Đồng đội">Đồng đội (Nam & Nữ)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Trình (Rating)</label>
            <select id="addTeamRating" class="input">
              <option value="2.5">2.5 (Cơ bản)</option>
              <option value="2.8">2.8 (Khá cơ bản)</option>
              <option value="3.0" selected>3.0 (Trung bình)</option>
              <option value="3.2">3.2 (Trung bình khá)</option>
              <option value="3.5">3.5 (Khá)</option>
              <option value="3.8">3.8 (Khá giỏi)</option>
              <option value="4.0">4.0 (Giỏi)</option>
              <option value="4.5+">4.5+ (Open)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Xếp vào Bảng</label>
            <select id="addTeamGroup" class="input">
              <option value="A">Bảng A</option>
              <option value="B">Bảng B</option>
              <option value="C">Bảng C</option>
              <option value="D">Bảng D</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="PB.admin.addSingleTeam()">+ Thêm vào danh sách</button>

        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;" />

        <div class="form-group">
          <label>Import danh sách VĐV có sẵn từ Excel (.xlsx / .csv):</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <a href="mau-danh-sach-vdv.xlsx" download="mau-danh-sach-vdv.xlsx" class="btn btn-sm btn-secondary" style="text-decoration:none;">⬇ Tải file mẫu Excel (.xlsx)</a>
            <label class="btn btn-sm btn-success" style="margin:0;cursor:pointer;">
              <span>⬆ Import file Excel / CSV</span>
              <input type="file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="PB.admin.importExcelFile(this)" />
            </label>
            <span class="muted" style="font-size:0.76rem;">File mẫu đã có sẵn menu chọn Giới tính, Trình & Bảng</span>
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;" />

        <div class="form-group">
          <label>Hoặc dán nhanh danh sách từ Zalo / Excel (Định dạng: <strong>Tên - CLB - Giới tính - Trình</strong>):</label>
          <textarea id="bulkTeamsInput" rows="3" placeholder="Mỗi dòng 1 đội/cặp:&#10;Hùng / Dương - CLB Bính Dần - Nam Nữ - 3.2&#10;Nam / Khánh - CLB Độc Lập - Nam - 3.0&#10;Lý / Thư - CLB Thục Phán - Nữ - 2.8"></textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-secondary" onclick="PB.admin.addBulkTeams()">+ Dán thêm hàng loạt</button>
          <select id="autoGroupCount" class="input-sm">
            <option value="2">Chia đều 2 bảng (A, B)</option>
            <option value="4">Chia đều 4 bảng (A, B, C, D)</option>
            <option value="1">Gộp 1 bảng (A)</option>
          </select>
          <button class="btn btn-warning" onclick="PB.admin.autoDrawGroups()">Bốc thăm chia bảng</button>
        </div>
      </div>

      ${teams.length ? (() => {
        const gMap = {};
        teams.forEach((t) => {
          const g = t.group || "A";
          if (!gMap[g]) gMap[g] = [];
          gMap[g].push(t);
        });
        const gKeys = Object.keys(gMap).sort();
        return `
          <div class="card">
            <div class="section-header">
              <h3>Phân chia vòng bảng (${gKeys.length} bảng)</h3>
              <button class="btn btn-sm btn-success" onclick="PB.admin.generateGroupSchedule()">Tạo lịch vòng bảng</button>
            </div>
            <div class="admin-groups-grid">
              ${gKeys.map((g) => `
                <div class="admin-group-box">
                  <div class="admin-group-head">
                    <strong>Bảng ${g}</strong>
                    <span class="badge badge-wait">${gMap[g].length} đội</span>
                  </div>
                  <div class="admin-group-list">
                    ${gMap[g].map((t, idx) => `
                      <div class="admin-group-row">
                        <span class="admin-group-team">${idx + 1}. <strong>${PB.app.escape(t.name)}</strong></span>
                        <select class="input-sm" style="padding:3px 6px;font-size:0.76rem;" onchange="PB.admin.changeTeamGroup('${t.id}', this.value)">
                          ${["A", "B", "C", "D"].map((opt) => `<option value="${opt}" ${t.group === opt ? "selected" : ""}>Bảng ${opt}</option>`).join("")}
                        </select>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      })() : ""}

      <div class="card">
        <div class="section-header">
          <h3>Danh sách đã đăng ký (${teams.length} đội)</h3>
          <button class="btn btn-sm btn-danger" onclick="PB.admin.clearAllTeams()">Xóa hết đội</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tên đội / Cặp VĐV</th>
                <th>CLB</th>
                <th>Giới tính</th>
                <th>Trình</th>
                <th>Bảng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${teams.length ? teams.map((t, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${PB.app.escape(t.name)}</strong></td>
                  <td>${PB.app.escape(t.club || "-")}</td>
                  <td>${PB.app.escape(t.gender || (isTeamMode ? "Đồng đội" : "-"))}</td>
                  <td>${t.rating ? `<span class="badge-rating">${PB.app.escape(t.rating)}</span>` : "-"}</td>
                  <td>
                    <select class="input-sm" onchange="PB.admin.changeTeamGroup('${t.id}', this.value)">
                      ${["A", "B", "C", "D"].map((g) => `<option value="${g}" ${t.group === g ? "selected" : ""}>Bảng ${g}</option>`).join("")}
                    </select>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px;">
                      ${isTeamMode ? `<button class="btn btn-sm btn-secondary" onclick="PB.admin.editRosterPrompt('${t.id}')">VĐV (${(t.roster||[]).length})</button>` : ""}
                      <button class="btn btn-sm btn-danger" onclick="PB.admin.deleteTeam('${t.id}')">Xóa</button>
                    </div>
                  </td>
                </tr>
              `).join("") : `<tr><td colspan="7" class="muted text-center">Chưa có đội nào.</td></tr>`}
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
          <button class="btn btn-warning" onclick="PB.admin.autoAssignNow()">Tự động xếp sân trống</button>
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

  addSingleTeam() {
    const name = (document.getElementById("addTeamName")?.value || "").trim();
    const club = (document.getElementById("addTeamClub")?.value || "").trim();
    const gender = (document.getElementById("addTeamGender")?.value || "").trim();
    const rating = (document.getElementById("addTeamRating")?.value || "").trim();
    const group = (document.getElementById("addTeamGroup")?.value || "A").trim();
    if (!name) return PB.app.toast("Vui lòng nhập Tên VĐV / Cặp đấu.");
    PB.state.data.teams.push({
      id: "T" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name, club, gender, rating,
      group, seed: 0, roster: []
    });
    PB.state.save();
    PB.app.toast(`Đã thêm ${name} vào Bảng ${group}!`);
  },

  async importExcelFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (typeof XLSX === "undefined") {
      return PB.ui.alert("Chưa tải được thư viện đọc Excel. Vui lòng kiểm tra kết nối mạng và thử lại.");
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rows || rows.length < 2) {
        return PB.ui.alert("File không có dữ liệu VĐV nào (cần ít nhất 1 dòng dữ liệu dưới dòng tiêu đề).");
      }

      let added = 0;
      const parseRoster = (str) => String(str || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const isF = /nữ|nu|\(f\)/i.test(s);
        return { name: s.replace(/\(.*?\)/g, "").trim(), gender: isF ? "F" : "M" };
      });

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        // Hỗ trợ cả file mẫu có cột STT ở cột 0 hoặc file không có cột STT
        const hasStt = !isNaN(Number(r[0])) && String(r[1] || "").trim().length > 0;
        const offset = hasStt ? 1 : 0;
        const name = String(r[offset] || "").trim();
        if (!name) continue;
        const club = String(r[offset + 1] || "").trim();
        const gender = String(r[offset + 2] || "Nam Nữ").trim();
        const rating = String(r[offset + 3] || "3.0").trim();
        const rawGroup = String(r[offset + 4] || "A").trim().toUpperCase().replace(/^BẢNG\s*/i, "");
        const group = ["A", "B", "C", "D"].includes(rawGroup) ? rawGroup : "A";
        const rosterStr = String(r[offset + 5] || "").trim();

        PB.state.data.teams.push({
          id: "T" + Date.now() + "_" + i + "_" + Math.floor(Math.random() * 999),
          name,
          club,
          gender,
          rating,
          group,
          seed: 0,
          roster: rosterStr ? parseRoster(rosterStr) : []
        });
        added++;
      }

      input.value = "";
      if (!added) return PB.ui.alert("Không tìm thấy dòng VĐV hợp lệ nào trong file.");
      PB.state.save();
      PB.app.toast(`Đã import thành công ${added} đội/VĐV từ file Excel!`);
    } catch (err) {
      input.value = "";
      PB.ui.alert("Lỗi đọc file Excel/CSV. Vui lòng dùng đúng file mẫu .xlsx.");
    }
  },

  addBulkTeams() {
    const raw = document.getElementById("bulkTeamsInput").value;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return PB.app.toast("Vui lòng nhập ít nhất 1 dòng.");
    lines.forEach((line) => {
      const parts = line.split("-").map((s) => s.trim());
      const name = parts[0] || "";
      let club = "", gender = "", rating = "";
      if (parts.length === 2) {
        rating = parts[1];
      } else if (parts.length === 3) {
        club = parts[1]; rating = parts[2];
      } else if (parts.length >= 4) {
        club = parts[1]; gender = parts[2]; rating = parts[3];
      }
      if (!name) return;
      PB.state.data.teams.push({
        id: "T" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        name, club, gender, rating,
        group: "A", seed: 0, roster: []
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
    teams.sort((a, b) => (a.group || "A").localeCompare(b.group || "A"));
    PB.state.data.teams = teams;
    PB.state.save();
    PB.app.toast(`Đã tự động chia đều vào ${count} bảng!`);
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
    if (!(await PB.ui.confirm("Toàn bộ danh sách VĐV/đội, lịch thi đấu, đơn đăng ký và BXH trình CLB cũ sẽ bị xóa sạch.", "Xóa sạch dữ liệu VĐV cũ", true))) return;
    PB.state.data.teams = [];
    PB.state.data.matches = [];
    PB.state.data.registrations = [];
    PB.state.data.clubRanking = [];
    PB.state.save();
    PB.app.toast("Đã xóa sạch toàn bộ dữ liệu VĐV cũ!");
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

  autoAssignNow() {
    PB.bracket.syncGroupWinnersToBracket(false);
    PB.bracket.autoAssignCourts();
    PB.state.save();
    PB.app.toast("Đã tự động xếp các trận đủ đội vào sân trống (không trùng VĐV)!");
  },

  async assignCourt(matchId, courtNum) {
    const m = PB.state.data.matches.find((x) => x.id === matchId);
    if (!m) return;
    const cNum = Number(courtNum);
    if (cNum > 0) {
      const conflict = PB.state.findCourtConflict(matchId, cNum);
      if (conflict) {
        const msg = conflict.type === "court"
          ? `Sân ${cNum} hiện đang được xếp cho trận [${conflict.who}].`
          : `Không thể xếp vào Sân ${cNum} vì VĐV/Đội [${conflict.who}] đang có lịch tại Sân ${conflict.court}. VĐV không thể đánh 2 sân cùng lúc.`;
        await PB.ui.alert(msg, "Trùng sân / VĐV");
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
    PB.bracket.autoAssignCourts();
    PB.state.save();
    PB.app.toast("Đã lưu điều lệ & tự động xếp sân!");
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
