import { useEffect, useState } from 'react'
import { useApp } from '../components/ctx'
import { Button, Card, Notice, kst } from '../components/ui'
import { loadData, logSystem, saveActiveMode, saveData } from '../lib/store'
import { fillTestScores } from '../lib/testData'
import type { AppData } from '../lib/types'

/** 포커스를 벗어날 때 저장하는 글 입력칸 */
function TextField({ value, onSave, disabled, className = '' }: { value: string; onSave: (v: string) => void; disabled?: boolean; className?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
      onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value) }}
      className={`w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 ${className}`} />
  )
}

export default function SettingsScreen() {
  const { data, update, replace, notify } = useApp()
  const locked = !!data.finalized
  const [onlyEdits, setOnlyEdits] = useState(false)

  const hasDecimals = Object.values(data.evaluations).some((ev) =>
    Object.values(ev.items).some((v) => v !== null && !Number.isInteger(v)) || (ev.total !== null && !Number.isInteger(ev.total)))

  const edit = (fn: (d: AppData) => AppData, note: string) => update((d) => logSystem(fn(d), note))

  function switchMode(mode: 'real' | 'test') {
    if (mode === data.dataMode) return
    saveData(data)
    saveActiveMode(mode)
    replace(loadData(mode))
    notify(mode === 'test' ? '연습 모드로 전환했습니다(실제 데이터와 따로 저장)' : '실제 심사 모드로 전환했습니다')
  }

  const auditRows = data.audit.filter((e) => !onlyEdits || (e.before !== null && e.field !== 'system')).slice().reverse()
  const fieldLabel = (f: string) => data.criteria.find((c) => c.id === f) ? `${data.criteria.find((c) => c.id === f)!.category} · ${data.criteria.find((c) => c.id === f)!.label}` : f === 'total' ? '총점(직접입력)' : '시스템'

  return (
    <div className="space-y-4">
      <Card title="데이터 구분: 실제 심사 / 연습">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={data.dataMode === 'real' ? 'primary' : 'secondary'} onClick={() => switchMode('real')}>실제 심사 데이터</Button>
          <Button variant={data.dataMode === 'test' ? 'primary' : 'secondary'} onClick={() => switchMode('test')}>연습 모드</Button>
          {data.dataMode === 'test' && (
            <Button className="ml-2" disabled={locked} onClick={() => {
              if (Object.keys(data.evaluations).length && !confirm('연습 데이터의 기존 점수를 덮어씁니다. 계속할까요?')) return
              update((d) => fillTestScores(d, Date.now() % 100000))
              notify('테스트 점수 84건을 만들었습니다(6·7위 동점 포함)')
            }}>테스트 점수 84건 자동 생성</Button>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-600">연습 모드는 실제 심사 데이터와 별도 저장소를 씁니다. 테스트 점수 생성은 연습 모드에서만 가능하므로 실제 심사 데이터에 섞이지 않습니다. 실제 심사 초기 데이터는 모든 점수가 미입력 상태입니다.</p>
      </Card>

      <Card title="입력 설정">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={data.settings.allowDecimal} disabled={locked || (data.settings.allowDecimal && hasDecimals)}
            onChange={(e) => { const v = e.target.checked; edit((d) => ({ ...d, settings: { ...d.settings, allowDecimal: v } }), `소수점 입력 ${v ? '허용' : '불허'}`) }} />
          세부점수 소수점 입력 허용(소수 첫째 자리까지, 예: 7.5)
        </label>
        {data.settings.allowDecimal && hasDecimals && <p className="mt-1 text-xs text-gray-500">소수점 점수가 이미 입력되어 있어 해제할 수 없습니다.</p>}
      </Card>

      {locked && <Notice kind="warn">결과가 확정되어 위원·제안 정보도 수정할 수 없습니다.</Notice>}

      <Card title="심사위원 (보고요지 기준)">
        <div className="grid gap-2">
          {data.judges.map((j, i) => (
            <div key={j.id} className="grid grid-cols-[60px_1fr_160px] items-center gap-2">
              <span className="text-sm font-semibold">위원{i + 1}</span>
              <TextField value={j.affiliation} disabled={locked} onSave={(v) => edit((d) => ({ ...d, judges: d.judges.map((x) => x.id === j.id ? { ...x, affiliation: v } : x) }), `위원${i + 1} 소속 변경: ${j.affiliation} → ${v}`)} />
              <TextField value={j.name} disabled={locked} onSave={(v) => edit((d) => ({ ...d, judges: d.judges.map((x) => x.id === j.id ? { ...x, name: v } : x) }), `위원${i + 1} 성명 변경: ${j.name} → ${v}`)} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="심사 제안 (보고요지·제안심사표 기준)">
        <div className="space-y-2">
          {data.proposals.map((p) => (
            <div key={p.no} className="grid grid-cols-[32px_1fr] gap-2 border-b border-gray-100 pb-2 lg:grid-cols-[32px_2fr_2fr_120px]">
              <span className="num pt-1 font-bold text-navy-700">{p.no}</span>
              <TextField value={p.title} disabled={locked} onSave={(v) => edit((d) => ({ ...d, proposals: d.proposals.map((x) => x.no === p.no ? { ...x, title: v } : x) }), `제안${p.no} 제안명 변경`)} />
              <TextField value={p.summary} disabled={locked} className="text-gray-600" onSave={(v) => edit((d) => ({ ...d, proposals: d.proposals.map((x) => x.no === p.no ? { ...x, summary: v } : x) }), `제안${p.no} 제안내용 변경`)} />
              <TextField value={p.dept} disabled={locked} onSave={(v) => edit((d) => ({ ...d, proposals: d.proposals.map((x) => x.no === p.no ? { ...x, dept: v } : x) }), `제안${p.no} 검토부서 변경`)} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="심사기준 (제안심사표 기준, 배점 고정)">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {data.criteria.map((c) => (
              <tr key={c.id}>
                <td className="w-32 border border-gray-200 px-2 py-1 font-semibold">{c.category}</td>
                <td className="border border-gray-200 px-1 py-1">
                  <TextField value={c.label} disabled={locked} onSave={(v) => edit((d) => ({ ...d, criteria: d.criteria.map((x) => x.id === c.id ? { ...x, label: v } : x) }), `심사요소 문구 변경: ${c.label} → ${v}`)} />
                </td>
                <td className="num w-16 border border-gray-200 text-center">{c.max}점</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">심사요소 문구는 수정할 수 있으나, 배점은 입력된 점수와의 정합성을 위해 바꿀 수 없습니다(합계 {data.criteria.reduce((a, c) => a + c.max, 0)}점).</p>
      </Card>

      <Card title={`수정 이력 (${data.audit.length}건)`} right={
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyEdits} onChange={(e) => setOnlyEdits(e.target.checked)} />기존 점수 수정만 보기</label>
      }>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50"><tr className="text-left"><th className="px-2 py-1">일시</th><th className="px-2">위원</th><th className="px-2">제안</th><th className="px-2">항목</th><th className="px-2">변경 전</th><th className="px-2">변경 후</th><th className="px-2">비고</th></tr></thead>
            <tbody>
              {auditRows.slice(0, 500).map((e, i) => (
                <tr key={i} className={`border-t ${e.before !== null && e.field !== 'system' ? 'bg-amber-50/60' : ''}`}>
                  <td className="num whitespace-nowrap px-2 py-1">{kst(e.at)}</td>
                  <td className="px-2">{data.judges.find((j) => j.id === e.judgeId)?.name ?? ''}</td>
                  <td className="num px-2">{e.proposalNo || ''}</td>
                  <td className="px-2">{fieldLabel(e.field)}</td>
                  <td className="num px-2">{e.before ?? (e.field === 'system' ? '' : '(미입력)')}</td>
                  <td className="num px-2">{e.after ?? (e.field === 'system' ? '' : '(미입력)')}</td>
                  <td className="px-2">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditRows.length > 500 && <p className="mt-2 text-xs text-gray-500">최근 500건만 표시합니다. 전체 이력은 엑셀 ‘수정이력’ 시트에 있습니다.</p>}
        </div>
      </Card>
    </div>
  )
}
