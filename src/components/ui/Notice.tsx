import type { ReactNode, SVGProps } from "react";
import { cn } from "./cn";

export type NoticeTone = "info" | "success" | "warning" | "danger";

export interface NoticeProps {
  /** @default "info" */
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Set to `false` to omit the leading icon. @default true */
  icon?: boolean;
}

/**
 * Quiet inline informational callout — e.g. "1,847 points hidden — a log
 * axis can't show non-positive values." Deliberately understated: even
 * `tone="warning"`/`"danger"` use a muted tint (never a solid alarm-colored
 * surface), because the token contract (`theme.css`) reserves `--color-danger`
 * / `--color-success` for small inline use, not large alert surfaces.
 *
 * There is no dedicated "warning" token in the design system, so `warning`
 * intentionally reuses `--color-danger` at lower emphasis than `danger`
 * (smaller icon/border tint, body text stays `text-primary` instead of
 * danger-colored) rather than inventing an unvalidated new hue.
 *
 * Uses `role="status"`/`aria-live="polite"` for non-danger tones (announced
 * without interrupting) and `role="alert"` for `danger` (announced
 * immediately), per the ARIA live-region conventions.
 */
export function Notice({ tone = "info", title, children, className, icon = true }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon ? (
        <Icon
          className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TONE_CLASSES[tone])}
          aria-hidden="true"
        />
      ) : null}
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-medium text-primary">{title}</p> : null}
        <div className="text-secondary">{children}</div>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  info: "border-accent/30 bg-accent/8",
  success: "border-success/30 bg-success/8",
  warning: "border-danger/25 bg-danger/6",
  danger: "border-danger/40 bg-danger/10",
};

const ICON_TONE_CLASSES: Record<NoticeTone, string> = {
  info: "text-accent",
  success: "text-success",
  warning: "text-danger/80",
  danger: "text-danger",
};

const ICONS: Record<NoticeTone, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  info: InfoIcon,
  success: CheckIcon,
  warning: WarningIcon,
  danger: WarningIcon,
};

function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 5-5" />
    </svg>
  );
}

function WarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 9v4M12 16.5h.01" />
      <path d="M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" />
    </svg>
  );
}
