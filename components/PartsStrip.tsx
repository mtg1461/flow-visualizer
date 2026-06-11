"use client";

import type { Explanation } from "@/lib/types";
import { partColors } from "@/lib/meta";

export function PartsStrip({ data }: { data: Explanation }) {
  if (!data.parts || data.parts.length === 0) return null;
  const colors = partColors(data);

  return (
    <section className="mx-auto mt-14 max-w-[840px] px-5">
      <h2 className="text-center text-[10.5px] uppercase tracking-[0.28em] text-faint">
        The moving parts
      </h2>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {data.parts.map((part, i) => (
          <div
            key={part.id}
            style={{ animationDelay: `${0.2 + i * 0.05}s` }}
            className="anim-rise flex items-center gap-2.5 rounded-full border border-line bg-surface py-2 pl-3.5 pr-4"
          >
            <span
              className="size-2 rounded-full"
              style={{
                background: colors.get(part.id),
                boxShadow: `0 0 10px ${colors.get(part.id)}66`,
              }}
            />
            <span className="text-[13px] font-medium text-text">
              {part.name}
            </span>
            {part.role && (
              <span className="text-[12px] text-faint">{part.role}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
