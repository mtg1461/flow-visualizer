"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Explanation } from "@/lib/types";
import { partColors } from "@/lib/meta";
import { StepCard } from "./StepCard";

const SPINE_GAP = 32; // card left edge → spine
const NODE_Y = 23; // card top → node center (matches StepCard dot)

interface ArcGeom {
  d: string;
  kind: "branch" | "feedback" | "loop";
  key: string;
  label?: string;
  lx: number;
  ly: number;
}

interface Geom {
  w: number;
  h: number;
  spineX: number;
  top: number;
  bottom: number;
  spinePath: string;
  arcs: ArcGeom[];
}

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ARC_STYLE = {
  branch: { stroke: "rgba(236,236,243,0.30)", dash: undefined, marker: "soft" },
  feedback: { stroke: "rgba(224,180,99,0.75)", dash: "5 5", marker: "amber" },
  loop: { stroke: "rgba(143,143,252,0.65)", dash: "2.5 6", marker: "accent" },
} as const;

export function Flow({ data }: { data: Explanation }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const [geom, setGeom] = useState<Geom | null>(null);
  const [activeId, setActiveId] = useState<string | null>(
    data.steps[0]?.id ?? null
  );
  const [flashId, setFlashId] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const colors = useMemo(() => partColors(data), [data]);
  const partsById = useMemo(
    () => new Map((data.parts ?? []).map((p) => [p.id, p])),
    [data]
  );
  const byId = useMemo(
    () =>
      new Map(
        data.steps.map((s, i) => [s.id, { index: i, title: s.title }])
      ),
    [data]
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const els = data.steps.map((s) => cardEls.current.get(s.id));
    if (els.some((el) => !el)) return;
    const cards = els as HTMLDivElement[];

    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const cardLeft = cards[0].offsetLeft;
    const cardRight = cardLeft + cards[0].offsetWidth;
    const spineX = cardLeft - SPINE_GAP;
    const yOf = (i: number) => cards[i].offsetTop + NODE_Y;

    const top = yOf(0) - 40;
    const bottom = yOf(cards.length - 1) + 30;
    const spinePath = `M ${spineX} ${top} L ${spineX} ${bottom}`;

    // collect edges beyond plain sequence
    interface Edge {
      from: number;
      to: number;
      kind: ArcGeom["kind"];
      key: string;
      label?: string;
      srcSlot: number; // stagger exits from the same card
    }
    const edges: Edge[] = [];
    const slotCount = new Map<number, number>();
    const nextSlot = (i: number) => {
      const n = slotCount.get(i) ?? 0;
      slotCount.set(i, n + 1);
      return n;
    };
    data.steps.forEach((s, i) => {
      for (const [bi, b] of (s.branches ?? []).entries()) {
        const to = byId.get(b.to)?.index;
        if (to === undefined) continue;
        edges.push({
          from: i,
          to,
          kind: to < i ? "feedback" : "branch",
          key: `b-${s.id}-${bi}`,
          srcSlot: nextSlot(i),
        });
      }
      if (s.then) {
        const to = byId.get(s.then)?.index;
        if (to !== undefined)
          edges.push({
            from: i,
            to,
            kind: to < i ? "feedback" : "branch",
            key: `t-${s.id}`,
            srcSlot: nextSlot(i),
          });
      }
    });
    for (const [li, l] of (data.loops ?? []).entries()) {
      const from = byId.get(l.from)?.index;
      const to = byId.get(l.to)?.index;
      if (from === undefined || to === undefined) continue;
      edges.push({
        from,
        to,
        kind: "loop",
        key: `l-${li}`,
        label: l.label,
        srcSlot: nextSlot(from),
      });
    }

    // longer arcs bulge further out so nested arcs never cross
    const right = edges
      .filter((e) => e.to > e.from)
      .sort((a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from));
    const left = edges
      .filter((e) => e.to <= e.from)
      .sort((a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from));

    const arcs: ArcGeom[] = [];
    right.forEach((e, rank) => {
      const bulge = Math.min(44 + rank * 26, w - cardRight - 14);
      const y0 = yOf(e.from) + 10 + e.srcSlot * 14;
      const y1 = yOf(e.to);
      const cx = cardRight + bulge;
      const x1 = cardRight + 8;
      arcs.push({
        d: `M ${cardRight} ${y0} C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`,
        kind: e.kind,
        key: e.key,
        label: e.label,
        lx: cardRight + bulge * 0.8,
        ly: (y0 + y1) / 2,
      });
    });
    left.forEach((e, rank) => {
      const bulge = Math.min(40 + rank * 26, spineX - 12);
      const y0 = yOf(e.from) + 12 + e.srcSlot * 10;
      const y1 = yOf(e.to);
      const cx = spineX - bulge;
      arcs.push({
        d: `M ${spineX} ${y0} C ${cx} ${y0}, ${cx} ${y1}, ${spineX - 7} ${y1}`,
        kind: e.kind,
        key: e.key,
        label: e.label,
        lx: spineX - bulge * 0.8,
        ly: (y0 + y1) / 2,
      });
    });

    setGeom({ w, h, spineX, top, bottom, spinePath, arcs });
  }, [data, byId]);

  useIsoLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(container);
    document.fonts?.ready.then(() => measure());
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [measure]);

  // scrollspy: the card nearest the upper-middle of the viewport is active.
  // Polls scroll position via rAF — scroll events are unreliable in some
  // embedded webviews, and the no-change branch is a single comparison.
  useEffect(() => {
    let raf = 0;
    let lastY = -1;
    let lastH = -1;
    const tick = () => {
      const y = window.scrollY;
      const h = window.innerHeight;
      if (y !== lastY || h !== lastH) {
        lastY = y;
        lastH = h;
        const line = h * 0.45;
        let best: string | null = null;
        let bestDist = Infinity;
        for (const [id, el] of cardEls.current) {
          const r = el.getBoundingClientRect();
          const dist = Math.abs((r.top + r.bottom) / 2 - line);
          if (dist < bestDist) {
            bestDist = dist;
            best = id;
          }
        }
        if (best) setActiveId(best);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  const jump = useCallback(
    (id: string) => {
      cardEls.current.get(id)?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
      setFlashId(id);
      window.setTimeout(() => setFlashId(null), 1400);
    },
    [reduced]
  );

  return (
    <section className="relative mx-auto mt-20 w-full max-w-[1000px] px-5 md:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10.5px] uppercase tracking-[0.28em] text-faint">
          The flow
        </h2>
        <div className="hidden items-center gap-5 text-[11px] text-faint md:flex">
          <span className="flex items-center gap-2">
            <span className="w-5 border-t border-line-strong" /> sequence
          </span>
          <span className="flex items-center gap-2">
            <span className="w-5 border-t border-dashed border-amber/70" />{" "}
            feedback
          </span>
          <span className="flex items-center gap-2">
            <span className="w-5 border-t border-dashed border-accent/70" />{" "}
            system loop
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative mt-8 pl-10 md:pl-36 md:pr-44"
      >
        {geom && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={geom.w}
            height={geom.h}
            viewBox={`0 0 ${geom.w} ${geom.h}`}
          >
            <defs>
              {(
                [
                  ["soft", "rgba(236,236,243,0.45)"],
                  ["amber", "rgba(224,180,99,0.9)"],
                  ["accent", "rgba(143,143,252,0.85)"],
                ] as const
              ).map(([name, color]) => (
                <marker
                  key={name}
                  id={`arrow-${name}`}
                  viewBox="0 0 8 8"
                  refX="6"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0.8 0.8 L 6.4 4 L 0.8 7.2"
                    fill="none"
                    stroke={color}
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </marker>
              ))}
            </defs>

            {/* spine */}
            <motion.path
              key="spine"
              d={geom.spinePath}
              fill="none"
              stroke="rgba(255,255,255,0.13)"
              strokeWidth="1.5"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: "easeInOut" }}
            />
            <circle
              cx={geom.spineX}
              cy={geom.top}
              r="3"
              fill="#0a0a0f"
              stroke="rgba(143,143,252,0.8)"
              strokeWidth="1.5"
            />
            <circle
              cx={geom.spineX}
              cy={geom.bottom}
              r="3"
              fill="rgba(143,143,252,0.8)"
            />

            {/* branch + feedback arcs (hidden on small screens) */}
            <g className="max-md:hidden">
              {geom.arcs.map((arc) => {
                const style = ARC_STYLE[arc.kind];
                return (
                  <motion.path
                    key={arc.key}
                    d={arc.d}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth="1.2"
                    strokeDasharray={style.dash}
                    markerEnd={`url(#arrow-${style.marker})`}
                    initial={reduced ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: "-40px 0px" }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                );
              })}
            </g>

            {/* a quiet pulse travelling the spine */}
            {!reduced && (
              <>
                <circle r="6" fill="rgba(143,143,252,0.18)">
                  <animateMotion
                    dur="9s"
                    repeatCount="indefinite"
                    path={geom.spinePath}
                  />
                </circle>
                <circle r="2.2" fill="rgba(143,143,252,0.95)">
                  <animateMotion
                    dur="9s"
                    repeatCount="indefinite"
                    path={geom.spinePath}
                  />
                </circle>
              </>
            )}
          </svg>
        )}

        {/* labels for system loops */}
        {geom &&
          geom.arcs
            .filter((a) => a.kind === "loop" && a.label)
            .map((a) => (
              <div
                key={`label-${a.key}`}
                className="absolute z-10 max-w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-accent/20 bg-bg/90 px-2.5 py-1.5 text-center text-[10.5px] leading-snug text-accent/90 backdrop-blur-sm max-md:hidden"
                style={{ left: a.lx, top: a.ly }}
              >
                {a.label}
              </div>
            ))}

        <div className="flex flex-col gap-5 md:gap-6">
          {data.steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              index={i}
              active={activeId === step.id}
              flash={flashId === step.id}
              partsById={partsById}
              partColor={step.part ? colors.get(step.part) : undefined}
              byId={byId}
              onJump={jump}
              refCb={(el) => {
                if (el) {
                  el.dataset.stepId = step.id;
                  cardEls.current.set(step.id, el);
                } else {
                  cardEls.current.delete(step.id);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* progress rail */}
      <nav
        aria-label="Steps"
        className="fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center xl:flex"
      >
        {data.steps.map((step, i) => (
          <button
            key={step.id}
            type="button"
            aria-label={`Step ${i + 1}: ${step.title}`}
            aria-current={activeId === step.id ? "step" : undefined}
            onClick={() => jump(step.id)}
            className="group cursor-pointer p-[5px]"
          >
            <span
              className={`block size-1.5 rounded-full transition-all duration-300 ${
                activeId === step.id
                  ? "scale-150 bg-accent"
                  : "bg-line-strong group-hover:bg-mute"
              }`}
            />
          </button>
        ))}
      </nav>
    </section>
  );
}
