"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordInput({ className }: { className: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative mt-1 block">
      <input
        name="password"
        type={visible ? "text" : "password"}
        required
        autoComplete="current-password"
        className={`${className} pr-11`}
        placeholder="Enter password"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-brand"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Eye aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
    </span>
  );
}
