/**
 * Stable device identifier (HWID).
 *
 * Two layers:
 *  1. A long-lived first-party cookie holding the device id, so the SAME device
 *     always presents the SAME id across browser restarts.
 *  2. A fingerprint computed only from characteristics that do NOT change over
 *     time (no browser version, no zoom level, no timezone offset, no canvas
 *     pixel dump) — used to derive the id the first time, and as a fallback if
 *     cookies are unavailable.
 *
 * No critical data lives in localStorage; the cookie only holds the device id
 * which is also what gets sent to the server anyway.
 */

const COOKIE_NAME = "hx_did";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years

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

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked — fingerprint fallback still works */
  }
}

/** Browser family + OS family only: survives version updates. */
function platformSignature(): string {
  const ua = navigator.userAgent;
  const family = /Edg\//.test(ua)
    ? "edge"
    : /OPR\//.test(ua)
      ? "opera"
      : /Firefox\//.test(ua)
        ? "firefox"
        : /Chrome\//.test(ua)
          ? "chrome"
          : /Safari\//.test(ua)
            ? "safari"
            : "other";
  const os = /Windows/.test(ua)
    ? "win"
    : /Android/.test(ua)
      ? "android"
      : /(iPhone|iPad|iPod)/.test(ua)
        ? "ios"
        : /Mac OS X/.test(ua)
          ? "mac"
          : /Linux/.test(ua)
            ? "linux"
            : "other";
  return `${family}|${os}`;
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
    return PROBE_FONTS.map((font) => {
      ctx.font = `72px '${font}', monospace`;
      return Math.round(ctx.measureText(sample).width);
    }).join(",");
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

function isValidId(value: string | null): value is string {
  return !!value && /^[0-9a-f]{64}$/.test(value);
}

let cached: string | null = null;

export async function getHwid(): Promise<string> {
  if (cached) return cached;

  const fromCookie = readCookie(COOKIE_NAME);
  if (isValidId(fromCookie)) {
    cached = fromCookie;
    return cached;
  }

  const nav = navigator as Navigator & { deviceMemory?: number };

  // Only time-stable signals. Deliberately excluded: browser version string,
  // devicePixelRatio (changes with zoom), availWidth/Height (taskbar/window),
  // timezone offset (DST), canvas pixel dump (driver/AA changes).
  const parts = [
    platformSignature(),
    (navigator.language || "").split("-")[0] ?? "",
    String(navigator.hardwareConcurrency ?? 0),
    String(nav.deviceMemory ?? 0),
    String(navigator.maxTouchPoints ?? 0),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "tz?",
    webglSignature(),
    fontSignature(),
  ];

  const raw = parts.join("::");
  try {
    cached = await sha256(raw);
  } catch {
    cached = fallbackHash(raw);
  }

  writeCookie(COOKIE_NAME, cached);
  return cached;
}

/** "a1b2c3…d4e5f6" style display for the user. */
export function maskHwid(hwid: string | null | undefined): string {
  if (!hwid) return "—";
  if (hwid.length <= 14) return hwid;
  return `${hwid.slice(0, 6)}\u2026${hwid.slice(-6)}`;
}
