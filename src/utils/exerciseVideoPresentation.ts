import { useMemo } from 'react';

export type VideoPresentation =
  | { kind: 'none' }
  | { kind: 'iframe'; src: string }
  | { kind: 'mp4' };

export function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split(/[?&#]/)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host.endsWith('youtube.com') || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shorts) return `https://www.youtube-nocookie.com/embed/${shorts[1]}`;
      const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (embed) return `https://www.youtube-nocookie.com/embed/${embed[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function getVimeoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.includes('vimeo.com')) return null;
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
  } catch {
    return null;
  }
}

export function getVideoPresentation(videoUrl: string): VideoPresentation {
  const t = videoUrl.trim();
  if (!t) return { kind: 'none' };
  const yt = getYoutubeEmbedUrl(t);
  if (yt) return { kind: 'iframe', src: yt };
  const vm = getVimeoEmbedUrl(t);
  if (vm) return { kind: 'iframe', src: vm };
  return { kind: 'mp4' };
}

export function getVideoIframeSrc(presentation: VideoPresentation): string {
  if (presentation.kind !== 'iframe') return '';
  const base = presentation.src;
  if (base.includes('youtube-nocookie.com') || base.includes('youtube.com')) {
    return base.includes('?') ? `${base}&rel=0` : `${base}?rel=0`;
  }
  return base;
}

export function useVideoPresentation(videoUrl: string): VideoPresentation {
  return useMemo(() => getVideoPresentation(videoUrl), [videoUrl]);
}
