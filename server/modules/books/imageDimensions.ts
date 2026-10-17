import { open, type FileHandle } from 'node:fs/promises';
import { errorHasCode } from '../../infrastructure/http/errors.js';

// PNG dimensions are in IHDR; reading 24 bytes avoids loading the image body.
export async function readPngDimensions(path: string) {
  let file: FileHandle;
  try {
    file = await open(path, 'r');
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (
      bytesRead !== header.length ||
      !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      header.readUInt32BE(8) !== 13 ||
      header.toString('ascii', 12, 16) !== 'IHDR'
    )
      return undefined;
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    return width > 0 && height > 0 && width <= 0x7fffffff && height <= 0x7fffffff
      ? { width, height }
      : undefined;
  } finally {
    await file.close();
  }
}
