import { config } from './config.js'
import { fetchChatCompletion } from './openai.js'
import { validateChatMessages, validateModel } from './input.js'
import { buildContext, chooseModel, classifyTask } from './ai-core.js'
import { logEvent } from './observability.js'

export async function runOrchestration({ messages, model, task, apiKey, baseUrl, signal }) {
  const checked = validateChatMessages(messages)
  if (!checked.ok) return { ok: false, status: 400, error: checked.error }

  const context = buildContext(checked.messages, 24000)
  if (!context.ok) return { ok: false, status: 400, error: context.error }

  const selectedTask = task || classifyTask(context.messages)
  const selectedModel = chooseModel({ requested: validateModel(model, ''), task: selectedTask })
  logEvent('ai.orchestration', {
    task: selectedTask,
    model: selectedModel,
    messages: context.messages.length,
    truncated: context.truncated,
  })

  try {
    const response = await fetchChatCompletion(
      { model: selectedModel || config.defaultModel, messages: context.messages, stream: false },
      signal,
      { apiKey, baseUrl },
    )
    return { ok: response.ok, status: response.status, model: selectedModel || config.defaultModel, response }
  } catch (error) {
    return { ok: false, status: 502, error: error.name === 'AbortError' ? 'Request dibatalkan.' : 'Provider AI tidak dapat dihubungi.' }
  }
}
