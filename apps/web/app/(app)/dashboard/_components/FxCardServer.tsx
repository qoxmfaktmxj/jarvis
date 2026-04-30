import type { FxSignal } from "@/lib/queries/dashboard-signals";

/**
 * FxCardServer — Phase 1 external_signal 캐시 기반 RSC 환율 카드.
 *
 * 기존 swr 기반 FxCard.tsx는 mock /api/fx 호출이라 deprecated. 본 카드는
 * worker가 cron으로 채우는 external_signal(kind=fx)을 RSC가 직접 select.
 *
 * 위계:
 *  ┌──────────────────────────────────────┐
 *  │ 환율 · KRW 기준                      │   ← 13px secondary
 *  │ USD 1,342  EUR 1,458  JPY·100 892    │   ← 라벨 + 큰 숫자
 *  │ ▲0.3%     ▼0.1%      ▲0.5%           │   ← 변화율
 *  └──────────────────────────────────────┘
 */
export function FxCardServer({ fx }: { fx: FxSignal | null }) {
  if (!fx) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
        <span className="text-[13px] font-medium text-(--fg-secondary)">
          환율 · KRW 기준
        </span>
        <span className="text-[12px] text-(--fg-muted)">
          데이터를 불러오는 중…
        </span>
      </div>
    );
  }

  const rates: { code: string; basis?: string; value: number; change: number }[] = [
    { code: "USD", value: fx.rates.USD, change: fx.change.USD },
    { code: "EUR", value: fx.rates.EUR, change: fx.change.EUR },
    { code: "JPY", basis: "100", value: fx.rates.JPY, change: fx.change.JPY }
  ];

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <span className="text-[13px] font-medium text-(--fg-secondary)">
        환율 · KRW 기준
        {fx.stale ? (
          <span className="ml-1.5 text-(--fg-muted)" title="갱신 대기">
            (갱신중)
          </span>
        ) : null}
      </span>
      <ul className="grid grid-cols-3 gap-3">
        {rates.map((r) => (
          <li key={r.code} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-(--fg-secondary)">
              {r.code}
              {r.basis ? <span className="ml-0.5">· {r.basis}</span> : null}
            </span>
            <span className="font-mono text-[20px] font-bold leading-none tabular-nums text-(--fg-primary)">
              {Math.round(r.value).toLocaleString("ko-KR")}
            </span>
            <ChangePill delta={r.change} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangePill({ delta }: { delta: number }) {
  const pct = Math.abs(delta * 100);
  if (pct < 0.005) {
    return <span className="text-[11px] text-(--fg-muted) tabular-nums">— 0.0%</span>;
  }
  const isUp = delta > 0;
  // 원화 약세 = 환율 ↑ = 빨강(주의), 원화 강세 = ↓ = 파랑(좋음). 한국 시장 컨벤션과 다르지만
  // 회사 대시보드라 "약세=주의" 신호가 자연스러움.
  const cls = isUp
    ? "text-[--color-red-500]"
    : "text-(--brand-primary)";
  const arrow = isUp ? "▲" : "▼";
  return (
    <span className={`text-[11px] tabular-nums ${cls}`}>
      {arrow} {pct.toFixed(1)}%
    </span>
  );
}
