/**
 * chess-engine.js  —  Pure chess engine.
 * No DOM, no Firebase, no global app state.
 * Imported by chess.js.
 */

'use strict';

/* ── Piece types & colours ── */
export const EMPTY  = 0;
export const PAWN   = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const WHITE  = 1, BLACK  = -1;

export const PIECE_UNICODE = {
  [WHITE]:  ['', '♙', '♘', '♗', '♖', '♕', '♔'],
  [BLACK]:  ['', '♟', '♞', '♝', '♜', '♛', '♚'],
};

/* ── Board utilities ── */
export function emptyBoard() {
  return Array.from({length:8}, () => Array(8).fill(EMPTY));
}

export function cloneBoard(board) {
  return board.map(row => [...row]);
}

export function cloneGameState(gs) {
  return {
    board:     cloneBoard(gs.board),
    turn:      gs.turn,
    castling:  { ...gs.castling },
    enPassant: gs.enPassant ? { ...gs.enPassant } : null,
    halfMove:  gs.halfMove,
    fullMove:  gs.fullMove,
  };
}

/* ── FEN ── */
export function parseFen(fen) {
  const state = {
    board:     emptyBoard(),
    turn:      WHITE,
    castling:  { wK:false, wQ:false, bK:false, bQ:false },
    enPassant: null,
    halfMove: 0, fullMove: 1,
  };
  if (fen === 'empty') return state;

  const parts    = fen.split(' ');
  const rows     = parts[0].split('/');
  const pieceMap = { p:PAWN, n:KNIGHT, b:BISHOP, r:ROOK, q:QUEEN, k:KING };

  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      const lower = ch.toLowerCase();
      const color = ch === lower ? BLACK : WHITE;
      state.board[r][f] = color * pieceMap[lower];
      f++;
    }
  }
  state.turn = (parts[1] || 'w') === 'w' ? WHITE : BLACK;

  const cas = parts[2] || '-';
  state.castling.wK = cas.includes('K');
  state.castling.wQ = cas.includes('Q');
  state.castling.bK = cas.includes('k');
  state.castling.bQ = cas.includes('q');

  if (parts[3] && parts[3] !== '-') {
    state.enPassant = {
      r: 8 - parseInt(parts[3][1]),
      f: parts[3].charCodeAt(0) - 97,
    };
  }
  return state;
}

export function algebraicToCoord(sq) {
  return { f: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1]) };
}

export function coordToAlgebraic(r, f) {
  return String.fromCharCode(97 + f) + (8 - r);
}

export function boardToFen(gs) {
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = gs.board[r][f];
      if (p === EMPTY) { empty++; continue; }
      if (empty) { fen += empty; empty = 0; }
      const letters = ['','p','n','b','r','q','k'];
      const ch = letters[Math.abs(p)];
      fen += p > 0 ? ch.toUpperCase() : ch;
    }
    if (empty) fen += empty;
    if (r < 7) fen += '/';
  }
  const turn     = gs.turn === WHITE ? 'w' : 'b';
  const castling = gs.castling || '-';
  const ep       = gs.enPassant ? coordToAlgebraic(gs.enPassant.r, gs.enPassant.f) : '-';
  return `${fen} ${turn} ${castling} ${ep} ${gs.halfMove || 0} ${gs.fullMove || 1}`;
}

export function buildMoveLabel(gs, fromR, fromF, toR, toF, promoType) {
  const piece   = Math.abs(gs.board[fromR][fromF]);
  const letters = ['','','N','B','R','Q','K'];
  const prefix  = piece === PAWN ? '' : letters[piece];
  const capture = gs.board[toR][toF] !== EMPTY ? 'x' : '';
  const dest    = coordToAlgebraic(toR, toF);
  const promo   = piece === PAWN && (toR === 0 || toR === 7) ? '=' + letters[promoType] : '';
  return prefix + capture + dest + promo;
}

/* ── Move generation ── */
export function pseudoLegalMoves(gs, r, f) {
  const piece = gs.board[r][f];
  if (!piece) return [];
  const color = piece > 0 ? WHITE : BLACK;
  const type  = Math.abs(piece);
  const moves = [];

  const add = (tr, tf) => {
    if (tr < 0 || tr > 7 || tf < 0 || tf > 7) return false;
    const target = gs.board[tr][tf];
    if (target === EMPTY) { moves.push({r:tr,f:tf}); return true; }
    if ((target > 0) !== (color > 0)) { moves.push({r:tr,f:tf}); return false; }
    return false;
  };

  const slide = (dr, df) => {
    let tr = r + dr, tf = f + df;
    while (tr >= 0 && tr <= 7 && tf >= 0 && tf <= 7) {
      const target = gs.board[tr][tf];
      if (target === EMPTY) { moves.push({r:tr,f:tf}); tr+=dr; tf+=df; continue; }
      if ((target > 0) !== (color > 0)) moves.push({r:tr,f:tf});
      break;
    }
  };

  if (type === PAWN) {
    const dir       = color === WHITE ? -1 : 1;
    const startRank = color === WHITE ? 6 : 1;
    if (r+dir >= 0 && r+dir <= 7 && gs.board[r+dir][f] === EMPTY) {
      moves.push({r:r+dir,f});
      if (r === startRank && gs.board[r+dir*2][f] === EMPTY) moves.push({r:r+dir*2,f});
    }
    for (const df of [-1,1]) {
      const tf = f+df, tr = r+dir;
      if (tf < 0 || tf > 7 || tr < 0 || tr > 7) continue;
      const target = gs.board[tr][tf];
      if (target !== EMPTY && (target > 0) !== (color > 0)) moves.push({r:tr,f:tf});
      if (gs.enPassant && gs.enPassant.r === tr && gs.enPassant.f === tf) moves.push({r:tr,f:tf,ep:true});
    }
  } else if (type === KNIGHT) {
    for (const [dr,df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r+dr,f+df);
  } else if (type === BISHOP) {
    for (const [dr,df] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr,df);
  } else if (type === ROOK) {
    for (const [dr,df] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr,df);
  } else if (type === QUEEN) {
    for (const [dr,df] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) slide(dr,df);
  } else if (type === KING) {
    for (const [dr,df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(r+dr,f+df);
    if (color === WHITE && r === 7) {
      if (gs.castling.wK && gs.board[7][5]===EMPTY && gs.board[7][6]===EMPTY
          && !isSquareAttacked(gs,7,4,BLACK) && !isSquareAttacked(gs,7,5,BLACK) && !isSquareAttacked(gs,7,6,BLACK))
        moves.push({r:7,f:6,castle:'wK'});
      if (gs.castling.wQ && gs.board[7][3]===EMPTY && gs.board[7][2]===EMPTY && gs.board[7][1]===EMPTY
          && !isSquareAttacked(gs,7,4,BLACK) && !isSquareAttacked(gs,7,3,BLACK) && !isSquareAttacked(gs,7,2,BLACK))
        moves.push({r:7,f:2,castle:'wQ'});
    }
    if (color === BLACK && r === 0) {
      if (gs.castling.bK && gs.board[0][5]===EMPTY && gs.board[0][6]===EMPTY
          && !isSquareAttacked(gs,0,4,WHITE) && !isSquareAttacked(gs,0,5,WHITE) && !isSquareAttacked(gs,0,6,WHITE))
        moves.push({r:0,f:6,castle:'bK'});
      if (gs.castling.bQ && gs.board[0][3]===EMPTY && gs.board[0][2]===EMPTY && gs.board[0][1]===EMPTY
          && !isSquareAttacked(gs,0,4,WHITE) && !isSquareAttacked(gs,0,3,WHITE) && !isSquareAttacked(gs,0,2,WHITE))
        moves.push({r:0,f:2,castle:'bQ'});
    }
  }
  return moves;
}

export function isSquareAttacked(gs, r, f, byColor) {
  const board = gs.board;

  const pawnDir = byColor === WHITE ? 1 : -1;
  for (const df of [-1,1]) {
    const pr = r+pawnDir, pf = f+df;
    if (pr>=0&&pr<=7&&pf>=0&&pf<=7) {
      const p = board[pr][pf];
      if (p!==EMPTY && (p>0)===(byColor>0) && Math.abs(p)===PAWN) return true;
    }
  }
  for (const [dr,df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr=r+dr, nf=f+df;
    if (nr>=0&&nr<=7&&nf>=0&&nf<=7) {
      const p=board[nr][nf];
      if (p!==EMPTY&&(p>0)===(byColor>0)&&Math.abs(p)===KNIGHT) return true;
    }
  }
  for (const [dr,df] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let tr=r+dr,tf=f+df;
    while(tr>=0&&tr<=7&&tf>=0&&tf<=7){
      const p=board[tr][tf];
      if(p!==EMPTY){if((p>0)===(byColor>0)&&(Math.abs(p)===BISHOP||Math.abs(p)===QUEEN))return true;break;}
      tr+=dr;tf+=df;
    }
  }
  for (const [dr,df] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let tr=r+dr,tf=f+df;
    while(tr>=0&&tr<=7&&tf>=0&&tf<=7){
      const p=board[tr][tf];
      if(p!==EMPTY){if((p>0)===(byColor>0)&&(Math.abs(p)===ROOK||Math.abs(p)===QUEEN))return true;break;}
      tr+=dr;tf+=df;
    }
  }
  for (const [dr,df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const kr=r+dr,kf=f+df;
    if(kr>=0&&kr<=7&&kf>=0&&kf<=7){
      const p=board[kr][kf];
      if(p!==EMPTY&&(p>0)===(byColor>0)&&Math.abs(p)===KING) return true;
    }
  }
  return false;
}

export function findKing(gs, color) {
  const king = color * KING;
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) if (gs.board[r][f]===king) return {r,f};
  return null;
}

export function isInCheck(gs, color) {
  const kPos = findKing(gs, color);
  if (!kPos) return false;
  return isSquareAttacked(gs, kPos.r, kPos.f, -color);
}

export function applyMove(gs, fromR, fromF, toR, toF, promoType=QUEEN) {
  const next  = cloneGameState(gs);
  const piece = next.board[fromR][fromF];
  const type  = Math.abs(piece);
  const color = piece > 0 ? WHITE : BLACK;

  next.board[toR][toF]     = piece;
  next.board[fromR][fromF] = EMPTY;

  if (type === PAWN && gs.enPassant && toR === gs.enPassant.r && toF === gs.enPassant.f)
    next.board[fromR][toF] = EMPTY;

  if (type === PAWN && (toR === 0 || toR === 7))
    next.board[toR][toF] = color * promoType;

  next.enPassant = null;
  if (type === PAWN && Math.abs(toR - fromR) === 2)
    next.enPassant = { r: (fromR + toR) / 2, f: fromF };

  if (type === KING) {
    if (fromF === 4 && toF === 6) { next.board[fromR][5] = next.board[fromR][7]; next.board[fromR][7] = EMPTY; }
    if (fromF === 4 && toF === 2) { next.board[fromR][3] = next.board[fromR][0]; next.board[fromR][0] = EMPTY; }
    if (color === WHITE) { next.castling.wK = false; next.castling.wQ = false; }
    else                 { next.castling.bK = false; next.castling.bQ = false; }
  }
  if (type === ROOK) {
    if (fromR===7&&fromF===7) next.castling.wK = false;
    if (fromR===7&&fromF===0) next.castling.wQ = false;
    if (fromR===0&&fromF===7) next.castling.bK = false;
    if (fromR===0&&fromF===0) next.castling.bQ = false;
  }
  if (gs.board[toR][toF] !== EMPTY) {
    if (toR===7&&toF===7) next.castling.wK = false;
    if (toR===7&&toF===0) next.castling.wQ = false;
    if (toR===0&&toF===7) next.castling.bK = false;
    if (toR===0&&toF===0) next.castling.bQ = false;
  }

  next.turn = -color;
  if (color === BLACK) next.fullMove++;
  return next;
}

export function legalMovesFor(gs, r, f) {
  const piece = gs.board[r][f];
  if (!piece) return [];
  const color = piece > 0 ? WHITE : BLACK;
  return pseudoLegalMoves(gs, r, f).filter(mv => !isInCheck(applyMove(gs, r, f, mv.r, mv.f), color));
}

export function allLegalMoves(gs) {
  const moves = [];
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p = gs.board[r][f];
    if (p !== EMPTY && (p>0) === (gs.turn>0))
      legalMovesFor(gs, r, f).forEach(mv => moves.push({fromR:r,fromF:f,...mv}));
  }
  return moves;
}

export function isCheckmate(gs) {
  return isInCheck(gs, gs.turn) && allLegalMoves(gs).length === 0;
}

export function isStalemate(gs) {
  return !isInCheck(gs, gs.turn) && allLegalMoves(gs).length === 0;
}

/* ── Evaluation & AI ── */
export const PIECE_VALUES = [0, 100, 320, 330, 500, 900, 20000];

export function evaluateBoard(gs) {
  let score = 0;
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p = gs.board[r][f];
    if (p !== EMPTY) score += p > 0 ? PIECE_VALUES[Math.abs(p)] : -PIECE_VALUES[Math.abs(p)];
  }
  return score;
}

export function aiMove(gs, level) {
  const moves = allLegalMoves(gs);
  if (!moves.length) return null;

  if (level === 1) return moves[Math.floor(Math.random() * moves.length)];

  if (level === 2) {
    const captures = moves.filter(m => gs.board[m.r][m.f] !== EMPTY);
    if (captures.length) return captures[Math.floor(Math.random() * captures.length)];
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let best = null, bestScore = gs.turn === BLACK ? Infinity : -Infinity;
  for (const mv of moves) {
    const next = applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f);
    let score = evaluateBoard(next);
    const replies = allLegalMoves(next);
    if (replies.length) {
      for (const rm of replies) {
        const s = evaluateBoard(applyMove(next, rm.fromR, rm.fromF, rm.r, rm.f));
        if (gs.turn === BLACK) score = Math.min(score, s);
        else score = Math.max(score, s);
      }
    }
    if (gs.turn === BLACK && score < bestScore) { bestScore = score; best = mv; }
    if (gs.turn === WHITE && score > bestScore) { bestScore = score; best = mv; }
  }
  return best || moves[0];
}

/* ── Alpha-Beta Minimax (used by analysis mode) ── */
export function minimaxAB(gs, depth, alpha, beta) {
  if (depth === 0) return evaluateBoard(gs);
  const moves = allLegalMoves(gs);
  if (!moves.length) {
    if (isInCheck(gs, gs.turn)) return gs.turn === WHITE ? -19000 : 19000;
    return 0;
  }
  if (gs.turn === WHITE) {
    let best = -Infinity;
    for (const mv of moves) {
      const s = minimaxAB(applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f), depth-1, alpha, beta);
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const s = minimaxAB(applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f), depth-1, alpha, beta);
      if (s < best) best = s;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

export function getBestMoveAndEval(gs, depth) {
  const moves = allLegalMoves(gs);
  if (!moves.length) return null;
  let bestMove = null;
  let bestEval = gs.turn === WHITE ? -Infinity : Infinity;
  for (const mv of moves) {
    const score = minimaxAB(applyMove(gs, mv.fromR, mv.fromF, mv.r, mv.f), depth-1, -Infinity, Infinity);
    if (gs.turn === WHITE ? score > bestEval : score < bestEval) {
      bestEval = score;
      bestMove = mv;
    }
  }
  return { move: bestMove, eval: bestEval };
}
