# Future AI features (helper layer)

AI features should be **assistive** and **non-blocking**:

- The export pipeline must remain deterministic and fully controllable without AI.
- AI should produce **suggestions + confidence + rationale**, never silent changes.

## Candidate features

- **Mapping suggestions**
  - infer likely Unicode/character from filename + vector shape context
  - confidence scores; highlight ambiguous cases
- **Duplicate/near-duplicate detection**
  - warn when two glyphs are visually similar (possible accidental duplicates)
- **Spacing/metrics suggestions**
  - recommend advance widths from geometry
  - baseline alignment hints
- **Specimen generation**
  - auto-generate specimen layouts for typography + icon sets
- **Brand kit assembly**
  - infer classes/naming conventions for icon CSS
  - generate manifests and usage docs

