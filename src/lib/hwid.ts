/**
 * Device fingerprint (HWID) generation.
 * Purely computed at runtime from device characteristics — never persisted in
 * localStorage. The resulting hash is only ever sent to the server.
 */

const PROBE_FONTS = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Impact",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Menlo",
  "Monaco",
  "Roboto",
  "Ubuntu",
];

function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 260;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-2d";
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f0f";
    ctx.fillRect(0, 0, 120, 24);
    ctx.fillStyle = "#2d1b69";
    ctx.fillText("hwid::\u26a1\ud83d\udd11 0123456789", 4, 6);
    ctx.strokeStyle = "rgba(120,60,220,0.7)";
    ctx.beginPath();
    ctx.arc(60, 40, 18, 0, Math.PI * 2, true);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return "canvas-error";
  }
}

function webglSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "no-webgl";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return `${String(vendor)}|${String(renderer)}|${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`;
  } catch {
    return "webgl-error";
  }
}

function fontSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-fonts";
    const sample = "mmmmmmmmmmlli WWW@#";
    const baseline = PROBE_FONTS.map((font) => {
      ctx.font = `72px '${font}', monospace`;
      return Math.round(ctx.measureText(sample).width);
    });
    return baseline.join(",");
  } catch {
    return "fonts-error";
  }
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Simple non-crypto fallback for environments without WebCrypto. */
function fallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = (h1 ^ c) * 0x01000193;
    h2 = (h2 ^ (c + i)) * 0x85ebca6b;
    h1 >>>= 0;
    h2 >>>= 0;
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, "0").repeat(4).slice(0, 64);
}

let cached: string | null = null;

export async function getHwid(): Promise<string> {
  if (cached) return cached;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };

  const parts = [
    nav.userAgent,
    nav.language,
    (nav.languages ?? []).join("-"),
    nav.platform,
    String(nav.hardwareConcurrency ?? 0),
    String(nav.deviceMemory ?? 0),
    String(nav.maxTouchPoints ?? 0),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    `${screen.availWidth}x${screen.availHeight}`,
    String(window.devicePixelRatio),
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "tz?",
    canvasSignature(),
    webglSignature(),
    fontSignature(),
  ];

  const raw = parts.join("::");
  try {
    cached = await sha256(raw);
  } catch {
    cached = fallbackHash(raw);
  }
  return cached;
}

/** "a1b2c3…d4e5f6" style display for the user. */
export function maskHwid(hwid: string | null | undefined): string {
  if (!hwid) return "—";
  if (hwid.length <= 14) return hwid;
  return `${hwid.slice(0, 6)}\u2026${hwid.slice(-6)}`;
}
