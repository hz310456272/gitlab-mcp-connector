export function isBinary(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      return true;
    }
  }
  return false;
}

export function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}
