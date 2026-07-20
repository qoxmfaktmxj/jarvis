import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell(props: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl p-4 sm:p-6", props.className)}>{props.children}</div>;
}

export function PageShellFit(props: { children: ReactNode; className?: string }) {
  return <div className={cn("flex h-full min-h-0 w-full flex-col p-4 sm:p-6", props.className)}>{props.children}</div>;
}
