const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'chess.js') return { Chess: class { fen() { return 'startpos'; } } };
  return originalLoad.call(this, request, parent, isMain);
};
const { initialState, applyMove, applyRoundAction, publicRoom } = require('../lib/games');
Module._load = originalLoad;

function room(game) {
  const players = [{ id: 'p1', username: 'One' }, { id: 'p2', username: 'Two' }];
  return { id: 'ABC123', game, status: 'active', players, revision: 1, state: initialState(game, players) };
}

test('Tic-Tac-Toe validates turns and detects a winner', () => {
  const r = room('tictactoe');
  for (const [who, at] of [['p1',0],['p2',3],['p1',1],['p2',4],['p1',2]]) applyMove(r, who, { at });
  assert.equal(r.status, 'finished'); assert.equal(r.state.winner, 'p1');
  assert.throws(() => applyMove(r, 'p2', { at: 8 }), /not ready/);
});

test('Connect Four drops tokens to the lowest free cell', () => {
  const r = room('connect4');
  applyMove(r, 'p1', { col: 0 }); applyMove(r, 'p2', { col: 1 });
  assert.equal(r.state.board[35], 'x'); assert.equal(r.state.board[36], 'o');
});

test('Gomoku rejects occupied points', () => {
  const r = room('gomoku'); applyMove(r, 'p1', { at: 112 });
  assert.throws(() => applyMove(r, 'p2', { at: 112 }), /not available/);
});

test('RPS keeps the first choice private until both players lock in', () => {
  const r = room('rps'); applyMove(r, 'p1', { choice: 'rock' });
  const view = publicRoom(r, 'p2'); assert.equal(view.state.picks[0], null); assert.equal(view.state.picks[1], null);
  applyMove(r, 'p2', { choice: 'scissors' });
  assert.equal(r.state.roundResult.winnerIndex, 0); assert.equal(r.state.scores[0], 1);
  applyRoundAction(r, 'p1', 'next'); applyRoundAction(r, 'p2', 'next');
  assert.equal(r.state.round, 2); assert.equal(r.state.roundResult, null);
});

test('Battleship hides the opposing fleet in each player view', () => {
  const r = room('battleship');
  assert.equal(publicRoom(r, 'p1').state.fleets[1], null);
  assert.deepEqual(publicRoom(r, 'p1').state.fleets[0], r.state.fleets[0]);
  assert.equal(publicRoom(r, 'p2').state.fleets[0], null);
  assert.deepEqual(publicRoom(r, 'p2').state.fleets[1], r.state.fleets[1]);
  assert.equal(r.state.fleets[0].length, 17); assert.equal(r.state.fleets[1].length, 17);
});

test('Reversi validates the opening move and flips the bracketed piece', () => {
  const r = room('reversi');
  applyMove(r, 'p1', { at: 19 });
  assert.equal(r.state.board[27], 'l'); assert.equal(r.state.board[19], 'l');
  assert.equal(r.state.counts[0], 4); assert.equal(r.state.counts[1], 1);
});

test('Dots and Boxes awards a completed square and keeps the turn', () => {
  const r = room('dots');
  // Box 0: top, bottom, left, right.
  applyMove(r, 'p1', { edge: { kind: 'h', at: 0 } });
  applyMove(r, 'p2', { edge: { kind: 'h', at: 5 } });
  applyMove(r, 'p1', { edge: { kind: 'v', at: 0 } });
  applyMove(r, 'p2', { edge: { kind: 'v', at: 1 } });
  assert.equal(r.state.boxes[0], 'p2'); assert.equal(r.state.scores[1], 1); assert.equal(r.state.turn, 'p2');
});

test('Checkers enforces mandatory captures', () => {
  const r = room('checkers');
  r.state.board = Array(64).fill(null); r.state.board[42] = 'l'; r.state.board[33] = 'd'; r.state.board[40] = 'l';
  assert.throws(() => applyMove(r, 'p1', { from: 40, to: 33 }), /capture is required/);
  applyMove(r, 'p1', { from: 42, to: 24 });
  assert.equal(r.state.board[33], null); assert.equal(r.state.board[24], 'l');
});
