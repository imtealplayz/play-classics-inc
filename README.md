# Play Classics

A Discord-authenticated, invite-link multiplayer arcade with nine classic games.

**Production site:** https://play-classics-inc.vercel.app  
**Repository:** https://github.com/imtealplayz/play-classics-inc

## Stack

- Static responsive frontend with animated game boards and room UI
- Vercel Node.js Functions for OAuth and authoritative game actions
- Discord OAuth2 (`identify` scope) with signed, HttpOnly sessions and PKCE
- Upstash Redis REST for durable rooms and atomic compare-and-set moves
- `chess.js` for legal chess move validation
- Live room sync via short polling, designed for serverless deployments

## Games

Tic-Tac-Toe, Chess, Rock Paper Scissors, Connect Four, Battleship, Checkers, Reversi, Dots and Boxes, and Gomoku.

## Production setup

The frontend is deployed at the production URL above. The `APP_URL` and `SESSION_SECRET` production settings are already configured in the linked Vercel project. Discord sign-in and persistent multiplayer rooms become active after the following service credentials are connected.

Add these variables in **Vercel → Project → Settings → Environment Variables** for Production:

| Variable | Where it comes from |
| --- | --- |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → your application → OAuth2 → Client ID |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → your application → OAuth2 → Client Secret |
| `UPSTASH_REDIS_REST_URL` | Vercel Marketplace → Upstash Redis integration |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel Marketplace → Upstash Redis integration |

### Discord OAuth redirect URL

In Discord Developer Portal → OAuth2 → Redirects, add this exact URL:

`https://play-classics-inc.vercel.app/api/auth/callback`

Only the `identify` OAuth scope is requested. No Discord password, bot token, or guild permissions are requested.

### Redis

Install **Upstash Redis** from the Vercel Marketplace and connect it to the `play-classics-inc` Vercel project. The room API uses Redis atomic scripts to prevent simultaneous turns from overwriting one another. Rooms expire after 24 hours. The application does not store game state in process memory.

After adding the Discord credentials and connecting Upstash Redis, redeploy the Production environment. Do not paste secrets into source files or commit them to GitHub.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values.
3. Add `http://localhost:3000/api/auth/callback` to the Discord OAuth redirect list for local development (use a separate Discord app or account for local vs production if preferred).
4. `npm run dev`

## Security notes

- OAuth state is signed and validated; the authorization code exchange uses PKCE.
- Sessions are HMAC-signed, HttpOnly, Secure in production, and SameSite=Lax.
- Room reads and game actions require membership in the room.
- All moves are validated server-side; clients send intents, not trusted board states.
- Room writes use Redis compare-and-set semantics to reject stale concurrent updates.
- Battleship responses are player-specific and do not reveal the opponent's fleet.
- Rock Paper Scissors picks remain hidden until both players have locked in.
