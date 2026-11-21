/* =========================================================
   js/bracket.js
   - Chia bảng, sinh lịch vòng tròn (Round-Robin)
   - Xếp hạng vòng bảng chuẩn điều lệ:
     1. Số trận thắng -> 2. Hiệu số điểm -> 3. Tổng điểm ghi -> 4. Đối đầu
   - Chốt vòng bảng -> Tự động đẩy nhánh (1 Nhánh hoặc Serie A + B)
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
    // Giữ lại trận knockout nếu có, hoặc reset toàn bộ vòng bảng
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

    PB.state.data.matches = newMatches;
    PB.state.save();
  },

  calculateStandings() {
    const groups = this.getGroups();
    const matches = PB.state.data.matches.filter((m) => m.stage === "group" && m.status === "finished");
    const result = {};

    Object.keys(groups).sort().forEach((gName) => {
      const stats = {};
      groups[gName].forEach((t) => {
        stats[t.id] = {
          teamId: t.id,
          name: t.name,
          played: 0,
          wins: 0,
          losses: 0,
          ptsFor: 0,
          ptsAgainst: 0,
          diff: 0,
          h2h: {}
        };
      });

      matches.filter((m) => m.group === gName).forEach((m) => {
        const sA = stats[m.teamA];
        const sB = stats[m.teamB];
        if (!sA || !sB) return;

        let pA = 0, pB = 0;
        if (m.sets && m.sets.length) {
          m.sets.forEach((s) => { pA += Number(s.a || 0); pB += Number(s.b || 0); });
        } else {
          pA = Number(m.scoreA || 0);
          pB = Number(m.scoreB || 0);
        }

        sA.played++; sB.played++;
        sA.ptsFor += pA; sA.ptsAgainst += pB;
        sB.ptsFor += pB; sB.ptsAgainst += pA;

        if (m.winner === "A") {
          sA.wins++; sB.losses++;
          sA.h2h[m.teamB] = 1; sB.h2h[m.teamA] = -1;
        } else if (m.winner === "B") {
          sB.wins++; sA.losses++;
          sB.h2h[m.teamA] = 1; sA.h2h[m.teamB] = -1;
        }
      });

      const arr = Object.values(stats).map((s) => ({ ...s, diff: s.ptsFor - s.ptsAgainst }));

      // Xếp hạng chuẩn điều lệ
      arr.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (b.ptsFor !== a.ptsFor) return b.ptsFor - a.ptsFor;
        if (a.h2h[b.teamId]) return -a.h2h[b.teamId];
        return a.name.localeCompare(b.name);
      });

      result[gName] = arr;
    });

    return result;
  },

  generateKnockoutFromGroups() {
    const standings = this.calculateStandings();
    const gNames = Object.keys(standings).sort();
    if (gNames.length < 1) return { ok: false, msg: "Chưa có bảng đấu nào." };

    const mode = PB.state.data.settings.knockoutMode;
    // Xóa các trận knockout cũ, giữ nguyên vòng bảng
    const groupMatches = PB.state.data.matches.filter((m) => m.stage === "group");
    const koMatches = [];

    const buildTree = (stageKey, labelPrefix, seeds) => {
      if (seeds.length < 2) return;
      // Hỗ trợ nhánh 2, 4, hoặc 8 đội
      let size = 2;
      if (seeds.length >= 4) size = 4;
      if (seeds.length >= 8) size = 8;
      const list = seeds.slice(0, size);

      if (size === 2) {
        koMatches.push(PB.rules.createMatch({
          id: `${stageKey}_F`, stage: stageKey, roundName: `${labelPrefix} - Chung kết`,
          teamA: list[0], teamB: list[1]
        }));
      } else if (size === 4) {
        const fId = `${stageKey}_F`;
        koMatches.push(PB.rules.createMatch({
          id: `${stageKey}_SF1`, stage: stageKey, roundName: `${labelPrefix} - Bán kết 1`,
          teamA: list[0], teamB: list[3], nextMatchId: fId, nextSlot: "A"
        }));
        koMatches.push(PB.rules.createMatch({
          id: `${stageKey}_SF2`, stage: stageKey, roundName: `${labelPrefix} - Bán kết 2`,
          teamA: list[1], teamB: list[2], nextMatchId: fId, nextSlot: "B"
        }));
        koMatches.push(PB.rules.createMatch({
          id: fId, stage: stageKey, roundName: `${labelPrefix} - Chung kết`,
          teamA: null, teamB: null
        }));
      } else if (size === 8) {
        const fId = `${stageKey}_F`;
        const sf1 = `${stageKey}_SF1`, sf2 = `${stageKey}_SF2`;
        const pairs = [[0,7,sf1,"A"], [3,4,sf1,"B"], [1,6,sf2,"A"], [2,5,sf2,"B"]];
        pairs.forEach(([i, j, nxt, slot], idx) => {
          koMatches.push(PB.rules.createMatch({
            id: `${stageKey}_QF${idx+1}`, stage: stageKey, roundName: `${labelPrefix} - Tứ kết ${idx+1}`,
            teamA: list[i], teamB: list[j], nextMatchId: nxt, nextSlot: slot
          }));
        });
        koMatches.push(PB.rules.createMatch({
          id: sf1, stage: stageKey, roundName: `${labelPrefix} - Bán kết 1`,
          nextMatchId: fId, nextSlot: "A"
        }));
        koMatches.push(PB.rules.createMatch({
          id: sf2, stage: stageKey, roundName: `${labelPrefix} - Bán kết 2`,
          nextMatchId: fId, nextSlot: "B"
        }));
        koMatches.push(PB.rules.createMatch({
          id: fId, stage: stageKey, roundName: `${labelPrefix} - Chung kết`
        }));
      }
    };

    // Lấy hạt giống chéo: Nhất A, Nhất B... rồi Nhì A, Nhì B...
    const top1 = gNames.map((g) => standings[g][0]?.teamId).filter(Boolean);
    const top2 = gNames.map((g) => standings[g][1]?.teamId).filter(Boolean);
    const serieASeeds = [...top1, ...top2.reverse()];

    if (mode === "serieAB") {
      buildTree("serieA", "Serie A", serieASeeds);
      const rank3 = gNames.map((g) => standings[g][2]?.teamId).filter(Boolean);
      const rank4 = gNames.map((g) => standings[g][3]?.teamId).filter(Boolean);
      const serieBSeeds = [...rank3, ...rank4.reverse()];
      if (serieBSeeds.length >= 2) {
        buildTree("serieB", "Serie B", serieBSeeds);
      }
    } else {
      buildTree("knockout", "Vòng Loại", serieASeeds);
    }

    PB.state.data.matches = [...groupMatches, ...koMatches];
    PB.state.save();
    return { ok: true, count: koMatches.length };
  },

  propagateWinner(match) {
    if (!match.nextMatchId || !match.winner) return;
    const nextMatch = PB.state.data.matches.find((m) => m.id === match.nextMatchId);
    if (!nextMatch) return;
    const winnerTeamId = match.winner === "A" ? match.teamA : match.teamB;
    if (match.nextSlot === "A") nextMatch.teamA = winnerTeamId;
    if (match.nextSlot === "B") nextMatch.teamB = winnerTeamId;
  }
};
