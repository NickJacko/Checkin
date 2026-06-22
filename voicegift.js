'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, increment, Timestamp, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

/* ── Firebase ── */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCa8VcpRe94gevcyQUF_Zc-e-UNRCowDSc',
  authDomain:        'checkin-9f731.firebaseapp.com',
  projectId:         'checkin-9f731',
  storageBucket:     'checkin-9f731.firebasestorage.app',
  messagingSenderId: '199496624018',
  appId:             '1:199496624018:web:a06afb19294d0635a8034b',
};
const fbApp = initializeApp(FIREBASE_CONFIG);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
const stor  = getStorage(fbApp);

/* ── State ── */
let currentProject = null;
let recordings     = [];
let participants   = [];
let studioIntroBlob = null; let studioIntroUrl = null;
let studioOutroBlob = null; let studioOutroUrl = null;
let studioMusicBlob = null; let studioMusicUrl = null;
let studioMediaRecorder = null;
let studioRecordTarget  = null; // 'intro' | 'outro'
let studioRecordChunks  = [];
let studioRecordTimer   = null;
let studioRecordSeconds = 0;
let exportBlobUrl = null;
let studioStream  = null;

/* ── Prompts by occasion ── */
const PROMPTS = {
  geburtstag: [
    'Welche Erinnerung mit {name} bringt dich immer zum Lächeln?',
    'Was wünschst du {name} zum Geburtstag?',
    'Was macht {name} so besonders?',
    'Welche verrückte Geschichte verbindet euch?',
    'Was möchtest du {name} schon lange einmal sagen?',
    'Was bewunderst du an {name} am meisten?',
    'Welchen Moment mit {name} wirst du nie vergessen?',
  ],
  hochzeit: [
    'Was wünschst du {name} für die gemeinsame Zukunft?',
    'Welche Eigenschaft liebst du an {name}?',
    'Was ist dein schönstes Erlebnis mit {name}?',
    'Welchen Ratschlag möchtest du dem Brautpaar mitgeben?',
    'Was verbindet dich ganz besonders mit {name}?',
  ],
  abschied: [
    'Was wird dir an {name} am meisten fehlen?',
    'Was wünschst du {name} für den neuen Weg?',
    'Welche Eigenschaft wirst du am meisten vermissen?',
    'Was war ein unvergesslicher Moment mit {name}?',
    'Was möchtest du {name} auf den Weg mitgeben?',
  ],
  ruhestand: [
    'Was hat {name} in all den Jahren besonders gemacht?',
    'Welche Eigenschaft wirst du an {name} vermissen?',
    'Was wünschst du {name} im Ruhestand?',
    'Was war ein unvergessliches Erlebnis mit {name}?',
    'Welchen Ratschlag gibst du {name} für den Ruhestand?',
  ],
  jubilaeum: [
    'Was verbindet euch über all die Jahre?',
    'Was schätzt du an {name} besonders?',
    'Was war dein liebster Moment der gemeinsamen Zeit?',
    'Welchen Wunsch hast du für die nächsten Jahre?',
  ],
  genesung: [
    'Was wünschst du {name} für eine schnelle Genesung?',
    'Was magst du an {name} besonders?',
    'Welche Erinnerung macht dich glücklich, wenn du an {name} denkst?',
    'Was möchtest du {name} Mut machendes mitgeben?',
  ],
  anderes: [
    'Welche Erinnerung mit {name} wirst du nie vergessen?',
    'Was möchtest du {name} schon lange einmal sagen?',
    'Welche Eigenschaft schätzt du an {name} am meisten?',
    'Was wünschst du {name} für die Zukunft?',
    'Was hat {name} in deinem Leben bewirkt?',
  ],
};
const PROMPTS_EN = {
  geburtstag: [
    'What memory with {name} always makes you smile?',
    'What do you wish {name} for their birthday?',
    'What makes {name} so special?',
    'What would you love to say to {name}?',
  ],
  hochzeit: [
    'What do you wish {name} for their future together?',
    'What quality do you love most about {name}?',
    'What is your best memory with {name}?',
    'What advice would you give the couple?',
  ],
  abschied: ['What will you miss most about {name}?', 'What do you wish {name} on their new journey?'],
  ruhestand: ['What has {name} done especially well over the years?', 'What do you wish {name} in retirement?'],
  jubilaeum: ['What connects you over all these years?', 'What was your favourite shared moment?'],
  genesung:  ['What do you wish {name} for a speedy recovery?', 'What do you want to tell {name} to keep their spirits up?'],
  anderes:   ['What memory with {name} will you never forget?', 'What do you want to say to {name}?'],
};

/* ═══════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════ */
function $$(id){ return document.getElementById(id); }
function show(id){ $$( id)?.classList.remove('hidden'); }
function hide(id){ $$(id)?.classList.add('hidden'); }
function setText(id, v){ const el=$$(id); if(el) el.textContent=String(v); }

function showView(name){
  ['view-login','view-projects','view-create','view-dashboard']
    .forEach(v => v === 'view-'+name ? show(v) : hide(v));
  if(name === 'login'){ hide('vg-nav'); }
  else { show('vg-nav'); }
  if(name === 'dashboard'){ show('btn-back-projects'); } else { hide('btn-back-projects'); }
}

function toast(msg, type='info'){
  const wrap = $$('toast-wrap');
  const el   = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

function generateToken(len=16){
  const chars='abcdefghijklmnopqrstuvwxyz0123456789';
  const arr=new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>chars[b%chars.length]).join('');
}

function formatDuration(sec){
  const m=Math.floor(sec/60), s=Math.round(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatDate(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'});
}

function occasionLabel(o){
  return {geburtstag:'🎂 Geburtstag',hochzeit:'💍 Hochzeit',abschied:'👋 Abschied',ruhestand:'🌅 Ruhestand',jubilaeum:'🏅 Jubiläum',genesung:'💛 Gute Besserung',anderes:'✨ Anderes'}[o]||o;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function confirm(icon, title, msg){
  return new Promise(resolve=>{
    show('modal-confirm');
    setText('modal-confirm-icon', icon);
    setText('modal-confirm-title', title);
    setText('modal-confirm-msg', msg);
    const ok     = $$('modal-confirm-ok');
    const cancel = $$('modal-confirm-cancel');
    const cleanup = () => { hide('modal-confirm'); ok.replaceWith(ok.cloneNode(true)); cancel.replaceWith(cancel.cloneNode(true)); };
    $$('modal-confirm-ok').onclick = () => { cleanup(); resolve(true); };
    $$('modal-confirm-cancel').onclick = () => { cleanup(); resolve(false); };
  });
}

/* ═══════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════ */
function bindLogin(){
  $$('btn-login').onclick = async () => {
    const email = $$('login-email').value.trim();
    const pw    = $$('login-password').value;
    $$('login-error').textContent = '';
    if(!email || !pw){ showLoginError('Bitte E-Mail und Passwort eingeben.'); return; }
    const btn = $$('btn-login');
    btn.textContent = '…';
    btn.disabled    = true;
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('timeout'), {code:'timeout'})), 12000)
      );
      await Promise.race([signInWithEmailAndPassword(auth, email, pw), timeout]);
    } catch(e) {
      let msg;
      if(e.code === 'auth/operation-not-allowed'){
        msg = 'Anmeldung nicht aktiviert. Bitte E-Mail/Passwort in der Firebase Console aktivieren.';
      } else if(e.code === 'auth/too-many-requests'){
        msg = 'Zu viele Versuche. Bitte kurz warten.';
      } else if(e.code === 'auth/network-request-failed' || e.code === 'timeout'){
        msg = 'Keine Verbindung zu Firebase. Bitte Netzwerk und Firebase-Konfiguration prüfen.';
      } else {
        msg = 'E-Mail oder Passwort ist falsch. (Code: ' + (e.code || 'unbekannt') + ')';
      }
      showLoginError(msg);
    } finally {
      btn.textContent = 'Anmelden';
      btn.disabled    = false;
    }
  };
  $$('login-password').addEventListener('keydown', e => { if(e.key==='Enter' && !$$('btn-login').disabled) $$('btn-login').click(); });
  $$('btn-logout').onclick = () => signOut(auth);
}

function showLoginError(msg){
  const el = $$('login-error');
  if(el){ el.textContent = msg; }
  /* longer toast for auth errors so they're readable */
  const wrap = $$('toast-wrap');
  if(wrap){
    const t = document.createElement('div');
    t.className = 'toast error';
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
}

/* ═══════════════════════════════════════════════════════
   PROJECTS
═══════════════════════════════════════════════════════ */
async function loadProjects(){
  showView('projects');
  try {
    const snap = await getDocs(collection(db,'vg_projects'));
    const projects = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    renderProjectGrid(projects);
  } catch(e){
    renderProjectGrid([]);
  }
}

function renderProjectGrid(projects){
  const grid = $$('projects-grid');
  if(!projects.length){
    grid.innerHTML = `<div class="empty-state">
      <span class="es-icon">🎁</span>
      <h3>Noch kein Geschenk</h3>
      <p>Erstelle ein Projekt, teile den Einladungslink – und sammle Stimmen als unvergessliches Audio-Geschenk.</p>
    </div>`;
    return;
  }
  grid.innerHTML = projects.map(p => `
    <div class="project-card" data-id="${p.id}">
      <div class="pc-header">
        <span class="pc-icon">${occasionEmoji(p.occasion)}</span>
        <div class="pc-info">
          <div class="pc-name">Für ${esc(p.recipientName)}</div>
          <div class="pc-occasion">${occasionLabel(p.occasion)}</div>
        </div>
      </div>
      <div class="pc-meta">
        <span class="chip chip-rose">${esc(p.title||p.recipientName)}</span>
        ${p.deliveryDate ? `<span class="chip chip-amber">📅 ${p.deliveryDate}</span>` : ''}
        <span class="chip chip-gray">${p.language==='en'?'🇬🇧':'🇩🇪'}</span>
      </div>
      <div class="pc-count"><strong>${p.recordCount||0}</strong> Aufnahme${(p.recordCount||0)!==1?'n':''}</div>
      <div class="pc-date">Erstellt ${formatDate(p.createdAt)}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openProject(card.dataset.id));
  });
}

function occasionEmoji(o){
  return {geburtstag:'🎂',hochzeit:'💍',abschied:'👋',ruhestand:'🌅',jubilaeum:'🏅',genesung:'💛',anderes:'✨'}[o]||'🎁';
}

function bindCreateProject(){
  $$('btn-create-project').onclick = () => showView('create');
  $$('btn-cancel-create').onclick  = () => showView('projects');
  $$('btn-save-create').onclick = async () => {
    const recipient = $$('create-recipient').value.trim();
    if(!recipient){ toast('Bitte Namen des Empfängers eingeben.','error'); return; }
    const btn = $$('btn-save-create');
    btn.textContent = '…'; btn.disabled = true;
    try {
      const inviteToken = generateToken(16);
      const giftToken   = generateToken(16);
      await addDoc(collection(db,'vg_projects'), {
        title:         recipient,
        recipientName: recipient,
        occasion:      $$('create-occasion').value,
        deliveryDate:  $$('create-delivery').value || null,
        adminNote:     $$('create-note').value.trim(),
        language:      $$('create-language').value,
        inviteToken,
        giftToken,
        maxRecordingSeconds: parseInt($$('create-maxrec').value)||180,
        pauseSeconds: parseFloat($$('create-pause').value)||1.5,
        customPrompts: [],
        introPath: null, outroPath: null, musicPath: null,
        recordCount: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast('Projekt erstellt! 🎉','success');
      $$('create-recipient').value=''; $$('create-note').value='';
      await loadProjects();
    } catch(e){ toast('Fehler: '+e.message,'error'); }
    finally   { btn.textContent='🎁 Projekt erstellen'; btn.disabled=false; }
  };
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════ */
async function openProject(id){
  const snap = await getDoc(doc(db,'vg_projects',id));
  if(!snap.exists()){ toast('Projekt nicht gefunden.','error'); return; }
  currentProject = { id, ...snap.data() };
  studioIntroUrl = currentProject.introUrl || null;
  studioOutroUrl = currentProject.outroUrl || null;
  studioMusicUrl = currentProject.musicUrl || null;
  await loadRecordings();
  await loadParticipants();
  renderDashboard();
  showView('dashboard');
  activateTab('recordings');
}

function renderDashboard(){
  const p = currentProject;
  setText('dash-title', `${occasionEmoji(p.occasion)} Für ${p.recipientName}`);
  setText('dash-subtitle', `${occasionLabel(p.occasion)}${p.deliveryDate?' · '+p.deliveryDate:''} · ${p.language==='en'?'English':'Deutsch'}`);
  const inviteUrl = `${location.origin}${location.pathname.replace('voicegift.html','voicegift-record.html')}?token=${p.inviteToken}`;
  setText('dash-invite-url', inviteUrl);
  [$$('btn-copy-link'), $$('btn-copy-link-2')].forEach(btn => {
    btn.onclick = () => { navigator.clipboard.writeText(inviteUrl).then(()=>toast('Link kopiert! ✅','success')); };
  });
  renderInviteTexts(inviteUrl);
  renderStudioIntroOutro();
  $$('export-pause').value = p.pauseSeconds||1.5;
  setText('export-pause-val', (p.pauseSeconds||1.5)+'s');
}

function renderInviteTexts(inviteUrl){
  const p = currentProject;
  const de = p.language !== 'en';
  const recName  = p.recipientName;
  const occasion = occasionLabel(p.occasion).replace(/^.+? /,'');
  const texts = de ? {
    whatsapp: `Hallo! 🎁\n\nFür ${recName} (${occasion}) sammeln wir Sprachnachrichten als persönliches Audio-Geschenk.\n\nBitte nimm dir 2–3 Minuten Zeit und hinterlasse eine kurze Botschaft – direkt im Browser, ohne Login:\n${inviteUrl}\n\nVielen Dank! 💛`,
    email:    `Hallo,\n\nfür ${recName} sammeln wir zum Anlass „${occasion}" persönliche Sprachnachrichten.\n\nDu kannst direkt im Browser aufnehmen – keine App, kein Login:\n${inviteUrl}\n\nWir freuen uns auf deine Stimme!\n\nLiebe Grüße`,
    kurz:     `Stimme für ${recName} hinterlassen: ${inviteUrl}`,
  } : {
    whatsapp: `Hi! 🎁\n\nWe're collecting voice messages for ${recName} (${occasion}) as a personal audio gift.\n\nPlease take 2–3 minutes to record a short message – directly in your browser, no login needed:\n${inviteUrl}\n\nThank you! 💛`,
    email:    `Hi,\n\nwe're collecting personal voice messages for ${recName} for "${occasion}".\n\nYou can record directly in your browser – no app or login:\n${inviteUrl}\n\nWe look forward to your message!\n\nBest regards`,
    kurz:     `Leave a voice for ${recName}: ${inviteUrl}`,
  };

  const container = $$('invite-texts-container');
  container.innerHTML = Object.entries({
    [de?'WhatsApp / Signal':'WhatsApp / Signal']: texts.whatsapp,
    [de?'E-Mail':'Email']:                         texts.email,
    [de?'Kurze Version':'Short version']:           texts.kurz,
  }).map(([label,text])=>`
    <div class="invite-text-card">
      <div class="invite-text-label">${esc(label)}</div>
      <div class="invite-text-body">${esc(text)}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:.6rem" onclick="navigator.clipboard.writeText(${JSON.stringify(text)}).then(()=>window.vgToast('Kopiert! ✅','success'))">📋 Kopieren</button>
    </div>
  `).join('');
}

window.vgToast = toast; // expose for inline onclick

/* ── TABS ── */
function activateTab(name){
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.tab===name));
  ['recordings','participants','studio','settings'].forEach(t => {
    $$('tab-'+t)?.classList.toggle('hidden', t!==name);
  });
  if(name==='recordings') renderRecordingsList();
  if(name==='participants') renderParticipants();
  if(name==='studio') renderStudio();
  if(name==='settings') renderSettings();
}

function bindTabs(){
  document.querySelectorAll('.dash-tab').forEach(tab=>{
    tab.onclick = () => activateTab(tab.dataset.tab);
  });
}

/* ═══════════════════════════════════════════════════════
   RECORDINGS
═══════════════════════════════════════════════════════ */
async function loadRecordings(){
  const q = query(collection(db,'vg_recordings'), where('projectId','==',currentProject.id), orderBy('sortOrder','asc'));
  const snap = await getDocs(q).catch(async () => {
    // fallback without orderBy if index not ready
    return getDocs(query(collection(db,'vg_recordings'), where('projectId','==',currentProject.id)));
  });
  recordings = snap.docs.map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.sortOrder??99999)-(b.sortOrder??99999));
  setText('tab-count-rec', recordings.length);
}

function renderRecordingsList(){
  const list = $$('rec-list');
  if(!recordings.length){
    list.innerHTML=`<div class="empty-state" style="padding:3rem 0">
      <span class="es-icon">🎙</span>
      <h3>Noch keine Stimmen eingegangen</h3>
      <p>Teile den Einladungslink – die Aufnahmen erscheinen dann automatisch hier.</p>
    </div>`;
    setText('rec-count-label','0 Aufnahmen');
    return;
  }
  setText('rec-count-label', recordings.length+' Aufnahme'+(recordings.length!==1?'n':''));
  list.innerHTML = recordings.map((r,i) => `
    <div class="rec-item ${r.isPinned?'pinned':''}" data-id="${r.id}">
      <span class="rec-drag-handle" title="Sortieren">⠿</span>
      <div style="flex-shrink:0">
        <button class="rec-play-btn" data-url="${esc(r.audioUrl||'')}" title="Abspielen">▶</button>
      </div>
      <div class="rec-info">
        <div class="rec-name">
          ${esc(r.participantName)}
          ${r.isPinned?'<span class="chip chip-amber" style="font-size:.65rem">📌 Gepinnt</span>':''}
        </div>
        <div class="rec-meta">${formatDate(r.createdAt)} · ${formatDuration(r.duration||0)}</div>
        ${r.note?`<div class="rec-note">${esc(r.note)}</div>`:''}
      </div>
      <div class="rec-controls">
        <button class="btn-icon" title="${r.isPinned?'Entpinnen':'Anpinnen'}" data-pin="${r.id}" data-pinned="${r.isPinned?1:0}">${r.isPinned?'📌':'📍'}</button>
        <button class="btn-icon" title="Nach oben" data-up="${i}" ${i===0?'disabled':''} style="${i===0?'opacity:.3':''}">↑</button>
        <button class="btn-icon" title="Nach unten" data-down="${i}" ${i===recordings.length-1?'disabled':''} style="${i===recordings.length-1?'opacity:.3':''}">↓</button>
        <button class="btn-icon btn-danger" title="Löschen" data-delete="${r.id}">🗑</button>
      </div>
    </div>
  `).join('');

  /* play buttons */
  let currentAudio = null;
  list.querySelectorAll('.rec-play-btn').forEach(btn => {
    btn.onclick = () => {
      const url = btn.dataset.url;
      if(!url){ toast('Audio nicht verfügbar.','error'); return; }
      if(currentAudio && !currentAudio.paused){ currentAudio.pause(); }
      list.querySelectorAll('.rec-play-btn').forEach(b=>b.classList.remove('playing'));
      currentAudio = new Audio(url);
      currentAudio.play();
      btn.classList.add('playing');
      btn.textContent = '⏸';
      currentAudio.onended = () => { btn.classList.remove('playing'); btn.textContent='▶'; };
      currentAudio.onclick = () => { currentAudio.pause(); btn.classList.remove('playing'); btn.textContent='▶'; };
      btn.onclick = () => {
        if(currentAudio.paused){ currentAudio.play(); btn.classList.add('playing'); btn.textContent='⏸'; }
        else { currentAudio.pause(); btn.classList.remove('playing'); btn.textContent='▶'; }
      };
    };
  });

  /* pin buttons */
  list.querySelectorAll('[data-pin]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.pin;
      const pinned = btn.dataset.pinned === '1';
      await updateDoc(doc(db,'vg_recordings',id), {isPinned: !pinned});
      await reloadRecordings();
    };
  });

  /* up/down */
  list.querySelectorAll('[data-up]').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.dataset.up);
      if(i===0) return;
      await swapRecordings(i, i-1);
    };
  });
  list.querySelectorAll('[data-down]').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.dataset.down);
      if(i>=recordings.length-1) return;
      await swapRecordings(i, i+1);
    };
  });

  /* delete */
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.delete;
      const rec = recordings.find(r=>r.id===id);
      const ok = await confirm('🗑','Aufnahme löschen?', `Aufnahme von „${rec?.participantName||'?'}" wird dauerhaft gelöscht.`);
      if(!ok) return;
      try {
        if(rec?.audioPath){ await deleteObject(ref(stor, rec.audioPath)).catch(()=>{}); }
        await deleteDoc(doc(db,'vg_recordings',id));
        await updateDoc(doc(db,'vg_projects',currentProject.id),{recordCount:increment(-1)}).catch(()=>{});
        toast('Aufnahme gelöscht.','success');
        await reloadRecordings();
      } catch(e){ toast('Fehler: '+e.message,'error'); }
    };
  });
}

async function swapRecordings(i, j){
  const a = recordings[i], b = recordings[j];
  await updateDoc(doc(db,'vg_recordings',a.id), {sortOrder: j});
  await updateDoc(doc(db,'vg_recordings',b.id), {sortOrder: i});
  await reloadRecordings();
}

async function reloadRecordings(){
  await loadRecordings();
  renderRecordingsList();
  if(!$$('tab-studio').classList.contains('hidden')) renderStudio();
}

/* ═══════════════════════════════════════════════════════
   PARTICIPANTS
═══════════════════════════════════════════════════════ */
async function loadParticipants(){
  const q = query(collection(db,'vg_participants'), where('projectId','==',currentProject.id));
  const snap = await getDocs(q);
  participants = snap.docs.map(d=>({id:d.id,...d.data()}));
}

async function renderParticipants(){
  await loadParticipants();

  /* submitted = names from recordings */
  const submittedNames = [...new Set(recordings.map(r=>r.participantName))];
  /* pending = participants not in submitted */
  const pendingParts = participants.filter(p => p.status==='invited' && !submittedNames.includes(p.name));

  const submittedEl = $$('parts-submitted');
  const pendingEl   = $$('parts-pending');

  if(!submittedNames.length){
    submittedEl.innerHTML = '<p style="font-size:.82rem;color:var(--tx3)">Noch keine Aufnahmen eingegangen.</p>';
  } else {
    submittedEl.innerHTML = submittedNames.map(name=>`
      <div class="part-item">
        <div class="part-avatar">${esc(name[0]?.toUpperCase()||'?')}</div>
        <div class="part-name">${esc(name)}</div>
        <span class="chip chip-green">✅ Eingegangen</span>
      </div>
    `).join('');
  }

  if(!pendingParts.length){
    pendingEl.innerHTML = '<p style="font-size:.82rem;color:var(--tx3)">Keine offenen Einladungen.</p>';
  } else {
    pendingEl.innerHTML = pendingParts.map(p=>`
      <div class="part-item">
        <div class="part-avatar">${esc(p.name[0]?.toUpperCase()||'?')}</div>
        <div class="part-name">${esc(p.name)}</div>
        <span class="chip chip-gray">⏳ Offen</span>
        <button class="btn btn-ghost btn-sm" data-del-part="${p.id}" style="margin-left:auto">✕</button>
      </div>
    `).join('');
    pendingEl.querySelectorAll('[data-del-part]').forEach(btn=>{
      btn.onclick = async () => {
        await deleteDoc(doc(db,'vg_participants',btn.dataset.delPart));
        await renderParticipants();
      };
    });
  }
}

function bindParticipants(){
  $$('btn-add-participant').onclick = async () => {
    const name = $$('add-part-name').value.trim();
    if(!name) return;
    await addDoc(collection(db,'vg_participants'), {
      projectId: currentProject.id,
      name,
      status: 'invited',
      createdAt: serverTimestamp(),
    });
    $$('add-part-name').value = '';
    await renderParticipants();
    toast('Person hinzugefügt.','success');
  };
  $$('add-part-name').addEventListener('keydown', e=>{ if(e.key==='Enter') $$('btn-add-participant').click(); });
}

/* ═══════════════════════════════════════════════════════
   STUDIO INTRO / OUTRO
═══════════════════════════════════════════════════════ */
function renderStudioIntroOutro(){
  updateAudioSlot('intro', studioIntroUrl);
  updateAudioSlot('outro', studioOutroUrl);
  updateAudioSlot('music', studioMusicUrl);
}

function updateAudioSlot(slot, url){
  const audioEl = $$(slot+'-audio');
  const noneLabel = $$(slot+'-none-label');
  const removeBtn = $$('btn-remove-'+slot);
  if(url){
    audioEl.src = url;
    audioEl.style.display='block';
    noneLabel && (noneLabel.style.display='none');
    removeBtn?.classList.remove('hidden');
  } else {
    audioEl.src='';
    audioEl.style.display='none';
    noneLabel && (noneLabel.style.display='');
    removeBtn?.classList.add('hidden');
  }
}

function bindStudioRecording(){
  /* intro record */
  $$('btn-record-intro').onclick = () => startStudioRec('intro');
  $$('btn-stop-intro-rec').onclick   = () => stopStudioRec('intro', true);
  $$('btn-cancel-intro-rec').onclick = () => stopStudioRec('intro', false);

  /* outro record */
  $$('btn-record-outro').onclick = () => startStudioRec('outro');
  $$('btn-stop-outro-rec').onclick   = () => stopStudioRec('outro', true);
  $$('btn-cancel-outro-rec').onclick = () => stopStudioRec('outro', false);

  /* remove */
  $$('btn-remove-intro').onclick = async () => {
    if(currentProject.introPath) await deleteObject(ref(stor,currentProject.introPath)).catch(()=>{});
    await updateDoc(doc(db,'vg_projects',currentProject.id),{introPath:null,introUrl:null});
    studioIntroUrl=null; studioIntroBlob=null;
    currentProject.introPath=null; currentProject.introUrl=null;
    updateAudioSlot('intro',null);
  };
  $$('btn-remove-outro').onclick = async () => {
    if(currentProject.outroPath) await deleteObject(ref(stor,currentProject.outroPath)).catch(()=>{});
    await updateDoc(doc(db,'vg_projects',currentProject.id),{outroPath:null,outroUrl:null});
    studioOutroUrl=null; studioOutroBlob=null;
    currentProject.outroPath=null; currentProject.outroUrl=null;
    updateAudioSlot('outro',null);
  };
  $$('btn-remove-music').onclick = async () => {
    if(currentProject.musicPath) await deleteObject(ref(stor,currentProject.musicPath)).catch(()=>{});
    await updateDoc(doc(db,'vg_projects',currentProject.id),{musicPath:null,musicUrl:null});
    studioMusicUrl=null; studioMusicBlob=null;
    currentProject.musicPath=null; currentProject.musicUrl=null;
    updateAudioSlot('music',null);
  };

  /* file uploads */
  $$('intro-upload').onchange = e => handleStudioUpload(e, 'intro');
  $$('outro-upload').onchange = e => handleStudioUpload(e, 'outro');
  $$('music-upload').onchange = e => handleStudioUpload(e, 'music');
}

async function startStudioRec(slot){
  if(studioMediaRecorder && studioMediaRecorder.state !== 'inactive'){
    studioMediaRecorder.stop();
    studioMediaRecorder = null;
  }
  if(studioStream){ studioStream.getTracks().forEach(t=>t.stop()); studioStream=null; }
  studioRecordTarget = slot;
  studioRecordChunks = [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    studioStream = stream;
    const sm = getSupportedMime();
    studioMediaRecorder = new MediaRecorder(stream, sm ? {mimeType: sm} : {});
    studioMediaRecorder.ondataavailable = e => { if(e.data.size>0) studioRecordChunks.push(e.data); };
    studioMediaRecorder.start(250);
    studioRecordSeconds = 0;
    show(slot+'-rec-ui');
    show(slot+'-rec-indicator');
    $$('btn-record-'+slot).disabled = true;
    studioRecordTimer = setInterval(()=>{
      studioRecordSeconds++;
      setText(slot+'-rec-time', formatDuration(studioRecordSeconds));
    }, 1000);
  } catch(e){ toast('Mikrofon nicht verfügbar: '+e.message,'error'); }
}

async function stopStudioRec(slot, save){
  clearInterval(studioRecordTimer);
  hide(slot+'-rec-ui');
  hide(slot+'-rec-indicator');
  $$('btn-record-'+slot).disabled = false;

  if(!studioMediaRecorder) return;
  const mr   = studioMediaRecorder;
  const mime = mr.mimeType || getSupportedMime() || 'audio/webm';
  studioMediaRecorder = null;

  if(mr.state !== 'inactive'){
    await new Promise(resolve => { mr.addEventListener('stop', resolve, {once:true}); mr.stop(); });
  }
  if(studioStream){ studioStream.getTracks().forEach(t=>t.stop()); studioStream=null; }

  if(!save || !studioRecordChunks.length) return;
  const ext  = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(studioRecordChunks, {type: mime});
  const path = `vg_audio/${currentProject.id}/${slot}.${ext}`;
  try {
    toast('Wird hochgeladen …','info');
    const storRef = ref(stor, path);
    await uploadBytes(storRef, blob);
    const url = await getDownloadURL(storRef);
    const update = {[slot+'Path']: path, [slot+'Url']: url};
    await updateDoc(doc(db,'vg_projects',currentProject.id), update);
    currentProject[slot+'Path'] = path;
    currentProject[slot+'Url'] = url;
    if(slot==='intro'){ studioIntroUrl=url; studioIntroBlob=blob; }
    if(slot==='outro'){ studioOutroUrl=url; studioOutroBlob=blob; }
    updateAudioSlot(slot, url);
    toast('Aufnahme gespeichert! ✅','success');
  } catch(e){ toast('Upload fehlgeschlagen: '+e.message,'error'); }
}

async function handleStudioUpload(e, slot){
  const file = e.target.files[0];
  if(!file) return;
  const ext  = file.name.split('.').pop();
  const path = `vg_audio/${currentProject.id}/${slot}.${ext}`;
  try {
    toast('Wird hochgeladen …','info');
    const storRef = ref(stor, path);
    await uploadBytes(storRef, file);
    const url = await getDownloadURL(storRef);
    const update = {[slot+'Path']: path, [slot+'Url']: url};
    await updateDoc(doc(db,'vg_projects',currentProject.id), update);
    currentProject[slot+'Path'] = path;
    currentProject[slot+'Url'] = url;
    if(slot==='intro') studioIntroUrl=url;
    if(slot==='outro') studioOutroUrl=url;
    if(slot==='music') studioMusicUrl=url;
    updateAudioSlot(slot, url);
    toast(`${slot.charAt(0).toUpperCase()+slot.slice(1)} hochgeladen! ✅`,'success');
  } catch(e){ toast('Upload fehlgeschlagen: '+e.message,'error'); }
  e.target.value='';
}

/* ── STUDIO RENDER ── */
function renderStudio(){
  renderStudioIntroOutro();
  renderStudioOrder();
  /* music volume */
  const volSlider = $$('music-vol');
  const volVal    = $$('music-vol-val');
  volSlider.oninput = () => setText('music-vol-val', volSlider.value+'%');
  /* pause slider */
  const pauseSlider = $$('export-pause');
  pauseSlider.oninput = () => setText('export-pause-val', pauseSlider.value+'s');
}

function renderStudioOrder(){
  const list = $$('studio-order-list');
  const sorted = [...recordings].sort((a,b) => {
    if(a.isPinned && !b.isPinned) return -1;
    if(!a.isPinned && b.isPinned) return 1;
    return (a.sortOrder??99)-(b.sortOrder??99);
  });
  if(!sorted.length){
    list.innerHTML = '<p style="font-size:.82rem;color:var(--tx3)">Noch keine Aufnahmen vorhanden.</p>';
    return;
  }
  const prefix = [];
  if(studioIntroUrl) prefix.push({label:'🎬 Intro', color:'#e11d48'});
  const suffix = [];
  if(studioOutroUrl) suffix.push({label:'🎬 Outro', color:'#d97706'});

  list.innerHTML = [
    ...prefix.map(x=>`<div class="order-item"><span style="font-size:.9rem">${x.label}</span></div>`),
    ...sorted.map((r,i)=>`
      <div class="order-item" data-oid="${r.id}">
        <span class="order-badge">#${i+1}</span>
        <span style="flex:1">${esc(r.participantName)}</span>
        <span style="font-size:.75rem;color:var(--tx3)">${formatDuration(r.duration||0)}</span>
        ${r.isPinned?'<span class="chip chip-amber" style="font-size:.65rem">📌</span>':''}
      </div>
    `),
    ...suffix.map(x=>`<div class="order-item"><span style="font-size:.9rem">${x.label}</span></div>`),
  ].join('');
}

/* ═══════════════════════════════════════════════════════
   AUDIO MERGE & EXPORT
═══════════════════════════════════════════════════════ */
async function mergeAndExport(download){
  const sortedRecs = [...recordings].sort((a,b)=>{
    if(a.isPinned && !b.isPinned) return -1;
    if(!a.isPinned && b.isPinned) return 1;
    return (a.sortOrder??99)-(b.sortOrder??99);
  });

  if(!sortedRecs.length){ toast('Keine Aufnahmen vorhanden.','error'); return; }

  const pauseSec  = parseFloat($$('export-pause').value)||1.5;
  const musicVol  = parseInt($$('music-vol').value)/100;

  show('export-progress-wrap');
  hide('export-result-wrap');
  setExportProgress(0, 'Aufnahmen werden geladen …');

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({sampleRate:44100});

    /* 1. Fetch & decode all segments */
    const urls = [];
    if(studioIntroUrl) urls.push({url:studioIntroUrl, tag:'intro'});
    sortedRecs.forEach(r=>{ if(r.audioUrl) urls.push({url:r.audioUrl, tag:'rec'}); });
    if(studioOutroUrl) urls.push({url:studioOutroUrl, tag:'outro'});

    const buffers = [];
    for(let i=0; i<urls.length; i++){
      setExportProgress(Math.round((i/urls.length)*50), `Aufnahme ${i+1} von ${urls.length} wird verarbeitet …`);
      const ab = await fetchAudioBuffer(urls[i].url);
      const decoded = await ctx.decodeAudioData(ab);
      buffers.push(decoded);
    }

    /* 2. Normalize each buffer */
    buffers.forEach(b => normalizeBuffer(b));

    /* 3. Calculate total length */
    const pauseSamples = Math.floor(pauseSec * 44100);
    let totalSamples = 0;
    buffers.forEach((b,i) => {
      totalSamples += b.length;
      if(i < buffers.length-1) totalSamples += pauseSamples;
    });

    /* 4. Mix */
    setExportProgress(55, 'Stimmen werden zusammengefügt …');
    const numCh = 2;
    const outBuf = ctx.createBuffer(numCh, totalSamples, 44100);
    let offset = 0;
    for(let i=0; i<buffers.length; i++){
      const src = buffers[i];
      for(let ch=0; ch<numCh; ch++){
        const srcData = ch < src.numberOfChannels ? src.getChannelData(ch) : src.getChannelData(0);
        outBuf.getChannelData(ch).set(srcData, offset);
      }
      offset += src.length;
      if(i < buffers.length-1) offset += pauseSamples;
    }

    /* 5. Mix background music if available */
    if(studioMusicUrl && musicVol > 0){
      setExportProgress(65, 'Musik wird eingeblendet …');
      const musicAb  = await fetchAudioBuffer(studioMusicUrl);
      const musicBuf = await ctx.decodeAudioData(musicAb);
      for(let ch=0; ch<numCh; ch++){
        const outData   = outBuf.getChannelData(ch);
        const musData   = ch < musicBuf.numberOfChannels ? musicBuf.getChannelData(ch) : musicBuf.getChannelData(0);
        for(let i=0; i<outData.length; i++){
          outData[i] = Math.max(-1, Math.min(1, outData[i] + musData[i%musData.length]*musicVol));
        }
      }
    }

    /* 6. Apply fade in/out */
    applyFades(outBuf, Math.min(4410, Math.floor(outBuf.length*0.02)));

    /* 7. Encode to WAV */
    setExportProgress(80, 'Audio-Datei wird erstellt …');
    const wavBuf  = audioBufferToWav(outBuf);
    const wavBlob = new Blob([wavBuf], {type:'audio/wav'});
    setExportProgress(95, 'Wird hochgeladen …');

    /* 8. Store or download */
    if(download){
      const url = URL.createObjectURL(wavBlob);
      if(exportBlobUrl) URL.revokeObjectURL(exportBlobUrl);
      exportBlobUrl = url;

      /* upload to storage */
      const timestamp = Date.now();
      const path = `vg_audio/${currentProject.id}/exports/final_${timestamp}.wav`;
      await uploadBytes(ref(stor, path), wavBlob);
      const dlUrl = await getDownloadURL(ref(stor, path));

      await addDoc(collection(db,'vg_exports'),{
        projectId: currentProject.id,
        finalAudioPath: path,
        finalAudioUrl: dlUrl,
        createdAt: serverTimestamp(),
      });

      /* update giftToken export URL */
      await updateDoc(doc(db,'vg_projects',currentProject.id),{
        lastExportUrl: dlUrl,
        lastExportPath: path,
        updatedAt: serverTimestamp(),
      });
      currentProject.lastExportUrl = dlUrl;

      setExportProgress(100,'Fertig! 🎉');
      hide('export-progress-wrap');
      show('export-result-wrap');

      const dlBtn = $$('export-download-btn');
      dlBtn.href = url;
      dlBtn.download = `audio-geschenk-${currentProject.recipientName}-${timestamp}.wav`;
      toast('Das Audio-Geschenk ist fertig! 🎉','success');
    } else {
      /* preview */
      setExportProgress(100,'Vorschau wird gestartet …');
      hide('export-progress-wrap');
      const url = URL.createObjectURL(wavBlob);
      if(exportBlobUrl) URL.revokeObjectURL(exportBlobUrl);
      exportBlobUrl = url;
      const audio = $$('studio-preview-audio');
      audio.src = url;
      audio.play();
      toast('Vorschau läuft …','info');
    }

  } catch(e){
    hide('export-progress-wrap');
    toast('Export fehlgeschlagen – bitte nochmal versuchen.','error');
    console.error(e);
  }
}

function setExportProgress(pct, msg){
  setText('export-progress-msg', msg);
  $$('export-bar-fill').style.width = pct+'%';
}

async function fetchAudioBuffer(url){
  const r = await fetch(url);
  return r.arrayBuffer();
}

function normalizeBuffer(buffer, target=0.88){
  let max=0;
  for(let ch=0; ch<buffer.numberOfChannels; ch++){
    const d = buffer.getChannelData(ch);
    for(let i=0; i<d.length; i++) if(Math.abs(d[i])>max) max=Math.abs(d[i]);
  }
  if(max>0 && max<target){
    const gain = target/max;
    for(let ch=0; ch<buffer.numberOfChannels; ch++){
      const d = buffer.getChannelData(ch);
      for(let i=0; i<d.length; i++) d[i]=Math.max(-1,Math.min(1,d[i]*gain));
    }
  }
}

function applyFades(buffer, fadeSamples){
  if(fadeSamples<=0) return;
  for(let ch=0; ch<buffer.numberOfChannels; ch++){
    const d = buffer.getChannelData(ch);
    for(let i=0; i<Math.min(fadeSamples,d.length); i++) d[i]*=i/fadeSamples;
    for(let i=Math.max(0,d.length-fadeSamples); i<d.length; i++) d[i]*=(d.length-i)/fadeSamples;
  }
}

function audioBufferToWav(buffer){
  const numCh = buffer.numberOfChannels;
  const sr    = buffer.sampleRate;
  const len   = buffer.length;
  const dataLen = len * numCh * 2;
  const wavBuf  = new ArrayBuffer(44 + dataLen);
  const view    = new DataView(wavBuf);
  const ws = (offset,str) => { for(let i=0;i<str.length;i++) view.setUint8(offset+i,str.charCodeAt(i)); };
  ws(0,'RIFF'); view.setUint32(4,36+dataLen,true); ws(8,'WAVE');
  ws(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,numCh,true); view.setUint32(24,sr,true);
  view.setUint32(28,sr*numCh*2,true); view.setUint16(32,numCh*2,true);
  view.setUint16(34,16,true); ws(36,'data'); view.setUint32(40,dataLen,true);
  let offset=44;
  for(let i=0;i<len;i++){
    for(let ch=0;ch<numCh;ch++){
      const s=Math.max(-1,Math.min(1,buffer.getChannelData(ch)[i]));
      view.setInt16(offset,s<0?s*0x8000:s*0x7FFF,true); offset+=2;
    }
  }
  return wavBuf;
}

function getSupportedMime(){
  const types=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  for(const t of types) if(MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

/* ═══════════════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════════════ */
function renderSettings(){
  const p = currentProject;
  $$('settings-recipient').value = p.recipientName||'';
  $$('settings-occasion').value  = p.occasion||'geburtstag';
  $$('settings-delivery').value  = p.deliveryDate||'';
  $$('settings-language').value  = p.language||'de';
  $$('settings-note').value      = p.adminNote||'';
  $$('settings-maxrec').value    = p.maxRecordingSeconds||180;
  renderCustomPrompts();
}

function renderCustomPrompts(){
  const list = $$('custom-prompts-list');
  const prompts = currentProject.customPrompts||[];
  if(!prompts.length){
    list.innerHTML='<p style="font-size:.82rem;color:var(--tx3);margin-bottom:.75rem">Noch keine eigenen Prompts.</p>';
    return;
  }
  list.innerHTML = prompts.map((p,i)=>`
    <div class="prompt-item">
      <span class="prompt-item-text">${esc(p)}</span>
      <button class="btn btn-danger btn-sm" data-del-prompt="${i}">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-del-prompt]').forEach(btn=>{
    btn.onclick = async () => {
      const prompts = [...(currentProject.customPrompts||[])];
      prompts.splice(parseInt(btn.dataset.delPrompt),1);
      await updateDoc(doc(db,'vg_projects',currentProject.id),{customPrompts:prompts});
      currentProject.customPrompts = prompts;
      renderCustomPrompts();
    };
  });
}

function bindSettings(){
  $$('btn-save-settings').onclick = async () => {
    const update = {
      recipientName:       $$('settings-recipient').value.trim(),
      occasion:            $$('settings-occasion').value,
      deliveryDate:        $$('settings-delivery').value||null,
      language:            $$('settings-language').value,
      adminNote:           $$('settings-note').value.trim(),
      maxRecordingSeconds: parseInt($$('settings-maxrec').value)||180,
      updatedAt:           serverTimestamp(),
    };
    if(!update.recipientName){ toast('Name darf nicht leer sein.','error'); return; }
    await updateDoc(doc(db,'vg_projects',currentProject.id), update);
    Object.assign(currentProject, update);
    renderDashboard();
    toast('Gespeichert! ✅','success');
  };

  $$('btn-add-prompt').onclick = async () => {
    const text = $$('new-prompt-text').value.trim();
    if(!text) return;
    const prompts = [...(currentProject.customPrompts||[]), text];
    await updateDoc(doc(db,'vg_projects',currentProject.id),{customPrompts:prompts});
    currentProject.customPrompts = prompts;
    $$('new-prompt-text').value='';
    renderCustomPrompts();
    toast('Prompt hinzugefügt.','success');
  };
  $$('new-prompt-text').addEventListener('keydown', e=>{ if(e.key==='Enter') $$('btn-add-prompt').click(); });

  $$('btn-delete-project').onclick = async () => {
    const ok = await confirm('⚠️','Projekt löschen?',`„${currentProject.recipientName}" wird dauerhaft gelöscht – alle Aufnahmen, Daten und Exporte.`);
    if(!ok) return;
    try {
      /* delete recordings */
      for(const r of recordings){
        if(r.audioPath) await deleteObject(ref(stor,r.audioPath)).catch(()=>{});
        await deleteDoc(doc(db,'vg_recordings',r.id));
      }
      /* delete project media */
      for(const field of ['introPath','outroPath','musicPath','lastExportPath']){
        if(currentProject[field]) await deleteObject(ref(stor,currentProject[field])).catch(()=>{});
      }
      await deleteDoc(doc(db,'vg_projects',currentProject.id));
      toast('Projekt gelöscht.','success');
      currentProject=null; recordings=[]; participants=[];
      await loadProjects();
    } catch(e){ toast('Fehler: '+e.message,'error'); }
  };
}

/* ═══════════════════════════════════════════════════════
   GIFT PAGE
═══════════════════════════════════════════════════════ */
function bindGiftPage(){
  $$('btn-create-gift-page').onclick = () => {
    const p   = currentProject;
    const url = `${location.origin}${location.pathname.replace('voicegift.html','voicegift-gift.html')}?token=${p.giftToken}`;
    show('gift-page-box');
    $$('gift-page-url').value = url;
    $$('btn-copy-gift').onclick = () => {
      navigator.clipboard.writeText(url).then(()=>toast('Geschenklink kopiert! 🎁','success'));
    };
  };
}

/* ═══════════════════════════════════════════════════════
   EXPORT BIND
═══════════════════════════════════════════════════════ */
function bindExport(){
  const doBtn      = $$('btn-do-export');
  const previewBtn = $$('btn-preview-export');
  const runExport  = async (download) => {
    doBtn.disabled = true;
    previewBtn.disabled = true;
    try { await mergeAndExport(download); }
    finally { doBtn.disabled = false; previewBtn.disabled = false; }
  };
  doBtn.onclick      = () => runExport(true);
  previewBtn.onclick = () => runExport(false);
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════ */
function bindNav(){
  $$('btn-back-projects').onclick = () => {
    currentProject=null; recordings=[]; participants=[];
    exportBlobUrl=null;
    hide('export-result-wrap');
    loadProjects();
  };
}

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
function bindAll(){
  bindLogin();
  bindCreateProject();
  bindTabs();
  bindParticipants();
  bindStudioRecording();
  bindSettings();
  bindGiftPage();
  bindExport();
  bindNav();
}

onAuthStateChanged(auth, user => {
  const isAdmin = user && !user.isAnonymous;
  if(isAdmin){
    showView('projects');
    loadProjects();
  } else {
    showView('login');
    const btn = $$('btn-login');
    if(btn){ btn.textContent = 'Anmelden'; btn.disabled = false; }
  }
});

bindAll();
