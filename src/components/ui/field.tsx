import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn.ts";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("mb-2 block text-sm font-extrabold", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-14 w-full rounded-2xl border-2 border-line bg-foam px-4 text-lg font-bold text-ink outline-none placeholder:font-semibold placeholder:text-muted/70 focus:border-leaf",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border-2 border-line bg-foam px-4 py-3 text-base font-bold text-ink outline-none placeholder:font-semibold placeholder:text-muted/70 focus:border-leaf",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="mt-3 rounded-2xl bg-coral/10 px-3 py-2 text-sm font-extrabold text-coral-dark">{children}</p>;
}
