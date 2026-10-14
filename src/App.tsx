import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppData } from './lib/types'
import { computeResults, progress } from './lib/calc'
import { loadActiveMode, loadData, saveActiveMode, saveData } from './lib/store'
import { AppCtx, type PrintDoc, type Tab } from './components/ctx'
import Dashboard from './screens/Dashboard'
import EntryScreen from './screens/EntryScreen'
import MatrixScreen from './screens/MatrixScreen'
import VerifyScreen from './screens/VerifyScreen'
import FinalScreen from './screens/FinalScreen'
import OutputScreen from './screens/OutputScreen'
import SettingsScreen from './screens/SettingsScreen'
import PrintDocs from './screens/PrintDocs'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'entry', label: '① 심사표 입력' },
  { id: 'matrix', label: '② 위원별 점수표' },
  { id: 'verify', label: '③ 집계 검증' },
  { id: 'final', label: '④ 최종 순위·수상' },
  { id: 'output', label: '⑤ 출력·백업' },
  { id: 'settings', label: '설정·이력' },
]

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData(loadActiveMode()))
  const dataRef = useRef(data)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null)
  const [saveOk, setSaveOk] = useState(true)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [printDoc, setPrintDoc] = useState<PrintDoc | null>(null)

  const notify = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => setToast({ msg, kind }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2500)
    return () => clearTimeout(t)
  }, [toast])

  /** 변경 즉시 브라우저 저장소에 기록(화면 갱신을 기다리지 않음) */
  const persist = useCallback((d: AppData) => {
    const ok = saveData(d)
    setSaveOk(ok)
    if (ok) setSavedAt(new Date())
  }, [])

  const update = useCallback((fn: (d: AppData) => AppData) => {
    try {
      const next = fn(dataRef.current)
      if (next !== dataRef.current) { dataRef.current = next; persist(next); setData(next) }
      return true
    } catch (e) {
      notify((e as Error).message, 'error')
      return false
    }
  }, [notify, persist])

  const replace = useCallback((d: AppData) => {
    dataRef.current = d
    persist(d)
    setData(d)
    saveActiveMode(d.dataMode)
  }, [persist])

  const print = useCallback((doc: PrintDoc) => setPrintDoc(doc), [])
  useEffect(() => {
    if (!printDoc) return
    const done = () => setPrintDoc(null)
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 50)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done) }
  }, [printDoc])

  const results = useMemo(() => computeResults(data), [data])
  const prog = useMemo(() => progress(data), [data])
  const ctx = useMemo(() => ({ data, results, update, replace, setTab, print, notify }), [data, results, update, replace, print, notify])
  const isTest = data.dataMode === 'test'

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app-root min-h-screen">
        {isTest && (
          <div className="bg-orange-500 px-4 py-1.5 text-center text-sm font-bold text-white">
            연습 모드 — 이 화면의 점수는 테스트 데이터이며 실제 심사 데이터와 따로 저장됩니다
          </div>
        )}
        <header className="border-b border-navy-800 bg-navy-700 text-white">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs text-navy-100">천안시 청년정책과 · 심사결과 자동 집계</div>
              <h1 className="truncate text-lg font-bold">{data.meta.title}</h1>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
              <span className="num">심사일 {data.meta.date.replace(/-/g, '. ')}.</span>
              <span className="num rounded bg-navy-800 px-2 py-1">입력 {prog.done}/{prog.total}</span>
              {data.finalized
                ? <span className="rounded bg-emerald-600 px-2 py-1 font-bold">결과 확정됨</span>
                : <span className="rounded bg-navy-600 px-2 py-1">미확정</span>}
              <span className={`rounded px-2 py-1 ${saveOk ? 'bg-navy-800 text-navy-100' : 'bg-red-600 font-bold'}`}>
                {!saveOk ? '저장 실패 — 백업 파일을 즉시 내려받으세요'
                  : savedAt ? `자동 저장됨 ${[savedAt.getHours(), savedAt.getMinutes(), savedAt.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}` : '자동 저장 켜짐'}
              </span>
            </div>
          </div>
          <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-t px-4 py-2 text-sm font-medium ${tab === t.id ? 'bg-[#f5f7fb] text-navy-800' : 'text-navy-100 hover:bg-navy-600'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {toast && (
          <div role="status" className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.kind === 'error' ? 'bg-red-600' : 'bg-navy-800'}`}>
            {toast.msg}
          </div>
        )}

        <main className="mx-auto max-w-[1400px] px-4 py-5">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'entry' && <EntryScreen />}
          {tab === 'matrix' && <MatrixScreen />}
          {tab === 'verify' && <VerifyScreen />}
          {tab === 'final' && <FinalScreen />}
          {tab === 'output' && <OutputScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </main>
      </div>
      <div className="print-root">{printDoc && <PrintDocs doc={printDoc} />}</div>
    </AppCtx.Provider>
  )
}
