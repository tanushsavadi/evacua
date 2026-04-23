"use client";

import { useState } from "react";
import { Plus, X, Car, Phone, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StepShell } from "../step-shell";
import type { Contact, Destination, Vehicle } from "@/lib/schemas/household";

function rid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 9)}`;
}

export function StepLogistics({
  initial,
  onBack,
  onNext,
}: {
  initial?: {
    vehicles?: Vehicle[];
    contacts?: Contact[];
    destinations?: Destination[];
  };
  onBack: () => void;
  onNext: (v: {
    vehicles: Vehicle[];
    contacts: Contact[];
    destinations: Destination[];
  }) => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(
    initial?.vehicles && initial.vehicles.length > 0
      ? initial.vehicles
      : [{ id: rid("v"), label: "", seats: 4, fuelState: "half" }],
  );
  const [contacts, setContacts] = useState<Contact[]>(
    initial?.contacts ?? [],
  );
  const [dests, setDests] = useState<Destination[]>(
    initial?.destinations ?? [],
  );
  const [showErrors, setShowErrors] = useState(false);

  const valid = vehicles.some((v) => v.label.trim().length > 0);

  return (
    <StepShell
      eyebrow="Step 4 of 5"
      title="Wheels, people, places."
      description="Your vehicles, who to call, and where you&rsquo;d go if you had to leave now."
      actions={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="ember"
            onClick={() => {
              setShowErrors(true);
              if (!valid) return;
              onNext({
                vehicles: vehicles.filter((v) => v.label.trim()),
                contacts: contacts.filter(
                  (c) => c.name.trim() && c.phone.trim(),
                ),
                destinations: dests.filter(
                  (d) => d.label.trim() && d.address.trim(),
                ),
              });
            }}
          >
            Continue
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        <section>
          <header className="mb-3 flex items-center gap-2">
            <Car
              className="h-4 w-4 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
            />
            <h3 className="text-[13px] font-medium tracking-[-0.005em] text-[var(--color-text-primary)]">
              Vehicles
            </h3>
          </header>
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="grid gap-2 md:grid-cols-[1fr_110px_130px_auto]"
              >
                <Input
                  value={v.label}
                  invalid={showErrors && v.label.trim().length === 0}
                  onChange={(e) =>
                    setVehicles((list) =>
                      list.map((x) =>
                        x.id === v.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="e.g. Subaru Outback"
                />
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={v.seats}
                  onChange={(e) =>
                    setVehicles((list) =>
                      list.map((x) =>
                        x.id === v.id
                          ? { ...x, seats: Math.max(1, parseInt(e.target.value, 10) || 1) }
                          : x,
                      ),
                    )
                  }
                />
                <select
                  value={v.fuelState}
                  onChange={(e) =>
                    setVehicles((list) =>
                      list.map((x) =>
                        x.id === v.id
                          ? { ...x, fuelState: e.target.value as Vehicle["fuelState"] }
                          : x,
                      ),
                    )
                  }
                  className="h-11 rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)] px-3 text-[14px] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-cyan)] focus-visible:ring-2 focus-visible:ring-[var(--color-cyan)]/20"
                >
                  <option value="full">Full tank</option>
                  <option value="half">Half tank</option>
                  <option value="low">Low fuel</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setVehicles((list) =>
                      list.length > 1 ? list.filter((x) => x.id !== v.id) : list,
                    )
                  }
                  disabled={vehicles.length <= 1}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line-subtle)] text-[var(--color-text-muted)] transition-colors enabled:hover:border-[var(--color-red)]/50 enabled:hover:text-[var(--color-red)] disabled:opacity-40"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setVehicles((list) => [
                  ...list,
                  { id: rid("v"), label: "", seats: 4, fuelState: "half" },
                ])
              }
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Add vehicle
            </button>
          </div>
        </section>

        <div className="h-px bg-[var(--color-line-subtle)]" />

        <section>
          <header className="mb-3 flex items-center gap-2">
            <Phone
              className="h-4 w-4 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
            />
            <h3 className="text-[13px] font-medium tracking-[-0.005em] text-[var(--color-text-primary)]">
              Emergency contacts
            </h3>
          </header>
          <div className="space-y-2">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="grid gap-2 md:grid-cols-[1fr_160px_160px_auto]"
              >
                <Input
                  value={c.name}
                  placeholder="Name"
                  onChange={(e) =>
                    setContacts((list) =>
                      list.map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  value={c.phone}
                  placeholder="Phone"
                  onChange={(e) =>
                    setContacts((list) =>
                      list.map((x) =>
                        x.id === c.id ? { ...x, phone: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  value={c.relation}
                  placeholder="Relation"
                  onChange={(e) =>
                    setContacts((list) =>
                      list.map((x) =>
                        x.id === c.id ? { ...x, relation: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setContacts((list) => list.filter((x) => x.id !== c.id))
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
                setContacts((list) => [
                  ...list,
                  {
                    id: rid("c"),
                    name: "",
                    phone: "",
                    relation: "family",
                  },
                ])
              }
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Add contact
            </button>
          </div>
        </section>

        <div className="h-px bg-[var(--color-line-subtle)]" />

        <section>
          <header className="mb-3 flex items-center gap-2">
            <Navigation
              className="h-4 w-4 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
            />
            <h3 className="text-[13px] font-medium tracking-[-0.005em] text-[var(--color-text-primary)]">
              Preferred destinations
            </h3>
          </header>
          <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">
            Family member, second home, hotel, or a town outside the likely
            fire path.
          </p>
          <div className="space-y-2">
            {dests.map((d) => (
              <div
                key={d.id}
                className="grid gap-2 md:grid-cols-[180px_1fr_auto]"
              >
                <Input
                  value={d.label}
                  placeholder="Label (e.g. Sister&rsquo;s house)"
                  onChange={(e) =>
                    setDests((list) =>
                      list.map((x) =>
                        x.id === d.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  value={d.address}
                  placeholder="City or address"
                  onChange={(e) =>
                    setDests((list) =>
                      list.map((x) =>
                        x.id === d.id ? { ...x, address: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setDests((list) => list.filter((x) => x.id !== d.id))
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
                setDests((list) => [
                  ...list,
                  { id: rid("d"), label: "", address: "" },
                ])
              }
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-line-strong)] px-4 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              Add destination
            </button>
          </div>
        </section>
      </div>
    </StepShell>
  );
}
