"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { StepShell } from "../step-shell";
import type { HouseholdMember, MemberRole } from "@/lib/schemas/household";

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "adult", label: "Adult" },
  { value: "teen", label: "Teen" },
  { value: "child", label: "Child" },
  { value: "elder", label: "Elder" },
];

function randomId() {
  return `m_${Math.random().toString(36).slice(2, 9)}`;
}

export function StepPeople({
  initial,
  onBack,
  onNext,
}: {
  initial?: HouseholdMember[];
  onBack: () => void;
  onNext: (members: HouseholdMember[]) => void;
}) {
  const [members, setMembers] = useState<HouseholdMember[]>(
    initial && initial.length > 0
      ? initial
      : [{ id: randomId(), name: "", role: "adult", mobilityNotes: "" }],
  );
  const [showErrors, setShowErrors] = useState(false);

  const addMember = () =>
    setMembers((m) => [
      ...m,
      { id: randomId(), name: "", role: "adult", mobilityNotes: "" },
    ]);

  const removeMember = (id: string) =>
    setMembers((m) => (m.length > 1 ? m.filter((x) => x.id !== id) : m));

  const update = (id: string, patch: Partial<HouseholdMember>) =>
    setMembers((m) =>
      m.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );

  const handleContinue = () => {
    setShowErrors(true);
    const clean = members
      .map((m) => ({ ...m, name: m.name.trim() }))
      .filter((m) => m.name.length > 0);
    if (clean.length === 0) return;
    onNext(clean);
  };

  return (
    <StepShell
      eyebrow="Step 2 of 5"
      title="Who lives with you?"
      description="Roles let Evacua prioritize the right tasks for the right person."
      actions={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button variant="ember" onClick={handleContinue}>
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {members.map((m, i) => (
          <div
            key={m.id}
            className="group rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/50 p-4"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <div>
                <Label htmlFor={`name-${m.id}`}>Name</Label>
                <Input
                  id={`name-${m.id}`}
                  value={m.name}
                  invalid={showErrors && m.name.trim().length === 0}
                  onChange={(e) => update(m.id, { name: e.target.value })}
                  placeholder={i === 0 ? "e.g. Alex" : "Add a name"}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Role</Label>
                <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)] p-1">
                  {ROLE_OPTIONS.map((r) => {
                    const active = m.role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => update(m.id, { role: r.value })}
                        className={
                          "h-8 rounded-lg text-[12px] font-medium transition-colors " +
                          (active
                            ? "bg-[var(--color-ember-soft)] text-[var(--color-ember)]"
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]")
                        }
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  disabled={members.length <= 1}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line-subtle)] text-[var(--color-text-muted)] transition-colors enabled:hover:text-[var(--color-red)] enabled:hover:border-[var(--color-red)]/50 disabled:opacity-40"
                  aria-label="Remove member"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor={`mob-${m.id}`}>Mobility notes (optional)</Label>
              <Input
                id={`mob-${m.id}`}
                value={m.mobilityNotes ?? ""}
                onChange={(e) => update(m.id, { mobilityNotes: e.target.value })}
                placeholder="Wheelchair, oxygen, trouble with stairs…"
                className="mt-2"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addMember}
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-2 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add another member
        </button>
      </div>
    </StepShell>
  );
}
