import type { VideoResource } from '../types';
import { serverRequest } from './serverApi';

export type ImportedYouTubeVideo = Omit<VideoResource, 'id' | 'createdAt' | 'updatedAt' | 'lastPositionSeconds'>;

export async function importYouTubeVideo(url: string) {
  const response = await serverRequest('/api/videos/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return response.json() as Promise<ImportedYouTubeVideo>;
}
