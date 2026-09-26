import type { ImportedYouTubeVideo, ImportYouTubeVideoRequest } from './type';
import { apiTransport } from '../http/transport';

class VideosApi {
  constructor(private readonly transport = apiTransport) {}

  importYouTubeVideo(input: ImportYouTubeVideoRequest): Promise<ImportedYouTubeVideo> {
    return this.transport.json('/api/videos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
}

export const videosApi = new VideosApi();
