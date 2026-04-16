# 徵信查詢系統

深圳分行內部徵信查詢流程管理工具，部署於 GitHub + Cloudflare Pages/Workers/D1。

---

## 架構

```
Cloudflare Pages  →  index.html / style.css / app.js
Cloudflare Workers →  functions/api/[[route]].js
Cloudflare D1     →  SQLite 資料庫
```

---

## 首次部署步驟

### 1. 安裝 Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 建立 D1 資料庫

```bash
wrangler d1 create zhengxin-db
```

複製輸出的 `database_id`，填入 `wrangler.toml`：

```toml
database_id = "貼上你的 ID"
```

### 3. 建立資料表

```bash
wrangler d1 execute zhengxin-db --file=schema.sql
```

### 4. 匯入台帳資料

確認 `台帳_解密.xlsx` 在同目錄下，執行：

```bash
python3 import.py
wrangler d1 execute zhengxin-db --file=seed.sql
```

### 5. 設定管理員密碼

```bash
wrangler d1 execute zhengxin-db --command="INSERT INTO admin (username, password_hash) VALUES ('admin', replace(hex(randomblob(16)),' ',''));"
```

> 或部署後直接呼叫初始化 API（見下方）

### 6. 設定 ADMIN_SECRET

在 `wrangler.toml` 改為一組隨機字串（不要用預設值）：

```toml
[vars]
ADMIN_SECRET = "your-random-secret-here"
```

### 7. 部署到 Cloudflare Pages

```bash
wrangler pages deploy . --project-name=zhengxin-system
```

或推送到 GitHub，在 Cloudflare Pages 設定 Git 自動部署，並在 Pages 設定中綁定 D1 資料庫（binding 名稱必須是 `DB`）。

### 8. 初始化管理員帳密（首次）

部署後在瀏覽器 console 或 curl 執行一次：

```bash
curl -X POST https://your-site.pages.dev/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"你的密碼"}'
```

執行成功後此 API 不再開放（已存在管理員時會拒絕）。

---

## 台帳更新流程

台帳 Excel 更新後：

```bash
python3 import.py           # 重新產生 seed.sql
# 若是全量更新：
wrangler d1 execute zhengxin-db --command="DELETE FROM companies;"
wrangler d1 execute zhengxin-db --file=seed.sql
```

或直接在系統管理員後台的「台帳管理」頁面逐筆新增 / 編輯 / 刪除。

---

## 本地開發

```bash
wrangler pages dev . --d1=DB=zhengxin-db
```

---

## API 一覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /api/companies | 取得所有公司（管理員）|
| GET | /api/companies/search?q= | 模糊搜尋公司 |
| POST | /api/companies | 新增公司 |
| PUT | /api/companies/:id | 編輯公司 |
| DELETE | /api/companies/:id | 刪除公司 |
| GET | /api/operators | 查詢員清單 |
| POST | /api/operators | 新增查詢員 |
| DELETE | /api/operators/:id | 停用查詢員 |
| POST | /api/batches | 提交申請批次 |
| GET | /api/batches/pending?operator= | 查詢員的待辦 |
| GET | /api/batches | 所有批次（管理員）|
| GET | /api/items | 所有申請明細（管理員）|
| PUT | /api/items/:id/complete | 查詢員完成一筆 |
| GET | /api/logs | 操作日誌（管理員）|
| POST | /api/admin/login | 管理員登入 |
| GET | /api/admin/verify | 驗證 token |
| PUT | /api/admin/password | 修改密碼 |
| POST | /api/admin/init | 首次初始化管理員 |
