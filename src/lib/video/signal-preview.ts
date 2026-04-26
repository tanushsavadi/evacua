export interface FireVideo {
  name: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  description?: string;
}

export type SignalVideo = {
  type: "mp4";
  url: string;
  title: string;
  attribution?: string;
};

export const FIRE_VIDEOS: Record<string, FireVideo> = {
  'Pine Ridge Fire': {
    name: 'Pine Ridge Fire',
    videoUrl: '/videos/pine-ridge-fire.mp4',
    description: 'Live footage from Pine Ridge Fire operations'
  },
  'Redwood Valley Fire': {
    name: 'Redwood Valley Fire', 
    videoUrl: '/videos/redwood-valley-fire.mp4',
    description: 'Live footage from Redwood Valley Fire operations'
  },
  'Test Fire': {
    name: 'Test Fire',
    videoUrl: '/videos/pine-ridge-fire.mp4',
    description: 'Simulation environment test feed'
  }
};

export function getFireVideo(fireName: string | null): FireVideo | null {
  if (!fireName) return null;
  
  if (FIRE_VIDEOS[fireName]) {
    return FIRE_VIDEOS[fireName];
  }
  
  const normalizedName = fireName.toLowerCase().trim();
  for (const [key, video] of Object.entries(FIRE_VIDEOS)) {
    if (key.toLowerCase().includes(normalizedName) || normalizedName.includes(key.toLowerCase())) {
      return video;
    }
  }
  
  return null;
}

export function isVideoAvailable(fireName: string | null): boolean {
  const video = getFireVideo(fireName);
  return !!video?.videoUrl;
}

export function getSignalVideo(event: { headline?: string | null } | null): SignalVideo | null {
  const video = getFireVideo(event?.headline ?? null);
  if (!video?.videoUrl) return null;

  return {
    type: "mp4",
    url: video.videoUrl,
    title: video.description ?? video.name,
    attribution: video.name,
  };
}
