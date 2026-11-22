"use client";

import { useState } from "react";

// A button that asks "Are you sure?" in the page instead of a pop-up dialog.
// Pop-ups (window.confirm) don't show in some in-app browsers and are clumsy
// on phones, so the first click shows the question with Yes / Cancel.
export function ConfirmButton({
  label,
  question,
  confirmLabel = "Yes",
  onConfirm,
  disabled,
  className,
  ariaLabel,
}: {
  label: React.ReactNode;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" disabled={disabled} className={className} aria-label={ariaLabel} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span role="group" aria-label={question} className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-brand-orange/60 bg-surface px-2 py-1 text-sm">
      <span>{question}</span>
      <button
        type="button"
        disabled={disabled}
        className="rounded-full bg-iris px-3 py-1 text-xs font-medium text-white hover:bg-iris-strong disabled:opacity-60 dark:text-background"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="rounded-full border border-border px-3 py-1 text-xs hover:bg-iris-soft" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}
