// Extracts the HTML document out of a model's raw single-shot reply.
//
// Every CLI-mode design surface tells the model to answer with the document and
// nothing else ("No markdown code fences, no commentary" — prompts/shared.ts
// outputProtocol, prompts/refine.ts), but a single-shot reply is not a
// guaranteed shape. A run that reaches for a tool it wasn't granted narrates the
// fallback instead — an observed prod reply opened with "The file write wasn't
// permitted, so here's the complete HTML document directly:" and then printed
// the document.
//
// Anything left in front of the doctype is not inert: Chromium parses it as a
// text node, hoists it into <body>, and PAINTS it — a line of chat prose across
// the top of the finished post, the layout pushed down by its height, and the
// document in quirks mode because the doctype is no longer first. So the
// document is cut out here rather than trusted to arrive clean. This supersedes
// stripCodeFences for HTML replies: a fenced document is handled by the same cut
// (the fences fall outside the doctype…</html> window).
//
// Pure — no I/O — so the parsing is unit-testable.

export interface ExtractedHtmlDocument {
  html: string
  // The text that surrounded the document: chat preamble, trailing sign-off,
  // markdown fences. Dropped from the render and returned only so callers can
  // log it — a model that starts narrating is worth seeing in the logs, and the
  // narration usually names what it tried and failed to do.
  discarded: string
}

// A dangling closing fence on the tail, only relevant when there is no </html>
// to anchor the end of the document on.
const TRAILING_FENCE_RE = /\s*```[a-z]*\s*$/i

// Returns null when the reply contains no document at all (the caller decides
// how to fail — there is no salvaging a reply with no HTML in it).
export function extractHtmlDocument(raw: string): ExtractedHtmlDocument | null {
  // Located by regex rather than indexOf on a lowercased copy: toLowerCase can
  // change string LENGTH for some Unicode characters, which would shift every
  // index — and these replies legitimately carry non-Latin copy (Sinhala).
  const start = /<!doctype\b|<html\b/i.exec(raw)
  if (!start) return null

  // The LAST </html>, not the first: if the model emitted a stray nested
  // document, the outer one still ends at the final closing tag.
  const endRe = /<\/html\s*>/gi
  let end: RegExpExecArray | null = null
  for (let m = endRe.exec(raw); m; m = endRe.exec(raw)) end = m

  const html = end
    ? raw.slice(start.index, end.index + end[0].length)
    : // No closing tag — a truncated reply. Keep everything from the doctype on,
      // but drop a dangling code fence so it can't render as literal text.
      raw.slice(start.index).replace(TRAILING_FENCE_RE, '')

  const before = raw.slice(0, start.index)
  const after = end ? raw.slice(end.index + end[0].length) : ''

  return { html: html.trim(), discarded: `${before}\n${after}`.trim() }
}
