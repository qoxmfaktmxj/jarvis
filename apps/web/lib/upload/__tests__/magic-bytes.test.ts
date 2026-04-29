import { describe, it, expect } from 'vitest';
import { verifyMagicBytes } from '../magic-bytes';

// Helper: build a Uint8Array from a hex string like "89504e47" or from raw bytes
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function fromAscii(str: string): Uint8Array {
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    buf[i] = str.charCodeAt(i);
  }
  return buf;
}

// ─── PDF ────────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — application/pdf', () => {
  it('accepts a real PDF header (%PDF-)', () => {
    const bytes = fromAscii('%PDF-1.7\nsome content');
    expect(verifyMagicBytes(bytes, 'application/pdf')).toEqual({ ok: true });
  });

  it('rejects PNG bytes declared as PDF (spoof 1)', () => {
    const bytes = fromHex('89504e47'); // PNG magic
    const result = verifyMagicBytes(bytes, 'application/pdf');
    expect(result.ok).toBe(false);
  });
});

// ─── PNG ────────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — image/png', () => {
  it('accepts correct PNG magic (89 50 4E 47 0D 0A 1A 0A)', () => {
    const bytes = fromHex('89504e470d0a1a0a');
    expect(verifyMagicBytes(bytes, 'image/png')).toEqual({ ok: true });
  });

  it('rejects PDF bytes declared as PNG (spoof 2)', () => {
    const bytes = fromAscii('%PDF-1.7\n');
    const result = verifyMagicBytes(bytes, 'image/png');
    expect(result.ok).toBe(false);
  });

  it('rejects HTML declared as image/png (spoof 3 — XSS vector)', () => {
    const bytes = fromAscii('<html><body><script>alert(1)</script></body></html>');
    const result = verifyMagicBytes(bytes, 'image/png');
    expect(result.ok).toBe(false);
  });
});

// ─── JPEG ───────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — image/jpeg', () => {
  it('accepts correct JPEG magic (FF D8 FF)', () => {
    const bytes = fromHex('ffd8ffe0');
    expect(verifyMagicBytes(bytes, 'image/jpeg')).toEqual({ ok: true });
  });

  it('rejects EXE bytes declared as image/jpeg (spoof 4)', () => {
    const bytes = fromHex('4d5a9000'); // MZ header (Windows PE)
    const result = verifyMagicBytes(bytes, 'image/jpeg');
    expect(result.ok).toBe(false);
  });
});

// ─── GIF ────────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — image/gif', () => {
  it('accepts GIF87a header', () => {
    const bytes = fromAscii('GIF87a');
    expect(verifyMagicBytes(bytes, 'image/gif')).toEqual({ ok: true });
  });

  it('accepts GIF89a header', () => {
    const bytes = fromAscii('GIF89a');
    expect(verifyMagicBytes(bytes, 'image/gif')).toEqual({ ok: true });
  });

  it('rejects SVG declared as image/gif (spoof 5 — XSS vector)', () => {
    const bytes = fromAscii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const result = verifyMagicBytes(bytes, 'image/gif');
    expect(result.ok).toBe(false);
  });
});

// ─── ZIP ────────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — application/zip', () => {
  it('accepts ZIP magic (PK\\x03\\x04)', () => {
    const bytes = fromHex('504b0304');
    expect(verifyMagicBytes(bytes, 'application/zip')).toEqual({ ok: true });
  });

  it('rejects PDF declared as ZIP (spoof 6)', () => {
    const bytes = fromAscii('%PDF-1.4\n');
    const result = verifyMagicBytes(bytes, 'application/zip');
    expect(result.ok).toBe(false);
  });
});

// ─── DOCX (OOXML = ZIP inside) ───────────────────────────────────────────────
describe('verifyMagicBytes — application/vnd.openxmlformats-officedocument.wordprocessingml.document', () => {
  it('accepts DOCX (has PK\\x03\\x04 ZIP magic)', () => {
    const bytes = fromHex('504b0304');
    expect(
      verifyMagicBytes(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toEqual({ ok: true });
  });

  it('rejects EXE declared as DOCX (spoof 7 — RCE vector)', () => {
    const bytes = fromHex('4d5a9000');
    const result = verifyMagicBytes(
      bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(result.ok).toBe(false);
  });
});

// ─── XLSX ────────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', () => {
  it('accepts XLSX (PK ZIP magic)', () => {
    const bytes = fromHex('504b0304');
    expect(
      verifyMagicBytes(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).toEqual({ ok: true });
  });
});

// ─── PPTX ────────────────────────────────────────────────────────────────────
describe('verifyMagicBytes — application/vnd.openxmlformats-officedocument.presentationml.presentation', () => {
  it('accepts PPTX (PK ZIP magic)', () => {
    const bytes = fromHex('504b0304');
    expect(
      verifyMagicBytes(bytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    ).toEqual({ ok: true });
  });
});

// ─── text/plain ─────────────────────────────────────────────────────────────
describe('verifyMagicBytes — text/plain', () => {
  it('accepts normal text', () => {
    const bytes = fromAscii('Hello, this is a plain text file.\nWith multiple lines.');
    expect(verifyMagicBytes(bytes, 'text/plain')).toEqual({ ok: true });
  });

  it('rejects HTML leading < declared as text/plain (spoof 8 — XSS vector)', () => {
    const bytes = fromAscii('<html><body>hello</body></html>');
    const result = verifyMagicBytes(bytes, 'text/plain');
    expect(result.ok).toBe(false);
  });

  it('rejects binary (NUL byte in first 256) declared as text/plain', () => {
    // Build a buffer with a NUL byte in the middle
    const str = 'normal text';
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
    buf[5] = 0x00; // inject NUL
    const result = verifyMagicBytes(buf, 'text/plain');
    expect(result.ok).toBe(false);
  });
});

// ─── text/markdown ──────────────────────────────────────────────────────────
describe('verifyMagicBytes — text/markdown', () => {
  it('accepts markdown content', () => {
    const bytes = fromAscii('# Heading\n\nSome **bold** text.');
    expect(verifyMagicBytes(bytes, 'text/markdown')).toEqual({ ok: true });
  });

  it('rejects HTML leading < declared as text/markdown (spoof 9)', () => {
    const bytes = fromAscii('<script>alert(1)</script>');
    const result = verifyMagicBytes(bytes, 'text/markdown');
    expect(result.ok).toBe(false);
  });
});

// ─── Unknown MIME ────────────────────────────────────────────────────────────
describe('verifyMagicBytes — unknown MIME', () => {
  it('rejects an unknown MIME type with ok:false', () => {
    const bytes = fromAscii('some bytes');
    const result = verifyMagicBytes(bytes, 'application/octet-stream');
    expect(result.ok).toBe(false);
  });
});
