const LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  pending: "Pending",
  declined: "Declined",
  accepted: "Accepted",
  in_progress: "In progress",
  ready: "Ready",
  completed: "Completed",
};

export function Pill({ status, children }: { status: string; children?: React.ReactNode }) {
  return <span className={`pill pill-${status}`}>{children ?? LABELS[status] ?? status}</span>;
}
