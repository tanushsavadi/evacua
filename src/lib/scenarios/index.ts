import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { LatLng } from "@/lib/schemas/household";

export type ScenarioFrame = {
  /** seconds since scenario start */
  tSec: number;
  events: CrisisEvent[];
};

export type Scenario = {
  id: string;
  title: string;
  blurb: string;
  home: LatLng;
  homeLabel: string;
  destination: { label: string; address: string; coords: LatLng };
  /** ordered frames; at time t, use the most recent frame's events */
  frames: ScenarioFrame[];
};

/** Coastal Palisades — warning upgrades to order, primary route closes. */
const coastalPalisades: Scenario = {
  id: "coastal-palisades",
  title: "Warning upgrades to order",
  blurb: "Primary route closes mid-plan.",
  home: { lat: 34.0489, lng: -118.5553 },
  homeLabel: "Pacific Palisades",
  destination: {
    label: "Sister Jen's (Burbank)",
    address: "225 N Hollywood Way, Burbank, CA",
    coords: { lat: 34.1833, lng: -118.3231 },
  },
  frames: [
    {
      tSec: 0,
      events: [
        {
          id: "nws-rfw-1",
          source: "nws",
          kind: "red_flag",
          severity: "moderate",
          headline: "Red Flag Warning — Santa Monica Mountains",
          body: "Gusts 30-45 mph, RH 10-15%. Critical fire weather through evening.",
          publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          centroid: { lat: 34.09, lng: -118.68 },
          url: "https://api.weather.gov",
        },
      ],
    },
    {
      tSec: 45,
      events: [
        {
          id: "nws-rfw-1",
          source: "nws",
          kind: "red_flag",
          severity: "severe",
          headline: "Red Flag Warning — Santa Monica Mountains",
          body: "Gusts now 45-60 mph. Extreme spread risk.",
          publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          centroid: { lat: 34.09, lng: -118.68 },
        },
        {
          id: "calfire-palisades",
          source: "calfire",
          kind: "fire_incident",
          severity: "severe",
          headline: "Palisades Fire — 140 acres",
          body: "New start near Topanga; rapid spread northwest.",
          publishedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
          centroid: { lat: 34.085, lng: -118.59 },
          url: "https://incidents.fire.ca.gov",
        },
        {
          id: "calfire-evac-warn",
          source: "calfire",
          kind: "evacuation_warning",
          severity: "severe",
          headline: "Evacuation Warning — Zones PAL-042, PAL-043",
          body: "Prepare to leave. Residents with mobility needs should leave now.",
          publishedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
          centroid: { lat: 34.07, lng: -118.56 },
        },
      ],
    },
    {
      tSec: 90,
      events: [
        {
          id: "calfire-evac-order",
          source: "calfire",
          kind: "evacuation_order",
          severity: "extreme",
          headline: "Evacuation ORDER — Zone PAL-043",
          body: "Leave immediately. Go east or north via open routes.",
          publishedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
          centroid: { lat: 34.052, lng: -118.552 },
        },
        {
          id: "caltrans-pch-close",
          source: "caltrans",
          kind: "road_closure",
          severity: "severe",
          headline: "PCH closed — Sunset Blvd to Topanga Cyn",
          body: "Southbound and northbound lanes closed for fire suppression.",
          publishedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
          centroid: { lat: 34.04, lng: -118.58 },
        },
        {
          id: "calfire-palisades",
          source: "calfire",
          kind: "fire_perimeter",
          severity: "extreme",
          headline: "Palisades Fire perimeter — 620 acres, 0% contained",
          body: "Rapid expansion. Northwest flank reaches residential zone.",
          publishedAt: new Date(Date.now() - 60 * 1000).toISOString(),
          centroid: { lat: 34.075, lng: -118.58 },
          url: "https://services3.arcgis.com",
        },
      ],
    },
  ],
};

/** Sonoma PSPS — red flag + public safety power shutoff. */
const sonomaPSPS: Scenario = {
  id: "sonoma-psps",
  title: "Red flag + power shutoff",
  blurb: "Prep state with escalating risk.",
  home: { lat: 38.5078, lng: -122.7633 },
  homeLabel: "Santa Rosa",
  destination: {
    label: "Mom's place (Petaluma)",
    address: "500 D St, Petaluma, CA",
    coords: { lat: 38.232, lng: -122.6364 },
  },
  frames: [
    {
      tSec: 0,
      events: [
        {
          id: "nws-rfw-son",
          source: "nws",
          kind: "red_flag",
          severity: "moderate",
          headline: "Red Flag Warning — North Bay Mountains",
          body: "Offshore wind event building overnight.",
          publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          centroid: { lat: 38.56, lng: -122.78 },
        },
      ],
    },
    {
      tSec: 40,
      events: [
        {
          id: "nws-rfw-son",
          source: "nws",
          kind: "red_flag",
          severity: "severe",
          headline: "Red Flag Warning — North Bay",
          body: "Gusts 45-70 mph, RH 8-12%. Extreme fire weather.",
          publishedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          centroid: { lat: 38.56, lng: -122.78 },
        },
        {
          id: "psps-pge",
          source: "scenario",
          kind: "power_shutoff",
          severity: "severe",
          headline: "PG&E PSPS — 21,000 customers in Sonoma County",
          body: "Estimated shutoff window starts in 2 hours.",
          publishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          centroid: { lat: 38.51, lng: -122.77 },
        },
      ],
    },
  ],
};

/** Inland Empire — distant perimeter, stays in watch. */
const inlandEmpireWatch: Scenario = {
  id: "inland-empire-prepare",
  title: "Slow burn, watchful calm",
  blurb: "Perimeter stays distant.",
  home: { lat: 34.1083, lng: -117.2898 }, // San Bernardino-ish
  homeLabel: "San Bernardino",
  destination: {
    label: "Aunt's house (Riverside)",
    address: "3400 University Ave, Riverside, CA",
    coords: { lat: 33.9753, lng: -117.3372 },
  },
  frames: [
    {
      tSec: 0,
      events: [
        {
          id: "nifc-cajon",
          source: "nifc",
          kind: "fire_perimeter",
          severity: "moderate",
          headline: "Cajon Pass Fire — 850 acres, 35% contained",
          body: "Stable perimeter, favorable winds expected.",
          publishedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
          centroid: { lat: 34.32, lng: -117.49 },
        },
        {
          id: "nws-hw-1",
          source: "nws",
          kind: "weather_alert",
          severity: "minor",
          headline: "Wind Advisory — Inland Empire",
          body: "Gusts 25-35 mph this afternoon.",
          publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          centroid: { lat: 34.1, lng: -117.29 },
        },
      ],
    },
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  [coastalPalisades.id]: coastalPalisades,
  [sonomaPSPS.id]: sonomaPSPS,
  [inlandEmpireWatch.id]: inlandEmpireWatch,
};

export function framesUpTo(scenario: Scenario, tSec: number): ScenarioFrame {
  let current = scenario.frames[0];
  for (const f of scenario.frames) {
    if (f.tSec <= tSec) current = f;
    else break;
  }
  return current ?? { tSec: 0, events: [] };
}
