function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeUrl(raw) {
  try {
    if (raw.includes('uddg=')) {
      const u = raw.match(/uddg=([^&]+)/)
      if (u) return decodeURIComponent(u[1])
    }
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function webSearch(query, limit = 6) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
  })
  if (!res.ok) throw new Error(`DDG HTTP ${res.status}`)
  const html = await res.text()

  const results = []
  const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g
  const snipRe = /class="result__snippet"[^>]*>(.*?)<\/a>/g
  const links = []
  let m
  while ((m = linkRe.exec(html)) !== null) links.push(m)
  const snips = []
  while ((m = snipRe.exec(html)) !== null) snips.push(m)

  for (let i = 0; i < links.length && results.length < limit; i++) {
    const href = decodeUrl(links[i][1])
    const title = stripTags(links[i][2])
    if (!title || !href || href.startsWith('//duckduckgo.com')) continue
    results.push({
      title,
      url: href,
      snippet: snips[i] ? stripTags(snips[i][1]) : '',
    })
  }
  return results
}