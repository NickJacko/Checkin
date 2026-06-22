'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, query, where, getDocs, addDoc, updateDoc,
  increment, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCa8VcpRe94gevcyQUF_Zc-e-UNRCowDSc',
  authDomain:        'checkin-9f731.firebaseapp.com',
  projectId:         'checkin-9f731',
  storageBucket:     'checkin-9f731.firebasestorage.app',
  messagingSenderId: '199496624018',
  appId:             '1:199496624018:web:a06afb19294d0635a8034b',
};
const fbApp = initializeApp(FIREBASE_CONFIG);
const db    = getFirestore(fbApp);
const stor  = getStorage(fbApp);

/* ── State ── */
let project        = null;
let mediaRecorder  = null;
let audioChunks    = [];
let recordedBlob   = null;
let recordTimer    = null;
let recordSeconds  = 0;
let isPaused       = false;
let maxSeconds     = 180;
let allPrompts     = [];
let currentPromptIdx = 0;

/* ── Prompts ── */
const PROMPTS_DE = {
  geburtstag: [
    'Welche Erinnerung mit {name} bringt dich immer zum Lächeln?',
    'Was wünschst du {name} für das neue Lebensjahr?',
    'Was macht {name} so besonders für dich?',
    'Welche verrückte oder lustige Geschichte verbindet euch?',
    'Was möchtest du {name} schon lange einmal sagen?',
    'Was bewunderst du an {name} am meisten?',
    'Welchen Moment mit {name} wirst du nie vergessen?',
    'Was hat {name} dir einmal gegeben, das du nicht vergessen kannst?',
  ],
  hochzeit: [
    'Was wünschst du {name} für die gemeinsame Zukunft?',
    'Welche Eigenschaft liebst du an {name}?',
    'Was ist dein schönstes Erlebnis mit {name}?',
    'Welchen Ratschlag möchtest du dem Brautpaar mitgeben?',
    'Was verbindet dich ganz besonders mit {name}?',
    'Was macht {name} zu einem besonderen Menschen?',
  ],
  abschied: [
    'Was wird dir an {name} am meisten fehlen?',
    'Was wünschst du {name} für den neuen Weg?',
    'Welche Eigenschaft wirst du an {name} am meisten vermissen?',
    'Was war ein unvergesslicher Moment mit {name}?',
    'Was möchtest du {name} auf den Weg mitgeben?',
    'Was hat {name} in deinem Leben bewegt?',
  ],
  ruhestand: [
    'Was hat {name} in all den Jahren besonders gemacht?',
    'Welche Eigenschaft wirst du in der Zusammenarbeit mit {name} vermissen?',
    'Was wünschst du {name} für den Ruhestand?',
    'Was war ein unvergessliches Erlebnis mit {name}?',
    'Welchen Ratschlag gibst du {name} für die Zeit nach der Arbeit?',
  ],
  jubilaeum: [
    'Was verbindet euch über all die Jahre?',
    'Was schätzt du an {name} besonders?',
    'Was war dein liebster Moment der gemeinsamen Zeit?',
    'Welchen Wunsch hast du für die nächsten Jahre?',
    'Was hast du durch {name} gelernt oder erlebt?',
  ],
  genesung: [
    'Was wünschst du {name} für eine schnelle Genesung?',
    'Was liebst du besonders an {name}?',
    'Welche schöne Erinnerung denkst du an, wenn du an {name} denkst?',
    'Was möchtest du {name} Mut machendes mitgeben?',
    'Was machst du mit {name} als erstes, wenn es ihr/ihm besser geht?',
  ],
  anderes: [
    'Welche Erinnerung mit {name} wirst du nie vergessen?',
    'Was möchtest du {name} schon lange einmal sagen?',
    'Welche Eigenschaft schätzt du an {name} am meisten?',
    'Was wünschst du {name} für die Zukunft?',
    'Was hat {name} in deinem Leben bewirkt?',
    'Wann hast du zuletzt an {name} gedacht und warum?',
  ],
};
const PROMPTS_EN = {
  geburtstag: [
    'What memory with {name} always makes you smile?',
    'What do you wish {name} for this new year of life?',
    'What makes {name} so special to you?',
    'What\'s a funny or memorable story you share with {name}?',
    'What would you love to finally say to {name}?',
  ],
  hochzeit: [
    'What do you wish {name} for their future together?',
    'What quality do you love most about {name}?',
    'What is your best memory with {name}?',
    'What advice would you give the couple?',
  ],
  abschied: [
    'What will you miss most about {name}?',
    'What do you wish {name} on their new journey?',
    'What was an unforgettable moment you shared with {name}?',
  ],
  ruhestand: [
    'What has {name} done especially well over the years?',
    'What do you wish {name} in retirement?',
    'What was a memorable experience with {name}?',
  ],
  jubilaeum: [
    'What connects you over all these years?',
    'What was your favourite shared moment?',
    'What do you wish for the next years?',
  ],
  genesung: [
    'What do you wish {name} for a speedy recovery?',
    'What do you want to say to cheer {name} up?',
    'What\'s the first thing you\'ll do together when {name} is well again?',
  ],
  anderes: [
    'What memory with {name} will you never forget?',
    'What do you want to say to {name}?',
    'What do you wish {name} for the future?',
    'What has {name} meant in your life?',
  ],
};

const OCCASION_EMOJI = {
  geburtstag:'🎂', hochzeit:'💍', abschied:'👋',
  ruhestand:'🌅', jubilaeum:'🏅', genesung:'💛', anderes:'🎁',
};
const OCCASION_LABELS = {
  geburtstag:'Geburtstag', hochzeit:'Hochzeit', abschied:'Abschied',
  ruhestand:'Ruhestand', jubilaeum:'Jubiläum', genesung:'Gute Besserung', anderes:'Besonderer Anlass',
};

/* ── Utils ── */
function $$(id){ return document.getElementById(id); }
function show(id){ $$(id)?.classList.remove('hidden'); }
function hide(id){ $$(id)?.classList.add('hidden'); }
function setText(id, v){ const el=$$(id); if(el) el.textContent=String(v); }

function formatTime(s){
  const m=Math.floor(s/60), sec=s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function getSupportedMime(){
  const types=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  for(const t of types) if(MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

function uuid(){
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
}

/* ── Init project ── */
async function init(){
  const params = new URLSearchParams(location.search);
  const token  = params.get('token');
  if(!token){ showError('Kein Einladungstoken gefunden.'); return; }

  try {
    const q    = query(collection(db,'vg_projects'), where('inviteToken','==',token));
    const snap = await getDocs(q);
    if(snap.empty){ showError('Dieser Einladungslink ist ungültig oder abgelaufen.'); return; }
    project = { id: snap.docs[0].id, ...snap.docs[0].data() };

    maxSeconds = project.maxRecordingSeconds || 180;
    setupPrompts();
    renderProject();
    hide('view-loading');
    show('view-record');
    bindAll();
  } catch(e){
    showError('Fehler beim Laden des Projekts: '+e.message);
  }
}

function showError(msg){
  setText('error-msg', msg);
  hide('view-loading');
  show('view-error');
}

function setupPrompts(){
  const lang = project.language || 'de';
  const occ  = project.occasion || 'anderes';
  const base = lang === 'en'
    ? (PROMPTS_EN[occ] || PROMPTS_EN.anderes)
    : (PROMPTS_DE[occ] || PROMPTS_DE.anderes);
  const custom = project.customPrompts || [];
  allPrompts = [...base, ...custom];
  shuffleArray(allPrompts);
}

function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

function renderProject(){
  const p = project;
  const emoji = OCCASION_EMOJI[p.occasion] || '🎁';
  setText('rec-emoji', emoji);
  const lang = p.language === 'en';
  setText('rec-for-label', lang ? 'Message for' : 'Nachricht für');
  setText('rec-gift-name', p.recipientName || '');
  setText('rec-occasion', OCCASION_LABELS[p.occasion] || p.occasion || '');
  setText('rec-max-hint', `Max. ${formatTime(maxSeconds)}`);
  setText('rec-context-line', lang
    ? `Leave a short voice message for ${p.recipientName} – directly in your browser, no app or login needed.`
    : `Hinterlasse eine kurze Sprachnachricht für ${p.recipientName} – direkt im Browser, ohne App oder Login.`);

  if(p.adminNote){
    setText('rec-admin-note', p.adminNote);
    show('rec-admin-note');
  }

  showNextPrompt();
}

function showNextPrompt(){
  if(!allPrompts.length) return;
  const raw = allPrompts[currentPromptIdx % allPrompts.length];
  const text = raw.replace(/\{name\}/g, project.recipientName || '');
  setText('rec-prompt-text', text);
  currentPromptIdx = (currentPromptIdx + 1) % allPrompts.length;
}

/* ── Recording ── */
async function startRecording(){
  audioChunks = [];
  isPaused = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    const mime = getSupportedMime();
    mediaRecorder = new MediaRecorder(stream, mime ? {mimeType:mime} : undefined);
    mediaRecorder.ondataavailable = e => { if(e.data.size>0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t=>t.stop());
      const mime2 = mediaRecorder.mimeType || 'audio/webm';
      recordedBlob = new Blob(audioChunks, {type:mime2});
      onRecordingDone();
    };
    mediaRecorder.start(250);
    recordSeconds = 0;
    startTimer();
    setRecState('recording');
  } catch(e){
    alert('Kein Mikrofon-Zugriff.\n\nBitte erlaube in deinem Browser den Mikrofon-Zugriff und lade die Seite danach neu.');
  }
}

function pauseRecording(){
  if(!mediaRecorder || isPaused) return;
  mediaRecorder.pause();
  isPaused = true;
  clearInterval(recordTimer);
  setRecState('paused');
}

function resumeRecording(){
  if(!mediaRecorder || !isPaused) return;
  mediaRecorder.resume();
  isPaused = false;
  startTimer();
  setRecState('recording');
}

function stopRecording(){
  clearInterval(recordTimer);
  if(mediaRecorder && mediaRecorder.state !== 'inactive'){
    mediaRecorder.stop();
  }
}

function restartRecording(){
  clearInterval(recordTimer);
  if(mediaRecorder && mediaRecorder.state !== 'inactive'){
    mediaRecorder.stop();
  }
  recordedBlob = null;
  audioChunks  = [];
  hide('rec-playback');
  $$('btn-submit').disabled = true;
  recordSeconds = 0;
  setText('rec-timer', '0:00');
  $$('rec-timer').classList.remove('over-limit');
  setRecState('idle');
}

function startTimer(){
  clearInterval(recordTimer);
  recordTimer = setInterval(()=>{
    recordSeconds++;
    setText('rec-timer', formatTime(recordSeconds));
    const over = recordSeconds >= maxSeconds;
    $$('rec-timer').classList.toggle('over-limit', over);
    if(over){ stopRecording(); }
  }, 1000);
}

function onRecordingDone(){
  clearInterval(recordTimer);
  setRecState('done');
  /* show playback */
  const url = URL.createObjectURL(recordedBlob);
  $$('rec-playback-audio').src = url;
  show('rec-playback');
  /* enable submit if name filled */
  checkSubmitReady();
}

let recState = 'idle'; // idle | recording | paused | done

function setRecState(state){
  recState = state;
  const btn = $$('btn-rec-main');
  const lbl = $$('rec-state-label');
  const pauseBtn   = $$('btn-rec-pause');
  const stopBtn    = $$('btn-rec-stop');
  const restartBtn = $$('btn-rec-restart');
  const lang = (project?.language === 'en');

  btn.classList.remove('recording','paused','has-recording');
  hide('btn-rec-pause'); hide('btn-rec-stop'); hide('btn-rec-restart');

  if(state === 'idle'){
    btn.textContent = '🎙';
    lbl.textContent = lang ? 'Tap to start recording' : 'Tippe, um die Aufnahme zu starten';
  } else if(state === 'recording'){
    btn.textContent = '⏸';
    btn.classList.add('recording');
    lbl.textContent = lang ? 'Recording … tap to pause' : 'Aufnahme läuft … tippe zum Pausieren';
    show('btn-rec-pause'); show('btn-rec-stop');
  } else if(state === 'paused'){
    btn.textContent = '▶';
    btn.classList.add('paused');
    lbl.textContent = lang ? 'Paused – tap to continue' : 'Pausiert – tippe, um fortzufahren';
    show('btn-rec-pause'); show('btn-rec-stop');
    pauseBtn.textContent = lang ? '▶ Weiter' : '▶ Weiter';
  } else if(state === 'done'){
    btn.textContent = '✓';
    btn.classList.add('has-recording');
    lbl.textContent = lang ? 'Done! Listen below or re-record.' : 'Super! Hör sie dir an oder nimm sie neu auf.';
    show('btn-rec-restart');
  }
}

function checkSubmitReady(){
  const name = $$('rec-name').value.trim();
  const ready = !!recordedBlob && name.length > 0;
  $$('btn-submit').disabled = !ready;
  if(!name && recordedBlob){
    show('submit-name-hint');
  } else {
    hide('submit-name-hint');
  }
}

/* ── Submit ── */
async function submitRecording(){
  const name = $$('rec-name').value.trim();
  const note = $$('rec-note').value.trim();
  if(!name || !recordedBlob){ return; }

  $$('btn-submit').disabled = true;
  show('upload-progress');

  try {
    /* Upload audio */
    const ext = recordedBlob.type.includes('ogg') ? 'ogg'
              : recordedBlob.type.includes('mp4')  ? 'mp4' : 'webm';
    const filename = `rec_${uuid()}.${ext}`;
    const path     = `vg_audio/${project.inviteToken}/${filename}`;
    const storRef  = ref(stor, path);

    $$('upload-bar-fill').style.width = '50%';
    await uploadBytes(storRef, recordedBlob);
    const audioUrl = await getDownloadURL(storRef);
    $$('upload-bar-fill').style.width = '80%';

    /* Store metadata */
    const recSnap = await getDocs(query(collection(db,'vg_recordings'), where('projectId','==',project.id)));
    const sortOrder = recSnap.size; // append to end

    await addDoc(collection(db,'vg_recordings'),{
      projectId:       project.id,
      inviteToken:     project.inviteToken,
      participantName: name,
      audioPath:       path,
      audioUrl:        audioUrl,
      duration:        recordSeconds,
      note:            note || null,
      isPinned:        false,
      sortOrder:       sortOrder,
      createdAt:       serverTimestamp(),
    });
    await updateDoc(doc(db,'vg_projects',project.id), {recordCount: increment(1)}).catch(()=>{});

    $$('upload-bar-fill').style.width = '100%';
    await new Promise(r=>setTimeout(r,400));

    /* Thank you */
    hide('view-record');
    const lang = project.language === 'en';
    setText('thanks-msg', lang
      ? `Thank you! Your voice will be part of a very personal audio gift for ${project.recipientName}.`
      : `Deine Stimme macht das Geschenk für ${project.recipientName} unvergesslich. Danke, dass du dir die Zeit genommen hast!`);
    show('view-thanks');
  } catch(e){
    hide('upload-progress');
    $$('btn-submit').disabled = false;
    alert('Fehler beim Senden: '+e.message);
  }
}

/* ── Bind ── */
function bindAll(){
  /* main record button */
  $$('btn-rec-main').onclick = () => {
    if(recState==='idle')      startRecording();
    else if(recState==='recording') pauseRecording();
    else if(recState==='paused')    resumeRecording();
    else if(recState==='done')      restartRecording();
  };

  $$('btn-rec-pause').onclick   = () => {
    if(recState==='recording') pauseRecording();
    else resumeRecording();
  };
  $$('btn-rec-stop').onclick    = () => stopRecording();
  $$('btn-rec-restart').onclick = () => restartRecording();
  $$('btn-new-prompt').onclick  = () => showNextPrompt();
  $$('rec-name').addEventListener('input', checkSubmitReady);
  $$('btn-submit').onclick = () => submitRecording();
}

init();
