"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Household } from "@/lib/schemas/household";

type State = {
  household: Household | null;
  draft: Partial<Household>;
  setDraft: (patch: Partial<Household>) => void;
  commit: (h: Household) => void;
  clear: () => void;
};

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await idbGet(name)) ?? null;
  },
  setItem: async (name: string, value: string) => {
    await idbSet(name, value);
  },
  removeItem: async (name: string) => {
    await idbDel(name);
  },
};

export const useHouseholdStore = create<State>()(
  persist(
    (set) => ({
      household: null,
      draft: {},
      setDraft: (patch) =>
        set((s) => ({ draft: { ...s.draft, ...patch } })),
      commit: (h) => set({ household: h, draft: {} }),
      clear: () => set({ household: null, draft: {} }),
    }),
    {
      name: "evacua:household:v1",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ household: s.household, draft: s.draft }),
    },
  ),
);
