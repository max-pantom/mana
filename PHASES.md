# Mana Studio — build phases

This project is a modern **SVG → Font Studio** (not just a converter). It starts with deterministic filename detection + manual mapping, then expands into a full brand-asset compiler.

## Phase 0 — Foundations (done in codebase)

- Next.js studio app shell
- Folder/file upload (SVG)
- Filename-based character detection
- Manual glyph mapping (per SVG → Unicode)
- Server build pipeline (Node runtime)
- Live preview (TTF)
- Export ZIP package (fonts + LICENSE + README + specimen + CSS)

## Phase 1 — MVP (ship)

**Goal**: reliable “upload → map → preview → export” loop.

- UX polish
  - mapping validation in UI (duplicate codepoints, unmapped count, invalid unicode)
  - batch helpers: assign from string, sequential ranges, bulk clear
- Export formats
  - TTF (required)
  - WOFF + WOFF2 (for web)
  - OTF (best-effort; improve reliability)
- Packaging
  - stable folder naming
  - consistent CSS (`@font-face`) and specimen
- Guardrails
  - SVG subset validation + import warnings
  - deterministic builds (same inputs → same outputs)

## Phase 2 — Font Studio essentials

- Metrics controls
  - em size, ascender/descender, baseline alignment
  - per-glyph scale/offset
- Spacing
  - global advance width defaults
  - per-glyph advance width override
- Quality
  - outline normalization options (rounding, simplify, remove overlaps if available)

## Phase 3 — Pro workflows

- Multi-style families
  - Regular/Bold/Italic/BoldItalic exports
  - shared metadata + per-style mapping
- Versioning & changelog inside package
- Presets (brand kit profiles)
  - “Web kit”, “App kit”, “Icon font kit”

## Phase 4 — Brand asset compiler (the bigger idea)

Designers upload **letters, icons, marks, symbols, patterns** and export a complete brand kit:

- Icon font + CSS classes (and optional ligatures)
- SVG sprite sheet
- JSON manifest (names, codepoints, tags)
- Specimen pages (typography + icons)
- Installable kit folder structure

## Phase 5 — AI helpers (non-blocking)

AI is additive, not required for deterministic builds:

- Suggest character mapping from filename + shape context (confidence scoring)
- Detect duplicates / near-duplicates (visual similarity)
- Spacing suggestions (advance widths) from glyph geometry
- Auto specimen generation (brand-style layouts)

