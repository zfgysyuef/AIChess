import { chromium } from 'playwright-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const APP_URL = process.env.QIJING_APP_URL || 'http://127.0.0.1:5173/'
const baseUrl = process.env.QIJING_QA_BASE_URL
const apiKey = process.env.QIJING_QA_API_KEY
const targetMoves = Number(process.env.QIJING_QA_MOVE_COUNT || 8)

if (!baseUrl || !apiKey) {
  throw new Error('Missing QIJING_QA_BASE_URL or QIJING_QA_API_KEY')
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
const requestStatuses = []

page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('status of 404')) errors.push(`console: ${message.text()}`)
})
page.on('response', (response) => {
  if (response.url().endsWith('/api/ai')) requestStatuses.push(response.status())
})
page.on('requestfailed', (request) => {
  if (request.url().endsWith('/api/ai')) errors.push(`request failed: ${request.failure()?.errorText || 'unknown'}`)
})

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.evaluate(({ baseUrl: url, apiKey: key }) => {
    localStorage.setItem('qijing-settings-v1', JSON.stringify({
      game: 'gomoku',
      mode: 'ai-ai',
      humanSeat: 'first',
      goSize: 9,
      aiDelay: 1500,
      aiA: {
        name: 'AI A',
        baseUrl: url,
        apiKey: key,
        model: 'deepseek-v4-flash',
        apiStyle: 'responses',
      },
      aiB: {
        name: 'AI B',
        baseUrl: url,
        apiKey: key,
        model: 'deepseek-v4-pro',
        apiStyle: 'chat',
      },
    }))
  }, { baseUrl, apiKey })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'AI 思考' }).click()
  await page.evaluate(() => {
    window.__qijingThinkingSamples = []
    const observer = new MutationObserver(() => {
      const text = document.querySelector('.live-thinking-text')?.textContent?.trim() || ''
      const samples = window.__qijingThinkingSamples
      if (text && !text.startsWith('正在等待') && samples.at(-1) !== text) samples.push(text)
    })
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  })
  await page.getByRole('button', { name: '开始对弈' }).click()
  for (let expected = 1; expected <= targetMoves; expected += 1) {
    await page.waitForFunction((count) => (
      document.querySelectorAll('.thinking-entry:not(.live-thinking-entry)').length >= count
      || Boolean(document.querySelector('.error-banner'))
    ), expected, { timeout: 120_000 })
    const status = await page.evaluate(() => ({
      moves: document.querySelectorAll('.thinking-entry:not(.live-thinking-entry)').length,
      error: document.querySelector('.error-banner')?.textContent?.trim() || '',
      turn: document.querySelector('.board-status-bar strong')?.textContent?.trim() || '',
    }))
    console.log(JSON.stringify({ progress: status }))
    if (status.error) throw new Error(status.error)
  }
  await page.getByRole('button', { name: '暂停对弈' }).click().catch(() => {})

  const thinkingSamples = await page.evaluate(() => window.__qijingThinkingSamples)
  const thinkingDurations = await page.locator('.thinking-duration').allTextContents()
  await page.getByRole('tab', { name: '棋谱', exact: true }).click()
  const moves = await page.locator('.move-copy code').allTextContents()
  const reasons = await page.locator('.move-copy p').allTextContents()
  const errorText = await page.locator('.error-banner').allTextContents()
  if (moves.length < targetMoves) errors.push(`only ${moves.length} moves completed`)
  if (new Set(moves).size !== moves.length) errors.push('a played coordinate was reused')
  if (errorText.length) errors.push(`app error: ${errorText.join(' ')}`)
  if (thinkingDurations.length < targetMoves) errors.push('thinking duration was missing after a real AI move')
  if (thinkingSamples.length < 2) errors.push('real reasoning text did not update incrementally')

  console.log(JSON.stringify({
    moveCount: moves.length,
    moves,
    reasons,
    thinkingUpdateCount: thinkingSamples.length,
    thinkingUpdateLengths: thinkingSamples.map((sample) => sample.length),
    thinkingDurations,
    requestStatuses,
    errors,
  }, null, 2))
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: 'outputs/qijing-real-api.png', fullPage: true }).catch(() => {})
  if (errors.length) {
    const diagnostic = await page.evaluate(() => ({
      moves: [...document.querySelectorAll('.move-copy code')].map((node) => node.textContent),
      error: document.querySelector('.error-banner')?.textContent?.trim() || '',
      status: document.querySelector('.board-status-bar')?.textContent?.trim() || '',
    })).catch(() => ({}))
    console.log(JSON.stringify({ diagnostic, requestStatuses, errors }, null, 2))
  }
  await page.evaluate(() => localStorage.removeItem('qijing-settings-v1')).catch(() => {})
  await browser.close()
}

if (errors.length) process.exitCode = 1
