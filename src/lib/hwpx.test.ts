import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { buildFill, buildUigyeolHwpx, fillDocument, planLines, scanCells, textWidthEm, uigyeolBlockers } from './hwpx'
import { computeResults } from './calc'
import { createInitialData } from './initialData'
import { fillTestScores } from './testData'

const template = new Uint8Array(readFileSync(new URL('../assets/uigyeolseo-template.hwpx', import.meta.url)))
const files = unzipSync(template)
const section = strFromU8(files['Contents/section0.xml'])
const header = strFromU8(files['Contents/header.xml'])
const plain = (xml: string) => [...xml.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1].replace(/<hp:fwSpace\/>/g, ' ')).join('')

describe('심사의결서 HWPX', () => {
  const d = fillTestScores(createInitialData('test'))
  const tie = computeResults(d).unresolvedTies[0]
  d.tieDecisions[tie.key] = { order: tie.nos, reason: '위원회 협의', at: '' }
  d.chairJudgeId = 'j3'
  const res = computeResults(d)

  it('입력 완료·동점 결정 전에는 사유를 알려 준다', () => {
    expect(uigyeolBlockers(computeResults(createInitialData('test')))).toHaveLength(1)
    expect(uigyeolBlockers(res)).toHaveLength(0)
  })

  it('선정 6줄·일시·참석·위원 성명이 제자리에 들어간다', () => {
    const fill = buildFill(d, res)
    const out = fillDocument(section, header, fill)
    const cells = scanCells(out.section)
    const cell = (r: number, c: number) => {
      const x = cells.find((k) => k.table === 0 && k.row === r && k.col === c)!
      return out.section.slice(x.start, x.end)
    }
    const top6 = res.rows.filter((r) => r.position! <= 6).map((r) => d.proposals.find((p) => p.no === r.no)!.title)
    const lines = [...cell(6, 0).matchAll(/<hp:p [^>]*>[\s\S]*?<\/hp:p>/g)].map((m) => plain(m[0])).filter((t) => t.startsWith('('))
    expect(lines.map((t) => t.trimEnd())).toEqual(
      ['(최 우 수)', '(우   수)', '(우   수)', '(장   려)', '(장   려)', '(장   려)'].map((l, i) => `${l} ${top6[i].replace(/&/g, '&amp;')}`))
    expect(plain(cell(1, 2))).toBe(' 2026. 10. 19.(월) 14:00 ~ 16:00')
    expect(plain(cell(3, 2))).toBe(' 6명 참석')
    expect(plain(cell(2, 2))).toBe(' 제2소회의실(7층)') // 손대지 않음
    expect(plain(cell(8, 3))).toBe('왕한호')
    expect([9, 10, 11, 12, 13].map((r) => plain(cell(r, 3)))).toEqual(['박재현', '윤종환', '최진근', '박정열', '이우제'])
    expect(scanCells(out.section)).toHaveLength(scanCells(section).length)
  })

  const originals = ['(최 우 수)', '(우   수)', '(우   수)', '(장   려)', '(장   려)', '(장   려)'].map((l, i) => l + ' '.repeat(i < 3 ? 46 : 47))
  const titles = (nos: number[]) => nos.map((no) => createInitialData('test').proposals.find((p) => p.no === no)!.title)

  it('모두 짧으면 양식 그대로(15pt, 한 줄씩) + 밑줄 끝까지 공백 채움', () => {
    const l = planLines(originals, ['쓰담쓰담 천안', 'A', 'B', 'C', 'D', 'E'])
    expect(l.original).toBe(true)
    l.texts.forEach((t, i) => {
      expect(textWidthEm(t)).toBeLessThanOrEqual(textWidthEm(originals[i]))
      expect(t.endsWith('  ')).toBe(true)
    })
  })

  it('긴 제안명이 있으면 6줄 모두 같은 크기로 줄이고, 높이는 원래 6줄 안', () => {
    for (const nos of [[4, 7, 10, 2, 13, 5], [5, 14, 10, 11, 13, 4]]) {
      const l = planLines(originals, titles(nos))
      expect(l.original).toBe(false)
      expect(l.size).toBeLessThan(1500)
      const height = l.lines.reduce((a, n) => a + n * l.size * 1.2, 0) + l.gap * 6
      expect(height).toBeLessThanOrEqual(Math.round(1500 * 2.11) * 6)
      expect(l.gap).toBeGreaterThanOrEqual(300)
    }
  })

  it('zip: mimetype이 맨 앞·무압축, 파일 목록 유지, 추가 모양 개수 반영', () => {
    const bytes = buildUigyeolHwpx(template, buildFill(d, res))
    expect(bytes[8]).toBe(0)
    expect(strFromU8(bytes.slice(30, 38))).toBe('mimetype')
    const out = unzipSync(bytes)
    expect(Object.keys(out).sort()).toEqual(Object.keys(files).sort())
    const h = strFromU8(out['Contents/header.xml'])
    const n = Number(/<hh:charProperties itemCnt="(\d+)">/.exec(h)![1])
    expect(n).toBe([...h.matchAll(/<hh:charPr id=/g)].length)
    if (process.env.HWPX_OUT) writeFileSync(process.env.HWPX_OUT, bytes)
  })

  it('최악의 경우(가장 긴 제안명 6개)도 생성', () => {
    const base = createInitialData('test')
    const longest = [...base.proposals].sort((a, b) => b.title.length - a.title.length).slice(0, 6).map((p) => p.title)
    const bytes = buildUigyeolHwpx(template, { ...buildFill({ ...base, chairJudgeId: 'j1' }, computeResults(base)), winners: longest })
    if (process.env.HWPX_WORST) writeFileSync(process.env.HWPX_WORST, bytes)
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
