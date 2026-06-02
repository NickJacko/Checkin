/**
 * TypeMaster – app.js  (Firebase + Multiplayer Edition)
 * ======================================================
 * ES-Modul: <script type="module" src="app.js"> in index.html erforderlich
 *
 * Features:
 *  – Firebase Anonymous Auth + Firestore Cloud-Sync
 *  – Echtzeit-Bestenliste (WPM / Genauigkeit / Level / Streak)
 *  – Multiplayer Renn-Räume (bis 8 Spieler, Echtzeit)
 *  – Online-Präsenz ("Wer ist gerade online")
 *  – Profil (Name + Avatar)
 *  – Ergebnis-Vergleich mit Top-10
 *  – localStorage als Offline-Fallback
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   1. FIREBASE IMPORTS & SETUP
═══════════════════════════════════════════════════════ */
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, query, orderBy, limit, onSnapshot,
  getDocs, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCa8VcpRe94gevcyQUF_Zc-e-UNRCowDSc',
  authDomain:        'checkin-9f731.firebaseapp.com',
  projectId:         'checkin-9f731',
  storageBucket:     'checkin-9f731.firebasestorage.app',
  messagingSenderId: '199496624018',
  appId:             '1:199496624018:web:a06afb19294d0635a8034b',
};

const firebaseApp  = initializeApp(FIREBASE_CONFIG);
const auth         = getAuth(firebaseApp);
const db           = getFirestore(firebaseApp);

/* Global Firebase state */
let currentUserId     = null;
let isOnline          = false;
let presenceRef       = null;
let presenceInterval  = null;
let unsubLeaderboard  = null;
let unsubRaceRoom     = null;
let currentRaceRoomId = null;
let isRaceHost        = false;
let raceCountdownTimer = null;
let currentLbType     = 'wpm';

/* ═══════════════════════════════════════════════════════
   2. STATIC DATA
═══════════════════════════════════════════════════════ */

const AVATARS = ['🐣','🦊','🐺','🦁','🐯','🐸','🤖','👾','🧙','🧛','🦸','🐉','🦄','🐼','🦋','🐧'];

const COURSE_MODULES = [
  { id:'grundreihe', title:'Grundreihe', icon:'🖐', desc:'Die Heimposition – hier fangen alle Finger an',
    lessons:[
      {id:'g1',title:'asdf + jklö',    desc:'Linke & rechte Grundreihe',     chars:'asdf jklö',   type:'chars'},
      {id:'g2',title:'Grundreihe Mix', desc:'Alle 8 Grundtasten kombiniert', type:'lesson', content:'asdf jklö fjdk saldo flask dalf jfkl ölka das als'},
      {id:'g3',title:'Häufige Wörter', desc:'Erste Wörter aus der Grundreihe', type:'lesson', content:'das als fal dal als fad alk falls da so als das so falls'},
      {id:'g4',title:'Fluss',          desc:'Flüssiges Tippen der Grundreihe', type:'lesson', content:'falls das da so als das so falls da als fad alk lads flask'},
    ]},
  { id:'obere', title:'Obere Reihe', icon:'⬆', desc:'qwertzuiop – die zweite Fingerposition',
    lessons:[
      {id:'o1',title:'qwer + uiop',    desc:'Obere Reihe links & rechts', chars:'qwer uiop', type:'chars'},
      {id:'o2',title:'Kombination',    desc:'Grund- und obere Reihe', type:'lesson', content:'quiz wir per dort fluid die oase wer top ruf'},
      {id:'o3',title:'Wörter I',       desc:'Typische deutsche Wörter', type:'lesson', content:'wie das wir die für pro quo per'},
      {id:'o4',title:'Wörter & Fluss', desc:'Flüssiges Tippen beider Reihen', type:'lesson', content:'aufgabe periode widerspruch protokoll'},
    ]},
  { id:'untere', title:'Untere Reihe', icon:'⬇', desc:'yxcvbnm – die dritte Reihe meistern',
    lessons:[
      {id:'u1',title:'yxcv + nm',     desc:'Untere Reihe einüben', chars:'yxcv bnm', type:'chars'},
      {id:'u2',title:'Alle Reihen',   desc:'Alle drei Reihen kombiniert', type:'lesson', content:'bewegung voxel nexus zebra mixen boxen'},
      {id:'u3',title:'Wörter',        desc:'Häufige Alltagswörter', type:'lesson', content:'von nicht mehr aber nur auch noch zum zur mit'},
      {id:'u4',title:'Sätze I',       desc:'Erste kurze Sätze', type:'lesson', content:'Das ist ein Test. Wir lernen schnell tippen.'},
    ]},
  { id:'grossbuchstaben', title:'Großschreibung', icon:'⇧', desc:'Shift-Taste und Großbuchstaben',
    lessons:[
      {id:'gr1',title:'Shift links',   desc:'Großbuchstaben mit linkem Shift',  type:'lesson', content:'Hallo Klaus Ulf Ida Otto Erika Sigrid'},
      {id:'gr2',title:'Shift rechts',  desc:'Großbuchstaben mit rechtem Shift', type:'lesson', content:'Anna Susi Dieter Winfried Robert Thomas'},
      {id:'gr3',title:'Sätze',         desc:'Echte Sätze tippen', type:'lesson', content:'Das Wetter ist schön. Die Sonne scheint heute.'},
      {id:'gr4',title:'Namen & Orte',  desc:'Eigennamen großschreiben', type:'lesson', content:'Berlin, Hamburg, München und Frankfurt sind große Städte.'},
    ]},
  { id:'zahlen', title:'Zahlenreihe', icon:'🔢', desc:'Zahlen und die obere Tastenreihe',
    lessons:[
      {id:'z1',title:'Zahlen 1–5',     desc:'Linke Hälfte der Zahlenreihe',  chars:'12345', type:'chars'},
      {id:'z2',title:'Zahlen 6–0',     desc:'Rechte Hälfte der Zahlenreihe', chars:'67890', type:'chars'},
      {id:'z3',title:'Alle Zahlen',    desc:'Vollständige Zahlenreihe', type:'lesson', content:'1234567890 42 100 2024 0815 365 1337 9000'},
      {id:'z4',title:'Zahlen in Text', desc:'Zahlen in echten Sätzen', type:'lesson', content:'Im Jahr 2024 gab es 365 Tage. Der Preis beträgt 19,99 Euro.'},
    ]},
  { id:'sonderzeichen', title:'Sonderzeichen', icon:'!', desc:'Punkt, Komma, Ausrufezeichen und mehr',
    lessons:[
      {id:'s1',title:'Punkt & Komma',   desc:'Die häufigsten Satzzeichen', chars:'.,', type:'chars'},
      {id:'s2',title:'Frage & Ausrufe', desc:'Fragezeichen und Ausrufezeichen', type:'lesson', content:'Wie geht es dir? Sehr gut! Was machst du? Toll!'},
      {id:'s3',title:'Klammern',        desc:'Häufige Sonderzeichen', type:'lesson', content:'Das ist (sehr) wichtig - oder nicht?'},
      {id:'s4',title:'E-Mail & Web',    desc:'Digitale Kommunikation', type:'lesson', content:'info@example.de https://www.test.de user_name'},
    ]},
  { id:'woerter', title:'Wörter & Texte', icon:'📝', desc:'Häufige deutsche Wörter fließend tippen',
    lessons:[
      {id:'w1',title:'Top 50 Wörter',    desc:'Die häufigsten deutschen Wörter', type:'lesson', content:'der die das und in zu den ist auch von nicht mit dem sind bei auf noch des so werden'},
      {id:'w2',title:'Alltagsvokabular', desc:'Typische Alltagswörter', type:'lesson', content:'heute morgen gestern Arbeit Familie Schule Computer Handy Internet kaufen gehen kommen'},
      {id:'w3',title:'Komposita',        desc:'Zusammengesetzte Wörter', type:'lesson', content:'Bundesland Schreibtisch Tastatur Bildschirm Softwareentwicklung Arbeitsplatz'},
      {id:'w4',title:'Fremdwörter',      desc:'Häufige Fremd- und Lehnwörter', type:'lesson', content:'Software System Manager Online Digital Information Projekt Computer Update'},
    ]},
  { id:'saetze', title:'Sätze', icon:'💬', desc:'Vollständige Sätze flüssig tippen',
    lessons:[
      {id:'sa1',title:'Einfache Sätze',  desc:'Kurze, klare Sätze', type:'lesson', content:'Heute ist ein guter Tag. Die Übung macht den Meister. Ich lerne schnell.'},
      {id:'sa2',title:'Alltag',          desc:'Alltagssätze tippen', type:'lesson', content:'Kannst du mir bitte helfen? Ich brauche mehr Zeit. Das funktioniert sehr gut.'},
      {id:'sa3',title:'E-Mail Phrasen',  desc:'Typische E-Mail-Phrasen', type:'lesson', content:'Mit freundlichen Grüßen. Ich bedanke mich für Ihre Nachricht. Bitte antworten Sie bis Freitag.'},
      {id:'sa4',title:'Längere Texte',   desc:'Flüssiges Tippen', type:'lesson', content:'Das regelmäßige Üben ist der Schlüssel zum Erfolg. Wer täglich trainiert, wird schnell besser und sicherer.'},
    ]},
  { id:'fortgeschritten', title:'Fortgeschritten', icon:'🚀', desc:'Schnelligkeit, Präzision und Ausdauer',
    lessons:[
      {id:'f1',title:'Speed Run',    desc:'So schnell wie möglich', type:'lesson', content:'schnell flink agil zügig rasch prompt direkt fix exakt präzise klar sicher flott stark'},
      {id:'f2',title:'Pangramm',    desc:'Alle Buchstaben des Alphabets', type:'lesson', content:'Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.'},
      {id:'f3',title:'Code',        desc:'Programmiersyntax tippen', type:'lesson', content:'const name = "Max"; if (x > 0) { return true; } function hello() { console.log("Hallo!"); }'},
      {id:'f4',title:'Meistertext', desc:'Langer zusammenhängender Text', type:'lesson', content:'Die Fähigkeit, schnell und präzise zu tippen, ist in der digitalen Welt ein wichtiger Vorteil. Mit regelmäßigem Training können Sie Ihre Geschwindigkeit deutlich verbessern.'},
    ]},
];

const ALL_LESSONS = COURSE_MODULES.flatMap(m =>
  m.lessons.map(l => ({ ...l, moduleId: m.id, moduleTitle: m.title }))
);

const TEXT_POOLS = {
  common: [
    'der die das und in zu den ist auch von nicht mit dem sind',
    'wir haben heute eine wichtige Aufgabe zu erledigen',
    'schnelles Tippen macht den Alltag im Büro viel einfacher',
    'die Tastatur ist das wichtigste Werkzeug am Computer',
    'übung macht den meister und tägliches training zahlt sich aus',
    'mit beiden händen gleichzeitig zu tippen spart enorm viel zeit',
    'der fortschritt kommt nicht über nacht sondern durch beharrlichkeit',
    'jeder anfang ist schwer aber mit geduld wird man besser',
    'konzentration und ausdauer sind die schlüssel zum erfolg',
    'schreiben ohne hinzusehen ist das ziel des zehnfingersystems',
  ],
  sentences: [
    'Heute scheint die Sonne und es ist ein wunderschöner Tag.',
    'Die Schüler lernten fleißig für die kommende Prüfung.',
    'Im Internet findet man fast alle Informationen der Welt.',
    'Gute Software macht das Leben der Menschen einfacher.',
    'Kommunikation ist der Schlüssel zu einer guten Zusammenarbeit.',
    'Mit etwas Übung wird das Tippen zur zweiten Natur.',
    'Das neue Projekt startet nächste Woche mit dem ganzen Team.',
    'Feedback ist wichtig, um sich kontinuierlich zu verbessern.',
    'Wer regelmäßig übt, der wird mit der Zeit immer besser.',
    'TypeMaster hilft dir das Zehnfingersystem schnell zu erlernen.',
  ],
  numbers: [
    '1234 5678 9012 3456 7890',
    'Im Jahr 2024 hat die KI enorme Fortschritte gemacht.',
    'Die Konferenz findet am 15.03.2025 von 9:00 bis 17:30 Uhr statt.',
    'Bestellnummer: 4711-XY-2024 Preis: 199,95 Euro',
    'Pi ist ungefähr 3,14159265358979323846.',
  ],
  code: [
    'const result = array.filter(x => x > 0).map(x => x * 2);',
    'function greet(name) { return `Hallo, ${name}!`; }',
    'if (user.isLoggedIn && user.role === "admin") { showDashboard(); }',
    'SELECT * FROM users WHERE active = 1 ORDER BY created_at DESC;',
    'git commit -m "feat: add typing speed calculation"',
  ],
};

const ACHIEVEMENTS_DEF = [
  { id:'first_lesson', icon:'🎉', title:'Erster Schritt',      desc:'Erste Lektion abgeschlossen' },
  { id:'lesson_5',     icon:'📚', title:'Lernender',            desc:'5 Lektionen abgeschlossen' },
  { id:'lesson_20',    icon:'🎓', title:'Fleißig',              desc:'20 Lektionen abgeschlossen' },
  { id:'lesson_all',   icon:'🏅', title:'Komplettist',          desc:'Alle Lektionen abgeschlossen' },
  { id:'streak_3',     icon:'🔥', title:'Auf Kurs',             desc:'3 Tage Streak' },
  { id:'streak_7',     icon:'🌟', title:'Wochenmeister',        desc:'7 Tage Streak' },
  { id:'streak_30',    icon:'🔱', title:'Unaufhaltsam',         desc:'30 Tage Streak' },
  { id:'wpm_30',       icon:'⚡', title:'Flinke Finger',        desc:'30 WPM erreicht' },
  { id:'wpm_60',       icon:'🚀', title:'Speed-Tipper',         desc:'60 WPM erreicht' },
  { id:'wpm_100',      icon:'🏎', title:'Tastatur-Ninja',       desc:'100 WPM erreicht' },
  { id:'acc_100',      icon:'🎯', title:'Perfektionist',        desc:'100% Genauigkeit in einer Lektion' },
  { id:'acc_95_5',     icon:'💎', title:'Präzisionsschreiber',  desc:'5x über 95% Genauigkeit' },
  { id:'level_5',      icon:'⭐', title:'Aufsteiger',           desc:'Level 5 erreicht' },
  { id:'level_10',     icon:'🌠', title:'Profi',                desc:'Level 10 erreicht' },
  { id:'stars_10',     icon:'✨', title:'Sternsammler',         desc:'10 Sterne gesammelt' },
  { id:'no_errors',    icon:'🧹', title:'Makellos',             desc:'Lektion ohne Fehler abgeschlossen' },
  { id:'daily_done',   icon:'📅', title:'Tagessieger',          desc:'Tages-Challenge abgeschlossen' },
  { id:'marathon',     icon:'🏃', title:'Marathon',             desc:'Mehr als 1000 Zeichen in einer Session' },
  { id:'race_win',     icon:'🏆', title:'Rennsieger',           desc:'Ein Multiplayer-Rennen gewonnen' },
  { id:'race_5',       icon:'🎽', title:'Vielrennender',        desc:'5 Multiplayer-Rennen abgeschlossen' },
  { id:'lb_top10',     icon:'📊', title:'Top-10 Tipper',        desc:'In der WPM-Bestenliste unter den Top 10' },
];

const RANKS = [
  { level:1,  title:'Anfänger',        icon:'🐣', xpNeeded:100   },
  { level:2,  title:'Lernender',        icon:'📝', xpNeeded:250   },
  { level:3,  title:'Geübter',          icon:'💪', xpNeeded:500   },
  { level:4,  title:'Flinke Finger',    icon:'⚡', xpNeeded:900   },
  { level:5,  title:'Tastatur-Freund',  icon:'🖥', xpNeeded:1400  },
  { level:6,  title:'Speed-Tipper',     icon:'🚀', xpNeeded:2000  },
  { level:7,  title:'Wortakrobat',      icon:'🎭', xpNeeded:2800  },
  { level:8,  title:'Textchampion',     icon:'🏆', xpNeeded:3800  },
  { level:9,  title:'Tipp-Maestro',     icon:'🎵', xpNeeded:5000  },
  { level:10, title:'Tastatur-Ninja',   icon:'🥷', xpNeeded:6500  },
  { level:11, title:'Cyberwriter',      icon:'🤖', xpNeeded:8500  },
  { level:12, title:'Pixel-Poet',       icon:'🌟', xpNeeded:11000 },
  { level:13, title:'Digitalvirtuose',  icon:'🎯', xpNeeded:14000 },
  { level:14, title:'Tipp-Legende',     icon:'🏅', xpNeeded:18000 },
  { level:15, title:'Grand Master',     icon:'👑', xpNeeded:Infinity },
];

const QUOTES = [
  '"Der Anfang ist die Hälfte des Ganzen." – Aristoteles',
  '"Übung macht den Meister." – Deutsches Sprichwort',
  '"Es ist nie zu spät, neu anzufangen." – C.S. Lewis',
  '"Der Weg ist das Ziel." – Konfuzius',
  '"Wer aufhört, besser zu werden, hat aufgehört, gut zu sein." – Philip Rosenthal',
  '"Erfolg hat drei Buchstaben: TUN." – Johann Wolfgang von Goethe',
  '"Kleine Schritte führen zu großen Zielen." – Unbekannt',
  '"Disziplin ist die Brücke zwischen Ziel und Leistung." – Jim Rohn',
  '"Das Geheimnis liegt im Anfangen." – Mark Twain',
];

/* ═══════════════════════════════════════════════════════
   3. STATE & PERSISTENZ
═══════════════════════════════════════════════════════ */
const STORAGE_KEY = 'typemaster_v3';

const DEFAULT_STATE = {
  level: 1, totalXp: 0, currentLevelXp: 0,
  completedLessons: {}, wpmHistory: [], accHistory: [],
  errorMap: {}, streak: 0, lastTrainingDate: null,
  achievements: [],
  dailyChallenge: { date: null, goal: 0, progress: 0, type: 'words', done: false, desc: '' },
  highscores: { wpm: 0, acc: 0 },
  activityLog: {},
  acc95Count: 0,
  raceWins: 0, racesPlayed: 0,
  profile: { name: '', avatar: '🐣', setupDone: false },
  settings: { theme: 'dark', backspace: true, keyboard: true, fingerLegend: true, sound: true, fontSize: 18 },
  story: { chapterResults: {} },
};

let STATE = {};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      STATE = { ...DEFAULT_STATE, ...JSON.parse(raw) };
      STATE.settings = { ...DEFAULT_STATE.settings, ...STATE.settings };
      STATE.profile  = { ...DEFAULT_STATE.profile,  ...STATE.profile  };
      STATE.story    = { ...DEFAULT_STATE.story,    ...(STATE.story || {}) };
    } else {
      STATE = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  } catch (e) {
    STATE = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  if (currentUserId) syncToCloud();
}

async function syncToCloud() {
  if (!currentUserId) return;
  try {
    await setDoc(doc(db, 'users', currentUserId), {
      ...STATE,
      uid:         currentUserId,
      displayName: STATE.profile.name  || 'Gast',
      avatar:      STATE.profile.avatar || '🐣',
      updatedAt:   serverTimestamp(),
      lb_wpm:      STATE.highscores.wpm || 0,
      lb_acc:      STATE.highscores.acc || 0,
      lb_level:    STATE.level          || 1,
      lb_streak:   STATE.streak         || 0,
    });
  } catch (e) {
    console.warn('Cloud-Sync fehlgeschlagen:', e.message);
  }
}

async function loadFromCloud() {
  if (!currentUserId) return false;
  try {
    const snap = await getDoc(doc(db, 'users', currentUserId));
    if (snap.exists()) {
      const data = snap.data();
      STATE = { ...DEFAULT_STATE, ...data };
      STATE.settings = { ...DEFAULT_STATE.settings, ...(data.settings || {}) };
      STATE.profile  = { ...DEFAULT_STATE.profile,  ...(data.profile  || {}) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
      return true;
    }
  } catch (e) {
    console.warn('Cloud-Load fehlgeschlagen:', e.message);
  }
  return false;
}

function resetState() {
  STATE = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState();
}

/* ═══════════════════════════════════════════════════════
   4. ONLINE PRESENCE
═══════════════════════════════════════════════════════ */
async function startPresence() {
  if (!currentUserId) return;
  presenceRef = doc(db, 'presence', currentUserId);
  try {
    await setDoc(presenceRef, {
      uid:      currentUserId,
      name:     STATE.profile.name   || 'Gast',
      avatar:   STATE.profile.avatar || '🐣',
      level:    STATE.level,
      wpm:      STATE.highscores.wpm || 0,
      lastSeen: serverTimestamp(),
      online:   true,
    });
    isOnline = true;
    updateOnlineUI(true);
    // Keep-alive every 30 s
    presenceInterval = setInterval(async () => {
      if (!currentUserId) return;
      try { await updateDoc(presenceRef, { lastSeen: serverTimestamp(), online: true }); } catch (_) {}
    }, 30000);
  } catch (e) {
    console.warn('Presence-Fehler:', e.message);
  }
}

async function stopPresence() {
  if (presenceInterval) clearInterval(presenceInterval);
  if (presenceRef && currentUserId) {
    try { await updateDoc(presenceRef, { online: false }); } catch (_) {}
  }
}

function updateOnlineUI(online) {
  const ind   = document.getElementById('online-indicator');
  const label = document.getElementById('oi-label');
  if (!ind) return;
  if (online) {
    ind.classList.add('online');
    if (label) label.textContent = 'Online';
  } else {
    ind.classList.remove('online');
    if (label) label.textContent = 'Offline';
  }
}

/* ═══════════════════════════════════════════════════════
   5. LEADERBOARD (Echtzeit-Listener)
═══════════════════════════════════════════════════════ */
const LB_FIELD_MAP = { wpm: 'lb_wpm', acc: 'lb_acc', level: 'lb_level', streak: 'lb_streak' };
const LB_UNIT_MAP  = { wpm: ' WPM',   acc: '%',       level: '',         streak: 'd' };

function subscribeLeaderboard(type = 'wpm') {
  if (unsubLeaderboard) { unsubLeaderboard(); unsubLeaderboard = null; }
  currentLbType = type;
  // update tab highlight
  document.querySelectorAll('.lb-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.lb === type);
  });
  const field = LB_FIELD_MAP[type] || 'lb_wpm';
  const q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(50));
  unsubLeaderboard = onSnapshot(q, snap => {
    const rows = snap.docs.map((d, i) => ({ pos: i + 1, uid: d.id, ...d.data() }));
    renderLeaderboard(rows, type);
  }, e => console.warn('Leaderboard-Fehler:', e.message));
}

function renderLeaderboard(rows, type) {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  const field = LB_FIELD_MAP[type] || 'lb_wpm';
  const unit  = LB_UNIT_MAP[type]  || '';

  if (!rows.length) {
    list.innerHTML = '<p class="empty-hint">Noch keine Einträge in der Bestenliste.</p>';
    return;
  }

  let myRank = null;
  list.innerHTML = rows.map((r, i) => {
    const isMe = r.uid === currentUserId;
    if (isMe) myRank = i + 1;
    const posIcon  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
    const posClass = i < 3 ? `top-${i + 1}` : '';
    const rank = RANKS[Math.min((r.lb_level || 1) - 1, RANKS.length - 1)];
    const val  = r[field] ?? 0;
    return `<div class="lb-row ${posClass} ${isMe ? 'is-me' : ''}">
      <div class="lb-pos ${i < 3 ? 'pos-' + (i + 1) : ''}">${posIcon}</div>
      <div class="lb-avatar">${r.avatar || '🐣'}</div>
      <div class="lb-info">
        <div class="lb-name">${escHtml(r.displayName || 'Gast')}${isMe ? '<span class="you-badge">Du</span>' : ''}</div>
        <div class="lb-sub">${rank?.title || 'Anfänger'} · Level ${r.lb_level || 1}</div>
      </div>
      <div class="lb-val">${val}<span class="lb-val-unit">${unit}</span></div>
    </div>`;
  }).join('');

  const myRankEl  = document.getElementById('lb-my-rank');
  const myRankNum = document.getElementById('lb-my-rank-num');
  if (myRank) {
    if (myRankEl)  myRankEl.style.display = 'flex';
    if (myRankNum) myRankNum.textContent   = '#' + myRank;
    checkAchievement('lb_top10', myRank <= 10);
  } else {
    if (myRankEl) myRankEl.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════
   6. ONLINE USERS (für Multiplayer-View)
═══════════════════════════════════════════════════════ */
function subscribeOnlineUsers() {
  const q = query(collection(db, 'presence'), where('online', '==', true), limit(20));
  onSnapshot(q, snap => {
    const users = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.uid !== currentUserId);
    renderOnlineUsers(users);
    const countEl = document.getElementById('mpq-online-count');
    if (countEl) {
      countEl.textContent = users.length > 0
        ? `${users.length} andere Tipper gerade online!`
        : 'Sei der Erste – erstelle ein Rennen!';
    }
  }, () => {});
}

function renderOnlineUsers(users) {
  const container = document.getElementById('mp-online-users');
  if (!container) return;
  if (!users.length) {
    container.innerHTML = '<p class="empty-hint">Keine anderen Nutzer online.</p>';
    return;
  }
  container.innerHTML = users.map(u => `
    <div class="mp-online-card">
      <span class="mp-online-avatar">${u.avatar || '🐣'}</span>
      <div>
        <div class="mp-online-name">${escHtml(u.name || 'Gast')}</div>
        <div class="mp-online-rank">Level ${u.level || 1} · ${u.wpm || 0} WPM best</div>
      </div>
      <div class="online-dot-small"></div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════
   7. PUBLIC RACE ROOMS
═══════════════════════════════════════════════════════ */
async function loadPublicRooms() {
  const container = document.getElementById('mp-public-rooms');
  if (!container) return;
  container.innerHTML = '<p class="empty-hint">Lade…</p>';
  try {
    const q = query(
      collection(db, 'raceRooms'),
      where('visibility', '==', 'public'),
      where('status', 'in', ['waiting', 'starting']),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);
    const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!rooms.length) {
      container.innerHTML = '<p class="empty-hint">Keine öffentlichen Räume aktiv – erstelle das erste!</p>';
      return;
    }
    container.innerHTML = rooms.map(r => {
      const players     = Object.keys(r.players || {}).length;
      const statusLabel = r.status === 'waiting' ? 'Wartet' : 'Startet gleich';
      const statusCls   = r.status === 'waiting' ? 'waiting' : '';
      return `<div class="mp-room-card">
        <span class="mp-room-icon">🏁</span>
        <div class="mp-room-info">
          <div class="mp-room-name">${escHtml(r.name || 'Rennen')}</div>
          <div class="mp-room-meta">${players}/8 Spieler · ${r.textType || 'Wörter'}</div>
        </div>
        <span class="mp-room-status ${statusCls}">${statusLabel}</span>
        <button class="btn-primary btn-sm" onclick="window._joinRoom('${r.id}')">Beitreten</button>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty-hint">Fehler beim Laden der Räume.</p>';
    console.warn(e);
  }
}

// Exposed globally so inline onclick works
window._joinRoom = (code) => joinRaceRoom(code);

/* ═══════════════════════════════════════════════════════
   8. RACE ROOM SYSTEM
═══════════════════════════════════════════════════════ */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function createRaceRoom() {
  if (!currentUserId) { alert('Bitte warte – Verbindung wird hergestellt.'); return; }

  const nameInput   = document.getElementById('mp-room-name');
  const textTypeSel = document.getElementById('mp-text-type-sel');
  const visBtn      = document.querySelector('[data-race-vis].active');

  const roomName   = nameInput?.value.trim() || `${STATE.profile.name || 'Spieler'}s Rennen`;
  const visibility = visBtn?.dataset.raceVis || 'private';
  const textType   = textTypeSel?.value || 'common';
  const code       = generateRoomCode();
  const text       = generateFreeplayText(textType);

  const roomData = {
    id: code, name: roomName, code, visibility, textType, text,
    status:    'waiting',
    hostUid:   currentUserId,
    createdAt: serverTimestamp(),
    players: {
      [currentUserId]: buildPlayerEntry(),
    },
  };

  try {
    await setDoc(doc(db, 'raceRooms', code), roomData);
    currentRaceRoomId = code;
    isRaceHost        = true;
    openRaceRoom(code);
  } catch (e) {
    alert('Fehler beim Erstellen des Raums: ' + e.message);
  }
}

function buildPlayerEntry() {
  return {
    uid:        currentUserId,
    name:       STATE.profile.name   || 'Gast',
    avatar:     STATE.profile.avatar || '🐣',
    ready:      false,
    progress:   0,
    wpm:        0,
    acc:        100,
    finished:   false,
    finishTime: null,
    pos:        0,
  };
}

async function joinRaceRoom(code) {
  code = String(code).toUpperCase().trim();
  if (!currentUserId) { alert('Bitte warte – Verbindung wird hergestellt.'); return; }
  if (code.length !== 6) { alert('Ungültiger Code! Bitte 6 Zeichen eingeben.'); return; }

  try {
    const roomRef = doc(db, 'raceRooms', code);
    const snap    = await getDoc(roomRef);
    if (!snap.exists())                               { alert('Raum nicht gefunden!');       return; }
    const room = snap.data();
    if (room.status === 'running')                    { alert('Das Rennen läuft bereits!');  return; }
    if (Object.keys(room.players || {}).length >= 8)  { alert('Raum ist voll (max 8)!');    return; }

    await updateDoc(roomRef, {
      [`players.${currentUserId}`]: buildPlayerEntry(),
    });
    currentRaceRoomId = code;
    isRaceHost        = false;
    openRaceRoom(code);
  } catch (e) {
    alert('Fehler beim Beitreten: ' + e.message);
  }
}

async function quickMatch() {
  // Try to find an open public room
  try {
    const q = query(
      collection(db, 'raceRooms'),
      where('visibility', '==', 'public'),
      where('status', '==', 'waiting'),
      limit(5)
    );
    const snap  = await getDocs(q);
    const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const open  = rooms.find(r => Object.keys(r.players || {}).length < 8 && r.hostUid !== currentUserId);
    if (open) { await joinRaceRoom(open.id); return; }
  } catch (_) {}
  // None found – create a public room
  const nameInput = document.getElementById('mp-room-name');
  if (nameInput) nameInput.value = 'Schnell-Match';
  // Force visibility to public
  document.querySelectorAll('[data-race-vis]').forEach(b => b.classList.remove('active'));
  const pubBtn = document.querySelector('[data-race-vis="public"]');
  if (pubBtn) pubBtn.classList.add('active');
  await createRaceRoom();
}

function openRaceRoom(code) {
  const overlay = document.getElementById('race-room-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('race-room-title').textContent   = `Raum: ${code}`;
  document.getElementById('race-code-badge').textContent   = `CODE: ${code}`;
  document.getElementById('race-training-area').classList.add('hidden');
  document.getElementById('race-result-area').classList.add('hidden');
  const lobbyEl = document.getElementById('race-lobby-state');
  if (lobbyEl) lobbyEl.style.display = '';
  const hostBtn = document.getElementById('btn-start-race-host');
  if (hostBtn) hostBtn.style.display = isRaceHost ? '' : 'none';
  subscribeRaceRoom(code);
}

function subscribeRaceRoom(code) {
  if (unsubRaceRoom) { unsubRaceRoom(); unsubRaceRoom = null; }
  unsubRaceRoom = onSnapshot(doc(db, 'raceRooms', code), snap => {
    if (!snap.exists()) { leaveRaceRoom(); return; }
    handleRaceSnapshot(snap.data());
  }, e => console.warn('Race-Listener:', e.message));
}

function handleRaceSnapshot(room) {
  renderRacePlayers(room);
  if (room.status === 'countdown' && !raceCountdownTimer) {
    startRaceCountdown(room.text);
  } else if (room.status === 'running') {
    document.getElementById('race-lobby-state').style.display = 'none';
    document.getElementById('race-training-area').classList.remove('hidden');
    document.getElementById('race-countdown-overlay').classList.add('hidden');
    if (!RaceEngine.isActive()) {
      RaceEngine.setup(room.text);
      RaceEngine.start();
      const inp = document.getElementById('race-hidden-input');
      if (inp) { inp.value = ''; inp.focus(); }
      document.getElementById('race-tap-focus')?.classList.add('active');
    }
  } else if (room.status === 'finished') {
    showRaceResult(room);
  }
}

function renderRacePlayers(room) {
  const container = document.getElementById('race-players-list');
  if (!container) return;
  const players = Object.values(room.players || {});
  players.sort((a, b) => b.progress - a.progress || b.wpm - a.wpm);

  const readyCount  = players.filter(p => p.ready).length;
  const statusText  = document.getElementById('race-status-text');
  if (statusText && room.status === 'waiting') {
    statusText.textContent = `${readyCount} / ${players.length} Spieler bereit`;
  }

  container.innerHTML = players.map((p, i) => {
    const isMe     = p.uid === currentUserId;
    const posClass = i === 0 ? 'pos-1' : i === 1 ? 'pos-2' : i === 2 ? 'pos-3' : '';
    return `<div class="race-player-row ${isMe ? 'is-me' : ''} ${p.finished ? 'finished' : ''}">
      <div class="rp-pos ${posClass}">${p.finished ? (i + 1) : '–'}</div>
      <div class="rp-avatar">${p.avatar || '🐣'}</div>
      <div class="rp-info">
        <div class="rp-name-row">
          <span class="rp-name">${escHtml(p.name || 'Gast')}</span>
          ${isMe ? '<span class="rp-you-tag">Du</span>' : ''}
        </div>
        <div class="rp-stats">${p.wpm || 0} WPM · ${p.acc || 100}% Genauigkeit</div>
      </div>
      <div class="rp-progress-bar">
        <div class="rp-progress-fill" style="width:${p.progress || 0}%"></div>
      </div>
      <span class="rp-ready ${p.ready ? 'ready-yes' : ''}">${p.ready ? '✓ Bereit' : '⏳ Wartet'}</span>
    </div>`;
  }).join('');
}

function startRaceCountdown(text) {
  const overlay = document.getElementById('race-countdown-overlay');
  const numEl   = document.getElementById('rco-number');
  overlay.classList.remove('hidden');
  let count = 3;
  numEl.textContent = count;

  raceCountdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      // Restart animation
      numEl.style.animation = 'none';
      void numEl.offsetWidth;
      numEl.style.animation = 'rco-pop .5s cubic-bezier(.4,0,.2,1)';
    } else {
      numEl.textContent = 'GO! 🚀';
      clearInterval(raceCountdownTimer);
      raceCountdownTimer = null;
      setTimeout(() => {
        overlay.classList.add('hidden');
        document.getElementById('race-lobby-state').style.display = 'none';
        document.getElementById('race-training-area').classList.remove('hidden');
        RaceEngine.setup(text);
        RaceEngine.start();
        const inp = document.getElementById('race-hidden-input');
        if (inp) { inp.value = ''; inp.focus(); }
        document.getElementById('race-tap-focus')?.classList.add('active');
      }, 700);
    }
  }, 1000);
}

async function markReady() {
  if (!currentUserId || !currentRaceRoomId) return;
  const roomRef = doc(db, 'raceRooms', currentRaceRoomId);
  try {
    await updateDoc(roomRef, { [`players.${currentUserId}.ready`]: true });
    // Host: auto-start when all ready
    if (isRaceHost) {
      const snap    = await getDoc(roomRef);
      const room    = snap.data();
      const players = Object.values(room.players || {});
      if (players.length >= 1 && players.every(p => p.ready)) {
        await updateDoc(roomRef, { status: 'countdown' });
      }
    }
  } catch (e) { console.warn(e); }
}

async function hostStartRace() {
  if (!isRaceHost || !currentRaceRoomId) return;
  try {
    await updateDoc(doc(db, 'raceRooms', currentRaceRoomId), { status: 'countdown' });
  } catch (e) { console.warn(e); }
}

async function updateRaceProgress(progress, wpm, acc) {
  if (!currentUserId || !currentRaceRoomId) return;
  try {
    await updateDoc(doc(db, 'raceRooms', currentRaceRoomId), {
      [`players.${currentUserId}.progress`]: progress,
      [`players.${currentUserId}.wpm`]:      wpm,
      [`players.${currentUserId}.acc`]:      acc,
    });
  } catch (_) {}
}

async function finishRaceInFirestore(wpm, acc) {
  if (!currentUserId || !currentRaceRoomId) return;
  try {
    const roomRef = doc(db, 'raceRooms', currentRaceRoomId);
    const snap    = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room         = snap.data();
    const finishedCount = Object.values(room.players || {}).filter(p => p.finished).length;
    await updateDoc(roomRef, {
      [`players.${currentUserId}.finished`]:   true,
      [`players.${currentUserId}.progress`]:   100,
      [`players.${currentUserId}.wpm`]:        wpm,
      [`players.${currentUserId}.acc`]:        acc,
      [`players.${currentUserId}.finishTime`]: Date.now(),
      [`players.${currentUserId}.pos`]:        finishedCount + 1,
    });
    // Host marks race finished when all done
    if (isRaceHost) {
      const snap2 = await getDoc(roomRef);
      if (!snap2.exists()) return;
      const allDone = Object.values(snap2.data().players || {}).every(p => p.finished);
      if (allDone) await updateDoc(roomRef, { status: 'finished' });
    }
  } catch (e) { console.warn(e); }
}

function showRaceResult(room) {
  document.getElementById('race-training-area').classList.add('hidden');
  const lobbyEl = document.getElementById('race-lobby-state');
  if (lobbyEl) lobbyEl.style.display = 'none';
  document.getElementById('race-result-area').classList.remove('hidden');

  const players = Object.values(room.players || {}).sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    if (a.finished)  return -1;
    if (b.finished)  return  1;
    return b.progress - a.progress;
  });

  const medals    = ['🥇', '🥈', '🥉'];
  const xpByPos   = [100, 60, 40, 20, 10];
  let myPos = null;

  document.getElementById('race-final-standings').innerHTML = players.map((p, i) => {
    const isMe = p.uid === currentUserId;
    if (isMe) myPos = i;
    return `<div class="race-standing-row pos-${Math.min(i + 1, 4)}">
      <div class="rs-medal">${medals[i] || '#' + (i + 1)}</div>
      <div class="rp-avatar">${p.avatar || '🐣'}</div>
      <div class="rs-player-info">
        <div class="rs-player-name">${escHtml(p.name || 'Gast')}${isMe ? ' <span class="rp-you-tag">Du</span>' : ''}</div>
        <div class="rs-player-stats">${p.finished ? `${p.wpm || 0} WPM · ${p.acc || 100}%` : 'Nicht fertig'}</div>
      </div>
      <div class="rs-wpm-big">${p.wpm || 0}</div>
    </div>`;
  }).join('');

  document.getElementById('race-result-title').textContent =
    myPos === 0 ? '🏆 Du hast gewonnen!' : `🏁 Rennen beendet! (Platz ${(myPos ?? 0) + 1})`;

  if (myPos !== null) {
    const xp = xpByPos[Math.min(myPos, xpByPos.length - 1)] || 10;
    addXP(xp);
    STATE.racesPlayed = (STATE.racesPlayed || 0) + 1;
    if (myPos === 0) {
      STATE.raceWins = (STATE.raceWins || 0) + 1;
      checkAchievement('race_win', true);
      SFX.lessonDone();
      launchConfetti();
    }
    checkAchievement('race_5', STATE.racesPlayed >= 5);
    saveState();
  }
}

async function leaveRaceRoom() {
  // Stop listeners and engine
  if (unsubRaceRoom)   { unsubRaceRoom();   unsubRaceRoom   = null; }
  if (raceCountdownTimer) { clearInterval(raceCountdownTimer); raceCountdownTimer = null; }
  RaceEngine.stop();

  if (currentUserId && currentRaceRoomId) {
    try {
      const roomRef = doc(db, 'raceRooms', currentRaceRoomId);
      const snap    = await getDoc(roomRef);
      if (snap.exists()) {
        const room    = snap.data();
        const players = { ...room.players };
        delete players[currentUserId];

        if (Object.keys(players).length === 0) {
          await deleteDoc(roomRef);
        } else {
          const updates = { [`players.${currentUserId}`]: null };
          if (isRaceHost) updates.hostUid = Object.keys(players)[0];
          await updateDoc(roomRef, updates);
        }
      }
    } catch (_) {}
  }

  currentRaceRoomId = null;
  isRaceHost        = false;

  document.getElementById('race-room-overlay').classList.add('hidden');
  document.getElementById('race-countdown-overlay').classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════
   9. RACE ENGINE (Echtzeit-Tipp-Instanz für Multiplayer)
═══════════════════════════════════════════════════════ */
const RaceEngine = (() => {
  let text = '', pos = 0, errors = 0;
  let errorPositions = new Set();
  let startTime = null, timerInterval = null, active = false;
  let lastProgressPush = 0;

  function setup(t) {
    text = t; pos = 0; errors = 0; errorPositions = new Set();
    startTime = null; active = false;
    clearInterval(timerInterval);
    renderDisplay();
    document.getElementById('race-training-progress').style.width = '0%';
  }

  function start() {
    if (active) return;
    startTime = Date.now();
    active    = true;
    timerInterval = setInterval(tick, 250);
  }

  function stop() {
    clearInterval(timerInterval);
    active = false;
  }

  function isActive() { return active; }

  function tick() {
    if (!active) return;
    const elapsed = (Date.now() - startTime) / 1000;
    const wpm     = calcWPM(pos, elapsed);
    const acc     = calcAcc();
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed) % 60;
    document.getElementById('race-ls-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
    document.getElementById('race-ls-wpm').textContent  = wpm;
    document.getElementById('race-ls-acc').textContent  = acc;

    // Throttle Firestore progress updates to once per second
    if (Date.now() - lastProgressPush > 1000) {
      const progress = Math.round((pos / Math.max(text.length, 1)) * 100);
      updateRaceProgress(progress, wpm, acc);
      lastProgressPush = Date.now();
    }
  }

  function handleKey(char) {
    if (!active) start();
    if (pos >= text.length) return;
    const correct = char === text[pos];
    if (correct) {
      SFX.keyCorrect();
      errorPositions.delete(pos);
    } else {
      errors++;
      errorPositions.add(pos);
      SFX.keyWrong();
    }
    pos++;
    updateDisplay();

    if (pos >= text.length) {
      clearInterval(timerInterval);
      active = false;
      const elapsed = (Date.now() - startTime) / 1000;
      const wpm = calcWPM(text.length, elapsed);
      const acc = calcAcc();
      finishRaceInFirestore(wpm, acc);
    }
  }

  function handleBackspace() {
    if (!active || pos <= 0) return;
    pos--;
    errorPositions.delete(pos);
    updateDisplay();
  }

  function calcWPM(chars, sec) { return sec < 1 ? 0 : Math.round((chars / 5) / (sec / 60)); }
  function calcAcc()            { return pos === 0 ? 100 : Math.round(((pos - errorPositions.size) / pos) * 100); }

  function renderDisplay() {
    const display = document.getElementById('race-text-display');
    if (!display) return;
    display.innerHTML = text.split('').map(ch =>
      `<span class="char pending${ch === ' ' ? ' space' : ''}">${ch === ' ' ? '&nbsp;' : escHtml(ch)}</span>`
    ).join('');
    const first = display.querySelector('.char');
    if (first) { first.classList.remove('pending'); first.classList.add('current'); }
  }

  function updateDisplay() {
    const chars = document.querySelectorAll('#race-text-display .char');
    chars.forEach((el, i) => {
      el.className = 'char' + (text[i] === ' ' ? ' space' : '');
      if (i < pos)       el.classList.add(errorPositions.has(i) ? 'incorrect' : 'correct');
      else if (i === pos) el.classList.add('current');
      else               el.classList.add('pending');
    });
    const prog = document.getElementById('race-training-progress');
    if (prog) prog.style.width = (pos / Math.max(text.length, 1) * 100) + '%';
    const cur = document.querySelector('#race-text-display .char.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return { setup, start, stop, isActive, handleKey, handleBackspace };
})();

/* ═══════════════════════════════════════════════════════
   10. AUDIO ENGINE (Web Audio API – keine externen Dateien)
═══════════════════════════════════════════════════════ */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  }
  return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.12) {
  if (!STATE.settings.sound) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (_) {}
}

/* Mechanical keyboard "click" — sharp attack, quick decay */
function playClick(vol = 0.07) {
  if (!STATE.settings.sound) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    /* High-frequency click body */
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.015);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
    /* Noise burst for "tactile" feel */
    const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.015, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const src = ctx.createBufferSource();
    const ng  = ctx.createGain();
    src.buffer = buf; src.connect(ng); ng.connect(ctx.destination);
    ng.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);
    src.start(ctx.currentTime);
  } catch (_) {}
}

const SFX = {
  keyCorrect:  () => playClick(0.07),
  keyWrong:    () => { playTone(140, 0.22, 'sawtooth', 0.10); playTone(110, 0.15, 'square', 0.06); },
  wordDone:    () => playClick(0.12), /* slightly louder click for space/word boundary */
  lessonDone:  () => {
    playTone(523, 0.12); setTimeout(() => playTone(659, 0.12), 110);
    setTimeout(() => playTone(784, 0.12), 220); setTimeout(() => playTone(1047, 0.25), 330);
  },
  levelUp:     () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15), i * 100)),
  achievement: () => { playTone(880, 0.08); setTimeout(() => playTone(1108, 0.15), 80); },
};

/* ═══════════════════════════════════════════════════════
   11. CONFETTI
═══════════════════════════════════════════════════════ */
function launchConfetti(duration = 2500) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#7c6cf8', '#22d3a0', '#fbbf24', '#f87171', '#60a5fa', '#f97316'];
  const parts   = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    w: 6  + Math.random() * 8,
    h: 4  + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    vx:  (Math.random() - 0.5) * 3,
    vy:  2 + Math.random() * 4,
    vr:  (Math.random() - 0.5) * 0.15,
    opacity: 1,
  }));
  let start = null;
  function draw(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (elapsed > duration * 0.7) p.opacity = Math.max(0, p.opacity - 0.015);
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < duration + 1000) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}

/* ═══════════════════════════════════════════════════════
   12. VIRTUAL KEYBOARD
═══════════════════════════════════════════════════════ */
const KB_ROWS = [
  [['`','`','4'],['1','1','4'],['2','2','4'],['3','3','3'],['4','4','2'],['5','5','1'],
   ['6','6','5'],['7','7','5'],['8','8','6'],['9','9','7'],['0','0','8'],['ß','ß','8'],
   ['´','´','8'],['←','Backspace','8']],
  [['⇥','Tab','4'],['q','q','4'],['w','w','3'],['e','e','2'],['r','r','1'],['t','t','1'],
   ['z','z','5'],['u','u','5'],['i','i','6'],['o','o','7'],['p','p','8'],['ü','ü','8'],
   ['+','+','8'],['#','#','8']],
  [['⇪','CapsLock','4'],['a','a','4'],['s','s','3'],['d','d','2'],['f','f','1'],['g','g','1'],
   ['h','h','5'],['j','j','5'],['k','k','6'],['l','l','7'],['ö','ö','8'],['ä','ä','8'],
   ['↵','Enter','8']],
  [['⇧','ShiftL','4'],['y','y','4'],['x','x','3'],['c','c','2'],['v','v','1'],['b','b','1'],
   ['n','n','5'],['m','m','5'],[',',',','6'],['.','.','7'],['-','-','8'],['⇧','ShiftR','8']],
  [['Strg','CtrlL','4'],['Alt','AltL','4'],['[Leertaste]',' ','t'],
   ['Alt','AltR','5'],['Strg','CtrlR','5']],
];
const KEY_WIDTHS = {
  '←':'w2','⇥':'w15','⇪':'w225','↵':'w225',
  '⇧':'w275','Strg':'w15','Alt':'w15','[Leertaste]':'w6',
};

function buildKeyboard() {
  const kb = document.getElementById('virtual-keyboard');
  if (!kb) return;
  kb.innerHTML = '';
  KB_ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach(([label, val, finger]) => {
      const key = document.createElement('div');
      key.className      = `key ${KEY_WIDTHS[label] || ''}`;
      key.dataset.key    = val.toLowerCase();
      key.dataset.finger = finger;
      key.textContent    = label;
      rowEl.appendChild(key);
    });
    kb.appendChild(rowEl);
  });
}

function highlightNextKey(char) {
  document.querySelectorAll('.key.next-key').forEach(k => k.classList.remove('next-key'));
  if (!char) return;
  const lower = char.toLowerCase();
  const key   = document.querySelector(`.key[data-key="${CSS.escape(lower)}"]`);
  if (key) key.classList.add('next-key');
  if (char !== lower) {
    document.querySelectorAll('.key[data-key="shiftl"],.key[data-key="shiftr"]')
      .forEach(k => k.classList.add('next-key'));
  }
}

function flashKey(char, correct) {
  const key = document.querySelector(`.key[data-key="${CSS.escape(char.toLowerCase())}"]`);
  if (!key) return;
  const cls = correct ? 'pressed' : 'pressed-wrong';
  key.classList.add(cls);
  setTimeout(() => key.classList.remove(cls), 180);
}

/* ═══════════════════════════════════════════════════════
   13. SOLO TRAINING ENGINE
═══════════════════════════════════════════════════════ */
const Engine = (() => {
  let text = '', position = 0, errors = 0;
  let errorPositions = new Set();
  let startTime = null, endTime = null, timerInterval = null, active = false;
  let currentLessonId = null, currentMode = 'normal';
  let timeLimit = 0, wordGoal = 0, onComplete = null;

  function setup(t, lid, mode = 'normal', opts = {}) {
    text            = t;
    position        = 0;
    errors          = 0;
    errorPositions  = new Set();
    startTime       = null;
    endTime         = null;
    active          = false;
    currentLessonId = lid;
    currentMode     = mode;
    timeLimit       = opts.timeLimit  || 0;
    wordGoal        = opts.wordGoal   || 0;
    onComplete      = opts.onComplete || null;
    clearInterval(timerInterval);
    resetLiveSparkline();
    renderTextDisplay();
    updateLiveStats();
    highlightNextKey(text[0]);
  }

  function start() {
    if (active) return;
    startTime = Date.now();
    active    = true;
    timerInterval = setInterval(tick, 250);
  }

  function tick() {
    if (!active) return;
    const elapsed = (Date.now() - startTime) / 1000;
    updateLiveStats();
    if (currentMode === 'time' && timeLimit > 0) {
      const remaining = timeLimit - Math.floor(elapsed);
      document.getElementById('ls-time').textContent = formatTime(remaining);
      if (remaining <= 0) finish();
    } else {
      document.getElementById('ls-time').textContent = formatTime(Math.floor(elapsed));
    }
  }

  function handleKey(char) {
    if (!active) start();
    if (position >= text.length) return;
    const expected = text[position];
    const correct  = char === expected;

    // Accuracy mode: block on wrong key
    if (currentMode === 'accuracy' && !correct) {
      errors++;
      trackError(expected);
      SFX.keyWrong();
      flashKey(expected, false);
      shakeDisplay();
      return;
    }

    if (correct) {
      if (char === ' ') SFX.wordDone(); else SFX.keyCorrect();
      flashKey(char, true);
      errorPositions.delete(position);
    } else {
      errors++;
      trackError(expected);
      SFX.keyWrong();
      flashKey(char, false);
      errorPositions.add(position);
    }

    position++;
    updateDisplay();
    updateLiveStats();
    updateLiveSparkline();

    if (position >= text.length)                              { finish(); return; }
    if (currentMode === 'words' && wordGoal > 0) {
      const words = text.substring(0, position).split(' ').length - 1;
      if (words >= wordGoal)                                  { finish(); return; }
    }
    highlightNextKey(text[position]);
  }

  function handleBackspace() {
    if (!STATE.settings.backspace || !active || position <= 0) return;
    position--;
    errorPositions.delete(position);
    updateDisplay();
    highlightNextKey(text[position]);
  }

  function updateDisplay() {
    const chars = document.querySelectorAll('#text-display .char');
    chars.forEach((el, i) => {
      el.className = 'char' + (text[i] === ' ' ? ' space' : '');
      if (i < position)       el.classList.add(errorPositions.has(i) ? 'incorrect' : 'correct');
      else if (i === position) el.classList.add('current');
      else                    el.classList.add('pending');
    });
    const cur = document.querySelector('#text-display .char.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const fill = document.getElementById('training-progress');
    if (fill) fill.style.width = (position / text.length * 100) + '%';
  }

  function updateLiveStats() {
    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
    document.getElementById('ls-wpm').textContent   = calcWPM(position, elapsed);
    document.getElementById('ls-acc').textContent   = calcAcc();
    document.getElementById('ls-errors').textContent = errors;
  }

  function calcWPM(chars, sec) { return sec < 1 ? 0 : Math.round((chars / 5) / (sec / 60)); }
  function calcAcc()            { return position === 0 ? 100 : Math.round(((position - errorPositions.size) / position) * 100); }

  function finish() {
    clearInterval(timerInterval);
    active    = false;
    endTime   = Date.now();
    const elapsed = (endTime - startTime) / 1000;
    SFX.lessonDone();
    if (onComplete) onComplete({
      wpm: calcWPM(text.length, elapsed),
      acc: calcAcc(),
      errors, elapsed, lessonId: currentLessonId, text,
    });
  }

  function renderTextDisplay() {
    const display = document.getElementById('text-display');
    if (!display) return;
    display.innerHTML = text.split('').map(ch =>
      `<span class="char pending${ch === ' ' ? ' space' : ''}">${ch === ' ' ? '&nbsp;' : escHtml(ch)}</span>`
    ).join('');
    const first = display.querySelector('.char');
    if (first) { first.classList.remove('pending'); first.classList.add('current'); }
  }

  function shakeDisplay() {
    const wrap = document.querySelector('.text-display-wrap');
    if (!wrap) return;
    wrap.classList.add('shake');
    setTimeout(() => wrap.classList.remove('shake'), 300);
  }

  function trackError(char) {
    STATE.errorMap[char] = (STATE.errorMap[char] || 0) + 1;
  }

  function formatTime(sec) {
    const m = Math.floor(Math.abs(sec) / 60);
    const s = Math.abs(sec) % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function getText() { return text; }

  return { setup, handleKey, handleBackspace, getText };
})();

/* ═══════════════════════════════════════════════════════
   14. XP & LEVELING
═══════════════════════════════════════════════════════ */
function calcXpForLesson(wpm, acc, stars) {
  return Math.round(20 + wpm * 0.5 + stars * 10 + (acc >= 100 ? 30 : acc >= 95 ? 15 : 0));
}

function calcStars(wpm, acc) {
  if (acc >= 98 && wpm >= 30) return 3;
  if (acc >= 90 && wpm >= 15) return 2;
  return 1;
}

function addXP(amount) {
  STATE.totalXp      += amount;
  STATE.currentLevelXp += amount;
  const oldLevel = STATE.level;

  while (STATE.level < RANKS.length) {
    const needed = RANKS[STATE.level - 1].xpNeeded;
    if (STATE.currentLevelXp >= needed) {
      STATE.currentLevelXp -= needed;
      STATE.level++;
    } else break;
  }

  if (STATE.level > oldLevel) {
    showLevelUp(STATE.level);
    checkAchievement('level_5',  STATE.level >= 5);
    checkAchievement('level_10', STATE.level >= 10);
  }
  updateNavXP();
}

function getCurrentRank()       { return RANKS[Math.min(STATE.level - 1, RANKS.length - 1)]; }
function getXPForCurrentLevel() { return RANKS[Math.min(STATE.level - 1, RANKS.length - 1)].xpNeeded; }

/* ═══════════════════════════════════════════════════════
   15. ACHIEVEMENTS
═══════════════════════════════════════════════════════ */
function checkAchievement(id, condition) {
  if (!condition || STATE.achievements.includes(id)) return;
  STATE.achievements.push(id);
  const def = ACHIEVEMENTS_DEF.find(a => a.id === id);
  if (def) { SFX.achievement(); showAchievementToast(def); }
  saveState();
}

function checkAllAchievements(stats) {
  const done = Object.keys(STATE.completedLessons).length;
  checkAchievement('first_lesson', done >= 1);
  checkAchievement('lesson_5',     done >= 5);
  checkAchievement('lesson_20',    done >= 20);
  checkAchievement('lesson_all',   done >= ALL_LESSONS.length);
  checkAchievement('streak_3',     STATE.streak >= 3);
  checkAchievement('streak_7',     STATE.streak >= 7);
  checkAchievement('streak_30',    STATE.streak >= 30);
  checkAchievement('wpm_30',       (STATE.highscores.wpm || 0) >= 30);
  checkAchievement('wpm_60',       (STATE.highscores.wpm || 0) >= 60);
  checkAchievement('wpm_100',      (STATE.highscores.wpm || 0) >= 100);
  if (stats) {
    checkAchievement('acc_100',  stats.acc    === 100);
    checkAchievement('no_errors', stats.errors === 0);
    checkAchievement('marathon',  stats.text && stats.text.length > 1000);
    if (stats.acc >= 95) {
      STATE.acc95Count = (STATE.acc95Count || 0) + 1;
      checkAchievement('acc_95_5', STATE.acc95Count >= 5);
    }
  }
  const totalStars = Object.values(STATE.completedLessons).reduce((s, l) => s + (l.stars || 0), 0);
  checkAchievement('stars_10', totalStars >= 10);
}

/* ═══════════════════════════════════════════════════════
   16. STREAK & DAILY CHALLENGE
═══════════════════════════════════════════════════════ */
function updateStreak() {
  const today = todayStr();
  const last  = STATE.lastTrainingDate;
  if (!last)                      STATE.streak = 1;
  else if (last === today)        { /* same day, no change */ }
  else if (daysDiff(last, today) === 1) STATE.streak++;
  else                            STATE.streak = 1;
  STATE.lastTrainingDate = today;
}

function initDailyChallenge() {
  const today = todayStr();
  if (STATE.dailyChallenge.date === today) return;
  const day   = new Date().getDay();
  const types = ['words', 'acc', 'wpm'];
  const t     = types[day % 3];
  let goal, desc;
  if (t === 'words') { goal = [50, 100, 200][day % 3]; desc = `${goal} Wörter tippen`; }
  else if (t === 'acc') { goal = [95, 97, 100][day % 3]; desc = `${goal}% Genauigkeit erreichen`; }
  else { goal = [30, 40, 60][day % 3]; desc = `${goal} WPM erreichen`; }
  STATE.dailyChallenge = { date: today, type: t, goal, progress: 0, done: false, desc };
  saveState();
}

function renderDailyChallenge() {
  const dc = STATE.dailyChallenge;
  if (!dc) return;
  const descEl = document.getElementById('dc-desc');
  const fillEl = document.getElementById('dc-fill');
  const lblEl  = document.getElementById('dc-label');
  if (descEl) descEl.textContent  = dc.desc || '';
  const pct = Math.min((dc.progress / Math.max(dc.goal, 1)) * 100, 100);
  if (fillEl) fillEl.style.width  = pct + '%';
  if (lblEl)  lblEl.textContent   = dc.done ? '✅ Erledigt!' : `${Math.round(dc.progress)} / ${dc.goal}`;
  if (dc.done) {
    const dcEl = document.querySelector('.daily-challenge');
    if (dcEl) dcEl.style.borderLeftColor = 'var(--green)';
  }
}

function updateDailyChallenge(stats) {
  const dc = STATE.dailyChallenge;
  if (!dc || dc.done || dc.date !== todayStr()) return;
  let val = 0;
  if (dc.type === 'words') val = Math.round(stats.wpm * (stats.elapsed / 60));
  if (dc.type === 'acc')   val = stats.acc;
  if (dc.type === 'wpm')   val = stats.wpm;
  dc.progress = Math.max(dc.progress, val);
  if (dc.progress >= dc.goal) {
    dc.done = true;
    addXP(50);
    checkAchievement('daily_done', true);
  }
  renderDailyChallenge();
}

/* ═══════════════════════════════════════════════════════
   17. CHARTS (Canvas, keine externe Bibliothek)
═══════════════════════════════════════════════════════ */
function drawLineChart(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data.length) return;
  const ctx  = canvas.getContext('2d');
  const W    = canvas.offsetWidth || 300;
  const H    = canvas.height || 120;
  canvas.width = W;
  const pad  = { t: 10, r: 10, b: 25, l: 35 };
  const cw   = W - pad.l - pad.r;
  const ch   = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H);

  const vals = data.map(d => d.val);
  const max  = Math.max(...vals, 1);
  const min  = Math.min(...vals);
  const dark = document.documentElement.dataset.theme === 'dark';
  const gridC = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const txtC  = dark ? '#9898b8' : '#5a5a80';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ch / 4) * i;
    ctx.strokeStyle = gridC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = txtC; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(max - (max - min) * (i / 4)), pad.l - 4, y + 3);
  }

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * cw,
    y: pad.t + ch - ((d.val - min) / Math.max(max - min, 1)) * ch,
  }));

  if (pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.t + ch);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.t + ch);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.fill();
  }

  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();
  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  });
}

/* ═══════════════════════════════════════════════════════
   18. TEXT GENERATOR
═══════════════════════════════════════════════════════ */
function generateText(lesson) {
  if (lesson.content) return lesson.content;
  if (lesson.chars) {
    const chars = lesson.chars.replace(/\s/g, '').split('');
    let res = [];
    for (let i = 0; i < 60; i++) {
      res.push(chars[i % chars.length]);
      if ((i + 1) % 5 === 0 && i < 59) res.push(' ');
    }
    return res.join('');
  }
  return TEXT_POOLS.common[Math.floor(Math.random() * TEXT_POOLS.common.length)];
}

function generateFreeplayText(textType = 'common') {
  const pool    = TEXT_POOLS[textType] || TEXT_POOLS.common;
  const entries = [];
  let   total   = 0;
  while (total < 300) {
    const entry = pool[Math.floor(Math.random() * pool.length)];
    entries.push(entry);
    total += entry.length;
  }
  return entries.join(' ');
}

/* ═══════════════════════════════════════════════════════
   19. VIEW ROUTER
═══════════════════════════════════════════════════════ */
let currentView = 'dashboard';

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  const btn = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (btn)  btn.classList.add('active');
  currentView = name;
  closeSidebar();

  if (name === 'dashboard')    renderDashboard();
  if (name === 'course')       renderCourse();
  if (name === 'stats')        renderStats();
  if (name === 'achievements') renderAchievements();
  if (name === 'leaderboard')  subscribeLeaderboard(currentLbType);
  if (name === 'multiplayer')  { loadPublicRooms(); }
  if (name === 'story')        { if (typeof Story !== 'undefined') Story.showMap(); }
}

/* ═══════════════════════════════════════════════════════
   20. DASHBOARD
═══════════════════════════════════════════════════════ */
function renderDashboard() {
  const rank       = getCurrentRank();
  const xpForLevel = getXPForCurrentLevel();
  const hour       = new Date().getHours();
  const greeting   = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const name       = STATE.profile.name || 'Tipper';

  setEl('greeting',    `${greeting}, ${name}!`);
  setEl('rank-badge',  rank.icon);
  setEl('rank-title',  rank.title);
  setEl('dash-level',  STATE.level);
  setEl('nav-level',   STATE.level);

  const xpPct = Math.min((STATE.currentLevelXp / xpForLevel) * 100, 100);
  setStyle('xp-fill', 'width', xpPct + '%');
  setEl('xp-label', `${STATE.currentLevelXp} / ${xpForLevel} XP`);

  const wpmH = STATE.wpmHistory.slice(-10);
  const accH = STATE.accHistory.slice(-10);
  setEl('qs-wpm',    wpmH.length ? Math.round(wpmH.reduce((s, d) => s + d.val, 0) / wpmH.length) + ' WPM' : '–');
  setEl('qs-acc',    accH.length ? Math.round(accH.reduce((s, d) => s + d.val, 0) / accH.length) + '%'    : '–');
  setEl('qs-streak', STATE.streak);
  setEl('qs-done',   Object.keys(STATE.completedLessons).length);

  initDailyChallenge();
  renderDailyChallenge();
  renderNextLesson();

  setEl('daily-quote', QUOTES[new Date().getDay() % QUOTES.length]);

  // Sidebar user info
  const avatar = STATE.profile.avatar || '🐣';
  setEl('nav-avatar', avatar);
  setEl('sf-avatar',  avatar);
  setEl('sf-name',    STATE.profile.name || 'Gast');
  setEl('sf-rank',    rank.title);
}

function renderNextLesson() {
  const next = ALL_LESSONS.find(l => !STATE.completedLessons[l.id]);
  if (next) {
    setEl('nl-title', next.title);
    setEl('nl-desc',  next.desc || '');
    const btn = document.getElementById('btn-next-lesson');
    if (btn) btn.dataset.lessonId = next.id;
  } else {
    setEl('nl-title', '🎉 Alle Lektionen abgeschlossen!');
    setEl('nl-desc',  'Weiter im freien Training');
  }
}

/* ═══════════════════════════════════════════════════════
   21. COURSE
═══════════════════════════════════════════════════════ */
function renderCourse() {
  const container = document.getElementById('course-modules');
  if (!container) return;
  container.innerHTML = '';

  COURSE_MODULES.forEach((mod, mi) => {
    const completedCount = mod.lessons.filter(l => STATE.completedLessons[l.id]).length;
    const block          = document.createElement('div');
    block.className      = 'module-block';
    block.innerHTML      = `
      <div class="module-header">
        <span class="module-icon">${mod.icon}</span>
        <div class="module-info"><h3>${mod.title}</h3><p>${mod.desc}</p></div>
        <span class="module-progress-text">${completedCount}/${mod.lessons.length}</span>
      </div>
      <div class="lessons-grid" id="lessons-${mod.id}"></div>`;
    container.appendChild(block);

    const grid = block.querySelector(`#lessons-${mod.id}`);
    mod.lessons.forEach((lesson, li) => {
      const prevDone = li === 0 || !!STATE.completedLessons[mod.lessons[li - 1].id];
      const unlocked = li === 0 || prevDone || !!STATE.completedLessons[lesson.id];
      const completed = !!STATE.completedLessons[lesson.id];
      const stars     = STATE.completedLessons[lesson.id]?.stars || 0;

      const card = document.createElement('div');
      card.className = `lesson-card ${completed ? 'completed' : ''} ${!unlocked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="lesson-num">${mod.title} · ${li + 1}</div>
        <h4>${lesson.title}</h4>
        <p>${lesson.desc || ''}</p>
        ${completed ? `<div class="lesson-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>` : ''}
        ${!unlocked  ? '<div class="lesson-lock">🔒</div>' : ''}`;

      if (unlocked) card.addEventListener('click', () => startLesson(lesson.id));
      grid.appendChild(card);
    });
  });
}

/* ═══════════════════════════════════════════════════════
   22. TRAINING
═══════════════════════════════════════════════════════ */
function startLesson(lessonId) {
  const lesson = ALL_LESSONS.find(l => l.id === lessonId);
  if (!lesson) return;
  setEl('training-title', lesson.title);
  setEl('training-mode-badge', 'Kurs');
  setStyle('training-progress', 'width', '0%');
  showView('training');
  Engine.setup(generateText(lesson), lessonId, 'normal', {
    onComplete: stats => onLessonComplete(stats, lesson),
  });
  setEl('ls-time', '0:00');
  focusInput();
}

function startFreeplay() {
  const selectedCard = document.querySelector('.fp-card.selected');
  const mode         = selectedCard?.dataset.mode || 'time';
  const textType     = document.getElementById('fp-text-type')?.value || 'common';
  let opts           = {};

  if (mode === 'time') {
    const ao      = document.querySelector('.fp-card[data-mode="time"] .fp-opt.active');
    opts.timeLimit = parseInt(ao?.dataset.time || 60);
  }
  if (mode === 'words') {
    const ao      = document.querySelector('.fp-card[data-mode="words"] .fp-opt.active');
    opts.wordGoal = parseInt(ao?.dataset.words || 25);
  }

  const modeLabels = { time:`⏱ ${opts.timeLimit||60}s`, words:`📝 ${opts.wordGoal||25} Wörter`, accuracy:'🎯 Genauigkeit', focus:'🧘 Fokus' };
  setEl('training-title', 'Freies Training');
  setEl('training-mode-badge', modeLabels[mode] || mode);
  setStyle('training-progress', 'width', '0%');
  showView('training');

  opts.onComplete = stats => onLessonComplete(stats, null);
  Engine.setup(generateFreeplayText(textType), null, mode, opts);
  setEl('ls-time', mode === 'time' ? `${opts.timeLimit || 60}:00` : '0:00');
  focusInput();
}

function onLessonComplete(stats, lesson) {
  updateStreak();
  const today = todayStr();
  STATE.activityLog[today] = (STATE.activityLog[today] || 0) + 1;
  STATE.wpmHistory.push({ val: stats.wpm, date: today });
  STATE.accHistory.push({ val: stats.acc, date: today });
  if (STATE.wpmHistory.length > 100) STATE.wpmHistory.shift();
  if (STATE.accHistory.length > 100) STATE.accHistory.shift();
  if (stats.wpm > (STATE.highscores.wpm || 0)) STATE.highscores.wpm = stats.wpm;
  if (stats.acc > (STATE.highscores.acc || 0)) STATE.highscores.acc = stats.acc;

  const stars    = calcStars(stats.wpm, stats.acc);
  const xpGained = calcXpForLesson(stats.wpm, stats.acc, stars);

  if (lesson) {
    const ex = STATE.completedLessons[lesson.id];
    STATE.completedLessons[lesson.id] = {
      stars: Math.max(stars, ex?.stars || 0),
      wpm: stats.wpm, acc: stats.acc, date: today,
    };
  }

  addXP(xpGained);
  updateDailyChallenge(stats);
  checkAllAchievements({ ...stats, text: Engine.getText() });
  saveState();
  showResult({ ...stats, stars, xpGained, lesson });
}

function showResult({ wpm, acc, errors, elapsed, stars, xpGained, lesson }) {
  setEl('result-stars', '⭐'.repeat(stars) + '☆'.repeat(3 - stars));
  const titles = ['Gut gemacht!', 'Super!', 'Fantastisch!', 'Ausgezeichnet!', 'Bravo!'];
  const msgs   = {
    3: ['Makellose Leistung! 🎉', 'Du bist ein echtes Tipp-Talent!'],
    2: ['Sehr gut! Noch etwas Übung.', 'Gute Arbeit!'],
    1: ['Weiter üben – du schaffst das!'],
  };
  setEl('result-title',   titles[Math.floor(Math.random() * titles.length)]);
  const m = msgs[stars];
  setEl('result-message', m[Math.floor(Math.random() * m.length)]);
  setEl('res-wpm',    wpm);
  setEl('res-acc',    acc + '%');
  setEl('res-errors', errors);
  setEl('res-time',   Math.round(elapsed) + 's');
  setEl('res-xp-val', xpGained);

  const fb = [];
  if (acc >= 98)      fb.push('✅ Ausgezeichnete Genauigkeit!');
  else if (acc >= 90) fb.push('✅ Gute Genauigkeit.');
  else                fb.push('⚠ Tippe langsamer und präziser – Genauigkeit vor Tempo.');
  if (wpm >= 40)      fb.push('✅ Sehr flottes Tempo!');
  else                fb.push('💡 Tipp: Halte die Finger auf der Grundreihe und schaue nicht auf die Tastatur.');
  if (errors === 0)   fb.push('🎯 Keine einzigen Fehler – absolut makellos!');
  const fbEl = document.getElementById('result-feedback');
  if (fbEl) fbEl.innerHTML = fb.map(f => `<p>${f}</p>`).join('');

  const topErrors = Object.entries(STATE.errorMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).filter(([, c]) => c > 0);
  const probEl = document.getElementById('result-problem-keys');
  if (topErrors.length) {
    if (probEl) probEl.style.display = 'block';
    setEl('problem-keys-list', topErrors.map(([ch, cnt]) =>
      `<span class="prob-key">${ch === ' ' ? '␣' : escHtml(ch)} (${cnt}×)</span>`
    ).join(''));
  } else {
    if (probEl) probEl.style.display = 'none';
  }

  const next = lesson ? ALL_LESSONS.find((l, i) => ALL_LESSONS[i - 1]?.id === lesson.id) : null;
  const nextBtn  = document.getElementById('btn-next-after-result');
  const retryBtn = document.getElementById('btn-retry');
  if (nextBtn)  nextBtn.dataset.nextLessonId = next?.id || '';
  if (retryBtn) retryBtn.dataset.lessonId    = lesson?.id || '';

  showResultVsLeaderboard(wpm, acc);
  showView('result');
  if (stars === 3) { setTimeout(launchConfetti, 200); SFX.achievement(); }
  updateNavXP();
}

async function showResultVsLeaderboard(wpm, acc) {
  const vsEl      = document.getElementById('result-vs');
  const vsContent = document.getElementById('result-vs-content');
  if (!vsEl || !vsContent || !isOnline) { if (vsEl) vsEl.style.display = 'none'; return; }
  try {
    const q    = query(collection(db, 'users'), orderBy('lb_wpm', 'desc'), limit(10));
    const snap = await getDocs(q);
    const top10 = snap.docs.map(d => d.data());
    if (!top10.length) { vsEl.style.display = 'none'; return; }
    const topWpm   = top10[0]?.lb_wpm || 0;
    const avgWpm   = Math.round(top10.reduce((s, u) => s + (u.lb_wpm || 0), 0) / top10.length);
    const betterThan = top10.filter(u => (u.lb_wpm || 0) < wpm).length;
    vsContent.innerHTML = `
      <div class="result-vs-row"><span>Dein WPM</span><span class="${wpm >= avgWpm ? 'better' : 'worse'}">${wpm}</span></div>
      <div class="result-vs-row"><span>Top-1 WPM</span><span>${topWpm}</span></div>
      <div class="result-vs-row"><span>Ø Top-10 WPM</span><span>${avgWpm}</span></div>
      <div class="result-vs-row"><span>Du schlägst</span><span class="${betterThan > 0 ? 'better' : ''}">${betterThan} / 10 Top-Tipper</span></div>`;
    vsEl.style.display = 'block';
  } catch (_) {
    if (vsEl) vsEl.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════
   23. STATS VIEW
═══════════════════════════════════════════════════════ */
function renderStats() {
  drawLineChart('chart-wpm', STATE.wpmHistory.slice(-20), '#7c6cf8');
  drawLineChart('chart-acc', STATE.accHistory.slice(-20), '#22d3a0');

  const heatmap = document.getElementById('problem-heatmap');
  if (heatmap) {
    heatmap.innerHTML = '';
    const sorted = Object.entries(STATE.errorMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 30).filter(([, c]) => c > 0);
    if (!sorted.length) {
      heatmap.innerHTML = '<span style="color:var(--text-3)">Noch keine Fehler aufgezeichnet.</span>';
    } else {
      sorted.forEach(([char, count]) => {
        const max  = sorted[0][1];
        const cls  = count > max * 0.66 ? 'heat-3' : count > max * 0.33 ? 'heat-2' : 'heat-1';
        const el   = document.createElement('div');
        el.className = `heat-key ${cls}`;
        el.textContent = char === ' ' ? '␣' : char;
        el.title       = `${count}× Fehler`;
        heatmap.appendChild(el);
      });
    }
  }

  setEl('personal-bests', `
    <div class="pb-row"><span>Höchste WPM</span><span>${STATE.highscores.wpm || 0} WPM</span></div>
    <div class="pb-row"><span>Höchste Genauigkeit</span><span>${STATE.highscores.acc || 0}%</span></div>
    <div class="pb-row"><span>Längste Streak</span><span>${STATE.streak} Tage</span></div>
    <div class="pb-row"><span>Abgeschlossene Lektionen</span><span>${Object.keys(STATE.completedLessons).length}</span></div>
    <div class="pb-row"><span>Gesamte XP</span><span>${STATE.totalXp}</span></div>
    <div class="pb-row"><span>Level</span><span>${STATE.level}</span></div>
    <div class="pb-row"><span>Rennen gewonnen</span><span>${STATE.raceWins || 0}</span></div>
    <div class="pb-row"><span>Rennen gespielt</span><span>${STATE.racesPlayed || 0}</span></div>`);

  const ag    = document.getElementById('activity-grid');
  const today = todayStr();
  if (ag) {
    ag.innerHTML = '';
    for (let i = 89; i >= 0; i--) {
      const d   = new Date(); d.setDate(d.getDate() - i);
      const ds  = d.toISOString().slice(0, 10);
      const cnt = STATE.activityLog[ds] || 0;
      const div = document.createElement('div');
      div.className = `ag-day${cnt > 0 ? ` active-${Math.min(cnt, 4)}` : ''}${ds === today ? ' today' : ''}`;
      div.title     = `${ds}: ${cnt} Sessions`;
      ag.appendChild(div);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   24. ACHIEVEMENTS VIEW
═══════════════════════════════════════════════════════ */
function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;
  grid.innerHTML = '';
  setEl('ach-progress-text', `${STATE.achievements.length} von ${ACHIEVEMENTS_DEF.length} freigeschaltet`);
  ACHIEVEMENTS_DEF.forEach(ach => {
    const unlocked = STATE.achievements.includes(ach.id);
    const card     = document.createElement('div');
    card.className = `ach-card ${unlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `
      <span class="ach-icon">${ach.icon}</span>
      <h4>${ach.title}</h4>
      <p>${ach.desc}</p>
      ${unlocked ? '<span class="ach-unlocked-tag">✓ Freigeschaltet</span>' : ''}`;
    grid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════
   25. PROFILE SETUP
═══════════════════════════════════════════════════════ */
let tempAvatar = '🐣';

function buildAvatarGrid(containerId, currentAvatar, onSelect) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  AVATARS.forEach(av => {
    const btn = document.createElement('button');
    btn.className   = `avatar-opt${av === (currentAvatar || '🐣') ? ' selected' : ''}`;
    btn.textContent = av;
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(av);
    });
    grid.appendChild(btn);
  });
}

function showProfileSetup() {
  tempAvatar = STATE.profile.avatar || '🐣';
  buildAvatarGrid('avatar-grid', tempAvatar, av => { tempAvatar = av; });
  const nameInput = document.getElementById('profile-name-input');
  if (nameInput) nameInput.value = STATE.profile.name || '';
  document.getElementById('profile-modal').classList.remove('hidden');
}

function saveProfile() {
  const nameInput = document.getElementById('profile-name-input');
  const name = nameInput?.value.trim();
  if (!name) { nameInput?.focus(); return; }
  STATE.profile.name      = name;
  STATE.profile.avatar    = tempAvatar;
  STATE.profile.setupDone = true;
  document.getElementById('profile-modal').classList.add('hidden');
  saveState();
  updateNavXP();
  renderDashboard();
  // Update presence name
  if (presenceRef && currentUserId) {
    updateDoc(presenceRef, { name, avatar: tempAvatar }).catch(() => {});
  }
}

/* ═══════════════════════════════════════════════════════
   26. NAV XP UPDATE
═══════════════════════════════════════════════════════ */
function updateNavXP() {
  const xpForLevel = getXPForCurrentLevel();
  const pct        = Math.min((STATE.currentLevelXp / xpForLevel) * 100, 100);
  setEl('nav-level',  STATE.level);
  setEl('nav-xp',     STATE.totalXp);
  setEl('nav-streak', STATE.streak);
  setStyle('nav-xp-fill', 'width', pct + '%');
  setEl('nav-avatar', STATE.profile.avatar || '🐣');
}

/* ═══════════════════════════════════════════════════════
   27. TOASTS & OVERLAYS
═══════════════════════════════════════════════════════ */
function showAchievementToast(ach) {
  const toast = document.getElementById('achievement-toast');
  if (!toast) return;
  setEl('at-icon', ach.icon);
  setEl('at-name', ach.title);
  toast.classList.remove('hidden', 'toast-out');
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 3500);
}

function showLevelUp(level) {
  const rank = RANKS[Math.min(level - 1, RANKS.length - 1)];
  setEl('lu-level', level);
  setEl('lu-rank',  `${rank.icon} ${rank.title}`);
  document.getElementById('levelup-overlay').classList.remove('hidden');
  SFX.levelUp();
}

/* ═══════════════════════════════════════════════════════
   28. SETTINGS
═══════════════════════════════════════════════════════ */
function applySettings() {
  const s = STATE.settings;
  document.documentElement.dataset.theme = s.theme;
  document.getElementById('set-dark')?.classList.toggle('active',  s.theme === 'dark');
  document.getElementById('set-light')?.classList.toggle('active', s.theme === 'light');
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.textContent = s.theme === 'dark' ? '🌙' : '☀️';

  document.documentElement.style.setProperty('--training-font-size', s.fontSize + 'px');
  const fsInput = document.getElementById('set-fontsize');
  if (fsInput) fsInput.value = s.fontSize;
  setEl('set-fontsize-val', s.fontSize + 'px');

  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
  setChk('set-backspace',    s.backspace);
  setChk('set-keyboard',     s.keyboard);
  setChk('set-fingerlegend', s.fingerLegend);
  setChk('set-sound',        s.sound);

  const kbc = document.getElementById('keyboard-container');
  if (kbc) kbc.style.display = s.keyboard ? '' : 'none';
  const fl = document.querySelector('.finger-legend');
  if (fl) fl.style.display = s.fingerLegend ? '' : 'none';
  const soundBtn = document.getElementById('btn-sound');
  if (soundBtn) soundBtn.textContent = s.sound ? '🔊' : '🔇';

  const usernameInput = document.getElementById('set-username');
  if (usernameInput) usernameInput.value = STATE.profile.name || '';
}

/* ═══════════════════════════════════════════════════════
   29. EXPORT / IMPORT
═══════════════════════════════════════════════════════ */
function exportProgress() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `typemaster_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      STATE          = { ...DEFAULT_STATE, ...data };
      STATE.settings = { ...DEFAULT_STATE.settings, ...(data.settings || {}) };
      STATE.profile  = { ...DEFAULT_STATE.profile,  ...(data.profile  || {}) };
      saveState();
      applySettings();
      renderDashboard();
      updateNavXP();
      alert('✅ Fortschritt erfolgreich importiert!');
    } catch {
      alert('❌ Fehler beim Importieren: Ungültige Datei.');
    }
  };
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════════════════
   30. HELPERS
═══════════════════════════════════════════════════════ */
function todayStr()       { return new Date().toISOString().slice(0, 10); }
function daysDiff(a, b)   { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function escHtml(s)       { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function closeSidebar()   { document.getElementById('sidebar')?.classList.remove('open'); }
function setEl(id, html)  { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function setStyle(id, prop, val) { const el = document.getElementById(id); if (el) el.style[prop] = val; }

function focusInput() {
  const inp = document.getElementById('hidden-input');
  if (inp) { inp.value = ''; inp.focus(); }
  document.getElementById('tap-to-focus')?.classList.add('active');
}

/* CSS shake (injected once) */
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
  .shake{animation:shake .28s ease;border-color:var(--red)!important}
`;
document.head.appendChild(shakeStyle);

/* ═══════════════════════════════════════════════════════
   31. EVENT BINDING
═══════════════════════════════════════════════════════ */
function bindEvents() {
  /* Navigation */
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
  document.getElementById('main-content')?.addEventListener('click', closeSidebar);

  /* Theme / Sound */
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    STATE.settings.theme = STATE.settings.theme === 'dark' ? 'light' : 'dark';
    applySettings(); saveState();
  });
  document.getElementById('btn-sound')?.addEventListener('click', () => {
    STATE.settings.sound = !STATE.settings.sound;
    applySettings(); saveState();
  });

  /* Avatar → profile modal */
  document.getElementById('nav-avatar')?.addEventListener('click', () => {
    if (!STATE.profile.setupDone) showProfileSetup(); else showView('settings');
  });

  /* Profile modal */
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);
  document.getElementById('profile-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProfile();
  });

  /* Dashboard */
  document.getElementById('btn-next-lesson')?.addEventListener('click', e => {
    const id = e.currentTarget.dataset.lessonId;
    if (id) startLesson(id); else showView('freeplay');
  });
  document.getElementById('btn-quick-race')?.addEventListener('click', () => showView('multiplayer'));

  /* Solo training */
  document.getElementById('hidden-input')?.addEventListener('keydown', e => {
    e.preventDefault();
    if (e.key === 'Backspace') { Engine.handleBackspace(); return; }
    if (['Shift','Control','Alt','Meta','CapsLock','Tab','Escape'].includes(e.key)) return;
    if (e.key.length === 1) Engine.handleKey(e.key);
  });
  document.getElementById('tap-to-focus')?.addEventListener('click', focusInput);

  /* Result */
  document.getElementById('btn-retry')?.addEventListener('click', e => {
    const id = e.currentTarget.dataset.lessonId;
    if (id) startLesson(id); else startFreeplay();
  });
  document.getElementById('btn-next-after-result')?.addEventListener('click', e => {
    const id = e.currentTarget.dataset.nextLessonId;
    if (id) startLesson(id); else showView('course');
  });
  document.getElementById('btn-challenge-friend')?.addEventListener('click', () => quickMatch());

  /* Back / Restart */
  document.getElementById('btn-back-course')?.addEventListener('click', () => showView('course'));
  document.getElementById('btn-restart-lesson')?.addEventListener('click', () => {
    const title  = document.getElementById('training-title')?.textContent;
    const lesson = ALL_LESSONS.find(l => l.title === title);
    if (lesson) startLesson(lesson.id); else startFreeplay();
  });

  /* Free play card selection */
  document.querySelectorAll('.fp-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('fp-opt')) return;
      document.querySelectorAll('.fp-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
  document.querySelectorAll('.fp-opt').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      opt.closest('.fp-options')?.querySelectorAll('.fp-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });
  document.getElementById('btn-start-freeplay')?.addEventListener('click', startFreeplay);

  /* Multiplayer view */
  document.getElementById('btn-mp-create')?.addEventListener('click', createRaceRoom);
  document.getElementById('btn-mp-join-code')?.addEventListener('click', () => {
    const code = document.getElementById('mp-join-code-input')?.value;
    if (code) joinRaceRoom(code);
  });
  document.getElementById('mp-join-code-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const code = e.target.value; if (code) joinRaceRoom(code);
    }
  });
  document.getElementById('btn-mp-quickmatch')?.addEventListener('click', quickMatch);
  document.getElementById('btn-mp-refresh')?.addEventListener('click', loadPublicRooms);

  /* Race room visibility toggle (in MP create form) */
  document.querySelectorAll('[data-race-vis]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.closest('.fp-options')?.querySelectorAll('[data-race-vis]')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  /* Race room overlay */
  document.getElementById('btn-leave-race')?.addEventListener('click',       leaveRaceRoom);
  document.getElementById('btn-ready-race')?.addEventListener('click',       markReady);
  document.getElementById('btn-start-race-host')?.addEventListener('click',  hostStartRace);
  document.getElementById('btn-race-rematch')?.addEventListener('click',     async () => {
    if (!isRaceHost || !currentRaceRoomId) return;
    try {
      const roomRef = doc(db, 'raceRooms', currentRaceRoomId);
      const snap    = await getDoc(roomRef);
      if (!snap.exists()) return;
      const resetPlayers = {};
      Object.keys(snap.data().players || {}).forEach(uid => {
        resetPlayers[`players.${uid}.ready`]    = false;
        resetPlayers[`players.${uid}.progress`] = 0;
        resetPlayers[`players.${uid}.wpm`]      = 0;
        resetPlayers[`players.${uid}.acc`]      = 100;
        resetPlayers[`players.${uid}.finished`] = false;
        resetPlayers[`players.${uid}.pos`]      = 0;
        resetPlayers[`players.${uid}.finishTime`] = null;
      });
      await updateDoc(roomRef, {
        status: 'waiting',
        text:   generateFreeplayText('common'),
        ...resetPlayers,
      });
      document.getElementById('race-result-area').classList.add('hidden');
      document.getElementById('race-lobby-state').style.display = '';
      document.getElementById('race-training-area').classList.add('hidden');
      RaceEngine.stop();
    } catch (e) { console.warn(e); }
  });
  document.getElementById('btn-race-leave-after')?.addEventListener('click', leaveRaceRoom);
  document.getElementById('btn-copy-race-code')?.addEventListener('click',   () => {
    navigator.clipboard.writeText(currentRaceRoomId || '').then(() => {
      const btn = document.getElementById('btn-copy-race-code');
      if (btn) { btn.textContent = '✅'; setTimeout(() => { btn.textContent = '📋'; }, 1500); }
    }).catch(() => {});
  });

  /* Race training input */
  document.getElementById('race-tap-focus')?.addEventListener('click', () => {
    const inp = document.getElementById('race-hidden-input');
    if (inp) { inp.value = ''; inp.focus(); }
    document.getElementById('race-tap-focus')?.classList.add('active');
  });
  document.getElementById('race-hidden-input')?.addEventListener('keydown', e => {
    e.preventDefault();
    if (e.key === 'Backspace') { RaceEngine.handleBackspace(); return; }
    if (['Shift','Control','Alt','Meta','CapsLock','Tab','Escape'].includes(e.key)) return;
    if (e.key.length === 1) RaceEngine.handleKey(e.key);
  });

  /* Leaderboard tabs */
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => subscribeLeaderboard(tab.dataset.lb));
  });

  /* Level Up close */
  document.getElementById('btn-lu-close')?.addEventListener('click', () => {
    document.getElementById('levelup-overlay').classList.add('hidden');
  });

  /* Settings */
  document.getElementById('set-dark')?.addEventListener('click', () => {
    STATE.settings.theme = 'dark'; applySettings(); saveState();
  });
  document.getElementById('set-light')?.addEventListener('click', () => {
    STATE.settings.theme = 'light'; applySettings(); saveState();
  });
  document.getElementById('set-fontsize')?.addEventListener('input', e => {
    STATE.settings.fontSize = parseInt(e.target.value);
    setEl('set-fontsize-val', STATE.settings.fontSize + 'px');
    document.documentElement.style.setProperty('--training-font-size', STATE.settings.fontSize + 'px');
  });
  document.getElementById('set-fontsize')?.addEventListener('change', saveState);
  document.getElementById('set-backspace')?.addEventListener('change',    e => { STATE.settings.backspace    = e.target.checked; saveState(); });
  document.getElementById('set-keyboard')?.addEventListener('change',     e => { STATE.settings.keyboard     = e.target.checked; applySettings(); saveState(); });
  document.getElementById('set-fingerlegend')?.addEventListener('change', e => { STATE.settings.fingerLegend = e.target.checked; applySettings(); saveState(); });
  document.getElementById('set-sound')?.addEventListener('change',        e => { STATE.settings.sound        = e.target.checked; applySettings(); saveState(); });

  /* Username save in settings */
  document.getElementById('btn-save-username')?.addEventListener('click', () => {
    const val = document.getElementById('set-username')?.value.trim();
    if (!val) return;
    STATE.profile.name = val;
    saveState();
    renderDashboard();
    alert('✅ Name gespeichert!');
  });

  /* Avatar in settings */
  buildAvatarGrid('avatar-picker-settings', STATE.profile.avatar, av => {
    STATE.profile.avatar = av; saveState(); updateNavXP();
    setEl('nav-avatar', av); setEl('sf-avatar', av);
  });

  /* Export / Import / Reset */
  document.getElementById('btn-export')?.addEventListener('click', exportProgress);
  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('import-file')?.click();
  });
  document.getElementById('import-file')?.addEventListener('change', e => {
    if (e.target.files[0]) importProgress(e.target.files[0]);
  });
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm('Wirklich alle Daten zurücksetzen? Dieser Vorgang kann nicht rückgängig gemacht werden.')) {
      resetState();
      applySettings();
      updateNavXP();
      showView('dashboard');
      alert('✅ Alle Daten wurden zurückgesetzt.');
    }
  });

  /* Window resize → redraw charts */
  window.addEventListener('resize', () => {
    if (currentView === 'stats') renderStats();
  });

  /* Before unload: mark offline */
  window.addEventListener('beforeunload', () => stopPresence());
}

/* ═══════════════════════════════════════════════════════
   32. INIT (Firebase Auth → load state → start app)
═══════════════════════════════════════════════════════ */
async function init() {
  loadState();
  buildKeyboard();

  const splashStatus = document.getElementById('splash-status');
  let appBooted = false;
  let eventsBound = false;

  function bootApp() {
    if (appBooted) return;
    appBooted = true;

    if (!eventsBound) {
      applySettings();
      updateNavXP();
      bindEvents();
      eventsBound = true;
    }

    setTimeout(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.classList.add('fade-out');
      setTimeout(() => {
        if (splash) splash.style.display = 'none';
        document.getElementById('app')?.classList.remove('hidden');
        showView('dashboard');

        if (!STATE.profile.setupDone) {
          setTimeout(showProfileSetup, 600);
        }
      }, 400);
    }, 1800);
  }

  // Fallback: boot offline if Firebase doesn't respond within 8 seconds
  setTimeout(() => {
    if (!appBooted) {
      if (splashStatus) splashStatus.textContent = 'Offline-Modus';
      updateOnlineUI(false);
      bootApp();
    }
  }, 8000);

  // Firebase anonymous sign-in
  try {
    if (splashStatus) splashStatus.textContent = 'Verbinde mit Server…';
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('Firebase Auth fehlgeschlagen:', e.message);
    if (splashStatus) splashStatus.textContent = 'Offline-Modus';
  }

  // Auth state listener – may fire more than once; boot only on first call
  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUserId = user.uid;
      if (!appBooted && splashStatus) splashStatus.textContent = 'Lade Profil…';
      const cloudLoaded = await loadFromCloud();
      if (!cloudLoaded) {
        syncToCloud();
      }
      startPresence();
      subscribeOnlineUsers();
      updateOnlineUI(true);
    } else {
      updateOnlineUI(false);
    }

    bootApp();
  });
}

document.addEventListener('DOMContentLoaded', init);

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG — LIVE-WPM-SPARKLINE
═══════════════════════════════════════════════════════ */
let _sparkSamples = [];
let _sparkLastPos = 0;
const SPARK_INTERVAL = 8; /* sample every N characters */

function resetLiveSparkline() {
  _sparkSamples = [];
  _sparkLastPos = 0;
  const c = document.getElementById('live-wpm-spark');
  if (c) {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  }
}

function updateLiveSparkline() {
  /* Access Engine internals via the live stats display */
  const wpmEl = document.getElementById('ls-wpm');
  if (!wpmEl) return;
  const wpm = parseInt(wpmEl.textContent) || 0;
  if (wpm <= 0) return;

  /* Sample every SPARK_INTERVAL characters */
  _sparkLastPos++;
  if (_sparkLastPos % SPARK_INTERVAL !== 0) return;

  _sparkSamples.push(wpm);
  if (_sparkSamples.length > 40) _sparkSamples.shift();

  drawSparkline();
}

function drawSparkline() {
  const canvas = document.getElementById('live-wpm-spark');
  if (!canvas || _sparkSamples.length < 2) return;

  const W = canvas.offsetWidth || 120;
  canvas.width = W;
  const H    = canvas.height;
  const ctx  = canvas.getContext('2d');
  const dark = document.documentElement.dataset.theme === 'dark';

  ctx.clearRect(0, 0, W, H);

  const vals = _sparkSamples;
  const max  = Math.max(...vals, 1);
  const min  = Math.max(0, Math.min(...vals) - 5);
  const pad  = { t: 3, b: 3, l: 2, r: 2 };
  const cw   = W - pad.l - pad.r;
  const ch   = H - pad.t - pad.b;

  const pts = vals.map((v, i) => ({
    x: pad.l + (i / (vals.length - 1)) * cw,
    y: pad.t + ch - ((v - min) / Math.max(max - min, 1)) * ch,
  }));

  /* Fill */
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pad.t + ch);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, pad.t + ch);
  ctx.closePath();
  ctx.fillStyle = dark ? 'rgba(124,108,248,.25)' : 'rgba(124,108,248,.15)';
  ctx.fill();

  /* Line */
  ctx.beginPath();
  ctx.strokeStyle = '#7c6cf8';
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  /* Last point dot */
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#7c6cf8';
  ctx.fill();
}

/* ═══════════════════════════════════════════════════════
   STORY MODE — Full Version
   3 Acts · Mini Battles · Boss Fights · Difficulty System
═══════════════════════════════════════════════════════ */

/* ── Story Achievements ── */
[
  {id:'story_first',  icon:'🏢', title:'Erster Einsatz',      desc:'Story Kapitel 1 abgeschlossen'},
  {id:'story_act1',   icon:'🎖', title:'Operation KeyForce',  desc:'Akt 1 vollständig abgeschlossen'},
  {id:'story_act2',   icon:'🌐', title:'Cyber-Jäger',         desc:'Akt 2 vollständig abgeschlossen'},
  {id:'story_act3',   icon:'⚡', title:'Final Protocol',      desc:'Alle 3 Akte abgeschlossen'},
  {id:'story_boss1',  icon:'🦠', title:'Alpha besiegt!',      desc:'CTRL-Virus Alpha besiegt'},
  {id:'story_boss2',  icon:'💀', title:'Beta besiegt!',       desc:'CTRL-Virus Beta besiegt'},
  {id:'story_boss3',  icon:'🏆', title:'Virus-Vernichter',    desc:'CTRL-Virus Omega besiegt'},
  {id:'story_elite',  icon:'💎', title:'Elite-Agent',         desc:'Kapitel auf Elite abgeschlossen'},
  {id:'story_nodmg',  icon:'🛡', title:'Unberührt',           desc:'Boss ohne Schaden besiegt'},
  {id:'story_daily',  icon:'📁', title:'Geheimakte',          desc:'Tägliche Story-Challenge abgeschlossen'},
].forEach(a => { if (!ACHIEVEMENTS_DEF.find(x => x.id === a.id)) ACHIEVEMENTS_DEF.push(a); });


const STORY_ACTS = [
/* ══════════════ ACT 1: Operation KeyForce ══════════════ */
{ id:'act1', title:'Operation KeyForce', icon:'🏢', accent:'#4fc3f7',
  desc:'Heimreihe bis Wörter – werde zum Rekruten',
  chapters:[
    { id:'a1c1', num:'1-1', title:'Ankunft im Büro', icon:'🏢',
      story:'Es ist Montag 8 Uhr. Die Tipp-Agentur KeyForce hat dich eingeladen. Dein Mentor Prof. Keystroke wartet.',
      intro:[
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Willkommen bei KeyForce! Ich bin Prof. Keystroke, dein Mentor.'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Deine Grundreihe: A-S-D-F links, J-K-L-Ö rechts. Das ist dein Fundament!'},
      ],
      mbs:[
        {id:'a1c1m1',enemy:'Türwächter-Virus',ei:'🤖',text:'asdf jklö fdsa öljk',time:22,
         win:'Türwächter ausgeschaltet! Weg frei.',lose:'Virus blockiert den Eingang – nochmal!'},
        {id:'a1c1m2',enemy:'Scanner-Drone',ei:'🦾',text:'asdf jklö asdf jklö fda',time:22,
         win:'Scanner überlistet! Durchgang erlaubt.',lose:'Scanner-Alarm! Rückzug.'},
      ],
      challenge:'asdf jklö fdsa öljk dalf jfkl fjdk saldo flask alsd öflj asdf jklö fjs',
      weakText:'aaa sss ddd fff jjj kkk lll ööö asdf jklö fdsa öljk asdf jklö asdf jklö',
      keys:['a','s','d','f','j','k','l','ö'],
      success:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Ausgezeichnet! Die Heimreihe sitzt. Du bist ein Naturtalent!'}],
      fail:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Noch nicht ganz. Die Grundreihe ist das Fundament – nochmal!'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Fast! Diese Tasten brauchen noch Übung. Schnelles Nachtraining!'}],
      diff:{rekrut:{minWpm:6,minAcc:78,xp:50},agent:{minWpm:9,minAcc:83,xp:70},elite:{minWpm:16,minAcc:90,xp:100}},
    },
    { id:'a1c2', num:'1-2', title:'Erste Signale', icon:'📡',
      story:'Ein verschlüsseltes Signal wird abgefangen. Es verwendet die obere Tastenreihe – Q bis P.',
      intro:[
        {a:'💻',n:'Terminal',t:'SIGNAL EMPFANGEN. Zeichen: q-w-e-r-t-z-u-i-o-p. Dekodierung läuft...'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Die obere Reihe! Q-W-E-R-T links, Z-U-I-O-P rechts. Tippe das Signal!'},
      ],
      mbs:[
        {id:'a1c2m1',enemy:'Radar-Blocker',ei:'📡',text:'qwer zuiop rewq poiuz',time:22,
         win:'Radar überlistet! Signal klar.',lose:'Radar-Interferenz – retry!'},
        {id:'a1c2m2',enemy:'Signal-Jammer',ei:'📻',text:'quiz power quiet port top',time:22,
         win:'Jammer ausgeschaltet! Volles Signal.',lose:'Jammer aktiv – nochmal!'},
      ],
      challenge:'qwer zuiop rewq poiuz wir pro per wie wo top ruf quiz power quiet qwert',
      weakText:'qqq www eee rrr ttt zzz uuu iii ooo ppp qwer zuiop rewq poiuz quiz power',
      keys:['q','w','e','r','t','z','u','i','o','p'],
      success:[{a:'💻',n:'Terminal',t:'SIGNAL DEKODIERT. Exzellente Fingerarbeit, Agent.'}],
      fail:[{a:'💻',n:'Terminal',t:'DEKODIERUNG FEHLGESCHLAGEN. Obere Reihe instabil. Retry.'}],
      weakness:[{a:'💻',n:'Terminal',t:'PARTIELLE DEKODIERUNG. Kalibrierung der Fehltasten erforderlich.'}],
      diff:{rekrut:{minWpm:7,minAcc:79,xp:55},agent:{minWpm:11,minAcc:84,xp:75},elite:{minWpm:18,minAcc:91,xp:110}},
    },
    { id:'a1c3', num:'1-3', title:'Unterdeckt', icon:'🕵️',
      story:'Du infiltrierst das Feind-Netzwerk. Der Zugangscode liegt in der untersten Tastenreihe.',
      intro:[
        {a:'🕵️',n:'Agent R',t:'Pssst! Ich bin Agent R. Du bist jetzt undercover.'},
        {a:'🕵️',n:'Agent R',t:'Der Code liegt in der Unterreihe: Y-X-C-V-B links und N-M rechts. Kein Fehler!'},
      ],
      mbs:[
        {id:'a1c3m1',enemy:'Untergrund-Bot',ei:'🤖',text:'yxcv bnm vxcy mnb move',time:22,
         win:'Bot ausgeschaltet! Weg frei.',lose:'Bot-Alarm! Versteck dich!'},
        {id:'a1c3m2',enemy:'Tunnel-Wächter',ei:'🛡️',text:'nexus voxel zebra mixen boxen',time:22,
         win:'Wächter überwältigt!',lose:'Erwischt! Nochmal.'},
      ],
      challenge:'yxcv bnm vxcy mnb bewegung voxel nexus zebra mixen boxen byte cyber mix',
      weakText:'yyy xxx ccc vvv bbb nnn mmm yxcv bnm vxcy mnb yxcv bnm bewegung voxel',
      keys:['y','x','c','v','b','n','m'],
      success:[{a:'🕵️',n:'Agent R',t:'Zugang gewährt! Code perfekt eingegeben. Mission erfüllt!'}],
      fail:[{a:'🕵️',n:'Agent R',t:'Falscher Code! Alarm fast ausgelöst. Retry!'}],
      weakness:[{a:'🕵️',n:'Agent R',t:'Fast! Manche Tasten brauchen noch Feinschliff.'}],
      diff:{rekrut:{minWpm:7,minAcc:79,xp:55},agent:{minWpm:11,minAcc:84,xp:75},elite:{minWpm:18,minAcc:91,xp:110}},
    },
    { id:'a1c4', num:'1-4', title:'Die Botschaft', icon:'📜',
      story:'Feinde kommunizieren in echten Wörtern. Nur wer fließend tippen kann, entschlüsselt die Nachricht.',
      intro:[
        {a:'📜',n:'Botschaft',t:'GEHEIMTEXT: das und in zu den ist auch von nicht mit dem sind bei auf...'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Echte Wörter jetzt! Fließend tippen ist der Schlüssel.'},
      ],
      mbs:[
        {id:'a1c4m1',enemy:'Wort-Filter',ei:'📝',text:'das und die der nicht mit',time:20,
         win:'Filter überwunden! Worte fließen.',lose:'Filter aktiv – Worte geblockt.'},
        {id:'a1c4m2',enemy:'Satz-Blocker',ei:'🚫',text:'wir haben eine wichtige Aufgabe',time:22,
         win:'Blocker umgangen! Volle Botschaft.',lose:'Blocker hält stand – nochmal!'},
      ],
      challenge:'das und in zu den ist auch von nicht mit dem sind bei auf noch werden als',
      weakText:'das die und der nicht mit den ist auch von bei auf noch als so werden sie',
      keys:['a','s','d','n','i','c','h','t','e','r','u','g'],
      success:[{a:'📜',n:'Botschaft',t:'BOTSCHAFT ENTSCHLÜSSELT. Exzellente Arbeit, Agent!'}],
      fail:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Noch zu viele Fehler. Konzentration – nochmal!'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Fast! Einige Schlüsselwörter bereiten noch Schwierigkeiten.'}],
      diff:{rekrut:{minWpm:9,minAcc:80,xp:65},agent:{minWpm:14,minAcc:86,xp:85},elite:{minWpm:22,minAcc:92,xp:120}},
    },
  ],
  boss:{
    id:'boss_act1',name:'CTRL-Virus Alpha',icon:'🦠',
    text:'asdf jklö qwer zuiop yxcv bnm das und die der nicht mit dem sind bei auf noch',
    intro:[
      {a:'🦠',n:'CTRL-Virus α',t:'HAHAHA! Du bist in meiner Falle! Ich bin CTRL-Virus Alpha!'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'Der Virus nutzt alle Grundlagen. Tippe schnell und präzise!'},
    ],
    victory:[
      {a:'🦠',n:'CTRL-Virus α',t:'U-Unmöglich... Ich... werde... zurückkehren...'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'🎉 BRILLIANT! Du hast Alpha besiegt! Akt 1 abgeschlossen!'},
    ],
    defeat:[{a:'🦠',n:'CTRL-Virus α',t:'HAHAHA! Du warst nicht schnell genug! RETRY!'}],
    achievementId:'story_boss1',
    diff:{rekrut:{attackInterval:14,attackDmg:8,errorDmg:1.5},agent:{attackInterval:9,attackDmg:12,errorDmg:2},elite:{attackInterval:5,attackDmg:18,errorDmg:3}},
  },
  xpBonus:200,
},
/* ══════════════ ACT 2: Cyber Hunt ══════════════ */
{ id:'act2', title:'Cyber Hunt', icon:'🌐', accent:'#ce93d8',
  desc:'Großbuchstaben, Zahlen und Sonderzeichen – jage den Virus',
  unlockRequires:'act1',
  chapters:[
    { id:'a2c1', num:'2-1', title:'Großalarm', icon:'🚨',
      story:'ALARM! Das feindliche System aktiviert einen Großbuchstaben-Schutzschild. Shift-Taste meistern!',
      intro:[
        {a:'🚨',n:'Alarmsystem',t:'ALARM! Feindliches Netzwerk aktiviert GROSSBUCHSTABEN-SCHUTZ!'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Shift-Taste: links für rechte Hand, rechts für linke. Tippe die Codewörter exakt!'},
      ],
      mbs:[
        {id:'a2c1m1',enemy:'Shift-Wächter',ei:'⇧',text:'Berlin Hamburg München',time:22,
         win:'Shift-Wächter besiegt! Groß-Schutz fällt.',lose:'Shift-Fehler! Alarm wird lauter.'},
        {id:'a2c1m2',enemy:'Name-Encoder',ei:'🔡',text:'Anna Klaus Ute Peter Max',time:22,
         win:'Encoder überwunden! Namen dekodiert.',lose:'Encoder aktiv – retry!'},
      ],
      challenge:'Berlin Hamburg München Das Wetter ist schön Die Sonne scheint Anna Klaus',
      weakText:'Berlin Hamburg München Frankfurt Das Die Der Ein Eine Wer Wie Was Anna Klaus',
      keys:['B','H','M','F','D','W','S','A','K','E','N'],
      success:[{a:'🚨',n:'Alarmsystem',t:'SCHUTZSCHILD DEAKTIVIERT. Passwort akzeptiert!'}],
      fail:[{a:'🚨',n:'Alarmsystem',t:'PASSWORT ABGELEHNT. Großschreibung fehlerhaft. Retry!'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Die Shift-Taste macht noch Probleme. Kurze Übung hilft!'}],
      diff:{rekrut:{minWpm:9,minAcc:81,xp:65},agent:{minWpm:14,minAcc:86,xp:90},elite:{minWpm:22,minAcc:92,xp:130}},
    },
    { id:'a2c2', num:'2-2', title:'Zahlencode', icon:'🔐',
      story:'Der Hauptserver ist verriegelt! Nur der richtige Zahlencode öffnet ihn.',
      intro:[
        {a:'🔐',n:'Server',t:'AUTHENTIFIZIERUNG ERFORDERLICH. Zugangscode: Zahlen plus Name.'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Zahlenreihe: 1-2-3-4-5 links, 6-7-8-9-0 rechts. Entspannt bleiben!'},
      ],
      mbs:[
        {id:'a2c2m1',enemy:'Nummer-Lock',ei:'🔢',text:'12345 67890 54321',time:20,
         win:'Nummer-Lock geknackt! Zahlen fließen.',lose:'Lock hält! Falsche Zahlen.'},
        {id:'a2c2m2',enemy:'Code-Wall',ei:'🧱',text:'42 100 2024 365 1337',time:20,
         win:'Code-Wall durchbrochen! Zugang fast frei.',lose:'Wall steht! Nochmal.'},
      ],
      challenge:'1234567890 42 100 2024 365 Im Jahr 2024 gab es 365 Tage Preis 19 Euro',
      weakText:'111 222 333 444 555 666 777 888 999 000 12345 67890 1234567890 42 100',
      keys:['1','2','3','4','5','6','7','8','9','0'],
      success:[{a:'🔐',n:'Server',t:'ZUGANG GEWÄHRT. Zahlencode korrekt eingegeben.'}],
      fail:[{a:'🔐',n:'Server',t:'ZUGANG VERWEIGERT. Code fehlerhaft. Retry.'}],
      weakness:[{a:'🔐',n:'Server',t:'Eingabefehler erkannt. Zahlen-Kalibrierung notwendig.'}],
      diff:{rekrut:{minWpm:9,minAcc:80,xp:65},agent:{minWpm:14,minAcc:85,xp:90},elite:{minWpm:22,minAcc:92,xp:130}},
    },
    { id:'a2c3', num:'2-3', title:'Cyber-Labyrinth', icon:'🌀',
      story:'Das Virus hat sich im Cyber-Labyrinth versteckt. Sonderzeichen und Symbole sind der Schlüssel.',
      intro:[
        {a:'🌀',n:'Labyrinth-KI',t:'Du bist im Cyber-Labyrinth gefangen. Nur Symbole öffnen die Türen.'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Punkt, Komma, Fragezeichen, Ausrufezeichen. Tippe präzise!'},
      ],
      mbs:[
        {id:'a2c3m1',enemy:'Symbol-Bot',ei:'⚙️',text:'Wie geht es dir? Sehr gut!',time:22,
         win:'Symbol-Bot überlistet! Tür öffnet sich.',lose:'Falsches Symbol! Tür bleibt zu.'},
        {id:'a2c3m2',enemy:'Sonder-Guard',ei:'🔣',text:'Das ist wichtig. Wirklich!',time:22,
         win:'Guard besiegt! Weg ins Netzwerk frei.',lose:'Guard hält! Zeichen falsch.'},
      ],
      challenge:'Wie geht es dir? Sehr gut! Das ist wichtig. Wirklich? Ja, natürlich!',
      weakText:'Wie geht es? Gut! Was machst du? Toll! Das ist wichtig. Sicher? Ja!',
      keys:['.', ',', '?', '!'],
      success:[{a:'🌀',n:'Labyrinth-KI',t:'AUSGANG GEFUNDEN. Symbole meisterhaft genutzt!'}],
      fail:[{a:'🌀',n:'Labyrinth-KI',t:'SACKGASSE. Zeichen fehlerhaft. Neuer Versuch.'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Satzzeichen brauchen noch Übung. Kurzes Training!'}],
      diff:{rekrut:{minWpm:10,minAcc:82,xp:70},agent:{minWpm:15,minAcc:87,xp:95},elite:{minWpm:24,minAcc:93,xp:135}},
    },
    { id:'a2c4', num:'2-4', title:'Datenstrom', icon:'💫',
      story:'Das Virus flieht durch den Datenstrom. Nur schnelles, fließendes Tippen kann es einholen!',
      intro:[
        {a:'💫',n:'Datenstrom',t:'VIRUS FLIEHT durch den Datenstrom! Geschwindigkeit ist jetzt alles!'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Zeig mir deine echte Geschwindigkeit! Fließender Text, keine Pausen.'},
      ],
      mbs:[
        {id:'a2c4m1',enemy:'Speed-Checker',ei:'⚡',text:'schnell flink agil zügig rasch',time:18,
         win:'Speed-Check bestanden! Tempo perfekt.',lose:'Zu langsam! Geschwindigkeit erhöhen.'},
        {id:'a2c4m2',enemy:'Flow-Tester',ei:'🌊',text:'Übung macht den Meister täglich',time:20,
         win:'Flow-Test bestanden! Datenstrom gehört dir.',lose:'Flow unterbrochen. Nochmal!'},
      ],
      challenge:'der fortschritt kommt nicht über nacht sondern durch beharrlichkeit und übung',
      weakText:'das wir haben heute eine wichtige Aufgabe schnell flink agil direkt fix',
      keys:['e','r','t','n','s','a','i','o','h','d'],
      success:[{a:'💫',n:'Datenstrom',t:'VIRUS EINGEHOLT! Du bist dem Datenstrom gewachsen!'}],
      fail:[{a:'💫',n:'Datenstrom',t:'Virus entkommen. Zu langsam. Nochmal!'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Einige Häufigkeitstasten bereiten Probleme. Kurztraining!'}],
      diff:{rekrut:{minWpm:12,minAcc:82,xp:75},agent:{minWpm:18,minAcc:87,xp:100},elite:{minWpm:28,minAcc:93,xp:140}},
    },
  ],
  boss:{
    id:'boss_act2',name:'CTRL-Virus Beta',icon:'💀',
    text:'Berlin Hamburg 2024 Wie geht es dir? Sehr gut! schnell flink das wir nicht',
    intro:[
      {a:'💀',n:'CTRL-Virus β',t:'Du hast Alpha besiegt? Ich, Beta, bin zehnmal stärker!'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'Beta nutzt Großbuchstaben, Zahlen und Symbole. Sei bereit!'},
    ],
    victory:[
      {a:'💀',n:'CTRL-Virus β',t:'Wie... das ist unmöglich...'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'🎉 Beta besiegt! Akt 2 ist Geschichte. Du bist ein echter Agent!'},
    ],
    defeat:[{a:'💀',n:'CTRL-Virus β',t:'HAHAHAHA! Beta lässt sich nicht so leicht besiegen!'}],
    achievementId:'story_boss2',
    diff:{rekrut:{attackInterval:12,attackDmg:10,errorDmg:2},agent:{attackInterval:7,attackDmg:14,errorDmg:2.5},elite:{attackInterval:4,attackDmg:20,errorDmg:4}},
  },
  xpBonus:300,
},
/* ══════════════ ACT 3: Final Protocol ══════════════ */
{ id:'act3', title:'Final Protocol', icon:'⚡', accent:'#fff176',
  desc:'Geschwindigkeit, Ausdauer und das finale Showdown',
  unlockRequires:'act2',
  chapters:[
    { id:'a3c1', num:'3-1', title:'Code-Sequenz', icon:'💻',
      story:'Das Virus versteckt sich im Code. Nur wer Programmiersprachen tippen kann, findet es.',
      intro:[
        {a:'💻',n:'Code-Terminal',t:'Virus-Signatur gefunden in: const x = virus.run(); Tippe den Code!'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Programmiersyntax! Klammern, Punkte, Gleichheitszeichen. Konzentration!'},
      ],
      mbs:[
        {id:'a3c1m1',enemy:'Syntax-Checker',ei:'🔍',text:'const x = 42; return x;',time:22,
         win:'Syntax korrekt! Code kompiliert.',lose:'Syntax-Fehler! Code bricht ab.'},
        {id:'a3c1m2',enemy:'Logic-Guard',ei:'🧮',text:'if (x > 0) { return true; }',time:22,
         win:'Logic-Guard überwunden! Zugang zum Virus.',lose:'Logic-Fehler! Guard aktiviert.'},
      ],
      challenge:'const name = "Max"; if (x > 0) { return true; } function hello() { }',
      weakText:'const x = 0; let y = x + 1; if (y > 0) return true; else return false;',
      keys:['(',')','{','}',';','=','>','<','+','"'],
      success:[{a:'💻',n:'Code-Terminal',t:'KOMPILIERUNG ERFOLGREICH. Virus-Signatur isoliert!'}],
      fail:[{a:'💻',n:'Code-Terminal',t:'KOMPILIERUNGSFEHLER. Syntax-Probleme. Retry.'}],
      weakness:[{a:'💻',n:'Code-Terminal',t:'Spezialzeichen machen Probleme. Training aktiviert.'}],
      diff:{rekrut:{minWpm:10,minAcc:82,xp:80},agent:{minWpm:16,minAcc:87,xp:110},elite:{minWpm:26,minAcc:93,xp:150}},
    },
    { id:'a3c2', num:'3-2', title:'Hochgeschwindigkeit', icon:'🚀',
      story:'Das Virus flieht mit maximaler Geschwindigkeit. Nur absolute Schnelligkeit kann es stoppen!',
      intro:[
        {a:'🚀',n:'Speed-Monitor',t:'VIRUS-GESCHWINDIGKEIT: KRITISCH. Du musst schneller werden!'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Speed-Run! Tippo so schnell du kannst. Präzision bleibt wichtig.'},
      ],
      mbs:[
        {id:'a3c2m1',enemy:'Speed-Bot Alpha',ei:'⚡',text:'fix rasch zügig prompt flink',time:15,
         win:'Speed-Bot Alpha besiegt! Geschwindigkeit passt.',lose:'Zu langsam! Alpha entwischt.'},
        {id:'a3c2m2',enemy:'Speed-Bot Beta',ei:'🏎️',text:'schnell direkt agil exakt klar',time:15,
         win:'Speed-Bot Beta besiegt! Volle Kraft.',lose:'Beta entkommen! Mehr Tempo!'},
      ],
      challenge:'schnell flink agil zügig rasch prompt direkt fix exakt präzise klar sicher',
      weakText:'schnell flink agil zügig rasch direkt fix exakt präzise klar sicher flott',
      keys:['s','c','h','n','e','l','f','i','k','a','g'],
      success:[{a:'🚀',n:'Speed-Monitor',t:'GESCHWINDIGKEIT KRITISCH. Virus gestellt!'}],
      fail:[{a:'🚀',n:'Speed-Monitor',t:'NICHT SCHNELL GENUG. Virus entkommen. Retry!'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Einige Buchstaben verlangsamen dich. Gezieltes Training!'}],
      diff:{rekrut:{minWpm:14,minAcc:83,xp:85},agent:{minWpm:22,minAcc:88,xp:115},elite:{minWpm:35,minAcc:93,xp:160}},
    },
    { id:'a3c3', num:'3-3', title:'Herz des Netzwerks', icon:'🌐',
      story:'Du hast das Herz des feindlichen Netzwerks erreicht. Nur Ausdauer und Präzision zählen jetzt.',
      intro:[
        {a:'🌐',n:'Netzwerk-Kern',t:'Du hast das Herz des Netzwerks gefunden. Langer Text steht bevor.'},
        {a:'🧑‍💻',n:'Prof. Keystroke',t:'Ausdauer und Genauigkeit! Dies ist dein letzter Test vor dem Boss.'},
      ],
      mbs:[
        {id:'a3c3m1',enemy:'Ausdauer-Test 1',ei:'🏃',text:'das regelmäßige Üben führt zum Ziel',time:25,
         win:'Ausdauer-Test 1 bestanden! Weiter.',lose:'Konzentration verloren! Nochmal.'},
        {id:'a3c3m2',enemy:'Ausdauer-Test 2',ei:'🏋️',text:'wer täglich trainiert wird mit Zeit besser',time:25,
         win:'Ausdauer-Test 2 bestanden! Fast da.',lose:'Durchhaltevermögen fehlt noch! Retry.'},
      ],
      challenge:'Das regelmäßige Üben ist der Schlüssel zum Erfolg. Wer täglich trainiert wird schnell besser.',
      weakText:'das und die der nicht mehr aber nur auch noch zum zur mit von wir haben heute',
      keys:['a','e','i','o','u','s','t','n','r','g','h','l'],
      success:[{a:'🌐',n:'Netzwerk-Kern',t:'NETZWERK KONTROLLIERT. Du bist bereit für den letzten Boss!'}],
      fail:[{a:'🌐',n:'Netzwerk-Kern',t:'Kontrolle verloren. Netzwerk reagiert. Retry!'}],
      weakness:[{a:'🧑‍💻',n:'Prof. Keystroke',t:'Einige Tasten bremsen den Fluss. Kurztraining aktiviert.'}],
      diff:{rekrut:{minWpm:14,minAcc:84,xp:90},agent:{minWpm:20,minAcc:89,xp:120},elite:{minWpm:32,minAcc:94,xp:170}},
    },
  ],
  boss:{
    id:'boss_act3',name:'CTRL-Virus Omega',icon:'👾',
    text:'CTRL-Virus Omega: Das regelmäßige Üben ist der Schlüssel! Berlin 2024 const x = run(); fix!',
    intro:[
      {a:'👾',n:'CTRL-Virus Ω',t:'Du hast meine Untergebenen besiegt. Aber ICH bin Omega – die finale Form!'},
      {a:'👾',n:'CTRL-Virus Ω',t:'Kein Mensch tippt schnell genug um mich zu besiegen! NIEMALS!'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'Das ist es! Zeig alles was du gelernt hast. Für KeyForce!'},
    ],
    victory:[
      {a:'👾',n:'CTRL-Virus Ω',t:'Noooooo! Unmöglich! Dieser... Tipp-Agent... ist unaufhaltsam!'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'🏆 DU HAST ES GESCHAFFT! Omega besiegt! Du bist ein legendärer Tipp-Agent!'},
      {a:'🧑‍💻',n:'Prof. Keystroke',t:'KeyForce ist gerettet. Die Welt kann wieder schnell tippen. Danke, Agent!'},
    ],
    defeat:[{a:'👾',n:'CTRL-Virus Ω',t:'HAHAHAHAHA! Omega ist unbesiegbar! Versuche es nochmal!'}],
    achievementId:'story_boss3',
    diff:{rekrut:{attackInterval:10,attackDmg:12,errorDmg:2.5},agent:{attackInterval:6,attackDmg:16,errorDmg:3},elite:{attackInterval:3,attackDmg:22,errorDmg:5}},
  },
  xpBonus:500,
},
];

/* ── DAILY STORY CHALLENGES ── */
const DAILY_STORY_CHALLENGES = [
  {text:'das und in zu den ist',title:'Geheimakte: Montag',sub:'Grundlagen-Code'},
  {text:'qwer zuiop wir wie pro',title:'Geheimakte: Dienstag',sub:'Signal-Fragment'},
  {text:'yxcv bnm nexus voxel',title:'Geheimakte: Mittwoch',sub:'Untergrund-Signal'},
  {text:'Berlin Hamburg 2024 gut',title:'Geheimakte: Donnerstag',sub:'Stadt-Code'},
  {text:'schnell flink agil zügig',title:'Geheimakte: Freitag',sub:'Speed-Protokoll'},
  {text:'Wie geht es? Sehr gut!',title:'Geheimakte: Samstag',sub:'Kommunikations-Code'},
  {text:'const x = 42; return x;',title:'Geheimakte: Sonntag',sub:'System-Befehl'},
];

/* ══════════════════════════════════════════════════════
   STORY MODULE
══════════════════════════════════════════════════════ */
const Story = (() => {
  /* ── state ── */
  let activeAct     = null;
  let activeChapter = null;
  let activeDiff    = 'agent';
  let mbIdx         = 0;        // current mini-battle index
  let dialogQueue   = [];
  let dialogIdx     = 0;
  let isTypingDialog = false;
  let errorSnapshot  = null;
  let weakKeysFound  = [];
  let lastStats      = null;
  let isWeaknessRun  = false;
  let bossTimers     = [];
  let mbTimerRef     = null;
  let mbDone         = false;
  let bossPlayerHp   = 100;
  let bossBossHp     = 100;
  let bossNoDamage   = true;
  let currentActIdx  = 0;

  /* ── DOM helpers ── */
  const el    = id => document.getElementById(id);
  const hide  = id => { const e = el(id); if (e) e.classList.add('hidden'); };
  const show  = id => { const e = el(id); if (e) e.classList.remove('hidden'); };
  const html  = (id, h) => { const e = el(id); if (e) e.innerHTML = h; };

  function activateView() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    el('view-story')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="story"]')?.classList.add('active');
    currentView = 'story';
    closeSidebar();
  }

  /* ── persistence ── */
  function ss() {
    if (!STATE.story) STATE.story = { chapterResults:{}, actResults:{}, difficulty:'agent' };
    return STATE.story;
  }
  function getRes(id)     { return ss().chapterResults[id] || null; }
  function saveRes(id, d) { ss().chapterResults[id] = d; saveState(); }
  function getActRes(id)  { return ss().actResults?.[id] || null; }
  function saveActRes(id,d){ if (!ss().actResults) ss().actResults = {}; ss().actResults[id]=d; saveState(); }

  /* ── unlock logic ── */
  function actUnlocked(act) {
    if (!act.unlockRequires) return true;
    const req = STORY_ACTS.find(a => a.id === act.unlockRequires);
    return req ? !!getActRes(req.id)?.completed : false;
  }
  function chUnlocked(act, chIdx) {
    if (!actUnlocked(act)) return false;
    if (chIdx === 0) return true;
    return !!getRes(act.chapters[chIdx-1].id)?.completed;
  }
  function bossUnlocked(act) {
    return actUnlocked(act) && act.chapters.every(c => !!getRes(c.id)?.completed);
  }
  function totalDone() {
    let n = 0;
    STORY_ACTS.forEach(a => {
      a.chapters.forEach(c => { if (getRes(c.id)?.completed) n++; });
      if (getActRes(a.id)?.completed) n++;
    });
    return n;
  }
  function totalNodes() { return STORY_ACTS.reduce((s,a) => s + a.chapters.length + 1, 0); }

  function calcStars(wpm, acc, diff) {
    const d = diff || {};
    if (acc >= 95 && wpm >= (d.minWpm||10) * 1.6) return 3;
    if (acc >= 90 && wpm >= (d.minWpm||10) * 1.2) return 2;
    return 1;
  }

  /* ══ WORLD MAP ══ */
  function showMap() {
    activateView();
    ['story-difficulty','story-intro','story-minibattle','story-boss',
     'story-result','story-act-complete','story-weakness'].forEach(hide);
    show('story-map');
    renderTabs();
    renderPath(currentActIdx);
    renderDailyWidget();
  }

  function renderTabs() {
    const tabs = el('story-acts-tabs');
    if (!tabs) return;
    tabs.innerHTML = STORY_ACTS.map((a, i) => {
      const done    = !!getActRes(a.id)?.completed;
      const locked  = !actUnlocked(a);
      const cls     = ['sact-tab', i === currentActIdx ? 'active' : '', locked ? 'locked-tab' : ''].join(' ');
      return `<button class="${cls}" data-act-idx="${i}">
        ${a.icon} ${a.title}${done ? ' <span class="sact-check">✓</span>' : ''}
      </button>`;
    }).join('');
    tabs.querySelectorAll('[data-act-idx]').forEach(btn => {
      const idx = +btn.dataset.actIdx;
      if (STORY_ACTS[idx] && actUnlocked(STORY_ACTS[idx])) {
        btn.addEventListener('click', () => { currentActIdx = idx; renderTabs(); renderPath(idx); });
      }
    });
  }

  function renderPath(actIdx) {
    const act  = STORY_ACTS[actIdx];
    const wrap = el('story-world-path');
    if (!act || !wrap) return;

    let html = '<div class="swp-inner">';
    act.chapters.forEach((ch, i) => {
      const res      = getRes(ch.id);
      const unlocked = chUnlocked(act, i);
      const done     = !!res?.completed;
      const isNext   = unlocked && !done;
      const s        = res?.stars || 0;
      const cirCls   = ['swp-circle', done?'done':'', isNext?'next':'', !unlocked?'locked':''].join(' ');
      const nodeCls  = ['swp-node', done?'done':'', isNext?'next':'', !unlocked?'locked':''].join(' ');
      const stars    = done ? '⭐'.repeat(s) + '☆'.repeat(3-s) : '☆☆☆';
      html += `<div class="${nodeCls}" data-ch-id="${ch.id}" data-ch-act="${actIdx}">
        <div class="${cirCls}">${ch.icon}</div>
        <div class="swp-stars">${stars}</div>
        <div class="swp-label">${ch.title}</div>
      </div>`;
      const connDone = done && act.chapters[i+1] && getRes(act.chapters[i+1].id)?.completed;
      html += `<div class="swp-connector${done?'done':''}"></div>`;
    });
    // Boss node
    const bUnlocked = bossUnlocked(act);
    const bDone     = !!getActRes(act.id)?.completed;
    const bNext     = bUnlocked && !bDone;
    const bCls = ['swp-circle boss-node', bDone?'done':'', bNext?'next':'', !bUnlocked?'locked':''].join(' ');
    const bNodeCls = ['swp-node', bDone?'done':'', bNext?'next':'', !bUnlocked?'locked':''].join(' ');
    html += `<div class="${bNodeCls}" data-boss-act="${actIdx}">
      <div class="${bCls}">${act.boss.icon}</div>
      <div class="swp-stars">${bDone ? '💀' : bUnlocked ? '⚠️' : '🔒'}</div>
      <div class="swp-label">${act.boss.name}</div>
    </div>`;
    html += '</div>';
    wrap.innerHTML = html;

    // Bind clicks
    wrap.querySelectorAll('[data-ch-id]').forEach(node => {
      const id     = node.dataset.chId;
      const aIdx   = +node.dataset.chAct;
      const act2   = STORY_ACTS[aIdx];
      const chIdx  = act2.chapters.findIndex(c => c.id === id);
      if (chUnlocked(act2, chIdx)) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => startDifficultySelect(act2, act2.chapters[chIdx]));
      }
    });
    wrap.querySelectorAll('[data-boss-act]').forEach(node => {
      const aIdx = +node.dataset.bossAct;
      const act2 = STORY_ACTS[aIdx];
      if (bossUnlocked(act2)) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => startBossIntro(act2));
      }
    });
  }

  /* ── Daily Widget ── */
  function renderDailyWidget() {
    const wrap = el('story-daily-widget');
    if (!wrap) return;
    const today = todayStr();
    const dc    = ss().dailyStory;
    const done  = dc?.date === today && dc?.done;
    const dow   = new Date().getDay();
    const ch    = DAILY_STORY_CHALLENGES[dow];
    wrap.innerHTML = `<div class="story-daily-card" id="story-daily-btn">
      <div class="story-daily-title">📁 ${ch.title}</div>
      <div class="story-daily-sub">${ch.sub}</div>
      ${done ? '<div class="story-daily-done">✅ Heute erledigt</div>' : '<div class="story-daily-sub">45s · Extra XP</div>'}
    </div>`;
    el('story-daily-btn')?.addEventListener('click', () => {
      if (!done) startDailyChallenge();
    });
  }

  function startDailyChallenge() {
    const dow  = new Date().getDay();
    const ch   = DAILY_STORY_CHALLENGES[dow];
    errorSnapshot = { ...STATE.errorMap };
    setEl('training-title', ch.title);
    setEl('training-mode-badge', '📁 Geheimakte');
    setStyle('training-progress', 'width', '0%');
    showView('training');
    Engine.setup(ch.text + ' ' + ch.text + ' ' + ch.text, null, 'normal', {
      onComplete: stats => {
        const today = todayStr();
        ss().dailyStory = { date: today, done: true };
        addXP(40);
        saveState();
        checkAchievement('story_daily', true);
        showView('story');
      }
    });
    setEl('ls-time', '0:00');
    focusInput();
  }

  /* ══ DIFFICULTY SELECT ══ */
  function startDifficultySelect(act, chapter) {
    activeAct     = act;
    activeChapter = chapter;
    activateView();
    ['story-map','story-intro','story-minibattle','story-boss',
     'story-result','story-act-complete','story-weakness'].forEach(hide);
    show('story-difficulty');

    const res = getRes(chapter.id);
    html('story-diff-header', `
      <span class="story-chapter-icon">${chapter.icon}</span>
      <div>
        <div class="story-chapter-sub">${chapter.num}</div>
        <div class="story-chapter-name">${chapter.title}</div>
      </div>
      ${res?.completed ? `<span style="margin-left:auto;color:var(--green);font-size:.8rem">✅ Bestes: ${res.bestWpm} WPM</span>` : ''}
    `);

    const d = chapter.diff;
    html('story-diff-cards', [
      {key:'rekrut',name:'Rekrut',icon:'🐣',color:'#69f0ae',
       req:`${d.rekrut.minWpm} WPM · ${d.rekrut.minAcc}% Genauigkeit`,xp:d.rekrut.xp},
      {key:'agent', name:'Agent', icon:'🕵️',color:'var(--accent)',
       req:`${d.agent.minWpm} WPM · ${d.agent.minAcc}% Genauigkeit`, xp:d.agent.xp},
      {key:'elite', name:'Elite', icon:'💎',color:'#ef9a9a',
       req:`${d.elite.minWpm} WPM · ${d.elite.minAcc}% Genauigkeit`, xp:d.elite.xp},
    ].map(opt => `
      <div class="diff-card diff-${opt.key}" data-diff="${opt.key}">
        <span class="diff-icon">${opt.icon}</span>
        <div class="diff-name" style="color:${opt.color}">${opt.name}</div>
        <div class="diff-req">${opt.req}</div>
        <div class="diff-xp">+${opt.xp} XP</div>
      </div>
    `).join(''));

    el('story-btn-diff-back').onclick = showMap;
    el('story-diff-cards').querySelectorAll('[data-diff]').forEach(card => {
      card.addEventListener('click', () => {
        activeDiff = card.dataset.diff;
        startChapterIntro();
      });
    });
  }

  /* ══ CHAPTER INTRO ══ */
  function startChapterIntro() {
    activateView();
    ['story-difficulty','story-minibattle','story-boss',
     'story-result','story-act-complete','story-weakness','story-map'].forEach(hide);
    show('story-intro');

    const ch    = activeChapter;
    const dName = {rekrut:'🐣 Rekrut',agent:'🕵️ Agent',elite:'💎 Elite'}[activeDiff];
    html('story-banner', `
      <span class="story-chapter-icon">${ch.icon}</span>
      <div style="flex:1">
        <div class="story-chapter-sub">${ch.num}</div>
        <div class="story-chapter-name">${ch.title}</div>
      </div>
      <span class="story-diff-badge">${dName}</span>
    `);
    setEl('story-narrative', ch.story);

    dialogQueue = ch.intro;
    dialogIdx   = 0;
    isTypingDialog = false;
    el('story-btn-next').onclick  = nextDialog;
    el('story-btn-skip').onclick  = () => startMiniBattles();
    showDialogMsg(dialogQueue[0]);
  }

  function showDialogMsg(msg) {
    if (!msg) return;
    setEl('story-dialog-speaker', `${msg.a} ${msg.n}`);
    const textEl = el('story-dialog-text');
    if (!textEl) return;
    textEl.textContent = '';
    show('story-dialog-dots');
    isTypingDialog = true;
    let i = 0;
    const iv = setInterval(() => {
      if (i < msg.t.length) { textEl.textContent += msg.t[i++]; }
      else { clearInterval(iv); hide('story-dialog-dots'); isTypingDialog = false; }
    }, 25);
  }

  function nextDialog() {
    if (isTypingDialog) {
      const msg = dialogQueue[dialogIdx];
      if (msg) { setEl('story-dialog-text', msg.t); hide('story-dialog-dots'); isTypingDialog = false; }
      return;
    }
    dialogIdx++;
    if (dialogIdx < dialogQueue.length) showDialogMsg(dialogQueue[dialogIdx]);
    else startMiniBattles();
  }

  /* ══ MINI BATTLES ══ */
  function startMiniBattles() {
    mbIdx = 0;
    startOneMb();
  }

  function startOneMb() {
    const ch = activeChapter;
    if (mbIdx >= ch.mbs.length) { launchChallenge(); return; }
    const mb = ch.mbs[mbIdx];

    activateView();
    ['story-intro','story-difficulty','story-boss','story-result',
     'story-act-complete','story-weakness','story-map'].forEach(hide);
    show('story-minibattle');

    html('mb-header-row',
      `<strong>${ch.num}: ${ch.title}</strong> – Kampf ${mbIdx+1} von ${ch.mbs.length}`);
    setEl('mb-enemy-name', mb.enemy);
    html('mb-enemy-avatar', mb.ei);
    setEl('mb-instruction', `⚔️ Tippe den Text um ${mb.enemy} zu besiegen!`);
    hide('mb-result-line');

    mbDone = false;
    runMbTyping(mb);
  }

  function renderBtText(containerId, text, pos) {
    const e = el(containerId);
    if (!e) return;
    e.innerHTML = text.split('').map((ch, i) => {
      if (i < pos) return `<span class="bchar done">${ch === ' ' ? '&nbsp;' : escHtml(ch)}</span>`;
      if (i === pos) return `<span class="bchar cursor">${ch === ' ' ? '&nbsp;' : escHtml(ch)}</span>`;
      return `<span class="bchar">${ch === ' ' ? '&nbsp;' : escHtml(ch)}</span>`;
    }).join('');
  }

  function setMbHp(enemyPct, playerPct) {
    const ef = el('mb-enemy-hp'), pf = el('mb-player-hp');
    if (ef) ef.style.width = Math.max(0, enemyPct) + '%';
    if (pf) pf.style.width = Math.max(0, playerPct) + '%';
    setEl('mb-enemy-pct', Math.max(0, Math.round(enemyPct)) + '%');
    setEl('mb-player-pct', Math.max(0, Math.round(playerPct)) + '%');
  }

  function runMbTyping(mb) {
    const text = mb.text;
    let pos = 0, playerHp = 100, errors = 0;
    let timeLeft = mb.time || 20;

    renderBtText('mb-text-display', text, pos);
    setMbHp(100, 100);
    setEl('mb-timer', timeLeft);
    el('mb-timer')?.classList.remove('urgent');

    const timerEl = el('mb-timer');
    clearInterval(mbTimerRef);
    mbTimerRef = setInterval(() => {
      if (mbDone) { clearInterval(mbTimerRef); return; }
      timeLeft--;
      if (timerEl) { timerEl.textContent = timeLeft; if (timeLeft <= 5) timerEl.classList.add('urgent'); }
      if (timeLeft <= 0) { clearInterval(mbTimerRef); endMb(false, mb); }
    }, 1000);

    const inp = el('mb-input');
    if (inp) { inp.value = ''; inp.focus(); }

    function onInput(e) {
      if (mbDone) return;
      const char = e.data;
      if (!char) return;
      if (inp) inp.value = '';
      if (pos >= text.length) return;

      const expected = text[pos];
      if (char === expected) {
        pos++;
        const enemyHp = 100 - Math.round((pos / text.length) * 100);
        setMbHp(enemyHp, playerHp);
        if (pos >= text.length) { clearInterval(mbTimerRef); endMb(true, mb); return; }
      } else {
        errors++;
        playerHp = Math.max(0, playerHp - 8);
        setMbHp(100 - Math.round((pos / text.length) * 100), playerHp);
        el('mb-text-display')?.classList.add('shake');
        setTimeout(() => el('mb-text-display')?.classList.remove('shake'), 250);
        if (playerHp <= 0) { clearInterval(mbTimerRef); endMb(false, mb); return; }
      }
      renderBtText('mb-text-display', text, pos);
    }

    if (inp) { inp.removeEventListener('input', inp._storyHandler || (() => {})); inp._storyHandler = onInput; inp.addEventListener('input', onInput); }
  }

  function endMb(won, mb) {
    if (mbDone) return;
    mbDone = true;
    clearInterval(mbTimerRef);

    const resultEl = el('mb-result-line');
    if (resultEl) {
      resultEl.className = 'mb-result-line ' + (won ? 'win' : 'lose');
      resultEl.textContent = won ? '✅ ' + mb.win : '❌ ' + mb.lose;
      resultEl.classList.remove('hidden');
    }
    if (won) SFX?.correct?.(); else SFX?.wrong?.();

    setTimeout(() => {
      if (won) { mbIdx++; startOneMb(); }
      else     { mbIdx = 0; startOneMb(); } // restart mini battles on fail
    }, 1400);
  }

  /* ══ CHAPTER CHALLENGE ══ */
  function launchChallenge() {
    isWeaknessRun = false;
    weakKeysFound = [];
    errorSnapshot = { ...STATE.errorMap };

    const ch   = activeChapter;
    const diff = ch.diff[activeDiff] || ch.diff.agent;
    setEl('training-title', `${ch.icon} ${ch.title}`);
    setEl('training-mode-badge', {rekrut:'🐣 Rekrut',agent:'🕵️ Agent',elite:'💎 Elite'}[activeDiff]);
    setStyle('training-progress', 'width', '0%');
    showView('training');
    Engine.setup(ch.challenge, null, 'normal', { onComplete: onChallengeDone });
    setEl('ls-time', '0:00');
    focusInput();
  }

  function launchWeaknessChallenge() {
    isWeaknessRun = true;
    errorSnapshot = { ...STATE.errorMap };
    const ch = activeChapter;
    setEl('training-title', `${ch.icon} ${ch.title} – Schwächentraining`);
    setEl('training-mode-badge', '🎯 Schwächen');
    setStyle('training-progress', 'width', '0%');
    showView('training');
    Engine.setup(ch.weakText, null, 'normal', { onComplete: onChallengeDone });
    setEl('ls-time', '0:00');
    focusInput();
  }

  /* ══ AFTER CHALLENGE ══ */
  function onChallengeDone(stats) {
    lastStats = stats;
    const ch   = activeChapter;
    if (!ch) return;

    const today = todayStr();
    STATE.activityLog[today] = (STATE.activityLog[today] || 0) + 1;
    STATE.wpmHistory.push({ val: stats.wpm, date: today });
    STATE.accHistory.push({ val: stats.acc, date: today });
    if (stats.wpm > (STATE.highscores?.wpm || 0)) STATE.highscores.wpm = stats.wpm;
    if (stats.acc > (STATE.highscores?.acc || 0)) STATE.highscores.acc = stats.acc;

    const diff   = ch.diff[activeDiff] || ch.diff.agent;
    const passed = stats.wpm >= diff.minWpm && stats.acc >= diff.minAcc;

    if (!isWeaknessRun && passed) weakKeysFound = detectWeak(ch.keys);

    showChapterResult(stats, passed);
  }

  function detectWeak(focusKeys) {
    if (!focusKeys || !errorSnapshot) return [];
    return focusKeys.filter(k => {
      const lk  = k.toLowerCase();
      const now  = (STATE.errorMap[lk] || 0) + (STATE.errorMap[k] || 0);
      const prev = (errorSnapshot[lk] || 0) + (errorSnapshot[k] || 0);
      return (now - prev) >= 3;
    });
  }

  /* ══ CHAPTER RESULT ══ */
  function showChapterResult(stats, passed) {
    activateView();
    ['story-map','story-intro','story-minibattle','story-boss',
     'story-act-complete','story-weakness'].forEach(hide);
    show('story-result');

    const ch       = activeChapter;
    const diff     = ch.diff[activeDiff] || ch.diff.agent;
    const s        = calcStars(stats.wpm, stats.acc, diff);
    const needsWeak = passed && !isWeaknessRun && weakKeysFound.length > 0;
    const isFullDone = passed && (!needsWeak || isWeaknessRun);

    const msgs = isWeaknessRun ? ch.success : (passed ? ch.success : ch.fail);
    html('story-result-dialog', `<div class="sresult-dialog">${msgs.map(m => `
      <div class="sresult-bubble">
        <span class="sresult-ava">${m.a}</span>
        <div class="sresult-msg-wrap">
          <div class="sresult-speaker">${m.n}</div>
          <div class="sresult-msg">${m.t}</div>
        </div>
      </div>`).join('')}</div>`);

    const pColor = passed ? 'var(--green)' : '#ef4444';
    html('story-result-stats', `
      <div class="story-stat-pill"><span class="story-stat-val">${stats.wpm}</span><span class="story-stat-lbl">WPM</span></div>
      <div class="story-stat-pill"><span class="story-stat-val" style="color:${pColor}">${stats.acc}%</span><span class="story-stat-lbl">Genauigkeit</span></div>
      <div class="story-stat-pill"><span class="story-stat-val">${stats.errors}</span><span class="story-stat-lbl">Fehler</span></div>
      <div class="story-stat-pill"><span class="story-stat-val">${passed ? '⭐'.repeat(s)+'☆'.repeat(3-s) : '❌'}</span><span class="story-stat-lbl">${passed?'Sterne':'Status'}</span></div>
    `);

    let actionsHtml = '';
    if (!passed) {
      actionsHtml = `<button class="btn-primary" id="sr-retry">↺ Nochmal versuchen</button>
                     <button class="btn-ghost"   id="sr-map">← Karte</button>`;
    } else if (needsWeak) {
      actionsHtml = `<button class="btn-primary" id="sr-weak">🎯 Schwächentraining</button>
                     <button class="btn-ghost"   id="sr-skip-weak">Weiter ohne Training ▶</button>`;
    } else {
      // Save chapter complete
      const existing = getRes(ch.id);
      saveRes(ch.id, {
        completed: true,
        stars: Math.max(s, existing?.stars || 0),
        bestWpm: Math.max(stats.wpm, existing?.bestWpm || 0),
        bestAcc: Math.max(stats.acc, existing?.bestAcc || 0),
      });
      addXP(diff.xp);
      updateStreak();
      checkAllAchievements({ ...stats, text: ch.challenge });
      checkAchievement('story_first', true);
      if (activeDiff === 'elite') checkAchievement('story_elite', true);
      if (stats.errors === 0)    checkAchievement('story_perfect', true);
      saveState();
      if (s === 3) setTimeout(launchConfetti, 300);

      const actIdx  = STORY_ACTS.findIndex(a => a.chapters.some(c => c.id === ch.id));
      const act     = STORY_ACTS[actIdx];
      const chIdx   = act.chapters.findIndex(c => c.id === ch.id);
      const nextCh  = act.chapters[chIdx + 1];
      const allDone = act.chapters.every(c => !!getRes(c.id)?.completed);

      if (allDone) {
        actionsHtml = `<button class="btn-primary" id="sr-boss">⚔️ Boss kämpfen!</button>
                       <button class="btn-ghost"   id="sr-map2">← Karte</button>`;
      } else if (nextCh) {
        actionsHtml = `<button class="btn-primary" id="sr-next">Nächstes Kapitel ▶</button>
                       <button class="btn-ghost"   id="sr-map2">← Karte</button>`;
      } else {
        actionsHtml = `<button class="btn-ghost" id="sr-map2">← Karte</button>`;
      }
    }
    html('story-result-actions', actionsHtml);

    el('sr-retry')?.addEventListener('click', () => startDifficultySelect(activeAct, activeChapter));
    el('sr-map')?.addEventListener('click', showMap);
    el('sr-map2')?.addEventListener('click', showMap);
    el('sr-weak')?.addEventListener('click', showWeaknessScreen);
    el('sr-skip-weak')?.addEventListener('click', () => {
      isWeaknessRun = true; weakKeysFound = [];
      onChallengeDone({ ...lastStats });
    });
    el('sr-next')?.addEventListener('click', () => {
      const actIdx = STORY_ACTS.findIndex(a => a.chapters.some(c => c.id === activeChapter.id));
      const act    = STORY_ACTS[actIdx];
      const chIdx  = act.chapters.findIndex(c => c.id === activeChapter.id);
      if (act.chapters[chIdx+1]) startDifficultySelect(act, act.chapters[chIdx+1]);
      else showMap();
    });
    el('sr-boss')?.addEventListener('click', () => {
      const actIdx = STORY_ACTS.findIndex(a => a.chapters.some(c => c.id === activeChapter.id));
      startBossIntro(STORY_ACTS[actIdx]);
    });
  }

  /* ══ WEAKNESS SCREEN ══ */
  function showWeaknessScreen() {
    activateView();
    ['story-map','story-intro','story-result','story-minibattle',
     'story-boss','story-act-complete'].forEach(hide);
    show('story-weakness');

    const ch = activeChapter;
    setEl('story-weakness-desc',
      `Prof. Keystroke hat Schwächen bei diesen Tasten erkannt. ` +
      `Tippe den Übungstext und erreiche ${ch.diff[activeDiff]?.minAcc || 85}% Genauigkeit.`);
    html('story-weak-keys', weakKeysFound.map(k => `<span class="story-weak-key">${k}</span>`).join(''));

    const msgs = ch.weakness;
    html('story-weakness-dialog', `<div class="sresult-dialog" style="margin-top:.5rem">${msgs.map(m => `
      <div class="sresult-bubble">
        <span class="sresult-ava">${m.a}</span>
        <div class="sresult-msg-wrap">
          <div class="sresult-speaker">${m.n}</div>
          <div class="sresult-msg">${m.t}</div>
        </div>
      </div>`).join('')}</div>`);

    el('story-btn-weakness-start').onclick = launchWeaknessChallenge;
  }

  /* ══ BOSS INTRO ══ */
  function startBossIntro(act) {
    activeAct = act;
    activateView();
    ['story-map','story-result','story-weakness','story-act-complete',
     'story-minibattle','story-difficulty'].forEach(hide);
    show('story-intro');

    const boss = act.boss;
    html('story-banner', `
      <span class="story-chapter-icon">${boss.icon}</span>
      <div style="flex:1">
        <div class="story-chapter-sub">Boss-Kampf · Akt ${STORY_ACTS.indexOf(act)+1}</div>
        <div class="story-chapter-name">${boss.name}</div>
      </div>
      <span class="story-diff-badge" style="color:#f59e0b">⚠️ Boss!</span>
    `);
    setEl('story-narrative', `Der finale Gegner von ${act.title} erwartet dich!`);

    dialogQueue = boss.intro;
    dialogIdx   = 0;
    isTypingDialog = false;
    el('story-btn-next').onclick  = nextBossDialog;
    el('story-btn-skip').onclick  = () => launchBoss(act);
    showDialogMsg(dialogQueue[0]);
  }

  function nextBossDialog() {
    if (isTypingDialog) {
      const msg = dialogQueue[dialogIdx];
      if (msg) { setEl('story-dialog-text', msg.t); hide('story-dialog-dots'); isTypingDialog = false; }
      return;
    }
    dialogIdx++;
    if (dialogIdx < dialogQueue.length) showDialogMsg(dialogQueue[dialogIdx]);
    else launchBoss(activeAct);
  }

  /* ══ BOSS BATTLE ══ */
  function launchBoss(act) {
    activeAct = act;
    const boss  = act.boss;
    const dCfg  = boss.diff[activeDiff] || boss.diff.agent;

    activateView();
    ['story-map','story-intro','story-result','story-weakness',
     'story-act-complete','story-minibattle'].forEach(hide);
    show('story-boss');

    bossPlayerHp = 100;
    bossBossHp   = 100;
    bossNoDamage = true;
    bossTimers.forEach(clearTimeout); bossTimers = [];

    setEl('boss-name', boss.name);
    html('boss-avatar', boss.icon);
    html('boss-dialog-row', '');
    hide('boss-attack-warn');
    hide('boss-flash-overlay');

    updateBossHpBars();

    // Boss attack function
    function bossAttack() {
      if (bossBossHp <= 0 || bossPlayerHp <= 0) return;
      bossPlayerHp = Math.max(0, bossPlayerHp - dCfg.attackDmg);
      bossNoDamage = false;
      updateBossHpBars();

      show('boss-attack-warn');
      show('boss-flash-overlay');
      SFX?.wrong?.();
      setTimeout(() => { hide('boss-attack-warn'); hide('boss-flash-overlay'); }, 600);

      // Boss taunts
      const taunts = ['Du kannst mich nicht aufhalten!','Zu langsam!','HAHAHA!','Meine Angriffe sind unaufhaltsam!'];
      const t = taunts[Math.floor(Math.random() * taunts.length)];
      html('boss-dialog-row', `<div class="boss-bubble">
        <span class="boss-bubble-ava">${boss.icon}</span>
        <div class="boss-bubble-txt">${t}</div>
      </div>`);

      if (bossPlayerHp <= 0) { endBoss(false, act); return; }
      const tid = setTimeout(bossAttack, dCfg.attackInterval * 1000);
      bossTimers.push(tid);
    }

    const firstAttack = setTimeout(bossAttack, dCfg.attackInterval * 1000);
    bossTimers.push(firstAttack);

    // Boss typing
    const text = boss.text;
    let pos = 0;
    renderBtText('boss-text-display', text, pos);

    const inp = el('boss-input');
    if (inp) { inp.value = ''; inp.focus(); }

    function onBossInput(e) {
      if (bossBossHp <= 0 || bossPlayerHp <= 0) return;
      const char = e.data;
      if (!char) return;
      if (inp) inp.value = '';
      if (pos >= text.length) return;

      const expected = text[pos];
      if (char === expected) {
        pos++;
        bossBossHp = Math.max(0, 100 - Math.round((pos / text.length) * 100));
        updateBossHpBars();
        if (pos >= text.length || bossBossHp <= 0) {
          bossTimers.forEach(clearTimeout); bossTimers = [];
          endBoss(true, act);
          return;
        }
      } else {
        bossPlayerHp = Math.max(0, bossPlayerHp - dCfg.errorDmg);
        bossNoDamage = false;
        updateBossHpBars();
        el('boss-text-display')?.classList.add('shake');
        setTimeout(() => el('boss-text-display')?.classList.remove('shake'), 250);
        if (bossPlayerHp <= 0) {
          bossTimers.forEach(clearTimeout); bossTimers = [];
          endBoss(false, act);
          return;
        }
      }
      renderBtText('boss-text-display', text, pos);
    }

    if (inp) { inp.removeEventListener('input', inp._bossHandler || (() => {})); inp._bossHandler = onBossInput; inp.addEventListener('input', onBossInput); }
  }

  function updateBossHpBars() {
    const bf = el('boss-hp-fill'), pf = el('player-hp-fill');
    if (bf) bf.style.width = Math.max(0, bossBossHp) + '%';
    if (pf) pf.style.width = Math.max(0, bossPlayerHp) + '%';
    setEl('boss-hp-val', Math.max(0, Math.round(bossBossHp)) + '%');
    setEl('player-hp-val', Math.max(0, Math.round(bossPlayerHp)) + '%');
    if (bf && bossBossHp < 25) bf.style.background = '#ef4444';
    if (pf && bossPlayerHp < 25) pf.style.background = 'linear-gradient(90deg,#ef4444,#f59e0b)';
  }

  function endBoss(won, act) {
    bossTimers.forEach(clearTimeout); bossTimers = [];
    const boss = act.boss;

    activateView();
    ['story-map','story-intro','story-minibattle','story-weakness','story-result'].forEach(hide);
    show('story-act-complete');

    if (won) {
      launchConfetti();
      SFX?.correct?.();
      const xpReward = act.xpBonus + (bossNoDamage ? 100 : 0);
      addXP(xpReward);
      saveActRes(act.id, { completed: true, bossBeatenAt: todayStr() });
      updateStreak(); saveState();
      checkAchievement(boss.achievementId, true);
      if (bossNoDamage) checkAchievement('story_nodmg', true);
      const actIdx = STORY_ACTS.indexOf(act);
      if (actIdx === 0) checkAchievement('story_act1', true);
      if (actIdx === 1) checkAchievement('story_act2', true);
      if (actIdx === 2) checkAchievement('story_act3', true);

      setEl('act-complete-icon', boss.icon);
      setEl('act-complete-title', `${act.title} – Abgeschlossen!`);
      setEl('act-complete-sub', boss.victory.map(m => `<b>${m.n}:</b> ${m.t}`).join('<br>'));
      html('act-complete-xp', `🎉 +${xpReward} XP${bossNoDamage ? ' (BONUS: Kein Schaden!)' : ''}`);

      const nextAct = STORY_ACTS[STORY_ACTS.indexOf(act) + 1];
      html('act-complete-actions', `
        ${nextAct ? `<button class="btn-primary" id="ac-next-act">▶ Nächster Akt: ${nextAct.title}</button>` : `<span class="btn-primary" style="cursor:default">🏆 Alle Akte abgeschlossen!</span>`}
        <button class="btn-ghost" id="ac-map">← Zurück zur Karte</button>
      `);
      el('ac-next-act')?.addEventListener('click', () => {
        currentActIdx = STORY_ACTS.indexOf(act) + 1;
        showMap();
      });
      el('ac-map')?.addEventListener('click', showMap);
    } else {
      SFX?.wrong?.();
      setEl('act-complete-icon', '💥');
      setEl('act-complete-title', 'Niederlage!');
      setEl('act-complete-sub', boss.defeat[0]?.t || 'Der Boss war zu stark. Versuche es nochmal!');
      html('act-complete-xp', '');
      html('act-complete-actions', `
        <button class="btn-primary" id="ac-retry-boss">↺ Boss nochmal</button>
        <button class="btn-ghost"   id="ac-map2">← Karte</button>
      `);
      el('ac-retry-boss')?.addEventListener('click', () => startBossIntro(act));
      el('ac-map2')?.addEventListener('click', showMap);
    }
  }

  /* ── checkAchievement helper ── */
  function checkAchievement(id, cond) {
    if (!cond) return;
    if (STATE.achievements?.includes(id)) return;
    if (!STATE.achievements) STATE.achievements = [];
    STATE.achievements.push(id);
    const def = ACHIEVEMENTS_DEF.find(a => a.id === id);
    if (def) showAchievementToast(def);
  }

  /* public API */
  function startChapter(id) {
    const act = STORY_ACTS.find(a => a.chapters.some(c => c.id === id));
    const ch  = act?.chapters.find(c => c.id === id);
    if (act && ch) startDifficultySelect(act, ch);
  }

  return { showMap, startChapter, renderDailyWidget };
})();
