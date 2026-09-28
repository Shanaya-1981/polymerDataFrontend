import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { useState } from "react";
import { cn } from "./cn";
import { CheckIcon, ChevronDownIcon, XIcon } from "./icons";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown right-aligned in the list (e.g. a count). */
  hint?: string;
}

export interface MultiSelectProps {
  options: readonly MultiSelectOption[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Chips shown before collapsing to "+N more". @default 3 */
  maxVisibleChips?: number;
}

/**
 * Searchable multi-select with a chip row (selected values, each
 * individually removable) and a clear-all — powers the combinable category
 * filters (up to ~78 options, e.g. `Polymer`). Same Popover+cmdk foundation
 * as `Combobox`; selecting an item here toggles it and keeps the popover
 * open instead of closing, since picking more than one is the point.
 *
 * Controlled: the caller owns `values`/`onChange`.
 */
export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  disabled,
  className,
  id,
  maxVisibleChips = 3,
  ...aria
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(values);
  const selectedOptions = options.filter((option) => selectedSet.has(option.value));

  function toggle(value: string) {
    onChange(selectedSet.has(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  const visibleChips = selectedOptions.slice(0, maxVisibleChips);
  const overflowCount = selectedOptions.length - visibleChips.length;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
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
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-default bg-surface px-3 text-sm text-primary transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <span className={cn("truncate", selectedOptions.length === 0 && "text-muted")}>
              {selectedOptions.length === 0 ? placeholder : `${selectedOptions.length} selected`}
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
                    const isSelected = selectedSet.has(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={[option.label]}
                        aria-selected={isSelected}
                        // Toggle, don't close — a multi-select stays open so
                        // the next click can pick another value. Close over
                        // `option.value` rather than cmdk's onSelect arg for
                        // the same case-fidelity reason noted in Combobox.
                        onSelect={() => toggle(option.value)}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary data-[selected=true]:bg-muted"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            isSelected
                              ? "border-accent bg-accent text-on-accent"
                              : "border-default",
                          )}
                        >
                          {isSelected ? <CheckIcon className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="text-xs text-muted">{option.hint}</span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {selectedOptions.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Selected">
          {visibleChips.map((option) => (
            <li key={option.value}>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary">
                {option.label}
                <button
                  type="button"
                  onClick={() => remove(option.value)}
                  aria-label={`Remove ${option.label}`}
                  className="rounded-full p-0.5 hover:bg-surface-raised hover:text-primary"
                >
                  <XIcon className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
          {overflowCount > 0 ? (
            <li>
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                +{overflowCount} more
              </span>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/10"
            >
              Clear all
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
