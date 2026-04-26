"use client";

import { CloudSun, Wind, Droplets, Flame, Gauge } from "lucide-react";
import type { HomeConditions } from "@/lib/hooks/use-home-conditions";
import { cn } from "@/lib/utils";

export function HomeConditionsPanel({
  conditions,
  loading,
}: {
  conditions: HomeConditions | null;
  loading: boolean;
}) {
  const fireRisk = conditions?.risk.fireRiskPct ?? null;
  const humidity = conditions?.weather.humidityPct ?? null;
  const wind = conditions?.weather.windMph ?? null;
  const aqi = conditions?.air.aqi ?? null;
  const riskTone =
    fireRisk == null
      ? "text-[var(--color-text-muted)]"
      : fireRisk >= 72
        ? "text-[var(--color-red)]"
        : fireRisk >= 48
          ? "text-[var(--color-ember)]"
          : "text-[var(--color-cyan)]";

  return (
    <section className="rounded-lg border border-white/[0.07] bg-black/25 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
          <CloudSun className="h-3 w-3" strokeWidth={1.75} />
          Environmental conditions
          {loading && <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--color-cyan)]" />}
        </div>
        <span className={cn("font-mono text-[11px] tabular-nums", riskTone)}>
          {fireRisk != null ? `${fireRisk}% risk` : "-"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric
          icon={Gauge}
          label="AQI"
          value={formatNum(conditions?.air.aqi, 0)}
          sub={conditions?.weather.label ?? "-"}
        />
        <Metric
          icon={Wind}
          label="Wind"
          value={formatNum(conditions?.weather.windMph, 0, " mph")}
          sub={conditions?.weather.windDir ?? "-"}
        />
        <Metric
          icon={Droplets}
          label="Humidity"
          value={formatNum(conditions?.weather.humidityPct, 0, "%")}
          sub={formatNum(conditions?.weather.temperatureF, 0, "°F")}
        />
        <Metric
          icon={Flame}
          label="Fire danger"
          value={fireRisk != null ? riskBand(fireRisk) : "-"}
          sub={fireRisk != null ? `${fireRisk}/100` : "-"}
        />
      </div>

      <div className="mt-2 text-[11px] text-[var(--color-text-muted)]">
        Ops note: low humidity, high wind, and degraded air quality raise spread
        acceleration risk and can force route revisions.
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Factor
          label="Humidity"
          tone={humidity != null && humidity < 20 ? "critical" : humidity != null && humidity < 30 ? "high" : "normal"}
          value={humidity != null ? `${Math.round(humidity)}%` : "-"}
        />
        <Factor
          label="Wind"
          tone={wind != null && wind >= 30 ? "critical" : wind != null && wind >= 18 ? "high" : "normal"}
          value={wind != null ? `${Math.round(wind)} mph` : "-"}
        />
        <Factor
          label="Air"
          tone={aqi != null && aqi >= 151 ? "critical" : aqi != null && aqi >= 101 ? "high" : "normal"}
          value={aqi != null ? `AQI ${Math.round(aqi)}` : "-"}
        />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-line-subtle)]/80">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            fireRisk == null
              ? "bg-[var(--color-line-strong)]"
              : fireRisk >= 72
                ? "bg-[var(--color-red)]"
                : fireRisk >= 48
                  ? "bg-[var(--color-ember)]"
                  : "bg-[var(--color-cyan)]",
          )}
          style={{ width: `${fireRisk ?? 0}%` }}
        />
      </div>
    </section>
  );
}

function Factor({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "normal" | "high" | "critical";
}) {
  const cls =
    tone === "critical"
      ? "border-[var(--color-red)]/35 text-[var(--color-red)]"
      : tone === "high"
        ? "border-[var(--color-ember)]/35 text-[var(--color-ember)]"
        : "border-[var(--color-cyan)]/35 text-[var(--color-cyan)]";
  return (
    <div className={cn("rounded-md border px-2 py-1", cls)}>
      <p className="text-[9.5px] uppercase">{label}</p>
      <p className="text-[11px]">{value}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" strokeWidth={1.75} />
        {label}
      </div>
      <div className="mt-1 text-[13px] text-[var(--color-text-primary)]">{value}</div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{sub}</div>
    </div>
  );
}

function formatNum(v: number | null | undefined, d = 0, suffix = ""): string {
  if (v == null || Number.isNaN(v)) return "-";
  return `${v.toFixed(d)}${suffix}`;
}

function riskBand(v: number): string {
  if (v >= 80) return "Extreme";
  if (v >= 62) return "High";
  if (v >= 40) return "Moderate";
  return "Low";
}
