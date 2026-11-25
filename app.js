(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const games = {
    tictactoe: { name: 'Tic-Tac-Toe', tip: 'The centre square is a good place to start. Or is it?', category: 'QUICK CLASSIC' },
    chess: { name: 'Chess', tip: 'Every piece has a purpose. Every move has a consequence.', category: 'THE THINKING GAME' },
    rps: { name: 'Rock Paper Scissors', tip: 'Read your opponent. Or just trust your gut.', category: 'QUICK CLASSIC' },
    connect4: { name: 'Connect Four', tip: 'Watch the diagonals. They sneak up on you.', category: 'QUICK CLASSIC' },
    battleship: { name: 'Battleship', tip: 'A random shot can be a brilliant shot. Good hunting.', category: 'THE TACTICAL GAME' },
    checkers: { name: 'Checkers', tip: 'Captures are compulsory. Chain jumps can turn a game.', category: 'THE THINKING GAME' },
    reversi: { name: 'Reversi', tip: 'Corners are powerful. Edges can be just as important.', category: 'THE THINKING GAME' },
    dots: { name: 'Dots & Boxes', tip: 'The third side of a box is an invitation. The fourth is a claim.', category: 'QUICK CLASSIC' },
    gomoku: { name: 'Gomoku', tip: 'Build two threats at once. Make them choose what to stop.', category: 'THE THINKING GAME' },
  };
  const state = { user: null, selectedGame: 'tictactoe', room: null, viewerId: null, pollTimer: null, selected: null, busy: false, toastTimer: null, lastAuth: '' };
  const glyph = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function avatar(user, extra = '') {
    const initial = escapeHTML((user?.username || '?').slice(0, 1).toUpperCase());
    return `<div class="avatar ${extra}">${user?.avatar ? `<img src="${escapeHTML(user.avatar)}" alt="">` : initial}</div>`;
  }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function showSetup(message) {
    const el = $('#setup-banner'); el.textContent = message; el.classList.remove('hidden');
  }
  function openModal(tab = 'create') {
    $('#room-modal').classList.add('open'); $('#room-modal').setAttribute('aria-hidden', 'false'); setModalTab(tab);
  }
  function closeModal() {
    $('#room-modal').classList.remove('open'); $('#room-modal').setAttribute('aria-hidden', 'true');
  }
  function setModalTab(tab) {
    $$('.modal-tab').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
    $('#create-panel').classList.toggle('hidden', tab !== 'create');
    $('#join-panel').classList.toggle('hidden', tab !== 'join');
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function login() {
    const next = location.pathname + location.search;
    location.href = `/api/auth/login?next=${encodeURIComponent(next)}`;
  }
  function renderProfile() {
    if (!state.user) {
      $('#top-profile').innerHTML = '<button class="discord-button" id="login-button"><span class="discord-icon">◉</span> Continue with Discord</button>';
      $('#sidebar-profile').innerHTML = '<div class="avatar avatar-placeholder">?</div><div class="profile-label"><strong>Guest player</strong><small>Sign in to play</small></div><button class="profile-action" id="sidebar-login" aria-label="Sign in">↗</button>';
      return;
    }
    $('#top-profile').innerHTML = `<div class="user-chip">${avatar(state.user)}<strong>${escapeHTML(state.user.username)}</strong><button id="logout-button" title="Sign out">↗</button></div>`;
    $('#sidebar-profile').innerHTML = `${avatar(state.user)}<div class="profile-label"><strong>${escapeHTML(state.user.username)}</strong><small>Ready to play</small></div><button class="profile-action" id="logout-button-side" aria-label="Sign out">↗</button>`;
  }
  function requireLogin() {
    if (state.user) return true;
    toast('Sign in with Discord before creating or joining a room.');
    setTimeout(login, 850);
    return false;
  }
  async function refreshUser() {
    try {
      const result = await api('/api/auth/me');
      state.user = result.user;
      renderProfile();
      const params = new URLSearchParams(location.search);
      const authStatus = params.get('auth');
      if (authStatus && authStatus !== state.lastAuth) {
        state.lastAuth = authStatus;
        if (authStatus === 'success') toast('Discord connected. Pick a game to get started.');
        else if (authStatus === 'failed' || authStatus === 'invalid') toast('Discord sign-in did not complete. Please try again.');
        params.delete('auth'); history.replaceState({}, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
      }
      if (state.user && params.get('room')) joinRoom(params.get('room'), true);
    } catch (error) { console.error(error); }
  }
  function setSelectedGame(game) {
    if (!games[game]) return;
    state.selectedGame = game;
    $$('.modal-game').forEach((button) => button.classList.toggle('selected', button.dataset.game === game));
  }
  async function createRoom() {
    if (!requireLogin() || state.busy) return;
    state.busy = true; $('#create-room-button').disabled = true; $('#create-room-button').textContent = 'Creating room…';
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ action: 'create', game: state.selectedGame }) });
      closeModal(); enterRoom(data.room, data.viewerId);
    } catch (error) { toast(error.message); }
    finally { state.busy = false; $('#create-room-button').disabled = false; $('#create-room-button').innerHTML = 'Create private room <span>↗</span>'; }
  }
  async function joinRoom(code, fromInvite = false) {
    if (!requireLogin() || state.busy) return;
    const roomId = String(code || '').trim().toUpperCase();
    if (!roomId) { toast('Enter a room code first.'); return; }
    state.busy = true; $('#join-room-button').disabled = true;
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ action: 'join', roomId }) });
      closeModal(); enterRoom(data.room, data.viewerId);
    } catch (error) { toast(error.message); if (!fromInvite) $('#room-code-input').focus(); }
    finally { state.busy = false; $('#join-room-button').disabled = false; }
  }
  function enterRoom(room, viewerId) {
    state.room = room; state.viewerId = viewerId; state.selected = null;
    $('#game-room').classList.remove('hidden'); $('#game-room').setAttribute('aria-hidden', 'false');
    history.replaceState({}, '', `/?room=${encodeURIComponent(room.id)}`);
    renderRoom(); startPolling();
  }
  function leaveRoom() {
    stopPolling(); state.room = null; state.selected = null;
    $('#game-room').classList.add('hidden'); $('#game-room').setAttribute('aria-hidden', 'true');
    history.replaceState({}, '', '/');
  }
  function startPolling() {
    stopPolling(); state.pollTimer = setInterval(pollRoom, 1600);
  }
  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }
  async function pollRoom() {
    if (!state.room || state.busy) return;
    try {
      const data = await api(`/api/rooms?id=${encodeURIComponent(state.room.id)}`);
      if (!state.room || data.room.revision !== state.room.revision) {
        state.room = data.room; state.viewerId = data.viewerId; state.selected = null; renderRoom();
      }
    } catch (error) {
      if (error.message.includes('not found')) { stopPolling(); toast('This room has expired.'); leaveRoom(); }
      else if (error.message.includes('not a player')) { stopPolling(); toast(error.message); leaveRoom(); }
    }
  }
  async function act(action, extra = {}) {
    if (!state.room || state.busy) return;
    state.busy = true;
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ action, roomId: state.room.id, ...extra }) });
      state.room = data.room; state.viewerId = data.viewerId; state.selected = null; renderRoom();
    } catch (error) {
      toast(error.message);
      if (error.message.includes('changed a moment')) await pollRoom();
    } finally { state.busy = false; }
  }
  function currentPlayerIndex() { return state.room?.players.findIndex((player) => player.id === state.viewerId) ?? -1; }
  function playerName(id) { return state.room?.players.find((player) => player.id === id)?.username || 'Player'; }
  function isMyTurn() { return state.room?.status === 'active' && state.room.state.turn === state.viewerId; }
  function setBoardStatus(message, pill) { $('#board-caption-text').textContent = message; $('#turn-pill').textContent = pill; }
  function renderRoom() {
    const room = state.room; if (!room) return;
    const info = games[room.game]; const g = room.state; const idx = currentPlayerIndex();
    $('#room-game-title').textContent = info.name;
    $('#room-game-kicker').textContent = info.category;
    $('#room-code-label').textContent = room.id;
    $('#info-game').textContent = info.name; $('#info-room').textContent = room.id;
    $('#info-round').textContent = room.game === 'rps' ? `Round ${g.round}` : (g.history?.length ? `${g.history.length} moves` : '—');
    $('#game-tip').textContent = info.tip;
    renderPlayers(); renderBoard(); renderGameStatus();
  }
  function renderPlayers() {
    const room = state.room; const g = room.state;
    $('#room-players').innerHTML = [0, 1].map((idx) => {
      const person = room.players[idx];
      if (!person) return `<div class="room-player">${avatar({ username: 'Waiting' }, 'avatar-placeholder')}<div><strong>Waiting for friend</strong><small>Send the room code</small></div><span class="player-mark">···</span></div>`;
      const isMe = person.id === state.viewerId;
      return `<div class="room-player">${avatar(person)}<div><strong>${escapeHTML(person.username)}${isMe ? ' (you)' : ''}</strong><small>${idx === 0 ? 'First player' : 'Second player'}</small></div><span class="player-mark">${g.turn === person.id && room.status === 'active' ? '●' : (g.winner === person.id ? '★' : '')}</span></div>`;
    }).join('');
  }
  function renderGameStatus() {
    const room = state.room; const g = room.state;
    if (room.status === 'waiting') { setBoardStatus('Your room is ready. Waiting for your opponent…', 'WAITING'); return; }
    if (room.status === 'finished') { setBoardStatus(g.result || 'Game finished.', g.winner ? 'FINISHED' : 'DRAW'); return; }
    if (room.game === 'rps') {
      const idx = currentPlayerIndex();
      if (g.roundResult) setBoardStatus(g.roundResult.text, 'ROUND OVER');
      else if (g.picks[idx]) setBoardStatus('Locked in. Waiting for your opponent…', 'LOCKED IN');
      else setBoardStatus('Choose your move. Your choice stays private.', 'YOUR MOVE');
      return;
    }
    const turnName = playerName(g.turn);
    setBoardStatus(g.turn === state.viewerId ? 'Your turn — make it count.' : `${turnName} is thinking…`, g.turn === state.viewerId ? 'YOUR TURN' : 'THEIR TURN');
  }
  function renderBoard() {
    const room = state.room; const g = room.state; const board = $('#game-board'); const controls = $('#game-controls'); controls.innerHTML = '';
    if (room.status === 'waiting') {
      board.innerHTML = `<div class="waiting-state"><div class="waiting-orbit"><span></span><span></span><span></span></div><strong>Waiting for your player two</strong><small>They can join with the code <b>${escapeHTML(room.id)}</b></small><button class="board-action" data-action="copy">Copy invite link</button></div>`;
      return;
    }
    if (room.status === 'finished') {
      board.innerHTML = `<div class="finished-state"><div class="finished-icon">${g.winner ? '✦' : '＝'}</div><strong>${escapeHTML(g.result || 'Game complete')}</strong><small>${g.winner ? `${escapeHTML(playerName(g.winner))} takes the win.` : 'A well-fought draw.'}</small></div>`;
      controls.innerHTML = '<button class="button button-primary" data-action="rematch">Play a rematch <span>↻</span></button>';
      return;
    }
    switch (room.game) {
      case 'tictactoe': board.innerHTML = `<div class="ttt-board">${g.board.map((cell, at) => `<button class="ttt-cell ${cell === 'o' ? 'mark-o' : ''}" data-at="${at}" ${cell || !isMyTurn() ? 'disabled' : ''}>${cell === 'x' ? '×' : cell === 'o' ? '○' : ''}</button>`).join('')}</div>`; break;
      case 'connect4': board.innerHTML = `<div class="grid-board" style="grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(6,1fr)">${g.board.map((cell, at) => `<button class="grid-cell ${cell === 'x' ? 'mark-x' : cell === 'o' ? 'mark-o' : ''}" data-col="${at % 7}" aria-label="Column ${at % 7 + 1}, row ${Math.floor(at / 7) + 1}" ${!isMyTurn() || cell ? 'disabled' : ''}></button>`).join('')}</div>`; break;
      case 'gomoku': board.innerHTML = `<div class="gomoku-board">${g.board.map((cell, at) => `<button class="gomoku-cell ${cell || ''}" data-at="${at}" ${cell || !isMyTurn() ? 'disabled' : ''} aria-label="Intersection ${at + 1}"></button>`).join('')}</div>`; break;
      case 'chess': renderChess(board, g); break;
      case 'rps': renderRPS(board, controls, g); break;
      case 'battleship': renderBattleship(board, g); break;
      case 'checkers': renderCheckers(board, g); break;
      case 'reversi': renderReversi(board, g); break;
      case 'dots': renderDots(board, g); break;
    }
  }
  function chessPieces(fen) {
    const rows = fen.split(' ')[0].split('/'); const pieces = [];
    rows.forEach((row) => {
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i += 1) pieces.push(null);
        else pieces.push(ch);
      }
    });
    return pieces;
  }
  function renderChess(board, g) {
    const pieces = chessPieces(g.fen); const side = g.fen.split(' ')[1]; const selected = state.selected;
    const ownPiece = (p) => p && (side === 'w' ? p === p.toUpperCase() : p === p.toLowerCase());
    board.innerHTML = `<div class="chess-board">${pieces.map((piece, at) => `<button class="chess-square ${(Math.floor(at / 8) + at % 8) % 2 ? 'dark' : 'light'} ${piece ? (piece === piece.toUpperCase() ? 'white-piece' : 'black-piece') : ''} ${selected === at ? 'selected' : ''}" data-chess="${at}" ${!isMyTurn() ? 'disabled' : ''}>${piece ? glyph[piece] : ''}</button>`).join('')}</div>`;
  }
  function renderRPS(board, controls, g) {
    const idx = currentPlayerIndex(); const own = g.picks[idx];
    if (g.roundResult) {
      const icons = { rock: '✊', paper: '✋', scissors: '✌' };
      board.innerHTML = `<div class="rps-result"><div class="rps-choices"><div class="rps-choice"><span>${icons[g.roundResult.picks[idx]]}</span><strong>${escapeHTML(playerName(state.viewerId))}</strong></div><div class="rps-choice"><span>${icons[g.roundResult.picks[1 - idx]]}</span><strong>${escapeHTML(playerName(g.turn === state.viewerId ? g.turn : state.room.players[1 - idx].id))}</strong></div></div><p>${escapeHTML(g.roundResult.text)}</p><small>Score ${g.scores[idx]} — ${g.scores[1 - idx]}</small></div>`;
      controls.innerHTML = `<button class="button button-primary" data-action="rps-next" ${g.next.includes(idx) ? 'disabled' : ''}>${g.next.includes(idx) ? 'Waiting for opponent…' : 'Next round →'}</button>`;
    } else {
      const icons = { rock: '✊', paper: '✋', scissors: '✌' };
      board.innerHTML = `<div class="rps-result"><div class="rps-choices">${Object.entries(icons).map(([choice, icon]) => `<button class="rps-choice" data-choice="${choice}" ${own ? 'disabled' : ''}><span>${icon}</span><strong>${choice.toUpperCase()}</strong></button>`).join('')}</div><p>${own ? `You picked ${own}. Waiting for your opponent…` : 'Pick one. No take-backs.'}</p><small>Score ${g.scores[idx]} — ${g.scores[1 - idx]}</small></div>`;
    }
  }
  function renderBattleship(board, g) {
    const idx = currentPlayerIndex(); const ownFleet = new Set(g.fleets[idx] || []); const shotsAtEnemy = new Map(g.shots[idx].map((shot) => [shot.at, shot]));
    const incoming = new Map(g.shots[1 - idx].map((shot) => [shot.at, shot]));
    board.innerHTML = `<div class="battle-panels"><div class="battle-panel"><div class="battle-label">YOUR FLEET <span>DEFENCE</span></div><div class="battle-board">${Array.from({ length: 100 }, (_, at) => `<div class="battle-cell ${incoming.has(at) ? (incoming.get(at).hit ? 'hit' : 'miss') : ''}">${incoming.has(at) ? (incoming.get(at).hit ? '×' : '·') : ownFleet.has(at) ? '▰' : ''}</div>`).join('')}</div></div><div class="battle-panel"><div class="battle-label">OPPONENT <span>FIRE HERE</span></div><div class="battle-board">${Array.from({ length: 100 }, (_, at) => { const shot = shotsAtEnemy.get(at); return `<button class="battle-cell ${shot ? (shot.hit ? 'hit' : 'miss') : ''}" data-at="${at}" ${!isMyTurn() || shot ? 'disabled' : ''}>${shot ? (shot.hit ? '×' : '·') : ''}</button>`; }).join('')}</div></div></div>`;
  }
  function renderCheckers(board, g) {
    const selected = state.selected; const idx = currentPlayerIndex();
    board.innerHTML = `<div class="checkers-board">${g.board.map((piece, at) => `<button class="checkers-square ${selected === at ? 'selected' : ''}" data-checker="${at}" ${!isMyTurn() ? 'disabled' : ''}>${piece ? `<span class="checker-piece ${piece.toLowerCase() === 'd' ? 'dark' : ''} ${piece === piece.toUpperCase() ? 'king' : ''}"></span>` : ''}</button>`).join('')}</div>`;
  }
  function reversiLegal(board, at, mark) {
    if (board[at] !== null) return false;
    const r = Math.floor(at / 8); const c = at % 8;
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      let rr = r + dr; let cc = c + dc; let found = false;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const value = board[rr * 8 + cc];
        if (value === null) break;
        if (value === mark) { if (found) return true; break; }
        found = true; rr += dr; cc += dc;
      }
    }
    return false;
  }
  function renderReversi(board, g) {
    const mark = currentPlayerIndex() === 0 ? 'l' : 'd';
    board.innerHTML = `<div class="reversi-board">${g.board.map((piece, at) => `<button class="reversi-square ${!piece && reversiLegal(g.board, at, mark) && isMyTurn() ? 'legal' : ''}" data-at="${at}" ${piece || !isMyTurn() ? 'disabled' : ''}>${piece ? `<span class="reversi-piece ${piece === 'd' ? 'dark' : ''}"></span>` : ''}</button>`).join('')}</div>`;
    $('#info-round').textContent = `${g.counts[0]} — ${g.counts[1]}`;
  }
  function renderDots(board, g) {
    const idx = currentPlayerIndex(); const boxes = g.boxes;
    let html = '<div class="dots-board">';
    for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
      if (r % 2 === 0 && c % 2 === 0) html += '<span class="dots-node"></span>';
      else if (r % 2 === 0) {
        const at = Math.floor(r / 2) * 4 + Math.floor(c / 2); const claimed = g.h[at];
        html += `<button class="dots-edge h ${claimed ? `claimed ${claimed !== state.viewerId ? 'other' : ''}` : ''}" data-edge="h:${at}" ${claimed || !isMyTurn() ? 'disabled' : ''}></button>`;
      } else if (c % 2 === 0) {
        const at = Math.floor(r / 2) * 5 + Math.floor(c / 2); const claimed = g.v[at];
        html += `<button class="dots-edge v ${claimed ? `claimed ${claimed !== state.viewerId ? 'other' : ''}` : ''}" data-edge="v:${at}" ${claimed || !isMyTurn() ? 'disabled' : ''}></button>`;
      } else {
        const box = Math.floor(r / 2) * 4 + Math.floor(c / 2); const owner = boxes[box];
        html += `<span>${owner ? `<i class="dots-box ${owner !== state.viewerId ? 'other' : ''}"></i>` : ''}</span>`;
      }
    }
    board.innerHTML = `${html}</div>`;
  }
  function roomInvite() { return `${location.origin}/?room=${encodeURIComponent(state.room?.id || '')}`; }
  async function copyInvite() {
    if (!state.room) return;
    try { await navigator.clipboard.writeText(roomInvite()); toast('Invite link copied.'); }
    catch { toast(`Room code: ${state.room.id}`); }
  }
  async function handleGameBoardClick(event) {
    const target = event.target.closest('button'); if (!target || !state.room) return;
    const game = state.room.game;
    if (target.dataset.action === 'copy') return copyInvite();
    if (game === 'rps' && target.dataset.choice) return act('move', { move: { choice: target.dataset.choice } });
    if (game === 'rps' && target.dataset.action === 'rps-next') return act('rps-next');
    if (target.dataset.at !== undefined && ['tictactoe', 'gomoku', 'battleship', 'reversi'].includes(game)) return act('move', { move: { at: Number(target.dataset.at) } });
    if (game === 'connect4' && target.dataset.col !== undefined) return act('move', { move: { col: Number(target.dataset.col) } });
    if (game === 'dots' && target.dataset.edge) { const [kind, at] = target.dataset.edge.split(':'); return act('move', { move: { edge: { kind, at: Number(at) } } }); }
    if (game === 'chess' && target.dataset.chess !== undefined) {
      const at = Number(target.dataset.chess); const pieces = chessPieces(state.room.state.fen); const piece = pieces[at]; const whiteTurn = state.room.state.fen.split(' ')[1] === 'w';
      const isOwn = piece && (whiteTurn ? piece === piece.toUpperCase() : piece === piece.toLowerCase());
      if (state.selected === null && isOwn) { state.selected = at; renderBoard(); return; }
      if (state.selected !== null && isOwn) { state.selected = at; renderBoard(); return; }
      if (state.selected !== null) {
        const from = state.selected; const fromPiece = pieces[from]; const isPawnPromotion = fromPiece?.toLowerCase() === 'p' && (Math.floor(at / 8) === 0 || Math.floor(at / 8) === 7);
        state.selected = null; renderBoard(); return act('move', { move: { from: squareName(from), to: squareName(at), ...(isPawnPromotion ? { promotion: 'q' } : {}) } });
      }
    }
    if (game === 'checkers' && target.dataset.checker !== undefined) {
      const at = Number(target.dataset.checker); const board = state.room.state.board; const piece = board[at]; const idx = currentPlayerIndex();
      const own = piece && piece.toLowerCase() === (idx === 0 ? 'l' : 'd');
      if (state.selected === null && own) { state.selected = at; renderBoard(); return; }
      if (state.selected !== null && own) { state.selected = at; renderBoard(); return; }
      if (state.selected !== null) { const from = state.selected; state.selected = null; renderBoard(); return act('move', { move: { from, to: at } }); }
    }
  }
  function squareName(at) { return 'abcdefgh'[at % 8] + (8 - Math.floor(at / 8)); }

  // Navigation and modal interactions
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a'); if (!target) return;
    if (target.id === 'login-button' || target.id === 'sidebar-login') { event.preventDefault(); login(); }
    if (target.id === 'logout-button' || target.id === 'logout-button-side') api('/api/auth/logout', { method: 'POST' }).then(() => { state.user = null; renderProfile(); toast('Signed out.'); }).catch((e) => toast(e.message));
    if (['nav-create', 'hero-create'].includes(target.id)) { if (requireLogin()) openModal('create'); }
    if (['nav-join', 'hero-join'].includes(target.id)) { if (requireLogin()) openModal('join'); }
    if (target.id === 'invite-friend') { if (requireLogin()) openModal('create'); }
    if (target.dataset.close === 'room-modal') closeModal();
    if (target.classList.contains('modal-tab')) setModalTab(target.dataset.tab);
    if (target.classList.contains('modal-game')) setSelectedGame(target.dataset.game);
    if (target.classList.contains('game-card')) { setSelectedGame(target.dataset.game); if (requireLogin()) openModal('create'); }
    if (target.dataset.filter) {
      $$('.filter-chip').forEach((button) => button.classList.toggle('active', button === target));
      $$('.game-card').forEach((card) => card.classList.toggle('hidden', target.dataset.filter !== 'all' && card.dataset.category !== target.dataset.filter));
    }
  });
  $('#create-room-button').addEventListener('click', createRoom);
  $('#join-room-button').addEventListener('click', () => joinRoom($('#room-code-input').value));
  $('#room-code-input').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#room-code-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(event.target.value); });
  $('#leave-room').addEventListener('click', leaveRoom);
  $('#copy-room-code').addEventListener('click', copyInvite);
  $('#invite-copy-small').addEventListener('click', copyInvite);
  $('#game-board').addEventListener('click', handleGameBoardClick);
  $('#game-controls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    if (button.dataset.action === 'rematch') act('rematch');
    if (button.dataset.action === 'rps-next') act('rps-next');
  });
  $('#resign-button').addEventListener('click', () => { if (confirm('Resign this game?')) act('concede'); });
  $('#room-modal').addEventListener('click', (event) => { if (event.target === $('#room-modal')) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

  // Boot
  refreshUser();
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) { if (state.user) joinRoom(invite, true); else { openModal('join'); $('#room-code-input').value = invite.toUpperCase(); } }
})();
