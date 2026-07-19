import { Router } from "express";

// Bild-Such-Proxy für Pixabay. Schützt den API-Key (liegt serverseitig)
// und vermeidet clientseitige CORS-Probleme beim direkten Laden.
//
// GET /api/search?q=...&page=1
//   → { results: [{ id, thumb, full, width, height, source, name }] }

const PIXABAY_KEY = process.env.PIXABAY_API_KEY;

export interface SearchResult {
  id: string;
  thumb: string;
  full: string;
  width?: number;
  height?: number;
  source: "pixabay";
  name: string;
}

async function searchPixabay(
  q: string,
  page: number
): Promise<SearchResult[]> {
  if (!PIXABAY_KEY) return [];
  // image_type=png liefert vorwiegend freigestellte Texturen/Sprites —
  // ideal für Tabletop-Assets. safesearch=true ist Pflicht.
  const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(
    q
  )}&image_type=png&per_page=30&page=${page}&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: {
      id: number;
      webformatURL: string;
      previewURL: string;
      imageWidth: number;
      imageHeight: number;
      tags: string;
    }[];
  };
  return (data.hits ?? []).map((h) => ({
    id: `pixabay-${h.id}`,
    thumb: h.previewURL,
    full: h.webformatURL,
    width: h.imageWidth,
    height: h.imageHeight,
    source: "pixabay" as const,
    name: (h.tags || "").split(",").slice(0, 2).join(" ").trim() || "pixabay",
  }));
}

export const imageProxyRouter = Router();

imageProxyRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);

  if (!q) {
    res.json({ results: [] });
    return;
  }

  try {
    const results = await searchPixabay(q, page);
    res.json({
      results,
      hasKey: Boolean(PIXABAY_KEY),
    });
  } catch (err) {
    console.error("[imageProxy] search failed:", err);
    res.status(500).json({ error: "search failed", results: [] });
  }
});

// Proxy-Endpoint zum Download eines Pixabay-Bildes als data-URL.
// Wichtig: Pixabay-Bilder sind beim clientseitigen Speichern in IndexedDB
// nicht direkt holbar (CORS). Der Proxy umgeht das.
imageProxyRouter.get("/fetch", async (req, res) => {
  const url = String(req.query.url ?? "");
  if (!url.startsWith("https://cdn.pixabay.com/")) {
    res.status(400).json({ error: "only pixabay allowed" });
    return;
  }
  try {
    const r = await fetch(url);
    const ct = r.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    const dataUrl = `data:${ct};base64,${buf.toString("base64")}`;
    res.json({ dataUrl });
  } catch (err) {
    console.error("[imageProxy] fetch failed:", err);
    res.status(500).json({ error: "fetch failed" });
  }
});
