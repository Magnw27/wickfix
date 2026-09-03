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

export function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.appReferer ? { 'HTTP-Referer': config.appReferer } : {}),
    ...(config.appTitle ? { 'X-Title': config.appTitle } : {}),
  }
}

export function fetchChatCompletion(body, signal) {
  return fetch(`${config.openRouterBase}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  })
}

export function fetchModels(signal) {
  return fetch(`${config.openRouterBase}/models`, {
    method: 'GET',
    headers: authHeaders(),
    signal,
  })
}

export function fetchImageGeneration(body, signal) {
  return fetch(`${config.openRouterBase}/images/generations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  })
}