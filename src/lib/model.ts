export type UploadedSvg = {
  id: string;
  file: File;
  filename: string;
  svgText: string;
};

export type DetectedGlyphCandidate =
  | {
      kind: "unicode";
      codepoint: number;
      char: string;
      label: string;
      confidence: "high" | "medium";
      reason: string;
    }
  | {
      kind: "named";
      name: string;
      label: string;
      confidence: "medium" | "low";
      reason: string;
    }
  | {
      kind: "unknown";
      label: string;
      confidence: "low";
      reason: string;
    };

export type GlyphMapping = {
  svgId: string;
  filename: string;
  svgText: string;
  glyphName: string;
  unicode?: number;
  // Phase 2: per-glyph adjustments
  transform?: {
    scale: number; // 1 = unchanged
    dx: number; // px in SVG user units
    dy: number; // px in SVG user units
  };
  advanceWidth?: number; // optional; if set, overrides glyph horiz-adv-x
  // Treat "empty space" as holes by forcing even-odd fill rule.
  // This is a common requirement for reliable cutouts in SVG -> font conversion.
  evenOddFill?: boolean;
};

export type FontMetadata = {
  familyName: string;
  styleName: string;
  version: string;
  vendor?: string;
  vendorUrl?: string;
  description?: string;
  copyright?: string;
  trademark?: string;
  // Phase 2: font-wide metrics
  metrics?: {
    em: number; // fontHeight
    descent: number;
    fixedWidth?: boolean;
    preserveAspectRatio?: boolean;
  };
  // "Made with" stamp (package + optional font name metadata)
  madeWith?: string;
};

export type LicenseSpec =
  | {
      template: "OFL-1.1";
      copyrightHolder: string;
      year: string;
      reservedFontName?: string;
    }
  | {
      template: "MIT";
      copyrightHolder: string;
      year: string;
    }
  | {
      template: "PROPRIETARY";
      copyrightHolder: string;
      year: string;
      terms: string;
    };

export type ExportFormat = "ttf" | "otf" | "woff" | "woff2";

export type BuildRequestSpec = {
  metadata: FontMetadata;
  mappings: GlyphMapping[];
  license: LicenseSpec;
  formats: ExportFormat[];
  packageName?: string;
  // Phase 3: scaffolding for multi-style export (same glyph set duplicated into multiple styles)
  extraStyleNames?: string[];
};

export type BuildResponseInfo = {
  ok: true;
  formats: ExportFormat[];
  filename: string;
};

export type BuildErrorInfo = {
  ok: false;
  message: string;
  details?: string;
};

