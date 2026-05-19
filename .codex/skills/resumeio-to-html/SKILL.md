---
name: resumeio-to-html
description: Convert a resume.io resume into a standalone, self-contained HTML CV using the Corporate template. Use when the user asks to export, refresh, rebuild, regenerate, or convert a resume.io resume to local HTML, optionally from a resume id or an active logged-in resume.io browser session.
---

# resumeio-to-html

Convert any resume.io resume into a standalone, parametric HTML CV using the Corporate template.

## Trigger Phrases

Use this skill when the user says any close variant of:

- "resumeio to html"
- "regenerate my resume html"
- "rebuild resume from resume.io"
- "refresh my CV html"
- "export resume.io as html"
- "convert resume.io to local"

## Inputs

All inputs are optional unless discovery fails.

| Input | Default | Notes |
| --- | --- | --- |
| `resumeId` | Discover from active resume.io tab | Numeric id, for example `4327933` |
| `templateName` | `corporate` | Currently the only supported template |
| `includeAvatar` | `true` | Set false to omit profile picture |
| `printOptimize` | `true` | Keeps `@media print` rules |

## Preconditions

1. The user must already be logged into `https://resume.io` in the browser, or must provide resume JSON directly.
2. The active tab URL must be on the resume.io domain, or the user must provide a `resumeId`.

If preconditions fail, stop and say what is missing. Do not attempt login, autofill credentials, or bypass authentication.

## Workflow

1. Determine the resume id:
   - If the user provided one, use it.
   - Else parse the active resume.io tab URL for `/resumes/(\d+)`.
   - Else ask the user for the id.
2. Fetch `GET https://resume.io/api/app/resumes/{resumeId}` with browser credentials when browser automation is available.
   - If network/browser access is unavailable, ask the user to provide exported JSON or allow the required access.
   - If `401` or `403`, tell the user to log into resume.io and stop.
   - If `404`, tell the user the id is wrong and stop.
3. Read `references/mapping.md` and transform the API response into a `RESUME` JSON object.
4. Read `references/template-reference.html`.
5. Replace the `/* INJECT_RESUME_HERE */` marker with `window.RESUME = { ... };`.
6. Return or save the full HTML according to the user's request.

## Output Contract

- Single self-contained `.html` file.
- No external runtime dependencies.
- Opens via `file://` with no JavaScript errors.
- Preserves unicode text exactly.
- Renders according to the Corporate template in `references/template-reference.html`.
- When a PDF is requested from local HTML in this repo, run
  `node tools/resume-html-to-pdf.mjs <input.html> [output.pdf]`. This uses
  Chrome's DevTools PDF API with print backgrounds, CSS page size, and zero
  margins instead of the interactive Chrome print dialog defaults.
- To add blank header/footer space between PDF pages, pass margins in inches,
  for example `--margin-top 0.3 --margin-bottom 0.3`.

## Constraints

- Do not click resume.io's "Download as PDF" flow.
- Do not persist resume JSON outside the active task unless the user explicitly asks to save a file.
- Do not modify the template CSS classes or structure unless the user asks for design changes.
- Do not scrape data beyond the single `/api/app/resumes/{id}` endpoint.
- Ignore unknown API fields.
- Drop missing sections silently, then mention omitted sections briefly.

## References

- `references/mapping.md`: resume.io API to `RESUME` schema mapping.
- `references/template-reference.html`: Corporate HTML template and embedded schema.
- `references/trigger-snippets.md`: user-facing prompt examples.

## Versioning

Schema v1: resume.io API as of May 2026, flat top-level JSON.
