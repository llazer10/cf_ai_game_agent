# Game Recommender agent

This is my assignment AI-powered video game recommendation assistant built using Cloudflare Workers AI and the Agents SDK.

This project helps users discover video games based on their:
- preferred genre
- gaming platform
- PC performance
- personality/playstyle

The agent combines AI reasoning with tool-based APIs to generate intelligent recommendations.

## Quick start

Install dependicies and do the following
```bash
npm install
cd agents-starter
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see your agent in action.

Try these prompts to see the different features:

- **"What are some good co-op games for PC?"** — server-side tool (runs automatically)
- **"What games would you recommend for my PC specs?"** — client-side tool (browser provides the answer)
- **"I'm in the mood for a story-rich game, any suggestions?"** — approval tool (asks you before running)

## Tools implemented

1. searchRealGames
This tool queries the RAWG video game database to fetch real games based on a genre and optional platform.

To use this tool yourself you need your own RAWG API key or any other game database API key.
(1). Create a free acount at the RAWG website: https://rawg.io
(2). Generate the API Key
(3). Add the API key to your Cloudflare Worker as a secret:
                wrangler secret put RAWG_API_KEY

This stores the key securely in Cloudflare so it is not exposed in the GitHub repository.


The tool returns:

game name
rating
release date
supported platforms
To improve reliability, a genre mapping system converts user-friendly genres (like "open world" or "sci-fi") into RAWG-compatible genre slugs.

2. gamePerformanceRecommendation
Recommends games depending on the performance capability of a user's PC.

Supported categories:
low-end PCs
high-end PCs

3. personalityGameRecommendation
Recommends games based on the player's personality or preferred playstyle.

Supported playstyles:
competitive
relaxed
story lover
explorer
strategist

4. gpuGameRecommendation
Detects GPU models such as:

RTX 3070
RTX 4090
GTX 1060
and recommends games suitable for those hardware capabilities.

## Project structure

```
src/
  server.ts    # Game agent with tools
  app.tsx      # Chat UI built with Kumo components
  client.tsx   # React entry point
  styles.css   # Tailwind + Kumo styles
```

## What's included

- **AI Powered game recommendations**
- **Three tool patterns** — server-side auto-execute, client-side (browser), and human-in-the-loop approval
- **Scheduling** — one-time, delayed, and recurring (cron) tasks
- **Reasoning display** — shows model thinking as it streams, collapses when done
- **Debug mode** — toggle in the header to inspect raw message JSON for each message
- **Kumo UI** — Cloudflare's design system with dark/light mode
- **Real-time** — WebSocket connection with automatic reconnection and message persistence


## Deploy

```bash
npm run deploy
```

Your agent is live on Cloudflare's global network. Messages persist in SQLite, streams resume on disconnect, and the agent hibernates when idle.


## License

MIT
