import { createContext, useContext } from 'react'
import type { AppData } from '../lib/types'
import type { Results } from '../lib/calc'

export type Tab = 'dashboard' | 'entry' | 'matrix' | 'verify' | 'final' | 'output' | 'settings'
export type PrintDoc = { kind: 'judgeSheets'; judgeIds: string[]; blank?: boolean } | { kind: 'summary' } | { kind: 'final' }

export interface Ctx {
  data: AppData
  results: Results
  /** 변경 함수 실행. 오류(확정 잠금 등)는 화면 상단 알림으로 표시하고 false 반환 */
  update: (fn: (d: AppData) => AppData) => boolean
  /** 전체 교체(복원·초기화) */
  replace: (d: AppData) => void
  setTab: (t: Tab) => void
  print: (doc: PrintDoc) => void
  notify: (msg: string, kind?: 'ok' | 'error') => void
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)
