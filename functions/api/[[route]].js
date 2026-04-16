const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function onRequest(context) {
  const { request, env } = context
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, '')
  const method = request.method

  try {
    const res = await dispatch(path, method, request, env, url)
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
    return new Response(res.body, { status: res.status, headers })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}

const j = (data, s = 200) =>
  new Response(JSON.stringify(data), { status: s, headers: { 'Content-Type': 'application/json' } })

async function dispatch(path, method, req, env, url) {
  const seg = path.split('/').filter(Boolean)

  if (seg[0] === 'companies') {
    if (method === 'GET' && seg[1] === 'search') return searchCompanies(url, env)
    if (method === 'GET' && !seg[1]) return getCompanies(env)
    if (method === 'POST' && !seg[1]) return createCompany(req, env)
    if (method === 'PUT' && seg[1]) return updateCompany(seg[1], req, env)
    if (method === 'DELETE' && seg[1]) return deleteCompany(seg[1], req, env)
  }
  if (seg[0] === 'operators') {
    if (method === 'GET') return getOperators(env)
    if (method === 'POST') return createOperator(req, env)
    if (method === 'DELETE' && seg[1]) return deleteOperator(seg[1], req, env)
  }
  if (seg[0] === 'batches') {
    if (method === 'POST') return createBatch(req, env)
    if (method === 'GET' && seg[1] === 'pending') return getPendingItems(url, env)
    if (method === 'GET') return getBatches(req, env)
  }
  if (seg[0] === 'items') {
    if (method === 'GET' && !seg[1]) return getAllItems(req, env)
    if (method === 'PUT' && seg[2] === 'complete') return completeItem(seg[1], req, env)
  }
  if (seg[0] === 'logs' && method === 'GET') return getLogs(req, env)
  if (seg[0] === 'admin') {
    if (seg[1] === 'login' && method === 'POST') return adminLogin(req, env)
    if (seg[1] === 'verify' && method === 'GET') return adminVerify(req, env)
    if (seg[1] === 'password' && method === 'PUT') return changePassword(req, env)
    if (seg[1] === 'init' && method === 'POST') return initAdmin(req, env)
  }
  return j({ error: 'Not found' }, 404)
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function makeToken(secret) {
  const ts = String(Date.now())
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts))
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${ts}.${hex}`
}

async function verifyToken(token, secret) {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const ts = token.slice(0, dot), hex = token.slice(dot + 1)
  if (Date.now() - Number(ts) > 28800000) return false // 8 hours
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const sig = new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)))
  return crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(ts))
}

async function isAdmin(req, env) {
  const tok = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  return verifyToken(tok, env.ADMIN_SECRET || 'changeme-set-in-wrangler')
}

async function addLog(env, actor, role, action, detail) {
  await env.DB.prepare(
    `INSERT INTO logs (actor, role, action, detail) VALUES (?,?,?,?)`
  ).bind(actor, role, action, detail ?? '').run()
}

// ── Companies ─────────────────────────────────────────────────────────────────

async function searchCompanies(url, env) {
  const q = url.searchParams.get('q') || ''
  if (!q.trim()) return j([])
  const r = await env.DB.prepare(
    `SELECT id, name, auth_date, group_name, sheet_name, notes FROM companies WHERE name LIKE ? ORDER BY name LIMIT 12`
  ).bind(`%${q}%`).all()
  return j(r.results)
}

async function getCompanies(env) {
  const r = await env.DB.prepare(
    `SELECT * FROM companies ORDER BY sheet_name, group_name, name`
  ).all()
  return j(r.results)
}

async function createCompany(req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const { name, auth_date, group_name, sheet_name, notes } = await req.json()
  if (!name?.trim() || !auth_date?.trim()) return j({ error: '缺少公司名稱或授權日期' }, 400)
  const r = await env.DB.prepare(
    `INSERT INTO companies (name, auth_date, group_name, sheet_name, notes) VALUES (?,?,?,?,?)`
  ).bind(name.trim(), auth_date.trim(), group_name || '', sheet_name || '', notes || '').run()
  await addLog(env, '管理員', 'admin', '新增公司', name.trim())
  return j({ id: r.meta.last_row_id, name, auth_date }, 201)
}

async function updateCompany(id, req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const { name, auth_date, group_name, sheet_name, notes } = await req.json()
  if (!name?.trim() || !auth_date?.trim()) return j({ error: '缺少必要欄位' }, 400)
  await env.DB.prepare(
    `UPDATE companies SET name=?, auth_date=?, group_name=?, sheet_name=?, notes=?,
     updated_at=strftime('%Y-%m-%d %H:%M:%S','now','+8 hours') WHERE id=?`
  ).bind(name.trim(), auth_date.trim(), group_name || '', sheet_name || '', notes || '', id).run()
  await addLog(env, '管理員', 'admin', '修改公司', `ID:${id} → ${name.trim()}`)
  return j({ success: true })
}

async function deleteCompany(id, req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const c = await env.DB.prepare(`SELECT name FROM companies WHERE id=?`).bind(id).first()
  await env.DB.prepare(`DELETE FROM companies WHERE id=?`).bind(id).run()
  await addLog(env, '管理員', 'admin', '刪除公司', c?.name || `ID:${id}`)
  return j({ success: true })
}

// ── Operators ─────────────────────────────────────────────────────────────────

async function getOperators(env) {
  const r = await env.DB.prepare(`SELECT * FROM operators WHERE active=1 ORDER BY name`).all()
  return j(r.results)
}

async function createOperator(req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const { name } = await req.json()
  if (!name?.trim()) return j({ error: '請輸入姓名' }, 400)
  const r = await env.DB.prepare(`INSERT INTO operators (name) VALUES (?)`).bind(name.trim()).run()
  await addLog(env, '管理員', 'admin', '新增查詢員', name.trim())
  return j({ id: r.meta.last_row_id, name: name.trim() }, 201)
}

async function deleteOperator(id, req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const op = await env.DB.prepare(`SELECT name FROM operators WHERE id=?`).bind(id).first()
  await env.DB.prepare(`UPDATE operators SET active=0 WHERE id=?`).bind(id).run()
  await addLog(env, '管理員', 'admin', '停用查詢員', op?.name || `ID:${id}`)
  return j({ success: true })
}

// ── Batches / Items ───────────────────────────────────────────────────────────

async function createBatch(req, env) {
  const { requester_name, operator_name, items } = await req.json()
  if (!requester_name?.trim() || !operator_name?.trim() || !items?.length) {
    return j({ error: '缺少必要欄位' }, 400)
  }
  const b = await env.DB.prepare(
    `INSERT INTO batches (requester_name, operator_name) VALUES (?,?)`
  ).bind(requester_name.trim(), operator_name.trim()).run()
  const bid = b.meta.last_row_id

  for (const item of items) {
    await env.DB.prepare(
      `INSERT INTO items (batch_id, company_id, company_name, company_auth_date, purpose) VALUES (?,?,?,?,?)`
    ).bind(bid, item.company_id || null, item.company_name, item.auth_date || '', item.purpose).run()
  }

  await addLog(env, requester_name.trim(), 'requester', '提交申請',
    `查詢員:${operator_name} | 公司:${items.map(i => i.company_name).join('、')}`)
  return j({ id: bid }, 201)
}

async function getPendingItems(url, env) {
  const op = url.searchParams.get('operator') || ''
  if (!op.trim()) return j({ error: '請提供查詢員姓名' }, 400)
  const r = await env.DB.prepare(`
    SELECT i.*, b.requester_name, b.operator_name, b.created_at AS batch_created_at
    FROM items i JOIN batches b ON b.id = i.batch_id
    WHERE b.operator_name = ? AND i.status = 'pending'
    ORDER BY b.created_at ASC, i.id ASC
  `).bind(op.trim()).all()
  return j(r.results)
}

async function getBatches(req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const r = await env.DB.prepare(`
    SELECT b.id, b.requester_name, b.operator_name, b.created_at,
      COUNT(i.id) AS total,
      SUM(CASE WHEN i.status='completed' THEN 1 ELSE 0 END) AS done
    FROM batches b LEFT JOIN items i ON i.batch_id = b.id
    GROUP BY b.id ORDER BY b.created_at DESC LIMIT 300
  `).all()
  return j(r.results)
}

async function getAllItems(req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const r = await env.DB.prepare(`
    SELECT i.id, i.company_name, i.company_auth_date, i.purpose, i.status,
      i.completed_by, i.completed_at, i.created_at,
      b.requester_name, b.operator_name, b.created_at AS batch_created_at
    FROM items i JOIN batches b ON b.id = i.batch_id
    ORDER BY b.created_at DESC, i.id DESC LIMIT 500
  `).all()
  return j(r.results)
}

async function completeItem(id, req, env) {
  const { operator_name } = await req.json()
  if (!operator_name?.trim()) return j({ error: '請提供查詢員姓名' }, 400)
  const item = await env.DB.prepare(`SELECT * FROM items WHERE id=?`).bind(id).first()
  if (!item) return j({ error: '找不到此筆申請' }, 404)
  await env.DB.prepare(
    `UPDATE items SET status='completed', completed_by=?,
     completed_at=strftime('%Y-%m-%d %H:%M:%S','now','+8 hours') WHERE id=?`
  ).bind(operator_name.trim(), id).run()
  await addLog(env, operator_name.trim(), 'operator', '完成查詢', item.company_name)
  return j({ success: true })
}

// ── Logs ──────────────────────────────────────────────────────────────────────

async function getLogs(req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const r = await env.DB.prepare(
    `SELECT * FROM logs ORDER BY created_at DESC LIMIT 500`
  ).all()
  return j(r.results)
}

// ── Admin ─────────────────────────────────────────────────────────────────────

async function adminLogin(req, env) {
  const { username, password } = await req.json()
  const admin = await env.DB.prepare(`SELECT * FROM admin LIMIT 1`).first()
  if (!admin) return j({ error: '尚未初始化管理員，請執行初始化' }, 400)
  const hash = await sha256(password || '')
  if (admin.username !== username || admin.password_hash !== hash) {
    return j({ error: '帳號或密碼錯誤' }, 401)
  }
  const token = await makeToken(env.ADMIN_SECRET || 'changeme-set-in-wrangler')
  await addLog(env, username, 'admin', '管理員登入', '成功')
  return j({ token })
}

async function adminVerify(req, env) {
  return j({ valid: await isAdmin(req, env) })
}

async function changePassword(req, env) {
  if (!await isAdmin(req, env)) return j({ error: '未授權' }, 401)
  const { username, new_password } = await req.json()
  if (!new_password?.trim()) return j({ error: '請輸入新密碼' }, 400)
  const hash = await sha256(new_password)
  await env.DB.prepare(
    `UPDATE admin SET username=?, password_hash=? WHERE id=1`
  ).bind(username?.trim() || 'admin', hash).run()
  await addLog(env, username || 'admin', 'admin', '修改密碼', '')
  return j({ success: true })
}

async function initAdmin(req, env) {
  const existing = await env.DB.prepare(`SELECT id FROM admin LIMIT 1`).first()
  if (existing) return j({ error: '管理員已存在，無法重複初始化' }, 400)
  const { username, password } = await req.json()
  if (!password?.trim()) return j({ error: '請設定密碼' }, 400)
  const hash = await sha256(password)
  await env.DB.prepare(
    `INSERT INTO admin (username, password_hash) VALUES (?,?)`
  ).bind(username?.trim() || 'admin', hash).run()
  return j({ success: true })
}
