import { describe, it, expect } from 'vitest'
import { extractHtmlDocument } from '@/lib/agent/htmlDocument'

const DOC = `<!DOCTYPE html>
<html><head><style>body{margin:0}</style></head>
<body><h1>INDUSTRY READINESS PROGRAMME</h1></body>
</html>`

describe('extractHtmlDocument', () => {
  it('returns a clean reply unchanged', () => {
    const out = extractHtmlDocument(DOC)
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toBe('')
  })

  // The prod regression: the model narrated a denied tool call before printing
  // the document, and the sentence was rendered onto the exported PNG.
  it('drops a chat preamble before the doctype', () => {
    const raw = `The file write wasn't permitted, so here's the complete HTML document directly:\n\n${DOC}`
    const out = extractHtmlDocument(raw)
    expect(out?.html).toBe(DOC)
    expect(out?.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out?.discarded).toContain("file write wasn't permitted")
  })

  it('drops trailing commentary after </html>', () => {
    const out = extractHtmlDocument(`${DOC}\n\nLet me know if you'd like the headline larger.`)
    expect(out?.html).toBe(DOC)
    expect(out?.discarded).toContain('headline larger')
  })

  it('drops markdown fences, with or without a preamble', () => {
    expect(extractHtmlDocument(`\`\`\`html\n${DOC}\n\`\`\``)?.html).toBe(DOC)
    expect(extractHtmlDocument(`Here you go:\n\n\`\`\`html\n${DOC}\n\`\`\`\n`)?.html).toBe(DOC)
  })

  it('handles a lowercase doctype and a spaced closing tag', () => {
    const doc = '<!doctype html><html><body>hi</body></html   >'
    expect(extractHtmlDocument(`Sure:\n${doc}`)?.html).toBe(doc)
  })

  it('starts at <html> when the reply has no doctype', () => {
    const out = extractHtmlDocument('Here is the design:\n<html lang="en"><body>x</body></html>')
    expect(out?.html).toBe('<html lang="en"><body>x</body></html>')
  })

  it('ends at the LAST closing tag, keeping a nested document intact', () => {
    const raw = `${DOC}\n<!-- stray -->\n<html><body>second</body></html>`
    expect(extractHtmlDocument(raw)?.html).toContain('second')
  })

  it('keeps a truncated document but strips its dangling fence', () => {
    const out = extractHtmlDocument('Here:\n```html\n<!DOCTYPE html><html><body>cut off\n```')
    expect(out?.html).toBe('<!DOCTYPE html><html><body>cut off')
    expect(out?.html).not.toContain('```')
  })

  it('does not shift indices on non-Latin copy before the document', () => {
    // Turkish dotted capital İ lowercases to TWO code units — an indexOf on a
    // lowercased copy would cut the document one character short here.
    const raw = `İstanbul İİİ note:\n${DOC}`
    expect(extractHtmlDocument(raw)?.html).toBe(DOC)
  })

  it('preserves Sinhala content inside the document', () => {
    const doc = '<!DOCTYPE html><html><body><h1>සිංහල</h1></body></html>'
    expect(extractHtmlDocument(`Done:\n${doc}`)?.html).toBe(doc)
  })

  it('returns null when there is no document at all', () => {
    expect(extractHtmlDocument('I cannot create that design.')).toBeNull()
    expect(extractHtmlDocument('')).toBeNull()
  })

  it('is not fooled by a tag-like word in prose', () => {
    expect(extractHtmlDocument('The <htmlish> format is not a document.')).toBeNull()
  })
})
