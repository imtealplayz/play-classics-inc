const { Chess } = require('chess.js');

const CATALOG = {
  tictactoe: { name: 'Tic-Tac-Toe', players: 2 },
  chess: { name: 'Chess', players: 2 },
  rps: { name: 'Rock Paper Scissors', players: 2 },
  connect4: { name: 'Connect Four', players: 2 },
  battleship: { name: 'Battleship', players: 2 },
  checkers: { name: 'Checkers', players: 2 },
  reversi: { name: 'Reversi', players: 2 },
  dots: { name: 'Dots and Boxes', players: 2 },
  gomoku: { name: 'Gomoku', players: 2 },
};

const other = (room, id) => room.players.find((player) => player.id !== id)?.id;
const playerIndex = (room, id) => room.players.findIndex((player) => player.id === id);
const finish = (room, winner, message) => {
  room.status = 'finished';
  room.state.winner = winner || null;
  room.state.result = message;
};
const sizeArray = (n, value = null) => Array.from({ length: n }, () => value);

function randomFleet() {
  const boardSize = 10;
  const lengths = [5, 4, 3, 3, 2];
  const occupied = new Set();
  const ships = [];
  for (const length of lengths) {
    let placed = false;
    for (let tries = 0; tries < 500 && !placed; tries += 1) {
      const horizontal = Math.random() > 0.5;
      const row = Math.floor(Math.random() * boardSize);
      const col = Math.floor(Math.random() * boardSize);
      if (horizontal ? col + length > boardSize : row + length > boardSize) continue;
      const cells = Array.from({ length }, (_, i) => [row + (horizontal ? 0 : i), col + (horizontal ? i : 0)]);
      if (cells.some(([r, c]) => occupied.has(`${r},${c}`))) continue;
      cells.forEach(([r, c]) => occupied.add(`${r},${c}`));
      ships.push(cells.map(([r, c]) => r * 10 + c));
      placed = true;
    }
    if (!placed) throw new Error('Could not generate a Battleship fleet.');
  }
  return ships.flat();
}

function initialState(game, players) {
  const first = players[0].id;
  const second = players[1]?.id || null;
  const state = { turn: first, winner: null, result: null };
  switch (game) {
    case 'tictactoe': state.board = sizeArray(9); break;
    case 'chess': state.fen = new Chess().fen(); state.history = []; break;
    case 'rps': state.round = 1; state.scores = [0, 0]; state.picks = [null, null]; state.next = []; state.roundResult = null; break;
    case 'connect4': state.board = sizeArray(42); break;
    case 'battleship': state.fleets = [randomFleet(), randomFleet()]; state.shots = [[], []]; state.turn = first; break;
    case 'checkers': {
      state.board = sizeArray(64);
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 8; c += 1) if ((r + c) % 2 === 1) state.board[r * 8 + c] = 'd';
      for (let r = 5; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if ((r + c) % 2 === 1) state.board[r * 8 + c] = 'l';
      state.forcedFrom = null;
      break;
    }
    case 'reversi': {
      state.board = sizeArray(64);
      state.board[27] = 'd'; state.board[28] = 'l'; state.board[35] = 'l'; state.board[36] = 'd';
      state.counts = [2, 2];
      break;
    }
    case 'dots': state.h = sizeArray(20, false); state.v = sizeArray(20, false); state.boxes = sizeArray(16); state.scores = [0, 0]; break;
    case 'gomoku': state.board = sizeArray(225); break;
    default: throw new Error('Unknown game.');
  }
  if (!second && game === 'rps') state.turn = first;
  return state;
}

function lineWin(board, rows, cols, length, mark) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (board[r * cols + c] !== mark) continue;
    for (const [dr, dc] of directions) {
      const er = r + (length - 1) * dr; const ec = c + (length - 1) * dc;
      if (er < 0 || er >= rows || ec < 0 || ec >= cols) continue;
      let match = true;
      for (let k = 1; k < length; k += 1) if (board[(r + dr * k) * cols + c + dc * k] !== mark) { match = false; break; }
      if (match) return true;
    }
  }
  return false;
}

function checkersMoves(board, from, side) {
  const piece = board[from];
  if (!piece || (side === 0 && !piece.toLowerCase().includes('l')) || (side === 1 && !piece.toLowerCase().includes('d'))) return [];
  const r = Math.floor(from / 8); const c = from % 8;
  const king = piece === piece.toUpperCase();
  const dirs = king ? [-1, 1] : [side === 0 ? -1 : 1];
  const moves = [];
  for (const dr of dirs) for (const dc of [-1, 1]) {
    const r1 = r + dr; const c1 = c + dc;
    if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
    const to = r1 * 8 + c1;
    if (!board[to]) moves.push({ from, to, capture: null });
    else if ((side === 0 && board[to].toLowerCase() === 'd') || (side === 1 && board[to].toLowerCase() === 'l')) {
      const r2 = r + dr * 2; const c2 = c + dc * 2;
      if (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && !board[r2 * 8 + c2]) moves.push({ from, to: r2 * 8 + c2, capture: to });
    }
  }
  return moves;
}

function reversiFlips(board, at, side) {
  if (board[at] !== null) return [];
  const row = Math.floor(at / 8); const col = at % 8; const flips = [];
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    let r = row + dr; let c = col + dc; const line = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const value = board[r * 8 + c];
      if (value === null) break;
      if (value === side) { if (line.length) flips.push(...line); break; }
      line.push(r * 8 + c); r += dr; c += dc;
    }
  }
  return flips;
}

function boxEdges(box) {
  const r = Math.floor(box / 4); const c = box % 4;
  return [`h:${r * 5 + c}`, `h:${(r + 1) * 5 + c}`, `v:${r * 5 + c}`, `v:${r * 5 + c + 1}`];
}

function applyMove(room, userId, move) {
  if (room.status !== 'active' || room.players.length !== 2) throw new Error('This room is not ready to play.');
  const state = room.state;
  const index = playerIndex(room, userId);
  if (index < 0) throw new Error('You are not a player in this room.');
  if (!move || typeof move !== 'object') throw new Error('Invalid move.');
  const id = room.players[index].id;
  const opponent = room.players[1 - index].id;
  const requireTurn = () => { if (state.turn !== id) throw new Error('It is not your turn.'); };
  const switchTurn = () => { state.turn = opponent; };
  const validIndex = (value, max) => Number.isInteger(value) && value >= 0 && value < max;

  switch (room.game) {
    case 'tictactoe': {
      requireTurn(); if (!validIndex(move.at, 9) || state.board[move.at] !== null) throw new Error('That square is not available.');
      state.board[move.at] = index === 0 ? 'x' : 'o';
      if (lineWin(state.board, 3, 3, 3, state.board[move.at])) finish(room, id, `${room.players[index].username} wins.`);
      else if (state.board.every(Boolean)) finish(room, null, 'Draw game.'); else switchTurn();
      break;
    }
    case 'connect4': {
      requireTurn(); if (!validIndex(move.col, 7)) throw new Error('Choose a valid column.');
      let row = -1; for (let r = 5; r >= 0; r -= 1) if (!state.board[r * 7 + move.col]) { row = r; break; }
      if (row < 0) throw new Error('That column is full.');
      state.board[row * 7 + move.col] = index === 0 ? 'x' : 'o';
      if (lineWin(state.board, 6, 7, 4, state.board[row * 7 + move.col])) finish(room, id, `${room.players[index].username} connects four.`);
      else if (state.board.every(Boolean)) finish(room, null, 'Draw game.'); else switchTurn();
      break;
    }
    case 'gomoku': {
      requireTurn(); if (!validIndex(move.at, 225) || state.board[move.at] !== null) throw new Error('That intersection is not available.');
      state.board[move.at] = index === 0 ? 'x' : 'o';
      if (lineWin(state.board, 15, 15, 5, state.board[move.at])) finish(room, id, `${room.players[index].username} gets five in a row.`);
      else if (state.board.every(Boolean)) finish(room, null, 'Draw game.'); else switchTurn();
      break;
    }
    case 'chess': {
      requireTurn();
      const chess = new Chess(state.fen);
      let played;
      try { played = chess.move({ from: String(move.from), to: String(move.to), ...(move.promotion ? { promotion: String(move.promotion) } : {}) }); }
      catch { played = null; }
      if (!played) throw new Error('Illegal chess move.');
      state.fen = chess.fen(); state.history.push(played.san);
      if (chess.isCheckmate()) finish(room, id, `${room.players[index].username} wins by checkmate.`);
      else if (chess.isDraw()) finish(room, null, 'Draw game.'); else switchTurn();
      break;
    }
    case 'rps': {
      if (!['rock', 'paper', 'scissors'].includes(move.choice)) throw new Error('Choose rock, paper, or scissors.');
      if (state.roundResult) throw new Error('Both players have finished this round.');
      if (state.picks[index]) throw new Error('You have already locked in your choice.');
      state.picks[index] = move.choice;
      if (state.picks[0] && state.picks[1]) {
        const [a, b] = state.picks;
        const winnerIndex = a === b ? -1 : ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper') ? 0 : 1);
        if (winnerIndex >= 0) state.scores[winnerIndex] += 1;
        state.roundResult = { winnerIndex, text: winnerIndex < 0 ? 'A perfect tie.' : `${room.players[winnerIndex].username} takes the round.`, picks: state.picks.slice() };
      }
      break;
    }
    case 'battleship': {
      requireTurn(); if (!validIndex(move.at, 100)) throw new Error('Choose a square on the grid.');
      if (state.shots[index].some((shot) => shot.at === move.at)) throw new Error('You have already fired at that square.');
      const hit = state.fleets[1 - index].includes(move.at);
      state.shots[index].push({ at: move.at, hit });
      const hits = state.shots[index].filter((shot) => shot.hit).length;
      if (hits >= 17) finish(room, id, `${room.players[index].username} sinks the fleet.`); else switchTurn();
      break;
    }
    case 'checkers': {
      requireTurn();
      if (!validIndex(move.from, 64) || !validIndex(move.to, 64)) throw new Error('Choose valid squares.');
      if (state.forcedFrom !== null && move.from !== state.forcedFrom) throw new Error('Continue the capture with the same piece.');
      const available = checkersMoves(state.board, move.from, index);
      const captureExists = state.board.some((piece, from) => piece && ((index === 0 && piece.toLowerCase() === 'l') || (index === 1 && piece.toLowerCase() === 'd')) && checkersMoves(state.board, from, index).some((option) => option.capture !== null));
      const selected = available.find((option) => option.to === move.to && (!captureExists || option.capture !== null));
      if (!selected) throw new Error(captureExists ? 'A capture is required.' : 'Illegal checkers move.');
      const piece = state.board[move.from]; state.board[move.from] = null; state.board[move.to] = piece;
      if (selected.capture !== null) state.board[selected.capture] = null;
      if (index === 0 && Math.floor(move.to / 8) === 0 && piece === 'l') state.board[move.to] = 'L';
      if (index === 1 && Math.floor(move.to / 8) === 7 && piece === 'd') state.board[move.to] = 'D';
      if (selected.capture !== null && checkersMoves(state.board, move.to, index).some((option) => option.capture !== null)) state.forcedFrom = move.to;
      else { state.forcedFrom = null; switchTurn(); }
      const enemyPieces = state.board.filter((item) => item && item.toLowerCase() === (index === 0 ? 'd' : 'l')).length;
      const enemyMoves = state.board.some((item, from) => item && item.toLowerCase() === (index === 0 ? 'd' : 'l') && checkersMoves(state.board, from, 1 - index).length);
      if (enemyPieces === 0 || !enemyMoves) finish(room, id, `${room.players[index].username} wins.`);
      break;
    }
    case 'reversi': {
      requireTurn(); if (!validIndex(move.at, 64)) throw new Error('Choose a square on the board.');
      const mark = index === 0 ? 'l' : 'd'; const flips = reversiFlips(state.board, move.at, mark);
      if (!flips.length) throw new Error('That is not a legal Reversi move.');
      state.board[move.at] = mark; flips.forEach((at) => { state.board[at] = mark; });
      const count = (m) => state.board.filter((cell) => cell === m).length;
      state.counts = [count('l'), count('d')];
      const hasNext = state.board.some((cell, at) => cell === null && reversiFlips(state.board, at, index === 0 ? 'd' : 'l').length);
      const hasCurrent = state.board.some((cell, at) => cell === null && reversiFlips(state.board, at, mark).length);
      if (!hasNext && !hasCurrent) finish(room, state.counts[0] === state.counts[1] ? null : state.counts[0] > state.counts[1] ? room.players[0].id : room.players[1].id, `Final score ${state.counts[0]}–${state.counts[1]}.`);
      else if (hasNext) switchTurn();
      break;
    }
    case 'dots': {
      requireTurn();
      const kind = move.edge?.kind; const at = move.edge?.at;
      if (!['h', 'v'].includes(kind) || !validIndex(at, 20)) throw new Error('Choose an available line.');
      const edges = kind === 'h' ? state.h : state.v;
      if (edges[at]) throw new Error('That line has already been drawn.');
      edges[at] = true;
      let claimed = 0;
      state.boxes.forEach((owner, box) => {
        if (owner) return;
        if (boxEdges(box).every((edge) => { const [type, value] = edge.split(':'); return (type === 'h' ? state.h : state.v)[Number(value)]; })) {
          state.boxes[box] = id; claimed += 1; state.scores[index] += 1;
        }
      });
      if (state.h.every(Boolean) && state.v.every(Boolean)) finish(room, state.scores[0] === state.scores[1] ? null : state.scores[0] > state.scores[1] ? room.players[0].id : room.players[1].id, `Final score ${state.scores[0]}–${state.scores[1]}.`);
      else if (!claimed) switchTurn();
      break;
    }
    default: throw new Error('Unknown game.');
  }
}

function applyRoundAction(room, userId, type) {
  if (room.game !== 'rps' || room.status !== 'active') throw new Error('This action is not available.');
  const index = playerIndex(room, userId);
  if (index < 0) throw new Error('You are not in this room.');
  const state = room.state;
  if (type !== 'next' || !state.roundResult) throw new Error('The next round is not ready.');
  if (!state.next.includes(index)) state.next.push(index);
  if (state.next.length === 2) {
    state.round += 1; state.picks = [null, null]; state.next = []; state.roundResult = null;
  }
}

function publicRoom(room, userId) {
  const copy = JSON.parse(JSON.stringify(room));
  if (copy.game === 'rps' && !copy.state.roundResult) {
    const own = playerIndex(copy, userId);
    if (own >= 0) copy.state.picks[1 - own] = null;
  }
  if (copy.game === 'battleship') {
    const own = playerIndex(copy, userId);
    if (own >= 0) {
      copy.state.fleets = [own === 0 ? copy.state.fleets[0] : null, own === 1 ? copy.state.fleets[1] : null];
    }
  }
  return copy;
}

module.exports = { CATALOG, initialState, applyMove, applyRoundAction, publicRoom, playerIndex };
