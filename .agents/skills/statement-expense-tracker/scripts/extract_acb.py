#!/usr/bin/env python3
"""Fast path: ACB (Vietnam) credit-card statement PDF -> normalized statement JSON (schema v1).

Usage:
    python extract_acb.py <statement.pdf> [--out-dir data] [--force]

Writes <out-dir>/statement_<period>.json as references/mapping.md specifies, without
names, addresses, or full card numbers. Requires `pypdf`.

Exit codes:
    0  written and reconciled
    1  not an ACB credit-card statement, or unreadable (extract manually instead)
    2  written, but totals do not reconcile (re-read the PDF and fix the JSON)
    3  written and reconciled, but some descriptions need a look (see WARN lines)
    4  output exists (pass --force to replace it)
"""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    sys.stderr.write("pypdf is not installed; ask the user before installing it, or extract manually.\n")
    sys.exit(1)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

MARKER = "ACB CREDIT CARD STATEMENT"
LINE = re.compile(
    r"^\*{4}(?P<card>\d{4}) (?P<td>\d\d/\d\d) (?P<pd>\d\d/\d\d) (?P<desc>.*?) "
    r"(?P<orig>-?[\d,.]+) (?P<cur>[A-Z]{3}) (?P<bill>-?[\d,]+)(?P<cr> CR)?\s*$"
)
# ACB prints "Retail <COUNTRY> <CITY> <MERCHANT>"; the city field is at most 13 characters
# and is not delimited, so known prefixes are stripped and anything else is flagged.
VN_CITY_PREFIXES = [
    "HO CHI MINH", "HOCHIMINH", "TP Ho Chi Min", "TP HO CHI MIN", "TP.HOCHIMINH", "TP.HCM", "TPHCM",
    "HCMC", "HCM", "HA NOI", "HANOI", "TP HA NOI", "DA NANG", "DANANG", "HAI PHONG", "CAN THO",
    "NHA TRANG", "DA LAT", "VUNG TAU", "BRVT", "BIEN HOA", "THU DUC", "TINH BINH DUO", "BINH DUONG",
    "DONG NAI", "KHANH HOA", "QUANG NINH", "NHA BE DISTRI", "DISTRICT 1", "DISTRICT 2", "DISTRICT 3",
    "DISTRICT 4", "DISTRICT 5", "DISTRICT 7", "DISTRICT 10", "QUAN 1", "QUAN 3", "QUAN 5", "QUAN 7",
    "QUAN 10", "Q BINH THANH", "Q.BINH THANH", "BINH THANH", "PHU NHUAN", "TAN BINH", "GO VAP",
    "P.TAY THANH",
]


def num(text):
    return int(text.replace(",", ""))


def summary_value(text, label, pattern=r"(-?[\d,]+)"):
    m = re.search(re.escape(label) + r"\s*\n\s*" + pattern, text)
    if not m:
        raise ValueError(f"summary field '{label}' not found")
    return m.group(1)


def iso(ddmm, year, month):
    d, m = int(ddmm[:2]), int(ddmm[3:])
    return f"{year - 1 if m > month else year:04d}-{m:02d}-{d:02d}"


def strip_city(rest, country):
    if country != "VNM":  # foreign rows: the city field is one token, e.g. OPENAI.COM
        head, _, tail = rest.partition(" ")
        return (tail or head), True
    for city in sorted(VN_CITY_PREFIXES, key=len, reverse=True):
        if rest.upper().startswith(city.upper() + " "):
            return rest[len(city) + 1:], True
    return rest, False


def parse(pdf_path):
    text = "\n".join(page.extract_text() or "" for page in PdfReader(pdf_path).pages)
    if MARKER not in text:
        raise LookupError("not an ACB credit-card statement")

    m = re.search(r"Ngày lập bảng\s+(\d\d)/(\d\d)/(\d{4})", text)
    if not m:
        raise ValueError("statement date not found")
    sd, sm, sy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    due = summary_value(text, "Minimum Payment Due Date", r"(\d\d/\d\d/\d{4})").split("/")
    card = re.search(r"\d{4}x+(\d{4})", text)

    opening = -num(summary_value(text, "Opening Balance"))
    debits = -num(summary_value(text, "Total Debit Transaction"))
    credits = num(summary_value(text, "Total Credit Transaction"))
    # "Statement Balance" excludes installment principal not yet billed; "Closing Balance"
    # includes it, so only the former satisfies opening + debits - credits = closing.
    balance = -num(summary_value(text, "Statement Balance"))
    with_installments = -num(summary_value(text, "Closing Balance"))
    statement = {
        "statement_date": f"{sy:04d}-{sm:02d}-{sd:02d}",
        "due_date": f"{due[2]}-{due[1]}-{due[0]}",
        "opening_balance": opening,
        "total_debits": debits,
        "total_credits": credits,
        "closing_balance": balance,
        "minimum_payment": -num(summary_value(text, "Minimum Payment")),
        "credit_limit": num(summary_value(text, "Credit Limit")),
    }

    start, end = text.find("Billing Amount"), text.find("Phát sinh trong kỳ")
    if start < 0 or end < 0:
        raise ValueError("transaction table not found")
    body = re.sub(r"\n(?!\*{4}\d{4} )", " ", text[start:end])  # re-join wrapped descriptions
    lines = [l.strip() for l in body.split("\n")[1:] if l.strip()]

    txs, warnings = [], []
    for line in lines:
        lm = LINE.match(line)
        if not lm:
            warnings.append(f"unparsed line, add it by hand: {line}")
            continue
        desc, amount, is_credit = lm["desc"].strip(), abs(num(lm["bill"])), bool(lm["cr"])
        orig, cur = lm["orig"].lstrip("-"), lm["cur"]
        tx = {
            "transaction_date": iso(lm["td"], sy, sm),
            "posting_date": iso(lm["pd"], sy, sm),
            "description": desc,
            "raw_description": desc,
            "type": "refund" if is_credit else "spend",
            "amount": amount,
            "original_amount": None,
            "original_currency": None,
            "category": None,
            "note": "",
        }
        if desc.startswith("INSTL CREATION FEE-"):
            base = re.sub(r"-T[A-Z]*$", "", desc[len("INSTL CREATION FEE-"):]).strip()
            tx.update(description=f"{base} - installment fee", type="fee",
                      note="Fee for converting the purchase to an installment plan")
        elif desc.startswith("INSTL CREATION-"):
            base = re.sub(r"-TENOR.*$", "", desc[len("INSTL CREATION-"):]).strip()
            tx.update(description=base, type="refund",
                      note="Purchase converted to an installment plan; offsets the original charge")
        elif desc.startswith("INSTL-"):
            im = re.match(r"INSTL-(.*?)-TENOR (\d+)/(\d+)", desc)
            if im:
                tx.update(description=f"{im.group(1)} - installment {im.group(2)}/{im.group(3)}",
                          note=f"Installment {im.group(2)} of {im.group(3)}")
        elif is_credit and re.match(r"^\d+#", desc):
            tx.update(description="PAYMENT", type="payment")
        else:
            rm = re.match(r"^Retail (?P<country>[A-Z]{3}) (?P<rest>.*)$", desc)
            if rm:
                merchant, known = strip_city(rm["rest"], rm["country"])
                if not known:
                    warnings.append(f"unknown city prefix, trim the description by hand: '{rm['rest']}'")
                tx["description"] = merchant.replace("Grab* ", "Grab ").strip()
            if cur != "VND":
                tx.update(original_amount=float(orig.replace(",", "")), original_currency=cur)
            elif orig.replace(",", "").split(".")[0] not in ("0", str(amount)):
                tx["note"] = f"Billed {amount:,} VND for a {orig} VND purchase (includes fees)"
        txs.append(tx)

    if with_installments != balance:
        statement_note = (f"Remaining installment principal not yet billed: {with_installments - balance:,} VND "
                          f"(printed closing balance {with_installments:,})")
    else:
        statement_note = ""

    doc = {
        "schema_version": 1,
        "period": f"{sy:04d}-{sm:02d}",
        "institution": "ACB",
        "account_label": f"ACB credit card ****{card.group(1)}" if card else "ACB credit card",
        "currency": "VND",
        "statement": statement,
        "transactions": txs,
    }
    if statement_note:
        doc["note"] = statement_note
    return doc, warnings


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pdf")
    ap.add_argument("--out-dir", default="data")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    try:
        doc, warnings = parse(args.pdf)
    except LookupError as exc:
        print(f"{args.pdf}: {exc}; extract it manually as references/mapping.md describes.")
        sys.exit(1)
    except (ValueError, OSError) as exc:
        print(f"{args.pdf}: could not parse ({exc}); extract it manually.")
        sys.exit(1)

    out = Path(args.out_dir) / f"statement_{doc['period']}.json"
    if out.exists() and not args.force:
        print(f"{out} already exists; pass --force to replace it.")
        sys.exit(4)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    st, txs = doc["statement"], doc["transactions"]
    debits = sum(t["amount"] for t in txs if t["type"] in ("spend", "fee"))
    credits = sum(t["amount"] for t in txs if t["type"] in ("refund", "payment"))
    reconciled = (debits == st["total_debits"] and credits == st["total_credits"]
                  and st["opening_balance"] + st["total_debits"] - st["total_credits"] == st["closing_balance"])
    print(f"{out}: {len(txs)} transactions, period {doc['period']}")
    print(f"debits  {debits:,} / statement {st['total_debits']:,}")
    print(f"credits {credits:,} / statement {st['total_credits']:,}")
    if doc.get("note"):
        print(f"note: {doc['note']}")
    for w in warnings:
        print("WARN:", w)
    if not reconciled:
        print("NOT RECONCILED: re-read the PDF and fix the JSON before building.")
        sys.exit(2)
    sys.exit(3 if warnings else 0)


if __name__ == "__main__":
    main()
