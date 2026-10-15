import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from 'fflate'
import type { AppData } from './types'
import { fmt2, type Results } from './calc'

/**
 * 「청년정책아이디어 공모전 제안심사위원회 심사의결서」 원본 양식(.hwpx)의 빈칸을 채운다.
 * 글꼴·표·테두리 등 양식은 그대로 두고 각 칸의 기존 글자모양(charPrIDRef)을 유지한 채 글자만 넣는다.
 *
 * 양식 구조(section0.xml)
 *  - 표0(14행×6열): r1c2 심사일시, r2c2 심사장소, r3c2 참석, r4c2 심사건수, r8~r13 c3 의결 성명(위원장, 위원×5)
 *  - 표1(표0 r6c0 안의 7행×5열): r1~r6 → c2 제안 사업명, c3 평균 총점, c4 비고
 */

const MEETING_TIME = '14:00 ~ 16:00'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

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
      // 칸 주소는 칸 끝(</hp:tc>) 바로 앞의 cellAddr. 중첩 표가 있어도 마지막 것이 자기 주소
      const addrAt = xml.lastIndexOf('<hp:cellAddr', end)
      const a = /colAddr="(\d+)" rowAddr="(\d+)"/.exec(xml.slice(addrAt, addrAt + 60))!
      cells.push({ table: open.table, row: Number(a[2]), col: Number(a[1]), start: open.start, end })
    }
  }
  return cells
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 칸의 첫 문단 글자를 바꾼다. innerXml은 <hp:t> 안에 들어갈 내용(이미 이스케이프된 문자열, <hp:fwSpace/> 허용).
 * 줄 배치 캐시(linesegarray)는 지워서 한글이 열 때 줄바꿈을 다시 계산하게 한다.
 */
function setCellXml(cellXml: string, innerXml: string, style?: CellStyle): string {
  const pStart = cellXml.indexOf('<hp:p ')
  const pEnd = cellXml.indexOf('</hp:p>', pStart) + '</hp:p>'.length
  let p = cellXml.slice(pStart, pEnd)
  const charPr = style?.charPr ?? /<hp:run charPrIDRef="(\d+)"/.exec(p)![1]
  if (style?.paraPr) p = p.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${style.paraPr}"`)
  // 첫 run만 남기고 글자를 넣는다
  const runsStart = p.indexOf('<hp:run ')
  const lineseg = p.indexOf('<hp:linesegarray>')
  const runsEnd = lineseg >= 0 ? lineseg : p.lastIndexOf('</hp:p>')
  p = p.slice(0, runsStart) + `<hp:run charPrIDRef="${charPr}"><hp:t>${innerXml}</hp:t></hp:run>` + p.slice(runsEnd)
  p = p.replace(/<hp:linesegarray>.*?<\/hp:linesegarray>/s, '')
  return cellXml.slice(0, pStart) + p + cellXml.slice(pEnd)
}

/** 칸에 원래와 다른 글자·문단 모양을 쓸 때(긴 제안명을 한 쪽에 맞추기 위함) */
interface CellStyle { charPr?: string; paraPr?: string }

/**
 * 양식이 한 쪽을 거의 꽉 채우고 있고 바깥 표는 쪽을 나누지 않으므로, 칸 높이가 조금만 늘어도 표 전체가 2쪽으로 넘어간다.
 * 그래서 제안명·비고 칸 글자는 원래 행 높이(3563, 안쪽 여백 제외 3281) 안에 들어가도록 길이에 따라 크기를 고른다.
 */
const ROW_TEXT_HEIGHT = 3563 - 282
const LINE_SPACING = 115 // %
/** 글자 크기(1/100pt) 후보 — 큰 것부터 */
export const COMPACT_SIZES = [1000, 900, 800] as const

/** 대략적 글자 폭(글자 크기 대비): 한글·전각 1, 영문·숫자·공백·문장부호 0.55 */
function textWidthEm(s: string): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) < 0x1100 ? 0.55 : 1
  return w
}

/** 칸 폭(HWPUNIT, 여백 제외) 안에서 행 높이를 넘지 않는 가장 큰 글자 크기의 순번 */
export function pickSizeIndex(text: string, widthUnits: number): number {
  for (let k = 0; k < COMPACT_SIZES.length; k++) {
    const size = COMPACT_SIZES[k]
    const perLine = (widthUnits / size) * 0.92 // 줄 끝 단어 넘김 여유
    const lines = Math.ceil(textWidthEm(text) / perLine)
    if (lines * size * (LINE_SPACING / 100) <= ROW_TEXT_HEIGHT) return k
  }
  return COMPACT_SIZES.length - 1
}

export interface UigyeolFill {
  /** 심사일시 칸 내용(<hp:fwSpace/> 포함 가능, 이스케이프된 XML) */
  dateXml: string
  attendees: number
  count: number
  /** 1~6위 [제안 사업명, 평균 총점, 비고] */
  winners: [string, string, string][]
  /** [위원장, 위원1..5] 성명. 빈 문자열이면 칸을 비워 둔다 */
  names: string[]
}

/** 안쪽 표 칸 글자 폭(칸 너비 − 좌우 여백 510×2) */
const TITLE_WIDTH = 25730 - 1020
const NOTE_WIDTH = 5920 - 1020

export function fillSection(xml: string, f: UigyeolFill, compact?: CellStyle[]): string {
  const cells = scanCells(xml)
  const edits: { cell: Cell; inner: string; style?: CellStyle }[] = []
  const at = (table: number, row: number, col: number) => {
    const c = cells.find((x) => x.table === table && x.row === row && x.col === col)
    if (!c) throw new Error(`심사의결서 양식에서 표${table} ${row}행 ${col}열 칸을 찾지 못했습니다(양식이 바뀌었는지 확인)`)
    return c
  }
  edits.push({ cell: at(0, 1, 2), inner: f.dateXml })
  edits.push({ cell: at(0, 3, 2), inner: esc(` ${f.attendees} 명 참석`) })
  edits.push({ cell: at(0, 4, 2), inner: esc(` ${f.count} 건`) })
  f.winners.forEach(([title, avg, note], i) => {
    edits.push({ cell: at(1, i + 1, 2), inner: esc(title), style: compact?.[pickSizeIndex(title, TITLE_WIDTH)] })
    edits.push({ cell: at(1, i + 1, 3), inner: esc(avg) })
    if (note) edits.push({ cell: at(1, i + 1, 4), inner: esc(note), style: compact?.[pickSizeIndex(note, NOTE_WIDTH)] })
  })
  f.names.forEach((name, i) => { if (name) edits.push({ cell: at(0, 8 + i, 3), inner: esc(name) }) })

  // 겹치는 칸(바깥 칸이 안쪽 표를 품은 경우)은 고치지 않으므로, 뒤에서부터 바꾸면 위치가 어긋나지 않는다
  edits.sort((a, b) => b.cell.start - a.cell.start)
  let out = xml
  for (const e of edits) out = out.slice(0, e.cell.start) + setCellXml(out.slice(e.cell.start, e.cell.end), e.inner, e.style) + out.slice(e.cell.end)
  return out
}

export function dateCellXml(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  const p = (n: number) => String(n).padStart(2, '0')
  return ` ${d.getFullYear()}.<hp:fwSpace/>${p(d.getMonth() + 1)}.<hp:fwSpace/>${p(d.getDate())}.(${WEEKDAYS[d.getDay()]}) ${esc(MEETING_TIME)}`
}

/** 비고 칸(폭이 좁음): 동점 처리 근거를 짧게 */
function noteFor(r: Results['rows'][number]): string {
  if (r.decided) return '동점(위원회 결정)'
  if (r.brokenBy && r.avgTieSize > 1) return r.brokenBy.includes('효율성') ? '동점(효율성)' : '동점(실시가능성)'
  return ''
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
    .map((r) => [data.proposals.find((p) => p.no === r.no)!.title, fmt2(r.agg.avg), noteFor(r)] as [string, string, string])
  const chair = data.judges.find((j) => j.id === data.chairJudgeId)
  const names = chair ? [chair.name, ...data.judges.filter((j) => j.id !== chair.id).map((j) => j.name)] : []
  return {
    dateXml: dateCellXml(data.meta.date),
    attendees: data.judges.length,
    count: data.proposals.length,
    winners,
    names,
  }
}

/**
 * header.xml에 제안명·비고 칸 전용 글자모양(크기별)과 문단모양(줄간격)을 추가한다.
 * 원본 칸 모양(글자 25번, 문단 19번)을 복제해 크기·줄간격만 바꾸므로 글꼴·정렬은 양식 그대로다.
 * 크기 순서(COMPACT_SIZES)대로 스타일을 돌려준다.
 */
export function addCompactStyles(header: string, baseChar = '25', basePara = '19'): { header: string; styles: CellStyle[] } {
  const maxId = (tag: string) => Math.max(...[...header.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, 'g'))].map((m) => Number(m[1])))
  const charSrc = new RegExp(`<hh:charPr id="${baseChar}"[\\s\\S]*?</hh:charPr>`).exec(header)![0]
  const paraSrc = new RegExp(`<hh:paraPr id="${basePara}"[\\s\\S]*?</hh:paraPr>`).exec(header)![0]
  const paraId = String(maxId('paraPr') + 1)
  const firstChar = maxId('charPr') + 1
  const charNew = COMPACT_SIZES.map((size, k) =>
    charSrc.replace(`id="${baseChar}"`, `id="${firstChar + k}"`).replace(/height="\d+"/, `height="${size}"`)).join('')
  const paraNew = paraSrc.replace(`id="${basePara}"`, `id="${paraId}"`).replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, `$1${LINE_SPACING}`)
  let h = header
  h = h.replace('</hh:charProperties>', charNew + '</hh:charProperties>')
  h = h.replace('</hh:paraProperties>', paraNew + '</hh:paraProperties>')
  h = h.replace(/<hh:charProperties itemCnt="(\d+)">/, (_, n) => `<hh:charProperties itemCnt="${Number(n) + COMPACT_SIZES.length}">`)
  h = h.replace(/<hh:paraProperties itemCnt="(\d+)">/, (_, n) => `<hh:paraProperties itemCnt="${Number(n) + 1}">`)
  return { header: h, styles: COMPACT_SIZES.map((_, k) => ({ charPr: String(firstChar + k), paraPr: paraId })) }
}

/** 원본 양식 바이트 → 채운 .hwpx 바이트. mimetype을 맨 앞에 무압축으로 둔다(HWPX 규격) */
export function buildUigyeolHwpx(template: Uint8Array, fill: UigyeolFill): Uint8Array {
  const files = unzipSync(template)
  const sec = 'Contents/section0.xml'
  const head = 'Contents/header.xml'
  const { header, styles } = addCompactStyles(strFromU8(files[head]))
  files[head] = strToU8(header)
  files[sec] = strToU8(fillSection(strFromU8(files[sec]), fill, styles))
  // 미리보기 글자도 갱신(탐색기 미리보기용)
  if (files['Preview/PrvText.txt']) {
    files['Preview/PrvText.txt'] = strToU8(`심사의결서\r\n${fill.winners.map((w, i) => `${i + 1}. ${w[0]} ${w[1]}`).join('\r\n')}`)
  }
  const ordered: Zippable = { mimetype: [files.mimetype, { level: 0 }] }
  for (const [name, bytes] of Object.entries(files)) {
    if (name === 'mimetype') continue
    ordered[name] = [bytes, { level: name.endsWith('.png') ? 0 : 6 }]
  }
  return zipSync(ordered)
}
