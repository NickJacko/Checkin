'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ═══════════════════════════════════════════════
   FIREBASE
═══════════════════════════════════════════════ */
const FB = {
  apiKey:            'AIzaSyCa8VcpRe94gevcyQUF_Zc-e-UNRCowDSc',
  authDomain:        'checkin-9f731.firebaseapp.com',
  projectId:         'checkin-9f731',
  storageBucket:     'checkin-9f731.firebasestorage.app',
  messagingSenderId: '199496624018',
  appId:             '1:199496624018:web:a06afb19294d0635a8034b',
};
const app  = initializeApp(FB);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const AVATARS = ['🧙','🧝','🧛','🧜','🧚','🦄','🐉','🧿','⚔️','🛡️',
                 '🔮','💀','👑','🌙','⚡','🌟','🔥','❄️','🎭','🎪'];

const LEVELS = [
  { lv:1,  title:'Novize',               xp:0     },
  { lv:2,  title:'Lehrling',             xp:300   },
  { lv:3,  title:'Zauberlehrling',       xp:700   },
  { lv:4,  title:'Magier',               xp:1500  },
  { lv:5,  title:'Hexer',                xp:2800  },
  { lv:6,  title:'Archmage',             xp:5000  },
  { lv:7,  title:'Großmeister',          xp:8500  },
  { lv:8,  title:'Legendärer Magier',    xp:13000 },
  { lv:9,  title:'Mythischer Zauberer',  xp:20000 },
  { lv:10, title:'Wizard-Gott',          xp:30000 },
];

const RARITY_COLORS = {
  common:    { c:'#9ca3af', bg:'rgba(156,163,175,.2)' },
  rare:      { c:'#60a5fa', bg:'rgba(96,165,250,.2)'  },
  epic:      { c:'#a78bfa', bg:'rgba(167,139,250,.2)' },
  legendary: { c:'#fbbf24', bg:'rgba(251,191,36,.2)'  },
  mythic:    { c:'#f472b6', bg:'rgba(244,114,182,.2)' },
};

const ACH = [
  // ── COMMON ──
  { id:'first_game',   nm:'Erster Schritt',      ds:'Spiele dein erstes Spiel',               ico:'🎮', r:'common',    xp:50  },
  { id:'first_win',    nm:'Erster Sieg',          ds:'Gewinne dein erstes Spiel',              ico:'🏆', r:'common',    xp:100 },
  { id:'three_games',  nm:'Stammgast',            ds:'Spiele 3 Spiele',                        ico:'🎲', r:'common',    xp:75  },
  // ── RARE ──
  { id:'ten_games',    nm:'Erfahrener Spieler',   ds:'Spiele 10 Spiele',                       ico:'🎯', r:'rare',      xp:200 },
  { id:'five_wins',    nm:'Auf dem Weg',          ds:'Gewinne 5 Spiele',                       ico:'⭐', r:'rare',      xp:250 },
  { id:'streak3',      nm:'Heiß wie Feuer',       ds:'Gewinne 3 Spiele in Folge',              ico:'🔥', r:'rare',      xp:300 },
  { id:'high200',      nm:'Punktesammler',        ds:'Erziele über 200 Punkte in einem Spiel', ico:'💰', r:'rare',      xp:250 },
  { id:'survivor',     nm:'Letzter Überlebender', ds:'Gewinne ein Spiel mit 5+ Spielern',      ico:'🛡️', r:'rare',      xp:300 },
  { id:'dark_horse',   nm:'Dark Horse',           ds:'Gewinne als Spieler mit niedrigstem MMR',ico:'🦄', r:'rare',      xp:350 },
  // ── EPIC ──
  { id:'twenty_games', nm:'Veteran',              ds:'Spiele 20 Spiele',                       ico:'🎖', r:'epic',      xp:400 },
  { id:'ten_wins',     nm:'Zehnmal Champion',     ds:'Gewinne 10 Spiele',                      ico:'🥇', r:'epic',      xp:500 },
  { id:'streak5',      nm:'Unaufhaltsam',         ds:'Gewinne 5 Spiele in Folge',              ico:'⚡', r:'epic',      xp:600 },
  { id:'comeback',     nm:'Comeback King',        ds:'Sage dein Comeback voraus (gewinne 5 Spiele nach Verlust-Streak)', ico:'💪', r:'epic', xp:700 },
  { id:'lucky_devil',  nm:'Lucky Devil',          ds:'Gewinne mit ≤10 Punkten Vorsprung',      ico:'😈', r:'epic',      xp:500 },
  { id:'hundred_games',nm:'Dedication',           ds:'Spiele 100 Spiele',                      ico:'💎', r:'epic',      xp:800 },
  { id:'high300',      nm:'Rekordjäger',          ds:'Erziele über 300 Punkte in einem Spiel', ico:'🚀', r:'epic',      xp:600 },
  // ── LEGENDARY ──
  { id:'fifty_wins',   nm:'50 Siege',             ds:'Gewinne 50 Spiele insgesamt',            ico:'👑', r:'legendary', xp:1000 },
  { id:'streak10',     nm:'Legende',              ds:'Gewinne 10 Spiele in Folge',             ico:'⚔️', r:'legendary', xp:1500 },
  { id:'high400',      nm:'Punktegott',           ds:'Erziele über 400 Punkte in einem Spiel', ico:'🌟', r:'legendary', xp:1000 },
  { id:'twenty_wins',  nm:'Meister des Decks',    ds:'Gewinne 20 Spiele',                      ico:'🔮', r:'legendary', xp:750  },
  // ── MYTHIC ──
  { id:'wizard_god',   nm:'Wizard-Gott',          ds:'Gewinne 100 Spiele insgesamt',           ico:'🧙', r:'mythic',    xp:3000 },
  { id:'immortal',     nm:'Unsterblich',          ds:'Gewinne 15 Spiele in Folge',             ico:'✨', r:'mythic',    xp:5000 },
];

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let S = {
  players: {},    // { id: playerDoc }
  games:   [],    // [ gameDoc ]
  view: 'dashboard',
  rankCat: 'mmr',
  profId: null,
  achPid: null,
  achRarity: 'all',
  achQueue: [],   // achievement unlock queue
  selAvatar: '🧙',
  ng: {           // new game state
    step: 0,
    pids: [],
    mode: null,
    roundData: {}, // { pid: [r1,r2,...] }
    scores: {},    // { pid: number }
    numRounds: 10,
  }
};

/* ═══════════════════════════════════════════════
   FIREBASE
═══════════════════════════════════════════════ */
async function loadPlayers() {
  const snap = await getDocs(collection(db, 'wizard_players'));
  S.players = {};
  snap.forEach(d => { S.players[d.id] = { id: d.id, ...d.data() }; });
}

async function loadGames() {
  const q = query(collection(db, 'wizard_games'), orderBy('date', 'desc'), limit(50));
  const snap = await getDocs(q);
  S.games = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createPlayer(name, emoji) {
  const data = {
    name, emoji, mmr: 1000, xp: 0, level: 1, title: 'Novize',
    stats: { gamesPlayed:0, wins:0, totalPoints:0, avgPoints:0, highScore:0, winStreak:0, maxWinStreak:0 },
    achievements: [], createdAt: serverTimestamp(), lastGameAt: null,
  };
  const ref = await addDoc(collection(db, 'wizard_players'), data);
  S.players[ref.id] = { id: ref.id, ...data };
  return ref.id;
}

async function persistPlayer(pid, updates) {
  await updateDoc(doc(db, 'wizard_players', pid), updates);
  S.players[pid] = { ...S.players[pid], ...updates };
}

/* ═══════════════════════════════════════════════
   CALCULATIONS
═══════════════════════════════════════════════ */
function calcMMR({ gamesPlayed=0, wins=0, avgPoints=0, maxWinStreak=0 }) {
  if (!gamesPlayed) return 1000;
  const bwr  = (wins + 2) / (gamesPlayed + 4);         // Bayesian win rate
  const conf = 1 - Math.exp(-gamesPlayed / 25);         // confidence 0→1
  const wrMMR  = bwr * 600 * conf;
  const ptMMR  = Math.min(avgPoints / 250, 1.2) * 140 * conf;
  const strMMR = Math.min(maxWinStreak / 10, 1) * 100;
  return Math.round(1000 + wrMMR + ptMMR + strMMR);
}

function getLevelData(xp) {
  let cur = LEVELS[0], next = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) { cur = LEVELS[i]; next = LEVELS[i+1] || null; break; }
  }
  const pct = next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100;
  return { cur, next, pct };
}

function calcXPGain(position, totalPlayers, score, prevHighScore) {
  let xp = 25;
  if (position === 1) xp += 100;
  else if (position === 2) xp += 50;
  else if (position === 3) xp += 25;
  if (score > (prevHighScore || 0)) xp += 75;
  return xp;
}

/* ═══════════════════════════════════════════════
   ACHIEVEMENTS
═══════════════════════════════════════════════ */
function evalAchievements(pid, newStats, gameResult) {
  const p = S.players[pid];
  const already = new Set(p.achievements || []);
  const earned  = [];

  function check(id, cond) {
    if (!already.has(id) && cond) earned.push(ACH.find(a => a.id === id));
  }

  const { gamesPlayed, wins, highScore, winStreak, maxWinStreak } = newStats;

  check('first_game',   gamesPlayed >= 1);
  check('first_win',    wins >= 1);
  check('three_games',  gamesPlayed >= 3);
  check('ten_games',    gamesPlayed >= 10);
  check('five_wins',    wins >= 5);
  check('ten_wins',     wins >= 10);
  check('twenty_wins',  wins >= 20);
  check('fifty_wins',   wins >= 50);
  check('wizard_god',   wins >= 100);
  check('twenty_games', gamesPlayed >= 20);
  check('hundred_games',gamesPlayed >= 100);
  check('streak3',      maxWinStreak >= 3);
  check('streak5',      maxWinStreak >= 5);
  check('streak10',     maxWinStreak >= 10);
  check('immortal',     maxWinStreak >= 15);
  check('high200',      highScore >= 200);
  check('high300',      highScore >= 300);
  check('high400',      highScore >= 400);

  // Game-specific
  if (gameResult) {
    const { scores, winner, playerIds } = gameResult;
    const sorted = [...playerIds].sort((a,b) => (scores[b]||0)-(scores[a]||0));
    const myScore = scores[pid] || 0;
    const winnerScore = scores[sorted[0]] || 0;

    check('survivor', winner === pid && playerIds.length >= 5);

    // Lucky Devil: won by ≤10 points
    if (winner === pid && sorted.length > 1) {
      const secondScore = scores[sorted[1]] || 0;
      check('lucky_devil', (myScore - secondScore) <= 10 && myScore > secondScore);
    }

    // Dark Horse: winner had lowest MMR
    if (winner === pid) {
      const myMMR = calcMMR(p.stats || {});
      const allMMRs = playerIds.map(id => calcMMR((S.players[id]?.stats) || {}));
      const minMMR  = Math.min(...allMMRs);
      check('dark_horse', myMMR === minMMR && playerIds.length >= 3);
    }
  }

  return earned.filter(Boolean);
}

/* ═══════════════════════════════════════════════
   SAVE GAME
═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   QUICK REMATCH
═══════════════════════════════════════════════ */
function quickRematch(gameId) {
  const g = S.games.find(g => g.id === gameId);
  if (!g) return;
  resetNG();
  S.ng.pids = [...(g.players||[])].filter(id => S.players[id]);
  switchTab('newgame');
  renderNG0();
  // Go directly to mode selection (step 1) since players are pre-selected
  setTimeout(() => goNGStep(1), 100);
  toast(`${S.ng.pids.length} Spieler vorausgewählt ⚡`, 'ok');
}

/* ═══════════════════════════════════════════════
   GAME RESULT SCREEN
═══════════════════════════════════════════════ */
function showGameResult(scores, newlyUnlocked) {
  const pids   = Object.keys(scores);
  const sorted = [...pids].sort((a,b) => scores[b]-scores[a]);
  const winner = sorted[0];
  const wp     = S.players[winner];

  const medals = ['🥇','🥈','🥉','🏅','🏅','🏅'];
  const el = document.getElementById('gs-input');

  el.innerHTML = `
    <div class="game-result-wrap">
      <div class="gr-winner-ava">${wp?.emoji||'🧙'}</div>
      <div class="gr-winner-name">${esc(wp?.name||'?')}</div>
      <div class="gr-winner-sub">🏆 Sieger · ${scores[winner]} Punkte</div>

      <div class="gr-standings">
        ${sorted.map((pid,i) => {
          const p = S.players[pid];
          const sc = scores[pid];
          const isWin = i===0;
          return `<div class="gr-row ${isWin?'gr-win':''}">
            <span class="gr-medal">${medals[i]||'🏅'}</span>
            <span class="gr-ava">${p?.emoji||'🧙'}</span>
            <span class="gr-name">${esc(p?.name||'?')}</span>
            <span class="gr-score">${sc} Pkt</span>
          </div>`;
        }).join('')}
      </div>

      ${newlyUnlocked.length ? `
      <div class="gr-ach-section">
        <div class="gr-ach-title">🎖 Achievements freigeschaltet!</div>
        ${newlyUnlocked.map(a => {
          const rc = RARITY_COLORS[a.r]||{};
          return `<div class="gr-ach-row" style="--rc:${rc.c};--rbg:${rc.bg}">
            ${a.ico} <span>${esc(a.nm)}</span> <span class="gr-ach-xp">+${a.xp} XP</span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div style="display:flex;gap:.6rem;margin-top:1.5rem;flex-wrap:wrap">
        <button class="btn-sec" id="btn-gr-share">📋 Teilen</button>
        <button class="btn-sec" id="btn-gr-rematch">⚡ Nochmal</button>
        <button class="btn-pri" style="flex:1" id="btn-gr-home">🏠 Dashboard</button>
      </div>
    </div>`;

  document.getElementById('btn-gr-home').onclick = () => {
    resetNG(); renderAll(); switchTab('dashboard');
  };
  document.getElementById('btn-gr-rematch').onclick = () => {
    S.ng.pids = pids.filter(id => S.players[id]);
    goNGStep(1);
  };
  document.getElementById('btn-gr-share').onclick = () => shareResult(scores);
}

async function saveGame(scores, roundData = null) {
  const pids   = Object.keys(scores);
  const sorted = [...pids].sort((a,b) => scores[b] - scores[a]);
  const winner = sorted[0];

  // Save game doc
  const gameDoc = {
    date: serverTimestamp(),
    players: pids,
    scores,
    roundScores: roundData,
    winner,
    rankings: sorted,
    playerCount: pids.length,
  };
  const gRef = await addDoc(collection(db, 'wizard_games'), gameDoc);
  const savedGame = { id: gRef.id, ...gameDoc, date: new Date() };
  S.games.unshift(savedGame);

  // Update each player
  const newlyUnlocked = [];

  for (let i = 0; i < sorted.length; i++) {
    const pid  = sorted[i];
    const p    = S.players[pid] || {};
    const st   = p.stats || {};
    const pos  = i + 1;
    const myScore = scores[pid] || 0;
    const isWin   = pos === 1;

    const gp       = (st.gamesPlayed || 0) + 1;
    const wins     = (st.wins || 0) + (isWin ? 1 : 0);
    const totPts   = (st.totalPoints || 0) + myScore;
    const avgPts   = Math.round(totPts / gp);
    const highSc   = Math.max(st.highScore || 0, myScore);
    const streak   = isWin ? (st.winStreak || 0) + 1 : 0;
    const maxStr   = Math.max(st.maxWinStreak || 0, streak);

    const newStats = { gamesPlayed:gp, wins, totalPoints:totPts, avgPoints:avgPts, highScore:highSc, winStreak:streak, maxWinStreak:maxStr };
    const newMMR   = calcMMR(newStats);
    const xpGain   = calcXPGain(pos, pids.length, myScore, st.highScore);
    const newXP    = (p.xp || 0) + xpGain;
    const lvData   = getLevelData(newXP);

    // Check achievements
    const earned = evalAchievements(pid, newStats, { scores, winner, playerIds: pids });
    const achIds = [...(p.achievements || []), ...earned.map(a => a.id)];
    if (earned.length) newlyUnlocked.push(...earned.map(a => ({ ...a, playerName: p.name })));

    await persistPlayer(pid, {
      stats: newStats,
      mmr: newMMR,
      xp: newXP,
      level: lvData.cur.lv,
      title: lvData.cur.title,
      achievements: achIds,
      lastGameAt: new Date(),
    });
  }

  return { winner, newlyUnlocked };
}

/* ═══════════════════════════════════════════════
   SCORE CHART
═══════════════════════════════════════════════ */
function drawScoreChart(canvasId, scores) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || scores.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.clientWidth || canvas.offsetWidth || 300;
  const h   = 100;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad  = { t:12, r:12, b:18, l:34 };
  const cw   = w - pad.l - pad.r;
  const ch   = h - pad.t - pad.b;
  const min  = Math.min(...scores);
  const max  = Math.max(...scores);
  const rng  = (max - min) || 1;
  const toY  = v => pad.t + ch - ((v - min) / rng * ch);
  const toX  = i => pad.l + (i / (scores.length - 1)) * cw;

  // Grid
  [0,.33,.66,1].forEach(f => {
    const y = pad.t + ch * f;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    const val = Math.round(max - rng * f);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${9 * dpr}px JetBrains Mono, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(val, pad.l - 4, y + 3);
  });

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, 'rgba(124,58,237,.35)');
  grad.addColorStop(1, 'rgba(124,58,237,.0)');
  ctx.beginPath();
  scores.forEach((v, i) => { const x=toX(i),y=toY(v); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.lineTo(toX(scores.length - 1), h - pad.b);
  ctx.lineTo(toX(0), h - pad.b);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath();
  scores.forEach((v, i) => { const x=toX(i),y=toY(v); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

  // Dots + tooltips
  scores.forEach((v, i) => {
    const x = toX(i), y = toY(v);
    // Gold dot for best score
    const isBest = v === max;
    ctx.beginPath(); ctx.arc(x, y, isBest ? 5 : 3.5, 0, Math.PI*2);
    ctx.fillStyle = isBest ? '#f59e0b' : '#a78bfa';
    ctx.fill();
    ctx.strokeStyle = '#08080f'; ctx.lineWidth = 2; ctx.stroke();
  });
}

/* ═══════════════════════════════════════════════
   H2H CALCULATION
═══════════════════════════════════════════════ */
function calcH2H(pid) {
  const result = {};
  S.games.forEach(g => {
    if (!(g.players||[]).includes(pid)) return;
    (g.players||[]).forEach(opp => {
      if (opp === pid) return;
      if (!result[opp]) result[opp] = { w:0, l:0 };
      if (g.winner === pid)  result[opp].w++;
      else if (g.winner === opp) result[opp].l++;
    });
  });
  return result;
}

/* ═══════════════════════════════════════════════
   RENDER DASHBOARD
═══════════════════════════════════════════════ */
function renderDashboard() {
  const ps = Object.values(S.players);
  const gs = S.games;

  // Season banner
  const seasonEl = document.getElementById('dash-season');
  if (seasonEl) {
    if (gs.length >= 3) {
      const topP = [...ps].sort((a,b) => (b.mmr||1000)-(a.mmr||1000))[0];
      seasonEl.innerHTML = `
        <div class="season-banner" id="sb-link">
          <span class="sb-ico">⚡</span>
          <div class="sb-info">
            <h4>${gs.length} ${gs.length === 1 ? 'Spiel' : 'Spiele'} gespielt · Wizard Arena aktiv</h4>
            <p>${topP ? `Leader: ${topP.emoji||'🧙'} ${esc(topP.name)} · ${topP.mmr||1000} MMR` : 'Sei der Erste!'}</p>
          </div>
          <span class="sb-arrow">›</span>
        </div>`;
      document.getElementById('sb-link')?.addEventListener('click', () => switchTab('rankings'));
    } else {
      seasonEl.innerHTML = '';
    }
  }

  // Hero stats
  const totalGames = gs.length;
  const totalPlayers = ps.length;
  const topMMR = ps.length ? Math.max(...ps.map(p => p.mmr || 1000)) : 0;
  const highScore = ps.reduce((m,p) => Math.max(m, p.stats?.highScore||0), 0);

  document.getElementById('dash-hstats').innerHTML = [
    { v: totalGames,   l:'Spiele'       },
    { v: totalPlayers, l:'Spieler'      },
    { v: topMMR || '–', l:'Top MMR'    },
    { v: highScore || '–', l:'Rekord'  },
  ].map(s => `<div class="hstat"><div class="hstat-val">${s.v}</div><div class="hstat-lbl">${s.l}</div></div>`).join('');

  // Podium
  const byMMR = [...ps].sort((a,b) => (b.mmr||1000)-(a.mmr||1000)).slice(0,3);
  const podEl = document.getElementById('dash-podium');
  if (!byMMR.length) {
    podEl.innerHTML = '<div class="empty"><span class="empty-ico">🏆</span><p>Noch keine Spieler registriert</p></div>';
  } else {
    const order = [byMMR[1], byMMR[0], byMMR[2]].filter(Boolean);
    const cls   = [byMMR[1] ? 'pod2' : '', 'pod1', byMMR[2] ? 'pod3' : ''];
    const pos   = ['2.', '1.', '3.'];
    podEl.innerHTML = order.map((p,i) => {
      const c = p === byMMR[0] ? 'pod1' : p === byMMR[1] ? 'pod2' : 'pod3';
      const medal = c === 'pod1' ? '👑' : '';
      return `<div class="pod-player ${c}">
        <div class="pod-ava">${p.emoji || '🧙'}${medal ? `<span class="pod-crown">${medal}</span>` : ''}</div>
        <div class="pod-name">${esc(p.name)}</div>
        <div class="pod-mmr">${p.mmr || 1000} MMR</div>
        <div class="pod-base">${c === 'pod1' ? '🥇 1.' : c === 'pod2' ? '🥈 2.' : '🥉 3.'}</div>
      </div>`;
    }).join('');
  }

  // Recent games
  const recEl = document.getElementById('dash-recent');
  if (!gs.length) {
    recEl.innerHTML = '<div class="empty"><span class="empty-ico">🃏</span><p>Noch keine Spiele – erfasse deinen ersten Wizard-Abend!</p></div>';
  } else {
    recEl.innerHTML = gs.slice(0,8).map(g => {
      const w  = S.players[g.winner];
      const dt = fmtDate(g.date);
      const allPIds = g.players||[];
      const sorted  = [...allPIds].sort((a,b) => (g.scores?.[b]||0)-(g.scores?.[a]||0));
      const names   = allPIds.map(id => S.players[id]?.name || '?').join(', ');
      const ws      = g.scores?.[g.winner] ?? '?';
      const miniStandings = sorted.slice(0,3).map((pid,i) => {
        const p = S.players[pid]; const medal=['🥇','🥈','🥉'][i];
        return `<span style="margin-right:.3rem;font-size:.75rem">${medal}${esc(p?.name||'?')} <b style="font-family:monospace">${g.scores?.[pid]||0}</b></span>`;
      }).join('');
      return `<div class="rg-row" data-gid="${g.id}" style="cursor:pointer">
        <span class="rg-ava">${w?.emoji || '🧙'}</span>
        <div class="rg-info">
          <div class="rg-winner">🏆 ${esc(w?.name || '?')}</div>
          <div class="rg-players rg-standings">${miniStandings}</div>
          <div class="rg-players" style="margin-top:.1rem;opacity:.6">${esc(names)} · ${allPIds.length} Spieler</div>
        </div>
        <div class="rg-right">
          <div class="rg-score">${ws} Pkt</div>
          <div class="rg-date">${dt}</div>
          <button class="btn-rematch" data-gid="${g.id}" title="Dieselben Spieler nochmal">⚡ Nochmal</button>
        </div>
      </div>`;
    }).join('');

    // Quick rematch handlers
    recEl.querySelectorAll('.btn-rematch').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        quickRematch(btn.dataset.gid);
      });
    });

    // Clickable rows → game detail
    recEl.querySelectorAll('.rg-row[data-gid]').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.btn-rematch')) return;
        showGameDetail(row.dataset.gid);
      });
    });
  }

  // Global stats
  const totalWins = ps.reduce((s,p) => s + (p.stats?.wins||0), 0);
  const avgScore  = totalGames ? Math.round(ps.reduce((s,p) => s+(p.stats?.avgPoints||0),0)/Math.max(ps.length,1)) : 0;
  document.getElementById('dash-stats').innerHTML = [
    { ico:'🎮', v:totalGames,   l:'Gesamt Spiele'  },
    { ico:'🏆', v:totalWins,    l:'Gesamt Siege'   },
    { ico:'💰', v:avgScore,     l:'Ø Punkte'       },
    { ico:'🚀', v:highScore,    l:'Höchstpunktzahl'},
    { ico:'⚡',  v:totalPlayers, l:'Spieler'        },
    { ico:'🔮', v: ps.reduce((m,p) => Math.max(m,p.stats?.maxWinStreak||0),0), l:'Bester Streak' },
  ].map(s => `<div class="s-card"><span class="s-ico">${s.ico}</span><div class="s-val">${s.v}</div><div class="s-lbl">${s.l}</div></div>`).join('');

  animateCounters();
}

/* ═══════════════════════════════════════════════
   RENDER RANKINGS
═══════════════════════════════════════════════ */
function renderRankings() {
  const ps  = Object.values(S.players);
  const cat = S.rankCat;

  let sorted, valFn, subFn;

  if (cat === 'mmr') {
    sorted = [...ps].sort((a,b) => (b.mmr||1000)-(a.mmr||1000));
    valFn  = p => (p.mmr||1000)+' MMR';
    subFn  = p => `${p.stats?.wins||0} Siege · ${p.stats?.gamesPlayed||0} Spiele`;
  } else if (cat === 'wins') {
    sorted = [...ps].sort((a,b) => (b.stats?.wins||0)-(a.stats?.wins||0));
    valFn  = p => (p.stats?.wins||0)+' Siege';
    subFn  = p => `WR: ${winRate(p)}%`;
  } else if (cat === 'winrate') {
    sorted = [...ps].filter(p => (p.stats?.gamesPlayed||0) >= 3)
                    .sort((a,b) => winRate(b)-winRate(a));
    valFn  = p => winRate(p)+'%';
    subFn  = p => `${p.stats?.wins||0} Siege aus ${p.stats?.gamesPlayed||0}`;
  } else if (cat === 'avgscore') {
    sorted = [...ps].sort((a,b) => (b.stats?.avgPoints||0)-(a.stats?.avgPoints||0));
    valFn  = p => (p.stats?.avgPoints||0)+' Pkt';
    subFn  = p => `Max: ${p.stats?.highScore||0}`;
  } else if (cat === 'highscore') {
    sorted = [...ps].sort((a,b) => (b.stats?.highScore||0)-(a.stats?.highScore||0));
    valFn  = p => (p.stats?.highScore||0)+' Pkt';
    subFn  = p => `Ø: ${p.stats?.avgPoints||0}`;
  } else if (cat === 'streak') {
    sorted = [...ps].sort((a,b) => (b.stats?.maxWinStreak||0)-(a.stats?.maxWinStreak||0));
    valFn  = p => (p.stats?.maxWinStreak||0)+'🔥';
    subFn  = p => `Aktuell: ${p.stats?.winStreak||0}`;
  }

  const el = document.getElementById('rankings-list');
  if (!sorted.length) {
    el.innerHTML = '<div class="empty"><span class="empty-ico">🏆</span><p>Noch keine Spieler</p></div>';
    return;
  }

  const medals = ['g','s','b'];
  const labels = ['🥇','🥈','🥉'];
  el.innerHTML = sorted.map((p,i) => {
    const rc  = medals[i] || '';
    const rl  = i < 3 ? labels[i] : `#${i+1}`;
    const row = i < 3 ? ` r${i+1}` : '';
    const lv  = getLevelData(p.xp||0);
    const wr  = winRate(p);
    // Trend: compare MMR to what it would be with one fewer win (rough indicator)
    const prevMMR = calcMMR({ ...p.stats, wins: Math.max(0,(p.stats?.wins||0)-1), gamesPlayed: Math.max(1,(p.stats?.gamesPlayed||0)-1) });
    const trendUp = (p.mmr||1000) > prevMMR + 5;
    const trendDn = (p.mmr||1000) < prevMMR - 5;
    const trend   = trendUp ? '<span style="color:var(--gr);font-size:.7rem">▲</span>' : trendDn ? '<span style="color:var(--rd);font-size:.7rem">▼</span>' : '';
    return `<div class="rank-row${row}" style="animation-delay:${i*40}ms" data-pid="${p.id}">
      <div class="rrank ${rc}">${rl}</div>
      <div class="rava">${p.emoji||'🧙'}</div>
      <div class="rinfo">
        <div class="rname">${esc(p.name)} ${trend}</div>
        <div class="rsub">${subFn(p)} · Lv.${p.level||1} ${lv.cur.title}</div>
      </div>
      <div class="rval">${valFn(p)}</div>
    </div>`;
  }).join('');

  // Click row → open profile
  el.querySelectorAll('.rank-row').forEach(row => {
    row.addEventListener('click', () => {
      const pid = row.dataset.pid;
      if (!pid) return;
      S.profId = pid;
      document.getElementById('prof-sel').value = pid;
      switchTab('profile');
      renderProfile(pid);
    });
  });
}

/* ═══════════════════════════════════════════════
   RENDER PROFILE
═══════════════════════════════════════════════ */
function renderProfile(pid) {
  const el = document.getElementById('prof-content');
  if (!pid || !S.players[pid]) {
    el.innerHTML = '<div class="empty"><span class="empty-ico">👤</span><p>Spieler nicht gefunden</p></div>';
    return;
  }

  const p  = S.players[pid];
  const st = p.stats || {};
  const lv = getLevelData(p.xp || 0);
  const wr = winRate(p);
  const ach = p.achievements || [];

  // Banner gradient based on level
  const lvGrads = [
    'linear-gradient(135deg,#0d0520,#1a0a35,#0a1520)',
    'linear-gradient(135deg,#0d0520,#1a0a35,#0a1520)',
    'linear-gradient(135deg,#12052a,#1f0a48,#0a1025)',
    'linear-gradient(135deg,#1a0540,#2a0a60,#120520)',
    'linear-gradient(135deg,#20063a,#350c6a,#140528)',
    'linear-gradient(135deg,#250545,#3d0f7a,#180630)',
    'linear-gradient(135deg,#2a0550,#400b85,#1c0630)',
    'linear-gradient(135deg,#1a0a00,#3a1500,#2a0a00)',
    'linear-gradient(135deg,#2a1a00,#4a2800,#3a1800)',
    'linear-gradient(135deg,#3a2200,#5a3600,#4a2800)',
  ];
  const bannerBg = lvGrads[Math.min((p.level||1)-1, lvGrads.length-1)];

  // Rival: who beat them most
  const myGames = S.games.filter(g => (g.players||[]).includes(pid));
  const lossSrc = {};
  myGames.forEach(g => { if (g.winner && g.winner !== pid) lossSrc[g.winner] = (lossSrc[g.winner]||0)+1; });
  const rival = Object.entries(lossSrc).sort((a,b) => b[1]-a[1])[0];
  const rivalP = rival ? S.players[rival[0]] : null;

  // Recent games
  const recentGames = myGames.slice(0,5);

  // Recent achievements (last 3 unlocked)
  const myACH = ACH.filter(a => ach.includes(a.id));
  const lockedACH = ACH.filter(a => !ach.includes(a.id)).slice(0,4);

  el.innerHTML = `
    <div class="prof-banner" style="background:${bannerBg}">
      <button class="prof-edit-btn" data-pid="${pid}">✏️ Bearbeiten</button>
      <div class="prof-ava">${p.emoji||'🧙'}</div>
      <div class="prof-name">${esc(p.name)}</div>
      <div class="prof-title">${p.title||'Novize'}</div>
      <div class="prof-lv-row">
        <div class="prof-lv-badge">Level ${p.level||1}</div>
        <div class="prof-xp-wrap">
          <div class="prof-xp-bar"><div class="prof-xp-fill" id="pxpfill" style="width:0%"></div></div>
          <div class="prof-xp-txt">${p.xp||0} XP${lv.next ? ' · nächstes Level: '+lv.next.xp+' XP' : ' · MAX'}</div>
        </div>
      </div>
    </div>

    <div class="prof-stats-grid">
      <div class="pstat"><div class="pstat-val">${st.gamesPlayed||0}</div><div class="pstat-lbl">Spiele</div></div>
      <div class="pstat"><div class="pstat-val">${st.wins||0}</div><div class="pstat-lbl">Siege</div></div>
      <div class="pstat"><div class="pstat-val">${wr}%</div><div class="pstat-lbl">Winrate</div></div>
      <div class="pstat"><div class="pstat-val">${st.avgPoints||0}</div><div class="pstat-lbl">Ø Punkte</div></div>
      <div class="pstat"><div class="pstat-val">${st.highScore||0}</div><div class="pstat-lbl">Rekord</div></div>
      <div class="pstat"><div class="pstat-val">${st.maxWinStreak||0}🔥</div><div class="pstat-lbl">Bester Streak</div></div>
    </div>

    ${rivalP ? `<div class="prof-sub-title" style="margin-bottom:.5rem">⚔️ Größter Rivale</div>
    <div class="rival-card">
      <span class="rival-ico">${rivalP.emoji||'🧙'}</span>
      <div class="rival-info">
        <h4>${esc(rivalP.name)}</h4>
        <p>Hat dich ${rival[1]}× besiegt</p>
      </div>
    </div>` : ''}

    <div class="prof-sub-title">🎖 Achievements (${ach.length}/${ACH.length})</div>
    <div class="ach-showcase">
      ${myACH.slice(0,6).map(a => {
        const rc = RARITY_COLORS[a.r] || {};
        return `<div class="ach-badge-sm un" style="--rc:${rc.c};--rbg:${rc.bg}">${a.ico} ${esc(a.nm)}</div>`;
      }).join('')}
      ${lockedACH.map(a => `<div class="ach-badge-sm lk">${a.ico} ${esc(a.nm)}</div>`).join('')}
    </div>

    ${recentGames.length >= 2 ? `
    <div class="prof-sub-title">📈 Score-Verlauf (letzte ${recentGames.length} Spiele)</div>
    <div class="chart-wrap">
      <canvas id="score-chart" class="mini-chart" style="width:100%;height:100px;display:block"></canvas>
    </div>` : ''}

    <div class="prof-sub-title">⚔️ Head-to-Head</div>
    <div class="h2h-grid" id="h2h-grid">
      ${Object.entries(calcH2H(pid)).sort((a,b)=>(b[1].w+b[1].l)-(a[1].w+a[1].l)).slice(0,6).map(([opp, rec]) => {
        const op = S.players[opp];
        if (!op) return '';
        const total = rec.w + rec.l;
        const wpct  = total ? Math.round(rec.w/total*100) : 0;
        return `<div class="h2h-row">
          <span class="h2h-ava">${op.emoji||'🧙'}</span>
          <div class="h2h-name">${esc(op.name)}</div>
          <div class="h2h-rec">
            <span class="h2h-w">${rec.w}W</span>
            <span style="color:var(--tx3);margin:0 .25rem">·</span>
            <span class="h2h-l">${rec.l}L</span>
          </div>
          <div class="h2h-bar-wrap">
            <div class="h2h-bar-fill" style="width:${wpct}%"></div>
          </div>
          <div class="h2h-pct">${wpct}%</div>
        </div>`;
      }).join('') || '<div style="color:var(--tx3);font-size:.8rem;padding:.5rem">Noch keine Duelle</div>'}
    </div>

    <div class="prof-sub-title">📜 Letzte Spiele</div>
    ${recentGames.length ? recentGames.map(g => {
      const pos = (g.rankings||[]).indexOf(pid) + 1 || '?';
      const posEmoji = pos===1?'🥇':pos===2?'🥈':pos===3?'🥉':'🏅';
      const otherNames = (g.players||[]).filter(id=>id!==pid).map(id=>S.players[id]?.name||'?').join(', ');
      const myScore = g.scores?.[pid]||0;
      const isWin = g.winner === pid;
      return `<div class="hist-row${isWin?' hist-win':''}" data-gid="${g.id}" style="cursor:pointer">
        <span class="hist-pos">${posEmoji}</span>
        <div class="hist-info">
          <div class="hist-date">${fmtDate(g.date)}</div>
          <div class="hist-players">${esc(otherNames) || 'Solo'}</div>
        </div>
        <div class="hist-score">${myScore} Pkt</div>
        <button class="btn-rematch" data-gid="${g.id}" title="Nochmal spielen" style="margin-left:.5rem">⚡</button>
      </div>`;
    }).join('') : '<div class="empty" style="padding:1.5rem"><p>Noch keine Spiele</p></div>'}
  `;

  // Draw chart after DOM insertion
  if (recentGames.length >= 2) {
    const chartScores = [...recentGames].reverse().map(g => g.scores?.[pid] || 0);
    requestAnimationFrame(() => drawScoreChart('score-chart', chartScores));
  }

  // Quick rematch handlers
  document.querySelectorAll('#prof-content .btn-rematch').forEach(btn => {
    btn.addEventListener('click', () => quickRematch(btn.dataset.gid));
  });

  // Edit profile button
  document.querySelector('#prof-content .prof-edit-btn')?.addEventListener('click', e => {
    openEditPlayer(e.currentTarget.dataset.pid);
  });

  // Clickable history rows → game detail
  document.querySelectorAll('#prof-content .hist-row[data-gid]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.btn-rematch')) return;
      showGameDetail(row.dataset.gid);
    });
  });

  // Animate XP bar
  setTimeout(() => {
    const fill = document.getElementById('pxpfill');
    if (fill) fill.style.width = lv.pct + '%';
  }, 100);
}

/* ═══════════════════════════════════════════════
   RENDER NEW GAME – STEP 0 (players)
═══════════════════════════════════════════════ */
function renderNG0() {
  const ps = Object.values(S.players);
  const el = document.getElementById('pchk-grid');

  if (!ps.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="empty-ico">👤</span><p>Füge zuerst Spieler hinzu</p></div>';
    return;
  }

  el.innerHTML = ps.map(p => {
    const sel = S.ng.pids.includes(p.id) ? 'sel' : '';
    return `<div class="pchk-card ${sel}" data-pid="${p.id}">
      <span class="pchk-emo">${p.emoji||'🧙'}</span>
      <div class="pchk-name">${esc(p.name)}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('.pchk-card').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.pid;
      const idx = S.ng.pids.indexOf(pid);
      if (idx === -1) S.ng.pids.push(pid);
      else S.ng.pids.splice(idx,1);
      card.classList.toggle('sel', S.ng.pids.includes(pid));
    });
  });
}

/* ═══════════════════════════════════════════════
   RENDER NEW GAME – STEP 2 (input per mode)
═══════════════════════════════════════════════ */
function renderNG2() {
  const el  = document.getElementById('gs-input');
  const mode = S.ng.mode;

  if (mode === 'scores') {
    el.innerHTML = `
      <h2 class="step-h">Endpunkte eingeben</h2>
      <div class="scr-form" id="scr-form">
        ${S.ng.pids.map(pid => {
          const p = S.players[pid];
          return `<div class="scr-row">
            <div class="scr-ava">${p.emoji||'🧙'}</div>
            <div class="scr-name">${esc(p.name)}</div>
            <input type="number" class="scr-inp" data-pid="${pid}" placeholder="0" value="${S.ng.scores[pid]||''}">
          </div>`;
        }).join('')}
      </div>
      <div class="step-acts">
        <button class="btn-ghost" id="btn-ng2-back">← Zurück</button>
        <button class="btn-pri" id="btn-save-scores">💾 Spiel speichern</button>
      </div>`;

    document.getElementById('btn-ng2-back').onclick = () => goNGStep(1);
    document.getElementById('btn-save-scores').onclick = () => submitScores();

  } else if (mode === 'rounds') {
    const numR = S.ng.numRounds;
    S.ng.pids.forEach(pid => {
      if (!S.ng.roundData[pid]) S.ng.roundData[pid] = Array(numR).fill('');
    });

    const rounds = Array.from({ length: numR }, (_,i) => i+1);
    el.innerHTML = `
      <h2 class="step-h">Punkte pro Runde</h2>
      <div class="rnd-nav" id="rnd-nav">
        <span style="font-size:.75rem;color:var(--tx3)">Runden:</span>
        ${rounds.map(r => `<button class="btn-ghost rnd-nav-btn" data-rnd="${r}">R${r}</button>`).join('')}
        <button class="add-rnd-btn" id="add-rnd">+ Runde</button>
      </div>
      <div class="rnd-wrap">
        <table class="rnd-tbl">
          <thead>
            <tr>
              <th class="pcell">Spieler</th>
              ${rounds.map(r => `<th>R${r}</th>`).join('')}
              <th>Gesamt</th>
            </tr>
          </thead>
          <tbody id="rnd-tbody">
            ${S.ng.pids.map(pid => {
              const p = S.players[pid];
              return `<tr data-pid="${pid}">
                <td class="pcell">${p.emoji||'🧙'} ${esc(p.name)}</td>
                ${rounds.map(r => `<td><input type="number" class="rnd-inp" data-pid="${pid}" data-rnd="${r}" value="${S.ng.roundData[pid]?.[r-1]||''}"></td>`).join('')}
                <td class="tot" id="tot-${pid}">0</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="step-acts" style="margin-top:1rem">
        <button class="btn-ghost" id="btn-ng2-back">← Zurück</button>
        <button class="btn-pri" id="btn-save-rounds">💾 Spiel speichern</button>
      </div>`;

    // Round inputs
    el.querySelectorAll('.rnd-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const pid = inp.dataset.pid;
        const rnd = parseInt(inp.dataset.rnd) - 1;
        if (!S.ng.roundData[pid]) S.ng.roundData[pid] = [];
        S.ng.roundData[pid][rnd] = parseInt(inp.value) || 0;
        updateRoundTotals();
      });
    });

    document.getElementById('add-rnd').onclick = () => {
      S.ng.numRounds++;
      renderNG2();
    };

    document.getElementById('btn-ng2-back').onclick = () => goNGStep(1);
    document.getElementById('btn-save-rounds').onclick = () => submitRounds();
    updateRoundTotals();

  } else if (mode === 'photo') {
    el.innerHTML = `
      <h2 class="step-h">Punktezettel scannen</h2>
      <p style="color:var(--tx2);font-size:.83rem;text-align:center;margin-bottom:.6rem">
        OpenCV erkennt Perspektive · KI liest Punkte automatisch
      </p>
      <a href="wizard-sheet.html" target="_blank" class="sheet-hint-link">
        📄 OCR-optimiertes Spielblatt drucken
      </a>
      <div class="photo-btns">
        <input type="file" id="photo-inp-gal" accept="image/*" style="display:none">
        <button class="btn-pri" id="btn-photo-cam"><span style="font-size:1.1rem">📷</span> Kamera</button>
        <button class="btn-sec" id="btn-photo-gal"><span style="font-size:1.1rem">🖼</span> Galerie</button>
      </div>
      <div id="photo-state-area"></div>
      <div class="step-acts" style="margin-top:.75rem">
        <button class="btn-ghost" id="btn-ng2-back">← Zurück</button>
      </div>`;

    document.getElementById('btn-ng2-back').onclick = () => goNGStep(1);
    document.getElementById('btn-photo-cam').onclick = () => openLiveScanner();
    document.getElementById('btn-photo-gal').onclick = () => document.getElementById('photo-inp-gal').click();
    document.getElementById('photo-inp-gal').onchange = e => { if (e.target.files[0]) handlePhotoFromFile(e.target.files[0]); };
  }
}

function updateRoundTotals() {
  S.ng.pids.forEach(pid => {
    const rounds = S.ng.roundData[pid] || [];
    const tot = rounds.reduce((s,v) => s + (parseInt(v)||0), 0);
    const el = document.getElementById('tot-'+pid);
    if (el) el.textContent = tot;
  });
}

async function submitScores() {
  const scores = {};
  let valid = true;
  document.querySelectorAll('.scr-inp').forEach(inp => {
    const pid = inp.dataset.pid;
    const v   = parseInt(inp.value);
    if (isNaN(v)) { valid = false; inp.style.borderColor='var(--rd)'; return; }
    scores[pid] = v;
    inp.style.borderColor = '';
  });

  if (!valid) { toast('Bitte alle Punkte eingeben!','err'); return; }
  if (Object.keys(scores).length < 2) { toast('Mind. 2 Spieler!','err'); return; }

  const btn = document.getElementById('btn-save-scores') || document.getElementById('btn-save-ocr');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichern…'; }

  try {
    const { winner, newlyUnlocked } = await saveGame(scores);
    showConfetti();
    renderAll();
    // Show result screen in-place
    document.getElementById('gs-players').classList.remove('active');
    document.getElementById('gs-mode').classList.remove('active');
    const gsInput = document.getElementById('gs-input');
    gsInput.classList.add('active');
    showGameResult(scores, newlyUnlocked);
    toast(`🏆 ${esc(S.players[winner]?.name)} gewinnt!`, 'ok');
    if (newlyUnlocked.length) setTimeout(() => processAchQueue(newlyUnlocked), 1200);
  } catch(e) {
    toast('Fehler beim Speichern!','err');
    console.error(e);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Spiel speichern'; }
  }
}

async function submitRounds() {
  const scores = {};
  S.ng.pids.forEach(pid => {
    const rounds = S.ng.roundData[pid] || [];
    scores[pid] = rounds.reduce((s,v) => s+(parseInt(v)||0), 0);
  });

  if (Object.keys(scores).length < 2) { toast('Mind. 2 Spieler!','err'); return; }

  const btn = document.getElementById('btn-save-rounds');
  btn.disabled = true; btn.textContent = '⏳ Speichern…';

  try {
    const { winner, newlyUnlocked } = await saveGame(scores, S.ng.roundData);
    showConfetti();
    renderAll();
    document.getElementById('gs-players').classList.remove('active');
    document.getElementById('gs-mode').classList.remove('active');
    const gsInput = document.getElementById('gs-input');
    gsInput.classList.add('active');
    showGameResult(scores, newlyUnlocked);
    toast(`🏆 ${esc(S.players[winner]?.name)} gewinnt!`, 'ok');
    if (newlyUnlocked.length) setTimeout(() => processAchQueue(newlyUnlocked), 1200);
  } catch(e) {
    toast('Fehler beim Speichern!','err');
    console.error(e);
    btn.disabled = false; btn.textContent = '💾 Spiel speichern';
  }
}

// ── Image preprocessing: adaptive local contrast + GPU unsharp mask ──
async function preprocessForOCR(file) {
  return new Promise(resolve => {
    const img = new Image();
    const rawUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(rawUrl);

      // Scale to at least 2400px on the long edge (better DPI for Tesseract)
      const longEdge = Math.max(img.width, img.height);
      const scale = longEdge < 2400 ? 2400 / longEdge : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      // ── A: Grayscale ──
      const gray = new Float32Array(w * h);
      for (let i = 0; i < d.length; i += 4)
        gray[i >> 2] = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];

      // ── B: Local mean via downsampled grid (DS=16, fast) ──
      const DS = 16;
      const dw = Math.ceil(w / DS), dh = Math.ceil(h / DS);
      const dsM = new Float32Array(dw * dh);
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          let s = 0, c = 0;
          for (let dy = 0; dy < DS; dy++) {
            for (let dx = 0; dx < DS; dx++) {
              const py = y*DS+dy, px = x*DS+dx;
              if (py < h && px < w) { s += gray[py*w+px]; c++; }
            }
          }
          dsM[y*dw+x] = c ? s/c : 128;
        }
      }
      // Smooth the grid (7×7 box blur) to avoid block edges
      const smM = new Float32Array(dw * dh);
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          let s = 0, c = 0;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const ny = y+dy, nx = x+dx;
              if (ny >= 0 && ny < dh && nx >= 0 && nx < dw) { s += dsM[ny*dw+nx]; c++; }
            }
          }
          smM[y*dw+x] = c ? s/c : 128;
        }
      }

      // ── C: Adaptive contrast per pixel (bilinear interpolation of mean) ──
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const fx = Math.min(x/DS, dw-1.001), fy = Math.min(y/DS, dh-1.001);
          const ix = Math.floor(fx), iy = Math.floor(fy);
          const tx = fx-ix, ty = fy-iy;
          const mean = smM[iy*dw+ix]       * (1-tx)*(1-ty)
                     + smM[iy*dw+ix+1]     * tx*(1-ty)
                     + smM[(iy+1)*dw+ix]   * (1-tx)*ty
                     + smM[(iy+1)*dw+ix+1] * tx*ty;
          const v = Math.max(0, Math.min(255, Math.round(128 + (gray[y*w+x] - mean) * 2.5)));
          const i = (y*w+x)*4;
          d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // ── D: Unsharp mask using GPU blur (fast, no extra JS loop) ──
      const blurC = document.createElement('canvas');
      blurC.width = w; blurC.height = h;
      const blurCtx = blurC.getContext('2d');
      blurCtx.filter = 'blur(1.5px)';
      blurCtx.drawImage(canvas, 0, 0);
      const bd = blurCtx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.max(0, Math.min(255, Math.round(d[i] + 1.5 * (d[i] - bd[i]))));
        d[i] = d[i+1] = d[i+2] = v;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(blob => resolve(blob), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(rawUrl); resolve(file); };
    img.src = rawUrl;
  });
}

// ── Merge two OCR passes: pass1 for names+layout, pass2 (numbers-only) for score values ──
function parseOCRBoth(pass1Data, pass2Data) {
  const scores = {}, detectedPids = [];
  const players = Object.entries(S.players)
    .map(([pid, p]) => ({ pid, name: (p.name||'').toLowerCase().trim(), words: (p.name||'').split(/\s+/).filter(w=>w.length>2) }))
    .filter(p => p.name);
  if (!players.length) return { scores, detectedPids };

  // ── Step 1: find each player's column center from pass1 word bboxes ──
  const p1Words = pass1Data.words || [];
  const cols = {}; // pid → {cx, nameY}
  players.forEach(({ pid, name, words }) => {
    const hit = p1Words.find(w => {
      const lc = w.text.toLowerCase();
      return lc.includes(name) || words.some(nw => nw.length > 2 && lc.includes(nw));
    });
    if (hit) cols[pid] = { cx: (hit.bbox.x0 + hit.bbox.x1) / 2, nameY: (hit.bbox.y0 + hit.bbox.y1) / 2 };
  });

  // ── Step 2: from pass2 (digits only), find the score in each player's column ──
  const imgW = (pass1Data.lines?.[0]?.bbox?.x1 || pass1Data.words?.[0]?.bbox?.x1 || 800);
  const colTol = Math.max(60, imgW * 0.10); // 10% image width tolerance

  // Only real numbers from pass2
  const numWords = (pass2Data.words || [])
    .filter(w => /^-?\d{1,4}$/.test(w.text.trim()))
    .sort((a, b) => b.bbox.y0 - a.bbox.y0); // bottommost first (totals)

  Object.entries(cols).forEach(([pid, { cx, nameY }]) => {
    // Candidates: in the same column, below the name row
    const cands = numWords.filter(w => {
      const wcx = (w.bbox.x0 + w.bbox.x1) / 2;
      return Math.abs(wcx - cx) < colTol && w.bbox.y0 > nameY;
    });
    if (!cands.length) return;

    // Bottommost candidate = final total (first in sorted array)
    // But sanity-check: avoid insane values (Wizard scores rarely exceed ±500 per round)
    const best = cands.find(c => Math.abs(parseInt(c.text)) < 3000) || cands[0];
    scores[pid] = parseInt(best.text.trim());
    detectedPids.push(pid);
  });

  // ── Step 3: fall back to text-based parsing for any player not yet found ──
  if (detectedPids.length < players.length) {
    const textParsed = parseOCRText(pass1Data.text);
    players.forEach(({ pid }) => {
      if (scores[pid] === undefined && textParsed.scores[pid] !== undefined) {
        scores[pid] = textParsed.scores[pid];
        detectedPids.push(pid);
      }
    });
  }

  return { scores, detectedPids };
}

async function handlePhoto(file) {
  if (!file) return;
  const areaEl = document.getElementById('photo-state-area');
  const url    = URL.createObjectURL(file);

  areaEl.innerHTML = `
    <div class="photo-state-wrap">
      <img class="photo-preview-img" src="${url}" alt="Zettel">
      <div class="ocr-status-bar" id="ocr-sb">
        <span class="ocr-sb-ico" id="ocr-sb-ico">🔍</span>
        <div class="ocr-sb-info">
          <div class="ocr-sb-msg" id="ocr-sb-msg">Wird vorbereitet…</div>
          <div class="ocr-sb-bar"><div class="ocr-sb-fill" id="ocr-sb-fill"></div></div>
        </div>
      </div>
    </div>`;

  const setMsg  = t => { const el = document.getElementById('ocr-sb-msg');  if (el) el.textContent = t; };
  const setIco  = t => { const el = document.getElementById('ocr-sb-ico');  if (el) el.textContent = t; };
  const setFill = p => { const el = document.getElementById('ocr-sb-fill'); if (el) el.style.width = p + '%'; };

  const [Tesseract] = await Promise.all([
    loadTesseract(),
    loadOpenCV() // load in parallel – ~8 MB but cached after first use
  ]);

  if (!Tesseract) {
    const sb = document.getElementById('ocr-sb');
    if (sb) sb.innerHTML = `<span class="ocr-sb-ico">📝</span><div class="ocr-sb-info"><div class="ocr-sb-msg">OCR nicht verfügbar – manuell eingeben</div></div>`;
    return renderOCRResult({}, areaEl, false);
  }

  try {
    // ── Step 1: Perspective correction (OpenCV) ──
    setIco('📐'); setMsg('OpenCV – Blatterkennung…'); setFill(3);
    let blob = await (async () => { const r = await fetch(url); return r.blob(); })();
    blob = await correctPerspective(blob, setMsg);
    setFill(10);

    // ── Step 2: Adaptive contrast + sharpening ──
    setIco('✨'); setMsg('Bild wird optimiert…');
    const processed = await preprocessForOCR(blob);
    setFill(16);

    const tOpts = (extra = {}) => ({
      tessedit_pageseg_mode:    '6',  // single uniform text block
      tessedit_ocr_engine_mode: '1',  // LSTM only – most accurate
      ...extra,
      logger: m => {
        if (m.status !== 'recognizing text') return;
        const pct = Math.round(m.progress * 100);
        if (extra.tessedit_char_whitelist) {
          setFill(58 + Math.round(m.progress * 42));
          setMsg(`Scan 2/2 – Ziffernerkennung… ${pct}%`);
        } else {
          setFill(16 + Math.round(m.progress * 42));
          setMsg(`Scan 1/2 – Texterkennung… ${pct}%`);
        }
      }
    });

    // ── Step 3: Pass 1 – full language (names + layout) ──
    setIco('🔍'); setMsg('Scan 1/2 – Namen & Struktur…');
    const r1 = await Tesseract.recognize(processed, 'deu+eng', tOpts());
    setFill(58); setIco('🔢'); setMsg('Scan 2/2 – Ziffernerkennung…');

    // ── Step 4: Pass 2 – digits-only whitelist (cleaner numbers) ──
    const r2 = await Tesseract.recognize(processed, 'eng', tOpts({
      tessedit_char_whitelist: '-0123456789'
    }));

    document.getElementById('ocr-sb')?.remove();
    URL.revokeObjectURL(url);

    // ── Step 5: Render results ──
    renderOCRRaw(r1.data, areaEl);
    renderOCRResult(parseOCRBoth(r1.data, r2.data), areaEl, true);

  } catch (e) {
    console.warn('OCR pipeline error:', e);
    URL.revokeObjectURL(url);
    const sb = document.getElementById('ocr-sb');
    if (sb) sb.innerHTML = `<span class="ocr-sb-ico">⚠️</span><div class="ocr-sb-info"><div class="ocr-sb-msg">Scan fehlgeschlagen – bitte manuell eingeben</div></div>`;
    renderOCRResult({}, areaEl, false);
  }
}

/* ═══════════════════════════════════════════════════════════════
   SCANNER SYSTEM  (kein OpenCV im Live-Loop – zu langsam mobil)
   Workflow: getUserMedia → capture frame → optional perspective
             correction with timeout → preprocess → 2-pass
             Tesseract → review modal → save
═══════════════════════════════════════════════════════════════ */

const SC = { stream: null, rafId: null };

// ── Scanner öffnen ──────────────────────────────────────────────
async function openLiveScanner() {
  const modal = document.getElementById('modal-scanner');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  // Kamera + Tesseract parallel vorladen
  loadTesseract().catch(() => {});

  setScannerHint('Kamera wird gestartet…');
  setScannerStatus('🎥', '');

  const video = document.getElementById('scanner-video');
  video.style.display = '';
  document.getElementById('sc-corners').classList.add('scanning');

  try {
    SC.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = SC.stream;

    // play() kann auf iOS durch Benutzeraktion geblockt werden – Fehler abfangen
    try { await video.play(); } catch (_) {}

    setScannerStatus('📷', '');
    setScannerHint('Halte die Kamera gerade über den Zettel und tippe auf den Auslöser');
    document.getElementById('sc-corners').classList.remove('scanning');
    document.getElementById('sc-corners').classList.add('detected');

  } catch (err) {
    console.warn('getUserMedia:', err);
    // Kein Kamerazugriff → Fallback auf Galerie
    video.style.display = 'none';
    setScannerStatus('⚠️', '');
    setScannerHint('Kamera nicht verfügbar – wähle ein Foto aus der Galerie (🖼 oben rechts)');
    document.getElementById('btn-scanner-capture').style.opacity = '.3';
    document.getElementById('btn-scanner-capture').style.pointerEvents = 'none';
  }
}

function setScannerStatus(icon, text) {
  const si = document.getElementById('scanner-status-icon');
  const st = document.getElementById('scanner-status-text');
  if (si) si.textContent = icon;
  if (st) st.textContent = text;
}

function setScannerHint(text) {
  const el = document.getElementById('scanner-tip');
  if (el) el.textContent = text;
}

// ── Foto aus Kamera aufnehmen ────────────────────────────────────
async function captureFromScanner() {
  const video = document.getElementById('scanner-video');

  // Rahmen aufnehmen
  let blob;
  if (SC.stream && video.videoWidth) {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  } else {
    toast('Kein Kamerabild – bitte Galerie nutzen', 'err');
    return;
  }

  // Kamera sofort stoppen
  SC.stream?.getTracks().forEach(t => t.stop());
  SC.stream = null;

  closeScanner();
  await processBlob(blob);
}

// ── Datei aus Galerie verarbeiten ────────────────────────────────
async function handlePhotoFromFile(file) {
  closeScanner();
  const blob = await file.arrayBuffer().then(ab => new Blob([ab], { type: file.type }));
  await processBlob(blob);
}

// ── Kern-Pipeline: Blob → OCR → Review ──────────────────────────
async function processBlob(blob) {
  // Processing-Modal einblenden
  const procModal = document.getElementById('modal-scan-result');
  const body      = document.getElementById('scan-result-body');
  procModal.classList.remove('hidden');
  procModal.setAttribute('aria-hidden', 'false');

  const STEPS = [
    'Bild aufnehmen',
    'Kontrast optimieren',
    'Perspektive korrigieren',
    'Scan 1/2 – Text',
    'Scan 2/2 – Zahlen',
    'Ergebnis aufbereiten',
  ];
  const renderProc = (active, pct, note = '') => {
    body.innerHTML = `
      <div style="padding:2rem 1rem">
        <div style="text-align:center;font-size:2rem;margin-bottom:1.2rem;animation:spin 1.2s linear infinite">⚙️</div>
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.2rem">
          ${STEPS.map((s, i) => `
            <div style="display:flex;align-items:center;gap:.7rem;color:${i < active ? '#10b981' : i === active ? '#fff' : 'rgba(255,255,255,.3)'}">
              <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${i < active ? '#10b981' : i === active ? 'var(--pu)' : 'rgba(255,255,255,.15)'}"></div>
              <span style="font-size:.82rem">${s}</span>
              ${i < active ? '<span style="margin-left:auto;font-size:.7rem">✓</span>' : ''}
            </div>`).join('')}
        </div>
        <div style="height:4px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden;margin-bottom:.5rem">
          <div style="height:100%;background:linear-gradient(90deg,var(--pu),var(--go));border-radius:99px;transition:width .4s ease;width:${pct}%"></div>
        </div>
        ${note ? `<p style="font-size:.72rem;color:var(--tx2);text-align:center">${note}</p>` : ''}
      </div>`;
  };

  try {
    // Step 1: done immediately
    renderProc(1, 8);

    // Step 2: Kontrast-Preprocessing (rein JS, kein OpenCV nötig)
    renderProc(1, 10, 'Bild wird aufbereitet…');
    const enhanced = await preprocessForOCR(blob);
    renderProc(2, 22);

    // Step 3: Perspektivkorrektur – mit 10s Timeout, nie blockierend
    renderProc(2, 24, 'OpenCV lädt (einmalig ~8 MB)…');
    let toProcess = enhanced;
    try {
      const corrected = await Promise.race([
        correctPerspective(blob, () => {}),
        new Promise(r => setTimeout(() => r(null), 10000))
      ]);
      if (corrected && corrected !== blob) {
        toProcess = await preprocessForOCR(corrected);
        renderProc(3, 36, 'Perspektive korrigiert ✓');
      } else {
        renderProc(3, 36, 'Perspektive: kein Blatt erkannt, weiter ohne');
      }
    } catch (_) {
      renderProc(3, 36, 'Perspektive übersprungen');
    }

    // Tesseract laden
    renderProc(3, 38, 'Texterkennung startet…');
    const Tesseract = await loadTesseract();
    if (!Tesseract) throw new Error('Tesseract konnte nicht geladen werden');

    const mkOpts = (extra = {}) => ({
      tessedit_pageseg_mode:    '6',
      tessedit_ocr_engine_mode: '1',
      ...extra,
      logger: m => {
        if (m.status !== 'recognizing text') return;
        const pct = Math.round(m.progress * 100);
        if (extra.tessedit_char_whitelist) {
          renderProc(4, 68 + Math.round(m.progress * 24), `Ziffernscan… ${pct}%`);
        } else {
          renderProc(3, 38 + Math.round(m.progress * 30), `Textscan… ${pct}%`);
        }
      }
    });

    // Step 4: Pass 1 – volle Sprache
    renderProc(3, 38, 'Pass 1: Namen & Struktur…');
    const r1 = await Tesseract.recognize(toProcess, 'deu+eng', mkOpts());
    renderProc(4, 68);

    // Step 5: Pass 2 – nur Ziffern
    renderProc(4, 68, 'Pass 2: Ziffern isoliert…');
    const r2 = await Tesseract.recognize(toProcess, 'eng', mkOpts({ tessedit_char_whitelist: '-0123456789' }));
    renderProc(5, 93);

    // Step 6: Ergebnis
    renderProc(5, 95, 'Analyse…');
    const parsed = parseOCRBoth(r1.data, r2.data);
    renderProc(6, 100);

    await new Promise(r => setTimeout(r, 350));
    showScanResult(parsed, r1.data);

  } catch (e) {
    console.error('processBlob:', e);
    body.innerHTML = `
      <div style="padding:2rem;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
        <p style="color:var(--tx);font-weight:600;margin-bottom:.5rem">Scan fehlgeschlagen</p>
        <p style="color:var(--tx2);font-size:.82rem;margin-bottom:1.5rem">${esc(e.message || 'Unbekannter Fehler')}</p>
        <button class="btn-ghost" onclick="closeScanResult()">Schließen</button>
      </div>`;
  }
}

// ── Ergebnis-Review anzeigen ─────────────────────────────────────
function showScanResult(parsed, pass1Data) {
  const scores       = parsed?.scores || {};
  const detectedPids = parsed?.detectedPids || [];

  detectedPids.forEach(pid => { if (!S.ng.pids.includes(pid)) S.ng.pids.push(pid); });
  if (!S.ng.pids.length) S.ng.pids = Object.keys(S.players);

  const pids  = S.ng.pids;
  const found = pids.filter(pid => scores[pid] !== undefined).length;
  const total = pids.length;

  const badge = found === total
    ? `<span class="review-badge review-badge-ok">✅ Alle ${total} Spieler erkannt</span>`
    : found > 0
    ? `<span class="review-badge review-badge-warn">⚠️ ${found} von ${total} erkannt – Rest manuell prüfen</span>`
    : `<span class="review-badge review-badge-err">❌ Keine Spieler erkannt – manuell eingeben</span>`;

  const cards = pids.map(pid => {
    const p      = S.players[pid];
    const val    = scores[pid];
    const ok     = val !== undefined;
    const insane = ok && (val < -300 || val > 600);
    return `
      <div class="ocr-card" style="border-color:${insane?'rgba(239,68,68,.45)':ok?'rgba(16,185,129,.35)':'rgba(255,255,255,.08)'}">
        <div class="ocr-card-left">
          <span class="ocr-card-ava">${p?.emoji||'🧙'}</span>
          <div class="ocr-card-info">
            <div class="ocr-card-name">${esc(p?.name||'?')}</div>
            ${insane ? `<span class="ocr-badge ocr-badge-r">⚠ prüfen</span>`
              : ok   ? `<span class="ocr-badge ocr-badge-g">✓ erkannt</span>`
                     : `<span class="ocr-badge ocr-badge-x">? manuell</span>`}
          </div>
        </div>
        <div class="ocr-card-right">
          <input type="number" class="ocr-score-inp scr-inp" data-pid="${pid}"
            placeholder="0" value="${ok ? val : ''}"
            style="${insane?'color:#ef4444':''}">
          <span class="ocr-unit">Pkt</span>
        </div>
      </div>`;
  }).join('');

  const rawHtml = (pass1Data?.lines||[]).filter(l=>l.text.trim()).map(line => {
    const words = (line.words||[]).map(w => {
      const isNum = /^-?\d+$/.test(w.text.trim());
      const c = Math.round(w.confidence);
      if (isNum) return `<span class="${confClass(c)}" title="${c}%">${esc(w.text)}</span>`;
      const lc = w.text.toLowerCase();
      const isName = Object.values(S.players).some(p =>
        (p.name||'').split(/\s+/).some(n => n.length>2 && lc.includes(n.toLowerCase())));
      return `<span style="${isName?'color:var(--pu2);font-weight:600':'color:var(--tx2)'}">${esc(w.text)}</span>`;
    }).join(' ');
    return `<div style="font-family:var(--mono);font-size:.74rem;line-height:1.8">${words}</div>`;
  }).join('');

  const body = document.getElementById('scan-result-body');
  body.innerHTML = `
    <div class="review-summary">${badge}</div>
    <div class="ocr-cards" style="margin-bottom:1rem">${cards}</div>
    <details class="ocr-raw-details" style="margin-bottom:1rem">
      <summary class="ocr-raw-summary">📋 OCR Rohdaten ansehen</summary>
      <div class="ocr-raw-legend">
        <span class="ocr-raw-num-g" style="padding:1px 6px">■ sicher</span>
        <span class="ocr-raw-num-y" style="padding:1px 6px">■ unsicher</span>
        <span class="ocr-raw-num-r" style="padding:1px 6px">■ schwer lesbar</span>
      </div>
      <div class="ocr-raw-body">${rawHtml||'<p style="color:var(--tx2);font-size:.8rem;padding:.5rem">Keine Daten</p>'}</div>
    </details>`;

  body.querySelectorAll('.ocr-score-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      const v = parseInt(inp.value);
      inp.style.color = !isNaN(v) && (v<-300||v>600) ? '#ef4444' : '';
    });
  });
}

// ── Modals schließen ─────────────────────────────────────────────
function closeScanner() {
  SC.stream?.getTracks().forEach(t => t.stop());
  SC.stream = null;
  const m = document.getElementById('modal-scanner');
  if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); }
  // Reset capture button
  const cap = document.getElementById('btn-scanner-capture');
  if (cap) { cap.style.opacity=''; cap.style.pointerEvents=''; }
}

function closeScanResult() {
  const m = document.getElementById('modal-scan-result');
  if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); }
  document.getElementById('scan-result-body').innerHTML = '';
}

// ── Event-Verdrahtung (einmalig) ─────────────────────────────────
function initScannerEvents() {

  // Scanner schließen
  document.getElementById('btn-scanner-close')?.addEventListener('click', closeScanner);

  // Auslöser
  document.getElementById('btn-scanner-capture')?.addEventListener('click', captureFromScanner);

  // Galerie (im Scanner-Modal)
  document.getElementById('btn-scanner-gallery')?.addEventListener('click', () => {
    document.getElementById('scanner-gallery-inp')?.click();
  });
  document.getElementById('scanner-gallery-inp')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) handlePhotoFromFile(file);
    e.target.value = '';
  });

  // Ergebnis: Neu scannen
  document.getElementById('btn-result-back')?.addEventListener('click', () => {
    closeScanResult();
    openLiveScanner();
  });

  // Ergebnis: Speichern
  document.getElementById('btn-result-save')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-result-save');
    btn.disabled = true; btn.textContent = '⏳';
    const scores = {};
    let valid = true;
    document.querySelectorAll('#scan-result-body .scr-inp').forEach(inp => {
      const v = parseInt(inp.value);
      if (isNaN(v)) { valid = false; inp.style.outline = '2px solid var(--rd)'; }
      else { scores[inp.dataset.pid] = v; inp.style.outline = ''; }
    });
    if (!valid) {
      toast('Bitte alle Punkte eingeben!', 'err');
      btn.disabled = false; btn.textContent = '💾 Speichern';
      return;
    }
    if (Object.keys(scores).length < 2) {
      toast('Mind. 2 Spieler!', 'err');
      btn.disabled = false; btn.textContent = '💾 Speichern';
      return;
    }
    try {
      const { winner, newlyUnlocked } = await saveGame(scores);
      closeScanResult();
      showConfetti();
      renderAll();
      toast(`🏆 ${esc(S.players[winner]?.name)} gewinnt!`, 'ok');
      if (newlyUnlocked.length) setTimeout(() => processAchQueue(newlyUnlocked), 1200);
    } catch (e) {
      console.error(e);
      toast('Fehler beim Speichern!', 'err');
      btn.disabled = false; btn.textContent = '💾 Speichern';
    }
  });
}

let _tesseract = null;
async function loadTesseract() {
  if (_tesseract) return _tesseract;
  return new Promise(resolve => {
    if (window.Tesseract) { _tesseract = window.Tesseract; resolve(_tesseract); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
    s.onload  = () => { _tesseract = window.Tesseract; resolve(_tesseract); };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

// ── OpenCV.js lazy load ──
let _cv = null;
async function loadOpenCV() {
  if (_cv) return _cv;
  if (window.cv?.warpPerspective) { _cv = window.cv; return _cv; }
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://docs.opencv.org/4.10.0/opencv.js';
    s.async = true;
    s.onload = () => {
      const init = () => { _cv = window.cv; resolve(_cv); };
      if (window.cv?.warpPerspective) { init(); return; }
      window.cv = window.cv || {};
      const prev = window.cv.onRuntimeInitialized;
      window.cv.onRuntimeInitialized = () => { if (prev) prev(); init(); };
      setTimeout(() => resolve(null), 20000); // timeout fallback
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

// ── Geometry helpers ──
function ptDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function sortCorners(pts) {
  // Returns [TL, TR, BR, BL] from 4 unsorted points
  const bySum  = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  return [bySum[0], byDiff[byDiff.length - 1], bySum[bySum.length - 1], byDiff[0]];
}

// ── Perspective correction: detect document boundary and warp ──
async function correctPerspective(blob, onStatus) {
  const cv = await loadOpenCV();
  if (!cv) return blob;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const dels = [];
      const T = m => { dels.push(m); return m; };
      const cleanup = () => dels.forEach(m => { try { m.delete(); } catch {} });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);

        const src     = T(cv.imread(canvas));
        const gray    = T(new cv.Mat());
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const blurred = T(new cv.Mat());
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        const edges   = T(new cv.Mat());
        cv.Canny(blurred, edges, 50, 150);

        const kernel  = T(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
        const dilated = T(new cv.Mat());
        cv.dilate(edges, dilated, kernel);

        const contours = T(new cv.MatVector());
        const hier     = T(new cv.Mat());
        cv.findContours(dilated, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        const imgArea = img.width * img.height;
        let maxArea = imgArea * 0.15; // ignore contours < 15% of image
        let bestApprox = null;

        for (let i = 0; i < contours.size(); i++) {
          const cnt  = contours.get(i);
          const area = cv.contourArea(cnt);
          const peri = cv.arcLength(cnt, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
          cnt.delete();
          if (approx.rows === 4 && area > maxArea) {
            maxArea = area;
            bestApprox?.delete();
            bestApprox = approx;
          } else { approx.delete(); }
        }

        if (bestApprox) {
          onStatus?.('📐 Blatt erkannt – Perspektive wird korrigiert…');
          const pts = [];
          for (let i = 0; i < 4; i++)
            pts.push({ x: bestApprox.data32S[i * 2], y: bestApprox.data32S[i * 2 + 1] });
          bestApprox.delete();

          const [tl, tr, br, bl] = sortCorners(pts);
          const w = Math.round(Math.max(ptDist(tl, tr), ptDist(bl, br)));
          const h = Math.round(Math.max(ptDist(tl, bl), ptDist(tr, br)));

          const srcM = T(cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]));
          const dstM = T(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]));
          const M    = T(cv.getPerspectiveTransform(srcM, dstM));
          const warped = T(new cv.Mat());
          cv.warpPerspective(src, warped, M, new cv.Size(w, h));

          const outC = document.createElement('canvas');
          outC.width = w; outC.height = h;
          cv.imshow(outC, warped);
          cleanup();
          outC.toBlob(b => resolve(b || blob), 'image/png');
        } else {
          onStatus?.('⚠️ Blatt nicht klar erkannt – direkt verarbeiten…');
          cleanup();
          resolve(blob);
        }
      } catch (e) {
        cleanup();
        console.warn('OpenCV perspective:', e);
        resolve(blob);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

function confClass(c) {
  return c >= 80 ? 'ocr-raw-num-g' : c >= 40 ? 'ocr-raw-num-y' : 'ocr-raw-num-r';
}

function renderOCRRaw(data, areaEl) {
  const lines = (data.lines || []).filter(l => l.text.trim().length > 0);
  if (!lines.length) return;

  // Build word→confidence lookup keyed by word text+line index to survive duplicates
  // We render line by line, word by word from Tesseract's own structure

  // ── Try to reconstruct table structure ──
  // Detect the "name row": the line where most player names appear
  const playerNames = Object.values(S.players).map(p => (p.name || '').toLowerCase().trim()).filter(Boolean);

  const nameLineIdx = lines.reduce((bestIdx, line, i) => {
    const lc = line.text.toLowerCase();
    const hits = playerNames.filter(n => n.split(/\s+/).some(w => w.length > 2 && lc.includes(w))).length;
    const prev = lines[bestIdx] ? playerNames.filter(n => n.split(/\s+/).some(w => w.length > 2 && lines[bestIdx].text.toLowerCase().includes(w))).length : 0;
    return hits > prev ? i : bestIdx;
  }, 0);

  // ── Render each line ──
  function renderWord(w) {
    const txt = esc(w.text);
    const isNum = /^-?\d+$/.test(w.text.trim());
    const c = Math.round(w.confidence);
    if (isNum) return `<span class="${confClass(c)}" title="${c}% Konfidenz">${txt}</span>`;
    // Is it a player name?
    const lc = w.text.toLowerCase();
    const isName = playerNames.some(n => n.split(/\s+/).some(p => p.length > 2 && lc.includes(p)));
    const style = isName ? 'color:var(--pu);font-weight:600' : 'color:var(--tx2)';
    return `<span style="${style}">${txt}</span>`;
  }

  // Build as table: each line = one row, each word = one cell
  // Detect likely "label" lines (first word is non-numeric text like "Runde", "Gesamt")
  const rows = lines.map((line, li) => {
    const words = line.words || [];
    const cells = words.map(w => {
      const isNum = /^-?\d+$/.test(w.text.trim());
      const c = Math.round(w.confidence);
      if (isNum) return `<td><span class="${confClass(c)}" title="${c}% Konfidenz">${esc(w.text)}</span></td>`;
      const lc = w.text.toLowerCase();
      const isName = playerNames.some(n => n.split(/\s+/).some(p => p.length > 2 && lc.includes(p)));
      if (li === nameLineIdx || isName) return `<td class="rt-head">${esc(w.text)}</td>`;
      return `<td class="rt-label">${esc(w.text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const legend = `<div class="ocr-raw-legend">
    <span class="ocr-raw-num-g" style="padding:1px 6px">■ sicher ≥80%</span>
    <span class="ocr-raw-num-y" style="padding:1px 6px">■ unsicher 40–79%</span>
    <span class="ocr-raw-num-r" style="padding:1px 6px">■ schwer lesbar &lt;40%</span>
  </div>`;

  const div = document.createElement('div');
  div.className = 'ocr-raw-wrap';
  div.innerHTML = `
    <details class="ocr-raw-details" open>
      <summary class="ocr-raw-summary">📋 OCR Rohdaten – zum Nachprüfen</summary>
      ${legend}
      <div class="ocr-raw-body">
        <table class="ocr-raw-table"><tbody>${rows}</tbody></table>
      </div>
    </details>`;
  areaEl.appendChild(div);
}

function parseOCRText(text) {
  const scores       = {};
  const detectedPids = [];

  const rawLines = text.split('\n').map(l => l.trimEnd());
  // Remove completely empty lines only at start/end; keep internal spacing for column alignment
  const lines = rawLines.filter((l, i, a) => {
    const trimmed = l.trim();
    if (trimmed.length === 0) return false; // drop blank lines
    return true;
  });

  const lcLines = lines.map(l => l.toLowerCase());

  // ── Helper: find column index (char position) of a name in a line ──
  function colOf(line, name) {
    const idx = line.toLowerCase().indexOf(name.toLowerCase());
    return idx;
  }

  // ── Helper: extract number from a string nearest to a given char position ──
  function numNearCol(line, col) {
    // Find all numbers with their positions
    const re = /-?\d+/g;
    let m, best = null, bestDist = Infinity;
    while ((m = re.exec(line)) !== null) {
      const mid = m.index + m[0].length / 2;
      const dist = Math.abs(mid - col);
      if (dist < bestDist) { bestDist = dist; best = parseInt(m[0]); }
    }
    return best; // null if no numbers
  }

  // ── Step 1: find which line each player's name is on ──
  const playerMeta = {}; // pid → { nameLineIdx, col }
  Object.entries(S.players).forEach(([pid, p]) => {
    const pname = (p.name || '').trim();
    if (!pname) return;
    const words = pname.split(/\s+/).filter(w => w.length > 2);

    for (let i = 0; i < lcLines.length; i++) {
      const lc = lcLines[i];
      const fullMatch = lc.includes(pname.toLowerCase());
      const wordMatch = words.some(w => lc.includes(w.toLowerCase()));
      if (fullMatch || wordMatch) {
        const col = colOf(lines[i], fullMatch ? pname : words.find(w => lc.includes(w.toLowerCase())));
        playerMeta[pid] = { nameLineIdx: i, col };
        break;
      }
    }
  });

  if (!Object.keys(playerMeta).length) return { scores, detectedPids };

  // ── Step 2: determine the name row (the one containing the most player names) ──
  const nameLineIdx = Object.values(playerMeta)
    .reduce((acc, { nameLineIdx }) => { acc[nameLineIdx] = (acc[nameLineIdx] || 0) + 1; return acc; }, {});
  const primaryNameLine = parseInt(Object.entries(nameLineIdx).sort((a, b) => b[1] - a[1])[0][0]);

  // ── Step 3: for each player, get their column position ──
  // Then scan from the LAST line upward looking for the totals row
  // (Gesamt / Total row is usually the last line with numbers)
  const numericLines = lines
    .map((l, i) => ({ i, nums: l.match(/-?\d+/g) }))
    .filter(x => x.nums && x.i > primaryNameLine);

  // The total row is the last numeric line (or a line containing "gesamt"/"total"/"summe")
  const gesamtIdx = lcLines.findIndex(l =>
    /gesamt|total|summe|σ|∑|sum/i.test(l) && l.match(/-?\d+/g)
  );
  const totalLine = gesamtIdx !== -1
    ? lines[gesamtIdx]
    : (numericLines.length ? lines[numericLines[numericLines.length - 1].i] : null);

  Object.entries(playerMeta).forEach(([pid, { nameLineIdx: nli, col }]) => {
    let score = null;

    // Priority 1: number in the totals line at the player's column position
    if (totalLine) score = numNearCol(totalLine, col);

    // Priority 2: number on the player's own name line (format "Nick 120")
    if (score === null) {
      const nameLine = lines[nli];
      const nums = nameLine.match(/-?\d+/g);
      if (nums) score = parseInt(nums[nums.length - 1]);
    }

    // Priority 3: last number in the player's column across all numeric lines
    if (score === null && numericLines.length) {
      // Use column position: pick the number closest to col on each numeric line,
      // take the value from the very last such line (most likely the running total)
      for (let k = numericLines.length - 1; k >= 0; k--) {
        const n = numNearCol(lines[numericLines[k].i], col);
        if (n !== null) { score = n; break; }
      }
    }

    if (score !== null) {
      scores[pid] = score;
      detectedPids.push(pid);
    }
  });

  return { scores, detectedPids };
}

function renderOCRResult(parsed, areaEl, ocrSuccess = true) {
  const scores       = (parsed && 'scores' in parsed) ? parsed.scores : (parsed || {});
  const detectedPids = (parsed && 'detectedPids' in parsed) ? parsed.detectedPids : [];

  // Auto-add detected players that weren't pre-selected
  const added = [];
  detectedPids.forEach(pid => {
    if (!S.ng.pids.includes(pid)) { S.ng.pids.push(pid); added.push(pid); }
  });
  if (!S.ng.pids.length) S.ng.pids = Object.keys(S.players);

  const total     = S.ng.pids.length;
  const detected  = S.ng.pids.filter(pid => scores[pid] !== undefined).length;
  const allGood   = ocrSuccess && detected === total && total > 0;
  const partGood  = ocrSuccess && detected > 0 && detected < total;

  // ── Status banner ──
  const statusIcon  = allGood ? '✅' : partGood ? '⚠️' : '📝';
  const statusColor = allGood ? 'var(--gr)' : partGood ? '#f59e0b' : 'var(--tx2)';
  const statusText  = !ocrSuccess
    ? 'Manuell eingeben – Werte prüfen und bestätigen'
    : allGood
    ? `Alle ${total} Spieler erkannt – bitte trotzdem prüfen`
    : partGood
    ? `${detected} von ${total} erkannt – fehlende manuell ergänzen`
    : 'Keine Werte erkannt – manuell eingeben';

  const addedNote = added.length
    ? `<div class="ocr-added-note">✨ ${added.map(p => S.players[p]?.name).filter(Boolean).join(', ')} automatisch hinzugefügt</div>`
    : '';

  // ── Player review cards ──
  const cards = S.ng.pids.map(pid => {
    const p      = S.players[pid];
    const val    = scores[pid];
    const found  = val !== undefined;
    // Plausibility check: Wizard totals are usually between -200 and +500
    const insane = found && (val < -300 || val > 600);
    const borderColor = insane
      ? 'rgba(239,68,68,.5)'
      : found ? 'rgba(16,185,129,.35)' : 'rgba(255,255,255,.08)';
    const badge = found
      ? insane
        ? `<span class="ocr-badge ocr-badge-r">⚠ prüfen</span>`
        : `<span class="ocr-badge ocr-badge-g">✓ erkannt</span>`
      : `<span class="ocr-badge ocr-badge-x">? manuell</span>`;

    return `<div class="ocr-card" style="border-color:${borderColor}" data-pid="${pid}">
      <div class="ocr-card-left">
        <span class="ocr-card-ava">${p?.emoji || '🧙'}</span>
        <div class="ocr-card-info">
          <div class="ocr-card-name">${esc(p?.name || '?')}</div>
          ${badge}
        </div>
      </div>
      <div class="ocr-card-right">
        <input type="number" class="ocr-score-inp scr-inp" data-pid="${pid}"
          placeholder="0" value="${found ? val : ''}"
          style="${insane ? 'color:#ef4444;' : ''}">
        <span class="ocr-unit">Pkt</span>
      </div>
    </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'ocr-review-wrap';
  div.innerHTML = `
    <div class="ocr-status-line" style="color:${statusColor}">
      <span>${statusIcon}</span>
      <span>${statusText}</span>
    </div>
    ${addedNote}
    <div class="ocr-cards">${cards}</div>
    <div class="step-acts" style="margin-top:1rem">
      <button class="btn-pri full" id="btn-save-ocr">💾 Spiel speichern</button>
    </div>`;
  areaEl.appendChild(div);

  // Live validation: highlight if value changes to insane range
  div.querySelectorAll('.ocr-score-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      const v = parseInt(inp.value);
      inp.style.color = (!isNaN(v) && (v < -300 || v > 600)) ? '#ef4444' : '';
    });
  });

  document.getElementById('btn-save-ocr')?.addEventListener('click', submitScores);
}

function resetNG() {
  S.ng = { step:0, pids:[], mode:null, roundData:{}, scores:{}, numRounds:10 };
}

/* ═══════════════════════════════════════════════
   RENDER ACHIEVEMENTS
═══════════════════════════════════════════════ */
function renderAchievements() {
  const pid    = S.achPid;
  const rarity = S.achRarity;
  const el     = document.getElementById('ach-grid');
  const p      = pid ? S.players[pid] : null;
  const unset  = new Set(p ? (p.achievements||[]) : []);

  let list = ACH;
  if (rarity !== 'all') list = list.filter(a => a.r === rarity);

  el.innerHTML = list.map(a => {
    const un = !pid || unset.has(a.id);
    const rc = RARITY_COLORS[a.r] || {};
    const rbc = `rb-${a.r}`;
    return `<div class="ach-card ${un?'un':'lk'}" data-r="${a.r}" title="${esc(a.ds)}">
      <span class="ach-card-ico">${a.ico}</span>
      <div class="ach-card-nm">${esc(a.nm)}</div>
      <div class="ach-card-ds">${esc(a.ds)}</div>
      <div><span class="rar-badge ${rbc}">${a.r}</span></div>
      <div class="ach-xp">+${a.xp} XP</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   PLAYER SELECT DROPDOWNS
═══════════════════════════════════════════════ */
function populateSelects() {
  const ps = Object.values(S.players).sort((a,b) => a.name.localeCompare(b.name));
  const opts = '<option value="">Spieler wählen…</option>' + ps.map(p => `<option value="${p.id}">${p.emoji||''} ${esc(p.name)}</option>`).join('');
  document.getElementById('prof-sel').innerHTML = opts;
  document.getElementById('ach-sel').innerHTML  = opts;
}

/* ═══════════════════════════════════════════════
   RENDER ALL
═══════════════════════════════════════════════ */
function renderAll() {
  populateSelects();
  renderDashboard();
  renderRankings();
  renderAchievements();
  if (S.profId) renderProfile(S.profId);
}

/* ═══════════════════════════════════════════════
   STEP NAVIGATION
═══════════════════════════════════════════════ */
function goNGStep(step) {
  S.ng.step = step;
  ['gs-players','gs-mode','gs-input'].forEach((id,i) => {
    document.getElementById(id)?.classList.toggle('active', i === step);
  });
  ['sdot-0','sdot-1','sdot-2'].forEach((id,i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('active', i === step);
    el.classList.toggle('done', i < step);
  });
  if (step === 2) renderNG2();
}

/* ═══════════════════════════════════════════════
   ACHIEVEMENT MODAL
═══════════════════════════════════════════════ */
let achQueue = [];
let achShowing = false;

function processAchQueue(items) {
  achQueue.push(...items);
  if (!achShowing) showNextAch();
}

function showNextAch() {
  if (!achQueue.length) { achShowing = false; return; }
  achShowing = true;
  const a   = achQueue.shift();
  const rc  = RARITY_COLORS[a.r] || {};
  const rbc = `rb-${a.r}`;

  document.getElementById('ach-burst').style.cssText = `--rbg:${rc.bg}`;
  document.getElementById('ach-ul-badge').textContent  = a.ico;
  document.getElementById('ach-ul-rar').innerHTML  = `<span class="rar-badge ${rbc}">${a.r}</span>`;
  document.getElementById('ach-ul-nm').textContent  = a.nm;
  document.getElementById('ach-ul-ds').textContent  = a.ds;
  document.getElementById('ach-ul-xp').textContent  = `+${a.xp} XP`;

  showModal('modal-ach-unlock');
  if (['legendary','mythic'].includes(a.r)) showConfetti();
}

/* ═══════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════ */
let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('wz-toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 3000);
}

/* ═══════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════ */
function showModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function hideModal(id)  { document.getElementById(id)?.classList.add('hidden'); }

/* ═══════════════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════════════ */
function switchTab(tab) {
  S.view = tab;
  document.querySelectorAll('.wz-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.wz-view').forEach(v => v.classList.toggle('active', v.id === 'view-'+tab));
}

/* ═══════════════════════════════════════════════
   PARTICLE BACKGROUND
═══════════════════════════════════════════════ */
function initParticles() {
  const c   = document.getElementById('wz-particles');
  const ctx = c.getContext('2d');
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  resize();
  addEventListener('resize', resize);

  const particles = Array.from({ length: 55 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    sz: Math.random() * 1.8 + 0.4,
    vx: (Math.random() - .5) * .25,
    vy: (Math.random() - .5) * .25,
    a:  Math.random() * .35 + .08,
    col: Math.random() > .5 ? '139,58,237' : '245,158,11',
  }));

  (function loop() {
    ctx.clearRect(0, 0, c.width, c.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > c.width)  p.vx *= -1;
      if (p.y < 0 || p.y > c.height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${p.col},${p.a})`;
      ctx.fill();
    });
    requestAnimationFrame(loop);
  })();
}

/* ═══════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════ */
function showConfetti() {
  const c   = document.getElementById('wz-confetti');
  const ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const cols = ['#7c3aed','#f59e0b','#10b981','#06b6d4','#ec4899','#fff','#fbbf24'];
  const pieces = Array.from({ length: 90 }, () => ({
    x: Math.random() * c.width,
    y: -20,
    sz: Math.random() * 10 + 4,
    vx: (Math.random() - .5) * 4,
    vy: Math.random() * 3 + 2,
    a:  Math.random() * Math.PI * 2,
    va: (Math.random() - .5) * .15,
    col: cols[Math.floor(Math.random()*cols.length)],
    life: 1,
  }));

  let frame = 0;
  const max = 120;
  (function loop() {
    ctx.clearRect(0,0,c.width,c.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.a += p.va; p.vy += .06;
      p.life = Math.max(0, 1 - frame/max);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.sz/2, -p.sz/4, p.sz, p.sz/2);
      ctx.restore();
    });
    if (++frame < max) requestAnimationFrame(loop);
    else ctx.clearRect(0,0,c.width,c.height);
  })();
}

/* ═══════════════════════════════════════════════
   COUNTER ANIMATION
═══════════════════════════════════════════════ */
function animateCounters() {
  document.querySelectorAll('.hstat-val, .s-val').forEach(el => {
    const target = parseFloat(el.textContent);
    if (isNaN(target) || target === 0) return;
    const start = performance.now();
    const dur = 900;
    (function tick(t) {
      const p = Math.min((t-start)/dur, 1);
      const ease = 1 - Math.pow(1-p, 3);
      el.textContent = Math.round(target * ease);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    })(start);
  });
}

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   CLIPBOARD SHARE
═══════════════════════════════════════════════ */
function shareResult(scores) {
  const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const medals = ['🥇','🥈','🥉','🏅'];
  const lines  = ['🧙 Wizard Arena Ergebnis', ''];
  sorted.forEach(([pid,sc],i) => {
    lines.push(`${medals[i]||'🏅'} ${S.players[pid]?.name||'?'}: ${sc} Pkt`);
  });
  lines.push('', '🎮 wizard.html');
  const text = lines.join('\n');
  navigator.clipboard?.writeText(text).then(() => toast('Ergebnis kopiert! 📋', 'ok')).catch(() => toast('Kopieren fehlgeschlagen','err'));
}

/* ═══════════════════════════════════════════════
   GAME DETAIL + DELETE
═══════════════════════════════════════════════ */
function showGameDetail(gameId) {
  const g = S.games.find(x => x.id === gameId);
  if (!g) return;
  const allPids = g.rankings || g.players || [];
  const sorted  = [...allPids].sort((a,b) => (g.scores?.[b]||0)-(g.scores?.[a]||0));
  const winner  = S.players[g.winner];
  const medals  = ['🥇','🥈','🥉','🏅','🏅','🏅'];
  const topScore = g.scores?.[sorted[0]] || 0;

  document.getElementById('game-detail-content').innerHTML = `
    <div class="gd-summary">
      <span class="gd-win-ava">${winner?.emoji||'🧙'}</span>
      <div class="gd-win-info">
        <h4>🏆 ${esc(winner?.name||'?')} gewinnt!</h4>
        <p>${fmtDate(g.date)} · ${sorted.length} Spieler</p>
      </div>
    </div>
    <div class="gd-standings">
      ${sorted.map((pid,i) => {
        const p  = S.players[pid];
        const sc = g.scores?.[pid] || 0;
        const diff = i > 0 ? `<span class="gd-diff">-${topScore - sc}</span>` : '';
        return `<div class="gd-row ${i===0?'gd-win':''}">
          <span class="gd-medal">${medals[i]||'🏅'}</span>
          <span class="gd-ava-sm">${p?.emoji||'🧙'}</span>
          <span class="gd-name">${esc(p?.name||'?')}</span>
          <span class="gd-sc">${sc} Pkt${diff}</span>
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('btn-detail-delete').onclick  = () => deleteGame(gameId);
  document.getElementById('btn-detail-rematch').onclick = () => {
    hideModal('modal-game-detail');
    quickRematch(gameId);
  };
  showModal('modal-game-detail');
}

async function deleteGame(gameId) {
  if (!confirm('Spiel wirklich löschen? Spielerstatistiken werden neu berechnet.')) return;
  const game = S.games.find(g => g.id === gameId);
  if (!game) return;
  try {
    await deleteDoc(doc(db, 'wizard_games', gameId));
    S.games = S.games.filter(g => g.id !== gameId);
    for (const pid of (game.players || [])) await recalcPlayerStats(pid);
    hideModal('modal-game-detail');
    renderAll();
    toast('Spiel gelöscht ✓', 'ok');
  } catch(e) {
    toast('Fehler beim Löschen!', 'err');
    console.error(e);
  }
}

async function recalcPlayerStats(pid) {
  const games = S.games.filter(g => (g.players||[]).includes(pid));
  const chron = [...games].sort((a,b) => {
    const da  = a.date?.toDate ? a.date.toDate() : new Date(a.date||0);
    const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date||0);
    return da - db2;
  });
  let gp=0, wins=0, tot=0, high=0, streak=0, maxStr=0;
  chron.forEach(g => {
    gp++;
    const sc = g.scores?.[pid] || 0;
    tot += sc;
    high = Math.max(high, sc);
    if (g.winner === pid) { wins++; streak++; maxStr = Math.max(maxStr, streak); }
    else streak = 0;
  });
  const avgPts = gp ? Math.round(tot/gp) : 0;
  const newStats = { gamesPlayed:gp, wins, totalPoints:tot, avgPoints:avgPts, highScore:high, winStreak:streak, maxWinStreak:maxStr };
  await persistPlayer(pid, { stats: newStats, mmr: calcMMR(newStats) });
}

/* ═══════════════════════════════════════════════
   EDIT PLAYER
═══════════════════════════════════════════════ */
function openEditPlayer(pid) {
  const p = S.players[pid];
  if (!p) return;
  document.getElementById('edit-player-id').value = pid;
  document.getElementById('inp-edit-pname').value = p.name || '';
  document.getElementById('edit-cur-ava').textContent = p.emoji || '🧙';
  document.getElementById('edit-player-name-display').textContent = p.name || '–';

  const grid = document.getElementById('ava-grid-edit');
  grid.innerHTML = AVATARS.map(a =>
    `<div class="ava-opt${a === (p.emoji||'🧙') ? ' sel' : ''}" data-emo="${a}">${a}</div>`
  ).join('');
  showModal('modal-edit-player');
}

function esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function winRate(p) { const g=p.stats?.gamesPlayed||0; return g ? Math.round((p.stats.wins||0)/g*100) : 0; }
function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return '?';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff/86400000);
  if (days===0) return 'Heute';
  if (days===1) return 'Gestern';
  if (days<7)   return `vor ${days} Tagen`;
  return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});
}

/* ═══════════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════════ */
function initEvents() {
  initScannerEvents();

  // Tabs
  document.querySelectorAll('.wz-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Dash "new game" link
  document.getElementById('btn-ng-dash')?.addEventListener('click', () => {
    resetNG(); switchTab('newgame'); renderNG0();
  });

  // Rankings category
  document.getElementById('rank-cats').addEventListener('click', e => {
    const btn = e.target.closest('.rcat'); if (!btn) return;
    document.querySelectorAll('.rcat').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.rankCat = btn.dataset.cat;
    renderRankings();
  });

  // Profile select
  document.getElementById('prof-sel').addEventListener('change', e => {
    S.profId = e.target.value;
    renderProfile(S.profId);
  });

  // Achievements player select
  document.getElementById('ach-sel').addEventListener('change', e => {
    S.achPid = e.target.value;
    renderAchievements();
  });

  // Rarity pills
  document.getElementById('rarity-pills').addEventListener('click', e => {
    const btn = e.target.closest('.rpill'); if (!btn) return;
    document.querySelectorAll('.rpill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.achRarity = btn.dataset.r;
    renderAchievements();
  });

  // Add player button
  document.getElementById('btn-add-player').addEventListener('click', () => {
    document.getElementById('inp-pname').value = '';
    showModal('modal-add-player');
  });

  // Avatar picker
  const avaGrid = document.getElementById('ava-grid');
  avaGrid.innerHTML = AVATARS.map((a,i) =>
    `<div class="ava-opt${i===0?' sel':''}" data-emo="${a}">${a}</div>`
  ).join('');
  S.selAvatar = AVATARS[0];

  avaGrid.addEventListener('click', e => {
    const opt = e.target.closest('.ava-opt'); if (!opt) return;
    document.querySelectorAll('.ava-opt').forEach(o => o.classList.remove('sel'));
    opt.classList.add('sel');
    S.selAvatar = opt.dataset.emo;
  });

  // Confirm add player
  document.getElementById('btn-confirm-player').addEventListener('click', async () => {
    const name = document.getElementById('inp-pname').value.trim();
    if (!name) { document.getElementById('inp-pname').style.borderColor='var(--rd)'; return; }
    document.getElementById('inp-pname').style.borderColor = '';
    const btn = document.getElementById('btn-confirm-player');
    btn.disabled = true; btn.textContent = '⏳ Erstelle…';
    try {
      await createPlayer(name, S.selAvatar);
      hideModal('modal-add-player');
      renderAll();
      renderNG0();
      toast(`🧙 ${esc(name)} hinzugefügt!`, 'ok');
    } catch(e) {
      toast('Fehler!','err'); console.error(e);
    }
    btn.disabled = false; btn.textContent = '🧙 Spieler erstellen';
  });

  // Close modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.close));
  });
  document.querySelectorAll('.wz-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) hideModal(ov.id); });
  });

  // Achievement ok
  document.getElementById('btn-ach-ok').addEventListener('click', () => {
    hideModal('modal-ach-unlock');
    setTimeout(() => { achShowing = false; showNextAch(); }, 200);
  });

  // Direct photo shortcut (skip player selection)
  document.getElementById('btn-photo-direct')?.addEventListener('click', () => {
    S.ng.mode = 'photo';
    goNGStep(2);
  });

  // New game step 1 → 2
  document.getElementById('btn-gs1').addEventListener('click', () => {
    if (S.ng.pids.length < 2) { toast('Bitte mind. 2 Spieler wählen!','err'); return; }
    // auto-calculate rounds
    const n = S.ng.pids.length;
    S.ng.numRounds = n<=3?20:n<=4?15:n<=5?12:10;
    goNGStep(1);
  });

  // Mode cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      S.ng.mode = card.dataset.mode;
      goNGStep(2);
    });
  });

  // When switching to new game tab, reset and render step 0
  document.querySelectorAll('.wz-tab[data-tab="newgame"]').forEach(b => {
    b.addEventListener('click', () => { resetNG(); renderNG0(); goNGStep(0); });
  });

  // Enter key for player name
  document.getElementById('inp-pname').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-confirm-player').click();
  });

  // Edit player: avatar grid (delegated, registered once)
  document.getElementById('ava-grid-edit')?.addEventListener('click', e => {
    const opt = e.target.closest('.ava-opt'); if (!opt) return;
    document.querySelectorAll('#ava-grid-edit .ava-opt').forEach(o => o.classList.remove('sel'));
    opt.classList.add('sel');
    document.getElementById('edit-cur-ava').textContent = opt.dataset.emo;
  });

  // Edit player: confirm save
  document.getElementById('btn-confirm-edit')?.addEventListener('click', async () => {
    const pid    = document.getElementById('edit-player-id').value;
    const name   = document.getElementById('inp-edit-pname').value.trim();
    const selOpt = document.querySelector('#ava-grid-edit .ava-opt.sel');
    const emoji  = selOpt?.dataset.emo || S.players[pid]?.emoji || '🧙';
    if (!name) { document.getElementById('inp-edit-pname').style.borderColor='var(--rd)'; return; }
    document.getElementById('inp-edit-pname').style.borderColor = '';
    const btn = document.getElementById('btn-confirm-edit');
    btn.disabled = true; btn.textContent = '⏳ Speichere…';
    try {
      await persistPlayer(pid, { name, emoji });
      hideModal('modal-edit-player');
      renderAll();
      if (S.profId === pid) renderProfile(pid);
      toast(`✏️ ${esc(name)} aktualisiert!`, 'ok');
    } catch(e) {
      toast('Fehler!', 'err'); console.error(e);
    }
    btn.disabled = false; btn.textContent = '✏️ Speichern';
  });

  document.getElementById('inp-edit-pname')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-confirm-edit')?.click();
  });
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
async function init() {
  initParticles();

  // Sign in, then wait for onAuthStateChanged to confirm the token is
  // fully propagated to the Firestore SDK before making any reads/writes.
  document.getElementById('spl-msg').textContent = 'Verbinde mit Datenbank…';
  try { await signInAnonymously(auth); } catch(e) { console.warn('Auth:', e); }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Auth timeout')), 10000);
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { clearTimeout(timer); unsub(); resolve(); }
    }, err => { clearTimeout(timer); reject(err); });
  }).catch(e => {
    toast('Verbindung fehlgeschlagen – bitte Seite neu laden', 'err');
    console.error('Auth state error:', e);
  });

  try {
    document.getElementById('spl-msg').textContent = 'Spieler werden geladen…';
    await loadPlayers();
    document.getElementById('spl-msg').textContent = 'Spiele werden geladen…';
    await loadGames();
  } catch(e) {
    console.error('Firebase Ladefehler:', e);
    toast('Laden fehlgeschlagen – bitte Seite neu laden', 'err');
  }

  renderAll();
  renderNG0();
  initEvents();

  // Hide splash
  setTimeout(() => {
    document.getElementById('wz-splash').classList.add('out');
    document.getElementById('wz-app').classList.remove('loading');
  }, 2400);
}

init();
