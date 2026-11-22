import { cn } from "cn";
import type { Point } from "@/shared/trace";

function pathData(path: Point[]): string {
  return (
    path
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(4)} ${y.toFixed(4)}`)
      .join("") + "Z"
  );
}

/** A traced design drawn as lines: the outline, then any interior paths. */
export function OutlineThumb({
  outline,
  interior = [],
  className,
  ...props
}: {
  outline: Point[];
  interior?: Point[][];
  className?: string;
  "data-testid"?: string;
}) {
  let w = 0;
  let h = 0;
  for (const [x, y] of outline) {
    w = Math.max(w, x);
    h = Math.max(h, y);
  }
  const pad = 0.04;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      className={cn("text-foreground", className)}
      aria-hidden
      {...props}
    >
      <path
        d={pathData(outline)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {interior.map((path, i) => (
        <path
          key={i}
          d={pathData(path)}
          fill="none"
          className="text-primary"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
