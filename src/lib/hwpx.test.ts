import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { buildFill, buildUigyeolHwpx, fillSection, scanCells, uigyeolBlockers } from './hwpx'
import { computeResults } from './calc'
import { createInitialData } from './initialData'
import { fillTestScores } from './testData'

const template = new Uint8Array(readFileSync(new URL('../assets/uigyeolseo-template.hwpx', import.meta.url)))
const section = strFromU8(unzipSync(template)['Contents/section0.xml'])
const text = (xml: string) => [...xml.matchAll(/<hp:t>(.*?)<\/hp:t>/gs)].map((m) => m[1].replace(/<hp:fwSpace\/>/g, ' ')).join('|')

describe('심사의결서 HWPX', () => {
  it('양식의 표 구조를 찾는다(바깥 14×6, 안쪽 7×5)', () => {
    const cells = scanCells(section)
    expect(cells.filter((c) => c.table === 0)).toHaveLength(1 + 5 * 2 + 1 + 5 + 6 * 4) // 병합 칸 반영 = 41
    expect(cells.filter((c) => c.table === 1)).toHaveLength(35)
  })

  const d = fillTestScores(createInitialData('test'))
  const tie = computeResults(d).unresolvedTies[0]
  d.tieDecisions[tie.key] = { order: tie.nos, reason: '위원회 협의', at: '' }
  d.chairJudgeId = 'j3'
  const res = computeResults(d)

  it('입력 완료·동점 결정 전에는 사유를 알려 준다', () => {
    expect(uigyeolBlockers(computeResults(createInitialData('test')))).toHaveLength(1)
    expect(uigyeolBlockers(res)).toHaveLength(0)
  })

  it('1~6위·평균·위원 성명이 정확한 칸에 들어간다', () => {
    const fill = buildFill(d, res)
    const out = fillSection(section, fill)
    const cells = scanCells(out)
    const cellText = (t: number, r: number, c: number) => {
      const x = cells.find((k) => k.table === t && k.row === r && k.col === c)!
      return text(out.slice(x.start, x.end))
    }
    const top6 = res.rows.filter((r) => r.position! <= 6)
    top6.forEach((r, i) => {
      expect(cellText(1, i + 1, 2)).toBe(d.proposals.find((p) => p.no === r.no)!.title.replace(/&/g, '&amp;'))
      expect(cellText(1, i + 1, 3)).toBe(r.agg.avg!.toFixed(2))
    })
    expect(cellText(1, 1, 1)).toBe('최우수') // 구분 칸은 그대로
    expect(cellText(0, 8, 3)).toBe('왕한호') // 위원장
    expect([9, 10, 11, 12, 13].map((r) => cellText(0, r, 3))).toEqual(['박재현', '윤종환', '최진근', '박정열', '이우제'])
    expect(cellText(0, 1, 2)).toBe(' 2026. 10. 19.(월) 14:00 ~ 16:00')
    expect(cellText(0, 3, 2)).toBe(' 6 명 참석')
    expect(cellText(0, 2, 2)).toBe(' 제2소회의실(7층)') // 손대지 않음
    // 바뀐 칸 외에는 원본과 같은 길이의 구조 유지(표·칸 수 동일)
    expect(scanCells(out)).toHaveLength(scanCells(section).length)
  })

  it('zip: mimetype이 맨 앞·무압축, 나머지 파일 유지', () => {
    const bytes = buildUigyeolHwpx(template, buildFill(d, res))
    // 로컬 파일 헤더: 오프셋 8 = 압축방식(0), 30 = 파일명
    expect(bytes[8]).toBe(0)
    expect(strFromU8(bytes.slice(30, 38))).toBe('mimetype')
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(Object.keys(unzipSync(template)).sort())
    if (process.env.HWPX_OUT) writeFileSync(process.env.HWPX_OUT, bytes)
  })
})

describe('제안명 칸 전용 모양', () => {
  it('header에 글자·문단 모양을 1개씩 추가하고 개수를 갱신', async () => {
    const { addCompactStyles } = await import('./hwpx')
    const header = strFromU8(unzipSync(template)['Contents/header.xml'])
    const { header: h, styles } = addCompactStyles(header)
    expect(styles).toEqual([{ charPr: '30', paraPr: '32' }, { charPr: '31', paraPr: '32' }, { charPr: '32', paraPr: '32' }])
    expect(h).toContain('<hh:charProperties itemCnt="33">')
    expect(h).toContain('<hh:paraProperties itemCnt="33">')
    expect(h).toMatch(/<hh:charPr id="30" height="1000"/)
    expect(h).toMatch(/<hh:charPr id="32" height="800"/)
  })
})

it('최악의 경우(가장 긴 제안명 6개)도 파일 생성', () => {
  const d = createInitialData('test')
  const longest = [...d.proposals].sort((a, b) => b.title.length - a.title.length).slice(0, 6)
  const fill = {
    ...buildFill({ ...d, chairJudgeId: 'j1' }, computeResults(d)),
    winners: longest.map((p, i) => [p.title, '99.99', i === 5 ? '동점(위원회 결정)' : i === 4 ? '동점(실시가능성)' : ''] as [string, string, string]),
  }
  const bytes = buildUigyeolHwpx(template, fill)
  if (process.env.HWPX_WORST) writeFileSync(process.env.HWPX_WORST, bytes)
  expect(bytes.length).toBeGreaterThan(1000)
})

it('글자 크기: 보통 제안명은 10pt, 아주 긴 제안명은 더 작게', async () => {
  const { pickSizeIndex } = await import('./hwpx')
  const d = createInitialData('test')
  const w = 25730 - 1020
  expect(pickSizeIndex(d.proposals.find((p) => p.no === 7)!.title, w)).toBe(0)
  expect(pickSizeIndex(d.proposals.find((p) => p.no === 5)!.title, w)).toBeGreaterThan(0)
})
