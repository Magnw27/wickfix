import test from 'node:test'
import assert from 'node:assert/strict'
import { validateChatMessages, validateModel } from '../server/input.js'
import { buildContext, chooseModel, classifyTask } from '../server/ai-core.js'

test('validateChatMessages normalizes valid messages', () => {
  const result = validateChatMessages([{ role: 'user', content: ' halo ' }])
  assert.equal(result.ok, true)
  assert.equal(result.messages[0].content, 'halo')
})

test('validateChatMessages rejects excessive message count', () => {
  const result = validateChatMessages(Array.from({ length: 81 }, () => ({ role: 'user', content: 'x' })))
  assert.equal(result.ok, false)
})

test('validateModel accepts provider model ids only', () => {
  assert.equal(validateModel('openai/gpt-4o-mini'), 'openai/gpt-4o-mini')
  assert.equal(validateModel('bad model', 'openrouter/free'), 'openrouter/free')
})

test('buildContext keeps newest messages within budget', () => {
  const result = buildContext([
    { role: 'user', content: 'a'.repeat(1000) },
    { role: 'assistant', content: 'b'.repeat(1000) },
    { role: 'user', content: 'c'.repeat(1000) },
  ], 600)
  assert.equal(result.ok, true)
  assert.equal(result.messages.at(-1).content[0], 'c')
  assert.equal(result.truncated, true)
})

test('AI task classifier detects coding prompts', () => {
  assert.equal(classifyTask([{ role: 'user', content: 'debug this javascript code' }]), 'reasoning')
})

test('model router prefers explicit valid model', () => {
  assert.equal(chooseModel({ requested: 'custom/model', available: [{ id: 'custom/model' }] }), 'custom/model')
})
