import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
const BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.flatkey.ai'

function getKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || ''
}

export function hasAnthropic() {
  return Boolean(getKey())
}

let client = null
export async function complete(prompt, opts = {}) {
  if (!client) {
    client = new Anthropic({ apiKey: getKey(), baseURL: BASE_URL })
  }
  const msg = await client.messages.create({
    model: opts.model || MODEL,
    max_tokens: opts.maxTokens || 16000,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, usage: msg.usage, stopReason: msg.stop_reason }
}
