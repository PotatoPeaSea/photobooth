"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { BracketButton, Headline, Tagline, TertiaryLogo } from "@/components/brand/Brand";
import type { NfcTap } from "@/lib/nfcChallenge";
import { BoothScreen, OtterScene } from "./Scene";

/** Tapping Jason cycles through his poses. */
const POSES = ["jason-hips", "jason-frame", "jason-shock", "jason-x"];

/** Die-cut Jason head stickers scattered round the attract screen. */
const STICKERS = [
  { name: "jason-head-shock", className: "left-[27rem] top-[1.6rem] w-[6.2rem]", tilt: "-12deg", delay: "0s" },
  { name: "jason-head-x", className: "left-[22rem] bottom-[1.2rem] w-[8.5rem]", tilt: "8deg", delay: "-1.5s" },
  { name: "jason-head-smile", className: "right-[1.6rem] top-[3.2rem] w-[5.4rem]", tilt: "14deg", delay: "-3s" },
];

/** White die-cut border plus a soft drop shadow, traced round the PNG's alpha. */
const STICKER_FILTER = [
  ...[
    [0.22, 0],
    [-0.22, 0],
    [0, 0.22],
    [0, -0.22],
    [0.16, 0.16],
    [-0.16, 0.16],
    [0.16, -0.16],
    [-0.16, -0.16],
  ].map(([x, y]) => `drop-shadow(${x}rem ${y}rem 0 #fff)`),
  "drop-shadow(0 0.3rem 0.4rem rgba(16,26,33,.35))",
].join(" ");

/** Five taps inside this window on the top-right corner open the staff panel. */
const STAFF_TAPS = 5;
const STAFF_WINDOW_MS = 3_000;

/**
 * Attract screen for Jason's Big 24: no badge check-in on this version, a tap
 * anywhere starts the booth. `onAdmitted` always gets null (no badge tap).
 */
export default function ScanScreen({
  onAdmitted,
  onStaff,
}: {
  onAdmitted: (tap: NfcTap | null) => void;
  onStaff: () => void;
}) {
  const staffTaps = useRef<number[]>([]);
  const [taps, setTaps] = useState(0);

  // Warm the cache so a tap swaps poses without a blank frame.
  useEffect(() => {
    for (const name of [...POSES, ...STICKERS.map((s) => s.name)]) new Image().src = `/brand/${name}.png`;
  }, []);

  // Hidden staff gesture. The click stops here so it can't start the booth through the screen's onClick.
  function onCornerTap(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const now = Date.now();
    const recent = staffTaps.current.filter((t) => now - t <= STAFF_WINDOW_MS);
    recent.push(now);
    if (recent.length >= STAFF_TAPS) {
      staffTaps.current = [];
      onStaff();
      return;
    }
    staffTaps.current = recent;
  }

  return (
    <BoothScreen grain className="bg-sh-blue text-sh-white" onClick={() => onAdmitted(null)}>
      <Tagline className="absolute left-[1.5rem] top-[1.25rem] text-[0.8rem]" />

      {/* Giant "24" behind Jason. */}
      <p
        aria-hidden
        className="type-display pointer-events-none absolute bottom-[3rem] right-[0.5rem] select-none text-[22rem] leading-none tracking-[-0.04em] text-sh-yellow"
      >
        24
      </p>

      {STICKERS.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.name}
          src={`/brand/${s.name}.png`}
          alt=""
          aria-hidden
          draggable={false}
          className={`pointer-events-none absolute animate-bob ${s.className}`}
          style={{ filter: STICKER_FILTER, "--tilt": s.tilt, animationDelay: s.delay } as React.CSSProperties}
        />
      ))}

      <div className="absolute bottom-0 right-[1rem] top-[2.5rem] w-[27rem]">
        <OtterScene
          otter={POSES[taps % POSES.length]!}
          frame="none"
          onTap={() => setTaps((t) => t + 1)}
          tapCount={taps}
        />
      </div>

      <div className="absolute left-[1.5rem] top-1/2 w-[33rem] -translate-y-1/2">
        <Headline
          line1="Welcome to"
          line2={
            <>
              Jason’s Big <span className="whitespace-nowrap">Two Four</span>
            </>
          }
          className="text-[4rem]"
        />

        <p className="mt-[1.5rem] flex items-center gap-[0.6rem] text-[1.45rem] font-semibold leading-tight">
          <span className="inline-block size-[0.7rem] shrink-0 animate-pulse rounded-full bg-sh-yellow" />
          Tap anywhere to start
        </p>
        <p className="mt-[0.4rem] pl-[1.3rem] text-[1rem] font-medium text-sh-white/80">
          Strike a pose for the birthday boy
        </p>

        <BracketButton
          variant="secondary"
          className="mt-[1.25rem]"
          onClick={(e) => {
            e.stopPropagation();
            onAdmitted(null);
          }}
        >
          Let’s Go
        </BracketButton>
      </div>

      <TertiaryLogo className="absolute bottom-[1.25rem] left-[1.5rem] h-[1.1rem]" />

      {/* 7rem square, well above the 48px touch minimum; no visible target. */}
      <div
        aria-hidden
        data-testid="staff-corner"
        className="absolute right-0 top-0 z-10 size-[7rem]"
        onClick={onCornerTap}
      />
    </BoothScreen>
  );
}
