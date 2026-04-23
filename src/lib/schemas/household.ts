import { z } from "zod";

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

export const DwellingType = z.enum([
  "single_family",
  "apartment",
  "condo",
  "multi_unit",
  "mobile",
  "other",
]);
export type DwellingType = z.infer<typeof DwellingType>;

export const MemberRole = z.enum(["adult", "child", "teen", "elder"]);
export type MemberRole = z.infer<typeof MemberRole>;

export const HouseholdMemberSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Name can't be empty"),
  role: MemberRole,
  mobilityNotes: z.string().trim().optional().default(""),
});
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;

export const PetSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  species: z.enum(["dog", "cat", "bird", "small_animal", "other"]),
  carrier: z.boolean().default(false),
});
export type Pet = z.infer<typeof PetSchema>;

export const MedicationSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  memberId: z.string().optional(),
  critical: z.boolean().default(false),
});
export type Medication = z.infer<typeof MedicationSchema>;

export const VehicleSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1),
  seats: z.number().int().min(1).max(12),
  fuelState: z.enum(["full", "half", "low"]).default("half"),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const ContactSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(3),
  relation: z.string().trim().default("contact"),
});
export type Contact = z.infer<typeof ContactSchema>;

export const DestinationSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1),
  address: z.string().trim().min(1),
  coords: LatLngSchema.optional(),
});
export type Destination = z.infer<typeof DestinationSchema>;

export const HouseholdSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),

  // Step 1: address + dwelling
  address: z.string().trim().min(3, "Address is required"),
  coords: LatLngSchema,
  displayName: z.string().trim().optional(),
  dwelling: DwellingType,
  floors: z.number().int().min(1).max(80).optional(),
  accessNotes: z.string().trim().optional().default(""),

  // Step 2: people
  members: z.array(HouseholdMemberSchema).min(1, "Add at least one member"),

  // Step 3: constraints
  pets: z.array(PetSchema).default([]),
  medications: z.array(MedicationSchema).default([]),
  mobilityNotes: z.string().trim().optional().default(""),

  // Step 4: logistics
  vehicles: z.array(VehicleSchema).min(1, "Add at least one vehicle"),
  contacts: z.array(ContactSchema).default([]),
  destinations: z.array(DestinationSchema).default([]),
});
export type Household = z.infer<typeof HouseholdSchema>;

/** Readiness score (deterministic). Returns 0..1. */
export function computeReadiness(h: Partial<Household>): {
  score: number;
  missing: string[];
} {
  const missing: string[] = [];
  let have = 0;
  let total = 0;

  const check = (cond: boolean, label: string) => {
    total++;
    if (cond) have++;
    else missing.push(label);
  };

  check(Boolean(h.address && h.coords), "Home address");
  check(Boolean(h.dwelling), "Dwelling type");
  check((h.members?.length ?? 0) > 0, "At least one household member");
  check((h.vehicles?.length ?? 0) > 0, "At least one vehicle");
  check((h.contacts?.length ?? 0) > 0, "Emergency contact");
  check((h.destinations?.length ?? 0) > 0, "Preferred destination");

  return { score: have / Math.max(1, total), missing };
}
