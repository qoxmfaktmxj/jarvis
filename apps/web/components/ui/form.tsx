"use client";

import {
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
  type LabelHTMLAttributes,
} from "react";
import {
  FormProvider,
  useFormContext,
  type FieldValues,
  type FieldPath,
  type UseFormReturn,
  Controller,
  type ControllerProps,
  type ControllerRenderProps,
} from "react-hook-form";
import { cn } from "@/lib/utils";

// ─── Form (root wrapper) ───────────────────────────────────────────────────────

export function Form<TFieldValues extends FieldValues>({
  children,
  ...methods
}: UseFormReturn<TFieldValues> & { children: ReactNode }) {
  return (
    <FormProvider {...methods}>{children}</FormProvider>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────

interface FieldContextValue {
  name: string;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  render,
}: ControllerProps<TFieldValues, TName>) {
  return (
    <FieldContext.Provider value={{ name }}>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState, formState }) =>
          render({ field: field as ControllerRenderProps<TFieldValues, TName>, fieldState, formState })
        }
      />
    </FieldContext.Provider>
  );
}

// ─── FormItem ─────────────────────────────────────────────────────────────────

export function FormItem({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}

// ─── FormLabel ────────────────────────────────────────────────────────────────

export function FormLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-sm font-medium text-gray-700", className)}
      {...props}
    />
  );
}

// ─── FormControl ──────────────────────────────────────────────────────────────

export function FormControl({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ─── FormMessage ──────────────────────────────────────────────────────────────

export function FormMessage({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const ctx = useContext(FieldContext);
  let body = children;

  // Try to get error from form context if available
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const methods = useFormContext();
    if (ctx && methods) {
      const error = methods.formState.errors[ctx.name];
      if (error) body = String(error.message ?? "");
    }
  } catch {
    // No FormContext available
  }

  if (!body) return null;

  return (
    <p
      className={cn("text-xs text-red-600 mt-0.5", className)}
      {...props}
    >
      {body}
    </p>
  );
}
