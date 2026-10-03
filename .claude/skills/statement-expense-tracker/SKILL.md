---
name: statement-expense-tracker
description: Turn a credit-card or bank statement (PDF, image, or CSV export) into a reconciled, categorized expense workbook for that statement plus an all-statements overview with budgets, category and merchant breakdowns, and charts (Excel, optionally converted to Google Sheets). Use when the user asks to analyze or summarize a statement, categorize or track spending, build a monthly expense sheet, or update an all-months expense summary.
---

# statement-expense-tracker

Convert any card or bank statement into a reconciled monthly expense workbook and
keep an all-statements overview up to date. Bank-agnostic and currency-agnostic;
sheet labels in English or Vietnamese.

## Trigger phrases
The skill should activate on any of these (case-insensitive, close variants):
- "analyze my credit card statement"
- "summarize this bank statement"
- "track my spending from this statement"
- "build my monthly expense sheet"
- "update my all-months expense summary"
- "thống kê sao kê" / "tổng hợp chi tiêu"

## Inputs
| Input          | Default                                   | Notes |
|----------------|-------------------------------------------|-------|
| `statement`    | required                                  | Path to one statement (PDF, image, or CSV export). |
| `trackerDir`   | folder that contains the statement        | Holds config, `data/`, and workbooks. May be a Google Drive / OneDrive / Dropbox synced folder. |
| `language`     | existing config, else the user's language | `en` or `vi`; affects sheet labels only. |
| `currency`     | read from the statement                   | Code, symbol, and decimals live in the config. |
| `overview`     | `true`                                    | Rebuild the all-statements overview after the monthly workbook. |
| `googleSheets` | `false`                                   | Also convert the workbooks to native Google Sheets. |

## Preconditions
1. The statement file exists and is readable. For a password-protected PDF, ask for an
   unlocked copy; never ask for, store, or type the password.
2. Python 3.9+ with `openpyxl` is available (`python -c "import openpyxl"`). If it is
   missing, ask before installing; prefer a virtual environment outside `trackerDir`.
3. `trackerDir` is writable.

If a precondition fails: STOP, tell the user what is missing.

## Tracker folder layout
```
<trackerDir>/
  expense-config.json              # categories, budgets, keyword rules, currency, language
  data/statement_<YYYY-MM>.json    # normalized statements, the source of truth (schema v1)
  <file_prefix>_<YYYY-MM>.xlsx     # one workbook per statement
  <file_prefix>_<Overview>.xlsx    # all statements (suffix is localized, e.g. _Tong_hop)
```

## Deterministic steps
1. Validate the preconditions. Resolve `trackerDir`, list existing `data/statement_*.json`
   files and workbooks.
2. Config: if `<trackerDir>/expense-config.json` is missing, copy
   `references/config.example.json` (English) or `references/config.example.vi.json`
   (Vietnamese, VND), set `currency` to match the statement, and tell the user the
   categories and budgets are placeholders to review. Never overwrite an existing config.
3. Extract. Fast path for ACB (Vietnam) credit-card PDFs (`BTBGDyyyymm.pdf`, header
   "ACB CREDIT CARD STATEMENT"): if `pypdf` is available (ask before installing it), run
   `python "${CLAUDE_SKILL_DIR}/scripts/extract_acb.py" "<statement.pdf>" --out-dir data`
   from `trackerDir`. Exit `0`: done, go to step 4. Exit `3`: fix each `WARN` line in the
   JSON (trim the city out of a description, or add an unparsed row from the PDF). Exit `2`:
   re-read the PDF and fix the JSON. Exit `4`: ask before `--force`. Exit `1` (not ACB, or
   unreadable): extract manually as below.
   Manual extraction: read every page of the statement (use page ranges for long PDFs) and write
   `data/statement_<period>.json` exactly as `references/mapping.md` specifies: the
   statement summary, every transaction, a masked account label, no names or addresses.
   If the file already exists, show what differs and ask before replacing it.
4. Build the monthly workbook from `trackerDir` as the working directory:
   `python "${CLAUDE_SKILL_DIR}/scripts/build_monthly.py" data/statement_<period>.json --config expense-config.json --out-dir .`
   Handle the exit code:
   - `2` unreconciled: re-read the statement pages and fix the JSON (rows missed at page
     breaks, credits typed as spend, fees, subtotal rows, duplicates). Never invent,
     drop, or change transactions to force a match. If it still fails after one careful
     re-read, show the differences and ask whether to continue with `--allow-unreconciled`.
   - `3` uncategorized: choose a configured category for each listed transaction and write
     it into that transaction's `category` field. Propose keyword rules for recurring
     merchants; add them to the config only after the user agrees. Use
     `--uncategorized-to-other` only when the user asks for it.
   - `4` output exists: the statement was built before and the user may have edited the
     workbook; ask before re-running with `--force`.
   - `1` invalid input: fix the JSON or config as the message says.
5. Build the overview unless `overview` is false:
   `python "${CLAUDE_SKILL_DIR}/scripts/build_master.py" data --config expense-config.json --out-dir . --force`
   The overview is generated entirely from `data/`, so overwriting it is expected.
6. Verify: compare the JSON summary the scripts print with the statement (total debits,
   total credits, closing balance, transaction count). Report any mismatch instead of
   claiming success.
7. Only if `googleSheets` is true or the user asks: follow `references/google-sheets.md`.
8. Report in the user's language: net spend, payments and credits, closing balance,
   minimum payment and due date, category totals against budget (flag over-budget
   categories), top merchants, proposed rules, files written, and anything unresolved.

## Output contract
- Monthly workbook sheets: Dashboard (8 KPI cards, category pie, budget-vs-actual
  chart, top 10 merchants), Transactions, Budget, Merchants, Statement (summary and
  reconciliation status).
- Overview workbook sheets: Dashboard (8 KPI cards, 4 charts), By statement, By
  category (summary plus a category × statement matrix), Merchants (one column per
  statement), Transactions (all statements), How to update.
- Transactions are stored as values; every total is a live formula over the
  Transactions sheet, so edits in Excel or Google Sheets recalculate.
- Amounts stay in the statement currency, dates are real dates, periods are `YYYY-MM` text.
- Files are written only inside `trackerDir`.

## Things this skill must NOT do
- Store or show full card or account numbers, cardholder addresses, or other people's
  data; mask accounts to the last 4 digits.
- Log in to banking sites, download statements, or make or schedule payments.
- Upload statement data anywhere (including Google Drive) unless the user asked for it.
- Invent, drop, or alter transactions to make totals reconcile.
- Overwrite an existing config, statement JSON, or monthly workbook without confirmation.
- Install packages without asking.
- Give investment or credit advice; describe spending only.

## Failure modes & messages
| Symptom                               | Action |
|---------------------------------------|--------|
| Scanned or photographed statement     | Read it visually, double-check every amount, reconcile strictly. |
| Several cards on one statement        | Ask which card to track; use one tracker folder per card. |
| Foreign-currency rows                 | `amount` is the billed amount in the statement currency; keep the original in `original_amount` and `original_currency`. |
| Installment plans                     | Record what is billed this period; mention the plan in `note`. If a purchase was converted to a plan this period, keep the purchase as `spend` and its conversion credit as `refund` with the same description (so the same category); the conversion fee is `fee`. |
| Statement shows no totals             | Reconciliation is impossible; say so and ask before `--allow-unreconciled`. |
| Refund of an earlier purchase         | `type: refund` with the purchase's category so net spend drops. |
| Period already present in `data/`     | Ask whether this is a corrected statement before replacing it. |
| `ModuleNotFoundError: openpyxl`       | Ask to install it into a virtual environment; do not continue without it. |

## References
- `references/mapping.md`: statement → normalized JSON (schema v1), field rules, reconciliation.
- `references/config.example.json`: English / USD starter config.
- `references/config.example.vi.json`: Vietnamese / VND starter config.
- `references/sample-statement.json`: synthetic statement for smoke tests.
- `references/google-sheets.md`: optional Google Sheets conversion and browser-automation pitfalls.
- `references/trigger-snippets.md`: prompts users can paste into a fresh session.
- `scripts/extract_acb.py`: ACB credit-card PDF → statement JSON fast path (Python 3.9+, `pypdf`).
- `scripts/build_monthly.py`, `scripts/build_master.py`, `scripts/expense_common.py`:
  workbook generators (Python 3.9+, `openpyxl`).

Smoke test: `python scripts/build_monthly.py references/sample-statement.json --config references/config.example.json --out-dir <temp folder>` must exit 0.

## Versioning
- Schema v1 (this file): normalized statement JSON as defined in `references/mapping.md`, September 2026.
- When the JSON shape changes, bump `schema_version` and update `mapping.md` and both scripts together.
