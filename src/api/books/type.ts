import type { TrashedBookItem } from '../../../contracts/books';

export type EpubFile = ArrayBuffer;
export type TrashBookResponse = TrashedBookItem;
export type RestoreBookResponse = TrashedBookItem;

export interface DeleteBookResponse {
  bookId: string;
  deletedAt: number;
  wasPresent: boolean;
}

export interface BookImageResource {
  imageId: string;
  title: string;
  savedAt: number;
  url: string;
}

export interface BookResourcesResponse {
  resources: BookImageResource[];
}

export interface SaveBookResourceRequest {
  imageId: string;
  title: string;
}

export interface RenameBookResourceRequest {
  title: string;
}
