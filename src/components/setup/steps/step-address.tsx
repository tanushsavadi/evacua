"use client";

import { useEffect, useState } from "react";
import { MapPin, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, SegmentedGroup, Textarea, FieldError } from "@/components/ui/field";
import { StepShell } from "../step-shell";
import type { DwellingType, LatLng } from "@/lib/schemas/household";

type GeoResult = {
  lat: number;
  lng: number;
  displayName: string;
};

export function StepAddress({
  initial,
  onBack,
  onNext,
}: {
  initial?: {
    address?: string;
    coords?: LatLng;
    displayName?: string;
    dwelling?: DwellingType;
    floors?: number;
    accessNotes?: string;
  };
  onBack: () => void;
  onNext: (v: {
    address: string;
    coords: LatLng;
    displayName?: string;
    dwelling: DwellingType;
    floors?: number;
    accessNotes?: string;
  }) => void;
}) {
  const [query, setQuery] = useState(initial?.address ?? "");
  const [selected, setSelected] = useState<GeoResult | null>(
    initial?.coords
      ? {
          lat: initial.coords.lat,
          lng: initial.coords.lng,
          displayName: initial.displayName ?? initial.address ?? "",
        }
      : null,
  );
  const [results, setResults] = useState<GeoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dwelling, setDwelling] = useState<DwellingType>(
    initial?.dwelling ?? "single_family",
  );
  const [floors, setFloors] = useState<string>(
    initial?.floors ? String(initial.floors) : "1",
  );
  const [accessNotes, setAccessNotes] = useState(initial?.accessNotes ?? "");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Debounced geocode
  useEffect(() => {
    if (selected && selected.displayName.startsWith(query)) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (query.trim().length < 4) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(query)}`,
        );
        const data = await res.json();
        if (!cancelled && Array.isArray(data.results)) {
          setResults(data.results);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, selected]);

  const canSubmit = Boolean(selected && dwelling);

  const handleContinue = () => {
    setSubmitAttempted(true);
    if (!canSubmit || !selected) return;
    onNext({
      address: selected.displayName,
      coords: { lat: selected.lat, lng: selected.lng },
      displayName: selected.displayName,
      dwelling,
      floors: floors ? Math.max(1, Math.min(80, parseInt(floors, 10) || 1)) : undefined,
      accessNotes,
    });
  };

  return (
    <StepShell
      eyebrow="Step 1 of 5"
      title="Where is home?"
      description="Your address anchors every recommendation. We only store it on your device."
      actions={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="ember"
            onClick={handleContinue}
            disabled={!canSubmit}
          >
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <Label htmlFor="address">Home address</Label>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
            />
            <Input
              id="address"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="e.g. 1250 Sunset Blvd, Malibu, CA"
              className="pl-10"
              invalid={submitAttempted && !selected}
              autoComplete="off"
            />
            {isSearching && (
              <Loader2
                className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--color-text-muted)]"
                strokeWidth={1.75}
              />
            )}
          </div>
          {submitAttempted && !selected && (
            <FieldError message="Pick a result below to confirm your home location." />
          )}

          {!selected && results.length > 0 && (
            <ul className="mt-3 overflow-hidden rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-elev)]">
              {results.map((r, idx) => (
                <li key={`${r.lat}-${r.lng}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r);
                      setQuery(r.displayName);
                      setResults([]);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <MapPin
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-cyan)]"
                      strokeWidth={1.75}
                    />
                    <span className="text-[13.5px] leading-snug text-[var(--color-text-secondary)]">
                      {r.displayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/30 px-4 py-3">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-cyan)]"
                strokeWidth={1.75}
              />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] text-[var(--color-text-primary)]">
                  {selected.displayName}
                </p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                  {selected.lat.toFixed(4)}°, {selected.lng.toFixed(4)}° · geocoded
                </p>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label>Dwelling type</Label>
          <SegmentedGroup<DwellingType>
            className="mt-2"
            value={dwelling}
            onChange={setDwelling}
            options={[
              { value: "single_family", label: "House", hint: "Single family" },
              { value: "apartment", label: "Apartment", hint: "In a building" },
              { value: "condo", label: "Condo", hint: "Owned unit" },
              { value: "multi_unit", label: "Multi-unit", hint: "Duplex / ADU" },
              { value: "mobile", label: "Mobile home", hint: "Manufactured" },
              { value: "other", label: "Other", hint: "Describe below" },
            ]}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-[140px_1fr]">
          <div>
            <Label htmlFor="floors">Floors / levels</Label>
            <Input
              id="floors"
              type="number"
              min={1}
              max={80}
              value={floors}
              onChange={(e) => setFloors(e.target.value)}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="access">Access notes (optional)</Label>
            <Textarea
              id="access"
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              placeholder="Narrow driveway, steep hill, gated road, etc."
              className="mt-2"
            />
          </div>
        </div>

        <p className="rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/60 px-4 py-3 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          Evacua plans using household attributes and local public data. It
          never guesses your home&rsquo;s interior layout.
        </p>
      </div>
    </StepShell>
  );
}
