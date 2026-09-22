/**
 * `_Cleaned_Final_Data_6_2_2020.csv` is UTF-8 almost everywhere, but 39
 * bytes — all inside the `Reference` column's pasted citation text, e.g.
 * `"...Coordination,\xA0Chem. Mater.\xA02018,\xA030, 5759-\xA05769."` — are
 * raw Windows-1252 bytes that were never transcoded to UTF-8: 37 are `0xA0`
 * (non-breaking space) and 2 are `0x96` (en dash, in the page range
 * "104-109" of one citation). Node's default `Buffer#toString("utf8")` (and
 * Python's `errors="replace"`) silently turns each into a `U+FFFD`
 * replacement character, which would ship visible "�" glyphs in citations
 * shown in the app. `data/reference/_Cleaned_Final_Data-forML_6_2_2020.csv`
 * has no such bytes and decodes as a strict no-op under this function.
 *
 * This decodes the buffer as UTF-8, and for any byte sequence that isn't
 * valid UTF-8, reinterprets just the offending byte as **Windows-1252** and
 * resumes scanning from the next byte. cp1252 rather than Latin-1 matters:
 * the two agree on 0xA0, but Latin-1 maps 0x96 to an invisible C1 control
 * character where cp1252 correctly yields U+2013 EN DASH. Valid multi-byte sequences
 * (including ones that legitimately end in a continuation-range byte) pass
 * through untouched.
 */
export function decodeLenientUtf8(buffer: Buffer): string {
  const codePoints: number[] = [];
  let i = 0;
  const n = buffer.length;

  while (i < n) {
    const byte0 = buffer[i];

    if (byte0 < 0x80) {
      codePoints.push(byte0);
      i += 1;
      continue;
    }

    const sequence = readUtf8Sequence(buffer, i);
    if (sequence) {
      codePoints.push(sequence.codePoint);
      i += sequence.length;
    } else {
      // Not a valid UTF-8 lead byte, or a lead byte without valid
      // continuation bytes: treat this one byte as Windows-1252.
      codePoints.push(CP1252_C1[byte0 - 0x80] ?? byte0);
      i += 1;
    }
  }

  // Assemble in chunks: spreading ~1.3M code points into a single
  // `String.fromCodePoint` call risks exceeding the engine's argument-count
  // limit for one file this size.
  const CHUNK_SIZE = 0x8000;
  let result = "";
  for (let start = 0; start < codePoints.length; start += CHUNK_SIZE) {
    result += String.fromCodePoint(...codePoints.slice(start, start + CHUNK_SIZE));
  }
  return result;
}

/**
 * Windows-1252's 0x80-0x9F range, which is where it diverges from Latin-1.
 * Latin-1 maps these to invisible C1 control characters; cp1252 maps them to
 * the typographic characters Word/Excel actually emit. The source CSV really
 * does contain both kinds of stray byte — 37x 0xA0 (identical in both
 * encodings) and 2x 0x96, which is an en dash in a citation's page range
 * ("104-109") and a useless control character under Latin-1.
 *
 * `undefined` marks the five slots cp1252 leaves undefined; those fall back to
 * the raw byte value.
 */
const CP1252_C1: readonly (number | undefined)[] = [
  0x20ac,
  undefined,
  0x201a,
  0x0192,
  0x201e,
  0x2026,
  0x2020,
  0x2021, // 0x80-0x87
  0x02c6,
  0x2030,
  0x0160,
  0x2039,
  0x0152,
  undefined,
  0x017d,
  undefined, // 0x88-0x8F
  undefined,
  0x2018,
  0x2019,
  0x201c,
  0x201d,
  0x2022,
  0x2013,
  0x2014, // 0x90-0x97
  0x02dc,
  0x2122,
  0x0161,
  0x203a,
  0x0153,
  undefined,
  0x017e,
  0x0178, // 0x98-0x9F
];

interface Utf8Sequence {
  readonly codePoint: number;
  readonly length: number;
}

function readUtf8Sequence(buffer: Buffer, start: number): Utf8Sequence | null {
  const byte0 = buffer[start];
  let length: number;
  let codePoint: number;

  if ((byte0 & 0xe0) === 0xc0) {
    length = 2;
    codePoint = byte0 & 0x1f;
  } else if ((byte0 & 0xf0) === 0xe0) {
    length = 3;
    codePoint = byte0 & 0x0f;
  } else if ((byte0 & 0xf8) === 0xf0) {
    length = 4;
    codePoint = byte0 & 0x07;
  } else {
    return null; // stray continuation byte (0x80-0xBF) or an invalid lead byte (0xF8-0xFF)
  }

  for (let k = 1; k < length; k++) {
    const byteK = buffer[start + k];
    if (byteK === undefined || (byteK & 0xc0) !== 0x80) return null;
    codePoint = (codePoint << 6) | (byteK & 0x3f);
  }

  // Reject overlong encodings, surrogate code points, and out-of-range values.
  const minForLength = length === 2 ? 0x80 : length === 3 ? 0x800 : 0x10000;
  if (codePoint < minForLength || codePoint > 0x10ffff) return null;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;

  return { codePoint, length };
}
