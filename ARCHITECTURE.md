# Mana Studio — technical architecture

## Product framing

Mana Studio is a **modern SVG-to-font studio**: deterministic builds first (filename detection + manual mapping), with room to expand into a brand asset compiler.

## System overview

- **Frontend (Next.js App Router)**: studio UI (upload → mapping → metadata → license → preview → export)
- **Backend (Next.js Route Handlers, Node runtime)**: font build pipeline and ZIP packaging

## Data model

- **SVG asset**: original uploaded file + text (for UI preview)
- **Glyph mapping**: `filename + glyphName + unicode` (unicode optional until mapped)
- **Build spec**: metadata + license + desired formats + mappings

## Build pipeline (server)

1. **Parse request** (multipart/form-data)
   - `spec` field (JSON)
   - `svgs` files (one per uploaded SVG)
2. **Validate**
   - at least one mapped glyph
   - unicode is valid and unique
3. **SVG → SVGFont**
   - `svgicons2svgfont` stream
   - glyph metadata: `{ unicode: [char], name }`
4. **SVGFont → TTF**
   - `svg2ttf`
5. **TTF → WOFF/WOFF2**
   - `ttf2woff`
   - `ttf2woff2`
6. **TTF → OTF** (best-effort)
   - `fonteditor-core`
7. **Package ZIP**
   - font files
   - `LICENSE.txt` (generated)
   - `README.md`
   - `styles.css` (`@font-face`)
   - `specimen.html`

## Preview pipeline (frontend + server)

- Frontend calls `/api/font` to build a preview **TTF**.
- Frontend injects `@font-face` using an object URL and renders live preview text.

## Determinism rules (MVP)

- No AI in the critical path
- Same `spec + svgs` should produce identical outputs (within tool determinism)
- All non-deterministic helpers (future AI) must remain optional and overridable

## Security / limits (recommended next)

- Enforce SVG count + size limits
- Reject SVGs with unsupported features if they break conversion
- Strip/ignore external references

