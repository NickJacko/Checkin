'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, query, orderBy, limit,
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
const app = initializeApp(FB);
const db  = getFirestore(app);

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
   RENDER DASHBOARD
═══════════════════════════════════════════════ */
function renderDashboard() {
  const ps = Object.values(S.players);
  const gs = S.games;

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
      const names = (g.players||[]).map(id => S.players[id]?.name || '?').join(', ');
      const ws = g.scores?.[g.winner] ?? '?';
      return `<div class="rg-row">
        <span class="rg-ava">${w?.emoji || '🧙'}</span>
        <div class="rg-info">
          <div class="rg-winner">🏆 ${esc(w?.name || '?')}</div>
          <div class="rg-players">${esc(names)}</div>
        </div>
        <div class="rg-right">
          <div class="rg-score">${ws} Pkt</div>
          <div class="rg-date">${dt}</div>
        </div>
      </div>`;
    }).join('');
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
    return `<div class="rank-row${row}" style="animation-delay:${i*40}ms">
      <div class="rrank ${rc}">${rl}</div>
      <div class="rava">${p.emoji||'🧙'}</div>
      <div class="rinfo">
        <div class="rname">${esc(p.name)}</div>
        <div class="rsub">${subFn(p)}</div>
      </div>
      <div class="rval">${valFn(p)}</div>
    </div>`;
  }).join('');
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

    <div class="prof-sub-title">📜 Letzte Spiele</div>
    ${recentGames.length ? recentGames.map(g => {
      const pos = (g.rankings||[]).indexOf(pid) + 1 || '?';
      const posEmoji = pos===1?'🥇':pos===2?'🥈':pos===3?'🥉':'🏅';
      const otherNames = (g.players||[]).filter(id=>id!==pid).map(id=>S.players[id]?.name||'?').join(', ');
      return `<div class="hist-row">
        <span class="hist-pos">${posEmoji}</span>
        <div class="hist-info">
          <div class="hist-date">${fmtDate(g.date)}</div>
          <div class="hist-players">${esc(otherNames) || 'Keine weiteren'}</div>
        </div>
        <div class="hist-score">${g.scores?.[pid]||0} Pkt</div>
      </div>`;
    }).join('') : '<div class="empty" style="padding:1.5rem"><p>Noch keine Spiele</p></div>'}
  `;

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
      <h2 class="step-h">Punktezettel fotografieren</h2>
      <div class="photo-zone" id="photo-zone">
        <span class="photo-ico">📷</span>
        <p>Tippe hier oder lade ein Bild hoch</p>
        <input type="file" id="photo-inp" accept="image/*" capture="camera" style="display:none">
        <button class="btn-sec" id="btn-photo-pick">📷 Foto wählen / aufnehmen</button>
      </div>
      <div id="ocr-area"></div>
      <div class="step-acts" style="margin-top:.75rem">
        <button class="btn-ghost" id="btn-ng2-back">← Zurück</button>
      </div>`;

    document.getElementById('btn-ng2-back').onclick = () => goNGStep(1);
    const photoInp = document.getElementById('photo-inp');
    document.getElementById('btn-photo-pick').onclick = () => photoInp.click();
    document.getElementById('photo-zone').onclick = () => photoInp.click();
    photoInp.onchange = e => handlePhoto(e.target.files[0]);
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

  const btn = document.getElementById('btn-save-scores');
  btn.disabled = true; btn.textContent = '⏳ Speichern…';

  try {
    const { winner, newlyUnlocked } = await saveGame(scores);
    showConfetti();
    toast(`🏆 ${esc(S.players[winner]?.name)} gewinnt!`, 'ok');
    resetNG();
    renderAll();
    switchTab('dashboard');
    if (newlyUnlocked.length) setTimeout(() => processAchQueue(newlyUnlocked), 800);
  } catch(e) {
    toast('Fehler beim Speichern!','err');
    console.error(e);
    btn.disabled = false; btn.textContent = '💾 Spiel speichern';
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
    toast(`🏆 ${esc(S.players[winner]?.name)} gewinnt!`, 'ok');
    resetNG();
    renderAll();
    switchTab('dashboard');
    if (newlyUnlocked.length) setTimeout(() => processAchQueue(newlyUnlocked), 800);
  } catch(e) {
    toast('Fehler beim Speichern!','err');
    console.error(e);
    btn.disabled = false; btn.textContent = '💾 Spiel speichern';
  }
}

async function handlePhoto(file) {
  if (!file) return;
  const areaEl = document.getElementById('ocr-area');
  const url = URL.createObjectURL(file);

  areaEl.innerHTML = `
    <div class="ocr-preview"><img src="${url}" alt="Zettel"></div>
    <div class="ocr-prog" id="ocr-prog">
      <div>🔍 Analysiere Bild…</div>
      <div class="ocr-pbar-wrap"><div class="ocr-pbar-fill" id="ocr-pbar" style="width:0%"></div></div>
    </div>`;

  try {
    // Dynamic load Tesseract
    const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/tesseract.esm.min.js');
    const worker = await createWorker('deu+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pbar = document.getElementById('ocr-pbar');
          if (pbar) pbar.style.width = Math.round(m.progress*100)+'%';
        }
      }
    });
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    const parsed = parseOCRText(text);
    renderOCRResult(parsed, areaEl);
  } catch(e) {
    areaEl.innerHTML = `
      <p style="color:var(--tx2);text-align:center;padding:1rem">OCR nicht verfügbar – bitte Punkte manuell eingeben:</p>
      <div class="scr-form">
        ${S.ng.pids.map(pid => {
          const p = S.players[pid];
          return `<div class="scr-row">
            <div class="scr-ava">${p.emoji||'🧙'}</div>
            <div class="scr-name">${esc(p.name)}</div>
            <input type="number" class="scr-inp" data-pid="${pid}" placeholder="0">
          </div>`;
        }).join('')}
      </div>
      <div class="step-acts" style="margin-top:1rem">
        <button class="btn-pri full" id="btn-save-ocr-manual">💾 Spiel speichern</button>
      </div>`;
    document.getElementById('btn-save-ocr-manual')?.addEventListener('click', submitScores);
  }
}

function parseOCRText(text) {
  const result = {};
  const lines = text.split('\n').filter(l => l.trim().length > 2);
  S.ng.pids.forEach(pid => {
    const p = S.players[pid];
    const pname = (p.name||'').toLowerCase();
    const match = lines.find(l => l.toLowerCase().includes(pname) || pname.split(' ').some(w => w.length>2 && l.toLowerCase().includes(w)));
    if (match) {
      const nums = match.match(/-?\d+/g);
      if (nums) result[pid] = parseInt(nums[nums.length-1]);
    }
  });
  return result;
}

function renderOCRResult(parsed, el) {
  el.innerHTML = `
    <p style="color:var(--gr);font-size:.85rem;margin-bottom:.75rem;text-align:center">✅ OCR abgeschlossen – bitte Ergebnisse prüfen:</p>
    <div class="scr-form">
      ${S.ng.pids.map(pid => {
        const p = S.players[pid];
        return `<div class="scr-row">
          <div class="scr-ava">${p.emoji||'🧙'}</div>
          <div class="scr-name">${esc(p.name)}</div>
          <input type="number" class="scr-inp" data-pid="${pid}" placeholder="0" value="${parsed[pid]??''}">
        </div>`;
      }).join('')}
    </div>
    <div class="step-acts" style="margin-top:1rem">
      <button class="btn-pri full" id="btn-save-ocr">💾 Spiel speichern</button>
    </div>`;
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
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
async function init() {
  initParticles();

  try {
    document.getElementById('spl-msg').textContent = 'Spieler werden geladen…';
    await loadPlayers();
    document.getElementById('spl-msg').textContent = 'Spiele werden geladen…';
    await loadGames();
  } catch(e) {
    console.error('Firebase Ladefehler:', e);
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
