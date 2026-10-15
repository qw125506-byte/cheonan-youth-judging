import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from 'fflate'
import type { AppData } from './types'
import type { Results } from './calc'

/**
 * 「청년정책아이디어 공모전 제안심사위원회 심사의결서」 원본 양식(.hwpx)의 빈칸을 채운다.
 * 글꼴·표·테두리·밑줄 등 양식은 그대로 두고, 각 칸·줄의 기존 글자모양을 유지한 채 글자만 넣는다.
 *
 * 양식 구조(section0.xml, 표0 = 14행×6열)
 *  - r1c2 심사일시, r3c2 참석, r4c2 심사건수
 *  - r6c0 안의 밑줄 친 6줄: "(최 우 수) ____", "(우   수) ____" ×2, "(장   려) ____" ×3 → 줄마다 제안명을 넣는다
 *  - r8~r13 c3: 의결 성명(위원장, 위원×5)
 */

const MEETING_TIME = '14:00 ~ 16:00'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
/** 선정 줄 머리말(양식 그대로) */
const LINE_LABEL = /^\((최 우 수|우 {3}수|장 {3}려)\)/

interface Cell { table: number; row: number; col: number; start: number; end: number }

/** 표·칸 위치를 찾는다(중첩 표 포함). table 번호는 문서에 나오는 <hp:tbl> 순서 */
export function scanCells(xml: string): Cell[] {
  const re = /<hp:tbl\b|<\/hp:tbl>|<hp:tc\b|<\/hp:tc>/g
  const tblStack: number[] = []
  const tcStack: { start: number; table: number }[] = []
  const cells: Cell[] = []
  let tblCount = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const tok = m[0]
    if (tok === '<hp:tbl') tblStack.push(tblCount++)
    else if (tok === '</hp:tbl>') tblStack.pop()
    else if (tok === '<hp:tc') tcStack.push({ start: m.index, table: tblStack[tblStack.length - 1] })
    else {
      const open = tcStack.pop()!
      const end = m.index + tok.length
      // 칸 주소는 칸 끝(</hp:tc>) 바로 앞의 cellAddr
      const addrAt = xml.lastIndexOf('<hp:cellAddr', end)
      const a = /colAddr="(\d+)" rowAddr="(\d+)"/.exec(xml.slice(addrAt, addrAt + 60))!
      cells.push({ table: open.table, row: Number(a[2]), col: Number(a[1]), start: open.start, end })
    }
  }
  return cells
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textOf = (p: string) => [...p.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1]).join('')

/**
 * 문단 하나의 글자를 바꾼다. innerXml은 <hp:t> 안에 들어갈 내용(이스케이프된 문자열, <hp:fwSpace/> 허용).
 * 첫 run의 글자모양을 쓰며(charPr로 바꿀 수 있음), 줄 배치 캐시(linesegarray)는 지워 한글이 다시 계산하게 한다.
 */
function setParaXml(p: string, innerXml: string, charPr?: string, paraPr?: string): string {
  const cp = charPr ?? /<hp:run charPrIDRef="(\d+)"/.exec(p)![1]
  if (paraPr) p = p.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${paraPr}"`)
  const runsStart = p.indexOf('<hp:run ')
  const lineseg = p.indexOf('<hp:linesegarray>')
  const runsEnd = lineseg >= 0 ? lineseg : p.lastIndexOf('</hp:p>')
  p = p.slice(0, runsStart) + `<hp:run charPrIDRef="${cp}"><hp:t>${innerXml}</hp:t></hp:run>` + p.slice(runsEnd)
  return p.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, '')
}

/** 칸의 첫 문단 글자를 바꾼다 */
function setCellXml(cellXml: string, innerXml: string): string {
  const pStart = cellXml.indexOf('<hp:p ')
  const pEnd = cellXml.indexOf('</hp:p>', pStart) + '</hp:p>'.length
  return cellXml.slice(0, pStart) + setParaXml(cellXml.slice(pStart, pEnd), innerXml) + cellXml.slice(pEnd)
}

// ───────────────────────── 글자 폭 추정·크기 선택 ─────────────────────────

/** 대략적 글자 폭(글자 크기 대비): 한글·전각 1, 영문·숫자·공백·문장부호 0.55 */
export function textWidthEm(s: string): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) < 0x1100 ? 0.55 : 1
  return w
}

/** 원래 선정 줄 1개의 높이(15pt × 줄간격 211%) — 6줄이 차지하던 높이 안에서만 배치한다(넘으면 의결란이 2쪽으로 밀림) */
const ORIGINAL_LINE_HEIGHT = Math.round(1500 * 2.11)
/** 새로 배치할 때의 줄간격(%)과 항목 사이 최소 간격(HWPUNIT) */
const NEW_LINE_SPACING = 120
const MIN_GAP = 300
/** 고를 글자 크기 후보(1/100pt) — 큰 것부터 */
const SIZES = [1500, 1400, 1300, 1200, 1100, 1000, 900] as const
/** 폭 추정 오차를 고려한 안전 계수 */
const SAFE = 0.93

export interface Layout {
  /** 6줄 공통 글자 크기 */
  size: number
  /** 원래 모양 그대로(15pt·한 줄씩)인지 */
  original: boolean
  /** 항목별 줄 수 */
  lines: number[]
  /** 항목 사이 간격(문단 뒤 여백, HWPUNIT) */
  gap: number
  /** 항목별 넣을 글자(밑줄이 줄 끝까지 가도록 공백 포함) */
  texts: string[]
}

/**
 * 선정 6줄 배치. 모든 줄에 같은 글자 크기를 쓰고, 원래 6줄이 차지하던 높이를 넘지 않는 가장 큰 크기를 고른다.
 * 남는 높이는 항목 사이 간격으로 고르게 나눈다. 밑줄이 원래처럼 줄 끝까지 이어지도록 뒤에 공백을 채운다.
 * originals: 양식의 원래 줄 글자(머리말+공백), titles: 넣을 제안명
 */
export function planLines(originals: string[], titles: string[]): Layout {
  const bodies = titles.map((t, i) => `${LINE_LABEL.exec(originals[i])![0]} ${t}`)
  // 원래 줄(머리말+공백)이 차지하는 폭 = 15pt에서 한 줄에 쓸 수 있는 폭
  const capacity15 = Math.min(...originals.map(textWidthEm))
  const budget = ORIGINAL_LINE_HEIGHT * originals.length
  const pad = (body: string, room: number) => body + ' '.repeat(Math.max(0, Math.floor((room - textWidthEm(body)) / 0.55) - 2))

  // 모두 15pt 한 줄에 들어가면 양식 그대로
  if (bodies.every((b) => textWidthEm(b) <= capacity15 - 1)) {
    return { size: 1500, original: true, lines: bodies.map(() => 1), gap: 0, texts: bodies.map((b, i) => pad(b, textWidthEm(originals[i]))) }
  }
  for (const size of SIZES) {
    const perLine = (capacity15 * 1500) / size
    const lines = bodies.map((b) => Math.ceil(textWidthEm(b) / (perLine * SAFE)))
    const used = lines.reduce((acc, n) => acc + (n * size * NEW_LINE_SPACING) / 100, 0)
    const gap = Math.floor((budget - used) / bodies.length)
    if (gap >= MIN_GAP || size === SIZES[SIZES.length - 1]) {
      // 두 줄 이상 항목은 공백을 채우지 않는다(폭 추정이 넉넉해 실제로 한 줄이면 빈 밑줄 줄이 생기므로)
      return { size, original: false, lines, gap: Math.max(0, gap), texts: bodies.map((b, i) => (lines[i] === 1 ? pad(b, perLine * SAFE) : b)) }
    }
  }
  throw new Error('unreachable')
}

// ───────────────────────── 글자·문단 모양 추가 ─────────────────────────

/** header.xml에 원본 모양을 복제한 글자모양(크기만 다름)·문단모양(줄간격만 다름)을 필요한 만큼 추가한다 */
class StyleAdder {
  private added = { char: 0, para: 0 }
  private cache = new Map<string, string>()
  private nextChar: number
  private nextPara: number
  private header: string
  constructor(header: string) {
    this.header = header
    const maxId = (tag: string) => Math.max(...[...header.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, 'g'))].map((m) => Number(m[1])))
    this.nextChar = maxId('charPr') + 1
    this.nextPara = maxId('paraPr') + 1
  }
  char(base: string, size: number): string {
    const key = `c${base}:${size}`
    if (this.cache.has(key)) return this.cache.get(key)!
    const src = new RegExp(`<hh:charPr id="${base}"[\\s\\S]*?</hh:charPr>`).exec(this.header)![0]
    const id = String(this.nextChar++)
    this.header = this.header.replace('</hh:charProperties>', src.replace(`id="${base}"`, `id="${id}"`).replace(/height="\d+"/, `height="${size}"`) + '</hh:charProperties>')
    this.added.char++
    this.cache.set(key, id)
    return id
  }
  para(base: string, spacing: number, after = 0): string {
    const key = `p${base}:${spacing}:${after}`
    if (this.cache.has(key)) return this.cache.get(key)!
    const src = new RegExp(`<hh:paraPr id="${base}"[\\s\\S]*?</hh:paraPr>`).exec(this.header)![0]
    const id = String(this.nextPara++)
    this.header = this.header.replace('</hh:paraProperties>', src.replace(`id="${base}"`, `id="${id}"`).replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, `$1${spacing}`).replace(/(<hc:next value=")\d+/g, `$1${after}`) + '</hh:paraProperties>')
    this.added.para++
    this.cache.set(key, id)
    return id
  }
  result(): string {
    return this.header
      .replace(/<hh:charProperties itemCnt="(\d+)">/, (_, n) => `<hh:charProperties itemCnt="${Number(n) + this.added.char}">`)
      .replace(/<hh:paraProperties itemCnt="(\d+)">/, (_, n) => `<hh:paraProperties itemCnt="${Number(n) + this.added.para}">`)
  }
}

// ───────────────────────── 채우기 ─────────────────────────

export interface UigyeolFill {
  /** 심사일시 칸 내용(<hp:fwSpace/> 포함 가능, 이스케이프된 XML) */
  dateXml: string
  attendees: number
  count: number
  /** 1~6위 제안명(최우수, 우수, 우수, 장려, 장려, 장려 순) */
  winners: string[]
  /** [위원장, 위원1..5] 성명. 비어 있으면 성명 칸을 비워 둔다 */
  names: string[]
}

export function fillDocument(section: string, header: string, f: UigyeolFill): { section: string; header: string } {
  const cells = scanCells(section)
  const styles = new StyleAdder(header)
  const at = (row: number, col: number) => {
    const c = cells.find((x) => x.table === 0 && x.row === row && x.col === col)
    if (!c) throw new Error(`심사의결서 양식에서 ${row}행 ${col}열 칸을 찾지 못했습니다(양식이 바뀌었는지 확인)`)
    return c
  }
  const edits: { start: number; end: number; xml: (old: string) => string }[] = []
  const cellEdit = (c: Cell, inner: string) => edits.push({ start: c.start, end: c.end, xml: (old) => setCellXml(old, inner) })

  cellEdit(at(1, 2), f.dateXml)
  cellEdit(at(3, 2), esc(` ${f.attendees}명 참석`))
  cellEdit(at(4, 2), esc(` ${f.count} 건`))
  f.names.forEach((name, i) => { if (name) cellEdit(at(8 + i, 3), esc(name)) })

  // 선정 6줄: r6c0 칸 안에서 머리말로 시작하는 문단을 순서대로 찾는다
  const box = at(6, 0)
  const lines: { start: number; end: number; text: string }[] = []
  const pRe = /<hp:p [^>]*>[\s\S]*?<\/hp:p>/g
  pRe.lastIndex = box.start
  let m: RegExpExecArray | null
  while ((m = pRe.exec(section)) && m.index < box.end) {
    const t = textOf(m[0])
    if (LINE_LABEL.test(t)) lines.push({ start: m.index, end: m.index + m[0].length, text: t })
  }
  if (lines.length !== 6) throw new Error(`심사의결서 양식에서 선정 줄 6개를 찾지 못했습니다(${lines.length}개)`)
  const layout = planLines(lines.map((l) => l.text), f.winners)
  f.winners.forEach((_, i) => {
    const line = lines[i]
    edits.push({
      start: line.start, end: line.end, xml: (old) => {
        if (layout.original) return setParaXml(old, esc(layout.texts[i]))
        const baseChar = /<hp:run charPrIDRef="(\d+)"/.exec(old)![1]
        const basePara = /paraPrIDRef="(\d+)"/.exec(old)![1]
        return setParaXml(old, esc(layout.texts[i]), styles.char(baseChar, layout.size), styles.para(basePara, NEW_LINE_SPACING, layout.gap))
      },
    })
  })

  // 뒤에서부터 바꾸면 앞쪽 위치가 어긋나지 않는다(선정 줄은 r6c0 칸 안쪽이고, 그 칸 자체는 통째로 바꾸지 않음)
  edits.sort((a, b) => b.start - a.start)
  let out = section
  for (const e of edits) out = out.slice(0, e.start) + e.xml(out.slice(e.start, e.end)) + out.slice(e.end)
  return { section: out, header: styles.result() }
}

export function dateCellXml(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  const p = (n: number) => String(n).padStart(2, '0')
  return ` ${d.getFullYear()}.<hp:fwSpace/>${p(d.getMonth() + 1)}.<hp:fwSpace/>${p(d.getDate())}.(${WEEKDAYS[d.getDay()]}) ${esc(MEETING_TIME)}`
}

/** 심사의결서를 채울 수 있는 상태인지. 문제가 있으면 사유 목록 */
export function uigyeolBlockers(results: Results): string[] {
  const out: string[] = []
  if (!results.allComplete) out.push('84건 평가 입력이 끝나지 않았습니다')
  if (results.unresolvedTies.length) out.push('수상 경계 동점에 대한 위원회 결정이 기록되지 않았습니다')
  return out
}

export function buildFill(data: AppData, results: Results): UigyeolFill {
  const winners = results.rows
    .filter((r) => r.position !== null && r.position <= 6)
    .sort((a, b) => a.position! - b.position!)
    .map((r) => data.proposals.find((p) => p.no === r.no)!.title)
  const chair = data.judges.find((j) => j.id === data.chairJudgeId)
  const names = chair ? [chair.name, ...data.judges.filter((j) => j.id !== chair.id).map((j) => j.name)] : []
  return { dateXml: dateCellXml(data.meta.date), attendees: data.judges.length, count: data.proposals.length, winners, names }
}

/** 원본 양식 바이트 → 채운 .hwpx 바이트. mimetype을 맨 앞에 무압축으로 둔다(HWPX 규격) */
export function buildUigyeolHwpx(template: Uint8Array, fill: UigyeolFill): Uint8Array {
  const files = unzipSync(template)
  const sec = 'Contents/section0.xml'
  const head = 'Contents/header.xml'
  const out = fillDocument(strFromU8(files[sec]), strFromU8(files[head]), fill)
  files[sec] = strToU8(out.section)
  files[head] = strToU8(out.header)
  if (files['Preview/PrvText.txt']) {
    files['Preview/PrvText.txt'] = strToU8(`심사의결서\r\n${fill.winners.map((w, i) => `${i + 1}. ${w}`).join('\r\n')}`)
  }
  const ordered: Zippable = { mimetype: [files.mimetype, { level: 0 }] }
  for (const [name, bytes] of Object.entries(files)) {
    if (name === 'mimetype') continue
    ordered[name] = [bytes, { level: name.endsWith('.png') ? 0 : 6 }]
  }
  return zipSync(ordered)
}
