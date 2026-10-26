"use client";
import { useState } from "react";

/** One switch: email on the day a task assigned to this login comes due. */
export function TaskEmailToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function flip() {
    const next = !on;
    setOn(next);
    setState("saving");
    const res = await fetch("/api/account/task-emails", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: next }) }).catch(() => null);
    if (!res?.ok) { setOn(!next); setState("error"); } else setState("idle");
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor="task-emails" className="text-sm">Email me the day a task assigned to me is due</label>
      <button
        id="task-emails"
        type="button"
        role="switch"
        aria-checked={on}
        onClick={flip}
        disabled={state === "saving"}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-violet-600" : "bg-secondary"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
      {state === "error" && <p role="alert" className="text-sm text-red-400">Couldn&apos;t save that. Try again.</p>}
    </div>
  );
}
