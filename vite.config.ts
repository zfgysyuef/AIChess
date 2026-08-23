import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const MAX_PROXY_BODY = 1024 * 1024

async function readBody(request: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > MAX_PROXY_BODY) throw new Error('请求体过大')
  }
  return body
}

async function proxyAI(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const controller = new AbortController()
  const abortUpstream = () => controller.abort()
  request.once('aborted', abortUpstream)
  response.once('close', abortUpstream)

  try {
    const payload = JSON.parse(await readBody(request)) as {
      url?: string
      apiKey?: string
      body?: unknown
    }
    if (!payload.url || payload.body === undefined) throw new Error('缺少上游请求参数')

    const target = new URL(payload.url)
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Base URL 仅支持 HTTP 或 HTTPS')

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (payload.apiKey?.trim()) headers.Authorization = `Bearer ${payload.apiKey.trim()}`

    const upstream = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload.body),
      signal: controller.signal,
    })
    response.statusCode = upstream.status
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.setHeader('X-Accel-Buffering', 'no')
    response.flushHeaders()

    if (upstream.body) {
      for await (const chunk of upstream.body) {
        if (response.destroyed) break
        response.write(Buffer.from(chunk))
      }
    }
    if (!response.writableEnded && !response.destroyed) response.end()
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return
    if (response.headersSent) {
      if (!response.writableEnded) response.end()
      return
    }
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'AI 代理请求失败' }))
  } finally {
    request.off('aborted', abortUpstream)
    response.off('close', abortUpstream)
  }
}

function aiProxyPlugin(): Plugin {
  return {
    name: 'local-ai-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai', proxyAI)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', proxyAI)
    },
  }
}

export default defineConfig({
  plugins: [react(), aiProxyPlugin()],
  server: {
    host: '127.0.0.1',
  },
  preview: {
    host: '127.0.0.1',
  },
})
