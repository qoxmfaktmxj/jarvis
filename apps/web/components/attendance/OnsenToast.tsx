"use client";

import Image from "next/image";
import { X } from "lucide-react";

export type LeaveType = "annual" | "half" | "sick" | "official";

export interface OnsenToastProps {
  type: LeaveType | string;
  from: string;
  to: string;
  onClose: () => void;
}

const TYPE_LABEL: Record<LeaveType, string> = {
  annual: "연차",
  half: "반차",
  sick: "병가",
  official: "공가",
};

/**
 * OnsenToast — success toast shown after a leave request is submitted.
 *
 * Matches app.jsx `OnsenToast` (lines 435–446): capybara-in-onsen avatar,
 * chip, type label, date range, "♨" tail message, and a slide-and-pop
 * entrance animation.
 */
export function OnsenToast({ type, from, to, onClose }: OnsenToastProps) {
  const label = TYPE_LABEL[type as LeaveType] ?? type;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 80,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          padding: "16px 18px 16px 16px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          width: 380,
          animation: "onsenIn .5s cubic-bezier(.2,1.4,.4,1)",
        }}
      >
        <Image
          src="/capybara/onsen.png"
          width={64}
          height={64}
          alt=""
          style={{ borderRadius: "50%", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
            }}
          >
            <span
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                fontSize: 10.5,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                background: "var(--mint-tint)",
                color: "var(--mint)",
                borderRadius: 4,
              }}
            >
              신청 완료
            </span>
            <span
              className="mono"
              style={{ fontSize: 10.5, color: "var(--faint)" }}
            >
              방금
            </span>
          </div>
          <div
            style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em" }}
          >
            {label} 결재가 올라갔어요
          </div>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}
          >
            {from} → {to} · 미리 푹 쉬세요 ♨
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="알림 닫기"
          style={{
            color: "var(--muted)",
            padding: 4,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
          }}
        >
          <X size={16} />
        </button>
      </div>
      <style>{`@keyframes onsenIn{0%{opacity:0;transform:translateY(20px) scale(.95)}100%{opacity:1;transform:none}}`}</style>
    </>
  );
}
