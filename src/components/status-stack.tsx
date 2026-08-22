import type { ReactNode } from "react";
import { clsx } from "clsx";

export function StatusStack({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx("status-stack", className)}>{children}</div>;
}
