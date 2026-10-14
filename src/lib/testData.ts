import type { AppData, Evaluation } from './types'
import { computeResults, evalKey } from './calc'
import { logSystem, nowIso } from './store'

/** 재현 가능한 의사난수(같은 seed → 같은 점수) */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/**
 * 연습 모드 전용: 84건 세부점수를 무작위로 채우고,
 * 6위와 7위를 일부러 같은 점수로 만들어 동점 처리 화면을 확인할 수 있게 한다.
 */
export function fillTestScores(data: AppData, seed = 20261019): AppData {
  if (data.dataMode !== 'test') throw new Error('테스트 점수는 연습 모드에서만 만들 수 있습니다')
  const r = rng(seed)
  const evaluations: Record<string, Evaluation> = {}
  data.proposals.forEach((p, pi) => {
    const strength = 0.45 + ((pi * 37) % 14) / 30 // 제안별 실력 차
    for (const j of data.judges) {
      const items: Record<string, number> = {}
      for (const c of data.criteria) {
        const v = Math.round(c.max * Math.min(1, Math.max(0, strength + (r() - 0.5) * 0.35)))
        items[c.id] = v
      }
      evaluations[evalKey(j.id, p.no)] = { mode: 'detail', items, total: null, updatedAt: nowIso() }
    }
  })
  let next: AppData = { ...data, evaluations, tieDecisions: {}, finalized: null }
  const res = computeResults(next)
  const sixth = res.rows.find((x) => x.position === 6)
  const seventh = res.rows.find((x) => x.position === 7)
  if (sixth && seventh) {
    for (const j of data.judges) {
      const src = evaluations[evalKey(j.id, sixth.no)]
      evaluations[evalKey(j.id, seventh.no)] = { ...src, items: { ...src.items } }
    }
    next = { ...next, evaluations: { ...evaluations } }
  }
  return logSystem(next, '연습용 테스트 점수 84건 생성(6·7위 동점 포함)')
}
