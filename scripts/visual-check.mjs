import { chromium } from 'playwright-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE_URL = 'http://127.0.0.1:5173/'

function firstLegalChoice(prompt) {
  const section = String(prompt).split(/合法着法 ID[^\n]*：\n/)[1] || ''
  const firstLine = section.trim().split(/\r?\n/)[0] || ''
  const [id, notation = ''] = firstLine.split('|').map((part) => part.trim())
  return { id, notation }
}

function rememberedThinkingMoves(prompt) {
  const section = String(prompt).split('你此前的思考轨迹（仅供复盘，当前局面与合法着法优先）：')[1]?.split('合法着法 ID')[0] || ''
  return [...section.matchAll(/选择列表中的 ([A-Za-z]+\d+)/g)].map((match) => match[1])
}

async function displayedWinRate(page) {
  const values = await page.locator('.win-rate-side strong').allTextContents()
  return values.map((value) => Number.parseInt(value, 10))
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
const apiCalls = []
let scenario = 'initial'

page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

await page.route('**/api/ai', async (route) => {
  const payload = route.request().postDataJSON()
  const responses = String(payload.url).endsWith('/responses')
  const prompt = responses ? payload.body.input : payload.body.messages.at(-1).content
  const choice = firstLegalChoice(prompt)
  const move = choice.id
  const returnedMove = scenario === 'board-checks' && choice.notation ? `${move}[${choice.notation}]` : move
  apiCalls.push({
    scenario,
    style: responses ? 'responses' : 'chat',
    key: payload.apiKey,
    move,
    returnedMove,
    stream: payload.body.stream,
    reasoningEffort: responses ? payload.body.reasoning?.effort : payload.body.reasoning_effort,
    rememberedMoves: rememberedThinkingMoves(prompt),
  })
  const reasoning = `检查当前合法着法，并选择列表中的 ${move}。`
  const body = responses
    ? [
        `data: ${JSON.stringify({ type: 'response.reasoning_text.delta', delta: reasoning.slice(0, 8) })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.reasoning_text.delta', delta: reasoning.slice(8) })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: JSON.stringify({ move: returnedMove, reason: '选择首个合法着法' }) })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
    : [
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning.slice(0, 8) } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning.slice(8) } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ move: returnedMove, reason: '选择首个合法着法' }) } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
  await new Promise((resolve) => setTimeout(resolve, 500))
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
})

await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.getByText('棋境', { exact: true }).waitFor()

const initialMetrics = await page.evaluate(() => ({
  viewport: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  board: (() => {
    const rect = document.querySelector('.grid-board')?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  })(),
  winRate: (() => {
    const rect = document.querySelector('.win-rate-panel')?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  })(),
}))
if (initialMetrics.scrollWidth > initialMetrics.viewport + 1) errors.push('desktop horizontal overflow')
if (!initialMetrics.board || initialMetrics.board.width < 480 || initialMetrics.board.height < 480) errors.push('desktop board is undersized or missing')
const initialWinRate = await displayedWinRate(page)
if (initialWinRate.length !== 2 || initialWinRate[0] + initialWinRate[1] !== 100) errors.push(`invalid initial win rate: ${initialWinRate}`)
if (!initialMetrics.winRate || initialMetrics.winRate.width !== initialMetrics.board?.width) errors.push('desktop win rate bar does not align with the board')
await page.screenshot({ path: 'outputs/qijing-desktop.png', fullPage: true })

await page.getByRole('button', { name: '模型设置' }).click()
const dialog = page.getByRole('dialog', { name: 'AI 模型配置' })
await dialog.getByLabel('API Key').fill('key-a')
await dialog.getByLabel('模型').fill('mock-chat-model')
await dialog.getByLabel('AI 推理深度').fill('high')
await dialog.getByRole('button', { name: 'Chat Completions' }).click()
await dialog.getByRole('tab', { name: 'AI B' }).click()
await dialog.getByLabel('API Key').fill('key-b')
await dialog.getByLabel('模型').fill('mock-responses-model')
await dialog.getByLabel('AI 推理深度').fill('low')
await dialog.getByRole('button', { name: 'Responses API' }).click()
await page.screenshot({ path: 'outputs/qijing-settings.png' })
await dialog.getByRole('button', { name: '保存配置' }).click()

scenario = 'human-ai'
await page.getByRole('gridcell', { name: 'H8' }).click()
await page.locator('.move-entry').nth(1).waitFor({ timeout: 5000 })
if (await page.locator('.move-entry').count() !== 2) errors.push('human-vs-ai did not complete two plies')

scenario = 'ai-ai'
await page.getByRole('button', { name: 'AI 对弈' }).click()
await page.getByRole('tab', { name: 'AI 思考' }).click()
await page.getByRole('button', { name: '开始对弈' }).click()
await page.locator('.live-thinking-entry').getByText('思考中').waitFor({ timeout: 3000 })
await page.screenshot({ path: 'outputs/qijing-ai-thinking-live.png', fullPage: true })
await page.getByRole('tab', { name: '棋谱', exact: true }).click()
await page.locator('.move-entry').nth(3).waitFor({ timeout: 10000 })
await page.getByRole('button', { name: '暂停对弈' }).click()
await page.getByRole('button', { name: '认输' }).click()
const aiResignDialog = page.getByRole('dialog', { name: '确认认输' })
if (await aiResignDialog.getByRole('button', { name: /AI [AB]/ }).count() !== 2) errors.push('AI-vs-AI resignation did not offer both seats')
await aiResignDialog.getByRole('button', { name: /AI B/ }).click()
if (!await aiResignDialog.getByText(/AI B（白方）/).isVisible()) errors.push('AI B resignation selection did not update the winner summary')
await aiResignDialog.getByRole('button', { name: '取消' }).click()
if (!apiCalls.some((call) => call.style === 'chat' && call.key === 'key-a')) errors.push('Chat Completions profile was not used')
if (!apiCalls.some((call) => call.style === 'responses' && call.key === 'key-b')) errors.push('Responses profile was not used')
if (apiCalls.some((call) => call.key === 'key-a' && call.reasoningEffort !== 'high')) errors.push('AI A reasoning effort was not sent as reasoning_effort')
if (apiCalls.some((call) => call.key === 'key-b' && call.reasoningEffort !== 'low')) errors.push('AI B reasoning effort was not sent as reasoning.effort')
if (apiCalls.some((call) => call.stream !== true)) errors.push('an AI request did not enable streaming')
const aiMatchCalls = apiCalls.filter((call) => call.scenario === 'ai-ai')
if (aiMatchCalls[0]?.rememberedMoves.length) errors.push('AI A received thinking history before its first move')
if (aiMatchCalls[1]?.rememberedMoves.length) errors.push('AI B could see AI A thinking history')
if (aiMatchCalls[2]?.rememberedMoves.join(',') !== aiMatchCalls[0]?.move) errors.push('AI A did not receive only its own prior thinking')
if (aiMatchCalls[3]?.rememberedMoves.join(',') !== aiMatchCalls[1]?.move) errors.push('AI B did not receive only its own prior thinking')
await page.screenshot({ path: 'outputs/qijing-ai-vs-ai.png', fullPage: true })

await page.getByRole('tab', { name: 'AI 思考' }).click()
await page.locator('.thinking-entry').nth(3).waitFor({ timeout: 3000 })
const thinkingPaths = await page.locator('.thinking-text').allTextContents()
if (thinkingPaths.some((path) => !path.includes('检查当前合法着法'))) errors.push('AI reasoning path was not displayed')
const thinkingDurations = await page.locator('.thinking-duration').allTextContents()
if (thinkingDurations.length < 4 || thinkingDurations.some((duration) => !duration.includes('思考用时'))) errors.push('thinking duration was not displayed for every AI move')
await page.screenshot({ path: 'outputs/qijing-ai-thinking.png', fullPage: true })
await page.getByRole('tab', { name: '棋谱', exact: true }).click()

scenario = 'board-checks'
await page.getByRole('button', { name: '人机', exact: true }).click()
for (const [tab, selector, screenshot] of [
  ['象棋', '.xiangqi-board', 'outputs/qijing-xiangqi.png'],
  ['围棋', '.go-board', 'outputs/qijing-go.png'],
  ['国际象棋', '.chess-board', 'outputs/qijing-chess.png'],
  ['五子棋', '.gomoku-board', 'outputs/qijing-gomoku.png'],
]) {
  await page.getByRole('button', { name: tab, exact: true }).click()
  const box = await page.locator(selector).boundingBox()
  if (!box || box.width < 350 || box.height < 350) errors.push(`${tab} board missing or undersized`)
  if (tab === '象棋') {
    await page.getByRole('gridcell', { name: '1路10行 车' }).click()
    await page.getByRole('gridcell', { name: '1路9行' }).click()
  } else if (tab === '围棋') {
    const goPointCount = await page.locator('.go-board [role="gridcell"]').count()
    const standardSizeSelected = await page.getByRole('button', { name: '19 路', exact: true }).evaluate((button) => button.classList.contains('active'))
    if (goPointCount !== 361) errors.push(`Go board has ${goPointCount} points instead of 361`)
    if (!standardSizeSelected) errors.push('19x19 is not the selected Go board size')
    await page.getByRole('gridcell', { name: 'E5' }).click()
  } else if (tab === '国际象棋') {
    await page.getByRole('gridcell', { name: 'e2 白棋子' }).click()
    await page.getByRole('gridcell', { name: 'e4' }).click()
  } else {
    await page.getByRole('gridcell', { name: 'H8' }).click()
  }
  await page.locator('.move-entry').nth(1).waitFor({ timeout: 5000 })
  const gameWinRate = await displayedWinRate(page)
  if (gameWinRate.length !== 2 || gameWinRate[0] + gameWinRate[1] !== 100) errors.push(`${tab} displayed an invalid win rate: ${gameWinRate}`)
  await page.screenshot({ path: screenshot, fullPage: true })
}

const annotatedMoveCalls = apiCalls.filter((call) => call.scenario === 'board-checks' && call.returnedMove.includes('['))
if (annotatedMoveCalls.length < 2) errors.push('annotated chess move compatibility was not exercised')

await page.getByRole('button', { name: '认输' }).click()
const humanResignDialog = page.getByRole('dialog', { name: '确认认输' })
await page.screenshot({ path: 'outputs/qijing-resign-confirmation.png', fullPage: true })
await humanResignDialog.getByRole('button', { name: '确认认输' }).click()
const resignationResult = await page.getByLabel('对局结果').textContent()
if (!resignationResult?.includes('黑方认输，白方获胜')) errors.push(`unexpected resignation result: ${resignationResult}`)
if (!await page.getByRole('button', { name: '再来一局' }).isVisible()) errors.push('new match action was not shown after resignation')
if (await page.getByRole('button', { name: '认输' }).count()) errors.push('resign action remained visible after the match ended')
const resignedWinRate = await displayedWinRate(page)
if (resignedWinRate.join(',') !== '0,100') errors.push(`resignation did not show an exact 0/100 win rate: ${resignedWinRate}`)
await page.screenshot({ path: 'outputs/qijing-resigned.png', fullPage: true })
await page.getByTitle('悔棋').click()
if (await page.getByLabel('对局结果').count()) errors.push('undo did not retract the resignation result')
if (!await page.getByRole('button', { name: '认输' }).isVisible()) errors.push('resign action did not return after undo')
const restoredWinRate = await displayedWinRate(page)
if (restoredWinRate.some((value) => value === 0 || value === 100)) errors.push(`undo did not restore an estimated win rate: ${restoredWinRate}`)

await page.setViewportSize({ width: 1440, height: 900 })
await page.reload({ waitUntil: 'networkidle' })
const compactDesktopMetrics = await page.evaluate(() => {
  const stage = document.querySelector('.board-stage')?.getBoundingClientRect()
  const board = document.querySelector('.grid-board')?.getBoundingClientRect()
  return {
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    boardWidth: board?.width || 0,
    boardClipped: Boolean(stage && board && board.bottom > stage.bottom + 1),
  }
})
if (compactDesktopMetrics.scrollWidth > compactDesktopMetrics.viewport + 1) errors.push('compact desktop horizontal overflow')
if (compactDesktopMetrics.boardWidth < 600 || compactDesktopMetrics.boardClipped) errors.push(`compact desktop board is clipped or undersized: ${JSON.stringify(compactDesktopMetrics)}`)
await page.screenshot({ path: 'outputs/qijing-compact-desktop.png', fullPage: true })

await page.setViewportSize({ width: 390, height: 844 })
await page.reload({ waitUntil: 'networkidle' })
const mobileMetrics = await page.evaluate(() => ({
  viewport: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  board: (() => {
    const rect = document.querySelector('.grid-board')?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  })(),
  winRate: (() => {
    const rect = document.querySelector('.win-rate-panel')?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  })(),
}))
if (mobileMetrics.scrollWidth > mobileMetrics.viewport + 1) errors.push('mobile horizontal overflow')
if (!mobileMetrics.board || mobileMetrics.board.width < 340) errors.push('mobile board is undersized or missing')
if (!mobileMetrics.winRate || mobileMetrics.winRate.width > mobileMetrics.viewport) errors.push('mobile win rate bar overflows the viewport')
await page.screenshot({ path: 'outputs/qijing-mobile.png', fullPage: true })

await page.getByRole('button', { name: '模型设置' }).click()
const mobileSettings = page.getByRole('dialog', { name: 'AI 模型配置' })
const mobileReasoningInput = mobileSettings.getByLabel('AI 推理深度')
await mobileReasoningInput.scrollIntoViewIfNeeded()
if (await mobileReasoningInput.inputValue() !== 'high') errors.push('reasoning effort did not persist after reload')
if (!await mobileReasoningInput.isVisible()) errors.push('reasoning effort input is not visible on mobile')
await page.screenshot({ path: 'outputs/qijing-reasoning-depth-mobile.png', fullPage: true })
await mobileSettings.getByTitle('关闭').click()

await browser.close()

console.log(JSON.stringify({ initialMetrics, compactDesktopMetrics, mobileMetrics, apiCalls, errors }, null, 2))
if (errors.length) process.exitCode = 1
