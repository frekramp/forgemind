import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all select-none active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember/60",
  {
    variants: {
      variant: {
        primary:
          "bg-ember text-white hover:bg-ember-bright shadow-[0_6px_24px_-8px_rgb(var(--color-ember)/0.55)] hover:shadow-[0_10px_34px_-8px_rgb(var(--color-ember)/0.75)]",
        outline: "border border-border-strong text-text hover:border-ember hover:text-ember",
        ghost: "text-muted hover:text-text hover:bg-panel-2",
        danger: "border border-loss/40 text-loss hover:bg-loss/10",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
