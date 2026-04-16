// ── Utilities ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id)

function goTo(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'))
  $(`screen-${name}`).classList.remove('hidden')
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (token) opts.headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`/api${path}`, opts)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '請求失敗')
  return data
}

function fmt(str) {
  if (!str) return '-'
  return String(str).replace('T', ' ').slice(0, 16)
}

// ── State ────────────────────────────────────────────────────────────────────

let adminToken = sessionStorage.getItem('adminToken')
let selectedCompany = null
let batchItems = []
let allCompanies = []
let editingCompanyId = null
let currentOperatorName = ''
let searchTimer = null

// ── Requester ────────────────────────────────────────────────────────────────

async function initRequester() {
  goTo('requester')
  batchItems = []
  renderBatchList()
  $('req-name').value = ''
  $('req-operator').innerHTML = '<option value="">載入中...</option>'
  try {
    const ops = await api('GET', '/operators')
    $('req-operator').innerHTML =
      '<option value="">-- 選擇查詢員 --</option>' +
      ops.map(o => `<option value="${o.name}">${o.name}</option>`).join('')
  } catch {
    $('req-operator').innerHTML = '<option value="">-- 無法載入 --</option>'
  }
}

function onCompanyInput(e) {
  clearTimeout(searchTimer)
  const q = e.target.value.trim()
  if (!q) { hideDropdown(); resetAuthNotice(); return }
  searchTimer = setTimeout(() => fetchSuggestions(q), 280)
}

async function fetchSuggestions(q) {
  try {
    const results = await api('GET', `/companies/search?q=${encodeURIComponent(q)}`)
    renderDropdown(results)
  } catch { hideDropdown() }
}

function renderDropdown(results) {
  const dd = $('company-dropdown')
  if (!results.length) { hideDropdown(); return }
  dd.innerHTML = results.map(r => {
    const safe = encodeURIComponent(JSON.stringify(r))
    return `<div class="dropdown-item" onclick="pickCompany('${safe}')">
      <span class="co-name">${r.name}</span>
      <span class="co-date">${r.auth_date || '-'}</span>
    </div>`
  }).join('')
  dd.classList.remove('hidden')
}

function hideDropdown() { $('company-dropdown').classList.add('hidden') }

function pickCompany(encoded) {
  selectedCompany = JSON.parse(decodeURIComponent(encoded))
  $('company-search').value = selectedCompany.name
  $('selected-auth-date').textContent = selectedCompany.auth_date || '（未記錄）'
  $('auth-date-notice').classList.remove('hidden')
  hideDropdown()
}

function resetAuthNotice() {
  selectedCompany = null
  $('auth-date-notice').classList.add('hidden')
}

function addItem() {
  if (!selectedCompany) { alert('請先搜尋並選擇公司'); return }
  const purpose = $('item-purpose').value
  if (!purpose) { alert('請選擇查詢目的'); return }

  batchItems.push({
    company_id: selectedCompany.id,
    company_name: selectedCompany.name,
    auth_date: selectedCompany.auth_date || '',
    purpose,
  })
  renderBatchList()

  // reset
  selectedCompany = null
  $('company-search').value = ''
  $('item-purpose').value = ''
  $('auth-date-notice').classList.add('hidden')
}

function removeItem(idx) {
  batchItems.splice(idx, 1)
  renderBatchList()
}

function renderBatchList() {
  const el = $('batch-list')
  if (!batchItems.length) {
    el.innerHTML = '<p class="empty-hint">尚未新增任何公司</p>'
    return
  }
  el.innerHTML = batchItems.map((item, i) => `
    <div class="batch-item">
      <div class="batch-item-main">
        <strong>${item.company_name}</strong>
        <span class="purpose-tag">${item.purpose}</span>
      </div>
      <span class="batch-item-date">授權日：${item.auth_date || '-'}</span>
      <button class="btn-icon" onclick="removeItem(${i})" title="移除">&#10005;</button>
    </div>
  `).join('')
}

async function submitBatch() {
  const name = $('req-name').value.trim()
  const operator = $('req-operator').value
  if (!name) { alert('請輸入您的姓名'); return }
  if (!operator) { alert('請選擇查詢員'); return }
  if (!batchItems.length) { alert('請至少新增一家公司'); return }

  try {
    await api('POST', '/batches', { requester_name: name, operator_name: operator, items: batchItems })
    goTo('success')
  } catch (e) {
    alert('送出失敗：' + e.message)
  }
}

// close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#company-search') && !e.target.closest('#company-dropdown')) {
    hideDropdown()
  }
})

// ── Operator ─────────────────────────────────────────────────────────────────

async function loadPendingItems() {
  const name = $('op-name').value.trim()
  if (!name) { alert('請輸入您的姓名'); return }
  currentOperatorName = name

  try {
    const items = await api('GET', `/batches/pending?operator=${encodeURIComponent(name)}`)
    renderPendingItems(items)
    $('op-current-name').textContent = name
    $('op-name-section').classList.add('hidden')
    $('op-items-section').classList.remove('hidden')
  } catch (e) {
    alert('載入失敗：' + e.message)
  }
}

function renderPendingItems(items) {
  $('pending-count').textContent = items.length
  const el = $('pending-list')
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">目前沒有待辦查詢</div>'
    return
  }
  el.innerHTML = items.map(item => `
    <div class="pending-item" id="pi-${item.id}">
      <div class="pending-item-main">
        <strong>${item.company_name}</strong>&nbsp;
        <span class="purpose-tag">${item.purpose}</span>
        <div class="pending-item-meta">
          申請人：${item.requester_name}&nbsp;|&nbsp;授權日：${item.company_auth_date || '-'}&nbsp;|&nbsp;${fmt(item.batch_created_at)}
        </div>
      </div>
      <button class="btn btn-success btn-sm" onclick="completeItem(${item.id})">完成</button>
    </div>
  `).join('')
}

async function completeItem(id) {
  try {
    await api('PUT', `/items/${id}/complete`, { operator_name: currentOperatorName })
    const el = $(`pi-${id}`)
    if (el) el.remove()
    const current = parseInt($('pending-count').textContent) - 1
    $('pending-count').textContent = current
    if (current <= 0) {
      $('pending-list').innerHTML = '<div class="empty-state">目前沒有待辦查詢</div>'
    }
  } catch (e) {
    alert('操作失敗：' + e.message)
  }
}

function switchOperator() {
  $('op-name-section').classList.remove('hidden')
  $('op-items-section').classList.add('hidden')
  $('op-name').value = ''
}

// ── Admin login ───────────────────────────────────────────────────────────────

async function doAdminLogin() {
  $('login-error').textContent = ''
  const username = $('admin-username').value.trim()
  const password = $('admin-password').value
  try {
    const res = await api('POST', '/admin/login', { username, password })
    adminToken = res.token
    sessionStorage.setItem('adminToken', adminToken)
    goTo('admin')
    loadAdminTab('ledger')
  } catch (e) {
    $('login-error').textContent = e.message
  }
}

function doAdminLogout() {
  adminToken = null
  sessionStorage.removeItem('adminToken')
  goTo('landing')
}

// ── Admin tabs ────────────────────────────────────────────────────────────────

function loadAdminTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.tab-content').forEach(t =>
    t.classList.toggle('hidden', t.dataset.tab !== tab))

  if (tab === 'ledger') loadLedger()
  else if (tab === 'records') loadRecords()
  else if (tab === 'logs') loadLogs()
  else if (tab === 'operators') loadOperatorsAdmin()
}

// ── Ledger (companies) ────────────────────────────────────────────────────────

async function loadLedger() {
  try {
    allCompanies = await api('GET', '/companies', undefined, adminToken)
    renderLedger(allCompanies)
  } catch (e) { alert('載入失敗：' + e.message) }
}

function renderLedger(list) {
  const tbody = $('ledger-tbody')
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa">無資料</td></tr>'
    return
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.sheet_name || ''}</td>
      <td>${c.group_name || ''}</td>
      <td><strong>${c.name}</strong></td>
      <td>${c.auth_date || ''}</td>
      <td>${c.notes || ''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="editCompany(${c.id})">編輯</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCompany(${c.id}, \`${c.name.replace(/`/g,'\\`')}\`)">刪除</button>
      </td>
    </tr>
  `).join('')
}

function filterLedger() {
  const q = $('ledger-search').value.trim().toLowerCase()
  renderLedger(q ? allCompanies.filter(c => c.name.toLowerCase().includes(q)) : allCompanies)
}

function showCompanyForm() {
  editingCompanyId = null
  $('modal-title').textContent = '新增公司'
  $('cf-name').value = $('cf-date').value = $('cf-group').value = $('cf-sheet').value = $('cf-notes').value = ''
  $('company-modal').classList.remove('hidden')
  $('cf-name').focus()
}

function editCompany(id) {
  const c = allCompanies.find(c => c.id === id)
  if (!c) return
  editingCompanyId = id
  $('modal-title').textContent = '編輯公司'
  $('cf-name').value = c.name
  $('cf-date').value = c.auth_date
  $('cf-group').value = c.group_name || ''
  $('cf-sheet').value = c.sheet_name || ''
  $('cf-notes').value = c.notes || ''
  $('company-modal').classList.remove('hidden')
  $('cf-name').focus()
}

function closeCompanyForm() { $('company-modal').classList.add('hidden') }

async function saveCompany() {
  const body = {
    name: $('cf-name').value.trim(),
    auth_date: $('cf-date').value.trim(),
    group_name: $('cf-group').value.trim(),
    sheet_name: $('cf-sheet').value.trim(),
    notes: $('cf-notes').value.trim(),
  }
  if (!body.name || !body.auth_date) { alert('請填寫公司名稱及授權起始日'); return }
  try {
    if (editingCompanyId) {
      await api('PUT', `/companies/${editingCompanyId}`, body, adminToken)
    } else {
      await api('POST', '/companies', body, adminToken)
    }
    closeCompanyForm()
    loadLedger()
  } catch (e) { alert('儲存失敗：' + e.message) }
}

async function deleteCompany(id, name) {
  if (!confirm(`確定要刪除「${name}」？此操作無法復原。`)) return
  try {
    await api('DELETE', `/companies/${id}`, undefined, adminToken)
    loadLedger()
  } catch (e) { alert('刪除失敗：' + e.message) }
}

// ── Records ───────────────────────────────────────────────────────────────────

async function loadRecords() {
  try {
    const items = await api('GET', '/items', undefined, adminToken)
    const tbody = $('records-tbody')
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa">無資料</td></tr>'
      return
    }
    tbody.innerHTML = items.map(i => `
      <tr>
        <td>${fmt(i.batch_created_at)}</td>
        <td>${i.requester_name}</td>
        <td>${i.operator_name}</td>
        <td>${i.company_name}</td>
        <td><span class="purpose-tag">${i.purpose}</span></td>
        <td>
          <span class="${i.status === 'completed' ? 'status-done' : 'status-pending'}">
            ${i.status === 'completed' ? '已完成' : '待處理'}
          </span>
          ${i.completed_by ? `<div style="font-size:11px;color:#aaa;margin-top:2px">${i.completed_by} ${fmt(i.completed_at)}</div>` : ''}
        </td>
      </tr>
    `).join('')
  } catch (e) { alert('載入失敗：' + e.message) }
}

// ── Logs ──────────────────────────────────────────────────────────────────────

async function loadLogs() {
  try {
    const logs = await api('GET', '/logs', undefined, adminToken)
    const tbody = $('logs-tbody')
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa">無資料</td></tr>'
      return
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="white-space:nowrap">${fmt(l.created_at)}</td>
        <td>${l.actor}</td>
        <td>${l.action}</td>
        <td>${l.detail || ''}</td>
      </tr>
    `).join('')
  } catch (e) { alert('載入失敗：' + e.message) }
}

// ── Operators admin ───────────────────────────────────────────────────────────

async function loadOperatorsAdmin() {
  try {
    const ops = await api('GET', '/operators')
    const el = $('operators-list')
    if (!ops.length) {
      el.innerHTML = '<p class="empty-hint">尚無查詢員，請新增</p>'
      return
    }
    el.innerHTML = ops.map(o => `
      <div class="operator-row">
        <span>${o.name}</span>
        <button class="btn btn-sm btn-danger" onclick="removeOperator(${o.id}, \`${o.name.replace(/`/g,'\\`')}\`)">移除</button>
      </div>
    `).join('')
  } catch (e) { alert('載入失敗：' + e.message) }
}

async function addOperator() {
  const name = $('new-op-name').value.trim()
  if (!name) { alert('請輸入姓名'); return }
  try {
    await api('POST', '/operators', { name }, adminToken)
    $('new-op-name').value = ''
    loadOperatorsAdmin()
  } catch (e) { alert('新增失敗：' + e.message) }
}

async function removeOperator(id, name) {
  if (!confirm(`確定移除查詢員「${name}」？`)) return
  try {
    await api('DELETE', `/operators/${id}`, undefined, adminToken)
    loadOperatorsAdmin()
  } catch (e) { alert('移除失敗：' + e.message) }
}

// ── Change password ───────────────────────────────────────────────────────────

async function doChangePassword() {
  const username = $('new-username').value.trim()
  const pw = $('new-pw').value
  const pw2 = $('new-pw2').value
  if (!pw) { alert('請輸入新密碼'); return }
  if (pw !== pw2) { alert('兩次密碼不一致'); return }
  try {
    await api('PUT', '/admin/password', { username: username || undefined, new_password: pw }, adminToken)
    alert('密碼已更新')
    $('new-pw').value = $('new-pw2').value = ''
  } catch (e) { alert('更新失敗：' + e.message) }
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  if (adminToken) {
    try {
      const res = await api('GET', '/admin/verify', undefined, adminToken)
      if (!res.valid) { adminToken = null; sessionStorage.removeItem('adminToken') }
    } catch { adminToken = null; sessionStorage.removeItem('adminToken') }
  }
})
