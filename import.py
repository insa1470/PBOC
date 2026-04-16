"""
從 台帳_解密.xlsx 匯入公司資料，生成 seed.sql
用法: python3 import.py
"""
import pandas as pd

def parse_sheet(df, sheet_name):
    companies = []
    row0 = df.iloc[0]

    # 找到各組的起始欄位
    groups = []
    for col_idx, val in enumerate(row0):
        if pd.notna(val) and '组' in str(val):
            groups.append((col_idx, str(val).strip()))

    for col_start, group_name in groups:
        for row_idx in range(2, len(df)):
            try:
                name = df.iloc[row_idx, col_start]
                date = df.iloc[row_idx, col_start + 1] if col_start + 1 < df.shape[1] else None
                notes = df.iloc[row_idx, col_start + 2] if col_start + 2 < df.shape[1] else None
            except IndexError:
                continue

            if pd.isna(name) or str(name).strip() == '' or str(name).strip() == 'nan':
                continue

            name = str(name).strip()
            date = str(date).strip() if pd.notna(date) else ''
            notes = str(notes).strip() if pd.notna(notes) else ''

            if date == 'nan':
                date = ''
            if notes == 'nan':
                notes = ''

            companies.append({
                'name': name,
                'auth_date': date,
                'group_name': group_name,
                'sheet_name': sheet_name,
                'notes': notes
            })

    return companies

xl = pd.read_excel('台帳_解密.xlsx', sheet_name=None, engine='openpyxl', header=None)

all_companies = []
for sheet_name, df in xl.items():
    companies = parse_sheet(df, sheet_name)
    all_companies.extend(companies)
    print(f'  {sheet_name}: {len(companies)} 筆')

lines = ['-- 從台帳.xlsx 匯入的公司資料', '']
for c in all_companies:
    name = c['name'].replace("'", "''")
    date = c['auth_date'].replace("'", "''")
    group = c['group_name'].replace("'", "''")
    sheet = c['sheet_name'].replace("'", "''")
    notes = c['notes'].replace("'", "''")
    lines.append(
        f"INSERT INTO companies (name, auth_date, group_name, sheet_name, notes) "
        f"VALUES ('{name}', '{date}', '{group}', '{sheet}', '{notes}');"
    )

with open('seed.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f'\n共匯入 {len(all_companies)} 筆公司資料 → seed.sql')
print('請執行: wrangler d1 execute zhengxin-db --file=seed.sql')
