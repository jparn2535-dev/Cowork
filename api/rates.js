const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRb-9uV6SPDISMHHDAHGQIoR6YLOF5lg7FryTFeeotf6R-kCJKD6Imtt0jKgBeUnHh4z9EJ7wr7FqGZ/pub?output=csv'

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  return lines.slice(1).map(line => {
    const cols = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    cols.push(cur.trim())
    return cols
  }).filter(r => r.some(c => c !== ''))
}

function normalizeHeader(h) {
  const s = h.toLowerCase().replace(/\s+/g, '')
  if (s.includes('ล้าง') || s.includes('clean')) return 'clean'
  if (s.includes('ซ่อม') || s.includes('repair')) return 'repair'
  if (s.includes('ติดตั้ง') || s.includes('install')) return 'install'
  if (s.includes('btu') || s.includes('ขนาด') || s.includes('size')) return 'btu'
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  try {
    const response = await fetch(SHEET_CSV_URL)
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`)

    const text = await response.text()
    const lines = text.trim().split(/\r?\n/)

    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
    const colMap = {}
    headers.forEach((h, i) => { const k = normalizeHeader(h); if (k) colMap[k] = i })

    if (!colMap.btu || !colMap.clean || !colMap.repair || !colMap.install) {
      throw new Error('Missing required columns (BTU, ล้างแอร์, ซ่อมแอร์, ติดตั้งแอร์)')
    }

    const rates = { clean: {}, repair: {}, install: {} }
    const rows = parseCSV(text)
    rows.forEach(cols => {
      const btu = String(cols[colMap.btu]).replace(/[,\s]/g, '')
      const clean = parseInt(String(cols[colMap.clean]).replace(/[,\s฿]/g, ''))
      const repair = parseInt(String(cols[colMap.repair]).replace(/[,\s฿]/g, ''))
      const install = parseInt(String(cols[colMap.install]).replace(/[,\s฿]/g, ''))
      if (btu && !isNaN(clean) && !isNaN(repair) && !isNaN(install)) {
        rates.clean[btu] = clean
        rates.repair[btu] = repair
        rates.install[btu] = install
      }
    })

    // Cache 5 minutes on Vercel edge
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    res.status(200).json({ ok: true, rates, updatedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
