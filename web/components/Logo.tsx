import { cn } from "@/lib/cn";

/** ForgeMind mark: an anvil, the tool of the forge, struck with an ember spark. Uses currentColor
 *  for the anvil so it inherits text color; the spark is fixed ember. */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* the anvil: wide face with a horn, narrow waist, flared base */}
      <path
        d="M3.5 8.2 H15.3 L19.8 6.4 Q21.4 8.6 18.7 10.2 H13.2 V12.4 Q17.8 13.1 18.7 17 H5.3 Q6.2 13.6 10.2 12.5 V10.2 H6.4 Q4 10.2 3.5 8.2 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Logo tile: the mark in an ember-gradient rounded square with a soft glow + inner sheen. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-ember-bright via-ember to-ember-deep text-white shadow-[0_5px_22px_-5px_rgba(244,99,42,0.6)]",
        className
      )}
      style={{ height: size, width: size }}
    >
      {/* faint inner sheen + top-edge highlight for forged depth */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/10 via-white/0 to-white/25" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
      <LogoMark size={Math.round(size * 0.6)} className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" />
    </span>
  );
}
