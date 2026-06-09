/**
 * ChessMaster – chess.js
 * ================================
 * Vollständige Schach-Lern-App als ES-Modul.
 * Verwendet dieselbe Firebase-Instanz wie TypeMaster (app.js).
 * Daten werden unter typemaster_users / USER_ID / chess gespeichert.
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   1. FIREBASE IMPORTS & SETUP  (gleiche Config wie app.js)
═══════════════════════════════════════════════════════ */
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, onSnapshot, collection, query, where,
  getDocs, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ── CHESS ENGINE (inlined) ────────────────────────────────────────── */
const EMPTY  = 0;
const PAWN   = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE  = 1, BLACK  = -1;

const PIECE_UNICODE = {
  [WHITE]:  ['', '♙', '♘', '♗', '♖', '♕', '♔'],
  [BLACK]:  ['', '♟', '♞', '♝', '♜', '♛', '♚'],
};

function emptyBoard() { return Array.from({length:8}, () => Array(8).fill(EMPTY)); }
function cloneBoard(board) { return board.map(row => [...row]); }
function cloneGameState(gs) {
  return { board:cloneBoard(gs.board), turn:gs.turn, castling:{...gs.castling},
           enPassant:gs.enPassant?{...gs.enPassant}:null, halfMove:gs.halfMove, fullMove:gs.fullMove };
}

function parseFen(fen) {
  const state = { board:emptyBoard(), turn:WHITE, castling:{wK:false,wQ:false,bK:false,bQ:false}, enPassant:null, halfMove:0, fullMove:1 };
  if (fen === 'empty') return state;
  const parts=fen.split(' '), rows=parts[0].split('/'), pieceMap={p:PAWN,n:KNIGHT,b:BISHOP,r:ROOK,q:QUEEN,k:KING};
  for (let r=0;r<8;r++) { let f=0; for (const ch of rows[r]) { if(/\d/.test(ch)){f+=+ch;continue;} const lower=ch.toLowerCase(),color=ch===lower?BLACK:WHITE; state.board[r][f]=color*pieceMap[lower]; f++; } }
  state.turn=(parts[1]||'w')==='w'?WHITE:BLACK;
  const cas=parts[2]||'-'; state.castling.wK=cas.includes('K'); state.castling.wQ=cas.includes('Q'); state.castling.bK=cas.includes('k'); state.castling.bQ=cas.includes('q');
  if (parts[3]&&parts[3]!=='-') state.enPassant={r:8-parseInt(parts[3][1]),f:parts[3].charCodeAt(0)-97};
  return state;
}

function algebraicToCoord(sq) { return {f:sq.charCodeAt(0)-97, r:8-parseInt(sq[1])}; }
function coordToAlgebraic(r,f) { return String.fromCharCode(97+f)+(8-r); }

function boardToFen(gs) {
  let fen='';
  for (let r=0;r<8;r++) { let empty=0; for (let f=0;f<8;f++) { const p=gs.board[r][f]; if(p===EMPTY){empty++;continue;} if(empty){fen+=empty;empty=0;} const letters=['','p','n','b','r','q','k'],ch=letters[Math.abs(p)]; fen+=p>0?ch.toUpperCase():ch; } if(empty)fen+=empty; if(r<7)fen+='/'; }
  const turn=gs.turn===WHITE?'w':'b', cas=gs.castling||'-', ep=gs.enPassant?coordToAlgebraic(gs.enPassant.r,gs.enPassant.f):'-';
  return `${fen} ${turn} ${cas} ${ep} ${gs.halfMove||0} ${gs.fullMove||1}`;
}

function buildMoveLabel(gs,fromR,fromF,toR,toF,promoType) {
  const piece=Math.abs(gs.board[fromR][fromF]),letters=['','','N','B','R','Q','K'],prefix=piece===PAWN?'':letters[piece],capture=gs.board[toR][toF]!==EMPTY?'x':'',dest=coordToAlgebraic(toR,toF),promo=piece===PAWN&&(toR===0||toR===7)?'='+letters[promoType]:'';
  return prefix+capture+dest+promo;
}

function pseudoLegalMoves(gs,r,f) {
  const piece=gs.board[r][f]; if(!piece)return[];
  const color=piece>0?WHITE:BLACK, type=Math.abs(piece), moves=[];
  const add=(tr,tf)=>{ if(tr<0||tr>7||tf<0||tf>7)return false; const t=gs.board[tr][tf]; if(t===EMPTY){moves.push({r:tr,f:tf});return true;} if((t>0)!==(color>0)){moves.push({r:tr,f:tf});return false;} return false; };
  const slide=(dr,df)=>{ let tr=r+dr,tf=f+df; while(tr>=0&&tr<=7&&tf>=0&&tf<=7){const t=gs.board[tr][tf];if(t===EMPTY){moves.push({r:tr,f:tf});tr+=dr;tf+=df;continue;}if((t>0)!==(color>0))moves.push({r:tr,f:tf});break;} };
  if(type===PAWN){const dir=color===WHITE?-1:1,sr=color===WHITE?6:1;if(r+dir>=0&&r+dir<=7&&gs.board[r+dir][f]===EMPTY){moves.push({r:r+dir,f});if(r===sr&&gs.board[r+dir*2][f]===EMPTY)moves.push({r:r+dir*2,f});}for(const df of[-1,1]){const tf=f+df,tr=r+dir;if(tf<0||tf>7||tr<0||tr>7)continue;const t=gs.board[tr][tf];if(t!==EMPTY&&(t>0)!==(color>0))moves.push({r:tr,f:tf});if(gs.enPassant&&gs.enPassant.r===tr&&gs.enPassant.f===tf)moves.push({r:tr,f:tf,ep:true});}}
  else if(type===KNIGHT){for(const[dr,df]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,f+df);}
  else if(type===BISHOP){for(const[dr,df]of[[-1,-1],[-1,1],[1,-1],[1,1]])slide(dr,df);}
  else if(type===ROOK){for(const[dr,df]of[[-1,0],[1,0],[0,-1],[0,1]])slide(dr,df);}
  else if(type===QUEEN){for(const[dr,df]of[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]])slide(dr,df);}
  else if(type===KING){for(const[dr,df]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])add(r+dr,f+df);
    if(color===WHITE&&r===7){if(gs.castling.wK&&gs.board[7][5]===EMPTY&&gs.board[7][6]===EMPTY&&!isSquareAttacked(gs,7,4,BLACK)&&!isSquareAttacked(gs,7,5,BLACK)&&!isSquareAttacked(gs,7,6,BLACK))moves.push({r:7,f:6,castle:'wK'});if(gs.castling.wQ&&gs.board[7][3]===EMPTY&&gs.board[7][2]===EMPTY&&gs.board[7][1]===EMPTY&&!isSquareAttacked(gs,7,4,BLACK)&&!isSquareAttacked(gs,7,3,BLACK)&&!isSquareAttacked(gs,7,2,BLACK))moves.push({r:7,f:2,castle:'wQ'});}
    if(color===BLACK&&r===0){if(gs.castling.bK&&gs.board[0][5]===EMPTY&&gs.board[0][6]===EMPTY&&!isSquareAttacked(gs,0,4,WHITE)&&!isSquareAttacked(gs,0,5,WHITE)&&!isSquareAttacked(gs,0,6,WHITE))moves.push({r:0,f:6,castle:'bK'});if(gs.castling.bQ&&gs.board[0][3]===EMPTY&&gs.board[0][2]===EMPTY&&gs.board[0][1]===EMPTY&&!isSquareAttacked(gs,0,4,WHITE)&&!isSquareAttacked(gs,0,3,WHITE)&&!isSquareAttacked(gs,0,2,WHITE))moves.push({r:0,f:2,castle:'bQ'});}}
  return moves;
}

function isSquareAttacked(gs,r,f,byColor) {
  const board=gs.board,pd=byColor===WHITE?1:-1;
  for(const df of[-1,1]){const pr=r+pd,pf=f+df;if(pr>=0&&pr<=7&&pf>=0&&pf<=7){const p=board[pr][pf];if(p!==EMPTY&&(p>0)===(byColor>0)&&Math.abs(p)===PAWN)return true;}}
  for(const[dr,df]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){const nr=r+dr,nf=f+df;if(nr>=0&&nr<=7&&nf>=0&&nf<=7){const p=board[nr][nf];if(p!==EMPTY&&(p>0)===(byColor>0)&&Math.abs(p)===KNIGHT)return true;}}
  for(const[dr,df]of[[-1,-1],[-1,1],[1,-1],[1,1]]){let tr=r+dr,tf=f+df;while(tr>=0&&tr<=7&&tf>=0&&tf<=7){const p=board[tr][tf];if(p!==EMPTY){if((p>0)===(byColor>0)&&(Math.abs(p)===BISHOP||Math.abs(p)===QUEEN))return true;break;}tr+=dr;tf+=df;}}
  for(const[dr,df]of[[-1,0],[1,0],[0,-1],[0,1]]){let tr=r+dr,tf=f+df;while(tr>=0&&tr<=7&&tf>=0&&tf<=7){const p=board[tr][tf];if(p!==EMPTY){if((p>0)===(byColor>0)&&(Math.abs(p)===ROOK||Math.abs(p)===QUEEN))return true;break;}tr+=dr;tf+=df;}}
  for(const[dr,df]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const kr=r+dr,kf=f+df;if(kr>=0&&kr<=7&&kf>=0&&kf<=7){const p=board[kr][kf];if(p!==EMPTY&&(p>0)===(byColor>0)&&Math.abs(p)===KING)return true;}}
  return false;
}

function findKing(gs,color){const king=color*KING;for(let r=0;r<8;r++)for(let f=0;f<8;f++)if(gs.board[r][f]===king)return{r,f};return null;}
function isInCheck(gs,color){const k=findKing(gs,color);if(!k)return false;return isSquareAttacked(gs,k.r,k.f,-color);}

function applyMove(gs,fromR,fromF,toR,toF,promoType=QUEEN){
  const next=cloneGameState(gs),piece=next.board[fromR][fromF],type=Math.abs(piece),color=piece>0?WHITE:BLACK;
  next.board[toR][toF]=piece; next.board[fromR][fromF]=EMPTY;
  if(type===PAWN&&gs.enPassant&&toR===gs.enPassant.r&&toF===gs.enPassant.f)next.board[fromR][toF]=EMPTY;
  if(type===PAWN&&(toR===0||toR===7))next.board[toR][toF]=color*promoType;
  next.enPassant=null;
  if(type===PAWN&&Math.abs(toR-fromR)===2)next.enPassant={r:(fromR+toR)/2,f:fromF};
  if(type===KING){if(fromF===4&&toF===6){next.board[fromR][5]=next.board[fromR][7];next.board[fromR][7]=EMPTY;}if(fromF===4&&toF===2){next.board[fromR][3]=next.board[fromR][0];next.board[fromR][0]=EMPTY;}if(color===WHITE){next.castling.wK=false;next.castling.wQ=false;}else{next.castling.bK=false;next.castling.bQ=false;}}
  if(type===ROOK){if(fromR===7&&fromF===7)next.castling.wK=false;if(fromR===7&&fromF===0)next.castling.wQ=false;if(fromR===0&&fromF===7)next.castling.bK=false;if(fromR===0&&fromF===0)next.castling.bQ=false;}
  if(gs.board[toR][toF]!==EMPTY){if(toR===7&&toF===7)next.castling.wK=false;if(toR===7&&toF===0)next.castling.wQ=false;if(toR===0&&toF===7)next.castling.bK=false;if(toR===0&&toF===0)next.castling.bQ=false;}
  next.turn=-color; if(color===BLACK)next.fullMove++; return next;
}

function legalMovesFor(gs,r,f){const piece=gs.board[r][f];if(!piece)return[];const color=piece>0?WHITE:BLACK;return pseudoLegalMoves(gs,r,f).filter(mv=>!isInCheck(applyMove(gs,r,f,mv.r,mv.f),color));}
function allLegalMoves(gs){const moves=[];for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=gs.board[r][f];if(p!==EMPTY&&(p>0)===(gs.turn>0))legalMovesFor(gs,r,f).forEach(mv=>moves.push({fromR:r,fromF:f,...mv}));}return moves;}
function isCheckmate(gs){return isInCheck(gs,gs.turn)&&allLegalMoves(gs).length===0;}
function isStalemate(gs){return!isInCheck(gs,gs.turn)&&allLegalMoves(gs).length===0;}

const PIECE_VALUES=[0,100,320,330,500,900,20000];
function evaluateBoard(gs){let s=0;for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=gs.board[r][f];if(p!==EMPTY)s+=p>0?PIECE_VALUES[Math.abs(p)]:-PIECE_VALUES[Math.abs(p)];}return s;}

function aiMove(gs,level){
  const moves=allLegalMoves(gs);if(!moves.length)return null;
  if(level===1)return moves[Math.floor(Math.random()*moves.length)];
  if(level===2){const caps=moves.filter(m=>gs.board[m.r][m.f]!==EMPTY);if(caps.length)return caps[Math.floor(Math.random()*caps.length)];return moves[Math.floor(Math.random()*moves.length)];}
  let best=null,bestScore=gs.turn===BLACK?Infinity:-Infinity;
  for(const mv of moves){const next=applyMove(gs,mv.fromR,mv.fromF,mv.r,mv.f);let score=evaluateBoard(next);const replies=allLegalMoves(next);if(replies.length){for(const rm of replies){const s=evaluateBoard(applyMove(next,rm.fromR,rm.fromF,rm.r,rm.f));if(gs.turn===BLACK)score=Math.min(score,s);else score=Math.max(score,s);}}if(gs.turn===BLACK&&score<bestScore){bestScore=score;best=mv;}if(gs.turn===WHITE&&score>bestScore){bestScore=score;best=mv;}}
  return best||moves[0];
}

function minimaxAB(gs,depth,alpha,beta){
  if(depth===0)return evaluateBoard(gs);const moves=allLegalMoves(gs);if(!moves.length){if(isInCheck(gs,gs.turn))return gs.turn===WHITE?-19000:19000;return 0;}
  if(gs.turn===WHITE){let best=-Infinity;for(const mv of moves){const s=minimaxAB(applyMove(gs,mv.fromR,mv.fromF,mv.r,mv.f),depth-1,alpha,beta);if(s>best)best=s;if(best>alpha)alpha=best;if(alpha>=beta)break;}return best;}
  else{let best=Infinity;for(const mv of moves){const s=minimaxAB(applyMove(gs,mv.fromR,mv.fromF,mv.r,mv.f),depth-1,alpha,beta);if(s<best)best=s;if(best<beta)beta=best;if(alpha>=beta)break;}return best;}
}

function getBestMoveAndEval(gs,depth){
  const moves=allLegalMoves(gs);if(!moves.length)return null;let bestMove=null,bestEval=gs.turn===WHITE?-Infinity:Infinity;
  for(const mv of moves){const score=minimaxAB(applyMove(gs,mv.fromR,mv.fromF,mv.r,mv.f),depth-1,-Infinity,Infinity);if(gs.turn===WHITE?score>bestEval:score<bestEval){bestEval=score;bestMove=mv;}}
  return{move:bestMove,eval:bestEval};
}
/* ── END CHESS ENGINE ────────────────────────────────────────────── */

/* ── SVG CHESS PIECES ─────────────────────────────────────────────── */
function getPieceSVG(type, isWhite) {
  // White: warm ivory fill, dark brown outlines, gold details
  // Black: near-black fill, golden outlines, amber highlights
  const F  = isWhite ? '#F9F0DC' : '#1E140E';
  const S  = isWhite ? '#7B4413' : '#D4A832';
  const D  = isWhite ? '#C8A060' : '#6B4818';
  const HL = isWhite ? '#FFFFFF' : '#F0C040';

  const w = (body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" class="psvg">` +
    `<g fill="${F}" stroke="${S}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    body + `</g></svg>`;

  switch (type) {
    // ── PAWN: classic mushroom silhouette – round head, waist, wide base
    case PAWN: return w(
      `<path d="M22.5,9 C20.29,9 18.5,10.79 18.5,13 C18.5,13.89 18.79,14.71 19.28,15.38` +
      ` C17.33,16.5 16,18.59 16,21 C16,23.03 16.94,24.84 18.41,26.03` +
      ` C15.41,27.09 11,31.58 11,39.5 L34,39.5` +
      ` C34,31.58 29.59,27.09 26.59,26.03 C28.06,24.84 29,23.03 29,21` +
      ` C29,18.59 27.67,16.5 25.72,15.38 C26.21,14.71 26.5,13.89 26.5,13` +
      ` C26.5,10.79 24.71,9 22.5,9z"/>` +
      `<line x1="11" y1="37" x2="34" y2="37" stroke="${D}" stroke-width="1" fill="none"/>`
    );

    // ── ROOK: castle tower with 3 clear battlements
    case ROOK: return w(
      `<rect x="9" y="36.5" width="27" height="3" rx="1.5"/>` +
      `<rect x="12" y="17" width="21" height="19.5"/>` +
      `<path d="M14,17 L11,14 L11,9 L15,9 L15,11.5 L20,11.5 L20,9 L25,9` +
      ` L25,11.5 L30,11.5 L30,9 L34,9 L34,14 L31,17z"/>` +
      `<line x1="12" y1="30" x2="33" y2="30" stroke="${D}" stroke-width="1" fill="none"/>` +
      `<line x1="12" y1="24" x2="33" y2="24" stroke="${D}" stroke-width="1" fill="none"/>` +
      `<line x1="12" y1="17" x2="33" y2="17" stroke="${D}" stroke-width="1" fill="none"/>`
    );

    // ── KNIGHT: horse-head profile with eye and nostril
    case KNIGHT: return w(
      `<path d="M22,10 C32.5,11 38.5,18 38,39 L15,39 C15,30 25,32.5 23,18"/>` +
      `<path d="M24,18 C24.38,20.91 18.45,25.37 16,27 C13,29 13.18,31.34 11,31` +
      ` C9.96,30.06 12.41,27.96 11,28 C10,28 11.19,29.23 10,30` +
      ` C9,30 7,29 7,24 C7,20 13,19 14,18` +
      ` C14.5,16 15,13.5 15,11.5 C14.27,10.5 14.5,9.5 14.5,8.5` +
      ` C15.5,7.5 17.5,10 17.5,10 L19.5,10` +
      ` C19.5,10 20.28,8 22,7 C23,7 23,10 23,10"/>` +
      `<circle cx="19.5" cy="12.5" r="1.75" fill="${HL}" stroke="none"/>` +
      `<path fill="${D}" stroke="none" d="M13,22 C13.5,20.5 15.5,19.5 16,21 C14.5,22 13.5,23 13,22z"/>`
    );

    // ── BISHOP: tall mitre with ruffled collar, ball finial and tip dot
    case BISHOP: return w(
      `<path d="M9,36 C12.39,35.03 19.11,36.43 22.5,34` +
      ` C25.89,36.43 32.61,35.03 36,36 C36,36 37.65,36.54 39,38` +
      ` C38.32,38.97 37.35,38.99 36,38.5 C32.61,37.53 25.89,38.96 22.5,37.5` +
      ` C19.11,38.96 12.39,37.53 9,38.5 C7.65,38.99 6.68,38.97 6,38` +
      ` C7.35,36.06 9,36 9,36z"/>` +
      `<path d="M15,32 C17.5,34.5 27.5,34.5 30,32 C30.5,30.5 30,30 30,30` +
      ` C30,27.5 27.5,26 27.5,26 C33,24.5 33.5,14.5 22.5,10.5` +
      ` C11.5,14.5 12,24.5 17.5,26 C17.5,26 15,27.5 15,30` +
      ` C15,30 14.5,30.5 15,32z"/>` +
      `<circle cx="22.5" cy="8" r="2.5"/>` +
      `<circle cx="22.5" cy="4.5" r="1.2" fill="${S}" stroke="none"/>` +
      `<line x1="18" y1="26.5" x2="27" y2="26.5" stroke="${D}" stroke-width="1" fill="none"/>` +
      `<path fill="none" stroke="${D}" stroke-width="1" d="M20,20 C21,22 24,22 25,20"/>`
    );

    // ── QUEEN: 5 crown balls, V-notched crown body, ribbed skirt
    case QUEEN: return w(
      `<path d="M9,26 C17.5,24.5 30,24.5 36,26 L38.5,13.5 L31,25` +
      ` L30.7,10.9 L22.5,24.5 L14.3,10.9 L14,25 L6.5,13.5 L9,26z"/>` +
      `<path d="M9,26 C9,28 10.5,28 11.5,30 C12.5,31.5 12.5,31 12,33.5` +
      ` C10.5,34.5 11,36 11,36 C9.5,37.5 11.5,38.5 11.5,38.5` +
      ` C17.5,39.5 27.5,39.5 33.5,38.5 C33.5,38.5 35.5,37.5 34,36` +
      ` C34,36 34.5,34.5 33,33.5 C32.5,31 32.5,31.5 33.5,30` +
      ` C34.5,28 36,28 36,26 C27.5,24.5 17.5,24.5 9,26z"/>` +
      `<circle cx="6" cy="12" r="2.75"/>` +
      `<circle cx="14" cy="9" r="2.75"/>` +
      `<circle cx="22.5" cy="8" r="2.75"/>` +
      `<circle cx="31" cy="9" r="2.75"/>` +
      `<circle cx="39" cy="12" r="2.75"/>` +
      `<line x1="11" y1="30" x2="34" y2="30" stroke="${D}" stroke-width="1" fill="none"/>` +
      `<line x1="12" y1="33.5" x2="33" y2="33.5" stroke="${D}" stroke-width="1" fill="none"/>`
    );

    // ── KING: prominent cross at top is the unmistakable distinguisher
    case KING: return w(
      `<line x1="22.5" y1="11.5" x2="22.5" y2="5" stroke-width="2.5" stroke-linecap="round"/>` +
      `<line x1="19.5" y1="7.5" x2="25.5" y2="7.5" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M11.5,37 C13,29.5 17,26.5 22.5,25.5 C28,26.5 32,29.5 33.5,37z"/>` +
      `<path d="M13,37 C13.5,25 18,20.5 22.5,13 C27,20.5 31.5,25 32,37z"/>` +
      `<rect x="9" y="36.5" width="27" height="3" rx="1.5"/>` +
      `<line x1="11.5" y1="35" x2="33.5" y2="35" stroke="${D}" stroke-width="1" fill="none"/>` +
      `<line x1="13" y1="31" x2="32" y2="31" stroke="${D}" stroke-width="1" fill="none"/>`
    );

    default: return '';
  }
}

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCa8VcpRe94gevcyQUF_Zc-e-UNRCowDSc',
  authDomain:        'checkin-9f731.firebaseapp.com',
  projectId:         'checkin-9f731',
  storageBucket:     'checkin-9f731.firebasestorage.app',
  messagingSenderId: '199496624018',
  appId:             '1:199496624018:web:a06afb19294d0635a8034b',
};

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

let currentUserId = null;
let isOnline      = false;

/* ═══════════════════════════════════════════════════════
   2. STATIC DATA: RANKS, ACHIEVEMENTS, COURSE, PUZZLES
═══════════════════════════════════════════════════════ */

const CHESS_RANKS = [
  { level:1,  title:'Neuling',          icon:'♙', xp:0     },
  { level:2,  title:'Bauer',            icon:'♟', xp:100   },
  { level:3,  title:'Springer',         icon:'♞', xp:250   },
  { level:4,  title:'Läufer',           icon:'♝', xp:500   },
  { level:5,  title:'Turm',             icon:'♜', xp:900   },
  { level:6,  title:'Dame',             icon:'♛', xp:1500  },
  { level:7,  title:'König',            icon:'♚', xp:2500  },
  { level:8,  title:'Schachmeister',    icon:'👑', xp:4000  },
  { level:9,  title:'Taktik-Ninja',     icon:'🥷', xp:6000  },
  { level:10, title:'Großmeister',      icon:'🏆', xp:9000  },
];

const CHESS_ACHIEVEMENTS = [
  { id:'first_puzzle',   icon:'🧩', title:'Erstes Puzzle gelöst',   desc:'Ein Puzzle erfolgreich gelöst' },
  { id:'puzzles_10',     icon:'🔟', title:'10 Puzzles gelöst',       desc:'10 Puzzles abgeschlossen' },
  { id:'puzzles_50',     icon:'🎯', title:'50 Puzzles gelöst',       desc:'50 Puzzles abgeschlossen' },
  { id:'first_mate',     icon:'♔', title:'Erstes Matt gefunden',    desc:'Ein Schachmatt erzielt' },
  { id:'streak_3',       icon:'🔥', title:'3 Tage Streak',           desc:'3 Tage hintereinander trainiert' },
  { id:'streak_7',       icon:'🌟', title:'7 Tage Streak',           desc:'7 Tage Streak erreicht' },
  { id:'first_win',      icon:'🏆', title:'Erste Partie gewonnen',  desc:'Eine Partie gewonnen' },
  { id:'games_10',       icon:'🎽', title:'10 Partien gespielt',     desc:'10 Partien abgeschlossen' },
  { id:'perfect_puzzle', icon:'💎', title:'Fehlerfrei gelöst',       desc:'Puzzle ohne Hinweis gelöst' },
  { id:'mate_in_2',      icon:'♟', title:'Matt in 2 gelöst',        desc:'Ein Matt-in-2-Puzzle gelöst' },
  { id:'first_lesson',   icon:'📚', title:'Erste Lektion abgeschl.', desc:'Erste Kurslektion abgeschlossen' },
  { id:'all_modules',    icon:'🎓', title:'Kurs abgeschlossen',      desc:'Alle Kursmodule abgeschlossen' },
  { id:'level_5',        icon:'⭐', title:'Level 5 erreicht',        desc:'Schachspieler-Level 5 erreicht' },
  { id:'daily_done',     icon:'📅', title:'Tagessieger',             desc:'Tages-Challenge abgeschlossen' },
];

const CHESS_COURSE_MODULES = [
  {
    id: 'basics', title: 'Brett & Koordinaten', icon: '♞', desc: 'Lerne das Schachbrett kennen',
    lessons: [
      { id:'b1', title:'Das Schachbrett',     desc:'8×8 Felder, Koordinaten a1–h8', xp:20,
        explanation: 'Das Schachbrett besteht aus 64 Feldern – 32 helle und 32 dunkle. Die Spalten heißen Linien (a–h), die Reihen heißen Reihen (1–8). Weißes Brett unten rechts beginnt immer auf einem hellen Feld.',
        task: 'Klicke auf das Feld e4.', targetSquare: 'e4', startFen: 'empty' },
      { id:'b2', title:'Figurenwerte',         desc:'Welche Figur ist wie viel wert?', xp:20,
        explanation: 'Bauern = 1 Punkt, Springer = 3, Läufer = 3, Turm = 5, Dame = 9, König = unschätzbar. Diese Werte helfen, Tausche zu beurteilen.',
        task: 'Klicke auf die Dame (♕) auf dem Brett.', targetPiece: {type:QUEEN,color:WHITE}, startFen:'4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1' },
    ]
  },
  {
    id: 'movement', title: 'Figurenbewegung', icon: '♟', desc: 'Wie zieht jede Figur?',
    lessons: [
      { id:'m1', title:'Der Bauer',            desc:'Vor, schlagen diagonal', xp:25,
        explanation: 'Bauern ziehen ein Feld vorwärts (beim ersten Zug auch zwei). Sie schlagen diagonal ein Feld vorwärts. Weiße Bauern ziehen nach oben, schwarze nach unten.',
        task: 'Ziehe den Bauern auf e4.', startFen:'4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', moveTask:{from:'e2',to:'e4'} },
      { id:'m2', title:'Der Springer',          desc:'L-förmige Bewegung', xp:25,
        explanation: 'Der Springer springt in einem „L": zwei Felder in eine Richtung, dann ein Feld senkrecht dazu. Er ist die einzige Figur, die über andere springen kann.',
        task: 'Bringe den Springer von g1 nach f3.', startFen:'4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', moveTask:{from:'g1',to:'f3'} },
      { id:'m3', title:'Der Läufer',            desc:'Diagonal unbegrenzt', xp:25,
        explanation: 'Der Läufer bewegt sich beliebig weit diagonal. Jeder Läufer bleibt auf der Farbe, auf der er gestartet ist.',
        task: 'Ziehe den Läufer auf c4.', startFen:'4k3/8/8/8/8/8/4B3/4K3 w - - 0 1', moveTask:{from:'e2',to:'c4'} },
      { id:'m4', title:'Der Turm',              desc:'Horizontal und vertikal', xp:25,
        explanation: 'Der Turm zieht beliebig weit horizontal oder vertikal. Er ist sehr stark im Endspiel und auf offenen Linien.',
        task: 'Ziehe den Turm auf e1.', startFen:'4k3/8/8/8/8/8/8/R3K3 w - - 0 1', moveTask:{from:'a1',to:'e1'} },
      { id:'m5', title:'Die Dame',              desc:'Turm + Läufer kombiniert', xp:30,
        explanation: 'Die Dame ist die stärkste Figur: Sie zieht beliebig weit horizontal, vertikal und diagonal. Sie kombiniert die Kraft von Turm und Läufer.',
        task: 'Schlage den schwarzen Bauern mit der Dame.', startFen:'4k3/8/8/8/4p3/8/8/3QK3 w - - 0 1', moveTask:{from:'d1',to:'e4'} },
      { id:'m6', title:'Der König',             desc:'Ein Feld in jede Richtung', xp:25,
        explanation: 'Der König zieht ein Feld in jede Richtung. Er darf nicht auf ein angegriffenes Feld ziehen und ist die wichtigste Figur – wird er mattgesetzt, ist das Spiel vorbei.',
        task: 'Ziehe den König auf e2.', startFen:'4k3/8/8/8/8/8/8/4K3 w - - 0 1', moveTask:{from:'e1',to:'e2'} },
    ]
  },
  {
    id: 'check', title: 'Schach & Matt', icon: '♚', desc: 'Schach, Matt und Patt verstehen',
    lessons: [
      { id:'c1', title:'Schach geben',          desc:'Den König angreifen', xp:30,
        explanation: 'Ein König steht im Schach, wenn er von einer gegnerischen Figur angegriffen wird. Der Spieler muss das Schach sofort auflösen.',
        task: 'Gib dem schwarzen König Schach mit der Dame.', startFen:'4k3/8/8/8/8/8/8/3QK3 w - - 0 1', moveTask:{from:'d1',to:'d8'} },
      { id:'c2', title:'Schachmatt',             desc:'Der König kann nicht entkommen', xp:40,
        explanation: 'Schachmatt endet das Spiel: Der König steht im Schach und hat keinen legalen Zug. Wer matt setzt, gewinnt.',
        task: 'Setze den schwarzen König mit der Dame matt (Dh7#).', startFen:'5rk1/8/7K/8/8/8/8/7Q w - - 0 1', moveTask:{from:'h1',to:'h7'} },
      { id:'c3', title:'Patt',                   desc:'Keine Züge, aber kein Schach', xp:30,
        explanation: 'Patt tritt auf, wenn ein Spieler am Zug ist, aber keinen legalen Zug hat und der König nicht im Schach steht. Das Spiel endet unentschieden.',
        task: 'Klicke auf das Feld, auf das der schwarze König nicht ziehen kann.', targetSquare:'f8', startFen:'5k2/5Q2/5K2/8/8/8/8/8 b - - 0 1' },
    ]
  },
  {
    id: 'openings', title: 'Eröffnungsprinzipien', icon: '♙', desc: 'Gut starten – Eröfflungsprinzipien',
    lessons: [
      { id:'op1', title:'Zentrumskontrolle',    desc:'e4, d4, e5, d5 besetzen', xp:35,
        explanation: 'Die wichtigsten Felder im Zentrum sind e4, d4, e5, d5. Wer das Zentrum kontrolliert, hat mehr Raum für seine Figuren.',
        task: 'Ziehe den Bauern nach e4 (Königsbauereröffnung).', startFen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moveTask:{from:'e2',to:'e4'} },
      { id:'op2', title:'Figuren entwickeln',   desc:'Springer und Läufer zuerst', xp:35,
        explanation: 'Entwickle zu Beginn Springer und Läufer, bevor du die Dame oder Türme einsetzt. Jede Figur sollte nur einmal in der Eröffnung gezogen werden.',
        task: 'Entwickle den Springer nach f3.', startFen:'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR w kq - 0 1', moveTask:{from:'g1',to:'f3'} },
    ]
  },
  {
    id: 'tactics', title: 'Taktiken', icon: '⚔', desc: 'Gabel, Fesselung, Spieß',
    lessons: [
      { id:'t1', title:'Die Gabel',             desc:'Zwei Figuren gleichzeitig angreifen', xp:40,
        explanation: 'Eine Gabel ist ein Zug, bei dem eine Figur gleichzeitig zwei oder mehr gegnerische Figuren angreift. Springer-Gabeln sind besonders gefährlich.',
        task: 'Gabel König und Dame mit dem Springer (Nd4–e6+).', startFen:'4k3/5q2/8/8/3N4/8/8/4K3 w - - 0 1', moveTask:{from:'d4',to:'e6'} },
      { id:'t2', title:'Die Fesselung',         desc:'Eine Figur kann nicht ziehen', xp:40,
        explanation: 'Eine Fesselung liegt vor, wenn eine Figur nicht ziehen kann, ohne eine wertvollere Figur dahinter anzugreifen. Eine absolute Fesselung betrifft den König.',
        task: 'Fessle den schwarzen Springer mit dem Läufer (Lb5).', startFen:'r1bqk2r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', moveTask:{from:'f1',to:'b5'} },
    ]
  },
  {
    id: 'endgame', title: 'Endspiele', icon: '♔', desc: 'König und Bauer im Endspiel',
    lessons: [
      { id:'e1', title:'König aktivieren',      desc:'Der König wird aktiv im Endspiel', xp:45,
        explanation: 'Im Endspiel ist der König eine starke Figur. Aktiviere ihn in Richtung Zentrum, sobald die Gefahr vorbei ist.',
        task: 'Bringe den weißen König nach e4.', startFen:'4k3/8/8/8/8/8/8/4K3 w - - 0 1', moveTask:{from:'e1',to:'e4'} },
      { id:'e2', title:'Bauernumwandlung',       desc:'Bauer zur Dame umwandeln', xp:50,
        explanation: 'Wenn ein Bauer die gegnerische Grundreihe erreicht, wird er zur Dame (oder einer anderen Figur) umgewandelt. Das ist oft spielentscheidend.',
        task: 'Wandle den Bauern in eine Dame um (e7–e8=D).', startFen:'4k3/4P3/8/8/8/8/8/4K3 w - - 0 1', moveTask:{from:'e7',to:'e8'} },
    ]
  },
];

const ALL_CHESS_LESSONS = CHESS_COURSE_MODULES.flatMap(m =>
  m.lessons.map(l => ({ ...l, moduleId: m.id, moduleTitle: m.title }))
);

/* ── PUZZLES ── */
const PUZZLES = [
  { id:'p01', title:'Matt in 1 – Dame', difficulty:'easy', xp:30, type:'mate1',
    fen:'k7/8/1K6/8/8/8/8/7Q w - - 0 1', sideToMove:WHITE,
    solution:[{from:'h1',to:'a8'}],
    hints:['Die Dame kann den König auf a8 mattsetzen.'],
    explanation:'Dh1–a8# setzt den König auf a8 matt. Der König auf b6 deckt b7 und a7.' },

  { id:'p02', title:'Matt in 1 – Springer', difficulty:'easy', xp:30, type:'mate1',
    fen:'6k1/5ppp/8/8/8/8/8/6NK w - - 0 1', sideToMove:WHITE,
    solution:[{from:'g1',to:'f3'},{from:'f3',to:'e5'},{from:'e5',to:'f7'}],
    hints:['Springer nach f7 gibt Schach – kann der König entkommen?'],
    explanation:'Sg1–f7# ist ein Springermatt in der Ecke – der König auf g8 ist eingemauert.' },

  { id:'p03', title:'Gabelmatt', difficulty:'easy', xp:35, type:'fork',
    fen:'r3k3/8/8/8/8/8/8/R2NK3 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'d1',to:'c3'},{from:'c3',to:'e4'},{from:'e4',to:'c5'}],
    hints:['Ein Springer kann König und Turm gleichzeitig angreifen.'],
    explanation:'Sc5+ gabelt König auf e8 und Turm auf a8 – weißer Materigewinn.' },

  { id:'p04', title:'Grundreihenmatt', difficulty:'easy', xp:35, type:'backrank',
    fen:'6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'a1',to:'a8'}],
    hints:['Schwarzer König ist hinter seinen Bauern eingesperrt.'],
    explanation:'Ta1–a8# – Grundreihenmatt! Die eigenen Bauern blockieren den König.' },

  { id:'p05', title:'Fesselung nutzen', difficulty:'medium', xp:40, type:'pin',
    fen:'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    sideToMove:WHITE,
    solution:[{from:'c4',to:'f7'}],
    hints:['Läufer schlägt auf f7 – König und Turm werden angegriffen.','Lc4xf7+ gewinnt Material.'],
    explanation:'Lc4xf7+! Der König muss schlagen, dann gewinnt weiß den Turm auf h8.' },

  { id:'p06', title:'Matt in 2 – Damenopfer', difficulty:'medium', xp:50, type:'mate2',
    fen:'r1b1kb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    sideToMove:WHITE,
    solution:[{from:'h5',to:'f7'},{from:'e8',to:'f7'},{from:'c4',to:'g8'}],
    hints:['Schau dir die f7-Schwäche an.','Dxf7+ erzwingt Kxf7, dann...'],
    explanation:'1.Dxf7+ Kxf7 2.Lg8#! Ein klassisches Schäfermatt-Muster.' },

  { id:'p07', title:'Spieß – König und Dame', difficulty:'medium', xp:45, type:'skewer',
    fen:'4k3/8/8/3R4/8/8/8/4K3 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'d5',to:'d8'}],
    hints:['Turm auf die 8. Reihe – was passiert?'],
    explanation:'Td8+ zwingt den König wegzuziehen. Die Dame dahinter geht verloren.' },

  { id:'p08', title:'Ersticktes Matt', difficulty:'hard', xp:60, type:'smothered',
    fen:'6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'h6',to:'f7'},{from:'f7',to:'h8'}],
    hints:['Der Springer kann den König einsperren.','Sf7+ – was muss Schwarz tun?'],
    explanation:'Sf7+ Kg8, Sh6++ Kh8, Sf7# – Das ersticktes Matt! Eigene Figuren blockieren den König.' },

  { id:'p09', title:'Matt in 2 – Türme', difficulty:'hard', xp:55, type:'mate2',
    fen:'6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'a1',to:'a8'},{from:'g8',to:'f8'},{from:'b1',to:'b8'}],
    hints:['Erster Turm auf die 8. Reihe.','Zweiter Turm folgt nach.'],
    explanation:'1.Ta8+ Kf8 2.Tb8# – Zwei Türme setzen matt durch koordinierte Angriffe.' },

  { id:'p10', title:'Gabelmatt – Springer', difficulty:'easy', xp:35, type:'fork',
    fen:'4k3/8/8/8/8/8/8/3NK3 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'d1',to:'e3'},{from:'e3',to:'f5'},{from:'f5',to:'d6'},{from:'d6',to:'f7'}],
    hints:['Springer springen auf f7 – ist der König sicher?'],
    explanation:'Sf7+ gabelt König auf e8 und Turm auf h8 (falls noch vorhanden).' },

  { id:'p11', title:'Bauernumwandlung gewinnt', difficulty:'easy', xp:30, type:'promotion',
    fen:'4k3/7P/8/8/8/8/8/4K3 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'h7',to:'h8'}],
    hints:['Der Bauer kann sich zur Dame umwandeln!'],
    explanation:'h7–h8=D! Neue Dame entscheidet die Partie sofort.' },

  { id:'p12', title:'Schäfermatt', difficulty:'easy', xp:30, type:'mate2',
    fen:'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    sideToMove:WHITE,
    solution:[{from:'d1',to:'h5'},{from:'e8',to:'e7'},{from:'h5',to:'f7'}],
    hints:['Dame nach h5 – wo kann der König hin?'],
    explanation:'1.Dh5 Ke7 2.Df7# – Das Schäfermatt in 2 Zügen!' },

  { id:'p13', title:'Doppelschach', difficulty:'hard', xp:65, type:'double_check',
    fen:'r1b1k2r/pppp1ppp/2n2q2/8/3PP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 1',
    sideToMove:WHITE,
    solution:[{from:'d4',to:'d5'},{from:'d5',to:'d6'}],
    hints:['Doppelschach – der König kann nicht schlagen UND decken.'],
    explanation:'d4–d5–d6+ Doppelschach durch Bauer und Läufer (nach Entfesselung).' },

  { id:'p14', title:'Matt in 1 – Läufer', difficulty:'easy', xp:30, type:'mate1',
    fen:'6k1/6pp/7K/8/8/8/8/7B w - - 0 1', sideToMove:WHITE,
    solution:[{from:'h1',to:'c6'}],
    hints:['Läufer auf c6 – keine Auswegmöglichkeit?'],
    explanation:'Lh1–c6# setzt matt. König auf g8 hat keine freien Felder.' },

  { id:'p15', title:'Materialgewinn – Gabel', difficulty:'medium', xp:40, type:'fork',
    fen:'4k3/8/8/3n4/8/8/8/R1B1K3 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'c1',to:'b2'}],
    hints:['Läufer nach b2 – welche Figuren werden angegriffen?'],
    explanation:'Lb2 gabelt Springer auf d4 und Turm auf a1 (nach Umkehrung). Materialgewinn!' },

  { id:'p16', title:'Endspiel – Bauernlauf', difficulty:'medium', xp:45, type:'endgame',
    fen:'8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'e1',to:'e2'},{from:'e2',to:'e3'},{from:'e3',to:'e4'},{from:'e4',to:'e5'},{from:'e5',to:'e6'}],
    hints:['König muss den Bauern unterstützen.','Oppositionstechnik!'],
    explanation:'Weißer König muss die Opposition halten: Ke2, Ke3, Ke4, Ke5 und dann den Bauern pushen.' },

  { id:'p17', title:'Rückzugsfalle', difficulty:'hard', xp:60, type:'trap',
    fen:'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3B1N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    sideToMove:WHITE,
    solution:[{from:'d3',to:'g6'},{from:'h7',to:'g6'},{from:'f3',to:'g5'}],
    hints:['Lxg6 opfert den Läufer.','Nach hxg6 folgt Sg5.'],
    explanation:'1.Lxg6 hxg6 2.Sg5 droht Sf7 und Dh5# – starker Angriff auf die geschwächte Königsstellung.' },

  { id:'p18', title:'Zugzwang', difficulty:'hard', xp:70, type:'zugzwang',
    fen:'8/8/8/8/8/k7/p7/K7 b - - 0 1', sideToMove:BLACK,
    solution:[{from:'a3',to:'b3'}],
    hints:['Schwarz muss ziehen – aber jeder Zug verliert!','Ka3–b3 erzwingt...'],
    explanation:'Kb3! zwingt Weiß in Zugzwang: Ka1 erlaubt a1=D+, Ka2 macht Patt.' },

  { id:'p19', title:'Batterie – Türme', difficulty:'medium', xp:45, type:'battery',
    fen:'6k1/5ppp/8/8/8/8/5PPP/1RR3K1 w - - 0 1', sideToMove:WHITE,
    solution:[{from:'c1',to:'c8'},{from:'g8',to:'f8'},{from:'b1',to:'b8'}],
    hints:['Tc8+ – Türme arbeiten zusammen!','Tb8 folgt als Matt.'],
    explanation:'1.Tc8+ Kf8 2.Tb8# – Die Turmbatterie arbeitet koordiniert.' },

  { id:'p20', title:'Opfer für Matt', difficulty:'hard', xp:75, type:'sacrifice',
    fen:'r1b2rk1/ppp2ppp/2n5/3pp1N1/2BP4/8/PPP2PPP/R1BQK2R w KQ - 0 1',
    sideToMove:WHITE,
    solution:[{from:'g5',to:'f7'},{from:'f8',to:'f7'},{from:'d1',to:'h5'}],
    hints:['Sg5xf7 opfert den Springer.','Nach Txf7 folgt Dh5+.'],
    explanation:'1.Sxf7 Txf7 2.Dh5+ g6 3.Dxg6# – Opfer ermöglicht das entscheidende Matt.' },
];

/* ═══════════════════════════════════════════════════════
   3. STATE & PERSISTENZ
═══════════════════════════════════════════════════════ */
const CHESS_STORAGE_KEY = 'chessmaster_v1';

const DEFAULT_CHESS_STATE = {
  level: 1, xp: 0, currentLevelXp: 0,
  completedLessons: {}, solvedPuzzles: {}, puzzleMistakes: {},
  gamesPlayed: 0, gamesWon: 0,
  achievements: [],
  streak: 0, lastTrainingDate: null,
  dailyChallenge: { date: null, type: 'puzzles', goal: 3, progress: 0, done: false },
  activityLog: {},
  endgameProgress: {},
  settings: { theme: 'dark', showLegal: true, showLastMove: true, sound: true, boardSize: 'md', displayName: '', avatar: '♟', boardTheme: 'classic' },
};

let CS = {}; // chess state

function loadChessState() {
  try {
    const raw = localStorage.getItem(CHESS_STORAGE_KEY);
    CS = raw ? { ...DEFAULT_CHESS_STATE, ...JSON.parse(raw) } : JSON.parse(JSON.stringify(DEFAULT_CHESS_STATE));
    CS.settings       = { ...DEFAULT_CHESS_STATE.settings,       ...(CS.settings       || {}) };
    CS.dailyChallenge = { ...DEFAULT_CHESS_STATE.dailyChallenge, ...(CS.dailyChallenge || {}) };
  } catch (_) {
    CS = JSON.parse(JSON.stringify(DEFAULT_CHESS_STATE));
  }
}

function saveChessState() {
  localStorage.setItem(CHESS_STORAGE_KEY, JSON.stringify(CS));
  syncChessToFirebase();
}

async function syncChessToFirebase() {
  if (!currentUserId) return;
  try {
    const ref = doc(db, 'typemaster_users', currentUserId);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    await setDoc(ref, {
      ...existing,
      chess: { ...CS, updatedAt: null },
      global: {
        ...(existing.global || {}),
        lastActive: null,
        updatedAt: null,
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('Chess sync fehlgeschlagen:', e.message);
  }
}

async function loadChessFromFirebase() {
  if (!currentUserId) return false;
  try {
    const snap = await getDoc(doc(db, 'typemaster_users', currentUserId));
    if (snap.exists()) {
      const data = snap.data();
      if (data.chess) {
        CS = { ...DEFAULT_CHESS_STATE, ...data.chess };
        CS.settings = { ...DEFAULT_CHESS_STATE.settings, ...(data.chess.settings || {}) };
        localStorage.setItem(CHESS_STORAGE_KEY, JSON.stringify(CS));
        return true;
      }
    }
  } catch (e) {
    console.warn('Chess load fehlgeschlagen:', e.message);
  }
  return false;
}

/* ═══════════════════════════════════════════════════════
   4. XP & LEVEL SYSTEM
═══════════════════════════════════════════════════════ */
function getCurrentRank() {
  for (let i = CHESS_RANKS.length - 1; i >= 0; i--) {
    if (CS.xp >= CHESS_RANKS[i].xp) return CHESS_RANKS[i];
  }
  return CHESS_RANKS[0];
}

function getNextRank() {
  const cur = getCurrentRank();
  return CHESS_RANKS.find(r => r.level > cur.level) || null;
}

function awardXP(amount) {
  const oldRank = getCurrentRank();
  CS.xp += amount;
  CS.currentLevelXp = CS.xp - getCurrentRank().xp;
  const newRank = getCurrentRank();
  CS.level = newRank.level;
  saveChessState();
  updateNavXP();
  if (newRank.level > oldRank.level) showLevelUp(newRank);
  clearTimeout(awardXP._syncTimer);
  awardXP._syncTimer = setTimeout(syncLeaderboard, 10000);
}

function updateNavXP() {
  const rank = getCurrentRank();
  const next = getNextRank();
  const pct = next ? Math.min(100, ((CS.xp - rank.xp) / (next.xp - rank.xp)) * 100) : 100;
  setText('nav-level', rank.level);
  setText('nav-xp', CS.xp);
  setText('nav-streak', CS.streak);
  setStyle('nav-xp-fill', 'width', pct + '%');
  setText('sf-name', CS.settings?.displayName || 'Schachspieler');
  setText('sf-rank', rank.title);
  setText('sf-avatar', CS.settings?.avatar || rank.icon);
}

/* ═══════════════════════════════════════════════════════
   5. ACHIEVEMENTS
═══════════════════════════════════════════════════════ */
function checkAndUnlock(id) {
  if (CS.achievements.includes(id)) return;
  CS.achievements.push(id);
  saveChessState();
  const def = CHESS_ACHIEVEMENTS.find(a => a.id === id);
  if (def) showAchievementToast(def);
}

function checkAllAchievements() {
  const solved = Object.keys(CS.solvedPuzzles).length;
  if (solved >= 1)  checkAndUnlock('first_puzzle');
  if (solved >= 10) checkAndUnlock('puzzles_10');
  if (solved >= 50) checkAndUnlock('puzzles_50');
  const mateSolved = PUZZLES.filter(p => (p.type === 'mate1' || p.type === 'mate2') && CS.solvedPuzzles[p.id]);
  if (mateSolved.length >= 1) checkAndUnlock('first_mate');
  if (CS.streak >= 3)  checkAndUnlock('streak_3');
  if (CS.streak >= 7)  checkAndUnlock('streak_7');
  if (CS.gamesWon >= 1) checkAndUnlock('first_win');
  if (CS.gamesPlayed >= 10) checkAndUnlock('games_10');
  const lessons = Object.keys(CS.completedLessons).length;
  if (lessons >= 1) checkAndUnlock('first_lesson');
  if (lessons >= ALL_CHESS_LESSONS.length) checkAndUnlock('all_modules');
  if (CS.level >= 5) checkAndUnlock('level_5');
}

/* ═══════════════════════════════════════════════════════
   6. STREAK & DAILY CHALLENGE
═══════════════════════════════════════════════════════ */
function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (CS.lastTrainingDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (CS.lastTrainingDate === yesterday) {
    CS.streak += 1;
  } else if (CS.lastTrainingDate !== today) {
    CS.streak = 1;
  }
  CS.lastTrainingDate = today;
  CS.activityLog = CS.activityLog || {};
  CS.activityLog[today] = (CS.activityLog[today] || 0) + 1;
  saveChessState();
  checkAllAchievements();
}

function initDailyChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  if (CS.dailyChallenge.date !== today) {
    const types = ['puzzles','game','mate','accuracy'];
    const goals  = [3, 1, 1, 10];
    const descs  = ['Löse 3 Puzzles','Gewinne eine Partie','Finde ein Schachmatt','Mache 10 Züge ohne Fehler'];
    const idx    = new Date().getDay() % types.length;
    CS.dailyChallenge = { date: today, type: types[idx], goal: goals[idx], desc: descs[idx], progress: 0, done: false };
    saveChessState();
  }
}

function progressDailyChallenge(type) {
  if (CS.dailyChallenge.done || CS.dailyChallenge.type !== type) return;
  CS.dailyChallenge.progress = Math.min(CS.dailyChallenge.progress + 1, CS.dailyChallenge.goal);
  if (CS.dailyChallenge.progress >= CS.dailyChallenge.goal) {
    CS.dailyChallenge.done = true;
    awardXP(50);
    checkAndUnlock('daily_done');
  }
  saveChessState();
  updateDashboard();
}

/* ═══════════════════════════════════════════════════════
   7. BOARD RENDERING
═══════════════════════════════════════════════════════ */
function buildBoardElement(id, onClick) {
  const boardEl = document.createElement('div');
  boardEl.className = 'chess-board-outer';
  boardEl.id = 'board-outer-' + id;

  const inner = document.createElement('div');
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';

  const leftCoords = document.createElement('div');
  leftCoords.className = 'chess-coords-left';
  '87654321'.split('').forEach(n => {
    const d = document.createElement('div'); d.className='chess-coord'; d.textContent=n; leftCoords.appendChild(d);
  });

  const boardWrap = document.createElement('div');

  const topCoords = document.createElement('div');
  topCoords.className = 'chess-coords-top';
  'abcdefgh'.split('').forEach(c => {
    const d = document.createElement('div'); d.className='chess-coord'; d.style.flex='1'; d.textContent=c; topCoords.appendChild(d);
  });

  const grid = document.createElement('div');
  grid.className = 'chess-board';
  grid.id = 'board-grid-' + id;

  const bottomCoords = document.createElement('div');
  bottomCoords.className = 'chess-coords-bottom';
  'abcdefgh'.split('').forEach(c => {
    const d = document.createElement('div'); d.className='chess-coord'; d.style.flex='1'; d.textContent=c; bottomCoords.appendChild(d);
  });

  boardWrap.appendChild(topCoords);
  boardWrap.appendChild(grid);
  boardWrap.appendChild(bottomCoords);

  const rightCoords = document.createElement('div');
  rightCoords.className = 'chess-coords-right';
  '87654321'.split('').forEach(n => {
    const d = document.createElement('div'); d.className='chess-coord'; d.textContent=n; rightCoords.appendChild(d);
  });

  inner.appendChild(leftCoords);
  inner.appendChild(boardWrap);
  inner.appendChild(rightCoords);
  boardEl.appendChild(inner);

  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const cell = document.createElement('div');
    cell.className = 'chess-cell ' + ((r+f)%2===0?'light':'dark');
    cell.dataset.r = r;
    cell.dataset.f = f;
    cell.addEventListener('click', () => onClick(r, f, cell));
    grid.appendChild(cell);
  }
  return boardEl;
}

function renderBoard(boardId, gs, selected, legalTargets, lastMove, inCheckColor) {
  const grid = document.getElementById('board-grid-' + boardId);
  if (!grid) return;
  const cells = grid.querySelectorAll('.chess-cell');
  cells.forEach(cell => {
    const r = +cell.dataset.r, f = +cell.dataset.f;
    cell.classList.remove('selected','legal-move','legal-capture','last-move','in-check','solution-move','wrong-move');
    cell.innerHTML = '';

    const piece = gs.board[r][f];
    if (piece !== EMPTY) {
      const span = document.createElement('span');
      span.className = 'chess-piece';
      span.innerHTML = getPieceSVG(Math.abs(piece), piece > 0);
      cell.appendChild(span);
    }

    if (selected && selected.r===r && selected.f===f) cell.classList.add('selected');

    if (legalTargets && CS.settings.showLegal) {
      const tgt = legalTargets.find(t => t.r===r && t.f===f);
      if (tgt) {
        if (piece !== EMPTY) cell.classList.add('legal-capture');
        else cell.classList.add('legal-move');
      }
    }

    if (CS.settings.showLastMove && lastMove) {
      if ((lastMove.fromR===r&&lastMove.fromF===f)||(lastMove.toR===r&&lastMove.toF===f))
        cell.classList.add('last-move');
    }

    if (inCheckColor !== undefined) {
      const kPos = findKing(gs, inCheckColor);
      if (kPos && kPos.r===r && kPos.f===f) cell.classList.add('in-check');
    }
  });
}

function animatePieceMove(boardId, fromR, fromF, toR, toF, onDone) {
  const grid = document.getElementById('board-grid-' + boardId);
  if (!grid) { onDone?.(); return; }
  const fromCell = grid.querySelector(`[data-r="${fromR}"][data-f="${fromF}"]`);
  const toCell   = grid.querySelector(`[data-r="${toR}"][data-f="${toF}"]`);
  const pieceEl  = fromCell?.querySelector('.chess-piece');
  if (!pieceEl || !toCell) { onDone?.(); return; }

  const fRect = fromCell.getBoundingClientRect();
  const tRect = toCell.getBoundingClientRect();
  const ghost = pieceEl.cloneNode(true);
  Object.assign(ghost.style, {
    position:'fixed', left:fRect.left+'px', top:fRect.top+'px',
    width:fRect.width+'px', height:fRect.height+'px',
    margin:'0', zIndex:'9999', pointerEvents:'none',
    transition:'transform 0.18s cubic-bezier(.25,.46,.45,.94)',
  });
  pieceEl.style.opacity = '0';
  document.body.appendChild(ghost);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    ghost.style.transform = `translate(${tRect.left-fRect.left}px,${tRect.top-fRect.top}px)`;
  }));

  let done = false;
  const finish = () => { if (done) return; done=true; ghost.remove(); pieceEl.style.opacity=''; onDone?.(); };
  ghost.addEventListener('transitionend', finish, { once:true });
  setTimeout(finish, 350);
}

/* ═══════════════════════════════════════════════════════
   8. VIEW SYSTEM
═══════════════════════════════════════════════════════ */
let currentView = 'dashboard';

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  currentView = name;
  closeSidebar();
  if (name === 'dashboard')    updateDashboard();
  if (name === 'stats')        renderStats();
  if (name === 'achievements') renderAchievements();
  if (name === 'course')       renderCourse();
  if (name === 'chess-story' && typeof ChessStory !== 'undefined') ChessStory.showMap();
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
}

/* ═══════════════════════════════════════════════════════
   9. DASHBOARD
═══════════════════════════════════════════════════════ */
function updateDashboard() {
  const rank = getCurrentRank();
  const next = getNextRank();
  const pct  = next ? Math.min(100, ((CS.xp - rank.xp) / (next.xp - rank.xp)) * 100) : 100;

  setText('chess-rank-badge',  rank.icon);
  setText('chess-rank-title',  rank.title);
  setText('chess-dash-level',  rank.level);
  setText('chess-xp-label',    `${CS.xp} / ${next ? next.xp : '∞'} XP`);
  setStyle('chess-xp-fill', 'width', pct + '%');

  setText('qs-puzzles', Object.keys(CS.solvedPuzzles).length);
  setText('qs-wins',    CS.gamesWon);
  setText('qs-streak',  CS.streak);
  setText('qs-lessons', Object.keys(CS.completedLessons).length);

  const dc = CS.dailyChallenge;
  setText('chess-dc-desc',  dc.desc || 'Tages-Challenge lädt…');
  setText('chess-dc-label', `${dc.progress} / ${dc.goal}`);
  setStyle('chess-dc-fill', 'width', dc.goal ? Math.min(100,(dc.progress/dc.goal)*100)+'%' : '0%');
  setText('chess-dc-reward', dc.done ? '✅ Erledigt!' : '+50 XP');

  const solvedCount = Object.keys(CS.solvedPuzzles).length;
  const nextPuzzle  = PUZZLES[solvedCount % PUZZLES.length];
  const nextLesson  = ALL_CHESS_LESSONS.find(l => !CS.completedLessons[l.id]) || ALL_CHESS_LESSONS[0];
  if (nextLesson) {
    setText('chess-nl-title', nextLesson.title);
    setText('chess-nl-desc',  nextLesson.desc);
  }
  if (nextPuzzle) {
    setText('chess-np-title', nextPuzzle.title);
    setText('chess-np-desc',  nextPuzzle.explanation?.slice(0,60)+'…');
  }

  const today = new Date().toDateString();
  const hour  = new Date().getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 17 ? 'Guten Tag' : 'Guten Abend';
  setText('greeting', greeting + '! Bereit für Schach?');
}

/* ═══════════════════════════════════════════════════════
   10. COURSE
═══════════════════════════════════════════════════════ */
function renderCourse() {
  const container = document.getElementById('chess-course-modules');
  if (!container) return;
  container.innerHTML = CHESS_COURSE_MODULES.map(mod => {
    const done   = mod.lessons.filter(l => CS.completedLessons[l.id]).length;
    const total  = mod.lessons.length;
    const pct    = Math.round((done/total)*100);
    const cards  = mod.lessons.map((l,i) => {
      const isCompleted = CS.completedLessons[l.id];
      const isLocked    = i > 0 && !CS.completedLessons[mod.lessons[i-1].id];
      const cls = [
        'chess-lesson-card',
        isCompleted ? 'completed' : '',
        isLocked    ? 'locked'    : '',
      ].join(' ');
      return `<div class="${cls}" data-lesson-id="${l.id}" ${isLocked?'':'style="cursor:pointer"'}>
        <div class="lesson-num">Lektion ${i+1}</div>
        <h4>${l.title}</h4>
        <p>${l.desc}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem">
          <span style="font-size:.72rem;color:var(--green);font-weight:700">+${l.xp} XP</span>
          ${isCompleted ? '<span style="color:var(--green)">✅</span>' : isLocked ? '<span class="lesson-lock">🔒</span>' : '<span style="font-size:.75rem;color:var(--accent)">▶ Starten</span>'}
        </div>
      </div>`;
    }).join('');
    return `<div class="module-block">
      <div class="module-header">
        <span class="module-icon">${mod.icon}</span>
        <div class="module-info"><h3>${mod.title}</h3><p>${mod.desc}</p></div>
        <span class="module-progress-text">${done}/${total}</span>
      </div>
      <div style="height:4px;background:var(--border);margin:0"><div style="height:4px;background:linear-gradient(90deg,var(--green),var(--accent));width:${pct}%;transition:width .4s"></div></div>
      <div class="lessons-grid">${cards}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-lesson-id]').forEach(card => {
    if (card.classList.contains('locked')) return;
    card.addEventListener('click', () => startLesson(card.dataset.lessonId));
  });
}

/* ── LESSON PLAYER ── */
let currentLesson     = null;
let lessonBoard       = null;
let lessonGS          = null;
let lessonSolved      = false;
let lessonHintUsed    = false;

function startLesson(id) {
  const lesson = ALL_CHESS_LESSONS.find(l => l.id === id);
  if (!lesson) return;
  currentLesson  = lesson;
  lessonSolved   = false;
  lessonHintUsed = false;

  setText('lesson-view-title', lesson.title);
  setText('lesson-view-module', lesson.moduleTitle);
  setText('lesson-explanation', lesson.explanation);
  setText('lesson-task-box', lesson.task);
  setText('lesson-xp-reward', '+' + lesson.xp + ' XP');

  const fb = document.getElementById('lesson-feedback-box');
  if (fb) { fb.className = 'lesson-feedback-box'; fb.textContent = ''; fb.style.display='none'; }
  document.getElementById('btn-lesson-next')?.classList.add('hidden');

  // Build board
  const container = document.getElementById('lesson-board-container');
  if (container) {
    container.innerHTML = '';
    lessonGS = lesson.startFen ? parseFen(lesson.startFen) : parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const boardEl = buildBoardElement('lesson', handleLessonClick);
    container.appendChild(boardEl);
    setBoardSize();
    renderBoard('lesson', lessonGS, null, [], null, undefined);
  }

  showView('lesson');
}

function handleLessonClick(r, f) {
  if (!currentLesson || lessonSolved) return;
  const lesson = currentLesson;
  const alg    = coordToAlgebraic(r, f);

  // Target-square task
  if (lesson.targetSquare && alg === lesson.targetSquare) {
    completeLessonSuccess();
    // highlight target
    document.getElementById('board-grid-lesson')
      ?.querySelector(`[data-r="${r}"][data-f="${f}"]`)
      ?.classList.add('solution-move');
    return;
  }

  // Target-piece task
  if (lesson.targetPiece) {
    const piece = lessonGS.board[r][f];
    if (piece !== EMPTY && Math.abs(piece) === lesson.targetPiece.type && (piece>0)===(lesson.targetPiece.color>0)) {
      completeLessonSuccess();
      return;
    }
  }

  // Move task – two-click: select then move
  if (lesson.moveTask) {
    if (!lessonBoard) {
      lessonBoard = { selected: null };
    }
    if (!lessonBoard.selected) {
      const piece = lessonGS.board[r][f];
      if (piece !== EMPTY && (piece > 0) === (lessonGS.turn > 0)) {
        lessonBoard.selected = {r, f};
        const legal = legalMovesFor(lessonGS, r, f);
        renderBoard('lesson', lessonGS, {r,f}, legal, null, undefined);
      }
    } else {
      const from = coordToAlgebraic(lessonBoard.selected.r, lessonBoard.selected.f);
      const to   = alg;
      const task = lesson.moveTask;
      if (from === task.from && to === task.to) {
        // Check if pawn promotion needed
        const piece = lessonGS.board[lessonBoard.selected.r][lessonBoard.selected.f];
        const isPromo = Math.abs(piece) === PAWN && (r === 0 || r === 7);
        lessonGS = applyMove(lessonGS, lessonBoard.selected.r, lessonBoard.selected.f, r, f);
        renderBoard('lesson', lessonGS, null, [], {fromR:lessonBoard.selected.r,fromF:lessonBoard.selected.f,toR:r,toF:f}, undefined);
        lessonBoard = null;
        completeLessonSuccess();
      } else {
        // Wrong move
        lessonBoard = null;
        renderBoard('lesson', lessonGS, null, [], null, undefined);
        showLessonFeedback('Nicht ganz – das war nicht der gesuchte Zug. Versuche es nochmal!', false);
      }
    }
  }
}

function completeLessonSuccess() {
  lessonSolved = true;
  const lesson = currentLesson;
  if (!CS.completedLessons[lesson.id]) {
    CS.completedLessons[lesson.id] = true;
    awardXP(lesson.xp);
    updateStreak();
    checkAllAchievements();
  }
  showLessonFeedback('Richtig! Super gemacht! 🎉', true);
  document.getElementById('btn-lesson-next')?.classList.remove('hidden');
  progressDailyChallenge('lessons');
}

function showLessonFeedback(msg, ok) {
  const fb = document.getElementById('lesson-feedback-box');
  if (!fb) return;
  fb.textContent = msg;
  fb.className   = 'lesson-feedback-box show ' + (ok ? 'ok' : 'fail');
  fb.style.display = 'block';
}

/* ═══════════════════════════════════════════════════════
   11. PUZZLE SYSTEM
═══════════════════════════════════════════════════════ */
let currentPuzzleIdx    = 0;
let puzzleGS            = null;
let puzzleSolutionStep  = 0;
let puzzleHintCount     = 0;
let puzzleMistakeCount  = 0;
let puzzleSelected      = null;
let puzzleSolved        = false;

function loadPuzzle(idx) {
  currentPuzzleIdx = ((idx % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
  const puz = PUZZLES[currentPuzzleIdx];
  puzzleSolutionStep = 0;
  puzzleHintCount    = 0;
  puzzleMistakeCount = 0;
  puzzleSelected     = null;
  puzzleSolved       = false;

  puzzleGS = parseFen(puz.fen);

  const diffLabels = { easy:'Leicht', medium:'Mittel', hard:'Schwer' };
  const diffCls    = { easy:'diff-easy', medium:'diff-medium', hard:'diff-hard' };
  const badge = document.getElementById('puzzle-diff-badge');
  if (badge) { badge.textContent = diffLabels[puz.difficulty]||puz.difficulty; badge.className='puzzle-difficulty '+(diffCls[puz.difficulty]||'diff-easy'); }

  setText('puzzle-title-display', puz.title);
  setText('puzzle-desc-display',  puz.explanation?.slice(0,80) + '…');
  setText('puzzle-xp-val',        '+' + puz.xp + ' XP');
  setText('puzzle-counter',       `Puzzle ${currentPuzzleIdx+1} / ${PUZZLES.length}`);

  const fb = document.getElementById('puzzle-feedback');
  if (fb) { fb.className = 'puzzle-feedback hidden'; fb.textContent = ''; }
  const exp = document.getElementById('puzzle-explanation');
  if (exp) exp.style.display = 'none';

  const container = document.getElementById('puzzle-board-container');
  if (container) {
    container.innerHTML = '';
    const boardEl = buildBoardElement('puzzle', handlePuzzleClick);
    container.appendChild(boardEl);
    setBoardSize();
    const inCheck = isInCheck(puzzleGS, puzzleGS.turn) ? puzzleGS.turn : undefined;
    renderBoard('puzzle', puzzleGS, null, [], null, inCheck);
  }
}

function handlePuzzleClick(r, f) {
  if (puzzleSolved) return;
  const puz = PUZZLES[currentPuzzleIdx];
  const step = puz.solution[puzzleSolutionStep];
  if (!step) return;

  const stepFrom = algebraicToCoord(step.from);
  const stepTo   = algebraicToCoord(step.to);

  if (!puzzleSelected) {
    const piece = puzzleGS.board[r][f];
    if (piece === EMPTY || (piece > 0) !== (puzzleGS.turn > 0)) return;
    puzzleSelected = {r, f};
    const legal = legalMovesFor(puzzleGS, r, f);
    renderBoard('puzzle', puzzleGS, {r,f}, legal, null, undefined);
  } else {
    const from = puzzleSelected;
    puzzleSelected = null;

    if (from.r === stepFrom.r && from.f === stepFrom.f && r === stepTo.r && f === stepTo.f) {
      // Correct step — animate then apply
      animatePieceMove('puzzle', from.r, from.f, r, f, () => {
        puzzleGS = applyMove(puzzleGS, from.r, from.f, r, f);
        puzzleSolutionStep++;
        if (CS.settings.sound) SOUNDS.move();
        renderBoard('puzzle', puzzleGS, null, [], {fromR:from.r,fromF:from.f,toR:r,toF:f}, undefined);

        if (puzzleSolutionStep >= puz.solution.length) {
          puzzleSolved = true;
          if (CS.settings.sound) setTimeout(() => SOUNDS.correct(), 80);
          showPuzzleFeedback('correct', '🎉 Richtig! Ausgezeichnete Taktik!');
          markHighlight('puzzle', stepTo.r, stepTo.f, 'solution-move');
          if (!CS.solvedPuzzles[puz.id]) {
            CS.solvedPuzzles[puz.id] = { date: new Date().toISOString(), mistakes: puzzleMistakeCount, hintUsed: puzzleHintCount > 0 };
            const bonus = puzzleHintCount === 0 ? puz.xp : Math.floor(puz.xp * 0.6);
            awardXP(bonus);
            updateStreak();
            checkAllAchievements();
            if (puz.type === 'mate1' || puz.type === 'mate2') checkAndUnlock('first_mate');
            if (puzzleHintCount === 0 && puzzleMistakeCount === 0) checkAndUnlock('perfect_puzzle');
            if (puz.type === 'mate2') checkAndUnlock('mate_in_2');
            progressDailyChallenge('puzzles');
          }
          const exp = document.getElementById('puzzle-explanation');
          if (exp) { exp.textContent = puz.explanation; exp.style.display = 'block'; }
        } else {
          showPuzzleFeedback('correct', '✓ Guter Zug! Weiter…');
          setTimeout(() => {
            const nextStep = puz.solution[puzzleSolutionStep];
            if (nextStep && (puzzleGS.turn !== puz.sideToMove)) {
              const nFrom = algebraicToCoord(nextStep.from);
              const nTo   = algebraicToCoord(nextStep.to);
              animatePieceMove('puzzle', nFrom.r, nFrom.f, nTo.r, nTo.f, () => {
                puzzleGS = applyMove(puzzleGS, nFrom.r, nFrom.f, nTo.r, nTo.f);
                puzzleSolutionStep++;
                if (CS.settings.sound) SOUNDS.move();
                renderBoard('puzzle', puzzleGS, null, [], {fromR:nFrom.r,fromF:nFrom.f,toR:nTo.r,toF:nTo.f}, undefined);
                hidePuzzleFeedback();
              });
            }
          }, 450);
        }
      });
    } else {
      // Wrong move
      puzzleMistakeCount++;
      if (!CS.puzzleMistakes[puz.id]) CS.puzzleMistakes[puz.id] = 0;
      CS.puzzleMistakes[puz.id]++;
      showPuzzleFeedback('wrong', '✗ Nicht der stärkste Zug. Versuche es nochmal!');
      const cell = document.getElementById('board-grid-puzzle')?.querySelector(`[data-r="${r}"][data-f="${f}"]`);
      if (cell) { cell.classList.add('wrong-move'); setTimeout(()=>cell.classList.remove('wrong-move'), 400); }
      renderBoard('puzzle', puzzleGS, null, [], null, undefined);
      setTimeout(hidePuzzleFeedback, 1500);
    }
  }
}

function showPuzzleFeedback(type, msg) {
  const fb = document.getElementById('puzzle-feedback');
  if (!fb) return;
  fb.textContent = msg;
  fb.className = 'puzzle-feedback ' + type;
}

function hidePuzzleFeedback() {
  const fb = document.getElementById('puzzle-feedback');
  if (fb) fb.className = 'puzzle-feedback hidden';
}

function markHighlight(boardId, r, f, cls) {
  const cell = document.getElementById('board-grid-'+boardId)?.querySelector(`[data-r="${r}"][data-f="${f}"]`);
  if (cell) cell.classList.add(cls);
}

/* ═══════════════════════════════════════════════════════
   12. FREE PLAY
═══════════════════════════════════════════════════════ */
let fpGS           = null;
let fpHistory      = [];
let fpSelected     = null;
let fpLastMove     = null;
let fpGameMode     = 'pvp';
let fpAILevel      = 1;
let fpPlayerColor  = WHITE;
let fpFlipped      = false;
let fpMoveLog      = [];
let fpGameOver     = false;

function startFreeplay() {
  const modeBtn  = document.querySelector('[data-game-mode].selected');
  const colorBtn = document.querySelector('[data-color].active');
  const aiBtn    = document.querySelector('[data-ai].active');

  fpGameMode   = modeBtn?.dataset.gameMode || 'pvp';
  fpAILevel    = parseInt(aiBtn?.dataset.ai || '1');
  let color    = colorBtn?.dataset.color || 'white';
  if (color === 'random') color = Math.random() < 0.5 ? 'white' : 'black';
  fpPlayerColor = color === 'white' ? WHITE : BLACK;

  fpGS       = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  fpHistory  = [];
  fpSelected = null;
  fpLastMove = null;
  fpMoveLog  = [];
  fpGameOver = false;
  fpFlipped  = fpGameMode === 'ai' && fpPlayerColor === BLACK;

  document.getElementById('freeplay-setup').style.display = 'none';
  document.getElementById('freeplay-game').style.display  = 'block';

  const container = document.getElementById('freeplay-board-container');
  container.innerHTML = '';
  const boardEl = buildBoardElement('fp', handleFpClick);
  container.appendChild(boardEl);
  setBoardSize();
  applyFpFlip();

  updateFpBoard();
  updateFpStatus();
  updateFpMoveList();

  // Flip button
  document.getElementById('btn-fp-flip')?.addEventListener('click', () => {
    fpFlipped = !fpFlipped;
    applyFpFlip();
    updateFpBoard();
  });

  // If AI goes first (player chose black)
  if (fpGameMode === 'ai' && fpGS.turn !== fpPlayerColor) {
    const st = document.getElementById('freeplay-status');
    if (st) { st.textContent = '🤖 KI denkt...'; st.className = 'chess-status-bar status-ai-thinking'; }
    setTimeout(doAIMove, 400);
  }
}

function applyFpFlip() {
  const outer = document.getElementById('board-outer-fp');
  if (!outer) return;
  if (fpFlipped) outer.classList.add('board-flipped');
  else outer.classList.remove('board-flipped');
}

function handleFpClick(r, f) {
  if (fpGameOver) return;
  if (fpGameMode === 'ai' && fpGS.turn !== fpPlayerColor) return;

  const piece = fpGS.board[r][f];

  if (!fpSelected) {
    if (piece === EMPTY || (piece > 0) !== (fpGS.turn > 0)) return;
    fpSelected = {r, f};
    renderBoard('fp', fpGS, fpSelected, legalMovesFor(fpGS, r, f), fpLastMove, isInCheck(fpGS, fpGS.turn) ? fpGS.turn : undefined);
  } else {
    if (fpSelected.r === r && fpSelected.f === f) {
      fpSelected = null;
      updateFpBoard();
      return;
    }
    const legal = legalMovesFor(fpGS, fpSelected.r, fpSelected.f);
    const isLegal = legal.some(m => m.r===r && m.f===f);
    if (!isLegal) {
      // Re-select if clicking own piece
      if (piece !== EMPTY && (piece > 0) === (fpGS.turn > 0)) {
        fpSelected = {r, f};
        renderBoard('fp', fpGS, fpSelected, legalMovesFor(fpGS, r, f), fpLastMove, undefined);
        return;
      }
      fpSelected = null;
      updateFpBoard();
      return;
    }

    // Check pawn promotion
    const movingPiece = fpGS.board[fpSelected.r][fpSelected.f];
    const isPromo = Math.abs(movingPiece) === PAWN && (r === 0 || r === 7);

    if (isPromo) {
      showPromoModal(fpSelected.r, fpSelected.f, r, f, (promoType) => {
        executeMove(fpSelected.r, fpSelected.f, r, f, promoType);
      });
    } else {
      executeMove(fpSelected.r, fpSelected.f, r, f);
    }
  }
}

function executeMove(fromR, fromF, toR, toF, promoType=QUEEN) {
  const piece    = fpGS.board[fromR][fromF];
  const captured = fpGS.board[toR][toF];
  const isCastle = Math.abs(piece) === KING && Math.abs(toF - fromF) === 2;

  animatePieceMove('fp', fromR, fromF, toR, toF, () => {
    fpHistory.push(cloneGameState(fpGS));
    const san = buildSAN(fpGS, fromR, fromF, toR, toF, promoType);
    fpGS = applyMove(fpGS, fromR, fromF, toR, toF, promoType);
    fpLastMove = {fromR, fromF, toR, toF};
    fpSelected = null;
    fpMoveLog.push({ color: piece > 0 ? WHITE : BLACK, san, fromR, fromF, toR, toF, promo: promoType });

    if (CS.settings.sound) {
      if (isCastle) SOUNDS.castle();
      else if (captured !== EMPTY) SOUNDS.capture();
      else SOUNDS.move();
      if (isInCheck(fpGS, fpGS.turn)) setTimeout(() => SOUNDS.check(), 80);
    }

    updateFpBoard();
    updateFpStatus();
    updateFpMoveList();
    updateCapturedPieces();

    if (isCheckmate(fpGS)) {
      const winner = fpGS.turn === WHITE ? 'Schwarz' : 'Weiß';
      fpGameOver = true;
      CS.gamesPlayed++;
      if ((fpGS.turn === BLACK && fpGameMode === 'pvp') ||
          (fpGS.turn !== fpPlayerColor && fpGameMode === 'ai')) {
        CS.gamesWon++;
        checkAndUnlock('first_win');
      }
      checkAllAchievements();
      saveChessState();
      progressDailyChallenge('game');
      setTimeout(() => showGameOver('♔', winner + ' gewinnt!', 'Schachmatt – die Partie ist entschieden.'), 400);
      return;
    }
    if (isStalemate(fpGS)) {
      fpGameOver = true;
      CS.gamesPlayed++;
      saveChessState();
      setTimeout(() => showGameOver('🤝', 'Patt!', 'Keine legalen Züge – unentschieden.'), 400);
      return;
    }

    if (fpGameMode === 'ai' && fpGS.turn !== fpPlayerColor && !fpGameOver) {
      const st = document.getElementById('freeplay-status');
      if (st) { st.textContent = '🤖 KI denkt...'; st.className = 'chess-status-bar status-ai-thinking'; }
      setTimeout(doAIMove, 350);
    }
  });
}

function doAIMove() {
  if (fpGameOver) return;
  const mv = aiMove(fpGS, fpAILevel);
  if (mv) executeMove(mv.fromR, mv.fromF, mv.r, mv.f);
  else updateFpStatus();
}

function buildSAN(gs, fromR, fromF, toR, toF, promo=QUEEN) {
  const p = gs.board[fromR][fromF];
  const type = Math.abs(p);
  const to   = coordToAlgebraic(toR, toF);
  const capture = gs.board[toR][toF] !== EMPTY ? 'x' : '';
  const pieces = ['','','N','B','R','Q','K'];
  const prefix = type === PAWN ? (capture ? coordToAlgebraic(fromR,fromF)[0] : '') : pieces[type];
  const promoStr = type === PAWN && (toR===0||toR===7) ? '='+pieces[promo] : '';
  return prefix + capture + to + promoStr;
}

function updateFpBoard() {
  const inCheck = isInCheck(fpGS, fpGS.turn) ? fpGS.turn : undefined;
  renderBoard('fp', fpGS, fpSelected, fpSelected ? legalMovesFor(fpGS, fpSelected.r, fpSelected.f) : [], fpLastMove, inCheck);
}

function updateFpStatus() {
  const el = document.getElementById('freeplay-status');
  if (!el) return;
  const who = fpGS.turn === WHITE ? '♔ Weiß' : '♚ Schwarz';
  if (isCheckmate(fpGS)) {
    el.textContent = (fpGS.turn === BLACK ? '♔ Weiß' : '♚ Schwarz') + ' gewinnt! Matt!';
    el.className = 'chess-status-bar status-mate';
  } else if (isStalemate(fpGS)) {
    el.textContent = 'Patt – Unentschieden!';
    el.className = 'chess-status-bar status-stale';
  } else if (isInCheck(fpGS, fpGS.turn)) {
    el.textContent = who + ' steht im Schach!';
    el.className = 'chess-status-bar status-check';
  } else {
    el.textContent = who + ' ist am Zug';
    el.className = 'chess-status-bar';
  }
}

function updateFpMoveList() {
  const list = document.getElementById('fp-move-list');
  if (!list) return;
  const pairs = [];
  for (let i = 0; i < fpMoveLog.length; i += 2) {
    pairs.push({ num: Math.floor(i/2)+1, w: fpMoveLog[i], b: fpMoveLog[i+1] });
  }
  list.innerHTML = pairs.map(p => `
    <div class="move-pair">
      <span class="move-num">${p.num}.</span>
      <span class="move-white">${p.w?.san||''}</span>
      <span class="move-black">${p.b?.san||''}</span>
    </div>`).join('');
  list.scrollTop = list.scrollHeight;
}

function updateCapturedPieces() {
  const startCounts = {[WHITE*PAWN]:8,[WHITE*KNIGHT]:2,[WHITE*BISHOP]:2,[WHITE*ROOK]:2,[WHITE*QUEEN]:1,
                      [BLACK*PAWN]:8,[BLACK*KNIGHT]:2,[BLACK*BISHOP]:2,[BLACK*ROOK]:2,[BLACK*QUEEN]:1};
  const onBoard = {};
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p = fpGS.board[r][f];
    if (p && Math.abs(p) !== KING) onBoard[p] = (onBoard[p]||0) + 1;
  }
  const capturedWhite = [], capturedBlack = [];
  for (const [p, start] of Object.entries(startCounts)) {
    const diff = start - (onBoard[p] || 0);
    const color = +p > 0 ? WHITE : BLACK;
    const type  = Math.abs(+p);
    for (let i=0;i<diff;i++) {
      const svg = `<span class="cap-piece">${getPieceSVG(type, color === WHITE)}</span>`;
      if (color === WHITE) capturedWhite.push(svg);
      else                 capturedBlack.push(svg);
    }
  }
  const wEl = document.getElementById('fp-captured-white');
  const bEl = document.getElementById('fp-captured-black');
  if (wEl) wEl.innerHTML = '<span class="captured-label">Geschlagen</span>' + capturedWhite.join('');
  if (bEl) bEl.innerHTML = '<span class="captured-label">Geschlagen</span>' + capturedBlack.join('');
}

function showGameOver(icon, title, desc) {
  setText('go-icon',  icon);
  setText('go-title', title);
  setText('go-desc',  desc);
  document.getElementById('game-over-overlay')?.classList.remove('hidden');
}

/* ── PAWN PROMOTION ── */
let promoCallback = null;

function showPromoModal(fromR, fromF, toR, toF, cb) {
  promoCallback = cb;
  const color   = fpGS.board[fromR][fromF] > 0 ? WHITE : BLACK;
  const choices = document.getElementById('promo-choices');
  if (!choices) return;
  choices.innerHTML = [QUEEN,ROOK,BISHOP,KNIGHT].map(t =>
    `<button class="promo-btn" data-promo="${t}">${PIECE_UNICODE[color][t]}</button>`
  ).join('');
  choices.querySelectorAll('.promo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('promo-overlay')?.classList.add('hidden');
      if (promoCallback) promoCallback(+btn.dataset.promo);
    });
  });
  document.getElementById('promo-overlay')?.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════════════
   13. STATS VIEW
═══════════════════════════════════════════════════════ */
function renderStats() {
  const solved   = Object.keys(CS.solvedPuzzles).length;
  const total    = PUZZLES.length;
  const winrate  = CS.gamesPlayed > 0 ? Math.round((CS.gamesWon/CS.gamesPlayed)*100) : 0;
  const perfSolved = Object.values(CS.solvedPuzzles).filter(s => !s.hintUsed && s.mistakes===0).length;

  const statsData = [
    { val: solved,          lbl: 'Puzzles gelöst' },
    { val: total,           lbl: 'Puzzles gesamt' },
    { val: CS.gamesPlayed,  lbl: 'Partien gespielt' },
    { val: CS.gamesWon,     lbl: 'Siege' },
    { val: winrate + '%',   lbl: 'Winrate' },
    { val: CS.streak,       lbl: 'Tage Streak' },
    { val: CS.xp,           lbl: 'Gesamt XP' },
    { val: perfSolved,      lbl: 'Fehlerfrei gelöst' },
  ];

  const grid = document.getElementById('chess-stats-grid');
  if (grid) grid.innerHTML = statsData.map(s =>
    `<div class="chess-stat-card"><span class="chess-stat-val">${s.val}</span><span class="chess-stat-lbl">${s.lbl}</span></div>`
  ).join('');

  // Puzzle categories
  const cats = {};
  PUZZLES.forEach(p => {
    const done = CS.solvedPuzzles[p.id];
    if (!cats[p.type]) cats[p.type] = {done:0,total:0};
    cats[p.type].total++;
    if (done) cats[p.type].done++;
  });
  const catNames = {mate1:'Matt in 1',mate2:'Matt in 2',fork:'Gabel',pin:'Fesselung',skewer:'Spieß',
                    backrank:'Grundreihenmatt',smothered:'Ersticktes Matt',promotion:'Bauernumwandlung',
                    endgame:'Endspiel',trap:'Falle',zugzwang:'Zugzwang',battery:'Batterie',sacrifice:'Opfer',double_check:'Doppelschach'};
  const catsEl = document.getElementById('chess-puzzle-cats');
  if (catsEl) catsEl.innerHTML = Object.entries(cats).map(([type,{done,total}]) =>
    `<div class="pb-row"><span>${catNames[type]||type}</span><span>${done}/${total}</span></div>`
  ).join('');

  const bests = document.getElementById('chess-personal-bests');
  if (bests) bests.innerHTML = `
    <div class="pb-row"><span>XP gesamt</span><span>${CS.xp}</span></div>
    <div class="pb-row"><span>Level</span><span>${CS.level}</span></div>
    <div class="pb-row"><span>Streak-Rekord</span><span>${CS.streak} Tage</span></div>
    <div class="pb-row"><span>Lektionen</span><span>${Object.keys(CS.completedLessons).length} / ${ALL_CHESS_LESSONS.length}</span></div>
  `;

  // Activity grid
  const agEl = document.getElementById('chess-activity-grid');
  if (agEl) {
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(Date.now() - i*86400000).toISOString().slice(0,10);
      const count = CS.activityLog?.[d] || 0;
      const cls = count >= 5 ? 'active-4' : count >= 3 ? 'active-3' : count >= 1 ? 'active-2' : '';
      const today = new Date().toISOString().slice(0,10) === d ? 'today' : '';
      days.push(`<div class="ag-day ${cls} ${today}" title="${d}"></div>`);
    }
    agEl.innerHTML = days.join('');
  }
}

/* ═══════════════════════════════════════════════════════
   14. ACHIEVEMENTS VIEW
═══════════════════════════════════════════════════════ */
function renderAchievements() {
  const grid = document.getElementById('chess-achievements-grid');
  if (!grid) return;
  const unlocked = CS.achievements.length;
  setText('chess-ach-progress', `${unlocked} von ${CHESS_ACHIEVEMENTS.length} freigeschaltet`);
  grid.innerHTML = CHESS_ACHIEVEMENTS.map(a => {
    const done = CS.achievements.includes(a.id);
    return `<div class="ach-card ${done?'unlocked':'locked'}">
      <span class="ach-icon">${a.icon}</span>
      <h4>${a.title}</h4>
      <p>${a.desc}</p>
      ${done ? '<span class="ach-unlocked-tag">✓ Freigeschaltet</span>' : ''}
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   15. TOASTS & OVERLAYS
═══════════════════════════════════════════════════════ */
function showAchievementToast(def) {
  const toast = document.getElementById('achievement-toast');
  const icon  = document.getElementById('at-icon');
  const name  = document.getElementById('at-name');
  if (!toast) return;
  if (icon) icon.textContent = def.icon;
  if (name) name.textContent = def.title;
  toast.classList.remove('hidden','toast-out');
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 3500);
}

function showLevelUp(rank) {
  const overlay = document.getElementById('levelup-overlay');
  setText('lu-level', rank.level);
  setText('lu-rank',  rank.title);
  overlay?.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════════════
   16. BOARD SIZE
═══════════════════════════════════════════════════════ */
const BOARD_SIZES = { sm: 280, md: 400, lg: 480 };

function setBoardSize() {
  const size = BOARD_SIZES[CS.settings.boardSize] || 400;
  document.documentElement.style.setProperty('--board-size', size + 'px');
  document.querySelectorAll('.chess-board').forEach(b => {
    b.style.width  = size + 'px';
    b.style.height = size + 'px';
  });
  document.querySelectorAll('.chess-coords-left,.chess-coords-right').forEach(c => {
    c.style.height = size + 'px';
  });
}

/* ═══════════════════════════════════════════════════════
   17. UTILITY HELPERS
═══════════════════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

function updateOnlineUI(online) {
  const ind   = document.getElementById('online-indicator');
  const label = document.getElementById('oi-label');
  if (online) {
    ind?.classList.add('online');
    if (label) label.textContent = 'Online';
  } else {
    ind?.classList.remove('online');
    if (label) label.textContent = 'Offline';
  }
}

/* ═══════════════════════════════════════════════════════
   18. SETTINGS
═══════════════════════════════════════════════════════ */
function applySettings() {
  document.documentElement.dataset.theme = CS.settings.theme;
  const darkBtn  = document.getElementById('set-dark');
  const lightBtn = document.getElementById('set-light');
  if (darkBtn)  darkBtn.classList.toggle('active',  CS.settings.theme === 'dark');
  if (lightBtn) lightBtn.classList.toggle('active', CS.settings.theme === 'light');

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.textContent = CS.settings.theme === 'dark' ? '🌙' : '☀️';

  const showLegal = document.getElementById('set-show-legal');
  if (showLegal) showLegal.checked = CS.settings.showLegal !== false;
  const showLast = document.getElementById('set-show-last-move');
  if (showLast) showLast.checked  = CS.settings.showLastMove !== false;
  const sound = document.getElementById('set-sound');
  if (sound) sound.checked = CS.settings.sound !== false;

  ['sm','md','lg'].forEach(s => {
    document.getElementById('set-board-'+s)?.classList.toggle('active', CS.settings.boardSize === s);
  });
  setBoardSize();

  /* Board theme */
  const bt = CS.settings.boardTheme || 'classic';
  document.documentElement.dataset.boardTheme = bt === 'classic' ? '' : bt;
  document.querySelectorAll('[data-board-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.boardTheme === bt);
  });
}

/* ═══════════════════════════════════════════════════════
   19. EVENT BINDING
═══════════════════════════════════════════════════════ */
function bindEvents() {
  // Navigation
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Hamburger
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  // Theme
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    CS.settings.theme = CS.settings.theme === 'dark' ? 'light' : 'dark';
    applySettings(); saveChessState();
  });
  document.getElementById('set-dark')?.addEventListener('click', () => {
    CS.settings.theme = 'dark'; applySettings(); saveChessState();
  });
  document.getElementById('set-light')?.addEventListener('click', () => {
    CS.settings.theme = 'light'; applySettings(); saveChessState();
  });

  // Board size
  ['sm','md','lg'].forEach(s => {
    document.getElementById('set-board-'+s)?.addEventListener('click', () => {
      CS.settings.boardSize = s; applySettings(); saveChessState();
    });
  });

  // Board theme picker
  document.querySelectorAll('[data-board-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      CS.settings.boardTheme = btn.dataset.boardTheme;
      applySettings();
      saveChessState();
    });
  });

  // Settings toggles
  document.getElementById('set-show-legal')?.addEventListener('change', e => {
    CS.settings.showLegal = e.target.checked; saveChessState();
  });
  document.getElementById('set-show-last-move')?.addEventListener('change', e => {
    CS.settings.showLastMove = e.target.checked; saveChessState();
  });
  document.getElementById('set-sound')?.addEventListener('change', e => {
    CS.settings.sound = e.target.checked; saveChessState();
  });

  // Dashboard buttons
  document.getElementById('btn-chess-next-lesson')?.addEventListener('click', () => {
    const next = ALL_CHESS_LESSONS.find(l => !CS.completedLessons[l.id]) || ALL_CHESS_LESSONS[0];
    if (next) startLesson(next.id);
  });
  document.getElementById('btn-chess-next-puzzle')?.addEventListener('click', () => {
    const idx = PUZZLES.findIndex(p => !CS.solvedPuzzles[p.id]);
    showView('puzzles');
    loadPuzzle(idx >= 0 ? idx : 0);
  });

  // Lesson controls
  document.getElementById('btn-back-lesson')?.addEventListener('click', () => showView('course'));
  document.getElementById('btn-lesson-reset')?.addEventListener('click', () => {
    if (currentLesson) startLesson(currentLesson.id);
  });
  document.getElementById('btn-lesson-hint')?.addEventListener('click', () => {
    if (!currentLesson) return;
    lessonHintUsed = true;
    const hintText = currentLesson.hints?.[0] || 'Schau dir die Figuren genau an.';
    showLessonFeedback('💡 Hinweis: ' + hintText, true);
  });
  document.getElementById('btn-lesson-next')?.addEventListener('click', () => {
    if (!currentLesson) return;
    const idx = ALL_CHESS_LESSONS.findIndex(l => l.id === currentLesson.id);
    const next = ALL_CHESS_LESSONS[idx + 1];
    if (next) startLesson(next.id);
    else showView('course');
  });

  // Puzzle controls
  document.getElementById('btn-prev-puzzle')?.addEventListener('click', () => loadPuzzle(currentPuzzleIdx - 1));
  document.getElementById('btn-next-puzzle-nav')?.addEventListener('click', () => loadPuzzle(currentPuzzleIdx + 1));
  document.getElementById('btn-random-puzzle')?.addEventListener('click', () => loadPuzzle(Math.floor(Math.random() * PUZZLES.length)));
  document.getElementById('btn-puzzle-reset')?.addEventListener('click', () => loadPuzzle(currentPuzzleIdx));
  document.getElementById('btn-puzzle-hint')?.addEventListener('click', () => {
    puzzleHintCount++;
    const puz = PUZZLES[currentPuzzleIdx];
    const hint = puz.hints[Math.min(puzzleHintCount - 1, puz.hints.length - 1)] || 'Schau dir die Züge genau an.';
    showPuzzleFeedback('info', '💡 ' + hint);
    setTimeout(hidePuzzleFeedback, 3000);
  });

  // Free play setup
  document.querySelectorAll('[data-game-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-game-mode]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const aiSettings = document.getElementById('ai-settings');
      if (aiSettings) aiSettings.style.display = btn.dataset.gameMode === 'ai' ? 'block' : 'none';
    });
  });
  document.querySelectorAll('[data-ai]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ai]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('btn-start-freeplay')?.addEventListener('click', startFreeplay);

  // Free play in-game controls
  document.getElementById('btn-fp-undo')?.addEventListener('click', undoFpMove);
  document.getElementById('btn-fp-undo2')?.addEventListener('click', undoFpMove);
  document.getElementById('btn-fp-reset')?.addEventListener('click', resetFreeplay);
  document.getElementById('btn-fp-reset2')?.addEventListener('click', resetFreeplay);
  document.getElementById('btn-fp-analyze')?.addEventListener('click', startAnalysis);

  // Game over modal
  document.getElementById('btn-go-new')?.addEventListener('click', () => {
    document.getElementById('game-over-overlay')?.classList.add('hidden');
    resetFreeplay();
  });
  document.getElementById('btn-go-undo')?.addEventListener('click', () => {
    document.getElementById('game-over-overlay')?.classList.add('hidden');
    undoFpMove();
  });
  document.getElementById('btn-go-analyze')?.addEventListener('click', startAnalysis);

  // Level up close
  document.getElementById('btn-lu-close')?.addEventListener('click', () => {
    document.getElementById('levelup-overlay')?.classList.add('hidden');
  });

  // Reset data
  document.getElementById('btn-chess-reset')?.addEventListener('click', () => {
    if (confirm('Wirklich alle Schach-Daten zurücksetzen?')) {
      CS = JSON.parse(JSON.stringify(DEFAULT_CHESS_STATE));
      saveChessState();
      applySettings();
      updateNavXP();
      showView('dashboard');
    }
  });
}

function undoFpMove() {
  if (!fpHistory.length) return;
  fpGS      = fpHistory.pop();
  fpMoveLog.pop();
  fpLastMove = null;
  fpSelected = null;
  fpGameOver = false;
  updateFpBoard();
  updateFpStatus();
  updateFpMoveList();
  updateCapturedPieces();
}

function resetFreeplay() {
  document.getElementById('freeplay-setup').style.display = 'block';
  document.getElementById('freeplay-game').style.display  = 'none';
  fpGS = fpHistory = fpSelected = fpLastMove = null;
  fpMoveLog = [];
  fpGameOver = false;
}

/* ═══════════════════════════════════════════════════════
   20. INIT
═══════════════════════════════════════════════════════ */
async function init() {
  try { loadChessState(); }     catch (e) { console.warn('loadChessState:', e); }
  try { initDailyChallenge(); } catch (e) { console.warn('initDailyChallenge:', e); }

  const splashStatus = document.getElementById('splash-status');
  let appBooted   = false;
  let eventsBound = false;

  function bootApp() {
    if (appBooted) return;
    appBooted = true;
    if (!eventsBound) {
      try { applySettings(); }  catch (e) { console.warn('applySettings:', e); }
      try { updateNavXP(); }    catch (e) { console.warn('updateNavXP:', e); }
      try { bindEvents(); }     catch (e) { console.warn('bindEvents:', e); }
      eventsBound = true;
    }
    setTimeout(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.classList.add('fade-out');
      setTimeout(() => {
        if (splash) splash.style.display = 'none';
        document.getElementById('app')?.classList.remove('hidden');
        const firstUnsolved = PUZZLES.findIndex(p => !CS.solvedPuzzles[p.id]);
        loadPuzzle(firstUnsolved >= 0 ? firstUnsolved : 0);
        showView('dashboard');
      }, 400);
    }, 1600);
  }

  setTimeout(() => {
    if (!appBooted) {
      if (splashStatus) splashStatus.textContent = 'Offline-Modus';
      updateOnlineUI(false);
      bootApp();
    }
  }, 3000);

  try {
    if (splashStatus) splashStatus.textContent = 'Verbinde mit Server…';
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('Firebase Auth fehlgeschlagen:', e.message);
    if (splashStatus) splashStatus.textContent = 'Offline-Modus';
  }

  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUserId = user.uid;
      if (!appBooted && splashStatus) splashStatus.textContent = 'Lade Schach-Profil…';
      const cloudLoaded = await loadChessFromFirebase();
      if (!cloudLoaded) syncChessToFirebase();
      updateOnlineUI(true);
      setTimeout(syncLeaderboard, 4000);
    } else {
      updateOnlineUI(false);
    }
    bootApp();
  });
}

init();

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG A — SOUND ENGINE (Web Audio API, keine Dateien)
═══════════════════════════════════════════════════════ */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.18) {
  if (!CS.settings.sound) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playChord(freqs, duration, delay = 0) {
  freqs.forEach((f, i) => setTimeout(() => playTone(f, duration), i * delay));
}

const SOUNDS = {
  move()    { playTone(440, 0.08, 'sine', 0.12); },
  capture() { playTone(220, 0.18, 'sawtooth', 0.15); playTone(180, 0.15, 'sine', 0.08); },
  check()   { playChord([660, 880], 0.25, 60); },
  correct() { playChord([523, 659, 784], 0.35, 80); },
  wrong()   { playTone(150, 0.3, 'square', 0.12); },
  levelUp() { playChord([523, 659, 784, 1047], 0.5, 100); },
  castle()  { playTone(330, 0.12, 'triangle', 0.14); playTone(440, 0.12, 'triangle', 0.14); },
};

/* Sounds are now integrated directly in executeMove */

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG B — 15 WEITERE PUZZLES
═══════════════════════════════════════════════════════ */
const EXTRA_PUZZLES = [
  { id:'p21', title:'Abzugsschach', difficulty:'medium', xp:45, type:'discovered_check',
    fen:'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    sideToMove: WHITE,
    solution:[{from:'f3',to:'e5'}],
    hints:['Springer schlägt auf e5 – was wird freigelegt?'],
    explanation:'Se5! enthüllt den Läufer auf c4, der nun f7 angreift. Abzugsschach!' },

  { id:'p22', title:'Turm dominiert', difficulty:'easy', xp:30, type:'rook_endgame',
    fen:'8/8/8/4k3/8/4K3/4R3/8 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'e2',to:'e8'}],
    hints:['Turm auf die 8. Reihe – König ist eingesperrt.'],
    explanation:'Te8 sperrt den schwarzen König auf die letzte Reihe. Klassisches Turmendspiel.' },

  { id:'p23', title:'Doppelbauer-Schwäche', difficulty:'medium', xp:40, type:'pawn_tactics',
    fen:'6k1/p4ppp/1p6/2p5/2P5/1P4PP/P4P2/6K1 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'c4',to:'b5'}],
    hints:['Bauernstruktur ausnutzen – was schlägt wohin?'],
    explanation:'cxb5! gewinnt einen Bauern und erzeugt einen Freibauern.' },

  { id:'p24', title:'Windmühle', difficulty:'hard', xp:70, type:'windmill',
    fen:'6k1/ppp2Rpp/3p4/3N4/8/8/PPP3PP/6K1 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'f7',to:'g7'},{from:'g8',to:'h8'},{from:'g7',to:'f7'},{from:'h8',to:'g8'},{from:'d5',to:'e7'}],
    hints:['Turm gibt abwechselnd Schach – die Windmühle dreht sich!'],
    explanation:'Tg7+ Kh8, Tf7! Kg8, Tg7+ Kh8, Se7 – Springerfork gewinnt Material.' },

  { id:'p25', title:'Philidor-Position', difficulty:'hard', xp:65, type:'endgame',
    fen:'8/8/8/3k4/3R4/8/3K4/8 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'d4',to:'d6'}],
    hints:['Turm auf die 6. Reihe – Philidor-Technik!'],
    explanation:'Td6! hält den schwarzen König zurück. Kernprinzip des Turmendspiel-Remises.' },

  { id:'p26', title:'Läuferpaar', difficulty:'medium', xp:45, type:'bishop_pair',
    fen:'2b5/8/8/8/8/8/8/2B1K3 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'c1',to:'h6'}],
    hints:['Läufer decken sich gegenseitig – koordinierte Diagonalen!'],
    explanation:'Lh6 deckt g7 und h6. Zwei Läufer kontrollieren das Brett diagonal.' },

  { id:'p27', title:'Gegenspiel im Endspiel', difficulty:'hard', xp:60, type:'counterplay',
    fen:'8/p7/8/1P6/8/8/8/k1K5 b - - 0 1',
    sideToMove: BLACK,
    solution:[{from:'a7',to:'a5'},{from:'a5',to:'a4'}],
    hints:['Schwarzer Bauer läuft – kann er umwandeln?'],
    explanation:'a7–a5–a4! Der Freibauer erzwingt Aufmerksamkeit und schafft Gegenspiel.' },

  { id:'p28', title:'Springergabel auf f2', difficulty:'medium', xp:45, type:'fork',
    fen:'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 1',
    sideToMove: BLACK,
    solution:[{from:'f6',to:'g4'}],
    hints:['Springer angreifen h2? Nein – auf g4 greift er f2 und h2!'],
    explanation:'Sg4! bedroht f2 und zwingt Weiß in Verteidigung. Springertaktik.' },

  { id:'p29', title:'Rückreihenmatt droht', difficulty:'medium', xp:45, type:'backrank',
    fen:'6k1/5ppp/8/8/8/6P1/5P1P/R5K1 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'a1',to:'a8'}],
    hints:['Weiß droht Matt auf der Grundreihe – sofort zuschlagen!'],
    explanation:'Ta8+! erzwingt Kg8–Kf8 (kein Kg7 wegen Rückreihenmatt). Turm dominiert.' },

  { id:'p30', title:'Damenopfer für Remis', difficulty:'hard', xp:75, type:'sacrifice',
    fen:'6k1/6p1/7p/8/8/8/6PP/3Q2K1 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'d1',to:'d8'}],
    hints:['Manchmal ist Patt das Ziel – Damenopfer!'],
    explanation:'Dd8+! Kxd8 führt zu Patt wenn Weiß am Zug ist. Rettendes Damenopfer.' },

  { id:'p31', title:'Springervorposten', difficulty:'medium', xp:40, type:'outpost',
    fen:'r1b1k2r/ppqn1ppp/3pp3/2pN4/2P5/4PN2/PP3PPP/R1BQK2R w KQkq - 0 1',
    sideToMove: WHITE,
    solution:[{from:'d5',to:'c7'}],
    hints:['Springer auf d5 springt in den feindlichen Bereich – wo?'],
    explanation:'Sc7+! Der Springer springt in c7 und gabelt König und Turm.' },

  { id:'p32', title:'Freibauer-Rennen', difficulty:'hard', xp:65, type:'pawn_race',
    fen:'8/8/8/2k5/2p5/8/2K5/8 b - - 0 1',
    sideToMove: BLACK,
    solution:[{from:'c4',to:'c3'},{from:'c3',to:'c2'},{from:'c2',to:'c1'}],
    hints:['Bauer einfach laufen lassen – König schützt!'],
    explanation:'c3–c2–c1=D! Schwarzer Bauer wandelt um. König auf c5 schützt den Weg.' },

  { id:'p33', title:'Überladene Figur', difficulty:'medium', xp:50, type:'overloaded',
    fen:'r1b2rk1/ppq2ppp/2n1p3/8/3P4/2PB4/PP3PPP/R1BQR1K1 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'d3',to:'h7'}],
    hints:['Welche schwarze Figur schützt mehrere Felder? Überlasten!'],
    explanation:'Lxh7+! Der König muss schlagen. Die überladene Dame verliert Deckung auf c7.' },

  { id:'p34', title:'Interferenz-Taktik', difficulty:'hard', xp:70, type:'interference',
    fen:'3r4/8/3k4/3n4/3K4/8/8/3R4 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'d1',to:'d5'}],
    hints:['Interferenz! Turm schlägt auf d5 und trennt Springer von der 8. Reihe.'],
    explanation:'Txd5+! erzwingt Kxd5. Der schwarze Turm verliert Verbindung zum König.' },

  { id:'p35', title:'X-ray Angriff', difficulty:'hard', xp:65, type:'xray',
    fen:'6k1/8/8/3b4/8/8/8/3R2K1 w - - 0 1',
    sideToMove: WHITE,
    solution:[{from:'d1',to:'d5'}],
    hints:['Röntgen-Angriff: Was sieht der Turm hinter dem Läufer?'],
    explanation:'Txd5! Der Turm schlägt durch den Läufer hindurch. X-Ray-Taktik!' },
];

/* Alle Puzzles zusammenführen */
PUZZLES.push(...EXTRA_PUZZLES);

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG C — ERÖFFNUNGSTRAINER
═══════════════════════════════════════════════════════ */
const OPENINGS = [
  {
    id: 'ruy_lopez', name: 'Spanische Partie', eco: 'C60', icon: '♞',
    description: 'Eine der ältesten und meistgespielten Eröffnungen. Weiß greift sofort den Springer an, der den e5-Bauern verteidigt.',
    moves: [
      { white: 'e2-e4', black: 'e7-e5', comment: 'Beide Seiten besetzen das Zentrum.' },
      { white: 'g1-f3', black: 'b8-c6', comment: 'Springer entwickeln, e5 angreifen bzw. verteidigen.' },
      { white: 'f1-b5', comment: 'Die spanische Aufstellung – Läufer greift den c6-Springer an.' },
    ],
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    xp: 40,
  },
  {
    id: 'italian', name: 'Italienische Partie', eco: 'C50', icon: '♗',
    description: 'Klassische Entwicklung: Springer nach f3, Läufer nach c4. Zielt auf das schwache f7-Feld.',
    moves: [
      { white: 'e2-e4', black: 'e7-e5', comment: 'Offene Eröffnung.' },
      { white: 'g1-f3', black: 'b8-c6', comment: 'Beide entwickeln Springer.' },
      { white: 'f1-c4', comment: 'Läufer nach c4 – greift f7 an.' },
    ],
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    xp: 35,
  },
  {
    id: 'sicilian', name: 'Sizilianische Verteidigung', eco: 'B20', icon: '♙',
    description: 'Schwarz antwortet asymmetrisch auf e4. Führt oft zu scharfen, unbalancierten Stellungen.',
    moves: [
      { white: 'e2-e4', black: 'c7-c5', comment: 'Schwarz kämpft ums Zentrum asymmetrisch.' },
      { white: 'g1-f3', comment: 'Springer entwickeln, d4-Vorstoß vorbereiten.' },
    ],
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    xp: 45,
  },
  {
    id: 'queens_gambit', name: "Damengambit", eco: 'D06', icon: '♕',
    description: 'Weiß bietet einen Bauern an, um das Zentrum zu kontrollieren. Einer der solidesten Eröffnungskomplexe.',
    moves: [
      { white: 'd2-d4', black: 'd7-d5', comment: 'Beide besetzen das Zentrum.' },
      { white: 'c2-c4', comment: 'Gambit-Angebot – c4-Bauer anbieten.' },
    ],
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    xp: 40,
  },
  {
    id: 'kings_indian', name: "Königsindische Verteidigung", eco: 'E60', icon: '♚',
    description: 'Schwarz lässt Weiß das Zentrum bauen und greift es dann dynamisch an. Liebling von Fischer und Kasparov.',
    moves: [
      { white: 'd2-d4', black: 'g8-f6', comment: 'Springer entwickeln, Zentrum beobachten.' },
      { white: 'c2-c4', black: 'g7-g6', comment: 'Schwarz bereitet Läufer-Fianchetto vor.' },
      { white: 'b1-c3', black: 'f8-g7', comment: 'Läufer nach g7 – der "Drachen-Läufer".' },
    ],
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    xp: 50,
  },
];

/* State für Eröffnungstrainer */
let currentOpening  = null;
let openingStep     = 0;
let openingGS       = null;
let openingSelected = null;

function parseMoveUCI(uci) {
  /* e2-e4 oder e2e4 → {fromR, fromF, toR, toF} */
  const clean = uci.replace('-', '');
  return {
    fromR: 8 - parseInt(clean[1]),
    fromF: clean.charCodeAt(0) - 97,
    toR:   8 - parseInt(clean[3]),
    toF:   clean.charCodeAt(2) - 97,
  };
}

function startOpening(id) {
  const op = OPENINGS.find(o => o.id === id);
  if (!op) return;
  currentOpening  = op;
  openingStep     = 0;
  openingGS       = parseFen(op.startFen);
  openingSelected = null;

  const container = document.getElementById('opening-board-container');
  if (container) {
    container.innerHTML = '';
    const boardEl = buildBoardElement('opening', handleOpeningClick);
    container.appendChild(boardEl);
    setBoardSize();
    renderBoard('opening', openingGS, null, [], null, undefined);
  }

  renderOpeningStep();
}

function renderOpeningStep() {
  if (!currentOpening) return;
  const moves    = currentOpening.moves;
  const moveIdx  = Math.floor(openingStep / 2);
  const isWhite  = openingStep % 2 === 0;
  const move     = moves[moveIdx];
  if (!move) {
    // Opening complete
    setText('opening-task', '✅ Eröffnung vollständig! Gut gespielt!');
    setText('opening-comment', currentOpening.description);
    document.getElementById('btn-opening-next')?.classList.remove('hidden');
    if (!CS.completedLessons['op_' + currentOpening.id]) {
      CS.completedLessons['op_' + currentOpening.id] = true;
      awardXP(currentOpening.xp);
      saveChessState();
    }
    return;
  }
  const uci  = isWhite ? move.white : move.black;
  const side = isWhite ? 'Weiß' : 'Schwarz';
  if (!uci) {
    // Auto-play if no move for this side
    openingStep++;
    renderOpeningStep();
    return;
  }
  setText('opening-task', `${side} zieht: Mache den nächsten Eröffnungszug!`);
  setText('opening-comment', move.comment || '');
}

function handleOpeningClick(r, f) {
  if (!currentOpening) return;
  const moves   = currentOpening.moves;
  const moveIdx = Math.floor(openingStep / 2);
  const isWhite = openingStep % 2 === 0;
  const move    = moves[moveIdx];
  if (!move) return;
  const uci = isWhite ? move.white : move.black;
  if (!uci) return;
  const expected = parseMoveUCI(uci);

  if (!openingSelected) {
    const piece = openingGS.board[r][f];
    if (piece === EMPTY || (piece > 0) !== (openingGS.turn > 0)) return;
    openingSelected = { r, f };
    renderBoard('opening', openingGS, openingSelected, legalMovesFor(openingGS, r, f), null, undefined);
  } else {
    const from = openingSelected;
    openingSelected = null;
    if (from.r === expected.fromR && from.f === expected.fromF && r === expected.toR && f === expected.toF) {
      SOUNDS.correct();
      openingGS = applyMove(openingGS, from.r, from.f, r, f);
      openingStep++;
      renderBoard('opening', openingGS, null, [], {fromR:from.r,fromF:from.f,toR:r,toF:f}, undefined);
      renderOpeningStep();
    } else {
      SOUNDS.wrong();
      renderBoard('opening', openingGS, null, [], null, undefined);
      setText('opening-comment', '✗ Nicht der Eröffnungszug. Versuche es nochmal! Tipp: ' + uci.replace('-',''));
    }
  }
}

/* ── Eröffnungs-HTML in chess.html dynamisch injizieren ── */
function injectOpeningView() {
  const main = document.getElementById('main-content');
  if (!main || document.getElementById('view-openings')) return;

  const section = document.createElement('section');
  section.className = 'view';
  section.id = 'view-openings';
  section.innerHTML = `
    <div class="view-header"><h2>Eröffnungstrainer</h2><p>Lerne die wichtigsten Schacheröffnungen Zug für Zug</p></div>
    <div id="opening-list" class="chess-modules"></div>
    <div id="opening-player" style="display:none">
      <div class="training-header">
        <button class="btn-back" id="btn-back-opening">← Zurück</button>
        <div class="training-meta">
          <h2 id="opening-title">Eröffnung</h2>
          <span id="opening-eco" class="mode-badge">ECO</span>
        </div>
        <button class="btn-ghost btn-sm" id="btn-opening-restart">↺ Neu</button>
      </div>
      <div class="chess-lesson-wrap">
        <div class="chess-lesson-text">
          <p id="opening-desc" style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-2);line-height:1.7"></p>
          <div class="lesson-task-box" id="opening-task">Starte die Eröffnung…</div>
          <p id="opening-comment" style="margin-top:.5rem;font-size:.82rem;color:var(--text-2);font-style:italic;min-height:1.5rem"></p>
          <button class="btn-primary hidden" id="btn-opening-next" style="margin-top:.75rem">Nächste Eröffnung ▶</button>
        </div>
        <div id="opening-board-container"></div>
      </div>
    </div>`;
  main.appendChild(section);

  /* Sidebar link */
  const sidebar = document.querySelector('.nav-menu');
  if (sidebar && !document.querySelector('[data-view="openings"]')) {
    const li = document.createElement('li');
    li.innerHTML = '<button class="nav-item" data-view="openings">♜ Eröffnungen</button>';
    const puzzlesBtn = sidebar.querySelector('[data-view="puzzles"]')?.closest('li');
    if (puzzlesBtn) puzzlesBtn.after(li);
    else sidebar.appendChild(li);
    li.querySelector('button')?.addEventListener('click', () => showView('openings'));
  }

  /* Back button */
  document.getElementById('btn-back-opening')?.addEventListener('click', () => {
    document.getElementById('opening-list').style.display = '';
    document.getElementById('opening-player').style.display = 'none';
  });
  document.getElementById('btn-opening-restart')?.addEventListener('click', () => {
    if (currentOpening) startOpening(currentOpening.id);
  });
  document.getElementById('btn-opening-next')?.addEventListener('click', () => {
    const idx = OPENINGS.findIndex(o => o.id === currentOpening?.id);
    const next = OPENINGS[idx + 1];
    if (next) launchOpening(next.id);
    else {
      document.getElementById('opening-list').style.display = '';
      document.getElementById('opening-player').style.display = 'none';
    }
  });

  renderOpeningList();
}

function launchOpening(id) {
  document.getElementById('opening-list').style.display = 'none';
  document.getElementById('opening-player').style.display = '';
  const op = OPENINGS.find(o => o.id === id);
  if (op) {
    setText('opening-title', op.name);
    setText('opening-eco', op.eco);
    setText('opening-desc', op.description);
  }
  document.getElementById('btn-opening-next')?.classList.add('hidden');
  startOpening(id);
}

function renderOpeningList() {
  const el = document.getElementById('opening-list');
  if (!el) return;
  el.innerHTML = OPENINGS.map(op => {
    const done = CS.completedLessons['op_' + op.id];
    return `<div class="module-block" style="cursor:pointer" data-opening-id="${op.id}">
      <div class="module-header">
        <span class="module-icon">${op.icon}</span>
        <div class="module-info"><h3>${op.name}</h3><p>${op.description.slice(0,80)}…</p></div>
        <div style="display:flex;align-items:center;gap:.5rem">
          ${done ? '<span style="color:var(--green)">✅</span>' : ''}
          <span style="font-size:.75rem;color:var(--green);font-weight:700">+${op.xp} XP</span>
          <span class="module-progress-text">${op.eco}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-opening-id]').forEach(card => {
    card.addEventListener('click', () => launchOpening(card.dataset.openingId));
  });
}

/* Override showView to inject opening view on first access */
const _origShowView = showView;
showView = function(name) {
  _origShowView(name);
  if (name === 'openings') {
    injectOpeningView();
    renderOpeningList();
  }
};

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG D — HUB-LINK + SYNC-CODE IN EINSTELLUNGEN
═══════════════════════════════════════════════════════ */
function injectHubLinkAndSync() {
  /* Hub link in sidebar footer */
  const footer = document.querySelector('.sidebar-footer');
  if (footer && !document.getElementById('hub-link')) {
    const link = document.createElement('a');
    link.id        = 'hub-link';
    link.href      = 'index.html';
    link.className = 'nav-item';
    link.style.display = 'flex';
    link.textContent   = '🏠 Zur Startseite';
    footer.insertAdjacentElement('beforebegin', link);
  }

  /* Sync code section in settings */
  const settingsList = document.querySelector('.settings-list');
  if (settingsList && !document.getElementById('sync-settings-section')) {
    const section = document.createElement('div');
    section.id        = 'sync-settings-section';
    section.className = 'settings-section';
    section.innerHTML = `
      <h3>Geräte-Synchronisation</h3>
      <div class="setting-row">
        <label>Dein Sync-Code</label>
        <div style="display:flex;gap:.5rem;align-items:center">
          <span id="settings-sync-code"
                style="font-family:var(--font-mono);font-size:1rem;font-weight:800;letter-spacing:.12em;color:var(--accent-2);background:var(--accent-glow);padding:.2rem .6rem;border-radius:var(--radius-sm)">
            ……
          </span>
          <button class="btn-ghost btn-sm" id="btn-copy-sync-code">📋 Kopieren</button>
        </div>
      </div>
      <div class="setting-row">
        <label>Code eingeben</label>
        <div style="display:flex;gap:.5rem">
          <input type="text" id="settings-sync-input" maxlength="8" placeholder="CODE"
                 style="background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.35rem .65rem;color:var(--text);font-family:var(--font-mono);letter-spacing:.12em;text-transform:uppercase;width:110px" />
          <button class="btn-ghost btn-sm" id="btn-use-sync-settings">Übertragen</button>
        </div>
      </div>
      <p id="sync-settings-msg" style="font-size:.78rem;color:var(--text-3);margin-top:.25rem"></p>`;
    settingsList.appendChild(section);

    /* Show sync code once UID is available */
    const showSyncCode = () => {
      if (!currentUserId) return;
      let hash = 0;
      for (let i=0;i<currentUserId.length;i++) hash=((hash<<5)-hash+currentUserId.charCodeAt(i))|0;
      const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code='', h=Math.abs(hash);
      for(let i=0;i<8;i++){code+=chars[h%chars.length];h=Math.floor(h/chars.length)||(hash+i+7)*13;}
      setText('settings-sync-code', code);
    };
    setTimeout(showSyncCode, 1200);

    document.getElementById('btn-copy-sync-code')?.addEventListener('click', () => {
      const code = document.getElementById('settings-sync-code')?.textContent;
      if (code && code !== '……') navigator.clipboard.writeText(code).then(() => alert('Code kopiert: ' + code));
    });

    document.getElementById('btn-use-sync-settings')?.addEventListener('click', async () => {
      const code = document.getElementById('settings-sync-input')?.value?.toUpperCase();
      const msg  = document.getElementById('sync-settings-msg');
      if (!code || code.length < 6) { if(msg) msg.textContent = '⚠ Bitte 6–8 Zeichen eingeben.'; return; }
      if (msg) { msg.textContent = '⏳ Suche…'; msg.style.color='var(--text-3)'; }
      try {
        const { getFirestore: gf, doc: d, getDoc: gd } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const snap = await gd(d(db, 'syncCodes', code));
        if (!snap.exists()) { if(msg){msg.textContent='✗ Code nicht gefunden.';msg.style.color='var(--red)';} return; }
        localStorage.setItem('hub_sync_uid', snap.data().uid);
        if (msg) { msg.textContent='✅ Gefunden! Seite wird neu geladen…'; msg.style.color='var(--green)'; }
        setTimeout(() => location.reload(), 1200);
      } catch(_) { if(msg){msg.textContent='✗ Fehler – bitte erneut versuchen.';msg.style.color='var(--red)';} }
    });
  }
}

/* Eröffnungen + Hub-Link nach DOM-Init einbinden */
document.addEventListener('DOMContentLoaded', () => {
  injectHubLinkAndSync();
});

/* Auch nach App-Start einbinden (SPA-Pattern) */
setTimeout(() => {
  injectHubLinkAndSync();
  injectOpeningView();
  injectOnlineNavLink();
}, 2500);

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG D — ONLINE-SCHACH (Firebase Realtime)
═══════════════════════════════════════════════════════ */

/* ── State ── */
let olRoomId        = null;   // Firestore doc id (= room code)
let olMyColor       = null;   // WHITE or BLACK
let olGS            = null;   // current GameState
let olSelected      = null;   // {r,f} selected square
let olLegal         = [];     // legal targets for selected square
let olLastMove      = null;   // {fromR,fromF,toR,toF}
let olGameOver      = false;
let olUnsubscribe   = null;   // Firestore onSnapshot unsub fn
let olTimers        = {w:600, b:600};  // seconds remaining
let olTimerInterval = null;
let olActiveTimer   = null;   // WHITE or BLACK
let olMyName        = 'Du';
let olOpponentName  = 'Gegner';
let olDrawOffered   = false;
let olPromoTo       = null;   // pending promo {toR,toF} after selection
let olFlipped       = false;  // board orientation

const OL_COLLECTION = 'chessRooms';

/* ── Helpers ── */
function olEl(id) { return document.getElementById(id); }

function olShow(sectionId) {
  ['ol-lobby','ol-waiting','ol-game','ol-result'].forEach(id => {
    const el = olEl(id);
    if (el) el.style.display = id === sectionId ? '' : 'none';
  });
}

function olSetStatus(txt, cls = '') {
  const el = olEl('ol-status');
  if (!el) return;
  el.textContent = txt;
  el.className = 'chess-status-bar' + (cls ? ' status-' + cls : '');
}

function olUpdateTimerDisplay() {
  const fmt = s => {
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.abs(s) % 60;
    return (s < 0 ? '-' : '') + m + ':' + String(sec).padStart(2, '0');
  };
  const wSpan = olEl('ol-time-white');
  const bSpan = olEl('ol-time-black');
  if (wSpan) wSpan.textContent = fmt(olTimers.w);
  if (bSpan) bSpan.textContent = fmt(olTimers.b);

  /* highlight active */
  const wWrap = olEl('ol-timer-white');
  const bWrap = olEl('ol-timer-black');
  if (wWrap) wWrap.classList.toggle('timer-active', olActiveTimer === WHITE);
  if (bWrap) bWrap.classList.toggle('timer-active', olActiveTimer === BLACK);
}

function olStartClock(turn) {
  olActiveTimer = turn;
  if (olTimerInterval) clearInterval(olTimerInterval);
  olTimerInterval = setInterval(() => {
    if (olActiveTimer === WHITE) olTimers.w--;
    else olTimers.b--;
    olUpdateTimerDisplay();
    if (olTimers.w <= 0 || olTimers.b <= 0) {
      clearInterval(olTimerInterval);
      const loser = olTimers.w <= 0 ? WHITE : BLACK;
      olShowResult(loser === olMyColor ? 'Du hast auf Zeit verloren.' : 'Gegner hat auf Zeit verloren!', loser !== olMyColor);
    }
  }, 1000);
}

function olStopClock() {
  if (olTimerInterval) { clearInterval(olTimerInterval); olTimerInterval = null; }
  olActiveTimer = null;
}

/* ── Board rendering (flippable) ── */
function olRenderBoard(gs, selected, legalTargets, lastMove, inCheckColor) {
  const container = olEl('ol-board-container');
  if (!container) return;

  let boardEl = container.querySelector('.chess-board');
  if (!boardEl) {
    boardEl = document.createElement('div');
    boardEl.className = 'chess-board';
    boardEl.id = 'ol-board';
    container.innerHTML = '';
    container.appendChild(boardEl);
    boardEl.addEventListener('click', e => {
      const cell = e.target.closest('[data-ol-r]');
      if (!cell) return;
      handleOnlineClick(+cell.dataset.olR, +cell.dataset.olF);
    });
  }

  boardEl.innerHTML = '';

  for (let ri = 0; ri < 8; ri++) {
    for (let fi = 0; fi < 8; fi++) {
      /* flip: if playing as black, rotate view */
      const r = olFlipped ? 7 - ri : ri;
      const f = olFlipped ? 7 - fi : fi;

      const cell = document.createElement('div');
      cell.className = 'chess-cell ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
      cell.dataset.olR = r;
      cell.dataset.olF = f;

      if (selected && selected.r === r && selected.f === f) cell.classList.add('selected');
      if (legalTargets?.some(t => t.r === r && t.f === f)) {
        cell.classList.add(gs.board[r][f] !== EMPTY ? 'legal-capture' : 'legal-move');
      }
      if (lastMove && ((lastMove.fromR === r && lastMove.fromF === f) || (lastMove.toR === r && lastMove.toF === f))) {
        cell.classList.add('last-move');
      }
      if (inCheckColor && gs.turn === inCheckColor) {
        /* find king */
        for (let kr = 0; kr < 8; kr++) for (let kf = 0; kf < 8; kf++) {
          if (gs.board[kr][kf] === inCheckColor * KING && kr === r && kf === f) cell.classList.add('in-check');
        }
      }

      const piece = gs.board[r][f];
      if (piece !== EMPTY) {
        const span = document.createElement('span');
        span.className = 'chess-piece';
        span.textContent = PIECE_UNICODE[piece > 0 ? WHITE : BLACK][Math.abs(piece)];
        cell.appendChild(span);
      }

      boardEl.appendChild(cell);
    }
  }
}

function olUpdateMoveList(moveLog) {
  const list = olEl('ol-move-list');
  if (!list) return;
  list.innerHTML = '';
  for (let i = 0; i < moveLog.length; i += 2) {
    const div = document.createElement('div');
    div.className = 'move-pair';
    div.textContent = `${Math.floor(i/2)+1}. ${moveLog[i] || ''} ${moveLog[i+1] || ''}`;
    list.appendChild(div);
  }
  list.scrollTop = list.scrollHeight;
}

function olUpdateCaptures(gs) {
  const counts = {w:{}, b:{}};
  const startW = {[PAWN]:8,[KNIGHT]:2,[BISHOP]:2,[ROOK]:2,[QUEEN]:1};
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p=gs.board[r][f];
    if (p>0) counts.w[p]=(counts.w[p]||0)+1;
    if (p<0) counts.b[-p]=(counts.b[-p]||0)+1;
  }
  const capW=[], capB=[];
  for (const [pt,start] of Object.entries(startW)) {
    const missing=(start-(counts.w[pt]||0));
    for(let i=0;i<missing;i++) capB.push(PIECE_UNICODE[WHITE][pt]);
    const missingB=(start-(counts.b[pt]||0));
    for(let i=0;i<missingB;i++) capW.push(PIECE_UNICODE[BLACK][pt]);
  }
  /* top = opponent's captures (black pieces), bottom = our captures (white pieces) */
  const topEl  = olEl('ol-captured-top');
  const botEl  = olEl('ol-captured-bottom');
  if (topEl) topEl.innerHTML  = `<span class="captured-label">Geschlagen</span> ${capB.join(' ')}`;
  if (botEl) botEl.innerHTML  = `<span class="captured-label">Geschlagen</span> ${capW.join(' ')}`;
}

/* ── Room code generator ── */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ── Create room ── */
async function createOnlineRoom() {
  if (!currentUserId) { alert('Bitte warte kurz – Verbindung wird aufgebaut.'); return; }

  const colorEl   = document.querySelector('[data-ol-color].active');
  const tcEl      = document.querySelector('[data-ol-time].active');
  const myColor   = colorEl ? (colorEl.dataset.olColor === 'black' ? BLACK : WHITE) : WHITE;
  const secs      = tcEl ? (parseInt(tcEl.dataset.olTime) || 600) : 600;
  const code      = generateRoomCode();
  const roomRef   = doc(db, OL_COLLECTION, code);

  const roomData = {
    code,
    status: 'waiting',
    createdAt: serverTimestamp(),
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [],
    moveLog: [],
    timers: {w: secs, b: secs},
    timeControl: secs,
    players: {
      [myColor === WHITE ? 'white' : 'black']: {uid: currentUserId, name: olMyName},
      [myColor === WHITE ? 'black' : 'white']: null,
    },
    drawOffer: null,
    result: null,
  };

  try {
    await setDoc(roomRef, roomData);
    olRoomId    = code;
    olMyColor   = myColor;
    olTimers    = {w: secs, b: secs};
    olFlipped   = myColor === BLACK;

    /* Show room code in header and waiting screen */
    const badge = olEl('ol-code-badge');
    if (badge) badge.textContent = 'CODE: ' + code;
    const bigCode = olEl('ol-big-code');
    if (bigCode) bigCode.textContent = code;
    olShow('ol-waiting');

    subscribeToOnlineRoom(code);
  } catch (e) {
    alert('Fehler beim Erstellen: ' + e.message);
  }
}

/* ── Join room ── */
async function joinOnlineRoom(code) {
  if (!currentUserId) { alert('Bitte warte kurz – Verbindung wird aufgebaut.'); return; }
  code = code.toUpperCase().trim();
  if (code.length < 4) { alert('Bitte einen gültigen Code eingeben.'); return; }

  const roomRef = doc(db, OL_COLLECTION, code);
  let snap;
  try {
    snap = await getDoc(roomRef);
  } catch(e) {
    alert('Verbindungsfehler: ' + e.message); return;
  }

  if (!snap.exists()) { alert('Raum nicht gefunden.'); return; }
  const data = snap.data();
  if (data.status !== 'waiting') { alert('Dieser Raum ist bereits voll oder beendet.'); return; }

  /* Determine which color is free (null means slot open) */
  const freeColor = !data.players?.white ? 'white' : 'black';
  olMyColor  = freeColor === 'white' ? WHITE : BLACK;
  olFlipped  = olMyColor === BLACK;
  olTimers   = {w: data.timers?.w ?? data.timeControl ?? 600,
                b: data.timers?.b ?? data.timeControl ?? 600};

  try {
    await updateDoc(roomRef, {
      [`players.${freeColor}`]: {uid: currentUserId, name: olMyName},
      status: 'active',
    });
    olRoomId = code;

    const badge = olEl('ol-code-badge');
    if (badge) badge.textContent = 'CODE: ' + code;
    olShow('ol-game');

    subscribeToOnlineRoom(code);
  } catch(e) {
    alert('Fehler beim Beitreten: ' + e.message);
  }
}

/* ── Firestore subscription ── */
function subscribeToOnlineRoom(code) {
  if (olUnsubscribe) { olUnsubscribe(); olUnsubscribe = null; }

  const roomRef = doc(db, OL_COLLECTION, code);
  olUnsubscribe = onSnapshot(roomRef, snap => {
    if (!snap.exists()) return;
    const data = snap.data();

    /* Update names + "Du" badge */
    const myKey  = olMyColor === WHITE ? 'white' : 'black';
    const oppKey = olMyColor === WHITE ? 'black' : 'white';
    olOpponentName = data.players?.[oppKey]?.name || 'Gegner';

    const meNameEl  = olEl(myKey  === 'white' ? 'ol-name-white' : 'ol-name-black');
    const oppNameEl = olEl(oppKey === 'white' ? 'ol-name-white' : 'ol-name-black');
    const meYouEl   = olEl(myKey  === 'white' ? 'ol-you-white'  : 'ol-you-black');
    if (meNameEl)  meNameEl.textContent  = olMyName;
    if (oppNameEl) oppNameEl.textContent = olOpponentName;
    if (meYouEl)   meYouEl.style.display = '';

    /* Show timers if time control is set */
    if (data.timeControl && data.timeControl > 0) {
      const wWrap = olEl('ol-timer-white');
      const bWrap = olEl('ol-timer-black');
      if (wWrap) wWrap.style.display = '';
      if (bWrap) bWrap.style.display = '';
    }

    /* Sync timers from server */
    if (data.timers) {
      olTimers.w = data.timers.w;
      olTimers.b = data.timers.b;
      olUpdateTimerDisplay();
    }

    /* Handle draw offer */
    if (data.drawOffer && data.drawOffer !== (olMyColor === WHITE ? 'white' : 'black')) {
      if (!olDrawOffered) {
        olDrawOffered = true;
        if (confirm('Gegner bietet Remis an. Annehmen?')) {
          olEndRoom('draw', 'Remis vereinbart.');
        } else {
          updateDoc(roomRef, {drawOffer: null}).catch(()=>{});
          olDrawOffered = false;
        }
      }
    } else {
      olDrawOffered = false;
    }

    /* Handle result */
    if (data.result && !olGameOver) {
      olGameOver = true;
      olStopClock();
      const won = data.result.winner === (olMyColor === WHITE ? 'white' : 'black');
      const draw = data.result.winner === 'draw';
      olShowResult(
        draw ? 'Remis! ' + (data.result.reason || '') :
        won  ? 'Du gewinnst! 🎉' : 'Du verlierst. ' + (data.result.reason || ''),
        won || draw
      );
      return;
    }

    /* Room moved from waiting to active → switch to game view */
    if (data.status === 'active' && olEl('ol-waiting')?.style.display !== 'none') {
      olShow('ol-game');
    }

    /* Parse FEN and render */
    const gs = parseFen(data.fen);
    olGS = gs;

    /* Update player indicators */
    const wInd = olEl('ol-indicator-white');
    const bInd = olEl('ol-indicator-black');
    if (wInd) wInd.classList.toggle('active-turn', gs.turn === WHITE && !olGameOver);
    if (bInd) bInd.classList.toggle('active-turn', gs.turn === BLACK && !olGameOver);

    /* Move log */
    if (data.moveLog) olUpdateMoveList(data.moveLog);

    /* Update clock side */
    if (data.status === 'active' && !olGameOver) {
      olStartClock(gs.turn);
    }

    /* Render board */
    const inCheck = isInCheck(gs, gs.turn) ? gs.turn : null;
    olRenderBoard(gs, olSelected, olLegal, olLastMove, inCheck);
    olUpdateCaptures(gs);

    /* Rebuild last move from moves array */
    if (data.moves?.length) {
      const last = data.moves[data.moves.length - 1];
      olLastMove = last ? {fromR: last.fr, fromF: last.ff, toR: last.tr, toF: last.tf} : null;
    }

    /* Check local end conditions */
    if (!olGameOver) {
      if (isCheckmate(gs)) {
        const winner = gs.turn === WHITE ? 'black' : 'white';
        olEndRoom(winner, 'Schachmatt');
      } else if (isStalemate(gs)) {
        olEndRoom('draw', 'Patt');
      }
    }

    /* Status bar */
    if (!olGameOver) {
      const myTurn = gs.turn === olMyColor;
      if (isInCheck(gs, gs.turn)) {
        olSetStatus(myTurn ? '⚠ Du stehst im Schach!' : '⚠ Gegner im Schach!', 'check');
      } else {
        olSetStatus(myTurn ? 'Dein Zug' : 'Gegner zieht…');
      }
    }
  }, err => {
    console.warn('onSnapshot error:', err.message);
  });
}

/* ── Handle click on online board ── */
function handleOnlineClick(r, f) {
  if (!olGS || olGameOver) return;
  if (olGS.turn !== olMyColor) return;  // not our turn

  /* Pending promotion */
  if (olPromoTo) return;

  const piece = olGS.board[r][f];

  if (olSelected) {
    /* Try to execute move */
    const isTarget = olLegal.some(t => t.r === r && t.f === f);
    if (isTarget) {
      /* Check for pawn promotion */
      const movingPiece = Math.abs(olGS.board[olSelected.r][olSelected.f]);
      const promotionRow = olMyColor === WHITE ? 0 : 7;
      if (movingPiece === PAWN && r === promotionRow) {
        olPromoTo = {fromR: olSelected.r, fromF: olSelected.f, toR: r, toF: f};
        showOnlinePromo();
        return;
      }
      sendOnlineMove(olSelected.r, olSelected.f, r, f, QUEEN);
      olSelected = null;
      olLegal    = [];
      return;
    }
    /* Reselect own piece */
    if (piece !== EMPTY && (piece > 0) === (olMyColor === WHITE)) {
      olSelected = {r, f};
      olLegal    = legalMovesFor(olGS, r, f);
    } else {
      olSelected = null;
      olLegal    = [];
    }
  } else {
    if (piece !== EMPTY && (piece > 0) === (olMyColor === WHITE)) {
      olSelected = {r, f};
      olLegal    = legalMovesFor(olGS, r, f);
    }
  }

  const inCheck = isInCheck(olGS, olGS.turn) ? olGS.turn : null;
  olRenderBoard(olGS, olSelected, olLegal, olLastMove, inCheck);
}

/* ── Promotion picker ── */
function showOnlinePromo() {
  const overlay = olEl('promo-overlay') || createPromoOverlay();
  overlay.classList.remove('hidden');
  const box = overlay.querySelector('.promo-box');
  if (!box) return;
  box.innerHTML = '';
  const pieces = [QUEEN, ROOK, BISHOP, KNIGHT];
  pieces.forEach(pt => {
    const btn = document.createElement('button');
    btn.className = 'promo-btn';
    btn.textContent = PIECE_UNICODE[olMyColor][pt];
    btn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      if (olPromoTo) {
        const {fromR, fromF, toR, toF} = olPromoTo;
        olPromoTo = null;
        sendOnlineMove(fromR, fromF, toR, toF, pt);
        olSelected = null;
        olLegal    = [];
      }
    });
    box.appendChild(btn);
  });
}

function createPromoOverlay() {
  const ov = document.createElement('div');
  ov.id = 'promo-overlay';
  ov.className = 'promo-overlay hidden';
  ov.innerHTML = '<div class="promo-box"></div>';
  document.body.appendChild(ov);
  return ov;
}

/* ── Send move to Firestore ── */
async function sendOnlineMove(fromR, fromF, toR, toF, promoType = QUEEN) {
  if (!olGS || !olRoomId) return;
  const newGs  = applyMove(olGS, fromR, fromF, toR, toF, promoType);
  const piece  = Math.abs(olGS.board[fromR][fromF]);
  const myKey  = olMyColor === WHITE ? 'white' : 'black';
  const oppKey = olMyColor === WHITE ? 'black' : 'white';

  /* Build algebraic label */
  const label = buildMoveLabel(olGS, fromR, fromF, toR, toF, promoType);

  /* Calculate new timer (subtract elapsed since last clock start — approximate) */
  const newTimers = {...olTimers};

  const roomRef = doc(db, OL_COLLECTION, olRoomId);
  try {
    const snap = await getDoc(roomRef);
    const cur  = snap.data() || {};
    const prevMoves   = Array.isArray(cur.moves)   ? cur.moves   : [];
    const prevMoveLog = Array.isArray(cur.moveLog) ? cur.moveLog : [];
    await updateDoc(roomRef, {
      fen: boardToFen(newGs),
      [`timers.${myKey}`]: newTimers[myKey === 'white' ? 'w' : 'b'],
      moves:   [...prevMoves,   {fr:fromR, ff:fromF, tr:toR, tf:toF, p:promoType}],
      moveLog: [...prevMoveLog, label],
    });
    if (olGS.board[toR][toF] !== EMPTY) SOUNDS.capture();
    else SOUNDS.move();
    if (isInCheck(newGs, newGs.turn)) SOUNDS.check();
  } catch(e) {
    console.warn('sendOnlineMove error:', e.message);
  }
}

/* ── End room ── */
async function olEndRoom(winner, reason) {
  if (!olRoomId) return;
  olGameOver = true;
  olStopClock();
  try {
    await updateDoc(doc(db, OL_COLLECTION, olRoomId), {
      status: 'finished',
      result: {winner, reason},
    });
  } catch(_) {}
}

/* ── Show result screen ── */
function olShowResult(message, positive) {
  olStopClock();
  olGameOver = true;
  const title = olEl('ol-result-title');
  const body  = olEl('ol-result-body');
  if (title) title.textContent = positive ? '🎉 Gewonnen!' : '😔 Verloren';
  if (body)  body.textContent  = message;
  olShow('ol-result');
  if (positive) SOUNDS.correct();
  /* Award XP */
  if (positive) { awardXP(30); }
}

/* ── Leave / cleanup ── */
function olLeave() {
  olStopClock();
  if (olUnsubscribe) { olUnsubscribe(); olUnsubscribe = null; }
  olRoomId    = null;
  olMyColor   = null;
  olGS        = null;
  olSelected  = null;
  olLegal     = [];
  olLastMove  = null;
  olGameOver  = false;
  olDrawOffered = false;
  olPromoTo   = null;

  const overlay = olEl('online-overlay');
  if (overlay) overlay.classList.add('hidden');
  showView('freeplay');
}

/* ── Rematch ── */
async function olRematch() {
  if (!olRoomId || !currentUserId) return;
  /* Swap colors for rematch */
  const newMyColor = olMyColor === WHITE ? BLACK : WHITE;
  const secs = (await getDoc(doc(db, OL_COLLECTION, olRoomId))).data()?.timeControl || 600;
  const newCode = generateRoomCode();
  const newRoom = {
    code: newCode,
    status: 'waiting',
    createdAt: serverTimestamp(),
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [],
    moveLog: [],
    timers: {w: secs, b: secs},
    timeControl: secs,
    players: {
      [newMyColor === WHITE ? 'white' : 'black']: {uid: currentUserId, name: olMyName},
      [newMyColor === WHITE ? 'black' : 'white']: null,
    },
    drawOffer: null,
    result: null,
  };
  try {
    await setDoc(doc(db, OL_COLLECTION, newCode), newRoom);

    /* Reset state */
    olRoomId    = newCode;
    olMyColor   = newMyColor;
    olFlipped   = newMyColor === BLACK;
    olTimers    = {w: secs, b: secs};
    olGameOver  = false;
    olDrawOffered = false;
    olSelected  = null;
    olLegal     = [];
    olLastMove  = null;

    const badge = olEl('ol-code-badge');
    if (badge) badge.textContent = 'CODE: ' + newCode;
    const bigCode = olEl('ol-big-code');
    if (bigCode) bigCode.textContent = newCode;
    olShow('ol-waiting');
    subscribeToOnlineRoom(newCode);
  } catch(e) { alert('Fehler beim Rematch: ' + e.message); }
}

/* ── Inject "Online spielen" sidebar link ── */
function injectOnlineNavLink() {
  const nav = document.querySelector('.nav-menu');
  if (!nav || document.getElementById('nav-online')) return;

  const li = document.createElement('li');
  li.id = 'nav-online';
  const btn = document.createElement('button');
  btn.className = 'nav-item';
  btn.textContent = '🌐 Online spielen';
  btn.addEventListener('click', openOnlineOverlay);
  li.appendChild(btn);

  /* Insert after freeplay link */
  const fpBtn = nav.querySelector('[data-view="freeplay"]');
  const fpLi  = fpBtn?.closest('li');
  if (fpLi) fpLi.after(li);
  else nav.appendChild(li);
}

/* ── Open online overlay ── */
function openOnlineOverlay() {
  const overlay = olEl('online-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  /* Reset to lobby */
  olShow('ol-lobby');
  olGameOver    = false;
  olDrawOffered = false;

  /* Set player name */
  olMyName = currentUserId ? ('Spieler-' + currentUserId.slice(0, 4)) : 'Spieler';

  /* Pre-select first buttons if none active */
  const firstColor = document.querySelector('[data-ol-color]');
  if (firstColor && !document.querySelector('[data-ol-color].active')) {
    firstColor.classList.add('active');
  }
  const firstTc = document.querySelector('[data-ol-time]');
  if (firstTc && !document.querySelector('[data-ol-time].active')) {
    firstTc.classList.add('active');
  }

  bindOnlineEvents();
}

/* ── Bind online events (idempotent) ── */
let _olEventsBound = false;
function bindOnlineEvents() {
  if (_olEventsBound) return;
  _olEventsBound = true;

  /* Color selector */
  document.querySelectorAll('[data-ol-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ol-color]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  /* Time control selector */
  document.querySelectorAll('[data-ol-time]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ol-time]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  /* Create room */
  olEl('btn-ol-create')?.addEventListener('click', createOnlineRoom);

  /* Join room */
  olEl('btn-ol-join')?.addEventListener('click', () => {
    const code = olEl('ol-join-input')?.value?.toUpperCase().trim();
    if (!code) { alert('Bitte einen Code eingeben.'); return; }
    joinOnlineRoom(code);
  });

  /* Copy room code (waiting screen) */
  olEl('btn-ol-copy-big')?.addEventListener('click', () => {
    const code = olEl('ol-big-code')?.textContent;
    if (code) navigator.clipboard.writeText(code).then(() => {
      const btn = olEl('btn-ol-copy-big');
      if (btn) { btn.textContent = '✅ Kopiert!'; setTimeout(() => btn.textContent = '📋 Code kopieren', 2000); }
    });
  });

  /* Copy code (header badge) */
  olEl('btn-ol-copy-code')?.addEventListener('click', () => {
    const raw = olEl('ol-code-badge')?.textContent || '';
    const code = raw.replace('CODE: ', '').trim();
    if (code) navigator.clipboard.writeText(code).then(() => alert('Code kopiert: ' + code));
  });

  /* Flip board */
  olEl('btn-ol-flip')?.addEventListener('click', () => {
    olFlipped = !olFlipped;
    if (olGS) {
      const inCheck = isInCheck(olGS, olGS.turn) ? olGS.turn : null;
      olRenderBoard(olGS, olSelected, olLegal, olLastMove, inCheck);
    }
  });

  /* Leave */
  olEl('btn-ol-leave')?.addEventListener('click', () => {
    if (confirm('Raum verlassen?')) olLeave();
  });

  /* Resign */
  olEl('btn-ol-resign')?.addEventListener('click', () => {
    if (confirm('Aufgeben?')) {
      const winner = olMyColor === WHITE ? 'black' : 'white';
      olEndRoom(winner, 'Aufgabe');
    }
  });

  /* Draw offer */
  olEl('btn-ol-draw')?.addEventListener('click', async () => {
    if (!olRoomId) return;
    const myKey = olMyColor === WHITE ? 'white' : 'black';
    try {
      await updateDoc(doc(db, OL_COLLECTION, olRoomId), {drawOffer: myKey});
      olSetStatus('Remis angeboten…');
    } catch(e) { console.warn(e); }
  });

  /* Rematch */
  olEl('btn-ol-rematch')?.addEventListener('click', olRematch);

  /* Leave after result */
  olEl('btn-ol-leave-after')?.addEventListener('click', olLeave);
}

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG E — LEADERBOARD + PROFIL
═══════════════════════════════════════════════════════ */

const LB_COLLECTION = 'chessLeaderboard';

const AVATAR_OPTIONS = [
  '♟','♔','♚','♕','♛','♖','♗','♘',
  '🎯','🧠','👑','🔥','⭐','🏆','🎓','🎮',
  '🦁','🐺','🦊','🧙','🤖','👾','🦅','🐉',
];

/* ── Sync current user to leaderboard ── */
async function syncLeaderboard() {
  if (!currentUserId) return;
  const name   = CS.settings?.displayName || ('Spieler-' + currentUserId.slice(0, 4));
  const avatar = CS.settings?.avatar || '♟';
  try {
    await setDoc(doc(db, LB_COLLECTION, currentUserId), {
      uid:         currentUserId,
      displayName: name,
      avatar,
      chessXP:     CS.xp || 0,
      chessLevel:  CS.level || 1,
      totalXP:     CS.xp || 0,
      lastActive:  serverTimestamp(),
    }, { merge: true });
  } catch (_) {}
}

/* ── Load leaderboard from Firestore ── */
let _lbMode = 'chess';

async function loadLeaderboard() {
  const loading = document.getElementById('lb-loading');
  const table   = document.getElementById('lb-table');
  if (loading) loading.style.display = '';
  if (table)   table.style.display   = 'none';

  const sortField = _lbMode === 'total' ? 'totalXP' : 'chessXP';
  const header = document.getElementById('lb-xp-col-header');
  if (header) header.textContent = _lbMode === 'total' ? 'Gesamt-XP' : 'Schach-XP';

  try {
    const q    = query(collection(db, LB_COLLECTION), orderBy(sortField, 'desc'), limit(25));
    const snap = await getDocs(q);

    const rows = [];
    snap.forEach(d => rows.push(d.data()));

    renderLeaderboard(rows, sortField);
  } catch (e) {
    if (loading) loading.textContent = '⚠ Fehler beim Laden. Bitte erneut versuchen.';
    console.warn('Leaderboard error:', e.message);
  }
}

function renderLeaderboard(rows, sortField) {
  const loading = document.getElementById('lb-loading');
  const table   = document.getElementById('lb-table');
  const tbody   = document.getElementById('lb-tbody');
  if (!tbody) return;

  if (loading) loading.style.display = 'none';
  if (table)   table.style.display   = '';

  tbody.innerHTML = '';
  let myRank = null;

  rows.forEach((row, i) => {
    const rank   = i + 1;
    const isMe   = row.uid === currentUserId;
    if (isMe) myRank = rank;

    const tr = document.createElement('tr');
    if (isMe) tr.className = 'lb-me';

    const rankCls = rank === 1 ? 'lb-rank lb-rank-1' : rank === 2 ? 'lb-rank lb-rank-2' : rank === 3 ? 'lb-rank lb-rank-3' : 'lb-rank';
    const rankSymbol = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;

    tr.innerHTML = `
      <td class="${rankCls}">${rankSymbol}</td>
      <td>
        <div class="lb-player">
          <span class="lb-avatar">${row.avatar || '♟'}</span>
          <span class="lb-name">${escHtml(row.displayName || 'Spieler')}</span>
          ${isMe ? '<span class="lb-you-tag">Du</span>' : ''}
        </div>
      </td>
      <td class="lb-level">Lv.${row.chessLevel || 1}</td>
      <td class="lb-xp">${(row[sortField] || 0).toLocaleString('de-DE')} XP</td>
    `;
    tbody.appendChild(tr);
  });

  /* Update my rank card */
  const myCard = document.getElementById('lb-my-card');
  if (myCard) {
    myCard.style.display = '';
    setText('lb-my-rank', myRank ? '#' + myRank : '#–');
    setText('lb-my-avatar', CS.settings?.avatar || '♟');
    setText('lb-my-name', CS.settings?.displayName || ('Spieler-' + (currentUserId || '????').slice(0,4)));
    setText('lb-my-xp', (CS.xp || 0).toLocaleString('de-DE') + ' XP');
    setText('lb-my-level', 'Lv.' + (CS.level || 1));
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Profile: render avatar grid ── */
function renderAvatarGrid() {
  const grid = document.getElementById('avatar-grid');
  if (!grid || grid.dataset.rendered) return;
  grid.dataset.rendered = '1';

  const current = CS.settings?.avatar || '♟';
  AVATAR_OPTIONS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'avatar-btn' + (emoji === current ? ' selected' : '');
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      CS.settings.avatar = emoji;
      /* Update sidebar avatar instantly */
      setText('sf-avatar', emoji);
    });
    grid.appendChild(btn);
  });
}

/* ── Profile: save name + avatar ── */
async function saveProfile() {
  const input = document.getElementById('profile-name-input');
  const msg   = document.getElementById('profile-save-msg');
  const name  = input?.value?.trim() || '';

  if (name.length < 1) {
    if (msg) { msg.textContent = '⚠ Bitte einen Namen eingeben.'; msg.style.color = 'var(--red)'; }
    return;
  }

  CS.settings.displayName = name;
  saveChessState();

  /* Update sidebar */
  setText('sf-name', name);

  /* Update online player name */
  olMyName = name;

  /* Sync to Firestore leaderboard */
  await syncLeaderboard();

  if (msg) {
    msg.textContent = '✅ Gespeichert!';
    msg.style.color = 'var(--green)';
    setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);
  }
}

/* ── Bind leaderboard + profile events (once) ── */
let _lbEventsBound = false;
function bindLeaderboardEvents() {
  if (_lbEventsBound) return;
  _lbEventsBound = true;

  /* Tab switch */
  document.querySelectorAll('[data-lb]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lb]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _lbMode = btn.dataset.lb;
      loadLeaderboard();
    });
  });

  /* Refresh */
  document.getElementById('btn-lb-refresh')?.addEventListener('click', loadLeaderboard);

  /* Save profile */
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);

  /* Allow Enter in name input */
  document.getElementById('profile-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProfile();
  });
}

/* Sync-Logik ist jetzt direkt in awardXP integriert (siehe unten) */

/* ── Override showView to use patched version ── */
/* We can't re-assign a function declared with `function`, so we
   intercept via the data-view nav buttons instead */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  const name = btn.dataset.view;
  if (name === 'leaderboard') {
    bindLeaderboardEvents();
    loadLeaderboard();
  }
  if (name === 'settings') {
    renderAvatarGrid();
    const inp = document.getElementById('profile-name-input');
    if (inp && !inp.value) inp.value = CS.settings?.displayName || '';
  }
}, true);

/* ── Initial sync when user is authenticated ── */
/* Called from init() after auth; we hook into onAuthStateChanged result */
setTimeout(() => {
  if (currentUserId) syncLeaderboard();
}, 3000);

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG F — ANALYSE-MODUS
═══════════════════════════════════════════════════════ */

/* ── Analysis state ── */
let anStates    = [];   // all game states (fpHistory + fpGS)
let anMoves     = [];   // fpMoveLog entries (with coords)
let anResults   = [];   // [{bestMove, bestEval, actualEval, loss, cls}]
let anIdx       = 0;    // current position displayed
let anRunning   = false;

const AN_CLS = [
  { max: 0,   label: 'Bester Zug',   icon: '✅', cls: 'an-best' },
  { max: 15,  label: 'Sehr gut',     icon: '🟩', cls: 'an-best' },
  { max: 50,  label: 'Gut',          icon: '🔵', cls: 'an-good' },
  { max: 150, label: 'Ungenauigkeit',icon: '🟡', cls: 'an-inaccuracy' },
  { max: 400, label: 'Fehler',       icon: '🟠', cls: 'an-mistake' },
  { max: Infinity, label: 'Hänger',  icon: '🔴', cls: 'an-blunder' },
];

function classifyLoss(loss) {
  for (const c of AN_CLS) { if (loss <= c.max) return c; }
  return AN_CLS[AN_CLS.length - 1];
}

/* ── Inject overlay HTML once ── */
function ensureAnalysisOverlay() {
  if (document.getElementById('analysis-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'analysis-overlay';
  ov.className = 'analysis-overlay hidden';
  ov.innerHTML = `
    <div class="analysis-inner">
      <div class="analysis-header">
        <div>
          <h2 style="margin:0;font-size:1.2rem">🔍 Partieanalyse</h2>
          <div class="an-summary-row" id="an-summary"></div>
        </div>
        <button class="btn-ghost btn-sm" id="btn-an-close">✕ Schließen</button>
      </div>

      <div class="analysis-body">
        <!-- Left: eval bar + board + nav -->
        <div class="analysis-left">
          <div class="an-eval-wrap">
            <div class="an-eval-bar-outer" title="Materialbewertung">
              <div class="an-eval-white" id="an-eval-white" style="height:50%"></div>
            </div>
            <div class="an-eval-label" id="an-eval-label">0.0</div>
          </div>
          <div id="an-board-container" class="an-board-container"></div>
          <div class="an-nav-row">
            <button class="btn-ghost btn-sm" id="btn-an-first">⏮</button>
            <button class="btn-ghost btn-sm" id="btn-an-prev">◀</button>
            <span class="an-move-counter" id="an-move-counter">Startposition</span>
            <button class="btn-ghost btn-sm" id="btn-an-next">▶</button>
            <button class="btn-ghost btn-sm" id="btn-an-last">⏭</button>
          </div>
          <div class="an-explain-box" id="an-explain"></div>
          <div class="an-loading" id="an-loading" style="display:none">
            <div class="an-loading-bar"><div class="an-loading-fill" id="an-loading-fill"></div></div>
            <span id="an-loading-label">Analysiere…</span>
          </div>
        </div>

        <!-- Right: annotated move list -->
        <div class="analysis-right">
          <div class="an-list-title">Züge</div>
          <div class="an-move-list" id="an-move-list"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  /* Nav events */
  document.getElementById('btn-an-close')?.addEventListener('click', closeAnalysis);
  document.getElementById('btn-an-first')?.addEventListener('click', () => anGoTo(0));
  document.getElementById('btn-an-last')?.addEventListener('click',  () => anGoTo(anStates.length - 1));
  document.getElementById('btn-an-prev')?.addEventListener('click',  () => anGoTo(anIdx - 1));
  document.getElementById('btn-an-next')?.addEventListener('click',  () => anGoTo(anIdx + 1));

  /* Keyboard navigation */
  document.addEventListener('keydown', e => {
    if (document.getElementById('analysis-overlay')?.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); anGoTo(anIdx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); anGoTo(anIdx + 1); }
    if (e.key === 'Escape')     closeAnalysis();
  });
}

/* ── Start analysis ── */
async function startAnalysis() {
  if (!fpHistory.length && !fpGS) return;
  ensureAnalysisOverlay();

  /* Build states array: all positions from start to end */
  anStates = [...fpHistory, fpGS].filter(Boolean);
  anMoves  = [...fpMoveLog];
  anResults = new Array(anMoves.length).fill(null);
  anIdx    = 0;
  anRunning = true;

  /* Show overlay */
  document.getElementById('game-over-overlay')?.classList.add('hidden');
  document.getElementById('analysis-overlay')?.classList.remove('hidden');

  /* Build board */
  const container = document.getElementById('an-board-container');
  container.innerHTML = '';
  buildBoardElement('an', (r, f) => anBoardClick(r, f));
  const el = document.getElementById('board-outer-an');
  if (el) container.appendChild(el);

  anGoTo(0);
  renderAnMoveList();

  /* Run analysis async */
  const loadingEl  = document.getElementById('an-loading');
  const fillEl     = document.getElementById('an-loading-fill');
  const labelEl    = document.getElementById('an-loading-label');
  if (loadingEl) loadingEl.style.display = '';

  for (let i = 0; i < anMoves.length; i++) {
    if (!anRunning) break;
    if (labelEl) labelEl.textContent = `Analysiere Zug ${i+1} / ${anMoves.length}…`;
    if (fillEl)  fillEl.style.width  = ((i / anMoves.length) * 100) + '%';

    /* Yield to browser between moves */
    await new Promise(res => setTimeout(res, 0));

    const gs  = anStates[i];
    const res = getBestMoveAndEval(gs, 3);
    if (!res) { anResults[i] = null; continue; }

    const actualGs   = anStates[i + 1];
    const actualEval = evaluateBoard(actualGs);
    const mult       = gs.turn === WHITE ? 1 : -1;
    const loss       = mult * (res.eval - actualEval);
    const cls        = classifyLoss(Math.max(0, loss));

    anResults[i] = { bestMove: res.move, bestEval: res.eval, actualEval, loss, cls };

    /* Update move list entry as we go */
    updateAnMoveEntry(i);
    if (anIdx === i + 1 || anIdx === i) anGoTo(anIdx);
  }

  if (fillEl)  fillEl.style.width  = '100%';
  if (loadingEl) setTimeout(() => { loadingEl.style.display = 'none'; }, 500);

  renderAnMoveList();
  renderAnSummary();
  anRunning = false;
}

/* ── Navigate to position index ── */
function anGoTo(idx) {
  if (!anStates.length) return;
  anIdx = Math.max(0, Math.min(idx, anStates.length - 1));
  const gs = anStates[anIdx];

  /* Determine last move highlight */
  const prevMove = anIdx > 0 ? anMoves[anIdx - 1] : null;
  const lastMove = prevMove ? { fromR: prevMove.fromR, fromF: prevMove.fromF, toR: prevMove.toR, toF: prevMove.toF } : null;

  /* Find best move for current position (if analysed) */
  const res = anIdx < anResults.length ? anResults[anIdx] : null;

  /* Render board */
  const inCheck = isInCheck(gs, gs.turn) ? gs.turn : null;
  renderBoard('an', gs, null, [], lastMove, inCheck);

  /* Overlay best move on board */
  overlayBestMove(res, anIdx < anMoves.length ? anMoves[anIdx] : null);

  /* Eval bar */
  updateAnEvalBar(gs);

  /* Move counter label */
  const counter = document.getElementById('an-move-counter');
  if (counter) {
    if (anIdx === 0) counter.textContent = 'Startposition';
    else {
      const mv = anMoves[anIdx - 1];
      const num = Math.ceil(anIdx / 2);
      const color = mv.color === WHITE ? 'Weiß' : 'Schwarz';
      counter.textContent = `Zug ${num} (${color}): ${mv.san}`;
    }
  }

  /* Explain box */
  updateAnExplain(anIdx);

  /* Highlight move in list */
  document.querySelectorAll('.an-move-entry').forEach((el, i) => {
    el.classList.toggle('an-current', i === anIdx - 1);
  });
}

/* ── Overlay best/actual move markers on board ── */
function overlayBestMove(res, actualMove) {
  /* Clear previous overlays */
  document.querySelectorAll('.an-best-from,.an-best-to,.an-actual-from,.an-actual-to').forEach(el => {
    el.classList.remove('an-best-from','an-best-to','an-actual-from','an-actual-to');
  });
  if (!res || !res.bestMove) return;

  const isBestPlayed = actualMove &&
    res.bestMove.fromR === actualMove.fromR && res.bestMove.fromF === actualMove.fromF &&
    res.bestMove.r     === actualMove.toR   && res.bestMove.f     === actualMove.toF;

  if (!isBestPlayed) {
    /* Highlight best move in green */
    const grid = document.getElementById('board-grid-an');
    if (!grid) return;
    const cells = grid.querySelectorAll('.chess-cell');
    cells.forEach(cell => {
      const cr = +cell.dataset.r, cf = +cell.dataset.f;
      if (cr === res.bestMove.fromR && cf === res.bestMove.fromF) cell.classList.add('an-best-from');
      if (cr === res.bestMove.r     && cf === res.bestMove.f)     cell.classList.add('an-best-to');
    });
  }
}

/* ── Eval bar (material) ── */
function updateAnEvalBar(gs) {
  const raw = evaluateBoard(gs);
  const label = document.getElementById('an-eval-label');
  const fill  = document.getElementById('an-eval-white');
  if (!fill) return;

  /* Clamp to ±1500 centipawns for display */
  const clamped = Math.max(-1500, Math.min(1500, raw));
  const pct = ((clamped + 1500) / 3000) * 100;
  fill.style.height = pct + '%';

  const display = Math.abs(raw / 100).toFixed(1);
  if (label) label.textContent = raw > 0 ? '+' + display : raw < 0 ? '−' + display : '0.0';
  if (label) label.style.color = raw > 50 ? '#fff' : raw < -50 ? '#111' : 'var(--text)';
}

/* ── Explain box ── */
function updateAnExplain(idx) {
  const box = document.getElementById('an-explain');
  if (!box) return;
  if (idx === 0) { box.textContent = 'Startposition – navigiere mit den Pfeilen oder Tasten ← →'; return; }

  const moveIdx = idx - 1;
  const res = anResults[moveIdx];
  const mv  = anMoves[moveIdx];
  if (!res) { box.textContent = mv ? `${mv.san} – Analyse läuft…` : ''; return; }

  const loss = Math.round(res.loss);
  box.innerHTML = `
    <span class="an-badge ${res.cls.cls}">${res.cls.icon} ${res.cls.label}</span>
    <span style="font-size:.82rem;color:var(--text-2);margin-left:.5rem">
      ${mv.color === WHITE ? 'Weiß' : 'Schwarz'} spielte <strong>${mv.san}</strong>
      ${loss > 15 ? ` – Bewertungsverlust: ${loss > 100 ? (loss/100).toFixed(1)+' Bauern' : loss+' CP'}` : ' – optimaler Zug'}
    </span>
    ${res.bestMove && loss > 15 ? `<div style="font-size:.78rem;color:var(--text-3);margin-top:.3rem">Besser wäre: ${coordToAlgebraic(res.bestMove.fromR,res.bestMove.fromF)}–${coordToAlgebraic(res.bestMove.r,res.bestMove.f)} <span class="an-best-tag">♻ Bester Zug</span></div>` : ''}
  `;
}

/* ── Move list rendering ── */
function renderAnMoveList() {
  const list = document.getElementById('an-move-list');
  if (!list) return;
  list.innerHTML = '';
  for (let i = 0; i < anMoves.length; i += 2) {
    const row = document.createElement('div');
    row.className = 'an-move-row';
    row.innerHTML = `<span class="an-move-num">${Math.floor(i/2)+1}.</span>`;

    [i, i+1].forEach(idx => {
      if (idx >= anMoves.length) return;
      const mv  = anMoves[idx];
      const res = anResults[idx];
      const entry = document.createElement('span');
      entry.className = 'an-move-entry' + (idx === anIdx - 1 ? ' an-current' : '');
      entry.dataset.anIdx = idx + 1;
      entry.innerHTML = `${mv.san}${res ? ` <span class="an-badge-sm ${res.cls.cls}">${res.cls.icon}</span>` : ''}`;
      entry.addEventListener('click', () => anGoTo(idx + 1));
      row.appendChild(entry);
    });

    list.appendChild(row);
  }
}

function updateAnMoveEntry(moveIdx) {
  const entries = document.querySelectorAll('.an-move-entry');
  const entry = entries[moveIdx];
  if (!entry) { renderAnMoveList(); return; }
  const res = anResults[moveIdx];
  const mv  = anMoves[moveIdx];
  if (!res) return;
  entry.innerHTML = `${mv.san} <span class="an-badge-sm ${res.cls.cls}">${res.cls.icon}</span>`;
}

/* ── Summary stats ── */
function renderAnSummary() {
  const el = document.getElementById('an-summary');
  if (!el) return;
  const counts = { white: {}, black: {} };
  for (const [k] of Object.entries({ best:0,good:0,inaccuracy:0,mistake:0,blunder:0 })) {
    counts.white[k] = 0; counts.black[k] = 0;
  }
  const keyMap = { 'an-best':'best','an-good':'good','an-inaccuracy':'inaccuracy','an-mistake':'mistake','an-blunder':'blunder' };
  anResults.forEach((res, i) => {
    if (!res) return;
    const side = anMoves[i].color === WHITE ? 'white' : 'black';
    const key  = keyMap[res.cls.cls] || 'good';
    counts[side][key] = (counts[side][key] || 0) + 1;
  });
  el.innerHTML = `
    <span class="an-sum-chip" style="color:#fff">⬜ ${counts.white.blunder||0}🔴 ${counts.white.mistake||0}🟠 ${counts.white.inaccuracy||0}🟡</span>
    <span style="color:var(--text-3);margin:0 .5rem">|</span>
    <span class="an-sum-chip" style="color:var(--text-2)">⬛ ${counts.black.blunder||0}🔴 ${counts.black.mistake||0}🟠 ${counts.black.inaccuracy||0}🟡</span>
  `;
}

/* ── Board click in analysis (for future: enter moves) ── */
function anBoardClick(r, f) {
  /* Navigation only for now; no move input */
}

/* ── Close analysis ── */
function closeAnalysis() {
  anRunning = false;
  document.getElementById('analysis-overlay')?.classList.add('hidden');
}

/* btn-go-analyze is bound in bindEvents() above */

/* ═══════════════════════════════════════════════════════
   ERWEITERUNG G — ENDSPIEL-TRAINER
═══════════════════════════════════════════════════════ */

/* ── State ── */
let egGS        = null;
let egSelected  = null;
let egLegal     = [];
let egLastMove  = null;
let egScenario  = null;
let egMoveList  = [];
let egHintIdx   = 0;
let egOver      = false;
let egBoardBuilt= false;

/* ── Scenario definitions ── */
const EG_SCENARIOS = [
  {
    id: 'kq_k',
    title: 'König + Dame vs König',
    icon: '♛',
    desc: 'Treibe den König in die Ecke und setze Schachmatt',
    difficulty: 'Leicht', diffCls: 'eg-diff-easy',
    xp: 40, maxMoves: 30,
    fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
    theory: `<strong>Technik: Schrittweise einengen</strong><br>Treibe den schwarzen König mit Dame und König in eine Ecke.<br><br><strong>Warnung:</strong> Patt vermeiden — gib dem König immer einen Fluchtweg bis zum letzten Zug!<br><br><strong>Tipp:</strong> Dame auf d5/e5 stellen, weißen König nachziehen, dann einengen.`,
    hints: [
      'Stelle die Dame auf d5 oder e5 — sie kontrolliert viele Felder gleichzeitig.',
      'Bringe den weißen König näher — er muss beim Matt helfen.',
      'Treibe den schwarzen König an den Rand des Bretts.',
      'Vermeide Patt: Lass dem König immer mindestens einen Fluchtweg.',
      'Dame auf die 7. Reihe für Schach, dann König enger ran zum Matt!',
    ],
    successFn: gs => isCheckmate(gs),
    defendFn: (gs, moves) => egKingEvadeMove(gs, moves),
  },
  {
    id: 'kr_k',
    title: 'König + Turm vs König',
    icon: '♜',
    desc: 'Setze mit der Leiter-Methode Schachmatt',
    difficulty: 'Mittel', diffCls: 'eg-diff-medium',
    xp: 55, maxMoves: 40,
    fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
    theory: `<strong>Technik: Die Leiter</strong><br>Treibe den König Reihe für Reihe an den Rand. Der Turm "schneidet" jeweils eine Reihe ab.<br><br><strong>Merkhilfe:</strong> Turm gibt Schach → König weicht → Turm eine Reihe weiter vor.<br><br><strong>Wichtig:</strong> König und Turm müssen zusammenarbeiten. König deckt den Turm ab.`,
    hints: [
      'Stelle den Turm auf a5 — er schneidet den schwarzen König von den unteren Reihen ab.',
      'Bringe deinen König auf d2 oder e2, näher an den schwarzen König.',
      'Wenn der König eingegrenzt ist: Turm-Schach geben um ihn weiterzutreiben.',
      'Weißer König auf e3, Turm eine Reihe über dem schwarzen König.',
      'Letzter Schritt: Ta8# oder Ra8# wenn der schwarze König in der Ecke steht!',
    ],
    successFn: gs => isCheckmate(gs),
    defendFn: (gs, moves) => egKingEvadeMove(gs, moves),
  },
  {
    id: 'pawn_opp',
    title: 'Bauernendspiel: Opposition',
    icon: '♟',
    desc: 'Nutze die Opposition um den Bauern zur Dame zu verwandeln',
    difficulty: 'Leicht', diffCls: 'eg-diff-easy',
    xp: 35, maxMoves: 25,
    fen: '8/3k4/8/2KP4/8/8/8/8 w - - 0 1',
    theory: `<strong>Technik: Opposition</strong><br>Opposition = beide Könige gegenüber mit einem Feld Abstand. Wer am Zug ist muss weichen.<br><br><strong>Ziel:</strong> Bringe deinen König VOR den Bauern, gewinne die Opposition, und begleite den d-Bauern zur Umwandlung auf d8.`,
    hints: [
      'Gehe mit dem König auf c6 — das nimmt dem schwarzen König d6 weg.',
      'Nach Kd8 des schwarzen Königs: rücke den Bauern auf d6 vor.',
      'König auf d6 oder c6 sperrt den schwarzen König aus dem Weg.',
      'Ziel: Bauer auf d8 — er wird zur Dame!',
    ],
    successFn: gs => {
      if (isCheckmate(gs)) return true;
      for (let f = 0; f < 8; f++) if (gs.board[0][f] === WHITE * QUEEN) return true;
      return false;
    },
    defendFn: (gs, moves) => egKingBlockPawn(gs, moves, WHITE),
  },
  {
    id: 'pawn_break',
    title: 'Bauernendspiel: Durchbruch',
    icon: '⚡',
    desc: 'Schaffe mit einem Bauern-Opfer einen unaufhaltsamen Freibauern',
    difficulty: 'Mittel', diffCls: 'eg-diff-medium',
    xp: 45, maxMoves: 20,
    fen: '7k/ppp5/8/PPP5/8/8/8/6K1 w - - 0 1',
    theory: `<strong>Technik: Bauerndurchbruch</strong><br>Opfere 1–2 Bauern um einen Freibauern zu schaffen, der ungehindert umwandelt.<br><br><strong>Geheimtrick:</strong> b6! – wenn axb6 dann c6!, wenn cxb6 dann a6! → ein Bauer kommt immer durch!`,
    hints: [
      'b6! ist der Schlüsselzug — welche Antwort schwarz auch gibt, ein Bauer kommt durch.',
      'Nach b6 axb6: spiele c6! — der c-Bauer ist nun frei.',
      'Nach b6 cxb6: spiele a6! — der a-Bauer ist nun frei.',
      'Den Freibauern mit dem König schützen und vormarschieren lassen.',
    ],
    successFn: gs => {
      if (isCheckmate(gs)) return true;
      for (let f = 0; f < 8; f++) {
        if (gs.board[0][f] === WHITE * QUEEN || gs.board[0][f] === WHITE * ROOK) return true;
      }
      return false;
    },
    defendFn: (gs, moves) => egKingBlockPawn(gs, moves, WHITE),
  },
  {
    id: 'kbb_k',
    title: 'König + 2 Läufer vs König',
    icon: '♝',
    desc: 'Setze mit zwei Läufern Matt — treibe den König in die Ecke',
    difficulty: 'Schwer', diffCls: 'eg-diff-hard',
    xp: 70, maxMoves: 50,
    fen: '8/8/8/4k3/8/8/4B3/K1B5 w - - 0 1',
    theory: `<strong>Technik: Diagonalzange</strong><br>Zwei Läufer auf verschiedenfarbigen Feldern bilden eine Zange. Zusammen mit dem König einengen.<br><br><strong>Vorgehen:</strong><br>1. Läufer auf kontrollierende Diagonalen stellen<br>2. König heranführen<br>3. Schwarzen König in die Ecke treiben und mattsetzen`,
    hints: [
      'Bringe den weißen König in Richtung schwarzen König: Kb2 oder Kc2.',
      'Stelle die Läufer auf kontrollierende Diagonalen: z.B. Bc2 + Bd3.',
      'Treibe den schwarzen König an den Rand — Reihe 7 oder 8.',
      'Wenn der König am Rand steht: decke beide Fluchtfelder mit Läufer und König.',
      'Kein Patt! Sorge immer dafür, dass der schwarze König noch Felder hat bis zum letzten Zug.',
    ],
    successFn: gs => isCheckmate(gs),
    defendFn: (gs, moves) => egKingEvadeMove(gs, moves),
  },
  {
    id: 'kr_kp',
    title: 'Turm stoppt Freibauern',
    icon: '🛡',
    desc: 'Verhindere mit König + Turm die Umwandlung des feindlichen Bauern',
    difficulty: 'Mittel', diffCls: 'eg-diff-medium',
    xp: 50, maxMoves: 20,
    fen: '8/8/8/8/8/p7/K1k5/7R w - - 0 1',
    theory: `<strong>Technik: Turm hinter den Bauern</strong><br>Der stärkste Platz für den Turm gegen einen Freibauern ist <em>hinter</em> dem Bauern — auf derselben Linie.<br><br><strong>Methode:</strong><br>1. Turm sofort auf Ta1 (hinter dem a-Bauern)<br>2. König näher bringen<br>3. Bauern nehmen wenn möglich!`,
    hints: [
      'Ta1! sofort — stelle den Turm hinter den a-Bauern.',
      'Der schwarze König kann den Bauern nicht decken wenn der Turm dahinter steht.',
      'Bringe den weißen König näher: Ka2→Kb2 oder direkt Ka3.',
      'Wenn der König nah genug ist, nimm den Bauern mit König oder Turm.',
    ],
    successFn: gs => {
      if (isCheckmate(gs)) return true;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        if (gs.board[r][f] === BLACK * PAWN) return false;
      }
      return true;
    },
    defendFn: (gs, moves) => egPawnAdvanceMove(gs, moves),
  },
];

/* ── Defending AI: king tries to stay central and away from attacker ── */
function egKingEvadeMove(gs, moves) {
  const wkPos = findKing(gs, WHITE);
  if (!wkPos) return moves[Math.floor(Math.random() * moves.length)];
  let best = moves[0], bestScore = -Infinity;
  for (const mv of moves) {
    const next = applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f);
    if (isInCheck(next, BLACK)) continue;
    const bkPos = findKing(next, BLACK);
    if (!bkPos) continue;
    const distWK    = Math.abs(bkPos.r - wkPos.r) + Math.abs(bkPos.f - wkPos.f);
    const centrality= Math.min(bkPos.r, 7-bkPos.r) + Math.min(bkPos.f, 7-bkPos.f);
    if (centrality * 3 + distWK > bestScore) {
      bestScore = centrality * 3 + distWK;
      best = mv;
    }
  }
  return best;
}

/* ── Defending AI: king tries to block the attacker's most-advanced pawn ── */
function egKingBlockPawn(gs, moves, attackColor) {
  const defColor = -attackColor;
  let bestPawnR = attackColor === WHITE ? 7 : 0, bestPawnF = -1;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = gs.board[r][f];
    if (p === attackColor * PAWN) {
      const adv = attackColor === WHITE ? (7 - r) : r;
      const curAdv = attackColor === WHITE ? (7 - bestPawnR) : bestPawnR;
      if (adv > curAdv) { bestPawnR = r; bestPawnF = f; }
    }
  }
  if (bestPawnF < 0) return moves[Math.floor(Math.random() * moves.length)];
  const targetR = attackColor === WHITE ? bestPawnR - 1 : bestPawnR + 1;
  const targetF = bestPawnF;
  let best = moves[0], bestDist = Infinity;
  for (const mv of moves) {
    const next = applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f);
    const kPos = findKing(next, defColor);
    if (!kPos) continue;
    const dist = Math.abs(kPos.r - targetR) + Math.abs(kPos.f - targetF);
    if (dist < bestDist) { bestDist = dist; best = mv; }
  }
  return best;
}

/* ── Defending AI: black tries to advance its pawn ── */
function egPawnAdvanceMove(gs, moves) {
  const pawnMoves = moves.filter(mv =>
    Math.abs(gs.board[mv.fromR][mv.fromF]) === PAWN && mv.r > mv.fromR
  );
  if (pawnMoves.length) return pawnMoves.reduce((b, mv) => mv.r > b.r ? mv : b);
  let pawnR = -1, pawnF = -1;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    if (gs.board[r][f] === BLACK * PAWN) { pawnR = r; pawnF = f; }
  }
  const bkPos = findKing(gs, BLACK);
  if (!bkPos || pawnR < 0) return moves[Math.floor(Math.random() * moves.length)];
  let best = moves[0], bestScore = -Infinity;
  for (const mv of moves) {
    const next = applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f);
    const kPos = findKing(next, BLACK);
    if (!kPos) continue;
    const dist = Math.abs(kPos.r - pawnR) + Math.abs(kPos.f - pawnF);
    const fwd  = kPos.r - bkPos.r;
    if (-dist + fwd > bestScore) { bestScore = -dist + fwd; best = mv; }
  }
  return best;
}

/* ── Render scenario selection grid ── */
function renderEgGrid() {
  const grid = document.getElementById('eg-scenario-grid');
  if (!grid) return;
  if (!CS.endgameProgress) CS.endgameProgress = {};
  grid.innerHTML = '';
  EG_SCENARIOS.forEach(sc => {
    const done = !!CS.endgameProgress[sc.id];
    const card = document.createElement('div');
    card.className = 'eg-card' + (done ? ' done' : '');
    card.innerHTML = `
      ${done ? '<span class="eg-done-mark">✅</span>' : ''}
      <div class="eg-card-icon">${sc.icon}</div>
      <div class="eg-card-title">${sc.title}</div>
      <div class="eg-card-desc">${sc.desc}</div>
      <div class="eg-card-meta">
        <span class="eg-diff ${sc.diffCls}">${sc.difficulty}</span>
        <span class="eg-xp-badge">+${sc.xp} XP</span>
      </div>`;
    card.addEventListener('click', () => startEndgame(sc.id));
    grid.appendChild(card);
  });
}

/* ── Start / reset an endgame scenario ── */
function startEndgame(id) {
  const sc = EG_SCENARIOS.find(s => s.id === id);
  if (!sc) return;
  egScenario  = sc;
  egGS        = parseFen(sc.fen);
  egSelected  = null;
  egLegal     = [];
  egLastMove  = null;
  egMoveList  = [];
  egHintIdx   = 0;
  egOver      = false;
  if (!CS.endgameProgress) CS.endgameProgress = {};

  document.getElementById('eg-scenario-grid')?.classList.add('hidden');
  document.getElementById('eg-training')?.classList.remove('hidden');

  setText('eg-title',    sc.title);
  setText('eg-subtitle', sc.desc);
  const theoryEl = document.getElementById('eg-theory');
  if (theoryEl) theoryEl.innerHTML = sc.theory;

  const hintBox = document.getElementById('eg-hint-box');
  if (hintBox) { hintBox.classList.add('hidden'); hintBox.textContent = ''; }

  if (!egBoardBuilt) {
    const container = document.getElementById('eg-board-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(buildBoardElement('eg', handleEgClick));
      egBoardBuilt = true;
    }
  }

  egRender();
  egUpdateProgress();
  egUpdateMoveList();
}

/* ── Re-render the endgame board ── */
function egRender() {
  if (!egGS) return;
  const inChk = isInCheck(egGS, egGS.turn) ? egGS.turn : undefined;
  renderBoard('eg', egGS, egSelected, egSelected ? egLegal : [], egLastMove, inChk);
  setText('eg-move-counter', `Zug ${Math.ceil(egMoveList.length / 2)}`);
}

/* ── Board click handler (white pieces only) ── */
function handleEgClick(r, f) {
  if (!egGS || egOver || egGS.turn !== WHITE) return;
  const piece = egGS.board[r][f];

  if (egSelected) {
    const target = egLegal.find(t => t.r === r && t.f === f);
    if (target) {
      egMakeMove(egSelected.r, egSelected.f, r, f);
      egSelected = null; egLegal = [];
      return;
    }
    if (piece > 0) {
      egSelected = { r, f };
      egLegal = legalMovesFor(egGS, r, f);
    } else {
      egSelected = null; egLegal = [];
    }
  } else {
    if (piece > 0) {
      egSelected = { r, f };
      egLegal = legalMovesFor(egGS, r, f);
    }
  }
  egRender();
}

/* ── Apply white's move ── */
function egMakeMove(fromR, fromF, toR, toF) {
  if (!egGS || egOver) return;
  const captured = egGS.board[toR][toF] !== EMPTY;
  const san  = buildMoveLabel(egGS, fromR, fromF, toR, toF, QUEEN);
  egGS       = applyMove(egGS, fromR, fromF, toR, toF, QUEEN);
  egLastMove = { fromR, fromF, toR, toF };
  egMoveList.push({ san, color: WHITE });

  if (captured) SOUNDS.capture(); else SOUNDS.move();
  if (isInCheck(egGS, egGS.turn)) SOUNDS.check();

  egRender();
  egUpdateMoveList();

  if (egCheckSuccess()) return;
  if (isStalemate(egGS)) {
    egOver = true;
    egShowResult(false, '🤝 Patt! Versuche Patt zu vermeiden — nochmal versuchen.');
    return;
  }
  if (egMoveList.filter(m => m.color === WHITE).length >= egScenario.maxMoves) {
    egOver = true;
    egShowResult(false, `⏱ Mehr als ${egScenario.maxMoves} Züge! Versuche schneller zu mattsetzen.`);
    return;
  }
  setTimeout(egAiMove, 380);
}

/* ── Opponent AI responds ── */
function egAiMove() {
  if (!egGS || egOver || egGS.turn !== BLACK) return;
  const moves = allLegalMoves(egGS);
  if (!moves.length) { egCheckSuccess(); return; }

  const mv = egScenario.defendFn(egGS, moves);
  if (!mv) return;

  const captured = egGS.board[mv.r][mv.f] !== EMPTY;
  const san  = buildMoveLabel(egGS, mv.fromR, mv.fromF, mv.r, mv.f, QUEEN);
  egGS       = applyMove(egGS, mv.fromR, mv.fromF, mv.r, mv.f, QUEEN);
  egLastMove = { fromR: mv.fromR, fromF: mv.fromF, toR: mv.r, toF: mv.f };
  egMoveList.push({ san, color: BLACK });

  if (captured) SOUNDS.capture(); else SOUNDS.move();

  egRender();
  egUpdateMoveList();

  /* Check if black's pawn promoted (scenario kr_kp) */
  if (egScenario.id === 'kr_kp') {
    for (let f = 0; f < 8; f++) {
      if (egGS.board[7][f] === BLACK * QUEEN || egGS.board[7][f] === BLACK * ROOK) {
        egOver = true;
        egShowResult(false, '😓 Der Bauer hat umgewandelt! Stelle den Turm sofort auf a1!');
        return;
      }
    }
  }
  if (isStalemate(egGS)) {
    egOver = true;
    egShowResult(false, '🤝 Patt — Unentschieden! Gut verteidigt, aber kein Sieg.');
  }
}

/* ── Check if success condition met ── */
function egCheckSuccess() {
  if (!egGS || !egScenario || !egScenario.successFn(egGS)) return false;
  egOver = true;
  const firstTime = !CS.endgameProgress[egScenario.id];
  CS.endgameProgress[egScenario.id] = true;
  saveChessState();
  if (firstTime) awardXP(egScenario.xp);
  SOUNDS.correct();
  egShowResult(true, firstTime
    ? `🎉 Hervorragend! +${egScenario.xp} XP erhalten!`
    : '✅ Wieder erfolgreich gemeistert!');
  renderEgGrid();
  return true;
}

/* ── Result banner ── */
function egShowResult(success, msg) {
  const hintBox = document.getElementById('eg-hint-box');
  if (!hintBox) return;
  hintBox.classList.remove('hidden');
  hintBox.innerHTML = `<div class="eg-result-banner">
    <div class="eg-result-icon">${success ? '🏆' : '💡'}</div>
    <div class="eg-result-title">${success ? 'Geschafft!' : 'Nicht ganz!'}</div>
    <div class="eg-result-desc">${msg}</div>
    <button class="btn-accent btn-sm" id="btn-eg-retry" style="margin-top:.5rem">${success ? '↺ Nochmal üben' : '↺ Nochmal versuchen'}</button>
  </div>`;
  document.getElementById('btn-eg-retry')?.addEventListener('click', () => startEndgame(egScenario.id));
  egUpdateProgress();
}

/* ── Progress bar ── */
function egUpdateProgress() {
  if (!CS.endgameProgress) CS.endgameProgress = {};
  const total = EG_SCENARIOS.length;
  const done  = EG_SCENARIOS.filter(sc => CS.endgameProgress[sc.id]).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  setStyle('eg-progress-fill', 'width', pct + '%');
  setText('eg-progress-text', `${done} von ${total} Szenarien abgeschlossen`);
}

/* ── Move list ── */
function egUpdateMoveList() {
  const el = document.getElementById('eg-move-list');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < egMoveList.length; i += 2) {
    const wMv = egMoveList[i];
    const bMv = egMoveList[i + 1];
    const item = document.createElement('div');
    item.className = 'eg-move-item';
    item.innerHTML = `<span class="eg-move-num">${Math.floor(i / 2) + 1}.</span>
      <span class="eg-move-san">${wMv.san}</span>
      ${bMv ? `<span class="eg-move-san" style="color:var(--text-2)">${bMv.san}</span>` : ''}`;
    el.appendChild(item);
  }
  el.scrollTop = el.scrollHeight;
}

/* ── Hint button ── */
function egShowHint() {
  if (!egScenario || !egScenario.hints.length) return;
  const hint = egScenario.hints[egHintIdx % egScenario.hints.length];
  egHintIdx++;
  const hintBox = document.getElementById('eg-hint-box');
  if (hintBox) {
    hintBox.classList.remove('hidden');
    hintBox.innerHTML = `💡 ${hint}`;
  }
}

/* ── Back to grid ── */
function egBack() {
  document.getElementById('eg-scenario-grid')?.classList.remove('hidden');
  document.getElementById('eg-training')?.classList.add('hidden');
  egScenario = null;
  egGS       = null;
  renderEgGrid();
}

/* ── Bind endgame buttons (idempotent) ── */
let _egEventsBound = false;
function bindEgEvents() {
  if (_egEventsBound) return;
  _egEventsBound = true;
  document.getElementById('btn-eg-hint')?.addEventListener('click', egShowHint);
  document.getElementById('btn-eg-reset')?.addEventListener('click', () => { if (egScenario) startEndgame(egScenario.id); });
  document.getElementById('btn-eg-back')?.addEventListener('click', egBack);
}

/* ── Hook into view nav ── */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  if (btn.dataset.view === 'endgames') {
    bindEgEvents();
    renderEgGrid();
    egUpdateProgress();
  }
}, true);


/* ═══════════════════════════════════════════════════════════
   CHESS STORY MODE — Die Schach-Akademie
   3 Akte · 11 Kapitel · Mini-Missionen · Boss-Kämpfe
═══════════════════════════════════════════════════════════ */

/* ── Story Achievements (hinzufügen falls noch nicht vorhanden) ── */
const CS_ACH = [
  {id:'cs_first',    icon:'♙', title:'Erster Zug',         desc:'Story-Kapitel 1 abgeschlossen'},
  {id:'cs_act1',     icon:'♞', title:'Grundlagen-Meister', desc:'Akt 1 der Schach-Akademie abgeschlossen'},
  {id:'cs_act2',     icon:'♝', title:'Taktik-Experte',     desc:'Akt 2 der Schach-Akademie abgeschlossen'},
  {id:'cs_act3',     icon:'♛', title:'Großmeister-Schüler',desc:'Alle 3 Akte abgeschlossen'},
  {id:'cs_boss1',    icon:'🏰', title:'Ritter geschlagen',  desc:'Ritter Rochus besiegt'},
  {id:'cs_boss2',    icon:'👸', title:'Baronin bezwungen',  desc:'Baronin Bianca besiegt'},
  {id:'cs_boss3',    icon:'🤖', title:'DEEP-8 offline',     desc:'DEEP-8 besiegt – höchste Ehre!'},
  {id:'cs_perfect',  icon:'♔', title:'Perfekte Partie',    desc:'Kapitel ohne Fehler abgeschlossen'},
  {id:'cs_nodmg',    icon:'🛡', title:'Unantastbar',        desc:'Boss ohne eigenen Materialverlust besiegt'},
  {id:'cs_daily_cs', icon:'📋', title:'Tagesaufgabe',       desc:'Tägliche Schach-Challenge abgeschlossen'},
];
CS_ACH.forEach(a => { if (!CHESS_ACHIEVEMENTS.find(x => x.id === a.id)) CHESS_ACHIEVEMENTS.push(a); });

/* ── Story Data ── */
const CHESS_STORY_ACTS = [
/* ══════════ ACT 1: Die Grundlagen ══════════ */
{ id:'csa1', title:'Die Grundlagen', icon:'♙', accent:'#4fc3f7',
  desc:'Das Brett, die Figuren, erste Züge – dein Einstieg in die Welt des Schachs',
  chapters:[
  { id:'ca1c1', num:'1-1', title:'Das Schachbrett', icon:'♟',
    story:'Du betrittst die ehrwürdige Schach-Akademie. Großmeister Kaspar begrüßt dich mit einem ruhigen Lächeln.',
    intro:[
      {a:'👴',n:'GM Kaspar', t:'Willkommen, junger Freund! Ich bin Großmeister Kaspar. Hier lernst du das edelste aller Spiele.'},
      {a:'👴',n:'GM Kaspar', t:'Das Schachbrett: 64 Felder, 8×8. Die Linien heißen a–h, die Reihen 1–8. Weiß spielt von unten.'},
    ],
    mms:[
      { id:'ca1c1m1', title:'Finde das Zentrum', task:'Klicke auf das wichtige Zentralfeld e4 – das Herzstück des Schachbretts!',
        fen:'8/8/8/8/8/8/8/8 w - - 0 1', type:'click', answer:'e4',
        hint:'Das Zentrum liegt in der Mitte des Bretts. e4 ist das 5. Feld von links, 5. Reihe von unten.', time:45,
        win:'Perfekt! e4 ist das wichtigste Zentralfeld für Weiß.', lose:'Das Zentrum ist die Mitte des Bretts – Feld e4!'},
      { id:'ca1c1m2', title:'Das andere Zentrumfeld', task:'Klicke auf Feld d4 – das zweite wichtige Zentralfeld!',
        fen:'8/8/8/8/4P3/8/8/8 w - - 0 1', type:'click', answer:'d4',
        hint:'d4 liegt links von e4, ebenfalls im Zentrum des Bretts.', time:45,
        win:'Ausgezeichnet! d4 und e4 bilden zusammen das mächtige weiße Zentrum.', lose:'d4 liegt in der Mitte, eine Spalte links von e4!'},
    ],
    challenge:{ type:'lesson', lessonId:'b1', desc:'Lerne die Koordinaten kennen und klicke auf das richtige Feld.' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Großartig! Du kennst das Brett. Das Fundament ist gelegt!'}],
    intro_fail:[{a:'👴',n:'GM Kaspar',t:'Das Brett ist verwirrend am Anfang. Kein Problem – übe nochmal!'}],
    diff:{ easy:{xp:40,desc:'Felder kennenlernen'}, normal:{xp:60,desc:'Koordinaten sicher'}, hard:{xp:90,desc:'Blitzschnell orten'} },
  },
  { id:'ca1c2', num:'1-2', title:'Der mächtige Bauer', icon:'♙',
    story:'GM Kaspar zeigt dir die bescheidenste aber vielseitigste Figur: den Bauern.',
    intro:[
      {a:'👴',n:'GM Kaspar', t:'Der Bauer – er scheint schwach, aber ein Bauer der die letzte Reihe erreicht wird zur Dame!'},
      {a:'👴',n:'GM Kaspar', t:'Bauern ziehen vorwärts, schlagen diagonal. Beim ersten Zug darf er zwei Felder vorziehen.'},
    ],
    mms:[
      { id:'ca1c2m1', title:'Bauernzug', task:'Ziehe den Bauern von e2 nach e4 – der klassische Eröffnungszug!',
        fen:'4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', type:'move', answer:{from:'e2',to:'e4'},
        hint:'Klicke erst auf den Bauern auf e2, dann auf e4.', time:45,
        win:'Perfekt! 1.e4 – der meistgespielte erste Zug der Schachgeschichte!', lose:'Der Bauer steht auf e2. Klicke ihn an, dann auf e4!'},
      { id:'ca1c2m2', title:'Bauernschlag', task:'Schlage den schwarzen Bauern diagonal mit deinem Bauern!',
        fen:'4k3/8/8/8/8/3p4/4P3/4K3 w - - 0 1', type:'move', answer:{from:'e2',to:'d3'},
        hint:'Bauern schlagen diagonal. Dein Bauer auf e2 kann den Bauern auf d3 schlagen.', time:45,
        win:'Excellent! Bauern schlagen immer diagonal – das ist ihr Kampfstil!', lose:'Bauern schlagen diagonal! Von e2 auf d3 (oder f3) ist ein Schlag.'},
    ],
    challenge:{ type:'lesson', lessonId:'m1', desc:'Meistere alle Bauernbewegungen.' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Wunderbar! Du verstehst den Bauern. Die Bauerndynamik ist das A und O!'}],
    intro_fail:[{a:'👴',n:'GM Kaspar',t:'Bauern sind tricky. Vorwärts ziehen, diagonal schlagen – nochmal üben!'}],
    diff:{ easy:{xp:45,desc:'Bauernzüge kennen'}, normal:{xp:65,desc:'Bauernstruktur verstehen'}, hard:{xp:95,desc:'Bauernstrategie meistern'} },
  },
  { id:'ca1c3', num:'1-3', title:'Türme & Läufer', icon:'♜',
    story:'Luna, deine Mitschülerin, fordert dich freundlich zu einem Übungsspiel mit Fernkämpfern heraus.',
    intro:[
      {a:'👧',n:'Luna', t:'Hi! Ich bin Luna. Zeig mal was du kannst – Türme und Läufer sind meine Lieblingsfiguren!'},
      {a:'👧',n:'Luna', t:'Türme bewegen sich horizontal und vertikal – so weit sie wollen! Läufer diagonal, bleiben auf ihrer Farbe.'},
    ],
    mms:[
      { id:'ca1c3m1', title:'Turm kontrolliert', task:'Ziehe den Turm von h1 nach e1 und kontrolliere die gesamte 1. Reihe!',
        fen:'4k3/8/8/8/8/8/8/6KR w - - 0 1', type:'move', answer:{from:'h1',to:'e1'},
        hint:'Der Turm auf h1 kann horizontal nach e1 gleiten. Klicke erst auf h1, dann auf e1.', time:45,
        win:'Turm auf e1 kontrolliert die gesamte 1. Reihe! Ein Turm auf einer offenen Linie ist extrem mächtig.', lose:'Türme gleiten horizontal oder vertikal. Klicke den Turm auf h1, dann Zielfeld e1!'},
      { id:'ca1c3m2', title:'Läufer diagonal', task:'Ziehe den Läufer von c1 nach g5 – beherrsche die Diagonale!',
        fen:'4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', type:'move', answer:{from:'c1',to:'g5'},
        hint:'Läufer ziehen diagonal so weit sie wollen. Von c1 geht die Diagonale: d2, e3, f4, g5!', time:45,
        win:'Läufer auf g5 beherrscht die lange Diagonale – Fernwirkung quer übers Brett!', lose:'Läufer auf c1 → klicke ihn an, dann auf g5 (diagonal: d2→e3→f4→g5).'},
    ],
    challenge:{ type:'lesson', lessonId:'m3', desc:'Beweise dein Können mit Türmen und Läufern.' },
    intro_success:[{a:'👧',n:'Luna',t:'Wow, du lernst schnell! Türme und Läufer sitzen bei dir schon gut.'}],
    intro_fail:[{a:'👧',n:'Luna',t:'Mach dir keine Sorgen! Türme und Läufer brauchen etwas Übung – du schaffst das!'}],
    diff:{ easy:{xp:50,desc:'Turm & Läufer bewegen'}, normal:{xp:70,desc:'Figurenzusammenspiel'}, hard:{xp:100,desc:'Offene Linien meistern'} },
  },
  { id:'ca1c4', num:'1-4', title:'Springer, Dame & König', icon:'♞',
    story:'Ein mysteriöser älterer Schüler, Baron Viktor, schaut dir beim Lernen zu. Er grinst überheblich.',
    intro:[
      {a:'😈',n:'Baron Viktor', t:'Ha! Ein Neuling? Der Springer – die einzige Figur die über andere springen kann. L-Form!'},
      {a:'👴',n:'GM Kaspar', t:'Ignoriere Viktor. Die Dame ist die mächtigste Figur – sie zieht wie Turm UND Läufer zusammen!'},
    ],
    mms:[
      { id:'ca1c4m1', title:'Springer-Sprung', task:'Lass den Springer von g1 nach f3 springen – ein klassischer Entwicklungszug!',
        fen:'4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', type:'move', answer:{from:'g1',to:'f3'},
        hint:'Springer springen im L: zwei Felder in eine Richtung, dann ein Feld senkrecht. Von g1 nach f3!', time:45,
        win:'Sf3 – einer der besten ersten Züge! Springer entwickeln und Zentrum kontrollieren!', lose:'Springer: L-Form. Von g1: zwei links = e, dann ein runter = f3. Klick g1 dann f3!'},
      { id:'ca1c4m2', title:'Damenschlag', task:'Schlage mit der Dame den Bauern auf d5 und kontrolliere das Zentrum!',
        fen:'3pk3/8/8/3p4/8/8/8/3QK3 w - - 0 1', type:'move', answer:{from:'d1',to:'d5'},
        hint:'Die Dame auf d1 kann gerade nach d5 ziehen und den Bauern schlagen.', time:45,
        win:'Dxd5! Die Dame schlägt und kontrolliert gleichzeitig das Zentrum!', lose:'Die Dame zieht wie Turm und Läufer. Von d1 nach d5 ist ein gerader Zug!'},
    ],
    challenge:{ type:'lesson', lessonId:'m5', desc:'Beweise dein Wissen über alle Figuren.' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Wunderbar! Alle Figuren kennst du jetzt. Bist du bereit für den ersten Kampf?'}],
    intro_fail:[{a:'😈',n:'Baron Viktor',t:'Haha! Noch nicht fertig? Na ja, nicht jeder ist eben ein Talent...'}],
    diff:{ easy:{xp:55,desc:'Alle Figuren kennen'}, normal:{xp:75,desc:'Figuren gezielt einsetzen'}, hard:{xp:105,desc:'Komplexe Figurenspiele'} },
  },
  ],
  boss:{ id:'cboss1', name:'Ritter Rochus', icon:'🏰',
    desc:'Ein freundlicher aber hartnäckiger Gegner. Er liebt Springer-Züge!',
    startFen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor:1, aiLevel:1, timeLimit:0,
    taunts:['Interessanter Zug...','Hmm, du lernst schnell!','Mein Springer wartet auf dich!','Schau dir das Zentrum an!'],
    intro:[
      {a:'🏰',n:'Ritter Rochus', t:'Ich bin Ritter Rochus! Lass uns spielen. Ich verspreche, nicht zu einfach zu sein.'},
      {a:'👴',n:'GM Kaspar', t:'Rochus ist gut, aber du hast alles gelernt was du brauchst. Zeig was du kannst!'},
    ],
    victory:[
      {a:'🏰',n:'Ritter Rochus', t:'Ausgezeichnet gespielt! Du hast echtes Talent. Bis zum nächsten Mal!'},
      {a:'👴',n:'GM Kaspar', t:'🎉 Bravo! Akt 1 abgeschlossen! Du bist kein Anfänger mehr!'},
    ],
    defeat:[{a:'🏰',n:'Ritter Rochus', t:'Gut gekämpft! Aber diesmal war ich schneller. Versuche es nochmal!'}],
    achievementId:'cs_boss1',
    xpBonus:150,
  },
  xpBonus:250,
},
/* ══════════ ACT 2: Die Taktik ══════════ */
{ id:'csa2', title:'Die Taktik', icon:'♟', accent:'#69f0ae',
  desc:'Schach, Matt, Gabeln, Pins – lerne wie echte Schachspieler denken',
  unlockRequires:'csa1',
  chapters:[
  { id:'ca2c1', num:'2-1', title:'Schach & Matt', icon:'♔',
    story:'Luna strahlt dich an: "Jetzt wird es ernst! Schach und Matt sind die Seele des Spiels."',
    intro:[
      {a:'👧',n:'Luna', t:'Schach bedeutet: dein König wird angegriffen! Du MUSST reagieren. Matt heißt – keine Reaktion möglich!'},
      {a:'👧',n:'Luna', t:'Wenn dein König im Schach steht, gibt es nur drei Wege: flüchten, decken, schlagende Figur schlagen!'},
    ],
    mms:[
      { id:'ca2c1m1', title:'Matt setzen!', task:'Matt in 1! Ziehe die Dame von f7 nach g7 – das ist Schachmatt!',
        fen:'6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1', type:'move', answer:{from:'f7',to:'g7'},
        hint:'Dame auf f7 → nach g7. Der König auf g8 hat dann keine einzige freie Ecke mehr!', time:45,
        win:'Dg7#! Schachmatt – der König auf g8 kann nirgendwo hin. Meisterhaft!', lose:'Dame auf f7 nach g7 gibt Schachmatt! Klick Dame (f7) dann g7.'},
      { id:'ca2c1m2', title:'Schach geben', task:'Gib dem schwarzen König Schach! Ziehe den Turm von a1 nach a8.',
        fen:'4k3/8/8/8/8/8/8/R3K3 w - - 0 1', type:'move', answer:{from:'a1',to:'a8'},
        hint:'Turm a1 gleitet geradeaus nach a8. Von dort greift er die gesamte 8. Reihe an – auch Feld e8!', time:45,
        win:'Ta8+! Schach – der König auf e8 muss reagieren. Der Turm beherrscht die ganze 8. Reihe!', lose:'Turm von a1 nach a8 gibt Schach! Klick Turm (a1) dann a8.'},
    ],
    challenge:{ type:'puzzle', puzzleId:'p1', desc:'Löse das erste echte Schachpuzzle!' },
    intro_success:[{a:'👧',n:'Luna',t:'Du verstehst Matt! Das ist der Schlüssel zum Schach. Weiter so!'}],
    intro_fail:[{a:'👧',n:'Luna',t:'Matt ist knifflig. Denk daran: der König muss jeden Ausweg verloren haben!'}],
    diff:{ easy:{xp:60,desc:'Matt in 1 erkennen'}, normal:{xp:85,desc:'Mattmuster kennen'}, hard:{xp:120,desc:'Mattangriffe planen'} },
  },
  { id:'ca2c2', num:'2-2', title:'Die Gabel', icon:'♞',
    story:'Baron Viktor schaut genervt zu. "Die Gabel – die billigste Taktik!" schreit er. GM Kaspar lächelt.',
    intro:[
      {a:'👴',n:'GM Kaspar', t:'Die Gabel: eine Figur greift gleichzeitig zwei gegnerische Figuren an. Jetzt muss dein Gegner wählen!'},
      {a:'😈',n:'Baron Viktor', t:'Pff, Gabeln benutzen nur Amateure! ...Okay, zugegeben, sie sind sehr effektiv.'},
    ],
    mms:[
      { id:'ca2c2m1', title:'Springer-Gabel', task:'Gabel! Springe mit dem Springer nach e4 – greife Dame auf d6 UND König auf f6 gleichzeitig an!',
        fen:'8/8/3q1k2/8/8/2N5/8/4K3 w - - 0 1', type:'move', answer:{from:'c3',to:'e4'},
        hint:'Springer von c3 nach e4 springt im L (2 rechts + 1 hoch). Von e4 greift er d6 (Dame) UND f6 (König) an!', time:60,
        win:'Se4! Perfekte Gabel! Der Springer greift gleichzeitig Dame auf d6 und König auf f6 an – Materialgewinn!', lose:'Springer c3→e4 macht die Gabel! Klick Springer (c3) dann e4.'},
      { id:'ca2c2m2', title:'Damengabel', task:'Gabel mit der Dame! Dame nach a1 greift Turm a8 UND König h8 gleichzeitig an!',
        fen:'r6k/8/8/8/8/8/8/3QK3 w - - 0 1', type:'move', answer:{from:'d1',to:'a1'},
        hint:'Dame auf a1: greift den Turm auf a8 (gerade Linie) UND den König auf h8 (Diagonale a1-h8) an!', time:60,
        win:'Da1! Brillante Gabel! Turm a8 (a-Linie) und König h8 (Diagonale) werden gleichzeitig angegriffen!', lose:'Dame von d1 nach a1 macht die Doppelgabel. Klick Dame (d1) dann a1.'},
    ],
    challenge:{ type:'puzzle', puzzleId:'p6', desc:'Finde die Gabel in einem echten Puzzle!' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Exzellent! Die Gabel ist eine deiner wichtigsten Waffen. Gut verinnerlicht!'}],
    intro_fail:[{a:'😈',n:'Baron Viktor',t:'Siehst du? Nicht jeder versteht die Gabel sofort... aber gib nicht auf!'}],
    diff:{ easy:{xp:65,desc:'Einfache Gabeln finden'}, normal:{xp:90,desc:'Gabeln in realen Partien'}, hard:{xp:125,desc:'Komplexe Mehrfachgabeln'} },
  },
  { id:'ca2c3', num:'2-3', title:'Eröffnungsprinzipien', icon:'♚',
    story:'Ein neuer Tag in der Akademie. GM Kaspar erklärt die geheimen Prinzipien der Eröffnung.',
    intro:[
      {a:'👴',n:'GM Kaspar', t:'Drei goldene Regeln der Eröffnung: 1. Kontrolliere das Zentrum! 2. Entwickle deine Figuren! 3. Rochiere!'},
      {a:'👴',n:'GM Kaspar', t:'Wer diese drei Regeln befolgt, startet jede Partie mit Vorteil. Merke sie dir gut!'},
    ],
    mms:[
      { id:'ca2c3m1', title:'Zentrum besetzen', task:'Spiele den besten ersten Zug – besetze das Zentrum mit e4!',
        fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', type:'move', answer:{from:'e2',to:'e4'},
        hint:'Der Klassiker: e4 kontrolliert d5 und f5, öffnet Wege für Läufer und Dame!', time:45,
        win:'1.e4! Der König aller Eröffnungszüge – Zentrum besetzen, Figuren entwickeln!', lose:'e4 ist der stärkste erste Zug. Bauer von e2 nach e4!'},
      { id:'ca2c3m2', title:'Springer entwickeln', task:'Entwickle den Königsspringer nach f3 – klassische Entwicklung!',
        fen:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', type:'move', answer:{from:'g1',to:'f3'},
        hint:'Nach 1.e4 ist Sf3 der beste zweite Zug – Springer entwickeln und Zentrum kontrollieren!', time:45,
        win:'2.Sf3! Springer entwickelt, greift e5 an, bereitet Rochade vor. Perfekte Eröffnung!', lose:'Sf3 entwickelt den Springer optimal. Von g1 nach f3!'},
    ],
    challenge:{ type:'puzzle', puzzleId:'p7', desc:'Wende die Eröffnungsprinzipien an.' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Perfekt! Mit diesen Prinzipien startest du jede Partie stark. Die Basis ist solide!'}],
    intro_fail:[{a:'👴',n:'GM Kaspar',t:'Eröffnungsprinzipien brauchen Übung. Wiederhole: Zentrum, Entwicklung, Rochade!'}],
    diff:{ easy:{xp:60,desc:'3 Prinzipien kennen'}, normal:{xp:85,desc:'Eröffnungen anwenden'}, hard:{xp:120,desc:'Tiefe Eröffnungstheorie'} },
  },
  { id:'ca2c4', num:'2-4', title:'König & Turm Endspiel', icon:'♛',
    story:'Luna bringt dich zum Endspiel-Saal. "Endspiele entscheiden Partien!" sagt sie begeistert.',
    intro:[
      {a:'👧',n:'Luna', t:'Das Damenmatt: mit König und Dame den einsamen König in eine Ecke treiben. Lernen wir es Schritt für Schritt!'},
      {a:'👧',n:'Luna', t:'Zwei Schlüsselkonzepte: Die Opposition (Könige stehen sich vis-à-vis) und die Leiter (Turm schneidet ab).'},
    ],
    mms:[
      { id:'ca2c4m1', title:'Dame-Matt', task:'Matt in 1! Dame von g2 nach g1 – der König auf h1 ist eingeschlossen!',
        fen:'8/8/8/8/8/8/6QK/7k w - - 0 1', type:'move', answer:{from:'g2',to:'g1'},
        hint:'Dame g2→g1 gibt Schach. König h1 kann nicht: g2 (Dame), h2 (weißer König). Schachmatt!', time:60,
        win:'Dg1#! Perfektes Endspiel-Matt! König h1 hat keinen einzigen Ausweg mehr!', lose:'Dame von g2 nach g1 ist das Schachmatt. Klick Dame (g2) dann g1.'},
      { id:'ca2c4m2', title:'König in die Ecke', task:'Bringe den gegnerischen König in die Ecke – König nach g6 ist der richtige Weg!',
        fen:'8/8/8/4k3/8/8/8/4K2Q w - - 0 1', type:'move', answer:{from:'e1',to:'e2'},
        hint:'Der König sollte in Richtung des gegnerischen Königs gehen. Ke2 macht Opposition möglich!', time:60,
        win:'Ke2! Gut. Der König marschiert Richtung Gegner – das ist der Schlüssel im Endspiel!', lose:'Der König muss aktiv werden. Ke2 ist ein guter erster Schritt! Klick König auf e1, dann e2.'},
    ],
    challenge:{ type:'endgame', scenarioId:'kg_mate', desc:'Bringe das Damenmatt-Endspiel zu Ende.' },
    intro_success:[{a:'👧',n:'Luna',t:'Du verstehst Endspiele! Das ist etwas was viele Anfänger überspringen – nicht du!'}],
    intro_fail:[{a:'👧',n:'Luna',t:'Endspiele brauchen Geduld. Denk systematisch – Schritt für Schritt zum Ziel!'}],
    diff:{ easy:{xp:70,desc:'Endspielkonzepte kennen'}, normal:{xp:95,desc:'Endspiele ausführen'}, hard:{xp:130,desc:'Komplexe Endspiele'} },
  },
  ],
  boss:{ id:'cboss2', name:'Baronin Bianca', icon:'👸',
    desc:'Vikors jüngere Schwester – klug, schnell, und spielt aggressiv.',
    startFen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor:1, aiLevel:2, timeLimit:0,
    taunts:['Meine Taktik greift!','Vorsicht vor meinen Gabeln!','Du kämpfst gut – aber ich bin besser!','Dein König ist nicht sicher!'],
    intro:[
      {a:'👸',n:'Baronin Bianca', t:'Ich bin Bianca! Bruder Viktor hat viel von dir gesprochen... Lass sehen ob er recht hat!'},
      {a:'👴',n:'GM Kaspar', t:'Bianca ist taktisch sehr stark. Behalte dein Zentrum und entwickle schnell!'},
    ],
    victory:[
      {a:'👸',n:'Baronin Bianca', t:'Unglaublich! Du hast wirklich gelernt. Vielleicht ist Viktor doch zu arrogant...'},
      {a:'👴',n:'GM Kaspar', t:'🎉 Fantastisch! Akt 2 abgeschlossen! Du bist jetzt ein echter Taktiker!'},
    ],
    defeat:[{a:'👸',n:'Baronin Bianca', t:'Ha! Taktik schlägt immer Strategie. Versuche es nochmal – du kannst mich schlagen!'}],
    achievementId:'cs_boss2',
    xpBonus:200,
  },
  xpBonus:350,
},
/* ══════════ ACT 3: Das Finale ══════════ */
{ id:'csa3', title:'Das Finale', icon:'♛', accent:'#f59e0b',
  desc:'Strategie, Kombinationen und das ultimative Duell gegen DEEP-8',
  unlockRequires:'csa2',
  chapters:[
  { id:'ca3c1', num:'3-1', title:'Kombinationsangriff', icon:'⚔️',
    story:'Baron Viktor tritt ins Zimmer. "Ich habe DEEP-8 aktiviert. Nur wer Kombinationen versteht, kann bestehen!"',
    intro:[
      {a:'😈',n:'Baron Viktor', t:'Kombinationen! Eine Abfolge von Zügen, oft mit Opfern, die zum Matt oder Materialgewinn führt.'},
      {a:'😈',n:'Baron Viktor', t:'Ohne Kombinationsverständnis bist du hoffnungslos. Mit ihr – unaufhaltbar.'},
    ],
    mms:[
      { id:'ca3c1m1', title:'Figurenopfer', task:'Opfere den Springer für einen entscheidenden Angriff! Sxf7 öffnet den Königsflügel!',
        fen:'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1', type:'move', answer:{from:'f3',to:'e5'},
        hint:'Sxe5 greift den Springer auf c6 und attackiert f7 gleichzeitig. Das ist eine Gabel – und auch ein Opfer!', time:60,
        win:'Sxe5! Springergabel – gleichzeitig c6 und f7 angegriffen. Brilliant!', lose:'Sf3 nach e5 schlägt und gabelt gleichzeitig c6 und f7! Klick Springer, dann e5.'},
      { id:'ca3c1m2', title:'Mattangriff', task:'Initiiere den Angriff! Dh5 droht Matt auf f7!',
        fen:'r1bqk2r/pppp1ppp/2n2n2/4N3/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 1', type:'move', answer:{from:'d1',to:'h5'},
        hint:'Dh5 droht Dxf7# – der König auf e8 ist in Gefahr! Klassischer Läufer-Dame-Angriff.', time:60,
        win:'Dh5+! Der klassische Scholar\'s-Mate-Angriff beginnt. Drohung Dxf7#!', lose:'Dame nach h5 droht f7-Matt! Von d1 nach h5 – klick Dame dann h5.'},
    ],
    challenge:{ type:'puzzle', puzzleId:'p16', desc:'Finde die entscheidende Kombination!' },
    intro_success:[{a:'😈',n:'Baron Viktor',t:'...Nicht schlecht. Du verstehst Kombinationen. Aber kannst du DEEP-8 besiegen?'}],
    intro_fail:[{a:'👴',n:'GM Kaspar',t:'Kombinationen brauchen Übung. Gib nicht auf – jeder Großmeister hat damit angefangen!'}],
    diff:{ easy:{xp:80,desc:'Einfache Kombinationen'}, normal:{xp:110,desc:'Mittlere Kombinationen'}, hard:{xp:150,desc:'Komplexe Opfer'} },
  },
  { id:'ca3c2', num:'3-2', title:'Patt & Remis', icon:'🤝',
    story:'GM Kaspar lehrt einen wichtigen aber oft vergessenen Aspekt: Remis-Techniken und Fallen!',
    intro:[
      {a:'👴',n:'GM Kaspar', t:'Patt: der König am Zug hat keinen legalen Zug aber steht NICHT im Schach. Das Spiel endet remis!'},
      {a:'👴',n:'GM Kaspar', t:'Als starker Spieler kennst du Patt-Fallen – als Verteidiger kannst du sie nutzen um nicht zu verlieren!'},
    ],
    mms:[
      { id:'ca3c2m1', title:'Patt erkennen', task:'Klicke auf das Feld wohin der schwarze König NICHT ziehen darf (alle Felder kontrolliert)!',
        fen:'5k2/5Q2/5K2/8/8/8/8/8 b - - 0 1', type:'click', answer:'f8',
        hint:'Der schwarze König auf f8 steht... im Patt! Klicke auf f8 – er kann nirgendwo hin ohne ins Schach zu gehen.', time:45,
        win:'Patt erkannt! Der König auf f8 kann nicht ziehen ohne ins Schach zu gehen – Remis!', lose:'Klicke auf f8 – dort steht der schwarze König im Patt!'},
      { id:'ca3c2m2', title:'Patt-Falle erkennen', task:'Weiß hat einen Fehler gemacht – Patt! Klicke auf das Feld wo der schwarze König steht (er kann nicht ziehen).',
        fen:'7k/8/5KQ1/8/8/8/8/8 b - - 0 1', type:'click', answer:'h8',
        hint:'Schwarzer König auf h8: g8 wird von der Dame kontrolliert, h7 ebenfalls. Kein legaler Zug – Patt!', time:45,
        win:'Richtig! König h8 ist gepatt – Dame auf g6 und König f6 blockieren alle Fluchtwege. Weiß hat einen Fehler gemacht!', lose:'Klicke auf h8 – dort steht der schwarze König im Patt!'},
    ],
    challenge:{ type:'puzzle', puzzleId:'p18', desc:'Nutze eine Patt-Falle zur Rettung!' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Ausgezeichnet! Patt-Fallen sind wertvolles Wissen – du hast das Konzept verstanden!'}],
    intro_fail:[{a:'👴',n:'GM Kaspar',t:'Patt ist subtil. Denk daran: wenn der König nicht ziehen KANN ohne ins Schach zu gehen – Patt!'}],
    diff:{ easy:{xp:75,desc:'Patt erkennen'}, normal:{xp:100,desc:'Patt-Fallen nutzen'}, hard:{xp:140,desc:'Remis-Techniken meistern'} },
  },
  { id:'ca3c3', num:'3-3', title:'Das Meisterduell', icon:'♛',
    story:'Der Moment ist da. GM Kaspar schaut dich ernst an: "Ich habe alles gelehrt was ich kann. Es liegt an dir."',
    intro:[
      {a:'👴',n:'GM Kaspar', t:'Dieses letzte Kapitel fasst alles zusammen. Zeige mir dass du wirklich verstanden hast.'},
      {a:'👧',n:'Luna', t:'Ich drücke dir die Daumen! Du hast so viel gelernt – du schaffst das bestimmt!'},
      {a:'😈',n:'Baron Viktor', t:'...Ja okay, du bist vielleicht doch kein kompletter Versager. Zeig DEEP-8 was du kannst!'},
    ],
    mms:[
      { id:'ca3c3m1', title:'Matt in 2', task:'Matt in 2 Zügen! Beginne mit dem stärksten ersten Zug!',
        fen:'r1b2rk1/ppp2ppp/2n5/3pp1N1/2BP4/8/PPP2PPP/R1BQK2R w KQ - 0 1', type:'move', answer:{from:'g5',to:'f7'},
        hint:'Sxf7 opfert den Springer – aber danach gibt es Matt! Weiß beginnt mit dem Springer-Opfer.', time:60,
        win:'Sxf7! Springer-Opfer öffnet den Angriff – Dh5+ folgt und Matt ist unausweichlich!', lose:'Sg5xf7 ist das Opfer! Klick Springer auf g5, dann auf f7.'},
      { id:'ca3c3m2', title:'Springer schlagen', task:'Schwarz schlägt zurück! Schlage den weißen Springer auf f7 mit dem Turm!',
        fen:'r1b2rk1/ppp2Npp/2n5/3pp3/2BP4/8/PPP2PPP/R1BQK2R b KQ - 0 1', type:'move', answer:{from:'f8',to:'f7'},
        hint:'Schwarzer Turm auf f8 schlägt den weißen Springer auf f7: Txf7. Der Turm zieht ein Feld geradeaus!', time:60,
        win:'Txf7! Du schlägst den Springer – aber Weiß hat jetzt Dh5+ und der Mattangriff beginnt!', lose:'Schwarzer Turm von f8 nach f7 schlägt den Springer! Klick Turm (f8) dann f7.'},
    ],
    challenge:{ type:'puzzle', puzzleId:'p20', desc:'Zeige dein ganzes Können in diesem Meisterpuzzle!' },
    intro_success:[{a:'👴',n:'GM Kaspar',t:'Wunderbar! Du hast wirklich verstanden was Schach ausmacht. Jetzt: der finale Boss!'}],
    intro_fail:[{a:'👴',n:'GM Kaspar',t:'Fast! Der Boss wartet. Gib nicht auf – du bist fast bereit!'}],
    diff:{ easy:{xp:90,desc:'Kombinationen erkennen'}, normal:{xp:120,desc:'Partien planen'}, hard:{xp:160,desc:'Meisterkombinationen'} },
  },
  ],
  boss:{ id:'cboss3', name:'DEEP-8', icon:'🤖',
    desc:'Ein Schachcomputer. Keine Emotionen, keine Fehler. Kann er besiegt werden?',
    startFen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor:1, aiLevel:3, timeLimit:0,
    taunts:['Analyse läuft...','Dein Zug ist suboptimal.','Bewertung: +0.8 für mich.','Ich berechne 5 Züge voraus.','Deine Stellung ist geschwächt.'],
    intro:[
      {a:'🤖',n:'DEEP-8', t:'INITIALISIERUNG. Schachmodul aktiv. Spieler-Niveau: MITTEL. Ich passe meine Stärke an.'},
      {a:'😈',n:'Baron Viktor', t:'DEEP-8 ist... unbesiegbar. Ich habe selbst verloren. Aber du... vielleicht schaffst du es!'},
      {a:'👴',n:'GM Kaspar', t:'Dies ist der Moment für den wir trainiert haben. Zeige DEEP-8 die Schönheit menschlichen Schachspielens!'},
    ],
    victory:[
      {a:'🤖',n:'DEEP-8', t:'FEHLER DETECTED. Spieler hat gewonnen. Analysiere Spielweise... EXCEPTIONAL.'},
      {a:'👴',n:'GM Kaspar', t:'🏆 UNMÖGLICH! Du hast DEEP-8 besiegt! Du bist ein Großmeister-Schüler! Ich bin stolz auf dich!'},
      {a:'👧',n:'Luna', t:'Das war das Beste was ich je gesehen habe! Du bist jetzt einer von uns!'},
      {a:'😈',n:'Baron Viktor', t:'...Ich gebe es zu. Du... bist gut. Vielleicht sogar besser als ich. Respekt.'},
    ],
    defeat:[{a:'🤖',n:'DEEP-8', t:'ANALYSE KOMPLETT. Niederlage des Spielers. Empfehlung: Mehr Taktik üben. RETRY verfügbar.'}],
    achievementId:'cs_boss3',
    xpBonus:300,
  },
  xpBonus:500,
},
];

/* ── Daily Chess Challenge ── */
const CHESS_DAILY_STORY = [
  {fen:'4k3/8/8/8/8/8/8/R3K3 w - - 0 1',        task:'Gib dem König Schach mit dem Turm!',   title:'Turm-Mission', answer:{from:'a1',to:'a8'}},
  {fen:'4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1',        task:'Gib dem König Schach mit der Dame!',  title:'Damen-Mission',answer:{from:'d4',to:'d8'}},
  {fen:'4k3/8/8/8/8/8/8/4K2N w - - 0 1',         task:'Springe mit dem Springer nach f3!',   title:'Springer-Mission',answer:{from:'h1',to:'f2'}},
  {fen:'4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',        task:'Spiele den besten Bauernzug – e4!',   title:'Bauern-Mission',answer:{from:'e2',to:'e4'}},
  {fen:'5k2/5Q2/5K2/8/8/8/8/8 w - - 0 1',        task:'Setze Matt – Dame nach f8!',          title:'Matt-Mission',  answer:{from:'f7',to:'f8'}},
  {fen:'4k3/8/8/8/8/3p4/4P3/4K3 w - - 0 1',      task:'Schlage diagonal mit dem Bauern!',    title:'Schlag-Mission', answer:{from:'e2',to:'d3'}},
  {fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',task:'Spiele den besten ersten Zug – e4!',title:'Eröffnungs-Mission',answer:{from:'e2',to:'e4'}},
];

/* ═══════════════════════════════════════════════════════════
   ChessStory MODULE
═══════════════════════════════════════════════════════════ */
const ChessStory = (() => {
  /* ── state ── */
  let activeAct      = null;
  let activeChapter  = null;
  let activeDiff     = 'normal';
  let mmIdx          = 0;
  let mmTimerRef     = null;
  let mmDone         = false;
  let mmAttempts     = 3;
  let mmSelected     = null;
  let mmGS           = null;
  let dialogQueue    = [];
  let dialogIdx      = 0;
  let isTypingDialog = false;
  let currentActIdx  = 0;
  let bossGS         = null;
  let bossSelected   = null;
  let bossLegal      = [];
  let bossPlayerColor = WHITE;
  let bossAILevel    = 1;
  let bossGameOver   = false;
  let bossCaptures   = {white:0, black:0};
  let bossMoveCount  = 0;
  let chapterErrors  = 0;
  let hintTimerRef   = null;

  /* ── DOM helpers ── */
  const el   = id => document.getElementById(id);
  const hide = id => { const e = el(id); if (e) e.classList.add('hidden'); };
  const show = id => { const e = el(id); if (e) e.classList.remove('hidden'); };

  function setHtml(id, h) { const e = el(id); if (e) e.innerHTML = h; }
  function setText(id, t) { const e = el(id); if (e) e.textContent = t; }

  function activateView() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    el('view-chess-story')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="chess-story"]')?.classList.add('active');
    closeSidebar();
  }

  /* ── persistence ── */
  function ss()           { if (!CS.storyProgress) CS.storyProgress = {chapters:{}, acts:{}, diff:'normal'}; return CS.storyProgress; }
  function getRes(id)     { return ss().chapters[id] || null; }
  function saveRes(id, d) { ss().chapters[id] = d; saveChessState(); }
  function getActRes(id)  { return ss().acts?.[id] || null; }
  function saveActRes(id, d) { if (!ss().acts) ss().acts = {}; ss().acts[id] = d; saveChessState(); }

  /* ── unlock logic ── */
  function actUnlocked(act) {
    if (!act.unlockRequires) return true;
    const req = CHESS_STORY_ACTS.find(a => a.id === act.unlockRequires);
    return req ? !!getActRes(req.id)?.completed : false;
  }
  function chUnlocked(act, idx) {
    if (!actUnlocked(act)) return false;
    if (idx === 0) return true;
    return !!getRes(act.chapters[idx - 1].id)?.completed;
  }
  function bossUnlocked(act) {
    return actUnlocked(act) && act.chapters.every(c => !!getRes(c.id)?.completed);
  }
  function calcStars(score, diff) {
    if (score >= 90) return 3;
    if (score >= 70) return 2;
    return 1;
  }

  /* ══ WORLD MAP ══ */
  function showMap() {
    activateView();
    ['cs-difficulty','cs-intro','cs-minimission','cs-boss',
     'cs-result','cs-act-complete','cs-weakness'].forEach(hide);
    show('cs-map');
    renderMapProgress();
    renderActTabs();
    renderPath(currentActIdx);
    renderDailyWidget();
  }

  function renderMapProgress() {
    const wrap = el('cs-map-progress');
    if (!wrap) return;
    const total    = CHESS_STORY_ACTS.reduce((s, a) => s + a.chapters.length, 0);
    const done     = CHESS_STORY_ACTS.reduce((s, a) => s + a.chapters.filter(c => !!getRes(c.id)?.completed).length, 0);
    const stars    = CHESS_STORY_ACTS.reduce((s, a) => s + a.chapters.reduce((s2, c) => s2 + (getRes(c.id)?.stars || 0), 0), 0);
    const maxStars = total * 3;
    const pct      = total ? Math.round(done / total * 100) : 0;
    if (done === 0) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="cs-progress-row">
        <span class="cs-prog-lbl">Fortschritt: <b>${done}/${total} Kapitel</b></span>
        <span class="cs-prog-stars">⭐ ${stars} / ${maxStars}</span>
      </div>
      <div class="cs-prog-bar-wrap"><div class="cs-prog-bar-fill" style="width:${pct}%"></div></div>`;
  }

  function renderActTabs() {
    const wrap = el('cs-acts-tabs');
    if (!wrap) return;
    wrap.innerHTML = CHESS_STORY_ACTS.map((a, i) => {
      const done      = !!getActRes(a.id)?.completed;
      const locked    = !actUnlocked(a);
      const chDone    = a.chapters.filter(c => !!getRes(c.id)?.completed).length;
      const cls       = ['csact-tab', i === currentActIdx ? 'active' : '', locked ? 'locked-tab' : ''].join(' ');
      const progTxt   = locked ? '🔒' : `${chDone}/${a.chapters.length}`;
      return `<button class="${cls}" data-cs-act="${i}">
        ${a.icon} ${a.title}${done ? ' ✓' : ''}<span class="csact-prog">${progTxt}</span>
      </button>`;
    }).join('');
    wrap.querySelectorAll('[data-cs-act]').forEach(btn => {
      const idx = +btn.dataset.csAct;
      if (actUnlocked(CHESS_STORY_ACTS[idx])) {
        btn.addEventListener('click', () => { currentActIdx = idx; renderActTabs(); renderPath(idx); });
      }
    });
  }

  function renderPath(actIdx) {
    const act  = CHESS_STORY_ACTS[actIdx];
    const wrap = el('cs-world-path');
    if (!act || !wrap) return;

    let html = '<div class="cswp-inner">';
    act.chapters.forEach((ch, i) => {
      const res  = getRes(ch.id);
      const unl  = chUnlocked(act, i);
      const done = !!res?.completed;
      const next = unl && !done;
      const s    = res?.stars || 0;
      const cirCls  = ['cswp-circle', done?'done':'', next?'next':'', !unl?'locked':''].join(' ');
      const nodeCls = ['cswp-node',   done?'done':'', next?'next':'', !unl?'locked':''].join(' ');
      html += `<div class="${nodeCls}" data-cs-ch="${ch.id}" data-cs-act="${actIdx}">
        <div class="${cirCls}">${ch.icon}</div>
        <div class="cswp-stars">${done ? '⭐'.repeat(s)+'☆'.repeat(3-s) : '☆☆☆'}</div>
        <div class="cswp-label">${ch.title}</div>
      </div><div class="cswp-connector${done?' done':''}"></div>`;
    });
    const bUnl  = bossUnlocked(act);
    const bDone = !!getActRes(act.id)?.completed;
    const bNext = bUnl && !bDone;
    const bCls  = ['cswp-circle boss-node', bDone?'done':'', bNext?'next':'', !bUnl?'locked':''].join(' ');
    html += `<div class="cswp-node${bDone?' done':bNext?' next':''}${!bUnl?' locked':''}" data-cs-boss="${actIdx}">
      <div class="${bCls}">${act.boss.icon}</div>
      <div class="cswp-stars">${bDone?'👑':bUnl?'⚠️':'🔒'}</div>
      <div class="cswp-label">${act.boss.name}</div>
    </div></div>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-cs-ch]').forEach(node => {
      const id   = node.dataset.csCh;
      const ai   = +node.dataset.csAct;
      const a2   = CHESS_STORY_ACTS[ai];
      const ci   = a2.chapters.findIndex(c => c.id === id);
      if (chUnlocked(a2, ci)) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => openDiffSelect(a2, a2.chapters[ci]));
      }
    });
    wrap.querySelectorAll('[data-cs-boss]').forEach(node => {
      const ai = +node.dataset.csBoss;
      const a2 = CHESS_STORY_ACTS[ai];
      if (bossUnlocked(a2)) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => startBossIntro(a2));
      }
    });
  }

  /* ── Daily Widget ── */
  function renderDailyWidget() {
    const wrap = el('cs-daily-widget');
    if (!wrap) return;
    const today = new Date().toISOString().slice(0,10);
    const dc    = ss().daily;
    const done  = dc?.date === today && dc?.done;
    const dow   = new Date().getDay();
    const ch    = CHESS_DAILY_STORY[dow];
    wrap.innerHTML = `<div class="cs-daily-card" id="cs-daily-btn">
      <div style="font-weight:800;color:var(--green)">📋 ${ch.title}</div>
      <div style="font-size:.75rem;color:var(--text-3)">${ch.task}</div>
      ${done ? '<div style="color:var(--green);font-weight:700;font-size:.75rem">✅ Heute erledigt</div>'
              : '<div style="font-size:.75rem;color:var(--text-3)">Extra XP · Tägliche Aufgabe</div>'}
    </div>`;
    if (!done) el('cs-daily-btn')?.addEventListener('click', startDailyChallenge);
  }

  function startDailyChallenge() {
    const dow  = new Date().getDay();
    const ch   = CHESS_DAILY_STORY[dow];
    activeChapter = { id:'daily', mms:[{ id:'daily_mm', title:ch.title, task:ch.task,
      fen:ch.fen, type:'move', answer:ch.answer, hint:'Schau dir die Position genau an!', time:60,
      win:'Tagesaufgabe gelöst! +50 XP', lose:'Versuche es nochmal!' }] };
    mmIdx = 0;
    activeDiff = 'normal';
    runMinimission(ch.fen, {
      id:'daily_mm', title:ch.title, task:ch.task, type:'move', answer:ch.answer,
      hint:'Schau dir die Position genau an!', time:60,
      win:'Tagesaufgabe gelöst! Gut gemacht!', lose:'Fast! Versuche es nochmal.'
    }, () => {
      const today = new Date().toISOString().slice(0,10);
      ss().daily = { date:today, done:true };
      awardXP(50);
      checkAndUnlock('cs_daily_cs');
      saveChessState();
      showMap();
    });
  }

  /* ══ DIFFICULTY SELECT ══ */
  function openDiffSelect(act, chapter) {
    activeAct     = act;
    activeChapter = chapter;
    activateView();
    ['cs-map','cs-intro','cs-minimission','cs-boss',
     'cs-result','cs-act-complete','cs-weakness'].forEach(hide);
    show('cs-difficulty');

    const res = getRes(chapter.id);
    setHtml('cs-diff-header', `
      <span class="cs-chapter-icon">${chapter.icon}</span>
      <div>
        <div class="cs-chapter-sub">${chapter.num}</div>
        <div class="cs-chapter-name">${chapter.title}</div>
      </div>
      ${res?.completed ? `<span style="margin-left:auto;color:var(--green);font-size:.8rem">✅ ${res.stars}⭐</span>` : ''}
    `);

    setHtml('cs-diff-cards', [
      {key:'easy',  icon:'🐣', name:'Leicht',  color:'#69f0ae',
       req:chapter.diff.easy.desc,  xp:chapter.diff.easy.xp},
      {key:'normal',icon:'♟',  name:'Normal',  color:'var(--accent)',
       req:chapter.diff.normal.desc, xp:chapter.diff.normal.xp},
      {key:'hard',  icon:'♛',  name:'Meister', color:'#f59e0b',
       req:chapter.diff.hard.desc,  xp:chapter.diff.hard.xp},
    ].map(o => `<div class="cs-diff-card ${o.key}" data-diff="${o.key}">
      <span class="cs-diff-icon">${o.icon}</span>
      <div class="cs-diff-name" style="color:${o.color}">${o.name}</div>
      <div class="cs-diff-req">${o.req}</div>
      <div class="cs-diff-xp">+${o.xp} XP</div>
    </div>`).join(''));

    el('cs-btn-diff-back').onclick = showMap;
    el('cs-diff-cards').querySelectorAll('[data-diff]').forEach(card => {
      card.addEventListener('click', () => {
        activeDiff = card.dataset.diff;
        startChapterIntro();
      });
    });
  }

  /* ══ CHAPTER INTRO ══ */
  function startChapterIntro() {
    activateView();
    ['cs-difficulty','cs-minimission','cs-boss','cs-result',
     'cs-act-complete','cs-weakness','cs-map'].forEach(hide);
    show('cs-intro');

    const ch    = activeChapter;
    const dName = {easy:'🐣 Leicht', normal:'♟ Normal', hard:'♛ Meister'}[activeDiff];
    setHtml('cs-banner', `
      <span class="cs-chapter-icon">${ch.icon}</span>
      <div style="flex:1">
        <div class="cs-chapter-sub">${ch.num}</div>
        <div class="cs-chapter-name">${ch.title}</div>
      </div>
      <span class="cs-diff-badge">${dName}</span>
    `);
    setText('cs-narrative', ch.story);

    dialogQueue    = ch.intro;
    dialogIdx      = 0;
    isTypingDialog = false;
    el('cs-btn-next').onclick  = nextIntroDialog;
    el('cs-btn-skip').onclick  = startMiniMissions;
    showCsDialog(dialogQueue[0]);
  }

  function showCsDialog(msg) {
    if (!msg) return;
    setText('cs-dialog-speaker', `${msg.a} ${msg.n}`);
    const textEl = el('cs-dialog-text');
    if (!textEl) return;
    textEl.textContent = '';
    show('cs-dialog-dots');
    isTypingDialog = true;
    let i = 0;
    const iv = setInterval(() => {
      if (i < msg.t.length) { textEl.textContent += msg.t[i++]; }
      else { clearInterval(iv); hide('cs-dialog-dots'); isTypingDialog = false; }
    }, 22);
  }

  function nextIntroDialog() {
    if (isTypingDialog) {
      const msg = dialogQueue[dialogIdx];
      if (msg) { setText('cs-dialog-text', msg.t); hide('cs-dialog-dots'); isTypingDialog = false; }
      return;
    }
    dialogIdx++;
    if (dialogIdx < dialogQueue.length) showCsDialog(dialogQueue[dialogIdx]);
    else startMiniMissions();
  }

  /* ══ MINI MISSIONS ══ */
  function startMiniMissions() {
    mmIdx = 0;
    chapterErrors = 0;
    startNextMiniMission();
  }

  function startNextMiniMission() {
    const ch = activeChapter;
    if (mmIdx >= (ch.mms?.length || 0)) {
      const score = Math.max(10, 100 - chapterErrors * 15);
      onChapterComplete(true, score, chapterErrors);
      return;
    }
    const mm = ch.mms[mmIdx];
    runMinimission(mm.fen, mm, () => { mmIdx++; startNextMiniMission(); });
  }

  function runMinimission(fen, mm, onSuccess) {
    activateView();
    ['cs-intro','cs-difficulty','cs-boss','cs-result',
     'cs-act-complete','cs-weakness','cs-map'].forEach(hide);
    show('cs-minimission');

    const ch    = activeChapter;
    setHtml('cs-mm-header', ch
      ? `<strong>${ch.num}: ${ch.title}</strong> – Mini-Mission ${mmIdx + 1} / ${ch.mms?.length || 1}`
      : `<strong>Tägliche Aufgabe</strong>`);

    setText('cs-mm-task', mm.task);
    hide('cs-mm-feedback');
    setText('cs-mm-hint-box', '💡 ' + mm.hint);
    mmAttempts  = 3;
    mmDone      = false;
    mmSelected  = null;

    updateMmAttempts();
    clearInterval(mmTimerRef);

    let timeLeft = mm.time || 45;
    setText('cs-mm-timer', timeLeft);
    el('cs-mm-timer')?.classList.remove('urgent');

    mmTimerRef = setInterval(() => {
      if (mmDone) { clearInterval(mmTimerRef); return; }
      timeLeft--;
      setText('cs-mm-timer', timeLeft);
      if (timeLeft <= 10) el('cs-mm-timer')?.classList.add('urgent');
      if (timeLeft <= 0) { clearInterval(mmTimerRef); chapterErrors++; mmFail(mm, '⏱ Zeit abgelaufen!', onSuccess); }
    }, 1000);

    // Build board — size the board correctly via CSS variable
    mmGS = parseFen(mm.fen);
    const container = el('cs-mm-board');
    if (container) {
      container.innerHTML = '';
      const boardEl = buildBoardElement('cs-mm', (r, f) => handleMmClick(r, f, mm, onSuccess));
      const bSize = Math.min(280, window.innerWidth > 700 ? 280 : window.innerWidth - 180);
      boardEl.style.setProperty('--board-size', bSize + 'px');
      boardEl.querySelectorAll('.chess-board').forEach(b => { b.style.width = bSize+'px'; b.style.height = bSize+'px'; });
      boardEl.querySelectorAll('.chess-coords-left,.chess-coords-right').forEach(c => { c.style.height = bSize+'px'; });
      container.appendChild(boardEl);
      renderBoard('cs-mm', mmGS, null, [], null, undefined);
    }

    el('cs-mm-hint-btn').onclick = () => { show('cs-mm-hint-box'); clearTimeout(hintTimerRef); };
    hide('cs-mm-hint-box');
    clearTimeout(hintTimerRef);
    hintTimerRef = setTimeout(() => { if (!mmDone) show('cs-mm-hint-box'); }, 12000);
  }

  function updateMmAttempts() {
    setText('cs-mm-attempts', mmAttempts >= 3 ? '💚💚💚' : mmAttempts === 2 ? '💚💚🖤' : mmAttempts === 1 ? '💚🖤🖤' : '🖤🖤🖤');
  }

  function handleMmClick(r, f, mm, onSuccess) {
    if (mmDone) return;
    const alg = coordToAlgebraic(r, f);

    if (mm.type === 'click') {
      if (alg === mm.answer) mmSuccess(mm, onSuccess);
      else { mmAttempts--; chapterErrors++; updateMmAttempts(); showMmFeedback('wrong', '✗ ' + mm.lose); if (mmAttempts <= 0) mmFail(mm, 'Keine Versuche mehr. ' + mm.lose, onSuccess); }
      return;
    }

    if (mm.type === 'move') {
      const answerFrom = mm.answer?.from ? algebraicToCoord(mm.answer.from) : null;
      if (!mmSelected) {
        const piece = mmGS.board[r][f];
        const isPlayerPiece = mmGS.turn === WHITE ? piece > 0 : piece < 0;
        if (piece === EMPTY || !isPlayerPiece) return;
        // guide player: only allow selecting the correct starting piece
        if (answerFrom && (r !== answerFrom.r || f !== answerFrom.f)) {
          showMmFeedback('wrong', '💡 Klicke auf die richtige Figur: ' + mm.answer.from.toUpperCase());
          return;
        }
        mmSelected = {r, f};
        const legal = legalMovesFor(mmGS, r, f);
        renderBoard('cs-mm', mmGS, {r,f}, legal, null, undefined);
      } else {
        const fromAlg = coordToAlgebraic(mmSelected.r, mmSelected.f);
        if (fromAlg === mm.answer.from && alg === mm.answer.to) {
          mmGS = applyMove(mmGS, mmSelected.r, mmSelected.f, r, f);
          renderBoard('cs-mm', mmGS, null, [], {fromR:mmSelected.r,fromF:mmSelected.f,toR:r,toF:f}, undefined);
          mmSelected = null;
          mmSuccess(mm, onSuccess);
        } else {
          // Allow re-selecting the correct piece without penalty
          if (answerFrom && r === answerFrom.r && f === answerFrom.f) {
            mmSelected = {r, f};
            renderBoard('cs-mm', mmGS, {r,f}, legalMovesFor(mmGS,r,f), null, undefined);
            return;
          }
          // Wrong destination — deselect, show error
          mmSelected = null;
          mmAttempts--;
          chapterErrors++;
          updateMmAttempts();
          showMmFeedback('wrong', '✗ ' + mm.lose);
          renderBoard('cs-mm', mmGS, null, [], null, undefined);
          if (mmAttempts <= 0) mmFail(mm, 'Alle Versuche aufgebraucht!', onSuccess);
        }
      }
    }
  }

  function showMmFeedback(type, text) {
    const fb = el('cs-mm-feedback');
    if (!fb) return;
    fb.className   = 'cs-mm-feedback ' + type;
    fb.textContent = text;
    show('cs-mm-feedback');
    setTimeout(() => hide('cs-mm-feedback'), 2000);
  }

  function mmSuccess(mm, onSuccess) {
    mmDone = true;
    clearInterval(mmTimerRef);
    clearTimeout(hintTimerRef);
    showMmFeedback('correct', '✓ ' + mm.win);
    if (CS.settings.sound) SOUNDS.correct();
    setTimeout(onSuccess, 1200);
  }

  function mmFail(mm, msg, onSuccess) {
    mmDone = true;
    clearInterval(mmTimerRef);
    clearTimeout(hintTimerRef);
    if (CS.settings.sound) SOUNDS.wrong();

    const fb = el('cs-mm-feedback');
    if (fb) { fb.className = 'cs-mm-feedback wrong'; fb.textContent = '✗ ' + msg; show('cs-mm-feedback'); }

    // After 1.5s: show the correct solution on the board
    setTimeout(() => {
      const answer = mm.answer;
      if (answer && typeof answer === 'object' && answer.from) {
        const fc = algebraicToCoord(answer.from), tc = algebraicToCoord(answer.to);
        const solGS = applyMove(parseFen(mm.fen), fc.r, fc.f, tc.r, tc.f);
        renderBoard('cs-mm', solGS, null, [], {fromR:fc.r,fromF:fc.f,toR:tc.r,toF:tc.f}, undefined);
        if (fb) { fb.className = 'cs-mm-feedback correct'; fb.textContent = '💡 Lösung: ' + answer.from.toUpperCase() + '→' + answer.to.toUpperCase(); }
      }
      // After another 2s: reset and restart
      setTimeout(() => {
        hide('cs-mm-feedback');
        mmGS = parseFen(mm.fen);
        mmAttempts = 3;
        mmDone     = false;
        mmSelected = null;
        updateMmAttempts();
        renderBoard('cs-mm', mmGS, null, [], null, undefined);
        startTimerFor(mm, onSuccess);
      }, 2000);
    }, 1500);
  }

  function startTimerFor(mm, onSuccess) {
    let timeLeft = mm.time || 45;
    setText('cs-mm-timer', timeLeft);
    el('cs-mm-timer')?.classList.remove('urgent');
    clearInterval(mmTimerRef);
    mmTimerRef = setInterval(() => {
      if (mmDone) { clearInterval(mmTimerRef); return; }
      timeLeft--;
      setText('cs-mm-timer', timeLeft);
      if (timeLeft <= 10) el('cs-mm-timer')?.classList.add('urgent');
      if (timeLeft <= 0) { clearInterval(mmTimerRef); mmFail(mm, '⏱ Zeit abgelaufen!', onSuccess); }
    }, 1000);
  }

  /* ══ CHAPTER CHALLENGE ══ */
  function startChapterChallenge() {
    const ch      = activeChapter;
    const chal    = ch.challenge;
    const diffCfg = ch.diff[activeDiff];

    if (chal.type === 'lesson') {
      // Use existing lesson system, then return to story
      const lesson = ALL_CHESS_LESSONS.find(l => l.id === chal.lessonId);
      if (lesson) {
        startLesson(chal.lessonId);
        // Patch back button to go to story result
        const origBack = document.getElementById('btn-back-lesson');
        if (origBack) {
          const newBack = origBack.cloneNode(true);
          origBack.parentNode.replaceChild(newBack, origBack);
          newBack.addEventListener('click', (e) => { e.stopPropagation(); onChapterComplete(true, 80, 0); }, {once:true});
        }
      } else onChapterComplete(true, 80, 0);

    } else if (chal.type === 'puzzle') {
      // Use existing puzzle system
      const puz = [...PUZZLES].find(p => p.id === chal.puzzleId);
      if (puz) {
        const puzIdx = PUZZLES.findIndex(p => p.id === chal.puzzleId);
        showView('puzzles');
        loadPuzzle(puzIdx >= 0 ? puzIdx : 0);
      } else showView('puzzles');

    } else if (chal.type === 'endgame') {
      showView('endgames');
    } else {
      onChapterComplete(true, 80, 0);
    }
  }

  function onChapterComplete(passed, score, errors) {
    const ch      = activeChapter;
    const diffCfg = ch.diff[activeDiff];
    const s       = calcStars(score, activeDiff);
    const xpEarned = passed ? diffCfg.xp : Math.floor(diffCfg.xp * 0.3);

    if (passed) {
      const existing = getRes(ch.id);
      saveRes(ch.id, {
        completed: true,
        stars: Math.max(s, existing?.stars || 0),
        bestScore: Math.max(score, existing?.bestScore || 0),
      });
      awardXP(xpEarned);
      updateStreak();
      checkAndUnlock('cs_first');
      if (errors === 0) checkAndUnlock('cs_perfect');
      saveChessState();
    }

    showChapterResult(passed, score, errors, xpEarned, s);
  }

  /* ══ CHAPTER RESULT ══ */
  function showChapterResult(passed, score, errors, xpEarned, stars) {
    activateView();
    ['cs-map','cs-intro','cs-minimission','cs-boss',
     'cs-act-complete','cs-weakness'].forEach(hide);
    show('cs-result');

    const ch   = activeChapter;
    const msgs = passed ? ch.intro_success : ch.intro_fail;

    const starHtml = passed
      ? `<span class="cs-stars-animated">${'<span>⭐</span>'.repeat(stars)}${'<span style="opacity:.25">☆</span>'.repeat(3-stars)}</span>`
      : '—';

    setHtml('cs-result-dialog', `
      <div class="cs-result-header" style="${passed ? '' : 'background:rgba(239,68,68,.08);'}">
        <h3 style="color:${passed ? 'var(--green)' : '#ef4444'}">${passed ? '🎉 Kapitel abgeschlossen!' : '😅 Versuch es nochmal!'}</h3>
        <div style="font-size:1.5rem;margin:.3rem 0">${starHtml}</div>
        <div style="font-size:.78rem;color:var(--text-3)">${ch.num}: ${ch.title}</div>
      </div>
      <div class="cs-sresult-dialog">${msgs.map(m => `
        <div class="cs-sbubble">
          <span class="cs-sava">${m.a}</span>
          <div class="cs-smsg-wrap">
            <div class="cs-sspk">${m.n}</div>
            <div class="cs-smsg">${m.t}</div>
          </div>
        </div>`).join('')}</div>`);

    setHtml('cs-result-stats', `
      <div class="story-stat-pill"><span class="story-stat-val" style="color:var(--green)">+${xpEarned}</span><span class="story-stat-lbl">XP</span></div>
      <div class="story-stat-pill"><span class="story-stat-val">${Math.round(score)}%</span><span class="story-stat-lbl">Score</span></div>
      <div class="story-stat-pill"><span class="story-stat-val">${errors === 0 ? '✨' : errors}</span><span class="story-stat-lbl">Fehler</span></div>
      <div class="story-stat-pill"><span class="story-stat-val">${{easy:'🐣',normal:'♟',hard:'♛'}[activeDiff]}</span><span class="story-stat-lbl">Schwierigkeit</span></div>
    `);

    let actionsHtml = '';
    if (!passed) {
      actionsHtml = `<button class="btn-primary" id="cs-retry">↺ Nochmal</button>
                     <button class="btn-ghost"   id="cs-back-map">← Karte</button>`;
    } else {
      const actIdx = CHESS_STORY_ACTS.findIndex(a => a.chapters.some(c => c.id === ch.id));
      const act    = CHESS_STORY_ACTS[actIdx];
      const chIdx  = act.chapters.findIndex(c => c.id === ch.id);
      const allDone = act.chapters.every(c => !!getRes(c.id)?.completed);

      if (allDone) {
        actionsHtml = `<button class="btn-primary" id="cs-go-boss">⚔️ Boss-Kampf starten!</button>
                       <button class="btn-ghost"   id="cs-back-map">← Karte</button>`;
      } else {
        const next = act.chapters[chIdx + 1];
        actionsHtml = `${next ? `<button class="btn-primary" id="cs-next-ch">Nächstes Kapitel ▶</button>` : ''}
                       <button class="btn-ghost" id="cs-back-map">← Karte</button>`;
      }
    }
    setHtml('cs-result-actions', actionsHtml);

    el('cs-retry')?.addEventListener('click', () => openDiffSelect(activeAct, activeChapter));
    el('cs-back-map')?.addEventListener('click', showMap);
    el('cs-go-boss')?.addEventListener('click', () => {
      const aIdx = CHESS_STORY_ACTS.findIndex(a => a.chapters.some(c => c.id === activeChapter.id));
      startBossIntro(CHESS_STORY_ACTS[aIdx]);
    });
    el('cs-next-ch')?.addEventListener('click', () => {
      const aIdx = CHESS_STORY_ACTS.findIndex(a => a.chapters.some(c => c.id === activeChapter.id));
      const a    = CHESS_STORY_ACTS[aIdx];
      const ci   = a.chapters.findIndex(c => c.id === activeChapter.id);
      if (a.chapters[ci+1]) openDiffSelect(a, a.chapters[ci+1]);
      else showMap();
    });
  }

  /* ══ BOSS INTRO ══ */
  function startBossIntro(act) {
    activeAct = act;
    activateView();
    ['cs-map','cs-result','cs-weakness','cs-act-complete',
     'cs-minimission','cs-difficulty'].forEach(hide);
    show('cs-intro');

    const boss = act.boss;
    setHtml('cs-banner', `
      <span class="cs-chapter-icon">${boss.icon}</span>
      <div style="flex:1">
        <div class="cs-chapter-sub">Boss-Kampf · Akt ${CHESS_STORY_ACTS.indexOf(act)+1}</div>
        <div class="cs-chapter-name">${boss.name}</div>
      </div>
      <span class="cs-diff-badge" style="color:#f59e0b">⚠️ Boss!</span>
    `);
    setText('cs-narrative', boss.desc);

    dialogQueue    = boss.intro;
    dialogIdx      = 0;
    isTypingDialog = false;
    el('cs-btn-next').onclick  = nextBossDialog;
    el('cs-btn-skip').onclick  = () => launchBossGame(act);
    showCsDialog(dialogQueue[0]);
  }

  function nextBossDialog() {
    if (isTypingDialog) {
      const msg = dialogQueue[dialogIdx];
      if (msg) { setText('cs-dialog-text', msg.t); hide('cs-dialog-dots'); isTypingDialog = false; }
      return;
    }
    dialogIdx++;
    if (dialogIdx < dialogQueue.length) showCsDialog(dialogQueue[dialogIdx]);
    else launchBossGame(activeAct);
  }

  /* ══ BOSS BATTLE ══ */
  function launchBossGame(act) {
    activeAct        = act;
    const boss       = act.boss;
    bossGS           = parseFen(boss.startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    bossPlayerColor  = boss.playerColor !== undefined ? boss.playerColor : WHITE;
    bossAILevel      = boss.aiLevel || 1;
    bossGameOver     = false;
    bossSelected     = null;
    bossLegal        = [];
    bossCaptures     = {white:0, black:0};
    bossMoveCount    = 0;

    activateView();
    ['cs-map','cs-intro','cs-result','cs-weakness','cs-act-complete','cs-minimission'].forEach(hide);
    show('cs-boss');

    setText('cs-boss-name', boss.name);
    setText('cs-boss-rating', `KI Level ${bossAILevel}`);
    setText('cs-boss-avatar', boss.icon);
    setHtml('cs-boss-dialog', '');
    setHtml('cs-boss-moves', '');
    hide('cs-boss-flash');
    updateEvalBar(0);
    updateMaterialBar();
    setBossStatus('Du bist am Zug');

    const container = el('cs-boss-board');
    if (container) {
      container.innerHTML = '';
      const boardEl = buildBoardElement('cs-boss', handleBossClick);
      const bSize = Math.min(280, window.innerWidth > 700 ? 280 : window.innerWidth - 180);
      boardEl.style.setProperty('--board-size', bSize + 'px');
      boardEl.querySelectorAll('.chess-board').forEach(b => { b.style.width = bSize+'px'; b.style.height = bSize+'px'; });
      boardEl.querySelectorAll('.chess-coords-left,.chess-coords-right').forEach(c => { c.style.height = bSize+'px'; });
      container.appendChild(boardEl);
    }

    el('cs-boss-resign').onclick = () => {
      if (!bossGameOver) {
        bossGameOver = true;
        endBossGame(false, act);
      }
    };

    renderBossBoard();

    if (bossGS.turn !== bossPlayerColor) setTimeout(() => doBossAIMove(act), 600);
    else setBossStatus('Du bist am Zug – mach deinen Zug!');
  }

  function renderBossBoard() {
    const inCheck = isInCheck(bossGS, bossGS.turn) ? bossGS.turn : undefined;
    renderBoard('cs-boss', bossGS, bossSelected || null, bossLegal, null, inCheck);
  }

  function handleBossClick(r, f) {
    if (bossGameOver) return;
    if (bossGS.turn !== bossPlayerColor) return;

    const piece = bossGS.board[r][f];
    if (!bossSelected) {
      if (piece === EMPTY || (piece > 0) !== (bossPlayerColor > 0)) return;
      bossSelected = {r, f};
      bossLegal    = legalMovesFor(bossGS, r, f);
      renderBossBoard();
    } else {
      const isLegal = bossLegal.some(m => m.r === r && m.f === f);
      if (!isLegal) {
        if (piece !== EMPTY && (piece > 0) === (bossPlayerColor > 0)) {
          bossSelected = {r, f};
          bossLegal    = legalMovesFor(bossGS, r, f);
          renderBossBoard();
          return;
        }
        bossSelected = null; bossLegal = [];
        renderBossBoard(); return;
      }

      const captured = bossGS.board[r][f];
      if (captured !== EMPTY) { bossCaptures.white += PIECE_VALUES[Math.abs(captured)]; updateMaterialBar(); }

      const fromR  = bossSelected.r, fromF = bossSelected.f;
      const moveStr = getMoveNotation(bossGS, fromR, fromF, r, f);
      bossGS = applyMove(bossGS, fromR, fromF, r, f);
      bossSelected = null; bossLegal = [];

      if (CS.settings.sound) SOUNDS.move();
      renderBossBoard();
      addBossMove(moveStr, true);

      if (isCheckmate(bossGS)) { bossGameOver = true; endBossGame(true, activeAct); return; }
      if (isStalemate(bossGS)) { bossGameOver = true; endBossGame(false, activeAct, true); return; }

      updateEvalBar(estimateEval());
      const oppCheck = isInCheck(bossGS, bossGS.turn);
      setBossStatus(oppCheck ? '⚠️ KI steht im Schach!' : 'Gegner denkt...');
      showBossTaunt(activeAct.boss);
      setTimeout(() => doBossAIMove(activeAct), 600);
    }
  }

  function doBossAIMove(act) {
    if (bossGameOver) return;
    const mv = aiMove(bossGS, bossAILevel);
    if (!mv) { bossGameOver = true; endBossGame(true, act); return; }

    const captured  = bossGS.board[mv.r][mv.f];
    const moveStr   = getMoveNotation(bossGS, mv.fromR, mv.fromF, mv.r, mv.f);
    if (captured !== EMPTY) {
      bossCaptures.black += PIECE_VALUES[Math.abs(captured)];
      updateMaterialBar();
      if (CS.settings.sound) SOUNDS.capture();
      flashBossScreen();
    } else if (CS.settings.sound) SOUNDS.move();

    bossGS = applyMove(bossGS, mv.fromR, mv.fromF, mv.r, mv.f);
    bossSelected = null; bossLegal = [];
    renderBossBoard();
    addBossMove(moveStr, false);

    if (isCheckmate(bossGS)) { bossGameOver = true; endBossGame(false, act); return; }
    if (isStalemate(bossGS)) { bossGameOver = true; endBossGame(false, act, true); return; }

    updateEvalBar(estimateEval());
    const inCheck = isInCheck(bossGS, bossGS.turn);
    setBossStatus(inCheck ? '⚠️ Du stehst im Schach!' : 'Du bist am Zug!', inCheck);
  }

  function flashBossScreen() {
    const flash = el('cs-boss-flash');
    if (!flash) return;
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 400);
  }

  function estimateEval() {
    // Positive = player ahead, negative = boss ahead
    let score = 0;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = bossGS.board[r][f];
      if (p !== EMPTY) score += p > 0 ? PIECE_VALUES[Math.abs(p)] : -PIECE_VALUES[Math.abs(p)];
    }
    return bossPlayerColor === WHITE ? score : -score;
  }

  function updateEvalBar(evalScore) {
    const pct   = Math.min(90, Math.max(10, 50 + evalScore / 20));
    const white = el('cs-eval-white');
    if (white) white.style.width = pct + '%';
    const label = el('cs-eval-label');
    if (label) {
      if (evalScore > 150)      label.textContent = '✅ Du führst deutlich';
      else if (evalScore > 50)  label.textContent = '⬆ Kleiner Vorteil';
      else if (evalScore < -150)label.textContent = '⚠️ Gegner führt deutlich';
      else if (evalScore < -50) label.textContent = '⬇ Leichter Nachteil';
      else                      label.textContent = '⚖️ Ausgeglichen';
    }
  }

  function setBossStatus(txt, inCheck) {
    const el2 = el('cs-boss-status');
    if (!el2) return;
    el2.textContent = txt;
    el2.className   = 'cs-boss-status' + (inCheck ? ' in-check' : '');
  }

  function showBossTaunt(boss) {
    const taunts = boss.taunts || [];
    if (!taunts.length) return;
    const t = taunts[Math.floor(Math.random() * taunts.length)];
    setHtml('cs-boss-dialog', `<div class="cs-boss-bubble">
      <span class="cs-boss-bava">${boss.icon}</span>
      <div class="cs-boss-btxt">${t}</div>
    </div>`);
  }

  function getMoveNotation(gs, fromR, fromF, toR, toF) {
    const piece   = Math.abs(gs.board[fromR][fromF]);
    const syms    = ['','♟','♞','♝','♜','♛','♚'];
    const sym     = syms[piece] || '';
    const capture = gs.board[toR][toF] !== EMPTY ? '×' : '→';
    return `${sym}${coordToAlgebraic(fromR,fromF)}${capture}${coordToAlgebraic(toR,toF)}`;
  }

  function updateMaterialBar() {
    const bar  = el('cs-material-bar');
    if (!bar) return;
    const diff = bossCaptures.white - bossCaptures.black;
    if (diff > 0)       { bar.textContent = `♙ +${diff} Materialvorteil`;  bar.style.color = 'var(--green)'; }
    else if (diff < 0)  { bar.textContent = `♟ +${-diff} KI Materialvorteil`; bar.style.color = '#f59e0b'; }
    else                { bar.textContent = '⚖️ Ausgeglichen'; bar.style.color = 'var(--text-3)'; }
  }

  function addBossMove(txt, isPlayerMove) {
    const list = el('cs-boss-moves');
    if (!list) return;
    bossMoveCount++;
    const row = document.createElement('div');
    row.className = 'boss-move-row ' + (isPlayerMove ? 'player-move' : 'ai-move');
    const num = Math.ceil(bossMoveCount / 2);
    const prefix = bossMoveCount % 2 === 1 ? `${num}.` : '  ';
    row.textContent = `${prefix} ${txt}`;
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function endBossGame(won, act, stalemate = false) {
    const boss = act.boss;
    activateView();
    ['cs-map','cs-intro','cs-minimission','cs-weakness','cs-result','cs-boss'].forEach(hide);
    show('cs-act-complete');

    if (won) {
      if (CS.settings.sound) SOUNDS.levelUp?.() || SOUNDS.correct();
      awardXP(act.xpBonus);
      saveActRes(act.id, { completed:true, beatAt: new Date().toISOString().slice(0,10) });
      updateStreak();
      checkAndUnlock(boss.achievementId);
      const aIdx = CHESS_STORY_ACTS.indexOf(act);
      if (aIdx === 0) checkAndUnlock('cs_act1');
      if (aIdx === 1) checkAndUnlock('cs_act2');
      if (aIdx === 2) checkAndUnlock('cs_act3');
      if (bossCaptures.black === 0) checkAndUnlock('cs_nodmg');
      saveChessState();

      setText('cs-act-icon', boss.icon);
      setText('cs-act-title', `${act.title} – Abgeschlossen!`);
      setHtml('cs-act-sub', boss.victory.map(m => `<b>${m.n}:</b> ${m.t}`).join('<br>'));
      setText('cs-act-xp', `🎉 +${act.xpBonus} XP`);

      const nextAct = CHESS_STORY_ACTS[CHESS_STORY_ACTS.indexOf(act) + 1];
      setHtml('cs-act-actions', `
        ${nextAct ? `<button class="btn-primary" id="cs-next-act">▶ Nächster Akt: ${nextAct.title}</button>` : `<span class="btn-primary" style="cursor:default">🏆 Schach-Akademie abgeschlossen!</span>`}
        <button class="btn-ghost" id="cs-act-map">← Zurück zur Karte</button>
      `);
      el('cs-next-act')?.addEventListener('click', () => { currentActIdx = CHESS_STORY_ACTS.indexOf(act)+1; showMap(); });
      el('cs-act-map')?.addEventListener('click', showMap);
    } else {
      setText('cs-act-icon', stalemate ? '🤝' : '💥');
      setText('cs-act-title', stalemate ? 'Patt – Remis!' : 'Niederlage!');
      setText('cs-act-sub', stalemate ? 'Patt – kein Gewinner. Versuche es nochmal!' : (boss.defeat[0]?.t || 'Der Gegner war stärker.'));
      setText('cs-act-xp', '');
      setHtml('cs-act-actions', `
        <button class="btn-primary" id="cs-retry-boss">↺ Boss nochmal</button>
        <button class="btn-ghost"   id="cs-act-map2">← Karte</button>
      `);
      el('cs-retry-boss')?.addEventListener('click', () => startBossIntro(act));
      el('cs-act-map2')?.addEventListener('click', showMap);
    }
  }

  /* ── Hook into showView for chess-story ── */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (btn?.dataset.view === 'chess-story') {
      e.stopImmediatePropagation();
      showMap();
    }
  }, true);

  /* ── Hook lesson/puzzle completion back to story ── */
  /* Called from btn-back-lesson; also watch for puzzle solve */

  return { showMap, onChapterComplete };
})();
