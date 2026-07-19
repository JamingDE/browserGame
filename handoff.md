# VTT — Projekt-Handoff

**Stand:** 2026-07-19
**Repo:** https://github.com/JamingDE/browserGame
**Branch:** `main` (alle Commits direkt auf main)
**Render:** Web Service (Free), deployed via GitHub Auto-Deploy

---

## Was das Projekt ist

Ein **Virtual Tabletop / Game Master Tool** für D&D-artige Sessions im Stil von
NoaTheMagic (YouTube). Ein **Host (Game Master)** leitet auf PowerPoint-artigen
Slides eine Runde, zieht Texturen-Bilder per Drag&Drop, würfelt, dreht ein
Glücksrad, verwaltet Spieler-HP in Herzen. **Spieler** joinen per Code und
sehen live die aktive Slide sowie ihren eigenen Charakterbogen.

---

## Architektur-Prinzipien (heilig!)

1. **Render.com = dummer Relay + Static-Server.** Node/Express serviert das
   gebaute Vite-Bundle und spricht Socket.IO. **Kein Game-Compute auf dem
   Server** — Free-Tier-Server ist zu schwach.
2. **Host-Tab im Browser = autoritativ.** Hält den gesamten Game-State, macht
   Canvas-Operationen, Background-Removal, broadcastet an alle.
3. **Clients = dumb viewer + read-only Charakterbogen.**
4. **Asset-Persistenz = IndexedDB im Host-Browser** (für M9 vorgesehen, aktuell
   übers Springen von M9 noch nicht umgesetzt — Assets leben nur im Memory des
   Host-State).

---

## Tech-Stack

| Schicht | Technologie |
|---|---|
| Frontend | React 18 + Vite 6 + TypeScript |
| State | Zustand (`src/state/store.ts`) |
| Backend | Node + Express + Socket.IO v4 |
| Storage | Dexie (IndexedDB) — *noch nicht aktiv genutzt* |
| Bildsuche | Pixabay-API (serverseitig geproxied, Key über Env-Var) |
| Background-Removal | `@imgly/background-removal` (client-seitig via WASM, ~80MB Modell vom CDN) |
| Deployment | Render.com Free Web Service, `render.yaml` liegt bei |

---

## Build & Run

```bash
npm install
npm run dev          # Client :5173 + Server :3001 parallel (vite proxy)
npm run typecheck    # tsc --noEmit (prüft src + server + shared)
npm run build        # vite build (client) + tsc -p tsconfig.server.json (server)
npm start            # node dist-server/server/index.js (NODE_ENV=production)
```

**Render Build Command:** `npm install --include=dev && npm run build`
  (devDependencies nötig, weil vite/tsc dort liegen)

**Render Start Command:** `npm start`

**Env-Vars:**
- `NODE_ENV=production`
- `PIXABAY_API_KEY` (optional, ohne läuft Bildsuche leer, Upload immer möglich)

---

## Verzeichnisstruktur

```
vtt/
├── package.json
├── render.yaml              # Render.com Service-Config
├── tsconfig.json            # Client + shared (noEmit, typecheck-only)
├── tsconfig.server.json     # Server → dist-server/
├── vite.config.ts           # Proxy /socket.io + /api → :3001
├── index.html
├── shared/
│   └── types.ts             ⭐ ALLE Typen + Socket-Events + State-Factory
├── server/
│   ├── index.ts             # Express + Socket.IO-Relay
│   ├── rooms.ts             # Raum-Verwaltung (roster, socketToRoom-Map)
│   └── imageProxy.ts        # Pixabay-Suche + /api/fetch (CORS-Proxy)
└── src/
    ├── main.tsx
    ├── App.tsx              # View-State-Maschine: lobby→waiting→host/player
    ├── styles.css           # Alle Styles, Dark-Fantasy-Theme
    ├── net/socket.ts        # Socket.IO-Client-Singleton
    ├── state/store.ts       ⭐ Zustand-Store: Game-State + alle Aktionen
    ├── utils/
    │   ├── image.ts         # fileToDataUrl, loadImage, removeBackground
    │   └── storage.ts       # LocalStorage (Player-Name)
    ├── components/
    │   ├── Toasts.tsx       # Toast-System (dice/wheel/info)
    │   └── SketchPad.tsx    # Wiederverwendbares Mal-Pad
    ├── lobby/
    │   ├── Lobby.tsx        # Raum erstellen / beitreten
    │   └── WaitingRoom.tsx  # Wartezimmer mit Roster
    ├── host/
    │   ├── HostView.tsx     # Host-Layout, öffnet alle Modals
    │   ├── SlideCanvas.tsx  # ⭐ Haupt-Canvas: drag/resize/rotate/paint/text
    │   ├── SlideList.tsx    # Slide-Thumbnails links
    │   ├── AssetBrowser.tsx # Suche/Upload/Verlauf/Saved rechts
    │   ├── ImageEditor.tsx  # Multi-Layer Editor (crop/erase/paint)
    │   ├── CharacterPanel.tsx # HP/Inventar/Fähigkeiten pro Spieler
    │   ├── WheelModal.tsx   # Glücksrad (Canvas-Rendering + Spin)
    │   ├── DiceModal.tsx    # Würfel W4-W100 + custom + Historie
    │   └── SuggestionInbox.tsx # Spieler-Vorschläge für den GM
    └── player/
        └── PlayerView.tsx   # Slide-Anzeige + Bogen + Item-malen
```

---

## Game-State (zentral, auf dem Host)

```typescript
{
  roomCode, hostId, hostName, roomName,
  maxPlayers, startHearts,
  players: [{ id, name, hearts, maxHearts,
              inventory: [{ id, kind: "text"|"image", label, assetId? }],
              abilities: [] }],
  slides: [{ id, name, background,
             elements: [{ id, type: "image"|"text"|"paint",
                          assetId?, text?, fontSize?, color?,
                          x, y, w, h, rotation,
                          highlighted?, layer?: "back"|"normal"|"front" }] }],
  activeSlideIndex,
  assets: { saved: { [roomName]: assetId[] },
            library: { [id]: { id, name, src, tags, transparent? } } },
  wheel: { segments: [{ id, label, color, weight }], lastResult?, spinning? },
  die: { sides, history: [{ player?, value, at }], lastResult? },
  suggestions: [{ id, fromPlayerId, fromPlayerName, assetId, label,
                  createdAt, decided?, asset }]
}
```

**Alle Koordinaten sind relativ (0..1)** zur Slide-Bühne, nicht in Pixel.
→ Skaliert automatisch mit jeder Bildschirmgröße.

---

## Sync-Logik

### Host → Spieler
- `host:state-sync(state)` — Host pusht gesamten State. Server leitet via
  `socket.to(roomCode).emit("room:state", state)` an alle ANDEREN weiter.
- **Debounced** auf 30ms in `scheduleSync` (in `src/state/store.ts`).
- Wird von JEDEM Store-Mutation ausgelöst (slides, elements, players, etc.).

### Server-initiiert
- `host:request-state` — Server bittet Host um State (z.B. neuer Spieler joint).
- `game:started` — Host hat Spiel gestartet. Liefert finale Roster + Config
  an alle. Host wechselt in HostView, Spieler in PlayerView.
- `lobby:roster` — Lobby-Liste (vor Spielstart).
- `lobby:kick` — GM wirft Spieler raus.
- `player:toast` — Würfel/Glücksrad/Info-Ergebnis als Toast an Spieler.

### Spieler → GM
- `player:suggest({ asset, label })` — Spieler schlägt gemaltes Item vor.
- Server leitet weiter als `gm:suggestion(payload)` an den Host-Socket.

---

## View-State-Maschine (`src/App.tsx`)

```
lobby ── host:create ──▶ waiting (isHost=true)
       └─ player:join ──▶ waiting (isHost=false)

waiting ── game:started ──▶ host (mit roster, roomName, maxPlayers, startHearts)
                         ▶ player

host/player ── Zurück-Button ──▶ lobby
```

**Wichtig:** `game:started`-Listener ist GLOBAL in App.tsx registriert, damit
kein Event verpasst wird. Puffert `pendingStart` als Race-Condition-Schutz.

---

## Bekannte Probleme (Offen, vor nächstem Update zu lösen)

Siehe TODO unten — das sind die Priority-Items fürs nächste Update.

---

## So machst du weiter

1. **Lokal testen:** `npm run dev` in `/home/Phantom/ZCodeProject/vtt`
2. **Typecheck:** `npm run typecheck` MUSS clean sein vor jedem Commit
3. **Commit + Push:** Token liegt in `/home/Phantom/ZCodeProject/gh_token.txt`
   ```bash
   TOKEN=$(tr -d '\n\r' < /home/Phantom/ZCodeProject/gh_token.txt)
   git -c credential.helper= push "https://${TOKEN}@github.com/JamingDE/browserGame.git" main
   ```
4. **Render deployt** automatisch auf Push auf `main`.

---

## Wichtige Designentscheidungen (Warum so?)

- **Socket-IDs als Spieler-IDs:** Spieler sind über ihre Socket-ID im
  Game-State identifiziert. Host findet seinen eigenen Spieler-Eintrag via
  `getSocket().id`.
- **Relativ-Koordinaten (0..1):** Slides skalieren auf jedem Screen gleich.
- **Kein Per-Frame-Sync:** Nur bei echten State-Änderungen (debounced 30ms).
- **Background-Removal im Host-Browser:** Passt zur "Host macht die Arbeit"-
  Philosophie. ~80MB Modell wird beim ersten Aufruf vom CDN geladen.
- **Kein Dexie/IndexedDB bisher:** M9 übersprungen — Assets leben nur im
  Memory. Bei Reload sind sie weg (außer in Pixabay kann man neu suchen).
- **Auto-Deploy via `autoDeploy: true`** in `render.yaml`. Render ignoriert
  die yaml aber aktuell — Build-Command muss manuell gesetzt werden.
