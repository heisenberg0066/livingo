import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn.ts";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-leaf/30 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "press bg-leaf text-white border-leaf-dark",
        sky: "press bg-sky text-white border-sky-dark",
        gold: "press bg-gold text-ink border-gold-dark",
        coral: "press bg-coral text-white border-coral-dark",
        white: "press bg-foam text-ink border-line",
        outline: "press bg-transparent text-ink border-line",
        ghost: "bg-transparent text-ink",
      },
      size: {
        lg: "h-14 px-6 text-lg",
        md: "h-12 px-5 text-base",
        sm: "h-10 rounded-xl px-3 text-sm",
        icon: "h-12 w-12 rounded-full p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
