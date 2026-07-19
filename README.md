# VTT — Virtual Tabletop Game Master Tool

Ein Multiplayer-Browser-Game für D&D-artige Sessions à la NoaTheMagic.
Ein **Host (Game Master)** leitet auf PowerPoint-artigen Slides eine Runde,
zieht Textur-Bilder per Drag&Drop, würfelt und dreht ein Glücksrad.
**Spieler** joinen per Code und sehen live die aktive Slide sowie ihren
eigenen Charakterbogen (HP in Herzen, Inventar, Fähigkeiten).

## Architektur

- **Render.com (1 Web Service, Free)** = dummer Relay + Static-Server.
  Node/Express serviert das gebaute Vite-Bundle und spricht Socket.IO.
  Kein Game-Compute.
- **Host-Tab im Browser** = autoritativ. Hält den gesamten Game-State,
  macht Canvas-Operationen, broadcastet an alle.
- **Clients** = dumb viewer + read-only Charakterbogen.
- **Asset-Persistenz** = IndexedDB im Host-Browser (Dexie), keyed nach
  Raum-Name.

## Entwicklung

```bash
npm install
npm run dev      # startet Client (5173) + Server (3001) parallel
```

Client: http://localhost:5173 — Vite-Proxy leitet `/socket.io` und `/api`
automatisch an den Server auf `:3001` weiter.

## Produktion / Render.com

Der `npm start`-Befehl erwartet einen gebauten Server:

```bash
npm run build:server   # TS → dist-server/
npm run build          # Vite → dist/
npm start              # node dist-server/server.js (NODE_ENV=production)
```

In Render: `render.yaml` liegt bei, einfach neues Web Service aus GitHub
verbinden — Render erkennt die Config automatisch.

### Erforderliche Environment-Variablen (für M4 — Bildsuche)

- `PIXABAY_API_KEY` — von https://pixabay.com/accounts/settings/api/
- `UNSPLASH_ACCESS_KEY` — von https://unsplash.com/oauth/applications

Ohne diese Keys läuft die App trotzdem, nur die Bildsuche ist deaktiviert.
Upload von eigenen Assets funktioniert immer.

## Status

MVP-Meilensteine (siehe Projekt-Plan):
- [x] M1 — Setup & Skeleton
- [ ] M2 — Lobby (Raum erstellen/joinen, Player-List, Host-Rolle)
- [ ] M3 — Slide-System + Asset-Browser + Drag&Drop
- [ ] M4 — Pixabay/Unsplash-Suche
- [ ] M5 — Bild-Editor (multi-layer, crop, erase)
- [ ] M6 — Charakterbögen (HP/Inventar/Fähigkeiten)
- [ ] M7 — Glücksrad + Würfel
- [ ] M8 — Player-View (Slide-Sync + read-only Bogen)
- [ ] M9 — IndexedDB-Persistenz
- [ ] M10 — Polish & Deploy-Verify
