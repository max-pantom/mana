"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildRequestSpec, ExportFormat, GlyphMapping, LicenseSpec, UploadedSvg } from "@/lib/model";
import { detectGlyphFromFilename, defaultGlyphNameForFilename } from "@/lib/glyph/filenameDetect";
import { makeId } from "@/lib/util/id";

type StepId = "upload" | "map" | "metadata" | "license" | "preview" | "export";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

async function readFileAsText(file: File) {
  return await file.text();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function Studio() {
  const [step, setStep] = useState<StepId>("upload");
  const [svgs, setSvgs] = useState<UploadedSvg[]>([]);
  const [mappings, setMappings] = useState<GlyphMapping[]>([]);

  const [familyName, setFamilyName] = useState("My Font");
  const [styleName, setStyleName] = useState("Regular");
  const [version, setVersion] = useState("1.0");
  const [vendor, setVendor] = useState("");
  const [vendorUrl, setVendorUrl] = useState("");
  const [description, setDescription] = useState("");
  const [madeWith, setMadeWith] = useState("Made with Mana Studio");

  // Phase 2: font-wide metrics
  const [em, setEm] = useState(1000);
  const [descent, setDescent] = useState(0);
  const [fixedWidth, setFixedWidth] = useState(false);
  const [preserveAspectRatio, setPreserveAspectRatio] = useState(true);

  // Phase 3: extra style names
  const [extraStyles, setExtraStyles] = useState<string>(""); // comma-separated

  const [licenseTemplate, setLicenseTemplate] = useState<LicenseSpec["template"]>("OFL-1.1");
  const [licenseHolder, setLicenseHolder] = useState("Your Name / Studio");
  const [licenseYear, setLicenseYear] = useState(`${new Date().getFullYear()}`);
  const [reservedFontName, setReservedFontName] = useState("");
  const [proprietaryTerms, setProprietaryTerms] = useState("All rights reserved.");

  const [previewText, setPreviewText] = useState("Hamburgefonstiv 123\nThe quick brown fox jumps over the lazy dog.");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewFontFamily = useMemo(() => `__preview_${familyName.replace(/\s+/g, "_")}_${styleName.replace(/\s+/g, "_")}`, [familyName, styleName]);

  const [busy, setBusy] = useState<null | { title: string; message?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasSvgs = svgs.length > 0;
  const hasMappings = mappings.some((m) => typeof m.unicode === "number");

  function buildLicenseSpec(): LicenseSpec {
    if (licenseTemplate === "MIT") return { template: "MIT", copyrightHolder: licenseHolder, year: licenseYear };
    if (licenseTemplate === "PROPRIETARY")
      return { template: "PROPRIETARY", copyrightHolder: licenseHolder, year: licenseYear, terms: proprietaryTerms };
    return {
      template: "OFL-1.1",
      copyrightHolder: licenseHolder,
      year: licenseYear,
      reservedFontName: reservedFontName.trim() || undefined,
    };
  }

  const buildSpec: BuildRequestSpec = useMemo(
    () => ({
      metadata: {
        familyName,
        styleName,
        version,
        vendor: vendor.trim() || undefined,
        vendorUrl: vendorUrl.trim() || undefined,
        description: description.trim() || undefined,
        madeWith: madeWith.trim() || undefined,
        metrics: {
          em,
          descent,
          fixedWidth,
          preserveAspectRatio,
        },
      },
      mappings,
      license: buildLicenseSpec(),
      formats: ["ttf", "woff", "woff2", "otf"],
      packageName: familyName.trim() ? familyName.trim().replace(/\s+/g, "-") : undefined,
      extraStyleNames: extraStyles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      familyName,
      styleName,
      version,
      vendor,
      vendorUrl,
      description,
      madeWith,
      em,
      descent,
      fixedWidth,
      preserveAspectRatio,
      extraStyles,
      mappings,
      licenseTemplate,
      licenseHolder,
      licenseYear,
      reservedFontName,
      proprietaryTerms,
    ]
  );

  async function onPickFiles(files: FileList | File[]) {
    setError(null);
    const arr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".svg"));
    if (!arr.length) {
      setError("No .svg files found. Please choose one or more SVG files.");
      return;
    }
    setBusy({ title: "Importing SVGs", message: "Reading files and preparing previews…" });
    try {
      const imported: UploadedSvg[] = [];
      for (const file of arr) {
        const svgText = await readFileAsText(file);
        imported.push({
          id: makeId("svg"),
          file,
          filename: file.webkitRelativePath?.length ? file.webkitRelativePath : file.name,
          svgText,
        });
      }
      setSvgs(imported);
      const nextMappings: GlyphMapping[] = imported.map((s) => {
        const detected = detectGlyphFromFilename(s.file.name);
        const unicode = detected.kind === "unicode" ? detected.codepoint : undefined;
        return {
          svgId: s.id,
          filename: s.file.name,
          svgText: s.svgText,
          glyphName: defaultGlyphNameForFilename(s.file.name),
          unicode,
          transform: { scale: 1, dx: 0, dy: 0 },
        };
      });
      setMappings(nextMappings);
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read SVG files.");
    } finally {
      setBusy(null);
    }
  }

  async function buildPreview() {
    setError(null);
    setBusy({ title: "Building preview font", message: "Generating a temporary TTF…" });
    try {
      const form = new FormData();
      form.set("spec", JSON.stringify({ ...buildSpec, formats: ["ttf"] satisfies ExportFormat[] }));
      svgs.forEach((s) => form.append("svgs", s.file, s.file.name));

      const res = await fetch("/api/font", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build preview.");
    } finally {
      setBusy(null);
    }
  }

  async function exportZip() {
    setError(null);
    setBusy({ title: "Exporting package", message: "Building fonts and packaging ZIP…" });
    try {
      const form = new FormData();
      form.set("spec", JSON.stringify(buildSpec));
      svgs.forEach((s) => form.append("svgs", s.file, s.file.name));

      const res = await fetch("/api/build", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      downloadBlob(blob, `${buildSpec.packageName ?? "font-package"}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!previewUrl) return;
    const style = document.createElement("style");
    style.dataset.previewFont = "1";
    style.textContent = `
@font-face {
  font-family: ${JSON.stringify(previewFontFamily)};
  src: url(${JSON.stringify(previewUrl)}) format("truetype");
  font-weight: 400;
  font-style: normal;
}
`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [previewUrl, previewFontFamily]);

  const steps: Array<{ id: StepId; label: string; enabled: boolean }> = [
    { id: "upload", label: "Upload SVGs", enabled: true },
    { id: "map", label: "Map characters", enabled: hasSvgs },
    { id: "metadata", label: "Font metadata", enabled: hasSvgs },
    { id: "license", label: "License", enabled: hasSvgs },
    { id: "preview", label: "Live preview", enabled: hasSvgs && hasMappings },
    { id: "export", label: "Export package", enabled: hasSvgs && hasMappings },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Mana Studio</h1>
              <p className="text-sm text-zinc-600">Modern SVG-to-font studio: upload, map, preview, export.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-100"
                onClick={() => {
                  setSvgs([]);
                  setMappings([]);
                  setPreviewUrl((old) => {
                    if (old) URL.revokeObjectURL(old);
                    return null;
                  });
                  setStep("upload");
                  setError(null);
                }}
              >
                Reset
              </button>
              <button
                className={cx(
                  "rounded-md px-3 py-2 text-sm font-medium",
                  hasSvgs && hasMappings ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                )}
                disabled={!hasSvgs || !hasMappings}
                onClick={exportZip}
              >
                Export ZIP
              </button>
            </div>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium text-zinc-500">Workflow</div>
            <div className="mt-2 flex flex-col gap-1">
              {steps.map((s) => (
                <button
                  key={s.id}
                  className={cx(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                    step === s.id ? "bg-zinc-100" : "hover:bg-zinc-50",
                    !s.enabled && "opacity-40 cursor-not-allowed"
                  )}
                  disabled={!s.enabled}
                  onClick={() => setStep(s.id)}
                >
                  <span>{s.label}</span>
                  <span className="text-xs text-zinc-500">{s.id === "map" ? `${mappings.filter((m) => m.unicode != null).length}/${mappings.length}` : ""}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
              <div className="font-medium text-zinc-700">MVP principle</div>
              <div className="mt-1">
                Filename detection + manual mapping first. AI helpers can come later, but the baseline export loop should always be deterministic.
              </div>
            </div>
          </aside>

          <main className="rounded-xl border border-zinc-200 bg-white p-5">
            {busy ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-2">
                <div className="text-sm font-medium">{busy.title}</div>
                {busy.message ? <div className="text-sm text-zinc-600">{busy.message}</div> : null}
                <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-900" />
                </div>
              </div>
            ) : (
              <>
                {error ? (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
                ) : null}

                {step === "upload" ? (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold">Upload SVGs</h2>
                      <p className="mt-1 text-sm text-zinc-600">Upload a folder of SVGs. We’ll auto-detect characters from filenames, then you can adjust mapping.</p>
                    </div>

                    <div
                      className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files?.length) onPickFiles(e.dataTransfer.files);
                      }}
                    >
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="text-sm font-medium">Drag & drop SVG files (or a folder)</div>
                        <div className="text-xs text-zinc-600">Tip: Chrome/Edge supports folder pick via “Choose folder”.</div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            Choose files / folder
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".svg"
                            // @ts-expect-error - nonstandard, supported by Chromium
                            webkitdirectory=""
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files) onPickFiles(e.target.files);
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {hasSvgs ? (
                      <div className="rounded-lg border border-zinc-200">
                        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                          <div className="text-sm font-medium">{svgs.length} SVGs imported</div>
                          <button className="text-sm font-medium text-zinc-900 hover:underline" onClick={() => setStep("map")}>
                            Next: mapping →
                          </button>
                        </div>
                        <div className="max-h-56 overflow-auto p-2 text-sm">
                          {svgs.slice(0, 200).map((s) => (
                            <div key={s.id} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-zinc-50">
                              <div className="truncate">{s.filename}</div>
                              <div className="text-xs text-zinc-500">{Math.round(s.file.size / 1024)} KB</div>
                            </div>
                          ))}
                          {svgs.length > 200 ? <div className="px-2 py-1 text-xs text-zinc-500">…and {svgs.length - 200} more</div> : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {step === "map" ? (
                  <section className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold">Map characters</h2>
                        <p className="mt-1 text-sm text-zinc-600">We auto-detect from filenames; override anything manually. Duplicate codepoints are flagged during export.</p>
                      </div>
                      <button
                        className={cx(
                          "rounded-md px-3 py-2 text-sm font-medium",
                          hasSvgs && hasMappings ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                        )}
                        disabled={!hasSvgs || !hasMappings}
                        onClick={buildPreview}
                      >
                        Build preview
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-zinc-200">
                      <div className="grid grid-cols-[1fr_170px_170px_220px] gap-0 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600">
                        <div>Filename</div>
                        <div>Glyph name</div>
                        <div>Character (Unicode)</div>
                        <div>Adjust (scale / dx / dy)</div>
                      </div>
                      <div className="max-h-[520px] overflow-auto">
                        {mappings.map((m, idx) => {
                          const detected = detectGlyphFromFilename(m.filename);
                          const suggestion = detected.kind === "unicode" ? `${detected.char} (U+${detected.codepoint.toString(16).toUpperCase().padStart(4, "0")})` : detected.label;
                          return (
                            <div key={m.svgId} className={cx("grid grid-cols-[1fr_170px_170px_220px] gap-0 px-3 py-2", idx % 2 ? "bg-white" : "bg-zinc-50/30")}>
                              <div className="pr-3">
                                <div className="truncate text-sm">{m.filename}</div>
                                <div className="truncate text-xs text-zinc-500">Detected: {suggestion}</div>
                              </div>
                              <div className="pr-3">
                                <input
                                  className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                  value={m.glyphName}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setMappings((old) => old.map((x) => (x.svgId === m.svgId ? { ...x, glyphName: v } : x)));
                                  }}
                                />
                              </div>
                              <div>
                                <input
                                  className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                  placeholder='e.g. "A" or "U+0041"'
                                  value={
                                    typeof m.unicode === "number"
                                      ? String.fromCodePoint(m.unicode)
                                      : ""
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const nextUnicode =
                                      raw.length === 0
                                        ? undefined
                                        : raw.startsWith("U+")
                                          ? parseInt(raw.slice(2), 16)
                                          : raw.codePointAt(0) ?? undefined;
                                    setMappings((old) => old.map((x) => (x.svgId === m.svgId ? { ...x, unicode: Number.isFinite(nextUnicode as number) ? (nextUnicode as number) : undefined } : x)));
                                  }}
                                />
                                <div className="mt-1 text-[11px] text-zinc-500">
                                  {typeof m.unicode === "number" ? `U+${m.unicode.toString(16).toUpperCase().padStart(4, "0")}` : "Unmapped"}
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <div className="flex flex-col gap-1">
                                  <input
                                    className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                    type="number"
                                    step="0.05"
                                    value={m.transform?.scale ?? 1}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value || "1");
                                      setMappings((old) =>
                                        old.map((x) =>
                                          x.svgId === m.svgId ? { ...x, transform: { scale: v, dx: x.transform?.dx ?? 0, dy: x.transform?.dy ?? 0 } } : x
                                        )
                                      );
                                    }}
                                  />
                                  <div className="text-[11px] text-zinc-500">scale</div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <input
                                    className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                    type="number"
                                    step="1"
                                    value={m.transform?.dx ?? 0}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value || "0");
                                      setMappings((old) =>
                                        old.map((x) =>
                                          x.svgId === m.svgId ? { ...x, transform: { scale: x.transform?.scale ?? 1, dx: v, dy: x.transform?.dy ?? 0 } } : x
                                        )
                                      );
                                    }}
                                  />
                                  <div className="text-[11px] text-zinc-500">dx</div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <input
                                    className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                    type="number"
                                    step="1"
                                    value={m.transform?.dy ?? 0}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value || "0");
                                      setMappings((old) =>
                                        old.map((x) =>
                                          x.svgId === m.svgId ? { ...x, transform: { scale: x.transform?.scale ?? 1, dx: x.transform?.dx ?? 0, dy: v } } : x
                                        )
                                      );
                                    }}
                                  />
                                  <div className="text-[11px] text-zinc-500">dy</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                ) : null}

                {step === "metadata" ? (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold">Font metadata</h2>
                      <p className="mt-1 text-sm text-zinc-600">Used in packaging and build defaults (Phase 2 metrics).</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Family name">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
                      </Field>
                      <Field label="Style name">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={styleName} onChange={(e) => setStyleName(e.target.value)} />
                      </Field>
                      <Field label="Version">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={version} onChange={(e) => setVersion(e.target.value)} />
                      </Field>
                      <Field label="Vendor (optional)">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={vendor} onChange={(e) => setVendor(e.target.value)} />
                      </Field>
                      <Field label="Vendor URL (optional)">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={vendorUrl} onChange={(e) => setVendorUrl(e.target.value)} />
                      </Field>
                      <Field label="Description (optional)">
                        <textarea className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                      </Field>
                      <Field label="Made with stamp (packaging)">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={madeWith} onChange={(e) => setMadeWith(e.target.value)} />
                      </Field>
                    </div>

                    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-medium">Phase 2 — Metrics</div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Em size (font height)">
                          <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" type="number" value={em} onChange={(e) => setEm(parseInt(e.target.value || "1000", 10))} />
                        </Field>
                        <Field label="Descent">
                          <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" type="number" value={descent} onChange={(e) => setDescent(parseInt(e.target.value || "0", 10))} />
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={fixedWidth} onChange={(e) => setFixedWidth(e.target.checked)} />
                          Fixed width (monospace-ish)
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={preserveAspectRatio} onChange={(e) => setPreserveAspectRatio(e.target.checked)} />
                          Preserve aspect ratio
                        </label>
                      </div>
                      <div className="mt-2 text-xs text-zinc-600">These settings affect scaling/baseline when converting SVGs into glyphs.</div>
                    </div>
                  </section>
                ) : null}

                {step === "license" ? (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold">License generator</h2>
                      <p className="mt-1 text-sm text-zinc-600">Choose a template; we’ll include `LICENSE.txt` in the ZIP package.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Template">
                        <select className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={licenseTemplate} onChange={(e) => setLicenseTemplate(e.target.value as LicenseSpec["template"])}>
                          <option value="OFL-1.1">SIL Open Font License (OFL 1.1)</option>
                          <option value="MIT">MIT</option>
                          <option value="PROPRIETARY">Proprietary / Custom</option>
                        </select>
                      </Field>
                      <Field label="Copyright holder">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={licenseHolder} onChange={(e) => setLicenseHolder(e.target.value)} />
                      </Field>
                      <Field label="Year">
                        <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={licenseYear} onChange={(e) => setLicenseYear(e.target.value)} />
                      </Field>
                      {licenseTemplate === "OFL-1.1" ? (
                        <Field label="Reserved Font Name (optional)">
                          <input className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" value={reservedFontName} onChange={(e) => setReservedFontName(e.target.value)} />
                        </Field>
                      ) : null}
                      {licenseTemplate === "PROPRIETARY" ? (
                        <Field label="Custom terms">
                          <textarea className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" rows={6} value={proprietaryTerms} onChange={(e) => setProprietaryTerms(e.target.value)} />
                        </Field>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {step === "preview" ? (
                  <section className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold">Live font preview</h2>
                        <p className="mt-1 text-sm text-zinc-600">This preview uses a generated TTF loaded into the browser.</p>
                      </div>
                      <button className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-100" onClick={buildPreview}>
                        Rebuild
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Preview text">
                        <textarea className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm" rows={6} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
                      </Field>
                      <Field label="Render">
                        <div className="rounded-md border border-zinc-200 bg-white p-3">
                          <div className="text-xs text-zinc-500">Font: {familyName} / {styleName}</div>
                          <div className="mt-3 whitespace-pre-wrap text-2xl leading-10" style={{ fontFamily: previewUrl ? previewFontFamily : "inherit" }}>
                            {previewText}
                          </div>
                        </div>
                      </Field>
                    </div>
                  </section>
                ) : null}

                {step === "export" ? (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold">Export package</h2>
                      <p className="mt-1 text-sm text-zinc-600">Exports fonts and a ready-to-ship ZIP: license, readme, specimen page, and CSS.</p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 p-3">
                      <div className="text-sm font-medium">Phase 3 — Multi-style export (scaffold)</div>
                      <div className="mt-1 text-sm text-zinc-600">Comma-separated style names. This duplicates the same glyph set into multiple style folders in the ZIP.</div>
                      <input
                        className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-2 text-sm"
                        placeholder="e.g. Regular, Bold, Italic"
                        value={extraStyles}
                        onChange={(e) => setExtraStyles(e.target.value)}
                      />
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                      <div className="font-medium">What you’ll get</div>
                      <ul className="mt-2 list-disc pl-5 text-zinc-700">
                        <li>Font files: TTF / WOFF / WOFF2 (OTF best-effort)</li>
                        <li>ZIP packaging: `LICENSE.txt`, `README.md`, `specimen.html`, `styles.css`</li>
                      </ul>
                    </div>

                    <button
                      className={cx(
                        "rounded-md px-3 py-2 text-sm font-medium",
                        hasSvgs && hasMappings ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                      )}
                      disabled={!hasSvgs || !hasMappings}
                      onClick={exportZip}
                    >
                      Export ZIP package
                    </button>
                  </section>
                ) : null}
              </>
            )}
          </main>
        </div>

        <footer className="mt-10 text-xs text-zinc-500">
          Built as a studio-first workflow: deterministic filename detection + manual mapping, with future room for AI helpers.
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      {children}
    </label>
  );
}

