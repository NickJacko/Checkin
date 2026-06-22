'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, query, where, getDocs, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

const OCCASION_EMOJI = {
  geburtstag:'🎂', hochzeit:'💍', abschied:'👋',
  ruhestand:'🌅', jubilaeum:'🏅', genesung:'💛', anderes:'🎁',
};
const OCCASION_LABELS_DE = {
  geburtstag:'Geburtstag', hochzeit:'Hochzeit', abschied:'Abschied',
  ruhestand:'Ruhestand', jubilaeum:'Jubiläum', genesung:'Gute Besserung', anderes:'Besonderer Anlass',
};
const OCCASION_LABELS_EN = {
  geburtstag:'Birthday', hochzeit:'Wedding', abschied:'Farewell',
  ruhestand:'Retirement', jubilaeum:'Anniversary', genesung:'Get Well Soon', anderes:'Special Occasion',
};

function $$(id){ return document.getElementById(id); }
function show(id){ $$(id)?.classList.remove('hidden'); }
function hide(id){ $$(id)?.classList.add('hidden'); }
function setText(id, v){ const el=$$(id); if(el) el.textContent=String(v); }

function formatTime(s){
  if(!isFinite(s)) return '0:00';
  const m=Math.floor(s/60), sec=Math.floor(s%60);
  return `${m}:${String(sec).padStart(2,'0')}`;
}

async function init(){
  const params = new URLSearchParams(location.search);
  const token  = params.get('token');
  if(!token){ showError('Dieser Link ist ungültig. Bitte wende dich an die Person, die dir das Geschenk geschickt hat.'); return; }

  try {
    /* Find project by giftToken */
    const q    = query(collection(db,'vg_projects'), where('giftToken','==',token));
    const snap = await getDocs(q);
    if(snap.empty){ showError('Dieser Link ist ungültig oder das Geschenk wurde noch nicht fertiggestellt.'); return; }

    const project = { id: snap.docs[0].id, ...snap.docs[0].data() };

    /* Find latest export */
    const exportsSnap = await getDocs(
      query(collection(db,'vg_exports'),
        where('projectId','==',project.id),
        orderBy('createdAt','desc'),
        limit(1))
    ).catch(async () => {
      return getDocs(query(collection(db,'vg_exports'), where('projectId','==',project.id)));
    });

    let audioUrl = project.lastExportUrl || null;
    if(!audioUrl && !exportsSnap.empty){
      const exp = exportsSnap.docs[0].data();
      audioUrl = exp.finalAudioUrl || null;
    }

    if(!audioUrl){ showError('Das Geschenk wird gerade noch vorbereitet. Bitte versuche es in ein paar Minuten erneut.'); return; }

    renderGift(project, audioUrl);
    hide('view-loading');
    show('view-gift');
    setupPlayer(audioUrl);

  } catch(e){
    showError('Etwas ist schiefgelaufen. Bitte lade die Seite neu.');
  }
}

function showError(msg){
  setText('error-msg', msg);
  hide('view-loading');
  show('view-error');
}

function renderGift(project, audioUrl){
  const lang = project.language === 'en';
  const labels = lang ? OCCASION_LABELS_EN : OCCASION_LABELS_DE;

  setText('gift-emoji', OCCASION_EMOJI[project.occasion] || '🎁');
  setText('gift-from-label', lang ? 'A gift for' : 'Ein Geschenk für');
  setText('gift-recipient', project.recipientName || '');
  setText('gift-occasion', labels[project.occasion] || project.occasion || '');

  if(project.deliveryDate){
    const d = new Date(project.deliveryDate);
    setText('gift-date', d.toLocaleDateString(lang?'en-GB':'de-DE',{day:'numeric',month:'long',year:'numeric'}));
  }

  if(project.adminNote){
    setText('gift-message', project.adminNote);
    show('gift-message');
  }

  document.title = lang
    ? `Your audio gift – ${project.recipientName} 🎁`
    : `Dein Audio-Geschenk – ${project.recipientName} 🎁`;

  /* download button */
  const dlBtn = $$('btn-download');
  dlBtn.href = audioUrl;
  dlBtn.download = `audio-geschenk-${project.recipientName}.wav`;
  dlBtn.setAttribute('target','_blank');
  show('btn-download');
}

function setupPlayer(audioUrl){
  const audio    = $$('gift-audio');
  const playBtn  = $$('btn-play-main');
  const seekBar  = $$('seek-bar');
  const volBar   = $$('vol-bar');
  const curTime  = $$('player-current');
  const durTime  = $$('player-duration');

  audio.src = audioUrl;

  /* play/pause */
  playBtn.onclick = () => {
    if(audio.paused){ audio.play(); }
    else { audio.pause(); }
  };

  audio.onplay  = () => { playBtn.textContent='⏸'; playBtn.classList.add('playing'); };
  audio.onpause = () => { playBtn.textContent='▶'; playBtn.classList.remove('playing'); };
  audio.onended = () => { playBtn.textContent='▶'; playBtn.classList.remove('playing'); };

  /* time update */
  audio.ontimeupdate = () => {
    setText('player-current', formatTime(audio.currentTime));
    if(audio.duration && isFinite(audio.duration)){
      seekBar.value = (audio.currentTime / audio.duration * 100).toFixed(1);
    }
  };

  audio.onloadedmetadata = () => {
    setText('player-duration', formatTime(audio.duration));
    seekBar.max = 100;
  };

  /* seek */
  seekBar.oninput = () => {
    if(audio.duration) audio.currentTime = audio.duration * seekBar.value / 100;
  };

  /* volume */
  volBar.oninput = () => { audio.volume = volBar.value / 100; };
}

init();
