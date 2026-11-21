/* =========================================================
   js/state.js
   - Quản lý cấu trúc dữ liệu giải đấu (Đôi & Đồng đội)
   - Tự động đồng bộ Firebase Realtime / LocalStorage
   ========================================================= */
window.PB = window.PB || {};

PB.state = {
  isCloud: false,
  dbRef: null,
  data: null,
  listeners: [],

  createDefaultData() {
    return {
      tournamentName: "Giải Pickleball CLB Bính Dần 1986",
      passwords: { ...PB.config.defaultPasswords },
      settings: {
        category: "doubles",       // 'doubles' | 'team'
        scoringMode: "sideout",    // 'sideout' | 'rally' (áp dụng cho Đôi)
        targetPoints: 11,          // 11 | 15 (cho Đôi)
        winByTwo: true,            // cho Đôi
        bestOf: 1,                 // 1 | 3 (cho Đôi)
        switchPoint: 6,            // cho Đôi
        numCourts: 4,
        knockoutMode: "serieAB"    // 'single' | 'serieAB'
      },
      // team: { id, name, group, seed, rating, roster: [{ name, gender: 'M'|'F' }] }
      teams: [],
      matches: []
    };
  },

  init(onReady) {
    const cfg = PB.config.firebaseConfig;
    const hasFirebase = cfg && cfg.apiKey && cfg.databaseURL && typeof firebase !== "undefined";

    if (hasFirebase) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        this.dbRef = firebase.database().ref(PB.config.dbPath);
        this.isCloud = true;
        this.dbRef.on("value", (snap) => {
          const val = snap.val();
          if (val) {
            this.data = this._normalize(val);
          } else {
            this.data = this.createDefaultData();
            this.save();
          }
          this.notify();
          if (onReady) { onReady(); onReady = null; }
        });
        return;
      } catch (err) {
        console.error("Firebase init failed, fallback to Local:", err);
      }
    }

    this.isCloud = false;
    const raw = localStorage.getItem(PB.config.localStorageKey);
    if (raw) {
      try { this.data = this._normalize(JSON.parse(raw)); }
      catch { this.data = this.createDefaultData(); }
    } else {
      this.data = this.createDefaultData();
    }

    window.addEventListener("storage", (e) => {
      if (e.key === PB.config.localStorageKey && e.newValue) {
        this.data = this._normalize(JSON.parse(e.newValue));
        this.notify();
      }
    });

    this.notify();
    if (onReady) onReady();
  },

  _normalize(val) {
    const def = this.createDefaultData();
    const merged = {
      ...def,
      ...val,
      passwords: { ...def.passwords, ...(val.passwords || {}) },
      settings: { ...def.settings, ...(val.settings || {}) },
      teams: Array.isArray(val.teams) ? val.teams : Object.values(val.teams || {}),
      matches: Array.isArray(val.matches) ? val.matches : Object.values(val.matches || {})
    };
    merged.teams.forEach((t) => {
      if (!t.roster) t.roster = [];
    });
    merged.matches.forEach((m) => {
      if (!m.sets) m.sets = [];
      if (!m.history) m.history = [];
      if (!m.logs) m.logs = [];
      if (!m.timeouts) m.timeouts = { A: 2, B: 2 };
      if (!m.fouls) m.fouls = { A: 0, B: 0 };
      if (m.matchType === "team") {
        if (!m.subMatches) m.subMatches = PB.rules.createDefaultSubMatches();
        m.subMatches.forEach((sm) => {
          if (!sm.history) sm.history = [];
          if (!sm.logs) sm.logs = [];
          if (!sm.timeouts) sm.timeouts = { A: 2, B: 2 };
        });
        if (!m.singlesOrder) m.singlesOrder = { A: [], B: [] };
        if (m.dreambreaker && !m.dreambreaker.history) m.dreambreaker.history = [];
      }
    });
    return merged;
  },

  save() {
    if (!this.data) return;
    // Cập nhật giao diện tức thì (Optimistic UI) để trọng tài bấm nhạy 0ms
    this.notify();
    try {
      const cleanData = JSON.parse(JSON.stringify(this.data));
      if (this.isCloud && this.dbRef) {
        this.dbRef.set(cleanData).catch((e) => console.error("Firebase set error:", e));
      } else {
        localStorage.setItem(PB.config.localStorageKey, JSON.stringify(cleanData));
      }
    } catch (err) {
      console.error("State save error:", err);
    }
  },

  // Lấy danh sách tên từng VĐV tham gia trong 1 trận đấu
  getMatchPlayerNames(match) {
    const names = new Set();
    if (!match) return names;
    const addFromTeam = (tid) => {
      if (!tid) return;
      const t = this.getTeam(tid);
      if (!t) return;
      names.add("TEAM:" + tid);
      if (t.roster && t.roster.length) {
        t.roster.forEach((p) => { if (p.name) names.add(p.name.trim().toLowerCase()); });
      } else if (t.name) {
        t.name.split(/[\/,&\-]+/).forEach((part) => {
          const clean = part.trim().toLowerCase();
          if (clean.length >= 2) names.add(clean);
        });
      }
    };
    addFromTeam(match.teamA);
    addFromTeam(match.teamB);
    return names;
  },

  // Kiểm tra xem trận này có VĐV / Đội nào đang thi đấu LIVE ở sân khác không
  findLiveConflict(targetMatchId) {
    const target = this.data.matches.find((m) => m.id === targetMatchId);
    if (!target) return null;
    const targetPlayers = this.getMatchPlayerNames(target);
    const liveOthers = this.data.matches.filter((m) => m.id !== targetMatchId && m.status === "live");

    for (const other of liveOthers) {
      const otherPlayers = this.getMatchPlayerNames(other);
      for (const p of targetPlayers) {
        if (otherPlayers.has(p)) {
          const display = p.startsWith("TEAM:") ? this.getTeamName(p.slice(5)) : p.toUpperCase();
          return {
            match: other,
            court: other.court || "?",
            who: display
          };
        }
      }
    }
    return null;
  },

  // Kiểm tra xung đột khi xếp sân thủ công (trùng sân đang bận hoặc trùng VĐV ở sân khác)
  findCourtConflict(targetMatchId, courtNum) {
    const target = this.data.matches.find((m) => m.id === targetMatchId);
    if (!target) return null;
    const cNum = Number(courtNum);
    const targetPlayers = this.getMatchPlayerNames(target);
    const activeOthers = this.data.matches.filter((m) =>
      m.id !== targetMatchId && (m.status === "live" || (m.status === "pending" && Number(m.court) > 0))
    );

    for (const other of activeOthers) {
      if (cNum > 0 && Number(other.court) === cNum) {
        return {
          type: "court",
          court: cNum,
          who: `${this.getTeamName(other.teamA)} vs ${this.getTeamName(other.teamB)}`
        };
      }
      const otherPlayers = this.getMatchPlayerNames(other);
      for (const p of targetPlayers) {
        if (otherPlayers.has(p)) {
          const display = p.startsWith("TEAM:") ? this.getTeamName(p.slice(5)) : p.toUpperCase();
          return {
            type: "player",
            court: other.court || "?",
            who: display
          };
        }
      }
    }
    return null;
  },

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach((fn) => fn(this.data));
  },

  getTeam(teamId) {
    if (!teamId || !this.data) return null;
    return this.data.teams.find((x) => x.id === teamId) || null;
  },

  getTeamName(teamId) {
    if (!teamId) return "Chờ xác định";
    const t = this.getTeam(teamId);
    return t ? t.name : "TBD";
  },

  loadSampleData(category = "doubles") {
    const d = this.createDefaultData();
    d.settings.category = category;

    if (category === "team") {
      d.tournamentName = "Giải Đồng Đội Pickleball Bính Dần 1986";
      d.settings.knockoutMode = "single";
      const sampleTeams = [
        { name: "CLB Bính Dần A", group: "A", roster: [
          { name: "Hùng", gender: "M" }, { name: "Nam", gender: "M" }, { name: "Dũng", gender: "M" },
          { name: "Dương", gender: "F" }, { name: "Hạnh", gender: "F" }, { name: "Lý", gender: "F" }
        ]},
        { name: "CLB Độc Lập", group: "A", roster: [
          { name: "Minh", gender: "M" }, { name: "Tuấn", gender: "M" }, { name: "Quang", gender: "M" },
          { name: "Thư", gender: "F" }, { name: "Mai", gender: "F" }, { name: "Lan", gender: "F" }
        ]},
        { name: "CLB Thục Phán", group: "A", roster: [
          { name: "Sơn", gender: "M" }, { name: "Tùng", gender: "M" }, { name: "Hải", gender: "M" },
          { name: "Hoa", gender: "F" }, { name: "Ngọc", gender: "F" }, { name: "Trang", gender: "F" }
        ]},
        { name: "CLB Cao Bằng Pro", group: "B", roster: [
          { name: "Long", gender: "M" }, { name: "Việt", gender: "M" }, { name: "Khánh", gender: "M" },
          { name: "Linh", gender: "F" }, { name: "Hà", gender: "F" }, { name: "Vy", gender: "F" }
        ]},
        { name: "CLB Hòa An", group: "B", roster: [
          { name: "Đức", gender: "M" }, { name: "Hiếu", gender: "M" }, { name: "Phong", gender: "M" },
          { name: "Thảo", gender: "F" }, { name: "Phương", gender: "F" }, { name: "Nhi", gender: "F" }
        ]},
        { name: "CLB Non Nước", group: "B", roster: [
          { name: "Kiên", gender: "M" }, { name: "Cường", gender: "M" }, { name: "Thành", gender: "M" },
          { name: "Yến", gender: "F" }, { name: "Oanh", gender: "F" }, { name: "My", gender: "F" }
        ]}
      ];
      d.teams = sampleTeams.map((t, i) => ({ id: "T" + (i + 1), seed: 0, rating: "", ...t }));
      this.data = d;
      PB.bracket.generateGroupMatches();
      if (this.data.matches.length > 0) {
        this.data.matches[0].court = 1;
        this.data.matches[0].status = "live";
      }
      this.save();
    } else {
      const names = [
        "Hùng / Dương", "Nam / Khánh", "Dũng / Hạnh", "Lý / Thư",
        "Minh / Tuấn", "Quang / Hải", "Sơn / Tùng", "Long / Việt"
      ];
      d.teams = names.map((name, i) => ({
        id: "T" + (i + 1),
        name,
        group: i < 4 ? "A" : "B",
        seed: i < 2 ? i + 1 : 0,
        rating: (2.8 + (i % 4) * 0.2).toFixed(1),
        roster: []
      }));
      this.data = d;
      PB.bracket.generateGroupMatches();
      // Lấy 2 trận đầu tiên đã được xếp sân không trùng VĐV để mở Live mẫu
      const assigned = this.data.matches.filter((m) => m.court > 0 && m.teamA && m.teamB);
      if (assigned[0]) {
        assigned[0].status = "live";
        assigned[0].scoreA = 5;
        assigned[0].scoreB = 4;
      }
      if (assigned[1]) {
        assigned[1].status = "live";
        assigned[1].scoreA = 7;
        assigned[1].scoreB = 6;
      }
      PB.bracket.autoAssignCourts();
      this.save();
    }
  }
};
