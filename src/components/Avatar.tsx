function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-xl" } as const;

/** Initials in the role colour. Decorative: the name next to it carries the meaning. */
export function Avatar({ name, role, size = "sm" }: { name: string; role: "customer" | "tailor"; size?: keyof typeof SIZES }) {
  return (
    <span className={`avatar avatar-${role} ${SIZES[size]}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
