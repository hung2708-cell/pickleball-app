/* =========================================================
   js/state.js
   - Quản lý cấu trúc dữ liệu giải đấu & đồng bộ Firebase / Local
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
        category: "doubles",       // doubles | team
        scoringMode: "sideout",    // sideout | rally
        targetPoints: 11,          // 11 | 15
        winByTwo: true,            // true = thắng cách 2 | false = chạm điểm cứng
        bestOf: 1,                 // 1 | 3
        switchPoint: 6,            // Điểm đổi sân (6 cho set 11, 8 cho set 15)
        numCourts: 4,              // Số sân thi đấu
        knockoutMode: "serieAB"    // single | serieAB
      },
      teams: [],   // { id, name, group, seed }
      matches: []  // Xem cấu trúc match ở PB.rules.createMatch
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

    // Fallback chế độ LocalStorage
    this.isCloud = false;
    const raw = localStorage.getItem(PB.config.localStorageKey);
    if (raw) {
      try {
        this.data = this._normalize(JSON.parse(raw));
      } catch {
        this.data = this.createDefaultData();
      }
    } else {
      this.data = this.createDefaultData();
    }

    // Đồng bộ giữa các tab trình duyệt khi test local
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
    merged.matches.forEach((m) => {
      if (!m.sets) m.sets = [];
      if (!m.history) m.history = [];
      if (!m.logs) m.logs = [];
      if (!m.timeouts) m.timeouts = { A: 2, B: 2 };
      if (!m.fouls) m.fouls = { A: 0, B: 0 };
    });
    return merged;
  },

  save() {
    if (!this.data) return;
    if (this.isCloud && this.dbRef) {
      this.dbRef.set(this.data);
    } else {
      localStorage.setItem(PB.config.localStorageKey, JSON.stringify(this.data));
      this.notify();
    }
  },

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach((fn) => fn(this.data));
  },

  getTeamName(teamId) {
    if (!teamId) return "Chờ xác định";
    const t = this.data.teams.find((x) => x.id === teamId);
    return t ? t.name : "TBD";
  },

  loadSampleData() {
    const d = this.createDefaultData();
    const names = [
      "Hùng / Dương", "Nam / Khánh", "Dũng / Hạnh", "Lý / Thư",
      "Minh / Tuấn", "Quang / Hải", "Sơn / Tùng", "Long / Việt"
    ];
    d.teams = names.map((name, i) => ({
      id: "T" + (i + 1),
      name,
      group: i < 4 ? "A" : "B",
      seed: i < 2 ? i + 1 : 0
    }));
    this.data = d;
    PB.bracket.generateGroupMatches();
    // Gán sẵn 2 trận vào sân 1 và sân 2 để test live ngay
    if (this.data.matches.length >= 2) {
      this.data.matches[0].court = 1;
      this.data.matches[0].status = "live";
      this.data.matches[0].scoreA = 5;
      this.data.matches[0].scoreB = 4;
      this.data.matches[1].court = 2;
      this.data.matches[1].status = "live";
      this.data.matches[1].scoreA = 7;
      this.data.matches[1].scoreB = 6;
    }
    this.save();
  }
};
