"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { clsx } from "clsx";

type ActionTone = "default" | "danger";

function ActionTooltip({
  label,
  position
}: {
  label: string;
  position?: TooltipPosition;
}) {
  if (!position) return null;
  return createPortal(
    <span
      role="tooltip"
      className="table-action-tooltip"
      data-placement={position.placement}
      style={{ left: position.left, top: position.top }}
    >
      {label}
    </span>,
    document.body
  );
}

type TooltipPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom";
};

function getTooltipPosition(element: HTMLElement): TooltipPosition {
  const rect = element.getBoundingClientRect();
  const placement = rect.top >= 48 ? "top" : "bottom";
  return {
    left: rect.left + rect.width / 2,
    top: placement === "top" ? rect.top - 8 : rect.bottom + 8,
    placement
  };
}

export function TableActionGroup({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx("table-action-group", className)}>{children}</div>;
}

export function TableActionLink({
  href,
  label,
  children,
  tone = "default",
  className,
  target,
  download
}: {
  href: string;
  label: string;
  children: ReactNode;
  tone?: ActionTone;
  className?: string;
  target?: string;
  download?: string | boolean;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>();
  return (
    <Link
      href={href}
      aria-label={label}
      className={clsx("table-action-button", tone === "danger" && "table-action-button-danger", className)}
      target={target}
      download={download}
      onMouseEnter={(event) => setTooltipPosition(getTooltipPosition(event.currentTarget))}
      onMouseLeave={() => setTooltipPosition(undefined)}
      onFocus={(event) => setTooltipPosition(getTooltipPosition(event.currentTarget))}
      onBlur={() => setTooltipPosition(undefined)}
    >
      {children}
      <ActionTooltip label={label} position={tooltipPosition} />
    </Link>
  );
}

export function TableActionButton({
  label,
  children,
  tone = "default",
  className,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> & {
  label: string;
  children: ReactNode;
  tone?: ActionTone;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>();
  const { onBlur, onFocus, onMouseEnter, onMouseLeave, ...buttonProps } = props;
  return (
    <button
      {...buttonProps}
      type={type}
      aria-label={label}
      className={clsx("table-action-button", tone === "danger" && "table-action-button-danger", className)}
      onMouseEnter={(event) => {
        setTooltipPosition(getTooltipPosition(event.currentTarget));
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setTooltipPosition(undefined);
        onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setTooltipPosition(getTooltipPosition(event.currentTarget));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setTooltipPosition(undefined);
        onBlur?.(event);
      }}
    >
      {children}
      <ActionTooltip label={label} position={tooltipPosition} />
    </button>
  );
}

export function TableDetailsAction({
  label,
  icon,
  children
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>();
  return (
    <details className="table-details-action">
      <summary
        aria-label={label}
        className="table-action-button"
        onMouseEnter={(event) => setTooltipPosition(getTooltipPosition(event.currentTarget))}
        onMouseLeave={() => setTooltipPosition(undefined)}
        onFocus={(event) => setTooltipPosition(getTooltipPosition(event.currentTarget))}
        onBlur={() => setTooltipPosition(undefined)}
      >
        {icon}
        <ActionTooltip label={label} position={tooltipPosition} />
      </summary>
      <div className="table-details-action-panel">{children}</div>
    </details>
  );
}

export function TableOverflowMenu({
  children,
  label = "More actions"
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const menuWidth = 224;
    setPosition({
      left: Math.min(Math.max(8, trigger.right - menuWidth), window.innerWidth - menuWidth - 8),
      top: trigger.bottom + 6
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current || !triggerRef.current) return;
    const panel = panelRef.current.getBoundingClientRect();
    const trigger = triggerRef.current.getBoundingClientRect();
    if (panel.bottom > window.innerHeight - 8) {
      setPosition((current) => ({ ...current, top: Math.max(8, trigger.top - panel.height - 6) }));
    }
  }, [open, position.left]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    function closeOnViewportChange() {
      setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="table-action-button"
        onClick={() => {
          setTooltipPosition(undefined);
          setOpen((current) => !current);
        }}
        onMouseEnter={(event) => setTooltipPosition(getTooltipPosition(event.currentTarget))}
        onMouseLeave={() => setTooltipPosition(undefined)}
        onFocus={(event) => setTooltipPosition(getTooltipPosition(event.currentTarget))}
        onBlur={() => setTooltipPosition(undefined)}
      >
        <MoreHorizontal aria-hidden="true" />
        <ActionTooltip label={label} position={open ? undefined : tooltipPosition} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            className="table-action-menu"
            style={position}
            onClick={(event) => {
              if ((event.target as Element).closest("a,button")) setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

export function TableMenuLink({
  href,
  label,
  children,
  tone = "default"
}: {
  href: string;
  label: string;
  children: ReactNode;
  tone?: ActionTone;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={clsx("table-action-menu-item", tone === "danger" && "table-action-menu-item-danger")}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}
