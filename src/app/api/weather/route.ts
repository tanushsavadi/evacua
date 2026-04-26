import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    weather_code?: number;
  };
  current_units?: {
    temperature_2m?: string;
    wind_speed_10m?: string;
  };
};

type OpenMeteoAirResponse = {
  current?: {
    us_aqi?: number;
    pm2_5?: number;
    pm10?: number;
  };
};

function weatherLabel(code: number | undefined): string {
  if (code == null) return "Unknown";
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

function windDirLabel(deg: number | undefined): string {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx]!;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng") ?? searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid latitude or longitude" }, { status: 400 });
  }

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code";
  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
    "&current=us_aqi,pm2_5,pm10";

  try {
    const [wRes, aRes] = await Promise.all([
      fetch(weatherUrl, { cache: "no-store" }),
      fetch(airUrl, { cache: "no-store" }),
    ]);
    if (!wRes.ok) {
      return NextResponse.json({ error: "weather upstream failed" }, { status: 502 });
    }
    const weather = (await wRes.json()) as OpenMeteoResponse;
    const air = aRes.ok ? ((await aRes.json()) as OpenMeteoAirResponse) : undefined;

    const tempC = weather.current?.temperature_2m ?? null;
    const tempF = tempC == null ? null : (tempC * 9) / 5 + 32;
    const windKmh = weather.current?.wind_speed_10m ?? null;
    const windMph = windKmh == null ? null : windKmh * 0.621371;

    const humidity = weather.current?.relative_humidity_2m ?? null;
    const aqi = air?.current?.us_aqi ?? null;
    const fireRiskScore =
      (humidity == null ? 40 : Math.max(0, Math.min(100, 100 - humidity))) * 0.45 +
      (windMph == null ? 12 : Math.max(0, Math.min(40, windMph)) * 2) * 0.4 +
      (tempF == null ? 75 : Math.max(40, Math.min(120, tempF)) - 40) * 0.25;
    const fireRiskPct = Math.max(0, Math.min(100, Math.round(fireRiskScore)));

    return NextResponse.json({
      computedAt: new Date().toISOString(),
      weather: {
        label: weatherLabel(weather.current?.weather_code),
        temperatureF: tempF,
        humidityPct: humidity,
        windMph,
        windDeg: weather.current?.wind_direction_10m ?? null,
        windDir: windDirLabel(weather.current?.wind_direction_10m),
      },
      air: {
        aqi,
        pm25: air?.current?.pm2_5 ?? null,
        pm10: air?.current?.pm10 ?? null,
      },
      risk: {
        fireRiskPct,
      },
    });
  } catch {
    return NextResponse.json({ error: "weather unavailable" }, { status: 502 });
  }
}
