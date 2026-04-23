"use client";

import { useState } from "react";
import { Plus, X, Pill, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { StepShell } from "../step-shell";
import type { Medication, Pet } from "@/lib/schemas/household";

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function StepConstraints({
  initial,
  onBack,
  onNext,
}: {
  initial?: {
    pets?: Pet[];
    medications?: Medication[];
    mobilityNotes?: string;
  };
  onBack: () => void;
  onNext: (v: {
    pets: Pet[];
    medications: Medication[];
    mobilityNotes: string;
  }) => void;
}) {
  const [pets, setPets] = useState<Pet[]>(initial?.pets ?? []);
  const [meds, setMeds] = useState<Medication[]>(initial?.medications ?? []);
  const [mobilityNotes, setMobilityNotes] = useState(
    initial?.mobilityNotes ?? "",
  );

  return (
    <StepShell
      eyebrow="Step 3 of 5"
      title="Anything we&rsquo;d need to pack?"
      description="Pets, medications, and mobility context. All optional, all helpful."
      actions={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="ember"
            onClick={() =>
              onNext({
                pets: pets.filter((p) => p.name.trim().length > 0),
                medications: meds.filter((m) => m.name.trim().length > 0),
                mobilityNotes,
              })
            }
          >
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        <section>
          <header className="mb-3 flex items-center gap-2">
            <PawPrint
              className="h-4 w-4 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
            />
            <h3 className="text-[13px] font-medium tracking-[-0.005em] text-[var(--color-text-primary)]">
              Pets
            </h3>
          </header>
          <div className="space-y-2">
            {pets.map((p) => (
              <div
                key={p.id}
                className="grid gap-2 md:grid-cols-[1fr_150px_auto]"
              >
                <Input
                  value={p.name}
                  onChange={(e) =>
                    setPets((list) =>
                      list.map((x) =>
                        x.id === p.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Name (e.g. Luna)"
                />
                <select
                  value={p.species}
                  onChange={(e) =>
                    setPets((list) =>
                      list.map((x) =>
                        x.id === p.id
                          ? { ...x, species: e.target.value as Pet["species"] }
                          : x,
                      ),
                    )
                  }
                  className="h-11 rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)] px-3 text-[14px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-cyan)] focus-visible:ring-2 focus-visible:ring-[var(--color-cyan)]/20"
                >
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="bird">Bird</option>
                  <option value="small_animal">Small animal</option>
                  <option value="other">Other</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setPets((list) => list.filter((x) => x.id !== p.id))
                  }
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line-subtle)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-red)]/50 hover:text-[var(--color-red)]"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setPets((list) => [
                  ...list,
                  {
                    id: rid("p"),
                    name: "",
                    species: "dog",
                    carrier: false,
                  },
                ])
              }
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Add pet
            </button>
          </div>
        </section>

        <div className="h-px bg-[var(--color-line-subtle)]" />

        <section>
          <header className="mb-3 flex items-center gap-2">
            <Pill
              className="h-4 w-4 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
            />
            <h3 className="text-[13px] font-medium tracking-[-0.005em] text-[var(--color-text-primary)]">
              Medications
            </h3>
          </header>
          <div className="space-y-2">
            {meds.map((m) => (
              <div
                key={m.id}
                className="grid gap-2 md:grid-cols-[1fr_auto_auto]"
              >
                <Input
                  value={m.name}
                  onChange={(e) =>
                    setMeds((list) =>
                      list.map((x) =>
                        x.id === m.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="e.g. Insulin, Epinephrine"
                />
                <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)] px-3 py-2.5 text-[12.5px] text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={m.critical}
                    onChange={(e) =>
                      setMeds((list) =>
                        list.map((x) =>
                          x.id === m.id
                            ? { ...x, critical: e.target.checked }
                            : x,
                        ),
                      )
                    }
                    className="h-3.5 w-3.5 accent-[var(--color-ember)]"
                  />
                  Critical
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setMeds((list) => list.filter((x) => x.id !== m.id))
                  }
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line-subtle)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-red)]/50 hover:text-[var(--color-red)]"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setMeds((list) => [
                  ...list,
                  {
                    id: rid("med"),
                    name: "",
                    critical: false,
                  },
                ])
              }
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Add medication
            </button>
          </div>
        </section>

        <div className="h-px bg-[var(--color-line-subtle)]" />

        <section>
          <Label htmlFor="mobility">Household mobility notes</Label>
          <Textarea
            id="mobility"
            value={mobilityNotes}
            onChange={(e) => setMobilityNotes(e.target.value)}
            placeholder="Anything the plan should know: wheelchair access, oxygen, hearing, etc."
            className="mt-2"
          />
        </section>
      </div>
    </StepShell>
  );
}
