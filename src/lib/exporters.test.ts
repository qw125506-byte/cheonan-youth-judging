import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook } from './exporters'
import { computeResults } from './calc'
import { createInitialData } from './initialData'
import { fillTestScores } from './testData'

describe('엑셀 내보내기', () => {
  const d = fillTestScores(createInitialData('test'))
  const wb = XLSX.read(XLSX.write(buildWorkbook(d), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const res = computeResults(d)

  it('시트 6개', () => expect(wb.SheetNames).toEqual(['위원별 원본', '종합집계표', '최종순위', '수상자', '계산검증', '수정이력']))

  it('종합집계표 평균·수식이 웹 계산과 일치', () => {
    const ws = wb.Sheets['종합집계표']
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    for (let i = 2; i < 2 + d.proposals.length; i++) {
      const r = rows[i] as (number | string)[]
      const no = r[0] as number
      const agg = res.aggs.get(no)!
      expect(r.slice(2, 8)).toEqual(agg.scores)
      expect(r[11]).toBeCloseTo(agg.avg!, 10)
      const f = ws[XLSX.utils.encode_cell({ r: i, c: 15 })].f as string
      expect(f).toBe(`(SUM(C${i + 1}:H${i + 1})-MAX(C${i + 1}:H${i + 1})-MIN(C${i + 1}:H${i + 1}))/4`)
      // 수식을 직접 계산해서도 같은 값인지
      const s = agg.scores as number[]
      expect((s.reduce((a, b) => a + b, 0) - Math.max(...s) - Math.min(...s)) / 4).toBeCloseTo(agg.avg!, 10)
    }
  })

  it('위원별 원본 84행', () => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['위원별 원본'], { header: 1 })
    expect(rows.length).toBe(2 + 84)
  })

  it('연습 데이터 표기', () => {
    expect(String(wb.Sheets['종합집계표'].A1.v)).toContain('연습')
  })
})
