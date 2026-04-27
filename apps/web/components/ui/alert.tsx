import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Alert — shadcn/new-york base, adapted for ISU brand.
 * NOTE: No left-stripe (`border-l-4`) by design — we lean on icon + bg-tint.
 */
const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-[13px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:h-4 [&>svg]:w-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default:     "bg-[--bg-surface] border-[--border-default] text-[--fg-primary]",
        destructive: "bg-[--color-red-50] border-[--color-red-200] text-[--color-red-500]",
        warning:     "bg-[--status-warn-bg] border-[rgba(221,91,0,0.2)] text-[--status-warn-fg]",
        info:        "bg-[--status-active-bg] border-[rgba(0,117,222,0.15)] text-[--status-active-fg]",
        success:     "bg-[--status-done-bg] border-[rgba(26,174,57,0.2)] text-[--status-done-fg]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  // eslint-disable-next-line jsx-a11y/heading-has-content -- children are required by API contract and passed through props
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight text-[14px]", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[12.5px] leading-relaxed [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
