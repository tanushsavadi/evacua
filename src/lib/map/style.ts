import type { Map as MapLibreMap } from "maplibre-gl";

/** OpenFreeMap — no token, CC-BY OpenStreetMap contributors */
export const EVACUA_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";

/**
 * Paint-layer overrides applied after the style loads. Positron is a
 * light style; we invert and desaturate it to an OLED-friendly
 * cinematic dark. Ember/cyan overlays stay dominant.
 */
export function applyOledOverrides(map: MapLibreMap) {
  const style = map.getStyle();
  if (!style?.layers) return;

  const set = (id: string, prop: string, value: unknown) => {
    if (!map.getLayer(id)) return;
    try {
      map.setPaintProperty(id, prop as never, value as never);
    } catch {
      /* ignore missing props */
    }
  };

  for (const layer of style.layers) {
    const id = layer.id;
    // Backgrounds & landmasses → deep charcoal
    if (layer.type === "background") {
      set(id, "background-color", "#07080a");
    }

    // Water → inky navy
    if (/water/i.test(id)) {
      if (layer.type === "fill") set(id, "fill-color", "#0a1220");
      if (layer.type === "line") set(id, "line-color", "#142334");
    }

    // Parks / forest → quiet green-black
    if (/(park|forest|wood|grass|landcover|nature|landuse_overlay)/i.test(id)) {
      if (layer.type === "fill") {
        set(id, "fill-color", "#0a1210");
        set(id, "fill-opacity", 0.55);
      }
    }

    // Residential / industrial / built-up → faint charcoal
    if (/(residential|commercial|industrial|urban|building|landuse)/i.test(id)) {
      if (layer.type === "fill") {
        set(id, "fill-color", "#0c0d10");
        set(id, "fill-opacity", 0.6);
      }
    }

    // Roads → muted neutral, scaled by hierarchy
    if (layer.type === "line" && /road|street|highway|motorway|tunnel|bridge/i.test(id)) {
      if (/motorway|trunk/i.test(id)) set(id, "line-color", "#2a313c");
      else if (/primary|secondary/i.test(id)) set(id, "line-color", "#1f242d");
      else if (/tertiary/i.test(id)) set(id, "line-color", "#191d24");
      else set(id, "line-color", "#141820");
    }

    // Boundaries → dashed subtle
    if (/boundary|admin/i.test(id) && layer.type === "line") {
      set(id, "line-color", "#1b2028");
      set(id, "line-opacity", 0.5);
    }

    // Labels → soft gray, dark halo
    if (layer.type === "symbol") {
      set(id, "text-color", "#8089a0");
      set(id, "text-halo-color", "#07080a");
      set(id, "text-halo-width", 1.1);
      set(id, "text-halo-blur", 0.6);
    }
  }
}
