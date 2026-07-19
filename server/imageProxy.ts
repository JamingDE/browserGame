import { Router } from "express";

// Bild-Such-Proxy. Schützt die API-Keys (liegen serverseitig) und
// vermeidet clientseitige CORS-Probleme.
//
// GET /api/search?q=...&source=pixabay|unsplash&page=1
//   → { results: [{ id, thumb, full, width, height, source }] }

const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

export interface SearchResult {
  id: string;
  thumb: string;
  full: string;
  width?: number;
  height?: number;
  source: "pixabay" | "unsplash";
  name: string;
}

async function searchPixabay(q: string, page: number): Promise<SearchResult[]> {
  if (!PIXABAY_KEY) return [];
  const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(
    q
  )}&image_type=png&per_page=24&page=${page}&safesearch=true`;
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

async function searchUnsplash(q: string, page: number): Promise<SearchResult[]> {
  if (!UNSPLASH_KEY) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
    q
  )}&per_page=24&page=${page}&content_filter=high`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_KEY}`,
      "Accept-Version": "v1",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      id: string;
      alt_description: string | null;
      urls: { thumb: string; full: string };
      width: number;
      height: number;
    }[];
  };
  return (data.results ?? []).map((p) => ({
    id: `unsplash-${p.id}`,
    thumb: p.urls.thumb,
    full: p.urls.full,
    width: p.width,
    height: p.height,
    source: "unsplash" as const,
    name: p.alt_description || "unsplash",
  }));
}

export const imageProxyRouter = Router();

imageProxyRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const source = String(req.query.source ?? "pixabay");

  if (!q) {
    res.json({ results: [] });
    return;
  }

  try {
    const results =
      source === "unsplash"
        ? await searchUnsplash(q, page)
        : source === "pixabay"
        ? await searchPixabay(q, page)
        : // beide gemischt
          [
            ...(await searchPixabay(q, page)).slice(0, 12),
            ...(await searchUnsplash(q, page)).slice(0, 12),
          ];
    res.json({ results });
  } catch (err) {
    console.error("[imageProxy] search failed:", err);
    res.status(500).json({ error: "search failed", results: [] });
  }
});

// Optional: Proxy zum echten Download (vermeidet Hotlink-Probleme beim Asset-Speichern).
// Kommt später — für M1 nicht nötig.
