import { describe, expect, it } from 'vitest'
import { aggregateScores, computeResults, evalKey, fmt2, parseScore, summarizeEvaluation, verifyResults } from './calc'
import { createInitialData, CRITERIA } from './initialData'
import { setItemScore, setTotalScore, validateBackup, LockedError } from './store'
import { fillTestScores } from './testData'
import type { AppData } from './types'

/** 위원별 총점만으로 데이터 구성(총점 직접입력) */
function withTotals(rows: Record<number, (number | null)[]>): AppData {
  let d = createInitialData('test')
  for (const [no, scores] of Object.entries(rows))
    scores.forEach((s, i) => { if (s !== null) d = setTotalScore(d, d.judges[i].id, Number(no), s) })
  return d
}

describe('최고·최저 1개씩 제외 평균', () => {
  it('보고서 예시: 82,90,85,76,88,92 → 86.25', () => {
    const a = aggregateScores([82, 90, 85, 76, 88, 92])
    expect(a.maxIndex).toBe(5)
    expect(a.minIndex).toBe(3)
    expect(a.trimmedSum).toBe(345)
    expect(a.avg).toBe(86.25)
  })

  it('위원 1명 미입력이면 집계하지 않는다(0점 처리 금지)', () => {
    const a = aggregateScores([82, 90, null, 76, 88, 92])
    expect(a.complete).toBe(false)
    expect(a.avg).toBeNull()
    expect(a.enteredCount).toBe(5)
  })

  it('6명 모두 같은 점수: 서로 다른 두 위원만 제외, 평균은 그 점수', () => {
    const a = aggregateScores([80, 80, 80, 80, 80, 80])
    expect(a.maxIndex).not.toBe(a.minIndex)
    expect(a.avg).toBe(80)
  })

  it('최고점이 2명 이상 동일해도 1개만 제외', () => {
    const a = aggregateScores([95, 95, 80, 85, 70, 90])
    expect(a.trimmedSum).toBe(95 + 80 + 85 + 90)
    expect(a.avg).toBe(87.5)
  })

  it('최저점이 2명 이상 동일해도 1개만 제외', () => {
    const a = aggregateScores([60, 90, 60, 85, 80, 70])
    expect(a.trimmedSum).toBe(60 + 85 + 80 + 70)
    expect(a.avg).toBe(73.75)
  })

  it('소수점 점수도 오차 없이 계산', () => {
    const a = aggregateScores([80.1, 80.2, 80.3, 80.4, 80.5, 80.6])
    expect(a.trimmedSum).toBe(321.4)
    expect(fmt2(a.avg)).toBe('80.35')
  })
})

describe('입력값 검증', () => {
  it('빈칸은 미입력(null)', () => expect(parseScore('  ', 10, false)).toEqual({ ok: true, value: null }))
  it('배점 초과 거부', () => expect(parseScore('11', 10, false).ok).toBe(false))
  it('배점과 같은 점수 허용', () => expect(parseScore('15', 15, false)).toEqual({ ok: true, value: 15 }))
  it('음수 거부', () => expect(parseScore('-1', 10, false).ok).toBe(false))
  it('문자 거부', () => {
    expect(parseScore('a', 10, false).ok).toBe(false)
    expect(parseScore('8점', 10, false).ok).toBe(false)
    expect(parseScore('1e1', 10, false).ok).toBe(false)
  })
  it('소수점: 설정에 따라', () => {
    expect(parseScore('7.5', 10, false).ok).toBe(false)
    expect(parseScore('7.5', 10, true)).toEqual({ ok: true, value: 7.5 })
    expect(parseScore('7.25', 10, true).ok).toBe(false)
  })
  it('저장 계층도 배점 초과 백업을 거부', () => {
    const d = createInitialData('test')
    d.evaluations['j1:1'] = { mode: 'detail', items: { c1: 11 }, total: null, updatedAt: '' }
    expect(validateBackup(d)).toMatch(/범위/)
  })
})

describe('세부점수 합계', () => {
  it('10개 항목 모두 입력해야 총점이 생긴다', () => {
    let d = createInitialData('test')
    for (const c of CRITERIA.slice(0, 9)) d = setItemScore(d, 'j1', 1, c.id, c.max)
    expect(summarizeEvaluation(d.evaluations['j1:1'], d.criteria).total).toBeNull()
    d = setItemScore(d, 'j1', 1, 'c10', 15)
    const s = summarizeEvaluation(d.evaluations['j1:1'], d.criteria)
    expect(s.total).toBe(100)
    expect(s.subtotals['실시가능성']).toBe(25)
  })
  it('세부입력이 있는 평가에 총점 직접입력 불가', () => {
    let d = createInitialData('test')
    d = setItemScore(d, 'j1', 1, 'c1', 5)
    expect(() => setTotalScore(d, 'j1', 1, 80)).toThrow()
  })
  it('총점입력 평가는 세부점수가 작성된 것으로 표시되지 않는다', () => {
    const d = setTotalScore(createInitialData('test'), 'j1', 1, 80)
    const s = summarizeEvaluation(d.evaluations['j1:1'], d.criteria)
    expect(s.mode).toBe('total')
    expect(s.enteredItems).toBe(0)
    expect(Object.values(s.subtotals).every((v) => v === null)).toBe(true)
  })
})

describe('순위·동점', () => {
  it('순위는 반올림 전 정확값(제외 후 합계 정수 단위)으로 비교', () => {
    // 80.125 vs 80.1 — 반올림 표시값이 아니라 원값으로 순위 판정
    const d = withTotals({
      1: [80, 80, 80, 80.5, 0, 100], // 제외 후 320.5 → 80.125
      2: [80, 80, 80, 80.4, 0, 100], // 320.4 → 80.1
    })
    d.settings.allowDecimal = true
    const r = computeResults(d)
    const one = r.rows.find((x) => x.no === 1)!
    const two = r.rows.find((x) => x.no === 2)!
    expect(one.rank).toBe(1)
    expect(two.rank).toBe(2)
  })

  it('최종점수가 같으면 공동순위', () => {
    const d = withTotals({ 1: [90, 90, 90, 90, 90, 90], 2: [90, 90, 90, 90, 90, 90], 3: [80, 80, 80, 80, 80, 80] })
    const r = computeResults(d)
    expect(r.rows.find((x) => x.no === 1)!.rank).toBe(1)
    expect(r.rows.find((x) => x.no === 2)!.rank).toBe(1)
    expect(r.rows.find((x) => x.no === 3)!.rank).toBe(3)
  })

  it('1·2위 동점(최우수/우수 경계)은 위원회 결정 전까지 수상 미확정', () => {
    const d = withTotals({ 1: [90, 90, 90, 90, 90, 90], 2: [90, 90, 90, 90, 90, 90] })
    const r = computeResults(d)
    expect(r.unresolvedTies).toHaveLength(1)
    expect(r.rows.find((x) => x.no === 1)!.award).toBe('동점 확인 필요')
  })

  it('2·3위 동점(같은 우수 등급 안)은 결정 없이 둘 다 우수', () => {
    const d = withTotals({ 1: Array(6).fill(95), 2: Array(6).fill(90), 3: Array(6).fill(90) })
    const r = computeResults(d)
    expect(r.unresolvedTies).toHaveLength(0)
    expect(r.rows.find((x) => x.no === 2)!.award).toBe('우수')
    expect(r.rows.find((x) => x.no === 3)!.award).toBe('우수')
  })

  it('6·7위 동점이면 확인 필요 → 위원회 결정 후 장려/미선정 확정', () => {
    const rows: Record<number, number[]> = {}
    const scores = [99, 98, 97, 96, 95, 90, 90, 80]
    scores.forEach((s, i) => { rows[i + 1] = Array(6).fill(s) })
    const d = withTotals(rows)
    let r = computeResults(d)
    expect(r.unresolvedTies).toHaveLength(1)
    expect(r.unresolvedTies[0].nos).toEqual([6, 7])
    const key = r.unresolvedTies[0].key
    d.tieDecisions[key] = { order: [7, 6], reason: '위원회 협의', at: '' }
    r = computeResults(d)
    expect(r.unresolvedTies).toHaveLength(0)
    expect(r.rows.find((x) => x.no === 7)!.award).toBe('장려')
    expect(r.rows.find((x) => x.no === 6)!.award).toBe('미선정')
  })

  it('점수가 바뀌면 이전 동점 결정은 자동으로 무효', () => {
    const d = withTotals({ 1: Array(6).fill(90), 2: Array(6).fill(90) })
    const key = computeResults(d).unresolvedTies[0].key
    d.tieDecisions[key] = { order: [2, 1], reason: 'x', at: '' }
    // 한 명만 91로 올리면 그 점수가 최고점으로 제외되어 평균이 그대로이므로 두 명을 올린다
    expect(computeResults(setTotalScore(d, 'j1', 1, 91)).unresolvedTies).toHaveLength(0) // 결정은 유효
    const d2 = setTotalScore(setTotalScore(d, 'j1', 1, 91), 'j2', 1, 91)
    const r = computeResults(d2)
    expect(r.rows.find((x) => x.no === 1)!.position).toBe(1)
    expect(r.rows.find((x) => x.no === 1)!.decided).toBe(false)
  })

  it('점수 수정이 순위에 즉시 반영', () => {
    let d = withTotals({ 1: Array(6).fill(80), 2: Array(6).fill(85) })
    expect(computeResults(d).rows[0].no).toBe(2)
    for (const j of d.judges) d = setTotalScore(d, j.id, 1, 90)
    expect(computeResults(d).rows[0].no).toBe(1)
  })
})

describe('입력 즉시 저장', () => {
  it('한 칸에 이어서 누른 숫자(1→10)는 이력 1건으로 묶인다', () => {
    let x = setItemScore(createInitialData('test'), 'j1', 1, 'c1', 1)
    x = setItemScore(x, 'j1', 1, 'c1', 10)
    expect(x.audit).toHaveLength(1)
    expect([x.audit[0].before, x.audit[0].after]).toEqual([null, 10])
    expect(x.evaluations['j1:1'].items.c1).toBe(10)
  })
  it('다른 칸을 입력한 뒤 돌아와 고치면 별도 이력', () => {
    let x = setItemScore(createInitialData('test'), 'j1', 1, 'c1', 5)
    x = setItemScore(x, 'j1', 1, 'c2', 6)
    x = setItemScore(x, 'j1', 1, 'c1', 7)
    expect(x.audit).toHaveLength(3)
    expect([x.audit[2].before, x.audit[2].after]).toEqual([5, 7])
  })
  it('지웠다가 원래 값으로 다시 쓰면 이력이 남지 않는다', () => {
    let x = setItemScore(createInitialData('test'), 'j1', 1, 'c1', 5)
    x.audit[0].at = new Date(Date.now() - 60_000).toISOString()
    x = setItemScore(x, 'j1', 1, 'c1', null)
    x = setItemScore(x, 'j1', 1, 'c1', 5)
    expect(x.audit).toHaveLength(1)
  })
})

describe('전체 시나리오(연습 데이터 84건)', () => {
  const d = fillTestScores(createInitialData('test'))
  const r = computeResults(d)

  it('84건 모두 집계 완료', () => expect(r.allComplete).toBe(true))
  it('독립 재계산 검증이 모두 통과', () => expect(verifyResults(d, r).every((v) => v.ok)).toBe(true))
  it('생성기가 6·7위 동점을 만든다', () => {
    expect(r.unresolvedTies.some((g) => g.start <= 6 && g.end >= 7)).toBe(true)
  })
  it('실제 모드에서는 테스트 점수 생성 불가', () => {
    expect(() => fillTestScores(createInitialData('real'))).toThrow()
  })
  it('실제 초기 데이터는 모두 미입력', () => {
    const real = createInitialData('real')
    expect(Object.keys(real.evaluations)).toHaveLength(0)
    expect(real.proposals).toHaveLength(14)
    expect(real.judges).toHaveLength(6)
    expect(real.criteria.reduce((a, c) => a + c.max, 0)).toBe(100)
  })
  it('확정 후 점수 수정 차단', () => {
    const locked = { ...d, finalized: { at: '', by: '', rows: [] } }
    expect(() => setItemScore(locked, 'j1', 1, 'c1', 1)).toThrow(LockedError)
  })
  it('수정 이력에 변경 전후 값이 남는다', () => {
    let x = setItemScore(createInitialData('test'), 'j1', 1, 'c1', 5)
    x.audit[0].at = new Date(Date.now() - 60_000).toISOString() // 1분 전에 입력한 것으로
    x = setItemScore(x, 'j1', 1, 'c1', 7)
    const last = x.audit[x.audit.length - 1]
    expect([last.before, last.after]).toEqual([5, 7])
    expect(x.evaluations[evalKey('j1', 1)].items.c1).toBe(7)
  })
})

describe('점수 초기화', () => {
  it('한 위원 점수만 지우고 나머지·위원 정보는 유지', async () => {
    const { clearScores } = await import('./store')
    const d = fillTestScores(createInitialData('test'))
    const x = clearScores(d, 'j3')
    expect(Object.keys(x.evaluations).filter((k) => k.startsWith('j3:'))).toHaveLength(0)
    expect(Object.keys(x.evaluations)).toHaveLength(70)
    expect(x.judges).toEqual(d.judges)
    expect(x.audit[x.audit.length - 1].note).toMatch(/점수 초기화/)
  })
  it('전체 점수 초기화', async () => {
    const { clearScores } = await import('./store')
    const x = clearScores(fillTestScores(createInitialData('test')))
    expect(Object.keys(x.evaluations)).toHaveLength(0)
    expect(computeResults(x).completeCount).toBe(0)
  })
  it('확정 후에는 초기화 불가', async () => {
    const { clearScores } = await import('./store')
    const d = { ...fillTestScores(createInitialData('test')), finalized: { at: '', by: '', rows: [] } }
    expect(() => clearScores(d)).toThrow(LockedError)
  })
})

describe('동점 처리 기준: 1차 실시가능성 합계, 2차 효율성(경제성) 합계', () => {
  /** 6명 모두 같은 세부점수(c1~c10 순)로 입력 */
  function withItems(rows: Record<number, number[]>) {
    let d = createInitialData('test')
    for (const [no, items] of Object.entries(rows))
      for (const j of d.judges)
        items.forEach((v, k) => { d = setItemScore(d, j.id, Number(no), `c${k + 1}`, v) })
    return d
  }
  //                실시(10,10,5) 효율(10,10) 창의(15,10) 계속(10,5) 적용(15)
  const A = [10, 10, 5, 5, 5, 15, 10, 10, 5, 15] // 90, 실시 25, 효율 10
  const B = [10, 10, 4, 5, 6, 15, 10, 10, 5, 15] // 90, 실시 24, 효율 11
  const C = [10, 10, 5, 6, 5, 15, 9, 10, 5, 15] //  90, 실시 25, 효율 11

  it('평균이 같으면 실시가능성 합계가 높은 제안이 앞선다(공동순위 아님)', () => {
    const r = computeResults(withItems({ 1: B, 2: A }))
    const a = r.rows.find((x) => x.no === 2)!
    const b = r.rows.find((x) => x.no === 1)!
    expect(a.agg.avg).toBe(b.agg.avg)
    expect([a.rank, b.rank]).toEqual([1, 2])
    expect(a.tieSize).toBe(1)
    expect(a.tieBreak).toEqual([150, 60]) // 실시 25×6, 효율 10×6
    expect(a.brokenBy).toBe('실시가능성 합계')
    expect([a.award, b.award]).toEqual(['최우수', '우수'])
    expect(r.unresolvedTies).toHaveLength(0)
  })

  it('실시가능성 합계도 같으면 효율성(경제성) 합계로 가른다', () => {
    const r = computeResults(withItems({ 1: A, 2: C }))
    expect(r.rows.find((x) => x.no === 2)!.rank).toBe(1)
    expect(r.rows.find((x) => x.no === 1)!.rank).toBe(2)
    expect(r.rows.find((x) => x.no === 2)!.brokenBy).toMatch(/효율성/)
    expect(r.unresolvedTies).toHaveLength(0)
  })

  it('3건 동점: 실시가능성으로 1건 가르고 남은 2건은 효율성으로', () => {
    const r = computeResults(withItems({ 1: A, 2: B, 3: C }))
    expect(r.rows.slice(0, 3).map((x) => x.no)).toEqual([3, 1, 2]) // C(25,11) > A(25,10) > B(24,11)
    expect(r.rows.slice(0, 3).map((x) => x.rank)).toEqual([1, 2, 3])
  })

  it('두 기준까지 모두 같으면 공동순위, 수상 경계면 위원회 결정 필요', () => {
    const r = computeResults(withItems({ 1: A, 2: [...A] }))
    expect(r.rows[0].rank).toBe(1)
    expect(r.rows[1].rank).toBe(1)
    expect(r.unresolvedTies).toHaveLength(1)
  })

  it('세부점수가 없는 평가(총점 직접입력)가 섞이면 기준 적용 불가 → 위원회 결정', () => {
    let d = withItems({ 1: A, 2: B })
    d = clearAndTotal(d)
    const r = computeResults(d)
    expect(r.rows[0].tieBreak === null || r.rows[1].tieBreak === null).toBe(true)
    expect(r.unresolvedTies).toHaveLength(1)
  })
})

/** 제안 2번 위원1 평가를 같은 총점(90)의 총점 직접입력으로 바꾼다 */
function clearAndTotal(d: AppData): AppData {
  const ev = { ...d.evaluations }
  delete ev['j1:2']
  return setTotalScore({ ...d, evaluations: ev }, 'j1', 2, 90)
}

describe('저장 데이터 호환(새로고침 시 초기화 방지)', () => {
  it('여러 작업을 거친 데이터도 다시 불러올 때 검사를 통과한다', async () => {
    const { clearScores } = await import('./store')
    let d = fillTestScores(createInitialData('test'))
    d = setItemScore(d, 'j1', 1, 'c1', null)
    d = clearScores(d, 'j2')
    d = setTotalScore(d, 'j2', 3, 77)
    d.settings.allowDecimal = true
    d = setItemScore(d, 'j2', 4, 'c1', 7.5)
    const key = computeResults(d).tieGroups[0]?.key
    if (key) d.tieDecisions[key] = { order: [], reason: 'x', at: '' }
    d.finalized = { at: '', by: 'x', rows: [] }
    const roundTrip = JSON.parse(JSON.stringify(d))
    expect(validateBackup(roundTrip)).toBeNull()
  })
})
