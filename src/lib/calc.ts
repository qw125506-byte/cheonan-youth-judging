import type { AppData, Criterion, Evaluation, TieDecision } from './types'
import { AWARD_TIERS } from './initialData'

/**
 * 모든 점수 계산은 0.01점 단위 정수로 한다(부동소수 오차 방지).
 * 입력은 정수 또는 소수 첫째 자리까지만 허용하므로 정수 환산이 항상 정확하다.
 */
export const SCALE = 100
export const toUnits = (n: number) => Math.round(n * SCALE)
export const fromUnits = (u: number) => u / SCALE

export const evalKey = (judgeId: string, proposalNo: number) => `${judgeId}:${proposalNo}`

// ───────────────────────── 입력값 검증 ─────────────────────────

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string }

/** 입력 문자열을 점수로 변환. 빈칸은 null(미입력)이며 0점이 아니다. */
export function parseScore(text: string, max: number, allowDecimal: boolean): ParseResult {
  const t = text.trim()
  if (t === '') return { ok: true, value: null }
  if (/^-/.test(t)) return { ok: false, error: '음수는 입력할 수 없습니다' }
  const intOnly = /^\d+$/
  const oneDecimal = /^\d+(\.\d)?$/
  if (!oneDecimal.test(t) && !/^\d+\.\d+$/.test(t)) return { ok: false, error: '숫자만 입력할 수 있습니다' }
  if (!allowDecimal && !intOnly.test(t)) return { ok: false, error: '정수만 입력할 수 있습니다(소수점 허용은 설정에서 변경)' }
  if (allowDecimal && !oneDecimal.test(t)) return { ok: false, error: '소수 첫째 자리까지만 입력할 수 있습니다' }
  const value = Number(t)
  if (!Number.isFinite(value)) return { ok: false, error: '숫자만 입력할 수 있습니다' }
  if (value > max) return { ok: false, error: `배점(${max}점)을 초과할 수 없습니다` }
  return { ok: true, value }
}

// ───────────────────────── 평가표 1건 합계 ─────────────────────────

export interface EvalSummary {
  mode: Evaluation['mode'] | null
  /** 총점. 미완성이면 null */
  total: number | null
  complete: boolean
  /** 입력된 세부항목 수(총점입력 모드에서는 0) */
  enteredItems: number
  /** 심사항목별 소계. 해당 항목 세부점수가 모두 입력돼야 값이 있다 */
  subtotals: Record<string, number | null>
}

export function categoriesOf(criteria: Criterion[]): string[] {
  return [...new Set(criteria.map((c) => c.category))]
}

export function summarizeEvaluation(ev: Evaluation | undefined, criteria: Criterion[]): EvalSummary {
  const cats = categoriesOf(criteria)
  const emptySubs = Object.fromEntries(cats.map((c) => [c, null])) as Record<string, number | null>
  if (!ev) return { mode: null, total: null, complete: false, enteredItems: 0, subtotals: emptySubs }
  if (ev.mode === 'total') {
    return { mode: 'total', total: ev.total, complete: ev.total !== null, enteredItems: 0, subtotals: emptySubs }
  }
  let entered = 0
  let sumUnits = 0
  const subs: Record<string, number | null> = {}
  for (const cat of cats) {
    const items = criteria.filter((c) => c.category === cat)
    let catUnits = 0
    let catComplete = true
    for (const c of items) {
      const v = ev.items[c.id]
      if (v === null || v === undefined) {
        catComplete = false
      } else {
        entered++
        catUnits += toUnits(v)
        sumUnits += toUnits(v)
      }
    }
    subs[cat] = catComplete ? fromUnits(catUnits) : null
  }
  const complete = entered === criteria.length
  return { mode: 'detail', total: complete ? fromUnits(sumUnits) : null, complete, enteredItems: entered, subtotals: subs }
}

// ───────────────────────── 제안별 최고·최저 제외 평균 ─────────────────────────

export interface ProposalAgg {
  /** 위원 순서대로의 총점(미입력 null) */
  scores: (number | null)[]
  enteredCount: number
  complete: boolean
  /** 제외된 최고점 위치(위원 인덱스). 미완성이면 null */
  maxIndex: number | null
  /** 제외된 최저점 위치(위원 인덱스). 미완성이면 null */
  minIndex: number | null
  max: number | null
  min: number | null
  sumAll: number | null
  /** 최고·최저 제외 합계 */
  trimmedSum: number | null
  /** 최종 평균(반올림 전 원값) */
  avg: number | null
  /** 순위 비교용 정확값: 최고·최저 제외 합계(0.01점 단위 정수) */
  trimmedUnits: number | null
}

/**
 * 위원 점수 배열에서 최고점 1개와 최저점 1개만 제외한 평균을 구한다.
 * 동일 최고점이 여럿이어도 1개(앞 위원)만, 동일 최저점이 여럿이어도 1개(뒤 위원)만 제외한다.
 * 모두 같은 점수면 서로 다른 두 위원의 점수가 제외된다.
 * 한 명이라도 미입력이면 집계하지 않는다(미입력을 0점으로 보지 않음).
 */
export function aggregateScores(scores: (number | null)[]): ProposalAgg {
  const enteredCount = scores.filter((s) => s !== null).length
  const base: ProposalAgg = {
    scores, enteredCount, complete: false,
    maxIndex: null, minIndex: null, max: null, min: null,
    sumAll: null, trimmedSum: null, avg: null, trimmedUnits: null,
  }
  if (scores.length < 3 || enteredCount !== scores.length) return base
  const units = scores.map((s) => toUnits(s as number))
  let maxIndex = 0
  let minIndex = units.length - 1
  for (let i = 0; i < units.length; i++) if (units[i] > units[maxIndex]) maxIndex = i
  for (let i = units.length - 1; i >= 0; i--) if (units[i] < units[minIndex]) minIndex = i
  const sumUnits = units.reduce((a, b) => a + b, 0)
  const trimmedUnits = sumUnits - units[maxIndex] - units[minIndex]
  const divisor = units.length - 2
  return {
    ...base,
    complete: true,
    maxIndex, minIndex,
    max: fromUnits(units[maxIndex]),
    min: fromUnits(units[minIndex]),
    sumAll: fromUnits(sumUnits),
    trimmedSum: fromUnits(trimmedUnits),
    avg: trimmedUnits / divisor / SCALE,
    trimmedUnits,
  }
}

/** 표시용: 소수점 둘째 자리 반올림 */
export function fmt2(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  // 0.005 경계에서 부동소수 오차로 내림되지 않도록 정수 연산으로 반올림
  const r = Math.round(n * 100 + 1e-9) / 100
  return r.toFixed(2)
}

export function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ───────────────────────── 순위·수상 ─────────────────────────

export const TIER_BOUNDARIES = (() => {
  const out: number[] = []
  let acc = 0
  for (const t of AWARD_TIERS) { acc += t.count; out.push(acc) }
  return out
})() // [1, 3, 6]
export const AWARD_COUNT = TIER_BOUNDARIES[TIER_BOUNDARIES.length - 1]

export function awardForPosition(pos: number): string {
  let acc = 0
  for (const t of AWARD_TIERS) {
    acc += t.count
    if (pos <= acc) return t.name
  }
  return '미선정'
}

export function tieKey(trimmedUnits: number, nos: number[]): string {
  return `${trimmedUnits}|${[...nos].sort((a, b) => a - b).join(',')}`
}

/**
 * 최종 평균 동점 시 순위 결정 기준(순서대로 적용).
 * 각 심사항목에 대해 위원 6명의 소계를 모두 더한 값이 높은 제안이 앞선다.
 */
export const TIEBREAK_CATEGORIES = ['실시가능성', '효율성(경제성)'] as const

export interface RankRow {
  no: number
  title: string
  agg: ProposalAgg
  /** 순위(동점 기준 적용 후, 그래도 같으면 공동순위 1,2,2,4…). 미완성이면 null */
  rank: number | null
  /** 위원회 결정까지 반영한 정렬 위치(1부터). 미완성이면 null */
  position: number | null
  /** 동점 기준을 적용하고도 같은 제안 수(공동순위 크기) */
  tieSize: number
  /** 최종 평균이 같은 제안 수 */
  avgTieSize: number
  /** 동점 기준 항목별 6명 합계(TIEBREAK_CATEGORIES 순). 세부점수가 없는 평가가 있으면 null */
  tieBreak: number[] | null
  /** 평균 동점을 가른 기준 설명(예: '실시가능성 합계'). 해당 없으면 null */
  brokenBy: string | null
  /** 수상 등급 경계에 걸친 동점으로 위원회 결정이 필요한데 아직 없음 */
  needsDecision: boolean
  /** 위원회 동점 결정이 적용됨 */
  decided: boolean
  tieKey: string | null
  award: string
}

export interface TieGroup {
  key: string
  trimmedUnits: number
  avg: number
  nos: number[]
  /** 정렬상 차지하는 위치 범위 */
  start: number
  end: number
  crossesBoundary: boolean
  decision: TieDecision | null
  /** 동점 기준 값(같은 값이라 가려지지 않음). 세부점수 없는 평가가 있으면 null */
  tieBreak: number[] | null
}

export interface Results {
  aggs: Map<number, ProposalAgg>
  rows: RankRow[]
  tieGroups: TieGroup[]
  completeCount: number
  allComplete: boolean
  unresolvedTies: TieGroup[]
}

export function proposalScores(data: AppData, no: number): (number | null)[] {
  return data.judges.map((j) => summarizeEvaluation(data.evaluations[evalKey(j.id, no)], data.criteria).total)
}

/** 동점 기준 항목별 위원 전체 소계 합(0.01점 단위 정수). 한 명이라도 해당 소계가 없으면(총점 직접입력 등) null */
export function tieBreakUnits(data: AppData, no: number): number[] | null {
  const out: number[] = []
  for (const cat of TIEBREAK_CATEGORIES) {
    let sum = 0
    for (const j of data.judges) {
      const v = summarizeEvaluation(data.evaluations[evalKey(j.id, no)], data.criteria).subtotals[cat]
      if (v === null || v === undefined) return null
      sum += toUnits(v)
    }
    out.push(sum)
  }
  return out
}

const cmpTb = (a: number[], b: number[]) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return b[k] - a[k]
  return 0
}

export function computeResults(data: AppData): Results {
  const aggs = new Map<number, ProposalAgg>()
  for (const p of data.proposals) aggs.set(p.no, aggregateScores(proposalScores(data, p.no)))

  const complete = data.proposals.filter((p) => aggs.get(p.no)!.complete)
  const incomplete = data.proposals.filter((p) => !aggs.get(p.no)!.complete)
  const tbs = new Map(complete.map((p) => [p.no, tieBreakUnits(data, p.no)]))

  // 실제 계산값(정수 단위)으로 내림차순. 동점 내부는 제안번호 순(임시)
  complete.sort((a, b) => aggs.get(b.no)!.trimmedUnits! - aggs.get(a.no)!.trimmedUnits! || a.no - b.no)

  const tieGroups: TieGroup[] = []
  const rows: RankRow[] = []
  let i = 0
  while (i < complete.length) {
    const u = aggs.get(complete[i].no)!.trimmedUnits!
    let j = i
    while (j < complete.length && aggs.get(complete[j].no)!.trimmedUnits === u) j++
    const avgGroup = complete.slice(i, j)

    // 평균 동점이면 1차 실시가능성 합계, 2차 효율성(경제성) 합계로 가른다.
    // 세부점수가 없는 평가(총점 직접입력)가 섞여 있으면 기준을 적용할 수 없으므로 위원회 결정으로 넘긴다.
    let subgroups = [avgGroup]
    const canBreak = avgGroup.length > 1 && avgGroup.every((p) => tbs.get(p.no))
    if (canBreak) {
      const sorted = [...avgGroup].sort((a, b) => cmpTb(tbs.get(a.no)!, tbs.get(b.no)!) || a.no - b.no)
      subgroups = []
      for (const p of sorted) {
        const last = subgroups[subgroups.length - 1]
        if (last && cmpTb(tbs.get(last[0].no)!, tbs.get(p.no)!) === 0) last.push(p)
        else subgroups.push([p])
      }
    }

    let pos = i + 1
    for (let g = 0; g < subgroups.length; g++) {
      let group = subgroups[g]
      const start = pos
      const end = pos + group.length - 1
      let decided = false
      let needsDecision = false
      let key: string | null = null
      if (group.length > 1) {
        const nos = group.map((p) => p.no)
        key = tieKey(u, nos)
        const crosses = TIER_BOUNDARIES.some((b) => start <= b && b < end)
        const decision = data.tieDecisions[key] ?? null
        tieGroups.push({ key, trimmedUnits: u, avg: aggs.get(nos[0])!.avg!, nos, start, end, crossesBoundary: crosses, decision, tieBreak: tbs.get(nos[0])?.map(fromUnits) ?? null })
        if (decision) {
          decided = true
          group = decision.order.map((no) => group.find((p) => p.no === no)!).filter(Boolean)
        } else if (crosses) {
          needsDecision = true
        }
      }
      // 이 묶음을 다른 묶음과 가른 기준: 1차 값이 다른 묶음과 모두 다르면 1차, 아니면 2차
      let brokenBy: string | null = null
      if (subgroups.length > 1) {
        const mine = tbs.get(group[0].no)!
        const firstUnique = subgroups.every((o, k) => k === g || tbs.get(o[0].no)![0] !== mine[0])
        brokenBy = firstUnique ? `${TIEBREAK_CATEGORIES[0]} 합계` : `${TIEBREAK_CATEGORIES[0]} 합계 동일 → ${TIEBREAK_CATEGORIES[1]} 합계`
      }
      group.forEach((p, k) => {
        const position = start + k
        rows.push({
          no: p.no, title: p.title, agg: aggs.get(p.no)!,
          rank: start, position, tieSize: group.length, avgTieSize: avgGroup.length,
          tieBreak: tbs.get(p.no)?.map(fromUnits) ?? null, brokenBy,
          needsDecision, decided, tieKey: key,
          award: needsDecision ? '동점 확인 필요' : awardForPosition(position),
        })
      })
      pos = end + 1
    }
    i = j
  }
  for (const p of incomplete) {
    rows.push({
      no: p.no, title: p.title, agg: aggs.get(p.no)!,
      rank: null, position: null, tieSize: 0, avgTieSize: 0, tieBreak: null, brokenBy: null,
      needsDecision: false, decided: false, tieKey: null, award: '집계 미완료',
    })
  }
  return {
    aggs, rows, tieGroups,
    completeCount: complete.length,
    allComplete: incomplete.length === 0,
    unresolvedTies: tieGroups.filter((g) => g.crossesBoundary && !g.decision),
  }
}

// ───────────────────────── 집계 검증(독립 재계산) ─────────────────────────

export interface VerifyItem {
  no: number
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
}

/**
 * aggregateScores와 다른 방법(정렬 후 양 끝 제거)으로 다시 계산해 결과를 대조하고,
 * 평가표 세부점수 합계·배점 범위·제외 개수를 점검한다.
 */
export function verifyResults(data: AppData, results: Results): VerifyItem[] {
  return data.proposals.map((p) => {
    const agg = results.aggs.get(p.no)!
    const checks: VerifyItem['checks'] = []

    // 1) 평가표별 세부점수 범위·합계
    for (const j of data.judges) {
      const ev = data.evaluations[evalKey(j.id, p.no)]
      if (!ev) continue
      if (ev.mode === 'detail') {
        let s = 0
        let all = true
        for (const c of data.criteria) {
          const v = ev.items[c.id]
          if (v === null || v === undefined) { all = false; continue }
          if (v < 0 || v > c.max) checks.push({ name: `${j.name} ${c.category} 범위`, ok: false, detail: `${v}점 (배점 ${c.max})` })
          s += toUnits(v)
        }
        const sum = summarizeEvaluation(ev, data.criteria)
        if (all && toUnits(sum.total!) !== s) checks.push({ name: `${j.name} 세부합계`, ok: false, detail: `${sum.total} ≠ ${fromUnits(s)}` })
      } else if (ev.total !== null && (ev.total < 0 || ev.total > 100)) {
        checks.push({ name: `${j.name} 총점 범위`, ok: false, detail: `${ev.total}점` })
      }
    }

    if (!agg.complete) {
      checks.push({ name: '집계', ok: true, detail: `미완료(${agg.enteredCount}/${data.judges.length}) — 계산 대상 아님` })
      return { no: p.no, ok: checks.every((c) => c.ok), checks }
    }

    // 2) 독립 재계산
    const sorted = (agg.scores as number[]).map(toUnits).sort((a, b) => a - b)
    const middle = sorted.slice(1, -1)
    const recalcUnits = middle.reduce((a, b) => a + b, 0)
    checks.push({ name: '제외 후 합계 재계산', ok: recalcUnits === agg.trimmedUnits, detail: `${fromUnits(recalcUnits)} / ${agg.trimmedSum}` })
    checks.push({ name: '제외 최고점 = 실제 최고점', ok: toUnits(agg.max!) === sorted[sorted.length - 1], detail: `${agg.max}` })
    checks.push({ name: '제외 최저점 = 실제 최저점', ok: toUnits(agg.min!) === sorted[0], detail: `${agg.min}` })
    checks.push({ name: '제외 점수 정확히 2개', ok: agg.maxIndex !== agg.minIndex, detail: `위원${agg.maxIndex! + 1}·위원${agg.minIndex! + 1}` })
    const avg2 = recalcUnits / middle.length / SCALE
    checks.push({ name: '평균 재계산', ok: Math.abs(avg2 - agg.avg!) < 1e-12, detail: `${fmt2(avg2)}` })
    checks.push({ name: '반영 위원 수', ok: middle.length === data.judges.length - 2, detail: `${middle.length}명` })
    return { no: p.no, ok: checks.every((c) => c.ok), checks }
  })
}

export function progress(data: AppData) {
  const total = data.judges.length * data.proposals.length
  let done = 0
  for (const j of data.judges)
    for (const p of data.proposals)
      if (summarizeEvaluation(data.evaluations[evalKey(j.id, p.no)], data.criteria).complete) done++
  return { done, total }
}
