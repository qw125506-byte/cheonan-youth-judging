export interface Criterion {
  id: string
  /** 심사항목(실시가능성 등) */
  category: string
  /** 심사요소 */
  label: string
  /** 배점 */
  max: number
}

export interface Judge {
  id: string
  affiliation: string
  name: string
}

export interface Proposal {
  no: number
  field: string
  title: string
  summary: string
  dept: string
}

/** detail: 세부항목 10개 입력, total: 총점 직접입력(세부점수 없음) */
export type EntryMode = 'detail' | 'total'

export interface Evaluation {
  mode: EntryMode
  /** 세부항목 점수. 키가 없거나 null이면 미입력 */
  items: Record<string, number | null>
  /** 총점 직접입력 값(mode === 'total'일 때만 사용) */
  total: number | null
  updatedAt: string
}

export interface AuditEntry {
  at: string
  judgeId: string
  proposalNo: number
  /** 세부항목 id, 'total', 또는 'system' */
  field: string
  before: number | null | string
  after: number | null | string
  note?: string
}

export interface TieDecision {
  /** 위원회가 정한 순서(제안번호) */
  order: number[]
  reason: string
  at: string
}

export interface FinalResultRow {
  no: number
  title: string
  avg: number
  position: number
  rank: number
  award: string
}

export interface Finalization {
  at: string
  by: string
  rows: FinalResultRow[]
}

export interface Settings {
  allowDecimal: boolean
}

export interface AppData {
  version: 1
  /** real: 실제 심사, test: 연습·검증용 */
  dataMode: 'real' | 'test'
  meta: { title: string; date: string; place: string }
  judges: Judge[]
  proposals: Proposal[]
  criteria: Criterion[]
  settings: Settings
  /** 키: `${judgeId}:${proposalNo}` */
  evaluations: Record<string, Evaluation>
  audit: AuditEntry[]
  /** 키: tieKey() 결과 */
  tieDecisions: Record<string, TieDecision>
  finalized: Finalization | null
}
