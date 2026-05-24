const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRb-9uV6SPDISMHHDAHGQIoR6YLOF5lg7FryTFeeotf6R-kCJKD6Imtt0jKgBeUnHh4z9EJ7wr7FqGZ/pub?output=csv'

function parseLine(line) {
  const cols = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  cols.push(cur.trim())
  return cols
}

function normalizeServiceType(s) {
  const v = s.toLowerCase().replace(/\s+/g, '')
  if (v.includes('ล้าง') || v.includes('clean') || v.includes('wash')) return 'clean'
  if (v.includes('ซ่อม') || v.includes('repair') || v.includes('fix')) return 'repair'
  if (v.includes('ติดตั้ง') || v.includes('install')) return 'install'
  return null
}

function parseSheetData(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return null

  // Row 0: [label_col, btu1, btu2, ...]
  const headerCols = parseLine(lines[0])
  const btuKeys = headerCols.slice(1).map(h => h.replace(/[,\s"]/g, ''))

  const rates = { clean: {}, repair: {}, install: {} }
  let loaded = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])
    const serviceType = normalizeServiceType(cols[0] || '')
    if (!serviceType) continue

    btuKeys.forEach((btu, j) => {
      const price = parseInt(String(cols[j + 1] || '').replace(/[,\s฿"]/g, ''))
      if (btu && !isNaN(price) && price > 0) {
        rates[serviceType][btu] = price
        loaded++
      }
    })
  }

  return loaded > 0 ? { rates, btuKeys } : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  try {
    const response = await fetch(SHEET_CSV_URL)
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`)

    const text = await response.text()
    const result = parseSheetData(text)

    if (!result) {
      const firstLine = text.split('\n')[0]
      return res.status(400).json({
        ok: false,
        error: 'ไม่พบข้อมูลราคา',
        firstRow: firstLine
      })
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
    res.status(200).json({
      ok: true,
      rates: result.rates,
      btuKeys: result.btuKeys,
      updatedAt: new Date().toISOString()
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
