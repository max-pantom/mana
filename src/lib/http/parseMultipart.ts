import Busboy from "busboy";
import type { NextRequest } from "next/server";

export type MultipartFile = {
  fieldname: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export async function parseMultipart(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data");
  }

  const bb = Busboy({ headers: { "content-type": contentType } });
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];

  const done = new Promise<{ fields: Record<string, string>; files: MultipartFile[] }>((resolve, reject) => {
    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (name, file, info) => {
      const chunks: Buffer[] = [];
      file.on("data", (d: Buffer) => chunks.push(d));
      file.on("limit", () => reject(new Error(`File too large: ${info.filename}`)));
      file.on("end", () => {
        files.push({
          fieldname: name,
          filename: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        });
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, files }));
  });

  const arrayBuffer = await req.arrayBuffer();
  bb.end(Buffer.from(arrayBuffer));

  return await done;
}

