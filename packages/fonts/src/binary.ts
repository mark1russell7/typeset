/** A big-endian reader over a part of a font file. The offsets are relative to the start of the part. */
export class Reader {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  u8(offset: number): number {
    return this.view.getUint8(offset);
  }

  u16(offset: number): number {
    return this.view.getUint16(offset);
  }

  i16(offset: number): number {
    return this.view.getInt16(offset);
  }

  u32(offset: number): number {
    return this.view.getUint32(offset);
  }

  tag(offset: number): string {
    return String.fromCharCode(this.u8(offset), this.u8(offset + 1), this.u8(offset + 2), this.u8(offset + 3));
  }

  /** This method gives a reader over the bytes from `offset`, with the length `length` or to the end. */
  part(offset: number, length?: number): Reader {
    const end = length === undefined ? this.bytes.byteLength : offset + length;
    if (offset < 0 || end > this.bytes.byteLength || offset > end) throw new RangeError(`the part ${offset}..${end} is outside ${this.bytes.byteLength} bytes`);
    return new Reader(this.bytes.subarray(offset, end));
  }
}
