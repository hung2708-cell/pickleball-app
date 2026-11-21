/* =========================================================
   js/rules.js
   - Luật Đôi (Doubles): Side-out (0-0-2) / Rally, BO1/BO3, đổi sân, Timeout, Lỗi KT
   - Luật Đồng đội (Team):
     + 4 trận đôi: 1. Đôi nữ | 2. Đôi nam | 3. Đôi nam nữ 1 | 4. Đôi nam nữ 2
     + Mỗi VĐV tối đa 02 trận đôi trong 1 cuộc đối đầu
     + Vòng bảng: 4 trận, chạm 15 điểm, 8 điểm đổi sân
     + Vòng loại trực tiếp: chạm 15 điểm, 14-14 cách 2 điểm, max 18 điểm, 8 điểm đổi sân
     + Hòa 2-2 (loại trực tiếp): 01 trận Đơn ăn điểm trực tiếp (Rally),
       theo thứ tự đăng ký Nam gặp Nam / Nữ gặp Nữ, xoay tua mỗi 4 điểm, 11 điểm đổi sân, chạm 21 điểm.
     + Bỏ cuộc đôi: 15-0 | Bỏ cuộc đội: 4-0 (0 điểm BXH)
   ========================================================= */
window.PB = window.PB || {};

PB.rules = {

  isTeamSubReached(tie, sm) {
    if (!sm) return false;
    if (sm.status === "finished") return true;
    const isKnockout = tie.stage !== "group";
    const maxS = Math.max(sm.scoreA, sm.scoreB);
    const diff = Math.abs(sm.scoreA - sm.scoreB);
    return !isKnockout ? (maxS >= 15) : ((maxS >= 15 && diff >= 2) || maxS >= 18);
  },

  isDoublesSetReached(m, settings) {
    if (!m) return false;
    if (m.status === "finished") return true;
    const target = Number(settings.targetPoints) || 11;
    const winByTwo = !!settings.winByTwo;
    const maxS = Math.max(m.scoreA, m.scoreB);
    const diff = Math.abs(m.scoreA - m.scoreB);
    return maxS >= target && (!winByTwo || diff >= 2);
  },

  nowTime() {
    return new Date().toTimeString().slice(0, 8);
  },

  createDefaultSubMatches() {
    return [
      { idx: 0, code: "WD", label: "Trận 1: Đôi Nữ", reqGender: ["F", "F"], playersA: ["", ""], playersB: ["", ""], scoreA: 0, scoreB: 0, server: "A", serverNum: 2, swapped: false, switchedAlerted: false, timeouts: { A: 2, B: 2 }, status: "pending", winner: null, finishReason: "", history: [], logs: [] },
      { idx: 1, code: "MD", label: "Trận 2: Đôi Nam", reqGender: ["M", "M"], playersA: ["", ""], playersB: ["", ""], scoreA: 0, scoreB: 0, server: "A", serverNum: 2, swapped: false, switchedAlerted: false, timeouts: { A: 2, B: 2 }, status: "pending", winner: null, finishReason: "", history: [], logs: [] },
      { idx: 2, code: "XD1", label: "Trận 3: Đôi Nam Nữ 1", reqGender: ["M", "F"], playersA: ["", ""], playersB: ["", ""], scoreA: 0, scoreB: 0, server: "A", serverNum: 2, swapped: false, switchedAlerted: false, timeouts: { A: 2, B: 2 }, status: "pending", winner: null, finishReason: "", history: [], logs: [] },
      { idx: 3, code: "XD2", label: "Trận 4: Đôi Nam Nữ 2", reqGender: ["M", "F"], playersA: ["", ""], playersB: ["", ""], scoreA: 0, scoreB: 0, server: "A", serverNum: 2, swapped: false, switchedAlerted: false, timeouts: { A: 2, B: 2 }, status: "pending", winner: null, finishReason: "", history: [], logs: [] }
    ];
  },

  createDreambreaker() {
    return {
      status: "pending", // pending | live | finished
      scoreA: 0,
      scoreB: 0,
      server: "A",
      swapped: false,
      switchedAlerted: false,
      winner: null,
      history: [],
      logs: []
    };
  },

  createMatch({ id, stage, group, roundName, teamA, teamB, court = 0, nextMatchId = null, nextSlot = null, matchType = null, labelA = '', labelB = '', sourceA = null, sourceB = null, roundOrder = 0 }) {
    const type = matchType || (PB.state.data?.settings?.category === "team" ? "team" : "doubles");
    const base = {
      id,
      matchType: type, // 'doubles' | 'team'
      stage,           // 'group' | 'serieA' | 'serieB' | 'knockout'
      group: group || "",
      roundName: roundName || "",
      teamA: teamA || null,
      teamB: teamB || null,
      court,
      status: "pending",
      scoreA: 0,       // Với đồng đội: số trận thắng (0..4, hoặc 3-2 nếu thắng đơn)
      scoreB: 0,
      setsA: 0,
      setsB: 0,
      sets: [],
      server: "A",
      serverNum: 2,
      swapped: false,
      switchedAlerted: false,
      timeouts: { A: 2, B: 2 },
      fouls: { A: 0, B: 0 },
      winner: null,    // 'A' | 'B' | 'DRAW' (hòa 2-2 vòng bảng đồng đội)
      finishReason: "",
      forfeitSide: null, // 'A' | 'B' nếu bỏ cuộc cả đội
      nextMatchId,
      nextSlot,
      labelA,
      labelB,
      sourceA,
      sourceB,
      roundOrder,
      history: [],
      logs: []
    };

    if (type === "team") {
      base.lineupLocked = false;
      base.subMatches = this.createDefaultSubMatches();
      base.singlesOrder = { A: [], B: [] }; // [{ name, gender }]
      base.dreambreaker = this.createDreambreaker();
    }
    return base;
  },

  // Kiểm tra luật: Mỗi VĐV tối đa 02 trận trong 4 trận đôi
  validateTeamLineup(subMatches, side) {
    const counts = {};
    const key = side === "A" ? "playersA" : "playersB";
    subMatches.forEach((sm) => {
      const pair = sm[key] || [];
      pair.forEach((p) => {
        const name = (p || "").trim();
        if (!name) return;
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    const violations = Object.entries(counts).filter(([, c]) => c > 2);
    return {
      ok: violations.length === 0,
      counts,
      violations // [[name, count], ...]
    };
  },

  // Điểm số và luật kết thúc cho từng trận con Đồng đội
  addTeamSubPoint(tie, subIdx, side) {
    const sm = tie.subMatches[subIdx];
    if (!sm || sm.status === "finished" || this.isTeamSubReached(tie, sm)) return { event: "locked" };
    if (tie.status === "pending") tie.status = "live";
    if (sm.status === "pending") sm.status = "live";

    // Side-out chuẩn đôi
    if (sm.server !== side) return { event: "not_serving" };

    sm.history.push({
      scoreA: sm.scoreA, scoreB: sm.scoreB, server: sm.server, serverNum: sm.serverNum,
      switchedAlerted: sm.switchedAlerted, status: sm.status, winner: sm.winner
    });
    if (side === "A") sm.scoreA += 1;
    else sm.scoreB += 1;
    sm.logs.unshift(`[${this.nowTime()}] +1 điểm Đội ${side} (${sm.scoreA}-${sm.scoreB})`);

    // Đổi sân ở điểm 8
    let needSwitchAlert = false;
    if (!sm.switchedAlerted && (sm.scoreA === 8 || sm.scoreB === 8)) {
      sm.switchedAlerted = true;
      needSwitchAlert = true;
      sm.logs.unshift(`[${this.nowTime()}] 🔄 Chạm điểm 8 — Đổi sân`);
    }

    // Kiểm tra kết thúc trận con:
    // - Vòng bảng: chạm 15 điểm cứng
    // - Loại trực tiếp: chạm 15, nếu 14-14 thì cách 2 điểm, max 18 điểm
    const isKnockout = tie.stage !== "group";
    const maxS = Math.max(sm.scoreA, sm.scoreB);
    const diff = Math.abs(sm.scoreA - sm.scoreB);
    let won = false;
    if (!isKnockout) {
      won = maxS >= 15;
    } else {
      won = (maxS >= 15 && diff >= 2) || maxS >= 18;
    }

    if (won) {
      return { event: "sub_point_reached", winnerSide: sm.scoreA > sm.scoreB ? "A" : "B", needSwitchAlert };
    }
    return { event: "scored", needSwitchAlert };
  },

  sideOutTeamSub(tie, subIdx) {
    const sm = tie.subMatches[subIdx];
    if (!sm || sm.status === "finished") return;
    if (tie.status === "pending") tie.status = "live";
    if (sm.status === "pending") sm.status = "live";
    sm.history.push({
      scoreA: sm.scoreA, scoreB: sm.scoreB, server: sm.server, serverNum: sm.serverNum,
      switchedAlerted: sm.switchedAlerted, status: sm.status, winner: sm.winner
    });
    if (sm.serverNum === 1) {
      sm.serverNum = 2;
    } else {
      sm.server = sm.server === "A" ? "B" : "A";
      sm.serverNum = 1;
    }
    sm.logs.unshift(`[${this.nowTime()}] Đổi giao bóng (${sm.server}-${sm.serverNum})`);
  },

  undoTeamSub(tie, subIdx) {
    const sm = tie.subMatches[subIdx];
    if (!sm || !sm.history || !sm.history.length) return false;
    Object.assign(sm, sm.history.pop());
    this.recalcTeamTie(tie);
    return true;
  },

  confirmFinishTeamSub(tie, subIdx) {
    const sm = tie.subMatches[subIdx];
    if (!sm) return;
    sm.status = "finished";
    sm.winner = sm.scoreA >= sm.scoreB ? "A" : "B";
    sm.logs.unshift(`[${this.nowTime()}] 🏁 Chốt ${sm.label}: ${sm.scoreA}-${sm.scoreB}`);
    this.recalcTeamTie(tie);
  },

  // Bỏ cuộc 1 trận đôi -> tính 15-0
  forfeitTeamSub(tie, subIdx, winnerSide) {
    const sm = tie.subMatches[subIdx];
    if (!sm) return;
    sm.scoreA = winnerSide === "A" ? 15 : 0;
    sm.scoreB = winnerSide === "B" ? 15 : 0;
    sm.status = "finished";
    sm.winner = winnerSide;
    sm.finishReason = "Bỏ cuộc (15-0)";
    sm.logs.unshift(`[${this.nowTime()}] 🏳 Bỏ cuộc đôi -> ${sm.scoreA}-${sm.scoreB}`);
    this.recalcTeamTie(tie);
  },

  // Bỏ cuộc cả đội -> tính 4-0, mỗi trận 15-0, đội bỏ cuộc 0 điểm BXH
  forfeitEntireTeam(tie, winnerSide) {
    tie.subMatches.forEach((sm) => {
      sm.scoreA = winnerSide === "A" ? 15 : 0;
      sm.scoreB = winnerSide === "B" ? 15 : 0;
      sm.status = "finished";
      sm.winner = winnerSide;
      sm.finishReason = "Bỏ cuộc cả đội";
    });
    tie.scoreA = winnerSide === "A" ? 4 : 0;
    tie.scoreB = winnerSide === "B" ? 4 : 0;
    tie.status = "finished";
    tie.winner = winnerSide;
    tie.forfeitSide = winnerSide === "A" ? "B" : "A";
    tie.finishReason = "Bỏ cuộc cả đội (4-0)";
    tie.logs.unshift(`[${this.nowTime()}] 🏳 Đội ${tie.forfeitSide} bỏ cuộc toàn giải/trận -> ${tie.scoreA}-${tie.scoreB}`);
    PB.bracket.onMatchFinished(tie);
  },

  // Đơn Dreambreaker (Hòa 2-2 vòng loại trực tiếp): Ăn điểm trực tiếp (Rally), xoay tua mỗi 4 điểm, 11 điểm đổi sân, chạm 21
  addDreambreakerPoint(tie, side) {
    const db = tie.dreambreaker;
    if (!db || db.status === "finished") return { event: "locked" };
    if (db.status === "pending") db.status = "live";
    db.history.push({ scoreA: db.scoreA, scoreB: db.scoreB, server: db.server, switchedAlerted: db.switchedAlerted, status: db.status, winner: db.winner });

    if (side === "A") db.scoreA += 1;
    else db.scoreB += 1;
    db.server = side;

    const totalPts = db.scoreA + db.scoreB;
    const rotated = totalPts > 0 && totalPts % 4 === 0;
    let needSwitchAlert = false;
    if (!db.switchedAlerted && (db.scoreA === 11 || db.scoreB === 11)) {
      db.switchedAlerted = true;
      needSwitchAlert = true;
    }

    const maxS = Math.max(db.scoreA, db.scoreB);
    const diff = Math.abs(db.scoreA - db.scoreB);
    const won = maxS >= 21 && diff >= 2;
    return { event: won ? "db_point_reached" : "scored", rotated, needSwitchAlert, winnerSide: db.scoreA > db.scoreB ? "A" : "B" };
  },

  undoDreambreaker(tie) {
    const db = tie.dreambreaker;
    if (!db || !db.history.length) return false;
    Object.assign(db, db.history.pop());
    return true;
  },

  confirmFinishDreambreaker(tie) {
    const db = tie.dreambreaker;
    db.status = "finished";
    db.winner = db.scoreA >= db.scoreB ? "A" : "B";
    this.recalcTeamTie(tie);
  },

  // Tính lại tổng tỷ số 4 trận đôi (+ Dreambreaker nếu có)
  recalcTeamTie(tie) {
    if (tie.forfeitSide) return;
    let wA = 0, wB = 0, finishedCount = 0;
    tie.subMatches.forEach((sm) => {
      if (sm.status === "finished") {
        finishedCount++;
        if (sm.winner === "A") wA++;
        else if (sm.winner === "B") wB++;
      }
    });
    tie.scoreA = wA;
    tie.scoreB = wB;

    if (finishedCount < 4) {
      tie.status = finishedCount > 0 || tie.subMatches.some((s) => s.status === "live") ? "live" : "pending";
      tie.winner = null;
      return;
    }

    // Đủ 4 trận đôi
    if (tie.stage === "group") {
      // Vòng bảng: đánh đủ 4 trận, có thể hòa 2-2
      tie.status = "finished";
      tie.winner = wA > wB ? "A" : (wB > wA ? "B" : "DRAW");
      PB.bracket.onMatchFinished(tie);
    } else {
      // Vòng loại trực tiếp
      if (wA !== wB) {
        tie.status = "finished";
        tie.winner = wA > wB ? "A" : "B";
        PB.bracket.onMatchFinished(tie);
      } else {
        // Hòa 2-2 -> Kiểm tra trận Đơn Dreambreaker
        if (tie.dreambreaker && tie.dreambreaker.status === "finished") {
          tie.status = "finished";
          tie.winner = tie.dreambreaker.winner;
          if (tie.winner === "A") tie.scoreA = 3;
          else tie.scoreB = 3;
          PB.bracket.onMatchFinished(tie);
        } else {
          tie.status = "live";
          tie.winner = null;
        }
      }
    }
  },

  // ==================== LUẬT ĐÔI (DOUBLES) ====================
  snapshot(m) {
    return {
      scoreA: m.scoreA, scoreB: m.scoreB, setsA: m.setsA, setsB: m.setsB,
      sets: JSON.parse(JSON.stringify(m.sets || [])),
      server: m.server, serverNum: m.serverNum, switchedAlerted: m.switchedAlerted,
      timeouts: { ...m.timeouts }, fouls: { ...m.fouls },
      status: m.status, winner: m.winner, finishReason: m.finishReason
    };
  },

  pushHistory(m, logText) {
    if (!m.history) m.history = [];
    if (!m.logs) m.logs = [];
    m.history.push(this.snapshot(m));
    if (m.history.length > 100) m.history.shift();
    m.logs.unshift(`[${this.nowTime()}] ${logText}`);
  },

  getCallout(m, settings) {
    if (m.matchType === "team") return `${m.scoreA} - ${m.scoreB}`;
    if (settings.scoringMode === "rally") return `${m.scoreA} - ${m.scoreB}`;
    const srvScore = m.server === "A" ? m.scoreA : m.scoreB;
    const rcvScore = m.server === "A" ? m.scoreB : m.scoreA;
    return `${srvScore} - ${rcvScore} - ${m.serverNum}`;
  },

  startMatch(m) {
    if (m.status === "pending") {
      m.status = "live";
      m.logs.unshift(`[${this.nowTime()}] Bắt đầu trận đấu (Sân ${m.court || "?"})`);
    }
  },

  addPoint(m, team, settings) {
    if (m.status === "finished" || this.isDoublesSetReached(m, settings)) return { event: "locked" };
    if (m.status === "pending") this.startMatch(m);
    if (settings.scoringMode === "sideout" && m.server !== team) return { event: "not_serving" };

    const name = PB.state.getTeamName(team === "A" ? m.teamA : m.teamB);
    this.pushHistory(m, `+1 điểm cho ${name} (${m.scoreA}-${m.scoreB})`);
    if (team === "A") m.scoreA += 1;
    else m.scoreB += 1;
    if (settings.scoringMode === "rally") m.server = team;
    return this._checkSetAndSwitch(m, settings);
  },

  sideOut(m, settings) {
    if (m.status === "finished") return { event: "locked" };
    if (m.status === "pending") this.startMatch(m);
    const curName = PB.state.getTeamName(m.server === "A" ? m.teamA : m.teamB);
    this.pushHistory(m, `Lỗi giao bóng từ ${curName}`);

    if (settings.scoringMode === "sideout") {
      if (m.serverNum === 1) m.serverNum = 2;
      else { m.server = m.server === "A" ? "B" : "A"; m.serverNum = 1; }
    } else {
      m.server = m.server === "A" ? "B" : "A";
      m.serverNum = 1;
    }
    return { event: "sideout" };
  },

  useTimeout(m, team) {
    if (!m.timeouts) m.timeouts = { A: 2, B: 2 };
    if (m.timeouts[team] <= 0) return false;
    const name = PB.state.getTeamName(team === "A" ? m.teamA : m.teamB);
    this.pushHistory(m, `${name} xin hội ý (Timeout 1 phút)`);
    m.timeouts[team] -= 1;
    return true;
  },

  addTechnicalFoul(m, team, settings) {
    if (m.status === "finished") return { event: "locked" };
    const guilty = PB.state.getTeamName(team === "A" ? m.teamA : m.teamB);
    const opp = team === "A" ? "B" : "A";
    this.pushHistory(m, `Lỗi kỹ thuật với ${guilty} -> +1 điểm đối thủ`);
    m.fouls[team] = (m.fouls[team] || 0) + 1;
    if (opp === "A") m.scoreA += 1;
    else m.scoreB += 1;
    return this._checkSetAndSwitch(m, settings);
  },

  undo(m) {
    if (!m.history || !m.history.length) return false;
    Object.assign(m, m.history.pop());
    m.logs.unshift(`[${this.nowTime()}] ↩ Hoàn tác pha bóng trước`);
    return true;
  },

  _checkSetAndSwitch(m, settings) {
    const target = Number(settings.targetPoints) || 11;
    const winByTwo = !!settings.winByTwo;
    const switchPt = Number(settings.switchPoint) || Math.ceil(target / 2);
    const isDecidingSet = settings.bestOf === 1 || (m.setsA === 1 && m.setsB === 1);
    let needSwitchAlert = false;
    if (isDecidingSet && !m.switchedAlerted && (m.scoreA === switchPt || m.scoreB === switchPt)) {
      m.switchedAlerted = true;
      needSwitchAlert = true;
      m.logs.unshift(`[${this.nowTime()}] 🔄 Chạm điểm ${switchPt} - Đổi sân`);
    }
    const maxS = Math.max(m.scoreA, m.scoreB);
    const diff = Math.abs(m.scoreA - m.scoreB);
    const setWon = maxS >= target && (!winByTwo || diff >= 2);
    if (setWon) return { event: "set_point_reached", winnerSide: m.scoreA > m.scoreB ? "A" : "B", needSwitchAlert };
    return { event: "scored", needSwitchAlert };
  },

  confirmFinishSetOrMatch(m, settings) {
    const winnerSide = m.scoreA >= m.scoreB ? "A" : "B";
    m.sets.push({ a: m.scoreA, b: m.scoreB });
    if (winnerSide === "A") m.setsA += 1;
    else m.setsB += 1;

    const setsNeeded = Math.ceil((Number(settings.bestOf) || 1) / 2);
    if (m.setsA >= setsNeeded || m.setsB >= setsNeeded) {
      m.status = "finished";
      m.winner = winnerSide;
      PB.bracket.onMatchFinished(m);
      return "match_finished";
    } else {
      m.scoreA = 0; m.scoreB = 0;
      m.server = winnerSide === "A" ? "B" : "A";
      m.serverNum = 2; m.swapped = !m.swapped; m.switchedAlerted = false;
      m.timeouts = { A: 2, B: 2 };
      return "next_set";
    }
  },

  finishByDefault(m, winnerSide, reason) {
    this.pushHistory(m, `Kết thúc đặc biệt (${reason})`);
    m.status = "finished";
    m.winner = winnerSide;
    m.finishReason = reason;
    if (m.sets.length === 0) {
      const pts = Number(PB.state.data.settings.targetPoints) || 11;
      m.scoreA = winnerSide === "A" ? pts : 0;
      m.scoreB = winnerSide === "B" ? pts : 0;
      m.sets.push({ a: m.scoreA, b: m.scoreB });
      m.setsA = winnerSide === "A" ? 1 : 0;
      m.setsB = winnerSide === "B" ? 1 : 0;
    }
    PB.bracket.onMatchFinished(m);
  }
};
