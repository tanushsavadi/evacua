import { NextResponse } from "next/server";

const UA =
  process.env.NOMINATIM_UA ?? "Evacua/0.1 (https://evacua.app)";

export const runtime = "nodejs";
export const revalidate = 60;

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: string[];
  address?: Record<string, string>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  // Bias toward California for our MVP
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", "-124.5,42.1,-114.0,32.5");
  url.searchParams.set("bounded", "0");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Geocoder upstream ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as NominatimResult[];
    const results = data.map((r) => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      displayName: r.display_name,
      address: r.address ?? {},
    }));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Unknown geocoder error",
      },
      { status: 502 },
    );
  }
}
