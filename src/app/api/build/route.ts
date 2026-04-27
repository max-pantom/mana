import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildRequestSpecSchema } from "@/lib/font/specSchema";
import { parseMultipart } from "@/lib/http/parseMultipart";
import { buildFontPackage } from "@/lib/font/buildFont";

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

    const { zipBuffer, formats, familyName } = await buildFontPackage(spec, svgs);
    const filename = `${(spec.packageName || familyName).replace(/\s+/g, "-")}.zip`;

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-mana-formats": formats.join(","),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Build failed.";
    return new NextResponse(msg, { status: 400 });
  }
}

