import type { ReactNode } from "react";

export function RestrictedAction({
  message,
  children,
  className = ""
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`group/restriction relative inline-flex cursor-not-allowed ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg group-hover/restriction:block"
      >
        {message}
      </span>
    </span>
  );
}
