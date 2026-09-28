import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "./cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/** Consistent form-field label. Always pair with a control via `htmlFor`/`id`
 *  (or wrap the control) so screen readers announce the association. */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none text-secondary", className)}
      {...props}
    />
  );
});
