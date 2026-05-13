/**
 * hub.js – LearnHub Startseite
 * Liest Typing- und Chess-Daten aus Firebase + localStorage,
 * rendert den kombinierten Fortschritt, verwaltet Sync-Codes.
 */

'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
  collection, query, orderBy, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ── Firebase Config (gleich wie app.js / chess.js) ── */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCa8VcpRe94gevcyQUF_Zc-e-UNRCowDSc',
  authDomain:        'checkin-9f731.firebaseapp.com',
  projectId:         'checkin-9f731',
  storageBucket:     'checkin-9f731.firebasestorage.app',
  messagingSenderId: '199496624018',
  appId:             '1:199496624018:web:a06afb19294d0635a8034b',
};

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUid   = null;
let typingState  = null;
let chessState   = null;
let deferredPWA  = null; // BeforeInstallPromptEvent

/* ═══════════════════════════════════════════════════════
   RANKS (für Gesamt-XP-Level)
═══════════════════════════════════════════════════════ */
const GLOBAL_RANKS = [
  { level:1,  title:'Einsteiger',    xp:0      },
  { level:2,  title:'Lernender',     xp:200    },
  { level:3,  title:'Enthusiast',    xp:600    },
  { level:4,  title:'Fortgeschrittenr',xp:1200 },
  { level:5,  title:'Talent',        xp:2200   },
  { level:6,  title:'Profi',         xp:3800   },
  { level:7,  title:'Experte',       xp:6000   },
  { level:8,  title:'Meister',       xp:9500   },
  { level:9,  title:'Elite',         xp:15000  },
  { level:10, title:'Legende',       xp:Infinity},
];

/* ═══════════════════════════════════════════════════════
   DATEN LADEN
═══════════════════════════════════════════════════════ */
function loadLocalStates() {
  try {
    const tRaw = localStorage.getItem('typemaster_v3');
    typingState = tRaw ? JSON.parse(tRaw) : null;
  } catch (_) { typingState = null; }
  try {
    const cRaw = localStorage.getItem('chessmaster_v1');
    chessState = cRaw ? JSON.parse(cRaw) : null;
  } catch (_) { chessState = null; }
}

async function loadCloudStates(uid) {
  try {
    /* Typing: stored in 'users/{uid}' */
    const tSnap = await getDoc(doc(db, 'users', uid));
    if (tSnap.exists()) typingState = { ...typingState, ...tSnap.data() };
  } catch (_) {}
  try {
    /* Chess: stored in 'typemaster_users/{uid}'.chess */
    const cSnap = await getDoc(doc(db, 'typemaster_users', uid));
    if (cSnap.exists() && cSnap.data().chess) {
      chessState = { ...chessState, ...cSnap.data().chess };
    }
  } catch (_) {}
}

/* ═══════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════ */
function render() {
  renderGreeting();
  renderGlobalXP();
  renderTypingCard();
  renderChessCard();
  renderAchievements();
  renderActivity();
  renderStreak();
  applyTheme();
}

function renderGreeting() {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Noch so spät online?' : h < 12 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
  const t = typingState, c = chessState;
  const name = t?.profile?.name || 'Lernender';
  let suffix = 'Bereit für eine neue Lerneinheit?';
  const streak = Math.max(t?.streak || 0, c?.streak || 0);
  if (streak >= 7)  suffix = `${streak} Tage Streak – fantastisch!`;
  else if (streak >= 3) suffix = `${streak} Tage Streak – weiter so!`;
  setText('hub-greeting', `${greet}, ${name}! ${suffix}`);
}

function renderGlobalXP() {
  const typingXP = typingState?.totalXp || typingState?.currentLevelXp || 0;
  const chessXP  = chessState?.xp || 0;
  const total    = typingXP + chessXP;

  let rank = GLOBAL_RANKS[0];
  for (const r of GLOBAL_RANKS) { if (total >= r.xp) rank = r; }
  const nextRank = GLOBAL_RANKS.find(r => r.level > rank.level);
  const pct = nextRank ? Math.min(100, ((total - rank.xp) / (nextRank.xp - rank.xp)) * 100) : 100;

  setText('gxp-value', total.toLocaleString('de') + ' XP');
  setText('gxp-level', rank.level);
  setStyle('gxp-fill', 'width', pct + '%');
}

function renderTypingCard() {
  const t = typingState;
  const card = document.getElementById('card-typing');

  if (!t || (!t.totalXp && !t.currentLevelXp && !Object.keys(t.completedLessons || {}).length)) {
    card?.classList.add('not-started');
    setText('typing-cta', '⌨ Jetzt starten ▶');
    setText('typing-last', 'Noch nicht gestartet – lege los!');
    return;
  }
  card?.classList.remove('not-started');

  const level   = t.level || 1;
  const xp      = t.totalXp || t.currentLevelXp || 0;
  const lessons = Object.keys(t.completedLessons || {}).length;
  const streak  = t.streak || 0;
  const wpm     = t.highscores?.wpm || t.wpmHistory?.[t.wpmHistory.length - 1] || 0;
  const acc     = t.highscores?.acc ? t.highscores.acc.toFixed(0) + '%' : '–';

  setText('typing-level-badge', 'Level ' + level);
  setText('t-wpm',     wpm ? wpm + ' WPM' : '–');
  setText('t-lessons', lessons);
  setText('t-streak',  streak);
  setText('t-acc',     acc);
  setText('typing-xp-text', xp + ' XP');
  setText('typing-cta', '⌨ Weitermachen ▶');

  /* XP bar: estimate progress within level */
  const XP_THRESHOLDS = [0,100,250,500,900,1400,2000,2800,3800,5000,6500,8500,11000,14000,18000];
  const levelIdx = Math.min(level - 1, XP_THRESHOLDS.length - 1);
  const nextThreshold = XP_THRESHOLDS[levelIdx + 1] || XP_THRESHOLDS[levelIdx] * 2;
  const pct = Math.min(100, ((xp - XP_THRESHOLDS[levelIdx]) / (nextThreshold - XP_THRESHOLDS[levelIdx])) * 100);
  setStyle('typing-xp-fill', 'width', Math.max(0, pct) + '%');

  const last = t.activityLog ? Object.keys(t.activityLog).sort().pop() : null;
  setText('typing-last', last ? 'Zuletzt aktiv: ' + formatDate(last) : 'Gestartet!');
}

function renderChessCard() {
  const c = chessState;
  const card = document.getElementById('card-chess');

  if (!c || (!c.xp && !Object.keys(c.completedLessons || {}).length)) {
    card?.classList.add('not-started');
    setText('chess-cta', '♟ Jetzt starten ▶');
    setText('chess-last', 'Noch nicht gestartet – entdecke Schach!');
    return;
  }
  card?.classList.remove('not-started');

  const level   = c.level || 1;
  const xp      = c.xp || 0;
  const puzzles = Object.keys(c.solvedPuzzles || {}).length;
  const lessons = Object.keys(c.completedLessons || {}).length;
  const wins    = c.gamesWon || 0;
  const streak  = c.streak || 0;

  setText('chess-level-badge', 'Level ' + level);
  setText('c-puzzles', puzzles);
  setText('c-lessons', lessons);
  setText('c-wins',    wins);
  setText('c-streak',  streak);
  setText('chess-xp-text', xp + ' XP');
  setText('chess-cta', '♟ Weitermachen ▶');

  const CHESS_XP = [0,100,250,500,900,1500,2500,4000,6000,9000];
  const idx = Math.min(level - 1, CHESS_XP.length - 1);
  const next = CHESS_XP[idx + 1] || CHESS_XP[idx] * 2;
  const pct  = Math.min(100, ((xp - CHESS_XP[idx]) / (next - CHESS_XP[idx])) * 100);
  setStyle('chess-xp-fill', 'width', Math.max(0, pct) + '%');

  const last = c.activityLog ? Object.keys(c.activityLog).sort().pop() : null;
  setText('chess-last', last ? 'Zuletzt aktiv: ' + formatDate(last) : 'Gestartet!');
}

function renderStreak() {
  const tStreak = typingState?.streak || 0;
  const cStreak = chessState?.streak  || 0;
  const best    = Math.max(tStreak, cStreak);
  setText('hub-streak-val', best);
  setText('streak-tag', best + ' Tage');
  setText('streak-reminder-text', best > 0
    ? `${best} Tage – heute weitertrainieren!`
    : 'Starte deinen Streak heute!');
}

function renderAchievements() {
  const strip = document.getElementById('hub-ach-strip');
  if (!strip) return;

  const tAchs = typingState?.achievements || [];
  const cAchs = chessState?.achievements  || [];

  const combined = [
    { id:'first_lesson', label:'📚 Erste Lektion', check: tAchs.includes('first_lesson') || cAchs.includes('first_lesson') },
    { id:'first_puzzle', label:'🧩 Erstes Puzzle',  check: cAchs.includes('first_puzzle') },
    { id:'streak_3',     label:'🔥 3 Tage Streak',  check: tAchs.includes('streak_3') || cAchs.includes('streak_3') },
    { id:'first_win',    label:'🏆 Erste Partie',   check: cAchs.includes('first_win') },
    { id:'wpm_30',       label:'⚡ 30 WPM',         check: tAchs.includes('wpm_30') },
    { id:'wpm_60',       label:'🚀 60 WPM',         check: tAchs.includes('wpm_60') },
    { id:'streak_7',     label:'🌟 7 Tage Streak',  check: tAchs.includes('streak_7') || cAchs.includes('streak_7') },
    { id:'all_modules',  label:'🎓 Kurs fertig',    check: cAchs.includes('all_modules') },
    { id:'puzzles_10',   label:'🔟 10 Puzzles',     check: cAchs.includes('puzzles_10') },
  ];

  strip.innerHTML = combined.map(a =>
    `<span class="ach-chip ${a.check ? 'unlocked' : 'locked'}">${a.label}</span>`
  ).join('');
}

function renderActivity() {
  const grid = document.getElementById('hub-activity');
  if (!grid) return;

  const tLog = typingState?.activityLog || {};
  const cLog = chessState?.activityLog  || {};

  const days = [];
  let activeDays = 0;
  for (let i = 59; i >= 0; i--) {
    const d     = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const count = (tLog[d] || 0) + (cLog[d] || 0);
    if (count > 0) activeDays++;
    const isToday = new Date().toISOString().slice(0, 10) === d;
    const cls     = count >= 6 ? 't4' : count >= 4 ? 't3' : count >= 2 ? 't2' : count >= 1 ? 't1' : '';
    days.push(`<div class="am-day ${cls ? 't '+cls : ''} ${isToday ? 'today' : ''}" title="${d}: ${count} Aktionen"></div>`);
  }
  grid.innerHTML = days.join('');
  setText('hub-active-days', activeDays);
}

/* ═══════════════════════════════════════════════════════
   SYNC-CODE SYSTEM
═══════════════════════════════════════════════════════ */
function generateSyncCode(uid) {
  /* Deterministischer 8-stelliger Code aus UID */
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  let h = Math.abs(hash);
  for (let i = 0; i < 8; i++) { code += chars[h % chars.length]; h = Math.floor(h / chars.length) || (hash + i + 7) * 13; }
  return code;
}

async function saveSyncCode(uid) {
  const code = generateSyncCode(uid);
  try {
    await setDoc(doc(db, 'syncCodes', code), { uid, updatedAt: serverTimestamp() }, { merge: true });
  } catch (_) {}
  return code;
}

async function useSyncCode(code) {
  code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (code.length < 6) return false;
  try {
    const snap = await getDoc(doc(db, 'syncCodes', code));
    if (!snap.exists()) return false;
    const { uid } = snap.data();
    if (uid === currentUid) return 'self'; // already this account
    /* Store override UID in localStorage → both apps pick it up */
    localStorage.setItem('hub_sync_uid', uid);
    return true;
  } catch (_) { return false; }
}

/* ═══════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════ */
function applyTheme() {
  const theme = localStorage.getItem('hub_theme') || typingState?.settings?.theme || chessState?.settings?.theme || 'dark';
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('btn-hub-theme');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('hub_theme', next);
  const btn = document.getElementById('btn-hub-theme');
  if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';
}

/* ═══════════════════════════════════════════════════════
   PWA INSTALL
═══════════════════════════════════════════════════════ */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPWA = e;
  document.getElementById('install-bar')?.classList.add('show');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-bar')?.classList.remove('show');
  deferredPWA = null;
});

/* ═══════════════════════════════════════════════════════
   ONLINE INDICATOR
═══════════════════════════════════════════════════════ */
function setOnline(online) {
  const dot   = document.getElementById('hub-ol-dot');
  const label = document.getElementById('hub-ol-label');
  if (dot)   dot.style.background   = online ? 'var(--green)' : 'var(--text-3)';
  if (label) label.textContent      = online ? 'Online' : 'Offline';
}

/* ═══════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day:'numeric', month:'short' });
  } catch (_) { return iso; }
}

/* ═══════════════════════════════════════════════════════
   EVENT BINDING
═══════════════════════════════════════════════════════ */
function bindEvents() {
  /* Theme */
  document.getElementById('btn-hub-theme')?.addEventListener('click', toggleTheme);

  /* PWA install */
  document.getElementById('btn-install')?.addEventListener('click', async () => {
    if (!deferredPWA) return;
    deferredPWA.prompt();
    const { outcome } = await deferredPWA.userChoice;
    if (outcome === 'accepted') document.getElementById('install-bar')?.classList.remove('show');
  });
  document.getElementById('btn-install-dismiss')?.addEventListener('click', () => {
    document.getElementById('install-bar')?.classList.remove('show');
  });

  /* Sync modal open */
  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    const modal = document.getElementById('sync-modal');
    modal?.classList.remove('hidden');
    if (currentUid) {
      const code = await saveSyncCode(currentUid);
      setText('sync-code-display', code);
    } else {
      setText('sync-code-display', '–– offline ––');
    }
  });

  /* Sync modal close */
  document.getElementById('btn-sync-close')?.addEventListener('click', () => {
    document.getElementById('sync-modal')?.classList.add('hidden');
  });

  /* Use sync code */
  document.getElementById('btn-use-sync')?.addEventListener('click', async () => {
    const input = document.getElementById('sync-code-input');
    const fb    = document.getElementById('sync-feedback');
    if (!input || !fb) return;
    fb.textContent = '⏳ Suche…';
    const result = await useSyncCode(input.value);
    if (result === 'self') {
      fb.textContent = '✅ Das ist bereits dein Code!';
      fb.style.color = 'var(--green)';
    } else if (result) {
      fb.textContent = '✅ Code gefunden! Seite wird neu geladen…';
      fb.style.color = 'var(--green)';
      setTimeout(() => location.reload(), 1500);
    } else {
      fb.textContent = '✗ Code nicht gefunden. Überprüfe die Eingabe.';
      fb.style.color = 'var(--red)';
    }
  });
  /* Allow Enter key in sync input */
  document.getElementById('sync-code-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-use-sync')?.click();
  });

  /* World card clicks (navigate) */
  document.getElementById('card-typing')?.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    location.href = 'typemaster.html';
  });
  document.getElementById('card-chess')?.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    location.href = 'chess.html';
  });
}

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
async function init() {
  /* 1. Load local data immediately for instant render */
  loadLocalStates();
  render();
  bindEvents();

  /* 2. Check for sync UID override */
  const overrideUid = localStorage.getItem('hub_sync_uid');

  /* 3. Firebase auth */
  try {
    await signInAnonymously(auth);
  } catch (_) {}

  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUid = overrideUid || user.uid;
      setOnline(true);

      /* If override: start using that uid for future auth */
      if (overrideUid) {
        localStorage.removeItem('hub_sync_uid');
        /* Persist override to both app keys so apps pick it up */
        try {
          /* We load cloud data for the override uid and store locally */
          await loadCloudStates(overrideUid);
          if (typingState) localStorage.setItem('typemaster_v3', JSON.stringify(typingState));
          if (chessState)  localStorage.setItem('chessmaster_v1', JSON.stringify(chessState));
          render();
        } catch (_) {}
        return;
      }

      /* 4. Load cloud data and re-render */
      await loadCloudStates(currentUid);
      render();

      /* 6. Load leaderboard mini (needs uid) */
      loadHubLeaderboard(currentUid);
    } else {
      setOnline(false);
      /* Still try leaderboard without "me" highlight */
      loadHubLeaderboard(null);
    }
  });

  /* 5. Register service worker */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function loadHubLeaderboard(myUid) {
  const container = document.getElementById('hub-lb-list');
  if (!container) return;

  try {
    const q    = query(collection(db, 'chessLeaderboard'), orderBy('chessXP', 'desc'), limit(5));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(d => rows.push(d.data()));

    if (!rows.length) {
      container.innerHTML = '<div style="color:var(--text-3);font-size:.82rem;padding:.5rem 0">Noch keine Einträge – spiele Schach und sammle XP!</div>';
      return;
    }

    container.innerHTML = '';
    rows.forEach((row, i) => {
      const rank   = i + 1;
      const isMe   = row.uid === myUid;
      const div    = document.createElement('div');
      div.className = 'lb-mini-row' + (isMe ? ' lb-mini-me' : '');
      const rankCls = rank <= 3 ? 'lb-mini-rank r' + rank : 'lb-mini-rank';
      const rankTxt = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
      div.innerHTML = `
        <span class="${rankCls}">${rankTxt}</span>
        <span class="lb-mini-avatar">${row.avatar || '♟'}</span>
        <span class="lb-mini-name">${esc(row.displayName || 'Spieler')}${isMe ? ' <span style="font-size:.65rem;background:var(--primary);color:#fff;border-radius:99px;padding:.05rem .35rem;margin-left:.3rem">Du</span>' : ''}</span>
        <span class="lb-mini-xp">${(row.chessXP || 0).toLocaleString('de-DE')} XP</span>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    container.innerHTML = '<div style="color:var(--text-3);font-size:.82rem">⚠ Rangliste nicht verfügbar</div>';
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
