import type { VideoResource } from '../../contracts/domain';

export interface ImportYouTubeVideoRequest {
  url: string;
}

export type ImportedYouTubeVideo = Omit<
  VideoResource,
  'id' | 'createdAt' | 'updatedAt' | 'lastPositionSeconds'
>;
