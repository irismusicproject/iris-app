"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/auth-card";
import { applyImportFile, checkImportFile, type ImportCheck } from "./actions";

// Keeps the chosen file between "Check" and "Import" (a form action would
// clear the file box after the first step).
export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportCheck | null>(null);
  const [checkedFile, setCheckedFile] = useState<File | null>(null);
  const [step, setStep] = useState<"check" | "apply" | null>(null);
  const [pending, start] = useTransition();
  const run = (which: "check" | "apply") => {
    if (!file) return;
    setStep(which);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = which === "check" ? await checkImportFile(null, fd) : await applyImportFile(null, fd);
      setResult(r);
      setCheckedFile(which === "check" && r.status === "checked" && r.errors.length === 0 ? file : null);
    });
  };
  const canApply = !!file && checkedFile === file;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Import spreadsheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setCheckedFile(null);
          }}
          className="text-sm file:mr-3 file:rounded-full file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm hover:file:bg-iris-soft"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => run("check")} disabled={pending || !file} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-iris-soft disabled:opacity-60">
            {pending && step === "check" ? "Checking..." : "1. Check the file"}
          </button>
          <button type="button" onClick={() => run("apply")} disabled={pending || !canApply} className={buttonClass}>
            {pending && step === "apply" ? "Importing..." : "2. Import"}
          </button>
          {!canApply && !pending && <span className="text-xs text-muted">Import unlocks once the check finds no problems.</span>}
        </div>
      </div>

      {result && !pending && (
        <div className="flex flex-col gap-3 text-sm">
          {result.message && <p role="alert" className="rounded-lg border border-brand-orange/60 p-3">{result.message}</p>}
          {result.status === "applied" && <p role="status" className="rounded-lg bg-iris-soft p-3">Imported. Nobody was emailed; invite people from People when you&apos;re ready.</p>}
          {result.counts && (
            <p>
              {result.status === "applied" ? "In the file: " : "Found: "}
              {Object.entries(result.counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(" · ")}
            </p>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">Problems to fix ({result.errors.length})</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.errors.map((e, i) => <li key={i}>{e.tab}{e.row ? `, row ${e.row}` : ""}: {e.message}</li>)}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <details>
              <summary className="cursor-pointer text-brand-orange">Things to check later ({result.warnings.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.warnings.map((e, i) => <li key={i}>{e.tab}{e.row ? `, row ${e.row}` : ""}: {e.message}</li>)}
              </ul>
            </details>
          )}
          {result.log && result.log.length > 0 && (
            <details>
              <summary className="cursor-pointer">What was added ({result.log.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{result.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
