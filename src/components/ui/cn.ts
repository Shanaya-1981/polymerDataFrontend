import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose conditional class names and resolve conflicting Tailwind utilities
 * (last one wins), e.g. `cn("h-full", condition && "h-24")` correctly drops
 * `h-full` rather than emitting both. Use this instead of template-string
 * concatenation anywhere a component accepts a `className` override.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
