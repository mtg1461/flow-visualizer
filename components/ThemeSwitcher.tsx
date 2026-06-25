"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeSwitcher() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={`Theme: ${active.label} (${resolvedTheme})`}
        aria-label="Change theme"
        onClick={() => setOpen((value) => !value)}
        className="material-control flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0"
      >
        <ActiveIcon size={13} />
        <span className="hidden md:inline">{active.label}</span>
      </button>
      {open && (
        <div className="anim-pop material-panel absolute right-0 top-10 z-50 w-[156px] rounded-xl border border-line-strong p-1.5">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = option.value === preference;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPreference(option.value);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                  selected
                    ? "bg-accent/15 text-text"
                    : "text-mute hover:bg-well hover:text-text"
                }`}
              >
                <Icon size={13} className="text-faint" />
                <span className="flex-1">{option.label}</span>
                {selected && <Check size={13} className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
