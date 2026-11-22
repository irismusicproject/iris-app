"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/auth-card";
import { approveWeek, returnWeek } from "../../schedule-actions";

export function ApproveWeekButtons({ residencyId, personId, week, name }: { residencyId: string; personId: string; week: string; name: string }) {
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-full bg-iris px-4 py-1.5 text-sm font-medium text-white hover:bg-iris-strong disabled:opacity-60 dark:text-background"
          onClick={() => start(async () => { const r = await approveWeek(residencyId, personId, week); setMsg(r.status === "error" ? r.message ?? "Something went wrong." : "Approved."); })}
        >
          Approve {name.split(" ")[0]}&apos;s hours
        </button>
        <button type="button" disabled={pending} className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-iris-soft" onClick={() => setSending((s) => !s)}>
          Send back
        </button>
      </div>
      {sending && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => { const r = await returnWeek(residencyId, personId, week, note); setMsg(r.status === "error" ? r.message ?? "Something went wrong." : "Sent back."); setSending(false); });
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What to fix, e.g. “Add Tuesday's set-up time”" className={`${inputClass} min-w-0 flex-1 py-1.5 text-sm`} />
          <button disabled={pending} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-iris-soft">Send</button>
        </form>
      )}
      {msg && <p role="status" className="text-xs text-iris">{msg}</p>}
    </div>
  );
}
