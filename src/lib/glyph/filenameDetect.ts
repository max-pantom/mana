import type { DetectedGlyphCandidate } from "@/lib/model";

const NAMED_GLYPHS: Record<string, { codepoint: number; label: string }> = {
  space: { codepoint: 0x20, label: "space" },
  underscore: { codepoint: 0x5f, label: "_" },
  hyphen: { codepoint: 0x2d, label: "-" },
  dash: { codepoint: 0x2d, label: "-" },
  minus: { codepoint: 0x2212, label: "−" },
  period: { codepoint: 0x2e, label: "." },
  dot: { codepoint: 0x2e, label: "." },
  comma: { codepoint: 0x2c, label: "," },
  colon: { codepoint: 0x3a, label: ":" },
  semicolon: { codepoint: 0x3b, label: ";" },
  slash: { codepoint: 0x2f, label: "/" },
  backslash: { codepoint: 0x5c, label: "\\" },
  plus: { codepoint: 0x2b, label: "+" },
  equal: { codepoint: 0x3d, label: "=" },
  question: { codepoint: 0x3f, label: "?" },
  exclam: { codepoint: 0x21, label: "!" },
  quote: { codepoint: 0x22, label: `"` },
  apostrophe: { codepoint: 0x27, label: "'" },
  parenleft: { codepoint: 0x28, label: "(" },
  parenright: { codepoint: 0x29, label: ")" },
  bracketleft: { codepoint: 0x5b, label: "[" },
  bracketright: { codepoint: 0x5d, label: "]" },
  braceleft: { codepoint: 0x7b, label: "{" },
  braceright: { codepoint: 0x7d, label: "}" },
};

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function normalizeBase(filename: string) {
  return stripExtension(filename)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_");
}

function cpCandidate(codepoint: number, label: string, confidence: "high" | "medium", reason: string): DetectedGlyphCandidate {
  const char = String.fromCodePoint(codepoint);
  return { kind: "unicode", codepoint, char, label, confidence, reason };
}

export function detectGlyphFromFilename(filename: string): DetectedGlyphCandidate {
  const base = normalizeBase(filename);
  const lower = base.toLowerCase();

  // Single visible ASCII char e.g. "A.svg" or "-.svg"
  if (base.length === 1) {
    const codepoint = base.codePointAt(0) ?? 0;
    return cpCandidate(codepoint, base, "high", "single-character filename");
  }

  // uni0041, u0041
  {
    const m = lower.match(/^(?:uni|u)([0-9a-f]{4,6})$/i);
    if (m) {
      const codepoint = parseInt(m[1], 16);
      if (Number.isFinite(codepoint)) return cpCandidate(codepoint, `U+${m[1].toUpperCase()}`, "high", "uni/u hex pattern");
    }
  }

  // U+0041
  {
    const m = base.match(/^U\+([0-9A-Fa-f]{4,6})$/);
    if (m) {
      const codepoint = parseInt(m[1], 16);
      if (Number.isFinite(codepoint)) return cpCandidate(codepoint, `U+${m[1].toUpperCase()}`, "high", "U+ hex pattern");
    }
  }

  // 0x41 / 0041
  {
    const m = lower.match(/^(?:0x)?([0-9a-f]{2,6})$/i);
    if (m) {
      const codepoint = parseInt(m[1], 16);
      if (Number.isFinite(codepoint) && codepoint >= 0x20) {
        return cpCandidate(codepoint, `0x${m[1].toUpperCase()}`, "medium", "hex-like filename");
      }
    }
  }

  // named glyphs
  if (NAMED_GLYPHS[lower]) {
    const { codepoint, label } = NAMED_GLYPHS[lower];
    return cpCandidate(codepoint, label, "high", "named glyph");
  }

  // e.g. "A_alt", "logo_mark" -> unknown but keep label
  return { kind: "unknown", label: base, confidence: "low", reason: "no known filename pattern matched" };
}

export function defaultGlyphNameForFilename(filename: string) {
  const base = normalizeBase(filename);
  const safe = base.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return safe.length ? safe : "glyph";
}

