// Bild-Utilities: Laden, Data-URL-Konvertierung, Background-Removal.

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Einfacher Sketch-Pad-Renderer: gibt data-URL eines gemalten Bildes zurück.
// Generiert ein PNG mit transparentem Hintergrund.
export function canvasStrokeToDataUrl(
  canvas: HTMLCanvasElement
): string {
  return canvas.toDataURL("image/png");
}

// Background Removal via @imgly/background-removal. Läuft komplett im
// Browser (WebAssembly/WebGPU), kein API-Key nötig. Model wird beim ersten
// Aufruf geladen (~80MB, gecacht im Browser).
let bgRemovalModule: typeof import("@imgly/background-removal") | null = null;
let bgRemovalLoading: Promise<typeof import("@imgly/background-removal")> | null = null;

async function loadBgRemovalModule() {
  if (bgRemovalModule) return bgRemovalModule;
  if (bgRemovalLoading) return bgRemovalLoading;
  bgRemovalLoading = import("@imgly/background-removal").then((m) => {
    bgRemovalModule = m;
    return m;
  });
  return bgRemovalLoading;
}

export async function removeBackground(
  src: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const mod = await loadBgRemovalModule();
  // removeBackground akzeptiert data-URL oder URL. Output = Blob-URL.
  const blob = await mod.removeBackground(src, {
    progress: (_key: string, current: number, total: number) => {
      if (onProgress && total > 0) {
        onProgress(Math.round((current / total) * 100));
      }
    },
    output: { format: "image/png" },
  });
  // Blob → data-URL
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Hilfsfunktion für Sketch: Erzeugt ein transparentes Canvas, auf das
// gemalt werden kann. Wird von SketchPad und PlayerSketch genutzt.
export function createSketchCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { canvas, ctx };
}
