import type { VideoResource } from '../../../contracts/videos';

export interface ImportYouTubeVideoRequest {
  url: string;
}

export type ImportedYouTubeVideo = Omit<
  VideoResource,
  'id' | 'createdAt' | 'updatedAt' | 'lastPositionSeconds'
>;
