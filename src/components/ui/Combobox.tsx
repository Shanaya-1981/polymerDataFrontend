import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { useState } from "react";
import { cn } from "./cn";
import { CheckIcon, ChevronDownIcon } from "./icons";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional secondary text shown right-aligned in the list (e.g. a count). */
  hint?: string;
}

export interface ComboboxProps {
  options: readonly ComboboxOption[];
  /** `null` renders the placeholder — there is no forced default selection. */
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Searchable single-select. Backs the axis pickers (41 options) and similar
 * long dropdowns (up to ~78). A Radix `Select` can't do free-text filtering
 * of a long list (only jump-to-letter typeahead), so this instead composes
 * a Radix `Popover` (positioning, focus return, outside-click/Escape
 * dismissal) with `cmdk`'s `Command` (fuzzy filtering + arrow-key/Enter
 * navigation, ARIA combobox roles built in). No virtualization: cmdk's
 * plain-DOM list stays responsive comfortably past 78 rows.
 *
 * Controlled: the caller owns `value`/`onChange`.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  disabled,
  className,
  id,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          {...aria}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-default bg-surface px-3 text-sm text-primary transition-colors",
            "hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          style={{ width: "var(--radix-popover-trigger-width)" }}
          className="z-50 overflow-hidden rounded-md border border-subtle bg-surface-raised shadow-lg"
        >
          <Command loop>
            <CommandInput
              placeholder={searchPlaceholder}
              className="w-full border-b border-subtle bg-transparent px-3 py-2 text-sm text-primary outline-none placeholder:text-muted"
            />
            <CommandList className="max-h-72 overflow-y-auto p-1">
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted">
                {emptyMessage}
              </CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <CommandItem
                      // Search/uniqueness key for cmdk. `keywords` (not this)
                      // is what free-text search actually matches, so a
                      // value that differs in case or isn't human-readable
                      // still works.
                      key={option.value}
                      value={option.value}
                      keywords={[option.label]}
                      aria-selected={isSelected}
                      // Close over `option.value` directly rather than using
                      // the string cmdk hands back to `onSelect` — cmdk
                      // lowercases values internally for matching, which
                      // would silently corrupt mixed-case data values
                      // (e.g. "Polymer family").
                      onSelect={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-primary",
                        "data-[selected=true]:bg-muted",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {option.hint ? (
                          <span className="text-xs text-muted">{option.hint}</span>
                        ) : null}
                        {isSelected ? (
                          <CheckIcon className="h-4 w-4 text-accent" aria-hidden="true" />
                        ) : null}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
