# Statement → normalized statement JSON

## Schema version
v1 — every file sets `"schema_version": 1`. The scripts reject any other value.

One file per statement of one account: `data/statement_<period>.json`, UTF-8.


## Top-level fields

| Field            | Required | Rule |
|------------------|----------|------|
| `schema_version` | yes      | `1` |
| `period`         | yes      | `YYYY-MM` of the statement date. A card statement dated 2026-08-24 covering 07-25…08-24 is `2026-08`. For calendar-month bank statements, the month covered. |
| `institution`    | no       | Issuer short name, e.g. `ACB`, `Chase`, `Monzo`. |
| `account_label`  | no       | Product plus last 4 digits only, e.g. `Visa ****1234`. The scripts reject 7+ consecutive digits. |
| `currency`       | no       | ISO 4217 billing currency, e.g. `VND`, `USD`, `EUR`. |
| `statement`      | yes      | Summary object below. |
| `transactions`   | yes      | Non-empty array in statement order. |

Never include the cardholder's name, address, phone, or full account numbers.


## statement

| Field             | Required    | Rule |
|-------------------|-------------|------|
| `statement_date`  | yes         | ISO date `YYYY-MM-DD`. |
| `due_date`        | no          | Payment (minimum payment) due date. |
| `opening_balance` | no          | Amount owed at the start of the period. Positive when owed, negative when in credit. |
| `total_debits`    | recommended | Total charges printed: purchases + fees + interest. Positive. |
| `total_credits`   | recommended | Total payments + refunds printed. Positive. |
| `closing_balance` | no          | Amount owed at the statement date. Positive when owed. |
| `minimum_payment` | no          | Positive. |
| `credit_limit`    | no          | Positive. |

Sign normalization: many issuers print owed balances and charges as negative numbers
(`-24,949,102`) and mark credits with `CR`. Store magnitudes using the convention above
so that `opening_balance + total_debits − total_credits = closing_balance`.
For deposit (checking/savings) accounts, `total_debits` is money out, `total_credits` is
money in, and balances are stored as the negative of the printed balance (or omitted).


## transactions[]

| Field               | Required | Rule |
|---------------------|----------|------|
| `transaction_date`  | yes      | ISO date. Infer the year from the statement period: a December purchase on a January statement belongs to the previous year. |
| `posting_date`      | no       | ISO date, when printed. |
| `description`       | yes      | Merchant text as printed, without generic prefixes and location noise, e.g. `Retail VNM HO CHI MINH PAYOO-MINISTOP 82` → `PAYOO-MINISTOP 82`. Payments may be written as `PAYMENT`. |
| `raw_description`   | no       | Full printed line, for audit. Ignored by the scripts. |
| `type`              | yes      | `spend`, `fee`, `refund`, or `payment` (table below). |
| `amount`            | yes      | Positive billed amount in the statement currency, after FX conversion. |
| `original_amount`   | no       | Foreign-currency amount, e.g. `222.22`. |
| `original_currency` | no       | e.g. `USD`. |
| `category`          | no       | `null` lets config rules decide. Otherwise it must equal a config category name. Ignored for payments. |
| `note`              | no       | Short free text: installment details, reason for a manual category, and so on. |

### Type decision table

| Printed as                                                   | `type`    |
|--------------------------------------------------------------|-----------|
| Purchase, POS, online order, subscription, cash advance      | `spend`   |
| Annual fee, late fee, interest, FX fee, tax on fees          | `fee`     |
| Refund, reversal, chargeback, cashback credit                | `refund`  |
| Payment received, autopay, transfer that pays the account    | `payment` |

Net spend used in every total = `spend` + `fee` − `refund`. Payments are excluded.
Installment plans: record what is billed this period. If the statement shows both a
purchase and an equal reversal because it moved to a plan, record both lines as printed.


## Reconciliation (enforced by the scripts)

1. Σ `amount` of `spend` + `fee` = `statement.total_debits`
2. Σ `amount` of `refund` + `payment` = `statement.total_credits`
3. `opening_balance + total_debits − total_credits = closing_balance` (when all four are present)

Tolerance is half of the smallest currency unit (`currency.decimals` in the config).
Usual causes of a mismatch: a row missed at a page break, a credit recorded as `spend`,
a fee or interest line printed in a separate section, a subtotal row recorded as a
transaction, or a duplicated row.


## Extraction checklist

- Read all pages. Transaction tables often continue after summary boxes and on later pages.
- Skip "total", "subtotal", "balance brought forward", and installment-summary rows.
- Keep statement order. Do not merge identical-looking rows; two equal ride-hailing
  charges on the same day can both be real.
- Keep both dates when the statement prints transaction and posting dates.


## Example

```json
{
  "schema_version": 1,
  "period": "2026-08",
  "institution": "Example Bank",
  "account_label": "Visa ****1234",
  "currency": "VND",
  "statement": {
    "statement_date": "2026-08-24",
    "due_date": "2026-09-19",
    "opening_balance": 1500000,
    "total_debits": 5313700,
    "total_credits": 1500000,
    "closing_balance": 5313700,
    "minimum_payment": 265685,
    "credit_limit": 50000000
  },
  "transactions": [
    {"transaction_date": "2026-07-24", "posting_date": "2026-07-27", "description": "OPENAI *CHATGPT SU",
     "type": "spend", "amount": 5287700, "original_amount": null, "original_currency": null, "category": null, "note": ""},
    {"transaction_date": "2026-07-29", "posting_date": "2026-07-29", "description": "PAYMENT",
     "type": "payment", "amount": 1500000, "category": null, "note": ""},
    {"transaction_date": "2026-08-02", "posting_date": "2026-08-05", "description": "Grab A-EXAMPLE123",
     "type": "spend", "amount": 26000, "category": null, "note": ""}
  ]
}
```


## Issuer notes

Add short notes here when a new issuer's layout needs special handling.

- **ACB (Vietnam) credit card**: charges are printed negative; credits end with `CR`.
  "Phát sinh nợ trong kỳ" = `total_debits`, "Phát sinh có trong kỳ" = `total_credits`,
  "Số dư đầu kỳ" / "Dư nợ cuối kỳ" = opening / closing balance (store as positive when owed),
  "Số tiền thanh toán tối thiểu" = `minimum_payment`. Detail lines start with
  `Retail <COUNTRY> <CITY>`; payments show only a reference such as `…#GLR#C#…`.
  Foreign purchases show the original amount in the "Transaction Amount" column.
