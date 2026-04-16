# 徵信查詢系統

深圳分行內部徵信查詢流程管理工具。

- 網址：https://trust.deepmystic.net
- 部署：GitHub + Cloudflare Pages / Workers / D1

---

## 系統架構

```
Cloudflare Pages  →  index.html / style.css / app.js
Cloudflare Workers →  functions/api/[[route]].js
Cloudflare D1     →  SQLite 資料庫（zhengxin-db）
```

---

## 使用角色

| 角色 | 說明 |
|------|------|
| 申請人 | 填寫公司名稱（模糊比對台帳）、選查詢目的、指定查詢員，可一次提交多家公司 |
| 查詢員 | 輸入姓名查看待辦，逐筆點「完成」 |
| 管理員 | 帳密登入，管理台帳、查看紀錄、操作日誌、查詢員名單 |

**管理員帳號**：`sz0453`

---

## 查詢目的選項

`貸前` / `貸中` / `貸後` / `擔保`

---

## 台帳更新方式

**方式一：系統內操作（推薦）**
登入管理員 → 台帳管理 → 新增 / 編輯 / 刪除

**方式二：重新匯入 Excel**
```bash
# 更新 台帳_解密.xlsx 後執行
python3 import.py

# 全量更新
wrangler d1 execute zhengxin-db --command="DELETE FROM companies;" --remote
wrangler d1 execute zhengxin-db --file=seed.sql --remote
```

---

## 資料庫結構

| 表名 | 說明 |
|------|------|
| `companies` | 台帳公司資料（名稱、授權日、組別） |
| `operators` | 查詢員名單 |
| `batches` | 申請批次（申請人、查詢員） |
| `items` | 申請明細（公司、目的、狀態） |
| `logs` | 操作日誌 |
| `admin` | 管理員帳密 |

---

## 本地開發

```bash
npm install -g wrangler
wrangler pages dev . --d1=DB=zhengxin-db
```

---

## API 一覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /api/companies/search?q= | 模糊搜尋公司 |
| POST | /api/batches | 提交申請批次 |
| GET | /api/batches/pending?operator= | 查詢員的待辦 |
| PUT | /api/items/:id/complete | 完成一筆查詢 |
| GET | /api/companies | 所有公司（管理員）|
| POST | /api/companies | 新增公司 |
| PUT | /api/companies/:id | 編輯公司 |
| DELETE | /api/companies/:id | 刪除公司 |
| GET | /api/items | 所有申請明細（管理員）|
| GET | /api/logs | 操作日誌（管理員）|
| POST | /api/admin/login | 管理員登入 |
| PUT | /api/admin/password | 修改密碼 |
