"use client";

import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { sendInvite } from "./actions";

/** Sends the sign-in invite to someone added without one (v0.29). */
export function InviteButton({ id, email, invitedAt }: { id: string; email: string; invitedAt: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
      <span>
        {invitedAt
          ? `Invite sent ${new Date(invitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
          : "Not invited yet: they can't sign in until you invite them."}
      </span>
      <ConfirmButton
        disabled={pending}
        className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft"
        label={invitedAt ? "Send the invite again" : "Send invite"}
        question={`Email ${email} a link to set their password?`}
        confirmLabel="Yes, send"
        onConfirm={() =>
          start(async () => {
            const r = await sendInvite(id);
            setMsg(r.message ?? null);
          })
        }
      />
      {msg && <span role="status" className="text-xs text-iris">{msg}</span>}
    </div>
  );
}
