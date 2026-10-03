const STEPS = [
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
] as const;

export type OrderStatus = (typeof STEPS)[number]["key"];

export function nextStep(status: string): { to: OrderStatus; label: string } | null {
  switch (status) {
    case "accepted": return { to: "in_progress", label: "Start work" };
    case "in_progress": return { to: "ready", label: "Mark ready" };
    case "ready": return { to: "completed", label: "Mark completed" };
    default: return null;
  }
}

export function StatusStepper({ status }: { status: string }) {
  const current = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={s.key} className="grid gap-1.5" aria-current={state === "current" ? "step" : undefined}>
            <span className={`h-1.5 rounded-full ${state === "todo" ? "bg-line" : "bg-pencil"}`} />
            <span className={`text-xs ${state === "current" ? "font-semibold text-ink" : state === "done" ? "text-pencil" : "text-muted"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
