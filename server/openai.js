import { config } from './config.js'

export const ERROR_MESSAGES = {
  400: 'Permintaan tidak valid. Periksa isi pesan.',
  401: 'API key tidak valid. Periksa API key di file .env.',
  402: 'Kredit provider tidak mencukupi. Periksa saldo akun.',
  403: 'Akses ditolak oleh provider. Periksa izin API key.',
  404: 'Model tidak ditemukan. Periksa ID model.',
  429: 'Rate limit tercapai. Tunggu sebentar atau ganti model (model gratis sering kena batas).',
  500: 'Error di server provider. Coba lagi.',
  502: 'Gagal terhubung ke provider. Coba lagi.',
  503: 'Layanan provider sibuk. Coba lagi.',
  504: 'Timeout dari provider. Coba lagi dengan model lain.',
}

export function friendlyError(status) {
  return ERROR_MESSAGES[status] || `Terjadi kesalahan (${status}). Coba lagi.`
}

export function authHeaders(apiKey = config.apiKey, baseUrl) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey || config.apiKey}`,
    ...(config.appReferer ? { 'HTTP-Referer': config.appReferer } : {}),
    ...(config.appTitle ? { 'X-Title': config.appTitle } : {}),
  }
}

function upstreamBase(baseUrl) {
  return (baseUrl || config.openRouterBase)
}

export function fetchChatCompletion(body, signal, opts = {}) {
  return fetch(`${upstreamBase(opts.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(opts.apiKey, opts.baseUrl),
    body: JSON.stringify(body),
    signal,
  })
}

export function fetchModels(signal, opts = {}) {
  return fetch(`${upstreamBase(opts.baseUrl)}/models`, {
    method: 'GET',
    headers: authHeaders(opts.apiKey, opts.baseUrl),
    signal,
  })
}

export function fetchImageGeneration(body, signal, opts = {}) {
  return fetch(`${upstreamBase(opts.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: authHeaders(opts.apiKey, opts.baseUrl),
    body: JSON.stringify(body),
    signal,
  })
}