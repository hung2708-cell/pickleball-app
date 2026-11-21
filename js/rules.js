/* =========================================================
   js/rules.js
   - Toàn bộ luật chấm điểm Pickleball chuẩn USAP / IFP:
     Side-out (0-0-2), Rally, Đổi sân, Timeout, Lỗi kỹ thuật,
     Undo chính xác từng pha bóng, Nhật ký trận đấu (Match Log).
   ========================================================= */
window.PB = window.PB || {};

PB.rules = {
  nowTime() {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  },

  createMatch({ id, stage, group, roundName, teamA, teamB, court = 0, nextMatchId = null, nextSlot = null }) {
    return {
      id,
      stage,          // 'group' | 'serieA' | 'serieB' | 'knockout'
      group: group || "",
      roundName: roundName || "",
      teamA: teamA || null,
      teamB: teamB || null,
      court,          // 0 = chưa xếp sân
      status: "pending", // pending | live | finished
      scoreA: 0,
      scoreB: 0,
      setsA: 0,
      setsB: 0,
      sets: [],       // [{ a: 11, b: 8 }]
      server: "A",    // 'A' | 'B'
      serverNum: 2,   // Chuẩn đôi Pickleball: đầu trận bắt đầu lượt giao 2 (0-0-2)
      swapped: false, // Đảo bên hiển thị sân trái/phải
      switchedAlerted: false,
      timeouts: { A: 2, B: 2 },
      fouls: { A: 0, B: 0 },
      winner: null,   // 'A' | 'B'
      finishReason: "", // "" | "walkover" | "retired"
      nextMatchId,
      nextSlot,       // 'A' | 'B'
      history: [],
      logs: []
    };
  },

  snapshot(m) {
    return {
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      setsA: m.setsA,
      setsB: m.setsB,
      sets: JSON.parse(JSON.stringify(m.sets || [])),
      server: m.server,
      serverNum: m.serverNum,
      switchedAlerted: m.switchedAlerted,
      timeouts: { ...m.timeouts },
      fouls: { ...m.fouls },
      status: m.status,
      winner: m.winner,
      finishReason: m.finishReason
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
    if (settings.scoringMode === "rally") {
      return `${m.scoreA} - ${m.scoreB}`;
    }
    const srvScore = m.server === "A" ? m.scoreA : m.scoreB;
    const rcvScore = m.server === "A" ? m.scoreB : m.scoreA;
    if (settings.category === "doubles") {
      return `${srvScore} - ${rcvScore} - ${m.serverNum}`;
    }
    return `${srvScore} - ${rcvScore}`;
  },

  startMatch(m) {
    if (m.status === "pending") {
      m.status = "live";
      m.logs.unshift(`[${this.nowTime()}] Bắt đầu trận đấu (Sân ${m.court || "?"})`);
    }
  },

  addPoint(m, team, settings) {
    if (m.status === "finished") return { event: "locked" };
    if (m.status === "pending") this.startMatch(m);

    // Trong thể thức Side-out, chỉ đội đang giao bóng mới được cộng điểm
    if (settings.scoringMode === "sideout" && m.server !== team) {
      return { event: "not_serving" };
    }

    const name = PB.state.getTeamName(team === "A" ? m.teamA : m.teamB);
    this.pushHistory(m, `+1 điểm cho ${name} (${m.scoreA}-${m.scoreB})`);

    if (team === "A") m.scoreA += 1;
    else m.scoreB += 1;

    // Rally mode: đội ghi điểm giành quyền giao bóng
    if (settings.scoringMode === "rally") {
      m.server = team;
    }

    return this._checkSetAndSwitch(m, settings);
  },

  sideOut(m, settings) {
    if (m.status === "finished") return { event: "locked" };
    if (m.status === "pending") this.startMatch(m);

    const curName = PB.state.getTeamName(m.server === "A" ? m.teamA : m.teamB);
    this.pushHistory(m, `Lỗi giao bóng từ ${curName}`);

    if (settings.scoringMode === "sideout" && settings.category === "doubles") {
      if (m.serverNum === 1) {
        m.serverNum = 2;
      } else {
        m.server = m.server === "A" ? "B" : "A";
        m.serverNum = 1;
      }
    } else {
      m.server = m.server === "A" ? "B" : "A";
      m.serverNum = 1;
    }
    return { event: "sideout" };
  },

  useTimeout(m, team) {
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
    this.pushHistory(m, `Lỗi kỹ thuật (Technical Foul) với ${guilty} -> +1 điểm đối thủ`);
    m.fouls[team] = (m.fouls[team] || 0) + 1;
    // Theo luật USAP: Technical Foul cộng 1 điểm trực tiếp cho đối thủ
    if (opp === "A") m.scoreA += 1;
    else m.scoreB += 1;
    return this._checkSetAndSwitch(m, settings);
  },

  undo(m) {
    if (!m.history || !m.history.length) return false;
    const prev = m.history.pop();
    Object.assign(m, prev);
    m.logs.unshift(`[${this.nowTime()}] ↩ Hoàn tác pha bóng trước`);
    return true;
  },

  _checkSetAndSwitch(m, settings) {
    const target = Number(settings.targetPoints) || 11;
    const winByTwo = !!settings.winByTwo;
    const switchPt = Number(settings.switchPoint) || Math.ceil(target / 2);

    // Kiểm tra cảnh báo đổi sân (trong BO1 hoặc set quyết định của BO3)
    const isDecidingSet = settings.bestOf === 1 || (m.setsA === 1 && m.setsB === 1);
    let needSwitchAlert = false;
    if (isDecidingSet && !m.switchedAlerted && (m.scoreA === switchPt || m.scoreB === switchPt)) {
      m.switchedAlerted = true;
      needSwitchAlert = true;
      m.logs.unshift(`[${this.nowTime()}] 🔄 Chạm điểm ${switchPt} - Đổi sân theo điều lệ`);
    }

    // Kiểm tra thắng set
    const maxS = Math.max(m.scoreA, m.scoreB);
    const diff = Math.abs(m.scoreA - m.scoreB);
    const setWon = maxS >= target && (!winByTwo || diff >= 2);

    if (setWon) {
      return { event: "set_point_reached", winnerSide: m.scoreA > m.scoreB ? "A" : "B", needSwitchAlert };
    }
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
      const wName = PB.state.getTeamName(winnerSide === "A" ? m.teamA : m.teamB);
      m.logs.unshift(`[${this.nowTime()}] 🏁 Kết thúc trận đấu! Chiến thắng: ${wName}`);
      PB.bracket.propagateWinner(m);
      return "match_finished";
    } else {
      // Sang set mới
      m.scoreA = 0;
      m.scoreB = 0;
      m.server = winnerSide === "A" ? "B" : "A";
      m.serverNum = 2;
      m.swapped = !m.swapped;
      m.switchedAlerted = false;
      m.timeouts = { A: 2, B: 2 };
      m.logs.unshift(`[${this.nowTime()}] ▶ Bắt đầu Set ${m.sets.length + 1}`);
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
    PB.bracket.propagateWinner(m);
  }
};
