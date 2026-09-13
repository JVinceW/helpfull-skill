# Trigger snippets - paste any of these into a fresh Codex session

## Full Instruction

I have a saved skill called `resumeio-to-html`. It converts a resume.io resume into a standalone HTML CV using my Corporate template. Please:

1. Open or focus my resume.io tab if browser access is available.
2. Detect the resume id from the URL, or ask me if you cannot find it.
3. Fetch `/api/app/resumes/{id}` with my existing browser credentials.
4. Map fields using the saved `references/mapping.md`.
5. Inject the resulting `RESUME` object into `references/template-reference.html`.
6. Return the finished HTML as one complete file.

## Short Form

Run `resumeio-to-html` for resume `{ID}`.

## Default Everything

Refresh my resume HTML.

## Different User

Use `resumeio-to-html` for a friend. Their resume id is `{ID}`. They are logged into resume.io in this browser. Return the HTML and do not save anything.

## Overrides

Run `resumeio-to-html` for resume `{ID}`, no avatar, accent color `#1f3a8a`.

