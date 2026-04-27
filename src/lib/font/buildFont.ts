import type { BuildRequestSpec, ExportFormat, GlyphMapping } from "@/lib/model";
import { generateLicenseText } from "@/lib/license/generateLicense";
import JSZip from "jszip";
import { Readable } from "node:stream";
import { SVGIcons2SVGFontStream } from "svgicons2svgfont";
import svg2ttf from "svg2ttf";
import ttf2woff from "ttf2woff";
import { Font } from "fonteditor-core";
import bindings from "bindings";

type UploadedSvgFile = { filename: string; buffer: Buffer };

function normalizeFilename(filename: string) {
  return filename.split("/").pop() ?? filename;
}

function mappingsByFilename(mappings: GlyphMapping[]) {
  const map = new Map<string, GlyphMapping>();
  for (const m of mappings) map.set(normalizeFilename(m.filename), m);
  return map;
}

function validateMappings(mappings: GlyphMapping[]) {
  const used = new Map<number, string>();
  for (const m of mappings) {
    if (typeof m.unicode !== "number") continue;
    if (!Number.isFinite(m.unicode)) throw new Error(`Invalid unicode for ${m.filename}`);
    const prev = used.get(m.unicode);
    if (prev) {
      const hex = m.unicode.toString(16).toUpperCase().padStart(4, "0");
      throw new Error(`Duplicate mapping for U+${hex}: ${prev} and ${m.filename}`);
    }
    used.set(m.unicode, m.filename);
  }
}

function applySvgTransform(svgText: string, t?: GlyphMapping["transform"]) {
  if (!t) return svgText;
  const scale = Number.isFinite(t.scale) ? t.scale : 1;
  const dx = Number.isFinite(t.dx) ? t.dx : 0;
  const dy = Number.isFinite(t.dy) ? t.dy : 0;
  if (scale === 1 && dx === 0 && dy === 0) return svgText;

  // Wrap inner SVG content in a group transform.
  // This keeps the original SVG viewBox/width/height intact while allowing per-glyph adjustments.
  const m = svgText.match(/<svg\b[^>]*>/i);
  const closeIdx = m ? svgText.indexOf(m[0]) + m[0].length : -1;
  if (!m || closeIdx < 0) return svgText;

  const open = svgText.slice(0, closeIdx);
  const rest = svgText.slice(closeIdx);
  const transform = `translate(${dx} ${dy}) scale(${scale})`;

  return `${open}<g transform="${transform}">${rest.replace(/<\/svg>/i, "</g></svg>")}`;
}

function applyEvenOdd(svgText: string, evenOdd?: boolean) {
  if (!evenOdd) return svgText;
  const m = svgText.match(/<svg\b[^>]*>/i);
  const closeIdx = m ? svgText.indexOf(m[0]) + m[0].length : -1;
  if (!m || closeIdx < 0) return svgText;
  const open = svgText.slice(0, closeIdx);
  const rest = svgText.slice(closeIdx);
  // Wrap content to enforce even-odd fill rule (cutouts/holes).
  return `${open}<g fill-rule="evenodd" clip-rule="evenodd">${rest.replace(/<\/svg>/i, "</g></svg>")}`;
}

async function buildSvgFont({ metadata, mappings, uploadedFiles }: { metadata: BuildRequestSpec["metadata"]; mappings: GlyphMapping[]; uploadedFiles: UploadedSvgFile[] }) {
  const byName = mappingsByFilename(mappings);
  const mapped = uploadedFiles
    .map((f) => ({ ...f, filename: normalizeFilename(f.filename), mapping: byName.get(normalizeFilename(f.filename)) }))
    .filter((x) => x.mapping && typeof x.mapping.unicode === "number") as Array<
    UploadedSvgFile & { mapping: GlyphMapping & { unicode: number } }
  >;

  if (!mapped.length) throw new Error("No mapped glyphs. Map at least one SVG to a character before exporting.");

  const fontHeight = metadata.metrics?.em ?? 1000;
  const descent = metadata.metrics?.descent ?? 0;

  const fontStream = new SVGIcons2SVGFontStream({
    fontName: metadata.familyName || "Font",
    normalize: true,
    fontHeight,
    descent,
    fixedWidth: metadata.metrics?.fixedWidth ?? false,
    preserveAspectRatio: metadata.metrics?.preserveAspectRatio ?? true,
    centerHorizontally: true,
    log: () => {},
  });

  const chunks: Buffer[] = [];
  const svgFontDone = new Promise<Buffer>((resolve, reject) => {
    fontStream.on("data", (c: Buffer | Uint8Array | string) => {
      if (typeof c === "string") chunks.push(Buffer.from(c));
      else chunks.push(Buffer.from(c));
    });
    fontStream.on("finish", () => resolve(Buffer.concat(chunks)));
    fontStream.on("error", reject);
  });

  for (const item of mapped) {
    const glyph = new Readable();
    // Prefer edited SVG text from the mapping (editor), fall back to uploaded file.
    const sourceSvg = (item.mapping.svgText && item.mapping.svgText.trim().length ? item.mapping.svgText : item.buffer.toString("utf8")) as string;
    const withEvenOdd = applyEvenOdd(sourceSvg, item.mapping.evenOddFill);
    const adjustedSvg = applySvgTransform(withEvenOdd, item.mapping.transform);
    glyph.push(Buffer.from(adjustedSvg, "utf8"));
    glyph.push(null);
    // @ts-expect-error - stream metadata is supported by svgicons2svgfont
    glyph.metadata = {
      unicode: [String.fromCodePoint(item.mapping.unicode)],
      name: item.mapping.glyphName || item.filename,
    };
    if (typeof item.mapping.advanceWidth === "number" && Number.isFinite(item.mapping.advanceWidth)) {
      // svgicons2svgfont uses glyph.width internally; `width` is respected when present.
      // @ts-expect-error - passthrough metadata is accepted and used by the lib
      glyph.metadata.width = item.mapping.advanceWidth;
    }
    fontStream.write(glyph);
  }
  fontStream.end();

  return await svgFontDone;
}

function buildTtfFromSvgFont(svgFontBuffer: Buffer) {
  const svgStr = svgFontBuffer.toString("utf8");
  const ttf = svg2ttf(svgStr, {});
  return Buffer.from(ttf.buffer);
}

function buildWoffFromTtf(ttfBuffer: Buffer) {
  const w = ttf2woff(new Uint8Array(ttfBuffer), {});
  return Buffer.from(w.buffer);
}

async function buildWoff2FromTtf(ttfBuffer: Buffer) {
  // Force native conversion to avoid WASM asset path issues under Turbopack.
  // If native addon isn't available, fail loudly with a clear message.
  try {
    const addon = (bindings as any).default ? (bindings as any).default("addon.node") : (bindings as any)("addon.node");
    const out = addon.convert(ttfBuffer) as Buffer | Uint8Array;
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      [
        "WOFF2 export failed: native encoder unavailable.",
        "This build intentionally disables the WASM fallback to avoid missing `.wasm` file errors under Next/Turbopack.",
        `Native load error: ${msg}`,
      ].join("\n")
    );
  }
}

function buildOtfFromTtf(ttfBuffer: Buffer) {
  const font = Font.create(ttfBuffer, { type: "ttf", subset: null, hinting: true });
  const otf = font.write({ type: "otf" });
  return Buffer.isBuffer(otf) ? otf : Buffer.from(otf);
}

function makeCss(metadata: BuildRequestSpec["metadata"], formats: ExportFormat[]) {
  const family = metadata.familyName || "Font";
  const style = (metadata.styleName || "Regular").toLowerCase().includes("italic") ? "italic" : "normal";
  const weight = 400;

  const src: string[] = [];
  if (formats.includes("woff2")) src.push(`url("./${family}.woff2") format("woff2")`);
  if (formats.includes("woff")) src.push(`url("./${family}.woff") format("woff")`);
  if (formats.includes("ttf")) src.push(`url("./${family}.ttf") format("truetype")`);
  if (formats.includes("otf")) src.push(`url("./${family}.otf") format("opentype")`);

  return `@font-face {
  font-family: ${JSON.stringify(family)};
  src: ${src.join(",\n       ")};
  font-weight: ${weight};
  font-style: ${style};
  font-display: swap;
}

/* Example usage */
.mana-font {
  font-family: ${JSON.stringify(family)}, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

/* Built with Mana Studio */
`;
}

function makeSpecimenHtml(metadata: BuildRequestSpec["metadata"]) {
  const family = metadata.familyName || "Font";
  const title = `${family} – specimen`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="./styles.css" />
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; background: #fff; color: #111; }
      .card { border: 1px solid #e4e4e7; border-radius: 16px; padding: 16px; max-width: 980px; }
      h1 { font-size: 20px; margin: 0 0 12px 0; }
      .preview { font-size: 44px; line-height: 1.2; white-space: pre-wrap; }
      .meta { color: #52525b; font-size: 12px; margin-top: 12px; }
      textarea { width: 100%; min-height: 120px; padding: 12px; border-radius: 12px; border: 1px solid #e4e4e7; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(family)}</h1>
      <textarea id="t">Hamburgefonstiv 123
The quick brown fox jumps over the lazy dog.</textarea>
      <div class="preview mana-font" id="p" style="margin-top: 14px;"></div>
      <div class="meta">Generated by Mana Studio</div>
    </div>
    <script>
      const t = document.getElementById('t');
      const p = document.getElementById('p');
      const sync = () => { p.textContent = t.value; };
      t.addEventListener('input', sync);
      sync();
    </script>
  </body>
</html>
`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function makeReadme(spec: BuildRequestSpec, formats: ExportFormat[]) {
  const family = spec.metadata.familyName || "Font";
  const stamp = spec.metadata.madeWith || "Made with Mana Studio";
  return `# ${family}

Exported by Mana Studio.
${stamp ? `\n${stamp}\n` : ""}

## Files
${formats.map((f) => `- \`${family}.${f}\``).join("\n")}
- \`styles.css\`
- \`specimen.html\`
- \`LICENSE.txt\`

## Web usage

\`\`\`html
<link rel="stylesheet" href="./styles.css" />
<div class="mana-font">Hello</div>
\`\`\`
`;
}

async function buildSingleStylePackage(spec: BuildRequestSpec, uploadedFiles: UploadedSvgFile[]) {
  validateMappings(spec.mappings);

  const svgFont = await buildSvgFont({ metadata: spec.metadata, mappings: spec.mappings, uploadedFiles });
  const ttf = buildTtfFromSvgFont(svgFont);

  const formats = Array.from(new Set(spec.formats));
  const family = spec.metadata.familyName || "Font";
  const out: Record<ExportFormat, Buffer> = {} as any;

  if (formats.includes("ttf")) out.ttf = ttf;
  if (formats.includes("woff")) out.woff = buildWoffFromTtf(ttf);
  if (formats.includes("woff2")) out.woff2 = await buildWoff2FromTtf(ttf);
  if (formats.includes("otf")) {
    try {
      out.otf = buildOtfFromTtf(ttf);
    } catch {
      // OTF is best-effort; we still produce the package.
    }
  }

  const zip = new JSZip();
  const folder = zip.folder(spec.packageName || family.replace(/\s+/g, "-") || "font-package")!;

  for (const f of formats) {
    const buf = out[f];
    if (!buf) continue;
    folder.file(`${family}.${f}`, buf);
  }

  folder.file("LICENSE.txt", generateLicenseText(spec.license));
  folder.file("README.md", makeReadme(spec, formats.filter((f) => out[f])));
  folder.file("styles.css", makeCss(spec.metadata, formats.filter((f) => out[f])));
  folder.file("specimen.html", makeSpecimenHtml(spec.metadata));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { zipBuffer, formats: formats.filter((f) => out[f]), familyName: family };
}

export async function buildFontPackage(spec: BuildRequestSpec, uploadedFiles: UploadedSvgFile[]) {
  // Phase 3 scaffold: duplicate the same glyph set into multiple style names.
  const styleNames = [spec.metadata.styleName, ...(spec.extraStyleNames || [])].map((s) => s.trim()).filter(Boolean);
  if (styleNames.length <= 1) return await buildSingleStylePackage(spec, uploadedFiles);

  const zip = new JSZip();
  const family = spec.metadata.familyName || "Font";
  const root = zip.folder(spec.packageName || family.replace(/\s+/g, "-") || "font-package")!;

  const builtFormats = new Set<ExportFormat>();

  for (const styleName of styleNames) {
    const styleSpec: BuildRequestSpec = {
      ...spec,
      metadata: { ...spec.metadata, styleName },
      extraStyleNames: undefined,
    };
    const { zipBuffer: styleZipBuffer } = await buildSingleStylePackage(styleSpec, uploadedFiles);
    // Extract the generated folder contents by re-zipping: easiest is to rebuild directly into subfolder.
    // Instead of parsing nested zip, just build into subfolder here by calling internal pieces.
    // For now: build fonts and write into a subfolder.

    validateMappings(styleSpec.mappings);
    const svgFont = await buildSvgFont({ metadata: styleSpec.metadata, mappings: styleSpec.mappings, uploadedFiles });
    const ttf = buildTtfFromSvgFont(svgFont);
    const formats = Array.from(new Set(styleSpec.formats));
    const out: Record<ExportFormat, Buffer> = {} as any;
    if (formats.includes("ttf")) out.ttf = ttf;
    if (formats.includes("woff")) out.woff = buildWoffFromTtf(ttf);
    if (formats.includes("woff2")) out.woff2 = await buildWoff2FromTtf(ttf);
    if (formats.includes("otf")) {
      try {
        out.otf = buildOtfFromTtf(ttf);
      } catch {}
    }

    const styleFolder = root.folder(styleName.replace(/[^\w.-]+/g, "_"))!;
    for (const f of formats) {
      const buf = out[f];
      if (!buf) continue;
      builtFormats.add(f);
      styleFolder.file(`${family}.${f}`, buf);
    }
    styleFolder.file("LICENSE.txt", generateLicenseText(styleSpec.license));
    styleFolder.file("README.md", makeReadme(styleSpec, formats.filter((f) => out[f])));
    styleFolder.file("styles.css", makeCss(styleSpec.metadata, formats.filter((f) => out[f])));
    styleFolder.file("specimen.html", makeSpecimenHtml(styleSpec.metadata));
    // avoid unused var warning (kept for future refactor)
    void styleZipBuffer;
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { zipBuffer, formats: Array.from(builtFormats), familyName: family };
}

export async function buildPreviewTtf(spec: BuildRequestSpec, uploadedFiles: UploadedSvgFile[]) {
  const svgFont = await buildSvgFont({ metadata: spec.metadata, mappings: spec.mappings, uploadedFiles });
  const ttf = buildTtfFromSvgFont(svgFont);
  return ttf;
}

