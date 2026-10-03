---
name: statement-expense-tracker
description: Turn a credit-card or bank statement (PDF, image, or CSV export) into a reconciled, categorized expense workbook for that statement plus an all-statements overview with budgets, category and merchant breakdowns, and charts (Excel, optionally converted to Google Sheets). Use when the user asks to analyze or summarize a statement, categorize or track spending, build a monthly expense sheet, or update an all-months expense summary.
---

# statement-expense-tracker

Convert any card or bank statement into a reconciled monthly expense workbook and keep an all-statements overview up to date. Bank-agnostic and currency-agnostic; sheet labels in English or Vietnamese.

## Trigger Phrases

Use this skill when the user says any close variant of:

- "analyze my credit card statement"
- "summarize this bank statement"
- "track my spending from this statement"
- "build my monthly expense sheet"
- "update my all-months expense summary"
- "thống kê sao kê" / "tổng hợp chi tiêu"

## Inputs

| Input | Default | Notes |
| --- | --- | --- |
| `statement` | Required | Path to one statement (PDF, image, or CSV export). |
| `trackerDir` | Folder that contains the statement | Holds config, `data/`, and workbooks. May be a synced cloud folder. |
| `language` | Existing config, else the user's language | `en` or `vi`; sheet labels only. |
| `currency` | Read from the statement | Code, symbol, and decimals live in the config. |
| `overview` | `true` | Rebuild the all-statements overview after the monthly workbook. |
| `googleSheets` | `false` | Also convert the workbooks to native Google Sheets. |

## Preconditions

1. The statement file exists and is readable. For a password-protected PDF, ask for an unlocked copy; never ask for, store, or type the password.
2. Python 3.9+ with `openpyxl` is available. If missing, ask before installing; prefer a virtual environment outside `trackerDir`.
3. `trackerDir` is writable.

If preconditions fail, stop and say what is missing.

## Tracker Folder Layout

```
<trackerDir>/
  expense-config.json              # categories, budgets, keyword rules, currency, language
  data/statement_<YYYY-MM>.json    # normalized statements, the source of truth (schema v1)
  <file_prefix>_<YYYY-MM>.xlsx     # one workbook per statement
  <file_prefix>_<Overview>.xlsx    # all statements (suffix is localized, e.g. _Tong_hop)
```

## Workflow

Scripts live in this skill's `scripts/` folder; below, `<skill-dir>` is the folder containing this `SKILL.md`.

1. Validate preconditions. Resolve `trackerDir`; list existing `data/statement_*.json` files and workbooks.
2. Config: if `<trackerDir>/expense-config.json` is missing, copy `references/config.example.json` (English) or `references/config.example.vi.json` (Vietnamese, VND), set `currency` to match the statement, and tell the user categories and budgets are placeholders. Never overwrite an existing config.
3. Extract. Fast path for ACB (Vietnam) credit-card PDFs (`BTBGDyyyymm.pdf`, header "ACB CREDIT CARD STATEMENT"): if `pypdf` is available (ask before installing it), run `python <skill-dir>/scripts/extract_acb.py "<statement.pdf>" --out-dir data` from `trackerDir`. Exit `0`: go to step 4. Exit `3`: fix each `WARN` line in the JSON (trim the city out of a description, or add an unparsed row). Exit `2`: re-read the PDF and fix the JSON. Exit `4`: ask before `--force`. Exit `1` (not ACB, or unreadable): extract manually. Manual extraction: read every page of the statement and write `data/statement_<period>.json` exactly as `references/mapping.md` specifies (summary, every transaction, masked account label, no names or addresses). If the file exists, show differences and ask before replacing.
4. Build the monthly workbook with `trackerDir` as the working directory:
   `python <skill-dir>/scripts/build_monthly.py data/statement_<period>.json --config expense-config.json --out-dir .`
   - Exit `2` (unreconciled): re-read the statement and fix the JSON; never invent, drop, or change transactions to force a match. If it still fails after one careful re-read, show the differences and ask before `--allow-unreconciled`.
   - Exit `3` (uncategorized): set a configured `category` on each listed transaction; propose keyword rules and add them to the config only after the user agrees. Use `--uncategorized-to-other` only when asked.
   - Exit `4` (output exists): ask before re-running with `--force`.
   - Exit `1` (invalid input): fix the JSON or config as the message says.
5. Unless `overview` is false: `python <skill-dir>/scripts/build_master.py data --config expense-config.json --out-dir . --force` (the overview is generated entirely from `data/`).
6. Verify the printed JSON summary against the statement totals and transaction count; report mismatches instead of claiming success.
7. Only if `googleSheets` is true or the user asks: follow `references/google-sheets.md`.
8. Report in the user's language: net spend, payments and credits, closing balance, minimum payment and due date, categories against budget (flag overruns), top merchants, proposed rules, files written, unresolved items.

## Output Contract

- Monthly workbook: Dashboard (8 KPI cards, category pie, budget-vs-actual, top 10 merchants), Transactions, Budget, Merchants, Statement (summary and reconciliation status).
- Overview workbook: Dashboard (8 KPI cards, 4 charts), By statement, By category (summary plus category × statement matrix), Merchants (one column per statement), Transactions, How to update.
- Transactions are values; every total is a live formula over the Transactions sheet.
- Amounts stay in the statement currency, dates are real dates, periods are `YYYY-MM` text.
- Files are written only inside `trackerDir`.

## Constraints

- Mask card and account numbers to the last 4 digits; never store names, addresses, or other people's data.
- Do not log in to banking sites, download statements, or make or schedule payments.
- Do not upload statement data anywhere (including Google Drive) unless the user asked.
- Do not invent, drop, or alter transactions to make totals reconcile.
- Do not overwrite an existing config, statement JSON, or monthly workbook without confirmation.
- Do not install packages without asking.
- Do not give investment or credit advice; describe spending only.

## Failure Modes

| Symptom | Action |
| --- | --- |
| Scanned or photographed statement | Read it visually, double-check every amount, reconcile strictly. |
| Several cards on one statement | Ask which card to track; one tracker folder per card. |
| Foreign-currency rows | `amount` is the billed amount; keep the original in `original_amount` / `original_currency`. |
| Installment plans | Record what is billed this period; mention the plan in `note`. A purchase converted to a plan this period stays `spend`, its conversion credit is `refund` with the same description, and the conversion fee is `fee`. |
| Statement shows no totals | Say reconciliation is impossible; ask before `--allow-unreconciled`. |
| Refund of an earlier purchase | `type: refund` with the purchase's category. |
| Period already in `data/` | Ask whether it is a corrected statement before replacing. |
| `ModuleNotFoundError: openpyxl` | Ask to install into a virtual environment; do not continue without it. |

## References

- `references/mapping.md`: statement to normalized JSON (schema v1), field rules, reconciliation.
- `references/config.example.json`: English / USD starter config.
- `references/config.example.vi.json`: Vietnamese / VND starter config.
- `references/sample-statement.json`: synthetic statement for smoke tests.
- `references/google-sheets.md`: optional Google Sheets conversion and browser pitfalls.
- `references/trigger-snippets.md`: user-facing prompt examples.
- `scripts/extract_acb.py`: ACB credit-card PDF to statement JSON fast path (Python 3.9+, `pypdf`).
- `scripts/build_monthly.py`, `scripts/build_master.py`, `scripts/expense_common.py`: workbook generators (Python 3.9+, `openpyxl`).

Smoke test: `python scripts/build_monthly.py references/sample-statement.json --config references/config.example.json --out-dir <temp folder>` must exit 0.

## Versioning

Schema v1: normalized statement JSON as defined in `references/mapping.md`, September 2026. When the JSON shape changes, bump `schema_version` and update `mapping.md` and both scripts together.
