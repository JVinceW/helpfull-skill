# resumeio-to-html

Convert any resume.io resume into a standalone, parametric HTML CV using the
"Corporate" template. Works for any user — just point it at their resume id or
let it discover one from the open tab.

## Trigger phrases
The skill should activate on any of these (case-insensitive, substring match):
- "resumeio to html"
- "regenerate my resume html"
- "rebuild resume from resume.io"
- "refresh my CV html"
- "export resume.io as html"
- "convert resume.io to local"

## Inputs (all optional)
| Input          | Default                              | Notes                                  |
|----------------|--------------------------------------|----------------------------------------|
| `resumeId`     | discover from active resume.io tab   | numeric id, e.g. 4327933               |
| `templateName` | "corporate"                          | currently the only supported template  |
| `includeAvatar`| true                                 | set false to omit profile picture      |
| `printOptimize`| true                                 | keeps @media print rules                |

## Preconditions
1. User must have an active browser tab logged into https://resume.io
2. Active tab URL must be on the resume.io domain OR the user must provide a resumeId

If preconditions fail: STOP, tell the user what's missing, do not attempt login.

## Deterministic steps
1. Get the resume id:
   - If user provided one → use it.
   - Else parse the URL of the active resume.io tab for `/resumes/(\d+)`.
   - Else ask the user.
2. Fetch `GET https://resume.io/api/app/resumes/{resumeId}` with credentials.
   - If 401/403 → tell user to log in, stop.
   - If 404 → tell user the id is wrong, stop.
3. Transform the response using `mapping.md` rules into a `RESUME` JSON object
   matching the schema in `template-reference.html`.
4. Inline the `RESUME` object into the template (replace the
   `/* INJECT_RESUME_HERE */` marker).
5. Return the full HTML as a single code block. Do not split, do not abbreviate.
6. If user said "save it" or "download it" — STOP first and ask for explicit
   confirmation (file downloads require user permission).

## Output contract
- Single self-contained `.html` file
- No external runtime dependencies (Google Fonts link is optional and degrades
  gracefully)
- Opens via `file://` with no errors
- Renders identically to the resume.io Corporate preview, modulo font swap
  (Source Sans Pro → Source Sans 3 fallback)
- When a PDF is requested from local HTML in this repo, run
  `node tools/resume-html-to-pdf.mjs <input.html> [output.pdf]`. This uses
  Chrome's DevTools PDF API with print backgrounds, CSS page size, and zero
  margins instead of the interactive Chrome print dialog defaults.
- To add blank header/footer space between PDF pages, pass margins in inches,
  for example `--margin-top 0.3 --margin-bottom 0.3`.

## Things this skill must NOT do
- Click "Download as PDF" on resume.io (requires paid plan)
- Persist the resume JSON anywhere outside the active conversation
- Modify the template's CSS classes/structure
- Auto-log-in or auto-fill credentials
- Scrape any data beyond the single `/api/app/resumes/{id}` endpoint

## Failure modes & messages
| Symptom                          | Action                                                    |
|----------------------------------|-----------------------------------------------------------|
| API returns 401/403              | "Please log into resume.io in your browser, then re-run." |
| API returns empty `attributes`   | Try parsing top-level keys directly (schema variation).   |
| Field missing in response        | Drop the section silently; note it in a comment block.    |
| New field appears in response    | Ignore unknown fields; do not crash.                      |
| Cyrillic/CJK characters in text  | Preserve as-is; the template handles unicode.             |

## Versioning
- Schema v1 (this file): resume.io API as of May 2026, flat top-level JSON.
- When resume.io changes shape, bump to v2 and update `mapping.md`.
