# Google Sheets (optional)

Use only when the user asks for Google Sheets. Needs browser automation in a browser
already signed in to the user's Google account. Never sign in or type credentials.


## A. Convert generated workbooks (recommended)

1. Get the `.xlsx` into Drive:
   - If `trackerDir` is inside a Google Drive for desktop folder, it syncs by itself.
   - Otherwise ask the user to upload it, or get explicit permission before using a
     browser file-upload control.
2. After sync, open the Drive folder and read file ids from the `[data-id]` attributes,
   then open `https://docs.google.com/spreadsheets/d/<id>/edit`.
3. File → **Save as Google Sheets**. A native copy opens in a new tab, in the same folder.
4. Verify against the server, not the screen. From any `docs.google.com` tab:
   `fetch('/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&headers=0&sheet=<sheet name>&range=A1:F12')`
   and compare with the JSON summary printed by the scripts.
5. The `.xlsx` stays in Drive next to the native copy. Remove it only with the user's
   consent (it goes to Drive trash).

The generated layouts avoid merged cells that end in an all-empty column, because the
xlsx importer clips such merges. If you customize a layout, re-check merges after import.


## B. Editing an existing Google Sheet through the browser

For users who keep a hand-made monthly template instead of generated workbooks.

- **Copy last month**: File → Make a copy. Wait until the dialog is fully rendered,
  click the Name input, and confirm `document.activeElement.tagName === 'INPUT'` before
  typing. Otherwise keystrokes land in the source sheet; press Escape to discard an
  uncommitted cell edit, then verify that cell from the server.
- **Navigate**: use the Name box (Ctrl+J), type `Sheet!A2:J68`, press Enter, and confirm
  `#t-name-box` shows the intended range before pressing Delete or pasting. Selecting a
  merged cell snaps the selection; extend it with Shift+Arrow and check again.
- **Paste data**: `await navigator.clipboard.writeText(tsv)` then Ctrl+V. The clipboard
  is shared across tabs, so write it immediately before each paste.
- **Locale**: an en-US spreadsheet reads `23/07/2026` as text and `01/08/2026` as
  January 8. Paste ISO dates (`2026-07-23`), then restore the display format with
  Edit → Paste special → Format only (Ctrl+Alt+V may not fire).
- **Text that looks like a date** (`2026-08`) becomes a date unless typed as `'2026-08`.
  Ctrl+Enter may not fill a range: commit one cell, copy it, paste into the rest.
- **Fixed formula ranges** (e.g. `$G$2:$G$68`) must still cover the new rows. Charts
  extend automatically only when rows are inserted inside their data range.
- **Reading data**: use the gviz CSV endpoint from a `docs.google.com` tab. Automation
  tool results may be truncated (about 1.5 KB) or blocked when they look like query
  strings; return data in chunks and replace `= & ? %` before returning.
- **Batches**: keep browser action batches short. A timed-out batch may still have run;
  re-read the state from the server before retrying, and never repeat destructive steps
  blindly.
- **Tabs**: "Save as Google Sheets" and "Make a copy" open new tabs that may sit outside
  the automation tab group, and closing the last grouped tab removes the group.
  Re-create the group before continuing.
