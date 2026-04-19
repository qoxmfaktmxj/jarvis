'use client';

import { GlobeLoader } from './GlobeLoader';

type LoadingOverlayProps = {
  label?: string;
};

export function LoadingOverlay({ label }: LoadingOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center gap-5">
        <GlobeLoader size={96} tone="inverse" />
        {label ? (
          <p className="text-display text-[14px] font-medium tracking-wide text-white">
            {label}
          </p>
        ) : null}
      </div>
    </div>
  );
}
