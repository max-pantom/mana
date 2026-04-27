import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildRequestSpecSchema } from "@/lib/font/specSchema";
import { parseMultipart } from "@/lib/http/parseMultipart";
import { buildPreviewTtf } from "@/lib/font/buildFont";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { fields, files } = await parseMultipart(req);
    const rawSpec = fields.spec;
    if (!rawSpec) return new NextResponse("Missing `spec` field.", { status: 400 });

    const spec = buildRequestSpecSchema.parse(JSON.parse(rawSpec));
    const svgs = files
      .filter((f) => f.fieldname === "svgs")
      .map((f) => ({ filename: f.filename, buffer: f.buffer }));

    const ttf = await buildPreviewTtf(spec, svgs);
    const familyName = spec.metadata.familyName || "Font";
    return new NextResponse(ttf, {
      status: 200,
      headers: {
        "content-type": "font/ttf",
        "content-disposition": `inline; filename="${familyName.replace(/\s+/g, "-")}.ttf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview build failed.";
    return new NextResponse(msg, { status: 400 });
  }
}

