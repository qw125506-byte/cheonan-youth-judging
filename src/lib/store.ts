import type { AppData, Evaluation, EntryMode, AuditEntry } from './types'
import { createInitialData } from './initialData'
import { evalKey, summarizeEvaluation } from './calc'

const KEY = { real: 'cyj2026:real', test: 'cyj2026:test', active: 'cyj2026:activeMode' } as const

export const nowIso = () => new Date().toISOString()

export function loadData(mode: 'real' | 'test'): AppData {
  try {
    const raw = localStorage.getItem(KEY[mode])
    if (raw) {
      const parsed = JSON.parse(raw)
      const err = validateBackup(parsed)
      if (!err && parsed.dataMode === mode) return parsed as AppData
    }
  } catch { /* 손상·차단 시 초기값 */ }
  return createInitialData(mode)
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(KEY[data.dataMode], JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function loadActiveMode(): 'real' | 'test' {
  try { return localStorage.getItem(KEY.active) === 'test' ? 'test' : 'real' } catch { return 'real' }
}
export function saveActiveMode(mode: 'real' | 'test') {
  try { localStorage.setItem(KEY.active, mode) } catch { /* 무시 */ }
}

/** 백업 파일 구조 검사. 문제가 있으면 오류 문구, 정상이면 null */
export function validateBackup(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'JSON 형식이 아닙니다'
  const x = d as Partial<AppData>
  if (x.version !== 1) return '지원하지 않는 백업 버전입니다'
  if (x.dataMode !== 'real' && x.dataMode !== 'test') return '데이터 구분(실제/연습)이 없습니다'
  if (!Array.isArray(x.judges) || !Array.isArray(x.proposals) || !Array.isArray(x.criteria)) return '위원·제안·심사기준 목록이 없습니다'
  if (!x.evaluations || typeof x.evaluations !== 'object') return '평가 데이터가 없습니다'
  if (!Array.isArray(x.audit)) return '수정 이력이 없습니다'
  for (const [k, ev] of Object.entries(x.evaluations as Record<string, Evaluation>)) {
    if (!/^[^:]+:\d+$/.test(k)) return `평가 키 형식 오류: ${k}`
    if (ev.mode !== 'detail' && ev.mode !== 'total') return `입력방식 오류: ${k}`
    for (const [cid, v] of Object.entries(ev.items ?? {})) {
      const c = x.criteria!.find((cc) => cc.id === cid)
      if (!c) return `알 수 없는 심사요소: ${cid}`
      if (v !== null && (typeof v !== 'number' || v < 0 || v > c.max)) return `배점 범위를 벗어난 점수: ${k} ${cid}=${v}`
    }
    if (ev.total !== null && (typeof ev.total !== 'number' || ev.total < 0 || ev.total > 100)) return `총점 범위 오류: ${k}`
  }
  return null
}

// ───────────────────────── 점수 변경(모두 이력 기록) ─────────────────────────

export class LockedError extends Error {
  constructor() { super('심사결과가 확정되어 점수를 수정할 수 없습니다. 「최종 순위」 화면에서 관리자 확정 해제 후 수정하세요.') }
}

function withAudit(data: AppData, entries: Omit<AuditEntry, 'at'>[]): AuditEntry[] {
  const at = nowIso()
  return [...data.audit, ...entries.map((e) => ({ ...e, at }))]
}

/** 같은 칸을 이어서 입력한 것으로 보고 이력을 1건으로 묶는 시간 */
const COALESCE_MS = 30_000

/**
 * 점수 변경 이력 추가. 바로 앞 이력이 같은 위원·제안·항목이고 30초 이내면
 * (한 칸에 숫자를 이어서 누른 경우) 새 줄을 만들지 않고 ‘변경 후’ 값만 갱신한다.
 * 결과적으로 값이 원래대로 돌아오면 그 이력은 지운다.
 */
function withScoreAudit(data: AppData, e: Omit<AuditEntry, 'at'>): AuditEntry[] {
  const at = nowIso()
  const last = data.audit[data.audit.length - 1]
  if (last && last.judgeId === e.judgeId && last.proposalNo === e.proposalNo && last.field === e.field &&
      last.note === e.note && Date.now() - Date.parse(last.at) < COALESCE_MS) {
    const rest = data.audit.slice(0, -1)
    return last.before === e.after ? rest : [...rest, { ...last, after: e.after, at }]
  }
  return [...data.audit, { ...e, at }]
}

function emptyEval(mode: EntryMode): Evaluation {
  return { mode, items: {}, total: null, updatedAt: nowIso() }
}

export function setItemScore(data: AppData, judgeId: string, no: number, criterionId: string, value: number | null): AppData {
  if (data.finalized) throw new LockedError()
  const key = evalKey(judgeId, no)
  const prev = data.evaluations[key]
  if (prev && prev.mode === 'total') throw new Error('총점 직접입력으로 기록된 평가입니다. 세부항목 입력으로 전환한 뒤 입력하세요.')
  const before = prev?.items[criterionId] ?? null
  if (before === value) return data
  const ev: Evaluation = { ...(prev ?? emptyEval('detail')), items: { ...(prev?.items ?? {}), [criterionId]: value }, updatedAt: nowIso() }
  return {
    ...data,
    evaluations: { ...data.evaluations, [key]: ev },
    audit: withScoreAudit(data, { judgeId, proposalNo: no, field: criterionId, before, after: value }),
  }
}

export function setTotalScore(data: AppData, judgeId: string, no: number, value: number | null): AppData {
  if (data.finalized) throw new LockedError()
  const key = evalKey(judgeId, no)
  const prev = data.evaluations[key]
  if (prev && prev.mode === 'detail' && summarizeEvaluation(prev, data.criteria).enteredItems > 0)
    throw new Error('세부항목 점수가 입력된 평가입니다. 총점은 세부점수 합계로 자동 계산되므로 직접 입력할 수 없습니다.')
  const before = prev?.mode === 'total' ? prev.total : null
  if (before === value && prev?.mode === 'total') return data
  const evaluations = { ...data.evaluations }
  if (value === null) delete evaluations[key]
  else evaluations[key] = { mode: 'total', items: {}, total: value, updatedAt: nowIso() }
  return {
    ...data,
    evaluations,
    audit: withScoreAudit(data, { judgeId, proposalNo: no, field: 'total', before, after: value, note: '총점 직접입력' }),
  }
}

/** 평가 1건을 지우고 지정 방식의 빈 평가로 되돌린다(입력방식 전환용) */
export function resetEvaluation(data: AppData, judgeId: string, no: number, reason: string): AppData {
  if (data.finalized) throw new LockedError()
  const key = evalKey(judgeId, no)
  const prev = data.evaluations[key]
  if (!prev) return data
  const s = summarizeEvaluation(prev, data.criteria)
  const evaluations = { ...data.evaluations }
  delete evaluations[key]
  return {
    ...data,
    evaluations,
    audit: withAudit(data, [{
      judgeId, proposalNo: no, field: 'system',
      before: prev.mode === 'total' ? `총점입력 ${prev.total ?? ''}` : `세부입력 ${s.enteredItems}항목 (총점 ${s.total ?? '미완성'})`,
      after: '삭제', note: reason,
    }]),
  }
}

export function logSystem(data: AppData, note: string): AppData {
  return { ...data, audit: withAudit(data, [{ judgeId: '-', proposalNo: 0, field: 'system', before: null, after: null, note }]) }
}
