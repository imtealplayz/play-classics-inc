# Play Classics

A Discord-authenticated, invite-link multiplayer arcade with nine classic games.

## Stack

- Responsive frontend with animated game screens and board interactions
- Vercel Node.js Functions for OAuth and authoritative game actions
- Discord OAuth2 (`identify`) with signed, HttpOnly sessions and PKCE
- MongoDB Atlas with a dedicated `play_classics` database and `rooms` collection
- Atomic revision-checked writes to prevent concurrent moves from overwriting each other
- `chess.js` for legal chess move validation
- Short polling for live room synchronization across serverless instances

## Games

Tic-Tac-Toe, Chess, Rock Paper Scissors, Connect Four, Battleship, Checkers, Reversi, Dots and Boxes, and Gomoku.

## Production setup

Add these variables in **Vercel → Project → Settings → Environment Variables**:

| Variable | Value |
| --- | --- |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → Application → OAuth2 → Client ID |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → Application → OAuth2 → Client Secret |
| `APP_URL` | `https://play-classics-inc.vercel.app` (no trailing slash) |
| `SESSION_SECRET` | Random secret of at least 32 characters |
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers → Node.js |
| `PLAY_CLASSICS_DB_NAME` | `play_classics` (already configured in Vercel) |

### MongoDB Atlas

1. Use your existing Atlas cluster, or create a free cluster in MongoDB Atlas.
2. Create a dedicated database user for this app with the `readWrite` role on the `play_classics` database.
3. Configure Atlas Network Access to allow connections from your Vercel deployment. Choose a network-access strategy supported by your Atlas and Vercel plans.
4. Add the Node.js connection string as `MONGODB_URI` in Vercel. Replace the username, password, and cluster-host placeholders. URL-encode special characters in the password.
5. Keep `PLAY_CLASSICS_DB_NAME=play_classics`. This app writes only to its own database and its `rooms` collection; it does not touch other applications' collections.

Rooms expire after 24 hours of inactivity using a MongoDB TTL index. The server creates the index automatically. Each room is stored as one MongoDB document. Every game action uses a revision-matched replacement, and joining uses a conditional atomic update so simultaneous moves cannot overwrite one another or claim the same second seat.

### Discord OAuth redirect URL

In Discord Developer Portal → OAuth2 → Redirects, add this exact URL:

`https://play-classics-inc.vercel.app/api/auth/callback`

Only the `identify` OAuth scope is requested. The app does not request a Discord password, bot token, or guild permissions.

## Local development

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the values.
3. Add `http://localhost:3000/api/auth/callback` to the Discord OAuth redirect list for local development.
4. Run `npm run dev`.

## Health check

`GET /api/health` checks the MongoDB connection without exposing credentials. It returns `database: "connected"` only after a successful ping.

## Security notes

- OAuth state is signed and validated; authorization-code exchange uses PKCE.
- Sessions are HMAC-signed, HttpOnly, Secure in production, and SameSite=Lax.
- Room reads and game actions require membership in the room.
- All moves are validated server-side; clients send intents, not trusted board states.
- MongoDB revision checks reject stale concurrent updates.
- Battleship responses are player-specific and do not reveal the opponent's fleet.
- Rock Paper Scissors picks remain hidden until both players have locked in.
