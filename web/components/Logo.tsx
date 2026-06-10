import { cn } from "@/lib/cn";

/** ForgeMind mark: a sharp, upward ember spark (forged spark + ascent). Uses currentColor. */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 1.4 Q12.9 10.7 19.4 12 Q12.9 13.3 12 22.6 Q11.1 13.3 4.6 12 Q11.1 10.7 12 1.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Logo tile: the spark in an ember-gradient rounded square with a soft glow. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-ember-bright via-ember to-ember-deep text-white shadow-[0_5px_22px_-5px_rgba(244,99,42,0.6)]",
        className
      )}
      style={{ height: size, width: size }}
    >
      {/* faint inner sheen for depth */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/20" />
      <LogoMark size={Math.round(size * 0.52)} className="relative" />
    </span>
  );
}
