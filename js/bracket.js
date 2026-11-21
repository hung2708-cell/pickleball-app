/* =========================================================
   js/bracket.js
   - Tự động tạo sơ đồ cây loại trực tiếp từ vòng bảng:
     + Serie A: Nhất, Nhì bảng (Nhất A vs Nhì B, Nhất B vs Nhì A...)
     + Serie B: Ba, Tư bảng (Ba A vs Tư B, Ba B vs Tư A...)
   - Tự động đẩy đội khi vòng bảng / vòng loại xong -> nhảy sang nhánh tiếp theo
   - Tự động xếp sân đánh luôn khi đủ 2 đội & có sân trống
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

  generateGroupMatches() {
    const groups = this.getGroups();
    const newMatches = [];
    let counter = 1;

    Object.keys(groups).sort().forEach((gName) => {
      const list = groups[gName];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          newMatches.push(
            PB.rules.createMatch({
              id: `G_${gName}_${counter++}`,
              stage: "group",
              group: gName,
              roundName: `Bảng ${gName}`,
              teamA: list[i].id,
              teamB: list[j].id
            })
          );
        }
      }
    });

    // Tự động dựng sẵn khung sơ đồ cây Serie A & Serie B ngay từ đầu
    const koSkeleton = this._buildKnockoutSkeleton(Object.keys(groups).sort());
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
        const pairs = [[0,7,sf1,"A"], [3,4,sf1,"B"], [1,6,sf2,"A"], [2,5,sf2,"B"]];
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

    // Serie A: Nhất bảng & Nhì bảng xếp chéo (Nhất A vs Nhì B, Nhất B vs Nhì A...)
    const rank1 = gNames.map((g) => ({ group: g, rank: 1, label: `Nhất ${g}` }));
    const rank2 = gNames.map((g) => ({ group: g, rank: 2, label: `Nhì ${g}` }));
    const serieASlots = [...rank1, ...rank2.reverse()];

    if (mode === "serieAB") {
      makeTree("serieA", "Serie A", serieASlots);
      const groups = this.getGroups();
      const rank3 = gNames.filter((g) => (groups[g]?.length || 0) >= 3).map((g) => ({ group: g, rank: 3, label: `Ba ${g}` }));
      const rank4 = gNames.filter((g) => (groups[g]?.length || 0) >= 4).map((g) => ({ group: g, rank: 4, label: `Tư ${g}` }));
      const serieBSlots = [...rank3, ...rank4.reverse()];
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
        arr.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.diff !== a.diff) return b.diff - a.diff;
          if (b.ptsFor !== a.ptsFor) return b.ptsFor - a.ptsFor;
          if (a.h2h[b.teamId]) return -a.h2h[b.teamId];
          return a.name.localeCompare(b.name);
        });
      }
      result[gName] = arr;
    });
    return result;
  },

  // Tự động đẩy đội từ các bảng đã hoàn thành sang sơ đồ Serie A & Serie B
  syncGroupWinnersToBracket(force = false) {
    const standings = this.calculateStandings();
    const gNames = Object.keys(standings).sort();
    const allMatches = PB.state.data.matches;

    // Đảm bảo đã có khung knockout
    const hasKO = allMatches.some((m) => m.stage !== "group");
    if (!hasKO && gNames.length) {
      const skel = this._buildKnockoutSkeleton(gNames);
      PB.state.data.matches = [...allMatches, ...skel];
    }

    // Kiểm tra bảng nào đã xong hết trận
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
        if (row) m.teamA = row.teamId;
      }
      if (m.sourceB && completedGroups.has(m.sourceB.group)) {
        const row = standings[m.sourceB.group]?.[m.sourceB.rank - 1];
        if (row) m.teamB = row.teamId;
      }
    });
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
    if (!match.nextMatchId || !match.winner || match.winner === "DRAW") return;
    const nextMatch = PB.state.data.matches.find((m) => m.id === match.nextMatchId);
    if (!nextMatch) return;
    const winnerTeamId = match.winner === "A" ? match.teamA : match.teamB;
    if (match.nextSlot === "A") nextMatch.teamA = winnerTeamId;
    if (match.nextSlot === "B") nextMatch.teamB = winnerTeamId;
  },

  // Tự động xếp sân cho các trận đã đủ 2 đội khi có sân trống (tránh trùng VĐV đang đánh)
  autoAssignCourts() {
    const numCourts = Number(PB.state.data.settings.numCourts) || 4;
    const matches = PB.state.data.matches;

    const busyCourts = new Set();
    const busyPlayers = new Set();

    matches.forEach((m) => {
      if (m.status === "live" || (m.status === "pending" && m.court > 0 && m.teamA && m.teamB)) {
        if (m.court) busyCourts.add(Number(m.court));
        PB.state.getMatchPlayerNames(m).forEach((p) => busyPlayers.add(p));
      }
    });

    for (let c = 1; c <= numCourts; c++) {
      if (busyCourts.has(c)) continue;
      // Tìm trận pending đầu tiên đủ 2 đội, chưa có sân, và KHÔNG CÓ VĐV nào đang bận sân khác
      const nextReady = matches.find((m) => {
        if (m.status !== "pending" || m.court || !m.teamA || !m.teamB) return false;
        const players = PB.state.getMatchPlayerNames(m);
        for (const p of players) { if (busyPlayers.has(p)) return false; }
        return true;
      });
      if (nextReady) {
        nextReady.court = c;
        busyCourts.add(c);
        PB.state.getMatchPlayerNames(nextReady).forEach((p) => busyPlayers.add(p));
      }
    }
  },

  // Gọi mỗi khi có 1 trận kết thúc -> Tự nhảy nhánh + Tự đồng bộ bảng + Tự xếp sân mới
  onMatchFinished(match) {
    if (match.stage === "group") {
      this.syncGroupWinnersToBracket(false);
    } else {
      this.propagateWinner(match);
    }
    this.autoAssignCourts();
  }
};
