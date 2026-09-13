// lib/pdfTextSafety.js
// Shared by every pdf-lib report builder. pdf-lib's standard fonts only
// support the WinAnsi character set — any other character (smart quotes/
// dashes from pasted or dictated text, emoji, checkmarks, arrows, CJK,
// etc.) makes font.widthOfTextAtSize/drawText throw ("WinAnsi cannot
// encode ..."), which takes down the whole PDF request with a 500 for any
// record whose free text, AI summary, or dictation happens to contain
// one. Common punctuation is mapped to a safe ASCII equivalent first;
// anything still unencodable is dropped rather than failing the request.

const PDF_SAFE_REPLACEMENTS = {
  '‘': "'", '’': "'", '‚': "'",
  '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '―': '-',
  '…': '...', '•': '-', '×': 'x',
  '→': '->', '←': '<-', '✓': 'v', '✅': 'v', '❌': 'x',
};

const PDF_SAFE_PATTERN =
  /[‘’‚“”„–—―…•×→←✓✅❌]/g;

export function sanitizeForFont(font, text) {
  const replaced = String(text).replace(PDF_SAFE_PATTERN, (ch) => PDF_SAFE_REPLACEMENTS[ch] ?? '');
  let out = '';
  for (const ch of replaced) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch {
      // Not in this font's encoding (emoji, CJK, other exotic symbols) —
      // drop the character rather than fail the whole PDF.
    }
  }
  return out;
}
