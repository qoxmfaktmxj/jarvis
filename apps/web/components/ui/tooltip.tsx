'use client';

import {
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

interface TooltipProviderProps {
  children: ReactNode;
  delayDuration?: number;
}

interface TooltipProps {
  children: ReactNode;
}

interface TooltipTriggerProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  asChild?: boolean;
}

interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

// Simple context-free tooltip implementation
export function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>;
}

export function Tooltip({ children }: TooltipProps) {
  return <span className="relative inline-block">{children}</span>;
}

export function TooltipTrigger({ children, asChild, className, ...props }: TooltipTriggerProps) {
  if (asChild) {
    return <>{children}</>;
  }
  return (
    <span className={cn('cursor-default', className)} {...props}>
      {children}
    </span>
  );
}

export function TooltipContent({
  children,
  side = 'top',
  className,
  ...props
}: TooltipContentProps) {
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  };

  return (
    <div
      className={cn(
        'absolute z-50 hidden group-hover:block rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md border',
        sideClasses[side],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
