# Trigger snippets — paste any of these into a fresh Claude session

## A. Full instruction (use this the very first time, or with a new account)
> I have a saved skill called `resumeio-to-html`. It converts a resume.io
> resume into a standalone HTML CV using my Corporate template. Please:
> 1) Open or focus my resume.io tab (I'm already logged in).
> 2) Detect the resume id from the URL, OR ask me if you can't find it.
> 3) Fetch `/api/app/resumes/{id}` and map fields per my saved mapping.md.
> 4) Inject the resulting RESUME object into my saved template-reference.html.
> 5) Return the finished HTML as one code block I can save.
>
> The template, mapping rules, and schema are in my files
> (template-reference.html, mapping.md, SKILL.md). If you don't have them,
> ask me to paste them.

## B. Short form (once Claude has seen the files in this thread)
> Run resumeio-to-html for resume {ID}.

## C. Default everything
> Refresh my resume HTML.

## D. For a different user (delegating)
> Use my resumeio-to-html skill for a friend. Their resume id is {ID}.
> They are logged into resume.io in this browser. Return the HTML; don't
> save anything.

## E. With overrides
> Run resumeio-to-html for resume {ID}, no avatar, accent color #1f3a8a.