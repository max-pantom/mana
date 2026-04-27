import { z } from "zod";

export const exportFormatSchema = z.enum(["ttf", "otf", "woff", "woff2"]);

export const glyphMappingSchema = z.object({
  svgId: z.string().optional(),
  filename: z.string(),
  svgText: z.string().optional(),
  glyphName: z.string().min(1),
  unicode: z.number().int().min(0).max(0x10ffff).optional(),
  transform: z
    .object({
      scale: z.number(),
      dx: z.number(),
      dy: z.number(),
    })
    .optional(),
  advanceWidth: z.number().int().positive().optional(),
  evenOddFill: z.boolean().optional(),
});

export const metadataSchema = z.object({
  familyName: z.string().min(1),
  styleName: z.string().min(1),
  version: z.string().min(1),
  vendor: z.string().optional(),
  vendorUrl: z.string().optional(),
  description: z.string().optional(),
  copyright: z.string().optional(),
  trademark: z.string().optional(),
  metrics: z
    .object({
      em: z.number().int().min(256).max(8192),
      descent: z.number().int().min(0).max(4096),
      fixedWidth: z.boolean().optional(),
      preserveAspectRatio: z.boolean().optional(),
    })
    .optional(),
  madeWith: z.string().optional(),
});

export const licenseSchema = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("OFL-1.1"),
    copyrightHolder: z.string().min(1),
    year: z.string().min(1),
    reservedFontName: z.string().optional(),
  }),
  z.object({
    template: z.literal("MIT"),
    copyrightHolder: z.string().min(1),
    year: z.string().min(1),
  }),
  z.object({
    template: z.literal("PROPRIETARY"),
    copyrightHolder: z.string().min(1),
    year: z.string().min(1),
    terms: z.string().min(1),
  }),
]);

export const buildRequestSpecSchema = z.object({
  metadata: metadataSchema,
  mappings: z.array(glyphMappingSchema),
  license: licenseSchema,
  formats: z.array(exportFormatSchema).min(1),
  packageName: z.string().optional(),
  extraStyleNames: z.array(z.string().min(1)).optional(),
});

export type BuildRequestSpecInput = z.infer<typeof buildRequestSpecSchema>;

