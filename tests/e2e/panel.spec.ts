import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base, expect, type Cookie } from '@playwright/test'
base.describe.configure({ mode: 'default' })
const test = base.extend<{}, { localCookies: Cookie[] }>({
  localCookies: [async ({ browser }, use) => {
    const context = await browser.newContext(), page = await context.newPage()
    const file = new URL(`../../painel/dist/e2e-access-${process.env.IOTEAMS_E2E_NONCE}.json`, import.meta.url)
    const saved = JSON.parse(await readFile(file, 'utf8'))
    if (saved.cookies) { await context.close(); await use(saved.cookies); return }
    const { secret } = saved
    await page.goto('http://127.0.0.1:4173')
    await page.getByLabel('Código de acesso privado').fill(secret)
    await expect(page.getByLabel('Código de acesso privado')).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Abrir sessão local' }).click()
    await expect(page.getByRole('heading', { name: 'Trabalho' })).toBeVisible()
    const cookies = await context.cookies(); await writeFile(file, JSON.stringify({ cookies }), { mode: 0o600 }); await context.close(); await use(cookies)
  }, { scope: 'worker' }],
})
test('requires an explicit local session and never exposes operational catalog data without it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Acesso ao painel local' })).toBeVisible()
  const response = await page.request.get('/api/v1/catalog'); expect(response.status()).toBe(401)
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
})
test('configures a bound demand, searches real citations and reviews/approves the exact planning snapshot', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies); await page.goto('/')
  await page.getByRole('link', { name: 'Conhecimento', exact: true }).click()
  await page.getByLabel('Buscar no conhecimento').fill('recuperação')
  await expect(page.getByText('stacks/git/uso.md', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Limpar busca' }).click()
  await expect(page.getByLabel('Buscar no conhecimento')).toBeFocused()
  await page.getByRole('link', { name: 'Configuração', exact: true }).click()
  await expect(page.getByText('task-1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('develop', { exact: true }).first()).toBeVisible()
  await page.getByLabel('Objetivo da demanda').fill('')
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('')
  await page.getByRole('button', { name: 'Salvar demanda' }).click()
  await expect(page.getByLabel('Objetivo da demanda')).toBeFocused()
  await page.getByLabel('Objetivo da demanda').fill('Referência')
  await page.getByRole('button', { name: 'Salvar demanda' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Demanda salva' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Git', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Propor plano' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Propor plano', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Propor plano' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Propor plano' }).click()
  await expect(page.getByRole('heading', { name: 'Revisar proposta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Product Backlog', exact: true })).toBeVisible()
  const hash = await page.getByTestId('proposal-hash').textContent(); expect(hash).toMatch(/^[a-f0-9]{64}$/)
  await page.getByRole('button', { name: 'Aprovar este hash' }).click()
  await expect(page.getByRole('dialog')).toContainText(hash!)
  await page.getByRole('dialog').getByRole('button', { name: 'Aprovar este hash' }).click()
  await expect(page.getByText('Plano aprovado. A execução exige outra ação explícita.')).toBeVisible()
  expect((await page.request.get('/api/v1/runs')).status()).toBe(200)
  expect(await (await page.request.get('/api/v1/runs')).json()).toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Revisar proposta' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Git', exact: true })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Git', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Desenvolvimento', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Iniciar execução', exact: true }).click()
  // Backend preparation and UI rendering are distinct phases within the same 30s test.
  // Observe the actual persisted request before spending the unchanged 5s UI expect.
  const acceptedRun = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/runs' && response.status() === 200)
  const pendingApproval = page.waitForResponse(async response => {
    if (response.request().method() !== 'GET' || new URL(response.url()).pathname !== '/api/v1/approvals' || response.status() !== 200) return false
    const records = await response.json() as Array<{ data: { requestId: string; status: string } }>
    return records.some(record => record.data.requestId === 'e2e-request-1' && record.data.status === 'pending')
  })
  const [runResponse, approvalResponse] = await Promise.all([acceptedRun, pendingApproval, (async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'Iniciar execução', exact: true }).click()
    await page.getByRole('link', { name: 'Execuções', exact: true }).click()
  })()])
  const run = await runResponse.json() as { id: string; status: string }
  const approvals = await approvalResponse.json() as Array<{ data: { requestId: string } }>
  expect(run.status).toBe('accepted')
  expect(approvals.find(record => record.data.requestId === 'e2e-request-1')).toMatchObject({ data: {
    runId: run.id, requestId: 'e2e-request-1', threadId: 'e2e-thread-1', turnId: 'e2e-turn-1', status: 'pending',
  } })
  await expect(page.getByRole('heading', { name: 'Autorizar check simulado' })).toBeVisible()
  await page.getByRole('button', { name: 'Alternar tema' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Aceitar solicitação', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('e2e-request-1')
  if (process.env.IOTEAMS_VISUAL_DIR) {
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('dialog').screenshot({ path: join(process.env.IOTEAMS_VISUAL_DIR, 'approval-narrow.png') })
    await page.setViewportSize({ width: 1280, height: 900 })
  }
  const completedRun = page.waitForResponse(async response => {
    if (response.request().method() !== 'GET' || new URL(response.url()).pathname !== '/api/v1/runs' || response.status() !== 200) return false
    const records = await response.json() as Array<{ data: { id: string; status: string } }>
    return records.some(record => record.data.id === run.id && record.data.status === 'completed')
  })
  await Promise.all([completedRun, (async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'Aceitar solicitação', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Alternar tema' }).click()
    await page.getByRole('button', { name: /^Inspecionar execução/ }).click()
  })()])
  await expect(page.getByText('Tentativa 1 · REJECTED', { exact: true })).toBeVisible()
  await expect(page.getByText('Check · saída 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Check · saída 0', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Commit solicitado', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Commit registrado', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Push solicitado', exact: true })).toBeVisible()
  await expect(page.getByText('Push confirmado', { exact: true })).toBeVisible()
  await expect(page.locator('[data-view="execucoes"]').getByText('Execução: completed', { exact: true })).toBeVisible()
  await expect(page.getByText('Tentativa 2 · DONE', { exact: true })).toBeVisible()
  await expect(page.getByText('Check · saída 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Check · saída 0', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fontes do plano aprovado' })).toBeVisible()
  await page.getByRole('link', { name: 'Trabalho', exact: true }).click()
  const board = page.getByRole('region', { name: 'Quadro de tarefas operacionais' })
  await expect(board.locator(':scope > section')).toHaveCount(7)
  await expect(board.locator('section[aria-label="DONE"]')).toContainText('task-1')
  await expect(board.locator('section[aria-label="DONE"]')).toContainText('Rejeição anterior: CHECK_FAILED')
  await page.getByRole('button', { name: 'Inspecionar task-1', exact: true }).click()
  await expect(page.locator('#task-inspection')).toBeFocused()
  await expect(page.locator('[data-view="trabalho"]').getByText('Push confirmado:', { exact: false })).toBeVisible()
  if (process.env.IOTEAMS_VISUAL_DIR) await page.screenshot({ path: join(process.env.IOTEAMS_VISUAL_DIR, 'board-timeline.png'), fullPage: true })
})
test('keeps narrow navigation, authored select keyboard/focus, themes and failure recovery usable', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/#configuracao')
  await page.getByRole('combobox', { name: 'Binding confiável' }).click()
  await expect(page.getByRole('listbox')).toBeVisible(); await page.keyboard.press('Escape')
  await expect(page.getByRole('combobox', { name: 'Binding confiável' })).toBeFocused()
  await page.getByRole('button', { name: 'Alternar tema' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.route('**/api/v1/knowledge/search', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"SERVER_UNAVAILABLE"}' }))
  await page.getByRole('link', { name: 'Conhecimento', exact: true }).click(); await page.getByLabel('Buscar no conhecimento').fill('git')
  await expect(page.getByRole('alert')).toContainText('indisponível')
  const overflow = await page.evaluate<string>(`JSON.stringify({root:[document.documentElement.scrollWidth,innerWidth,document.body.scrollWidth,document.documentElement.clientWidth],scroll:[...document.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth).map(e=>({tag:e.tagName,cls:e.className,width:e.clientWidth,scroll:e.scrollWidth})).slice(0,20),overflow:[...document.querySelectorAll('*')].map(e=>({tag:e.tagName,cls:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth||e.left<0).slice(0,25)})`)
  expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth'), overflow).toBe(true)
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
})
test('does not invent bindings and reports unavailable frozen requirements alongside persisted gaps', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies)
  await page.route('**/api/v1/bindings', route => route.fulfill({ json: [] }))
  await page.goto('/#configuracao')
  await expect(page.getByText('Nenhum binding confiável disponível.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Salvar demanda' })).toHaveCount(0)
  await page.unroute('**/api/v1/bindings')
  await page.route('**/api/v1/demands', route => route.fulfill({ json: [{ version: 2, data: { id: 'demand-1', projectId: 'project-1', goal: 'Referência' } }] }))
  await page.route('**/api/v1/demands/demand-1/planning', route => route.fulfill({ json: { demandId: 'demand-1', status: 'needs_competency', gaps: [{ taskId: 'task-1', professionalId: 'bia-martins', kind: 'stack', competencyId: 'swift', reason: 'Competência necessária ausente.' }] } }))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lacunas de competência' })).toBeVisible()
  await expect(page.getByText('Os requisitos completos desta tentativa não estão disponíveis nesta API.', { exact: false })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Propor plano', exact: true })).toBeDisabled()
})
test('preserves non-sensitive draft through session expiry and prevents all operational mutation', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies)
  await page.route('**/api/v1/demands', route => route.fulfill({ json: [] }))
  await page.goto('/#configuracao')
  await page.getByLabel('Objetivo da demanda').fill('Rascunho preservado nesta aba')
  await page.route('**/api/v1/session', route => route.fulfill({ status: 401, json: { error: 'UNAUTHENTICATED' } }))
  await page.getByRole('button', { name: 'Reconectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Acesso ao painel local' })).toBeVisible()
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Rascunho preservado nesta aba')
  await expect(page.getByRole('button', { name: 'Salvar demanda' })).toBeDisabled()
})
test('preserves draft and blocks a second send after an uncertain mutation outcome', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies); let writes = 0
  await page.route('**/api/v1/demands', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    writes++; return route.abort('failed')
  })
  await page.goto('/#configuracao')
  await page.getByLabel('Objetivo da demanda').fill('Referência de resultado incerto')
  await page.getByRole('button', { name: 'Salvar demanda' }).click()
  await expect(page.getByRole('alert')).toContainText('resultado da ação é incerto')
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Referência de resultado incerto')
  await expect(page.getByRole('button', { name: 'Salvar demanda' })).toBeDisabled()
  expect(writes).toBe(1)
})
test('cancels superseded search, keeps no-results and does not dispatch during IME composition', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies); let release!: () => void, oldDone!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve }), completed = new Promise<void>(resolve => { oldDone = resolve }), queries: string[] = []
  await page.route('**/api/v1/knowledge/search', async route => {
    const query = route.request().postDataJSON().query as string; queries.push(query)
    if (query === 'antiga') { await barrier; await route.fulfill({ json: { status: 'no_evidence', reason: 'stale_sources', citations: [] } }).catch(() => {}); oldDone(); return }
    await route.fulfill({ json: { status: 'no_evidence', reason: 'no_matches', citations: [] } })
  })
  await page.goto('/#conhecimento'); const input = page.getByLabel('Buscar no conhecimento')
  await input.fill('antiga'); await expect.poll(() => queries).toContain('antiga')
  await input.fill('nova'); await expect(page.getByText('Nenhuma fonte corresponde à consulta.', { exact: false })).toBeVisible()
  release(); await completed
  await expect(page.getByText('As fontes mudaram.', { exact: false })).toHaveCount(0)
  await input.dispatchEvent('compositionstart'); await input.fill('composição')
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  expect(queries).not.toContain('composição')
  await input.dispatchEvent('compositionend'); await expect.poll(() => queries).toContain('composição')
  await page.getByRole('button', { name: 'Limpar busca' }).click(); await expect(input).toBeFocused(); await expect(input).toHaveValue('')
})
test('associates empty competency validation with its group while preserving a valid goal', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies); let planningWrites = 0
  await page.route('**/api/v1/demands', route => route.fulfill({ json: [{ version: 1, data: { id: 'demand-1', projectId: 'project-1', goal: 'Referência' } }] }))
  await page.route('**/api/v1/demands/demand-1/planning', route => route.fulfill({ json: { demandId: 'demand-1', status: 'draft' } }))
  await page.route('**/api/v1/demands/demand-1/plan', route => { planningWrites++; return route.abort() })
  await page.goto('/#configuracao')
  await expect(page.getByRole('button', { name: 'Propor plano', exact: true })).toBeEnabled()
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.uncheck()
  await page.getByRole('button', { name: 'Propor plano', exact: true }).click()
  const group = page.getByRole('group', { name: 'Competências exigidas por slot', exact: true })
  await expect(group).toHaveAttribute('aria-invalid', 'true')
  await expect(group).toBeFocused()
  await expect(page.getByLabel('Objetivo da demanda')).toHaveAttribute('aria-invalid', 'false')
  expect(planningWrites).toBe(0)
})

const uiRun = { version: 3, data: { id: 'ui-run', projectId: 'project-1', planId: 'plan-1', status: 'awaiting_approval', threadId: 'ui-thread', turnId: 'ui-turn' } }
const uiApproval = { version: 2, data: { id: 'ui-approval', projectId: 'project-1', runId: 'ui-run', requestId: 'ui-request', threadId: 'ui-thread', turnId: 'ui-turn', kind: 'command', summary: 'Revisar comando vinculado', details: { command: 'node src/check.mjs', availableDecisions: ['accept', 'decline', 'cancel'] }, status: 'pending' } }
test('invalidates an open stale approval and records denial only for the reviewed request', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies)
  let approval = structuredClone(uiApproval), run = structuredClone(uiRun), writes = 0
  await page.route('**/api/v1/runs', route => route.fulfill({ json: [run] }))
  await page.route('**/api/v1/approvals', route => route.fulfill({ json: [approval] }))
  await page.route('**/api/v1/approvals/ui-approval/decide', route => {
    const input = route.request().postDataJSON(); writes++
    expect(input).toEqual({ expectedVersion: 3, decision: 'decline' })
    approval = { ...approval, version: 4, data: { ...approval.data, status: 'declined' } }
    run = { ...run, version: 4, data: { ...run.data, status: 'paused' } }
    return route.fulfill({ json: { id: 'ui-approval', status: 'decided' } })
  })
  await page.goto('/#execucoes')
  await page.getByRole('button', { name: 'Aceitar solicitação', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused()
  approval = { ...approval, version: 3, data: { ...approval.data, turnId: 'new-turn', details: { ...approval.data.details, availableDecisions: ['decline', 'cancel'] } } }
  run = { ...run, data: { ...run.data, turnId: 'new-turn' } }
  await page.evaluate("window.dispatchEvent(new Event('online'))")
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Aceitar solicitação', exact: true })).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('desatualizada')
  expect(writes).toBe(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Execuções', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Aceitar solicitação', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Recusar solicitação', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Recusar solicitação', exact: true }).click()
  await expect(page.getByText('Revisar comando vinculado · declined', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retomar execução', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recusar solicitação', exact: true })).toHaveCount(0)
  expect(writes).toBe(1)
})

test('pauses, resumes and cancels with current versions; conflict and uncertain outcomes never replay', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies)
  let run = { ...structuredClone(uiRun), data: { ...uiRun.data, status: 'running' } }, writes = 0, conflict = true
  await page.route('**/api/v1/runs', route => route.fulfill({ json: [run] }))
  await page.route('**/api/v1/approvals', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/runs/ui-run/*', route => {
    writes++
    const action = route.request().url().split('/').at(-1)
    expect(route.request().postDataJSON().expectedVersion).toBe(run.version)
    if (action === 'pause' && conflict) { conflict = false; run = { ...run, version: run.version + 1 }; return route.fulfill({ status: 409, json: { error: 'CONFLICT' } }) }
    if (action === 'cancel') return route.abort('failed')
    run = { ...run, version: run.version + 1, data: { ...run.data, status: action === 'pause' ? 'paused' : 'running' } }
    return route.fulfill({ json: { id: 'ui-run', status: run.data.status } })
  })
  await page.goto('/#execucoes')
  await page.getByRole('button', { name: 'Pausar execução', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pausar execução', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Os dados mudaram')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Pausar execução', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Pausar execução', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pausar execução', exact: true }).click()
  await expect(page.locator('[data-view="execucoes"]').getByText('Execução: paused', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retomar execução', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Retomar execução', exact: true }).click()
  await expect(page.locator('[data-view="execucoes"]').getByText('Execução: running', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar execução', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar execução', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('resultado da ação é incerto')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancelar execução', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Reconectar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pausar execução', exact: true })).toBeDisabled()
  expect(writes).toBe(4)
})

test('preserves drafts offline and only reenables actions after reconnect revalidates the snapshot', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies); let writes = 0
  await page.route('**/api/v1/demands', route => { if (route.request().method() !== 'GET') writes++; return route.fulfill({ json: [] }) })
  await page.goto('/#configuracao')
  await page.getByLabel('Objetivo da demanda').fill('Rascunho durante desconexão')
  await context.setOffline(true)
  await page.evaluate("window.dispatchEvent(new Event('offline'))")
  await expect(page.getByRole('button', { name: 'Salvar demanda', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Rascunho durante desconexão')
  await expect(page.getByRole('status').filter({ hasText: 'dados podem estar desatualizados' })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Reconectar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Salvar demanda', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Rascunho durante desconexão')
  expect(writes).toBe(0)
})

test('freezes reviewed planning input and refuses stale saves after a real remote PATCH and SSE', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies)
  const origin = 'http://127.0.0.1:4173'
  const session = await (await page.request.get('/api/v1/session')).json() as { csrfToken: string }
  const headers = { origin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' }
  expect((await page.request.post('/api/v1/demands', { headers: { ...headers, 'idempotency-key': 'stale-create' }, data: { id: 'demand-stale', projectId: 'project-1', goal: 'Objetivo A revisado' } })).status()).toBe(200)
  let planningWrites = 0
  await page.route('**/api/v1/demands/demand-stale/plan', route => { planningWrites++; expect(route.request().postDataJSON().expectedVersion).toBe(2); return route.fulfill({ status: 409, json: { error: 'CONFLICT' } }) })
  await page.goto('/#configuracao')
  await page.getByRole('combobox', { name: 'Binding confiável' }).click()
  await page.getByRole('option', { name: 'demand-stale · project-1', exact: true }).click()
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Objetivo A revisado')
  await page.getByRole('button', { name: 'Propor plano', exact: true }).click()
  expect((await page.request.patch('/api/v1/demands/demand-stale', { headers: { ...headers, 'idempotency-key': 'stale-update' }, data: { expectedVersion: 1, data: { id: 'demand-stale', projectId: 'project-1', goal: 'Objetivo B remoto' } } })).status()).toBe(200)
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Propor plano', exact: true })).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('desatualizada')
  expect(planningWrites).toBe(0)
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Objetivo A revisado')
  await expect(page.getByRole('button', { name: 'Salvar demanda', exact: true })).toBeDisabled()
  await expect(page.getByText('Objetivo B remoto', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Revisar versão atual', exact: true }).click()
  await expect(page.getByLabel('Objetivo da demanda')).toHaveValue('Objetivo A revisado')
  await page.getByLabel('Objetivo da demanda').fill('Objetivo B remoto')
  await page.getByRole('button', { name: 'Propor plano', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Objetivo B remoto')
  await expect(page.getByRole('dialog')).toContainText('versão 2')
  await page.getByRole('dialog').getByRole('button', { name: 'Propor plano', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Os dados mudaram')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Propor plano', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Salvar demanda', exact: true })).toBeDisabled()
  const record = await (await page.request.get('/api/v1/demands/demand-stale')).json() as { version: number; data: { goal: string } }
  expect(record).toMatchObject({ version: 2, data: { goal: 'Objetivo B remoto' } })
  expect(planningWrites).toBe(1)
})

test('retains loaded timeline pages and merges new events when the run version stays unchanged', async ({ page, context, localCookies }) => {
  await context.addCookies(localCookies)
  let count = 150, runId = 'ui-run'
  const cursors: number[] = []
  await page.route('**/api/v1/runs', route => route.fulfill({ json: [{ ...uiRun, data: { ...uiRun.data, id: runId, status: 'completed' } }] }))
  await page.route('**/api/v1/approvals', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/runs/*/timeline*', route => {
    const url = new URL(route.request().url()), after = Number(url.searchParams.get('after') ?? 0); cursors.push(after)
    const total = runId === 'ui-run' ? count : 2
    const events = Array.from({ length: total }, (_, index) => ({ sequence: index + 1, id: `event-${index + 1}`, at: '2026-10-15T00:00:00Z', type: 'execution.turn', data: { turnId: `${runId}-event-turn-${index + 1}` } })).filter(item => item.sequence > after)
    return route.fulfill({ json: { runId, events: events.slice(0, 100), plannedSources: [], ...(events.length > 100 ? { nextCursor: events[99].sequence } : {}) } })
  })
  await page.goto('/#execucoes')
  await page.getByRole('button', { name: 'Inspecionar execução ui-run', exact: true }).click()
  const timeline = page.getByRole('region', { name: 'Timeline de ui-run', exact: true })
  await expect(timeline.getByText('ui-run-event-turn-100', { exact: true })).toBeVisible()
  await timeline.getByRole('button', { name: 'Mostrar mais eventos', exact: true }).click()
  await expect(timeline.getByText('ui-run-event-turn-150', { exact: true })).toBeVisible()
  count = 160
  await page.evaluate("window.dispatchEvent(new Event('online'))")
  await expect(timeline.getByText('ui-run-event-turn-160', { exact: true })).toBeVisible()
  await expect(timeline.getByText('ui-run-event-turn-150', { exact: true })).toBeVisible()
  await expect(timeline.locator('ol > li')).toHaveCount(160)
  expect(cursors).toContain(150)
  runId = 'ui-other'
  await page.evaluate("window.dispatchEvent(new Event('online'))")
  await page.getByRole('button', { name: 'Inspecionar execução ui-other', exact: true }).click()
  const other = page.getByRole('region', { name: 'Timeline de ui-other', exact: true })
  await expect(other.locator('ol > li')).toHaveCount(2)
  await expect(other.getByText('ui-run-event-turn-150', { exact: true })).toHaveCount(0)
})
