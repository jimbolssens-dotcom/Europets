# scripts/import-old-float.py
# The old system's two "master float" spreadsheets -> SQL for the history
# tables (migration 235: old_float_days, old_float_months). Read-only on the
# spreadsheets; the SQL it writes only upserts into those two tables, so
# re-running it after a fix just refreshes them.
#
#   python3 -I scripts/import-old-float.py FLOAT_2025.xlsx FLOAT_2026.xlsx out.sql [data/oldFloatDays.js]
#
# The optional last file is the day rows as a compact CSV module, which the
# app loads into old_float_days itself (app/api/accounting/history) when the
# table is missing rows: this session's network can't reach the database
# with that many rows.
#
# The files are password protected: set FLOAT_PASSWORD (needs msoffcrypto),
# or pass copies already opened in Excel. Needs openpyxl.
#
# What's in them:
#   - a sheet per month ("Jan 25" .. "Dec 26"), two rows per day (the two
#     cash-ups): takings by method (cash, Visa, PayPal/transfer), the Profile
#     system's takings and VAT, and the day's outgoing by column (stock,
#     clinic use, staff, other, Visa...). Under them, the month's fixed
#     costs (sponsor, landline, WPS and cash salaries, SEWA) and net profit.
#   - yearly summary sheets ("2023" .. "2026"), VAT quarters from March:
#     a row per month with takings, outgoing, gross and net profit, VAT.
#
# Sheet dates are often typed with the wrong year (the "Jan 26" sheet's 1st
# says 2025), so a row's date is the sheet's month and the day number, and
# days run on in order. The month figures are added up from the daily rows
# rather than taken from the sheet's totals: Sep 2025's last weekly total
# left out the 29th and 30th (AED 43k). The sheet's own figures are kept
# alongside where they differ. A few VAT cells hold the takings typed into
# the wrong column (Jun 2025's add up to AED 200k of VAT); the month's VAT
# counts those rows at the 5% inside what was taken or spent instead. The
# day rows keep what was typed.

import datetime
import io
import json
import os
import sys

import openpyxl
from openpyxl.utils import column_index_from_string

MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
# The last month the old system's float was kept: from October 2026 the app
# has everything (its payments started mid-September).
LAST_MONTH = '2026-09-01'
# Sep 2026: takings for the whole month, but only the staff payments on the
# cost side; the rest of September's bills went into the app's expenses.
COSTS_INCOMPLETE = {'2026-09-01': "Only staff payments were entered on the float's cost side; September's other bills are in the app's expenses."}

DAY_COLUMNS = {
    'cash': 'C', 'card': 'D', 'online': 'E', 'takings': 'F', 'partial_payments': 'H', 'profile_takings': 'J',
    'vat_collected': 'K', 'stock': 'L', 'clinic_use': 'M', 'vat_paid': 'N', 'staff': 'O', 'con': 'P',
    'other': 'Q', 'card_spend': 'R', 'outgoing': 'S', 'gross': 'T',
}
FIXED_LABELS = {
    'sponsor': 'sponsor', 'landline/internet': 'landline_internet', 'wps': 'wps_salaries', 'cash sal.': 'cash_salaries',
    'sewa': 'sewa', 'total addition exp': 'fixed_costs', 'net profit': 'sheet_net_profit',
}


def idx(letter):
    return column_index_from_string(letter) - 1


def num(v):
    return round(float(v), 2) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0.0


def open_book(path):
    password = os.environ.get('FLOAT_PASSWORD')
    if not password:
        return openpyxl.load_workbook(path, data_only=True)
    import msoffcrypto
    with open(path, 'rb') as f:
        office = msoffcrypto.OfficeFile(f)
        office.load_key(password=password)
        out = io.BytesIO()
        office.decrypt(out)
    out.seek(0)
    return openpyxl.load_workbook(out, data_only=True)


def month_sheets(book, year, days, months):
    for ws in book.worksheets:
        key = ws.title.strip().lower()[:3]
        if key not in MONTHS or ws.max_column > 30:
            continue
        m = MONTHS.index(key) + 1
        first = datetime.date(year, m, 1)
        if first.isoformat() > LAST_MONTH:
            continue
        last = (datetime.date(year + m // 12, m % 12 + 1, 1) - datetime.timedelta(days=1)).day
        rows = list(ws.iter_rows(values_only=True))
        month = {'month': first.isoformat(), 'sheet': ws.title}
        current, shift, day_no = None, 0, 0
        for i, r in enumerate(rows[1:], start=2):
            a, b = r[0], r[1]
            if isinstance(a, str) and a.strip().lower().startswith('transfers'):
                total = rows[i]  # the month's totals are on the next row
                month['sheet_takings'] = num(total[idx('F')])
                continue
            if isinstance(r[idx('S')], str):
                label = FIXED_LABELS.get(r[idx('S')].strip().lower())
                if label:
                    month[label] = num(r[idx('T')])
                continue
            if isinstance(a, str) and 'weekly' in a.lower():
                continue
            if isinstance(a, (datetime.datetime, datetime.date)):
                day_no += 1
                if day_no > last:
                    current = None
                    continue
                current, shift = datetime.date(year, m, day_no), 0
            elif not (isinstance(b, str) and b.strip()):
                continue
            values = {k: num(r[idx(c)]) for k, c in DAY_COLUMNS.items()}
            closed = isinstance(r[2], str) and r[2].strip().lower() == 'closed'
            if not any(values.values()) and not closed:
                continue
            if current is None:
                when, row_shift = (first, 0) if day_no == 0 else (datetime.date(year, m, last), 0)
            else:
                shift += 1
                when, row_shift = current, shift
            days.append({'sheet': ws.title, 'sheet_row': i, 'day': when.isoformat(), 'shift': row_shift, 'closed': closed, **values})
        months[month['month']] = month


def summary_sheet(book, sheet, start, cols):
    ws = book[sheet]
    y, m = start
    out = {}
    for r in ws.iter_rows(values_only=True):
        a = r[0]
        if not (isinstance(a, str) and a.strip().lower()[:3] == MONTHS[m - 1]):
            continue
        row = {k: (num(r[idx(c)]) if isinstance(r[idx(c)], (int, float)) else None) for k, c in cols.items()}
        if row['takings']:
            out[f'{y}-{m:02d}-01'] = row
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


OLD = {'takings': 'B', 'outgoing': 'C', 'gross_profit': 'D', 'net_profit': 'E', 'vat_collected': 'L', 'vat_paid': 'M'}
NEW = {'takings': 'B', 'outgoing': 'C', 'gross_profit': 'E', 'net_profit': 'F', 'vat_collected': 'M', 'vat_paid': 'N'}


def build(path25, path26):
    b25, b26 = open_book(path25), open_book(path26)
    days, sheet_months = [], {}
    month_sheets(b25, 2025, days, sheet_months)
    month_sheets(b26, 2026, days, sheet_months)

    # Yearly summaries, latest copy first: the 2026 file's "2023"/"2024"
    # sheets, then the 2025 file's "2025" (Dec 2024 to Feb 2026) and the
    # 2026 file's "2026" (Dec 2025 to Aug 2026). The 2026 file's own "2025"
    # sheet is a broken copy (#REF!) and is skipped.
    summary = {}
    for book, sheet, start, cols in [(b26, '2023', (2023, 3), OLD), (b26, '2024', (2024, 3), OLD),
                                     (b25, '2025', (2024, 12), NEW), (b26, '2026', (2025, 12), NEW)]:
        for k, v in summary_sheet(book, sheet, start, cols).items():
            summary.setdefault(k, v)

    by_month = {}
    for d in days:
        t = by_month.setdefault(d['day'][:7] + '-01', {k: 0.0 for k in DAY_COLUMNS})
        for k in DAY_COLUMNS:
            t[k] += d[k]
        for vat, base in (('vat_collected', 'takings'), ('vat_paid', 'outgoing')):
            if d[vat] > d[base] * 0.1:
                t[vat] += min(d[vat], d[base] * 5 / 105) - d[vat]

    months = []
    for key in sorted(set(summary) | set(by_month)):
        s = summary.get(key, {})
        if key in by_month:
            t, sm = by_month[key], sheet_months.get(key, {})
            complete = key not in COSTS_INCOMPLETE
            fixed = sm.get('fixed_costs') or 0.0
            gross = t['takings'] - t['outgoing']
            row = {
                'month': key, 'source': 'daily sheets', 'takings': t['takings'], 'cash': t['cash'], 'card': t['card'],
                'online': t['online'], 'outgoing': t['outgoing'], 'gross_profit': gross, 'fixed_costs': fixed,
                'sponsor': sm.get('sponsor'), 'landline_internet': sm.get('landline_internet'), 'wps_salaries': sm.get('wps_salaries'),
                'cash_salaries': sm.get('cash_salaries'), 'sewa': sm.get('sewa'),
                'net_profit': gross - fixed if complete else None,
                'vat_collected': t['vat_collected'], 'vat_paid': t['vat_paid'], 'costs_complete': complete,
                'sheet_takings': sm.get('sheet_takings'), 'sheet_net_profit': sm.get('sheet_net_profit') if complete else None,
                'summary_takings': s.get('takings'), 'summary_outgoing': s.get('outgoing'), 'summary_net_profit': s.get('net_profit'),
                'note': COSTS_INCOMPLETE.get(key),
            }
        else:
            gross, net = s.get('gross_profit'), s.get('net_profit')
            row = {
                'month': key, 'source': 'yearly summary', 'takings': s['takings'], 'outgoing': s.get('outgoing'),
                'gross_profit': gross, 'net_profit': net,
                'fixed_costs': (gross - net) if gross is not None and net is not None else None,
                'vat_collected': s.get('vat_collected'), 'vat_paid': s.get('vat_paid'), 'costs_complete': True,
                'summary_takings': s['takings'], 'summary_outgoing': s.get('outgoing'), 'summary_net_profit': net,
            }
        months.append({k: (round(v, 2) if isinstance(v, float) else v) for k, v in row.items()})
    return days, months


def lit(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(round(v, 2))
    return "'" + str(v).replace("'", "''") + "'"


def upsert(table, rows, key):
    cols = list(rows[0].keys())
    values = ',\n'.join('(' + ', '.join(lit(r.get(c)) for c in cols) + ')' for r in rows)
    sets = ', '.join(f'{c} = excluded.{c}' for c in cols if c not in key)
    return f"insert into {table} ({', '.join(cols)}) values\n{values}\non conflict ({', '.join(key)}) do update set {sets};\n"


if __name__ == '__main__':
    path25, path26, out = sys.argv[1:4]
    days, months = build(path25, path26)
    month_cols = ['month', 'source', 'takings', 'cash', 'card', 'online', 'outgoing', 'gross_profit', 'fixed_costs', 'sponsor',
                  'landline_internet', 'wps_salaries', 'cash_salaries', 'sewa', 'net_profit', 'vat_collected', 'vat_paid',
                  'costs_complete', 'sheet_takings', 'sheet_net_profit', 'summary_takings', 'summary_outgoing', 'summary_net_profit', 'note']
    months = [{c: m.get(c) for c in month_cols} for m in months]
    with open(out, 'w') as f:
        f.write(upsert('old_float_months', months, ['month']))
        for i in range(0, len(days), 300):
            f.write(upsert('old_float_days', days[i:i + 300], ['sheet', 'sheet_row']))
    with open(out + '.json', 'w') as f:
        json.dump({'months': months, 'days': days}, f, indent=1)
    if len(sys.argv) > 4:
        def cell(v):
            return '' if not v else ('%.2f' % v).rstrip('0').rstrip('.')
        lines = [','.join([r['sheet'], str(r['sheet_row']), r['day'], str(r['shift']), '1' if r['closed'] else '']
                          + [cell(r[k]) for k in DAY_COLUMNS]) for r in days]
        with open(sys.argv[4], 'w') as f:
            f.write('// Generated by scripts/import-old-float.py from the old system\'s float\n'
                    '// sheets: one line per row of old_float_days (migration 235).\n'
                    f"export const OLD_FLOAT_DAY_COLUMNS = {json.dumps(['sheet', 'sheet_row', 'day', 'shift', 'closed', *DAY_COLUMNS])};\n"
                    'export const OLD_FLOAT_DAYS_CSV = `\n' + '\n'.join(lines) + '\n`;\n')
    print(f'{len(days)} day rows, {len(months)} months -> {out}')
