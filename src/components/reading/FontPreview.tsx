import type { ReaderFont } from '../../../contracts/reading';
import { READER_FONT_STACKS } from '../../util/reading/readerFonts';
export function FontPreview({ font, label }: { font: ReaderFont; label: string }) {
  return (
    <span className="reader-font-option" style={{ fontFamily: READER_FONT_STACKS[font] }}>
      {label}
    </span>
  );
}
