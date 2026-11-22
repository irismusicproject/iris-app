"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import { ConfirmButton } from "@/components/confirm-button";
import { addResourceLink, removeResourceLink } from "./actions";

const small = "rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft disabled:opacity-60";

/** Admins add or remove the links on Home (v0.26). */
export function AddLinkForm() {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addResourceLink(label, url);
          setMsg(r.status === "error" ? r.message ?? "Something went wrong." : null);
          if (r.status !== "error") { setLabel(""); setUrl(""); }
        });
      }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Photos (Google Drive)" aria-label="Link label" className={`${inputClass} py-1.5 text-sm sm:w-64`} />
      <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://…" aria-label="Link address" className={`${inputClass} py-1.5 text-sm sm:w-80`} />
      <button disabled={pending} className={small}>Add link</button>
      {msg && <span role="status" className="text-xs text-red-600">{msg}</span>}
    </form>
  );
}

export function RemoveLinkButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <ConfirmButton
      disabled={pending}
      label="Remove"
      question={`Remove “${label}”?`}
      className="text-xs text-muted underline"
      onConfirm={() => start(async () => { await removeResourceLink(id); })}
    />
  );
}
