/* =========================================================
   js/bracket.js
   - Chia lịch vòng tròn chuẩn (Berger Round-Robin) xen kẽ các bảng
   - Tự động tạo sơ đồ cây Serie A (Nhất/Nhì) & Serie B (Ba/Tư)
   - Tự động nhảy vòng khi xong bảng / xong trận loại trực tiếp
   - Tự động xếp sân trống: tuyệt đối không để 1 VĐV/Đội đánh 2 sân cùng lúc
   ========================================================= */
window.PB = window.PB || {};

PB.bracket = {
  getGroups() {
    const groups = {};
    PB.state.data.teams.forEach((t) => {
      const g = t.group || "A";
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });
    return groups;
  },

  // Thuật toán vòng tròn Berger: chia theo từng Lượt (Round) sao cho trong cùng 1 lượt
  // không có đội nào xuất hiện quá 1 lần -> xếp đa sân song song hoàn hảo
  _buildRoundRobinRounds(teamList) {
    const arr = [...teamList];
    if (arr.length < 2) return [];
    if (arr.length % 2 === 1) arr.push(null); // Bye nếu số đội lẻ
    const n = arr.length;
    const rounds = [];

    for (let r = 0; r < n - 1; r++) {
      const roundPairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (a && b) roundPairs.push([a, b]);
      }
      rounds.push(roundPairs);
      // Xoay vòng (giữ cố định phần tử đầu tiên)
      const last = arr.pop();
      arr.splice(1, 0, last);
    }
    return rounds;
  },

  generateGroupMatches() {
    const groups = this.getGroups();
    const gNames = Object.keys(groups).sort();
    const groupRoundsMap = {};
    let maxRounds = 0;

    gNames.forEach((gName) => {
      const rds = this._buildRoundRobinRounds(groups[gName]);
      groupRoundsMap[gName] = rds;
      if (rds.length > maxRounds) maxRounds = rds.length;
    });

    // Xen kẽ theo từng Lượt: Bảng A Lượt 1 -> Bảng B Lượt 1 -> Bảng A Lượt 2...
    const newMatches = [];
    const counters = {};
    for (let r = 0; r < maxRounds; r++) {
      gNames.forEach((gName) => {
        const pairs = groupRoundsMap[gName][r] || [];
        if (!counters[gName]) counters[gName] = 1;
        pairs.forEach(([tA, tB]) => {
          newMatches.push(
            PB.rules.createMatch({
              id: `G_${gName}_${counters[gName]++}`,
              stage: "group",
              group: gName,
              roundName: `Bảng ${gName}`,
              teamA: tA.id,
              teamB: tB.id
            })
          );
        });
      });
    }

    const koSkeleton = this._buildKnockoutSkeleton(gNames);
    PB.state.data.matches = [...newMatches, ...koSkeleton];
    this.autoAssignCourts();
    PB.state.save();
  },

  _buildKnockoutSkeleton(gNames) {
    if (!gNames.length) return [];
    const mode = PB.state.data.settings.knockoutMode || "serieAB";
    const ko = [];

    const makeTree = (stageKey, titlePrefix, slotLabels) => {
      if (slotLabels.length < 2) return;
      let size = 2;
      if (slotLabels.length >= 4) size = 4;
      if (slotLabels.length >= 8) size = 8;
      const slots = slotLabels.slice(0, size);

      if (size === 2) {
        ko.push(PB.rules.createMatch({
          id: `${stageKey}_F`, stage: stageKey, roundName: `${titlePrefix} - Chung kết`,
          roundOrder: 3, labelA: slots[0].label, sourceA: slots[0], labelB: slots[1].label, sourceB: slots[1]
        }));
      } else if (size === 4) {
        const fId = `${stageKey}_F`;
        ko.push(PB.rules.createMatch({
          id: `${stageKey}_SF1`, stage: stageKey, roundName: `${titlePrefix} - Bán kết 1`,
          roundOrder: 2, labelA: slots[0].label, sourceA: slots[0], labelB: slots[3].label, sourceB: slots[3],
          nextMatchId: fId, nextSlot: "A"
        }));
        ko.push(PB.rules.createMatch({
          id: `${stageKey}_SF2`, stage: stageKey, roundName: `${titlePrefix} - Bán kết 2`,
          roundOrder: 2, labelA: slots[1].label, sourceA: slots[1], labelB: slots[2].label, sourceB: slots[2],
          nextMatchId: fId, nextSlot: "B"
        }));
        ko.push(PB.rules.createMatch({
          id: fId, stage: stageKey, roundName: `${titlePrefix} - Chung kết`,
          roundOrder: 3, labelA: "Thắng BK1", labelB: "Thắng BK2"
        }));
      } else if (size === 8) {
        const fId = `${stageKey}_F`, sf1 = `${stageKey}_SF1`, sf2 = `${stageKey}_SF2`;
        const pairs = [[0,5,sf1,"A"], [2,7,sf1,"B"], [1,4,sf2,"A"], [3,6,sf2,"B"]];
        pairs.forEach(([i, j, nxt, slot], idx) => {
          ko.push(PB.rules.createMatch({
            id: `${stageKey}_QF${idx+1}`, stage: stageKey, roundName: `${titlePrefix} - Tứ kết ${idx+1}`,
            roundOrder: 1, labelA: slots[i].label, sourceA: slots[i], labelB: slots[j].label, sourceB: slots[j],
            nextMatchId: nxt, nextSlot: slot
          }));
        });
        ko.push(PB.rules.createMatch({ id: sf1, stage: stageKey, roundName: `${titlePrefix} - Bán kết 1`, roundOrder: 2, labelA: "Thắng TK1", labelB: "Thắng TK2", nextMatchId: fId, nextSlot: "A" }));
        ko.push(PB.rules.createMatch({ id: sf2, stage: stageKey, roundName: `${titlePrefix} - Bán kết 2`, roundOrder: 2, labelA: "Thắng TK3", labelB: "Thắng TK4", nextMatchId: fId, nextSlot: "B" }));
        ko.push(PB.rules.createMatch({ id: fId, stage: stageKey, roundName: `${titlePrefix} - Chung kết`, roundOrder: 3, labelA: "Thắng BK1", labelB: "Thắng BK2" }));
      }
    };

    const rank1 = gNames.map((g) => ({ group: g, rank: 1, label: `Nhất ${g}` }));
    const rank2 = gNames.map((g) => ({ group: g, rank: 2, label: `Nhì ${g}` }));
    const serieASlots = [...rank1, ...rank2];

    if (mode === "serieAB") {
      makeTree("serieA", "Serie A", serieASlots);
      const groups = this.getGroups();
      const rank3 = gNames.filter((g) => (groups[g]?.length || 0) >= 3).map((g) => ({ group: g, rank: 3, label: `Ba ${g}` }));
      const rank4 = gNames.filter((g) => (groups[g]?.length || 0) >= 4).map((g) => ({ group: g, rank: 4, label: `Tư ${g}` }));
      const serieBSlots = [...rank3, ...rank4];
      if (serieBSlots.length >= 2) makeTree("serieB", "Serie B", serieBSlots);
    } else {
      makeTree("knockout", "Vòng Loại", serieASlots);
    }

    return ko;
  },

  calculateStandings() {
    const isTeam = PB.state.data.settings.category === "team";
    const groups = this.getGroups();
    const matches = PB.state.data.matches.filter((m) => m.stage === "group" && m.status === "finished");
    const result = {};

    Object.keys(groups).sort().forEach((gName) => {
      const stats = {};
      groups[gName].forEach((t) => {
        stats[t.id] = {
          teamId: t.id, name: t.name, played: 0, wins: 0, draws: 0, losses: 0, forfeits: 0,
          tablePts: 0, subWins: 0, subLosses: 0, ptsFor: 0, ptsAgainst: 0, diff: 0, subDiff: 0, h2h: {}, tieDrawNote: false
        };
      });

      matches.filter((m) => m.group === gName).forEach((m) => {
        const sA = stats[m.teamA], sB = stats[m.teamB];
        if (!sA || !sB) return;
        sA.played++; sB.played++;

        if (isTeam && m.matchType === "team") {
          (m.subMatches || []).forEach((sm) => {
            sA.ptsFor += Number(sm.scoreA || 0); sA.ptsAgainst += Number(sm.scoreB || 0);
            sB.ptsFor += Number(sm.scoreB || 0); sB.ptsAgainst += Number(sm.scoreA || 0);
          });
          sA.subWins += Number(m.scoreA || 0); sA.subLosses += Number(m.scoreB || 0);
          sB.subWins += Number(m.scoreB || 0); sB.subLosses += Number(m.scoreA || 0);

          if (m.forfeitSide === "A") { sA.forfeits++; sB.wins++; sB.tablePts += 3; sB.h2h[m.teamA] = 1; sA.h2h[m.teamB] = -1; }
          else if (m.forfeitSide === "B") { sB.forfeits++; sA.wins++; sA.tablePts += 3; sA.h2h[m.teamB] = 1; sB.h2h[m.teamA] = -1; }
          else if (m.winner === "A") { sA.wins++; sA.tablePts += 3; sB.losses++; sB.tablePts += 1; sA.h2h[m.teamB] = 1; sB.h2h[m.teamA] = -1; }
          else if (m.winner === "B") { sB.wins++; sB.tablePts += 3; sA.losses++; sA.tablePts += 1; sB.h2h[m.teamA] = 1; sA.h2h[m.teamB] = -1; }
          else if (m.winner === "DRAW") { sA.draws++; sA.tablePts += 2; sB.draws++; sB.tablePts += 2; }
        } else {
          let pA = 0, pB = 0;
          if (m.sets && m.sets.length) m.sets.forEach((s) => { pA += Number(s.a || 0); pB += Number(s.b || 0); });
          else { pA = Number(m.scoreA || 0); pB = Number(m.scoreB || 0); }
          sA.ptsFor += pA; sA.ptsAgainst += pB; sB.ptsFor += pB; sB.ptsAgainst += pA;
          if (m.winner === "A") { sA.wins++; sB.losses++; sA.h2h[m.teamB] = 1; sB.h2h[m.teamA] = -1; }
          else if (m.winner === "B") { sB.wins++; sA.losses++; sB.h2h[m.teamA] = 1; sA.h2h[m.teamB] = -1; }
        }
      });

      const arr = Object.values(stats).map((s) => ({ ...s, diff: s.ptsFor - s.ptsAgainst, subDiff: s.subWins - s.subLosses }));
      if (isTeam) {
        arr.sort((a, b) => {
          if (b.tablePts !== a.tablePts) return b.tablePts - a.tablePts;
          if (a.h2h[b.teamId]) return -a.h2h[b.teamId];
          if (b.subDiff !== a.subDiff) return b.subDiff - a.subDiff;
          if (b.diff !== a.diff) return b.diff - a.diff;
          return 0;
        });
        for (let i = 0; i < arr.length - 1; i++) {
          const a = arr[i], b = arr[i + 1];
          if (a.played > 0 && a.tablePts === b.tablePts && !a.h2h[b.teamId] && a.subDiff === b.subDiff && a.diff === b.diff) {
            a.tieDrawNote = true; b.tieDrawNote = true;
          }
        }
      } else {
        // Chuẩn luật Pickleball (USAP/IFP): Thắng -> Đối đầu -> Hiệu số điểm -> Tổng điểm ghi -> Bốc thăm
        arr.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (a.h2h[b.teamId]) return -a.h2h[b.teamId];
          if (b.diff !== a.diff) return b.diff - a.diff;
          if (b.ptsFor !== a.ptsFor) return b.ptsFor - a.ptsFor;
          return 0;
        });
        for (let i = 0; i < arr.length - 1; i++) {
          const a = arr[i], b = arr[i + 1];
          if (a.played > 0 && a.wins === b.wins && !a.h2h[b.teamId] && a.diff === b.diff && a.ptsFor === b.ptsFor) {
            a.tieDrawNote = true; b.tieDrawNote = true;
          }
        }
      }
      result[gName] = arr;
    });
    return result;
  },

  // Tự động đẩy đội từ các bảng đã xong sang sơ đồ Serie A & Serie B
  syncGroupWinnersToBracket(force = false) {
    let changed = false;
    const standings = this.calculateStandings();
    const gNames = Object.keys(standings).sort();
    const allMatches = PB.state.data.matches;

    const hasKO = allMatches.some((m) => m.stage !== "group");
    if (!hasKO && gNames.length) {
      const skel = this._buildKnockoutSkeleton(gNames);
      PB.state.data.matches = [...allMatches, ...skel];
      changed = true;
    }

    const completedGroups = new Set();
    gNames.forEach((g) => {
      const gMatches = PB.state.data.matches.filter((m) => m.stage === "group" && m.group === g);
      if (force || (gMatches.length > 0 && gMatches.every((m) => m.status === "finished"))) {
        completedGroups.add(g);
      }
    });

    PB.state.data.matches.filter((m) => m.stage !== "group" && m.status === "pending").forEach((m) => {
      if (m.sourceA && completedGroups.has(m.sourceA.group)) {
        const row = standings[m.sourceA.group]?.[m.sourceA.rank - 1];
        if (row && m.teamA !== row.teamId) { m.teamA = row.teamId; changed = true; }
      }
      if (m.sourceB && completedGroups.has(m.sourceB.group)) {
        const row = standings[m.sourceB.group]?.[m.sourceB.rank - 1];
        if (row && m.teamB !== row.teamId) { m.teamB = row.teamId; changed = true; }
      }
    });
    return changed;
  },

  generateKnockoutFromGroups() {
    const groups = this.getGroups();
    const gNames = Object.keys(groups).sort();
    if (!gNames.length) return { ok: false, msg: "Chưa có bảng đấu nào." };

    const groupMatches = PB.state.data.matches.filter((m) => m.stage === "group");
    const koSkeleton = this._buildKnockoutSkeleton(gNames);
    PB.state.data.matches = [...groupMatches, ...koSkeleton];
    this.syncGroupWinnersToBracket(true);
    this.autoAssignCourts();
    PB.state.save();
    return { ok: true, count: koSkeleton.length };
  },

  propagateWinner(match) {
    if (!match.nextMatchId || !match.winner || match.winner === "DRAW") return false;
    const nextMatch = PB.state.data.matches.find((m) => m.id === match.nextMatchId);
    if (!nextMatch) return false;
    const winnerTeamId = match.winner === "A" ? match.teamA : match.teamB;
    let changed = false;
    if (match.nextSlot === "A" && nextMatch.teamA !== winnerTeamId) { nextMatch.teamA = winnerTeamId; changed = true; }
    if (match.nextSlot === "B" && nextMatch.teamB !== winnerTeamId) { nextMatch.teamB = winnerTeamId; changed = true; }
    return changed;
  },

  // Tự động dọn xung đột & đẩy các trận chưa đánh (đủ 2 đội) vào các sân trống
  // Đảm bảo tuyệt đối KHÔNG có VĐV nào bị xếp trên 2 sân cùng lúc
  autoAssignCourts() {
    let changed = false;
    const numCourts = Number(PB.state.data.settings.numCourts) || 4;
    const matches = PB.state.data.matches;

    const busyCourts = new Set();
    const busyPlayers = new Set();

    // Bước 1: Ghi nhận tất cả các trận ĐANG ĐÁNH (live)
    matches.forEach((m) => {
      if (m.status === "live") {
        if (m.court > 0) busyCourts.add(Number(m.court));
        PB.state.getMatchPlayerNames(m).forEach((p) => busyPlayers.add(p));
      }
    });

    // Bước 2: Kiểm tra các trận pending đã được gán sân trước đó -> nếu trùng sân hoặc trùng VĐV thì gỡ ra
    matches.forEach((m) => {
      if (m.status !== "pending" || !m.court) return;
      const c = Number(m.court);
      const players = PB.state.getMatchPlayerNames(m);
      let hasOverlap = !m.teamA || !m.teamB || c > numCourts || busyCourts.has(c);
      if (!hasOverlap) {
        for (const p of players) { if (busyPlayers.has(p)) { hasOverlap = true; break; } }
      }
      if (hasOverlap) {
        m.court = 0; // Gỡ sân bị trùng
        changed = true;
      } else {
        busyCourts.add(c);
        players.forEach((p) => busyPlayers.add(p));
      }
    });

    // Bước 3: Lấp đầy tất cả các sân đang trống bằng các trận pending đủ 2 đội & VĐV đang rảnh
    const candidates = matches.filter((m) => m.status === "pending" && !m.court && m.teamA && m.teamB);

    for (let c = 1; c <= numCourts; c++) {
      if (busyCourts.has(c)) continue;
      const nextReady = candidates.find((m) => {
        if (m.court) return false;
        const players = PB.state.getMatchPlayerNames(m);
        for (const p of players) { if (busyPlayers.has(p)) return false; }
        return true;
      });
      if (nextReady) {
        nextReady.court = c;
        busyCourts.add(c);
        PB.state.getMatchPlayerNames(nextReady).forEach((p) => busyPlayers.add(p));
        changed = true;
      }
    }
    return changed;
  },

  // Tự động kiểm tra toàn bộ giải (nhảy vòng + gán sân trống) nếu có thay đổi thì lưu ngay
  ensureAutoSchedule() {
    if (!PB.state.data || !PB.state.data.matches || !PB.state.data.matches.length) return false;
    let changed = this.syncGroupWinnersToBracket(false);
    // Đẩy tiếp đội thắng ở các trận KO đã kết thúc (phòng trường hợp dữ liệu cũ)
    PB.state.data.matches.filter((m) => m.stage !== "group" && m.status === "finished").forEach((m) => {
      if (this.propagateWinner(m)) changed = true;
    });
    if (this.autoAssignCourts()) changed = true;
    return changed;
  },

  // Gọi mỗi khi có 1 trận kết thúc -> Tự nhảy vòng/nhánh + Tự đẩy trận tiếp theo vào sân trống
  onMatchFinished(match) {
    if (match.stage === "group") {
      this.syncGroupWinnersToBracket(false);
    } else {
      this.propagateWinner(match);
    }
    this.autoAssignCourts();
  }
};
