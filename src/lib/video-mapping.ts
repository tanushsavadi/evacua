// Maps fire incident names to video URLs for live feed display
const videoMapping: Record<string, string> = {
  'palace of fine arts': '/videos/palace-of-fine-arts-fire.mp4',
  'palace of fine arts fire': '/videos/palace-of-fine-arts-fire.mp4',
  'golden gate park': '/videos/golden-gate-park-fire.mp4',
  'golden gate park fire': '/videos/golden-gate-park-fire.mp4',
  'twin peaks': '/videos/twin-peaks-fire.mp4',
  'twin peaks fire': '/videos/twin-peaks-fire.mp4',
  'pine ridge fire': '/videos/pine-ridge-fire.mp4',
  'redwood valley fire': '/videos/redwood-valley-fire.mp4',
  'test fire': '/videos/test-fire.mp4',
};

export function getVideoForIncident(incidentName: string): string | null {
  if (!incidentName) return null;
  const key = incidentName.toLowerCase().trim();
  return videoMapping[key] || null;
}

export function hasVideoForIncident(incidentName: string): boolean {
  return getVideoForIncident(incidentName) !== null;
}
