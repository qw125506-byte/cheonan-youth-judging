import { useApp, type Tab } from '../components/ctx'
import { Card, Notice } from '../components/ui'
import { evalKey, progress, summarizeEvaluation, verifyResults } from '../lib/calc'

export default function Dashboard() {
  const { data, results, setTab } = useApp()
  const prog = progress(data)
  const pct = Math.round((prog.done / prog.total) * 100)
  const verify = verifyResults(data, results)
  const verifyOk = verify.every((v) => v.ok)
  const ready = results.allComplete && results.unresolvedTies.length === 0 && verifyOk

  const judgeDone = data.judges.map((j) =>
    data.proposals.filter((p) => summarizeEvaluation(data.evaluations[evalKey(j.id, p.no)], data.criteria).complete).length)

  const stats = [
    { label: '심사위원', value: `${data.judges.length}명` },
    { label: '심사 제안', value: `${data.proposals.length}건` },
    { label: '평가 입력', value: `${prog.done} / ${prog.total}건` },
    { label: '집계 완료 제안', value: `${results.completeCount} / ${data.proposals.length}건` },
  ]

  const menu: { tab: Tab; title: string; desc: string }[] = [
    { tab: 'entry', title: '① 심사표 입력', desc: '위원별 종이 심사표의 10개 세부점수 입력(한 건씩 / 14건 일괄)' },
    { tab: 'matrix', title: '② 위원별 점수표', desc: '14×6 총점표, 최고·최저 제외 표시, 총점 직접입력 모드' },
    { tab: 'verify', title: '③ 집계 검증', desc: '독립 재계산으로 제외·평균 계산 자동 검증' },
    { tab: 'final', title: '④ 최종 순위·수상', desc: '최우수 1·우수 2·장려 3, 동점 위원회 결정, 결과 확정' },
    { tab: 'output', title: '⑤ 출력·백업', desc: '평가표·집계표·결과표 인쇄(PDF), 엑셀·CSV, JSON 백업·복원' },
    { tab: 'settings', title: '설정·이력', desc: '위원·제안 정보 수정, 소수점 허용, 수정 이력, 연습 모드' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className="num mt-1 text-2xl font-bold text-navy-800">{s.value}</div>
          </div>
        ))}
      </div>

      <Card title="심사 진행률" right={<span className="num text-lg font-bold text-navy-700">{pct}%</span>}>
        <div className="h-3 overflow-hidden rounded bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-navy-600" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {data.judges.map((j, i) => (
            <div key={j.id} className={`rounded border px-3 py-2 ${judgeDone[i] === data.proposals.length ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
              <div className="text-xs text-gray-500">위원{i + 1}</div>
              <div className="font-semibold">{j.name}</div>
              <div className="num text-sm">{judgeDone[i]} / {data.proposals.length}건 {judgeDone[i] === data.proposals.length && '✓'}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          {data.finalized ? (
            <Notice kind="ok">심사결과가 확정되었습니다. 점수는 잠겨 있으며, 수정하려면 「④ 최종 순위·수상」에서 확정 해제가 필요합니다.</Notice>
          ) : ready ? (
            <Notice kind="ok">최종 집계 가능 — 전체 평가 입력 완료, 계산 검증 통과, 수상 경계 동점 없음. 「④ 최종 순위·수상」에서 확정하세요.</Notice>
          ) : (
            <Notice kind="warn">
              최종 집계 불가 —{' '}
              {[
                !results.allComplete && `미입력 평가 ${prog.total - prog.done}건`,
                results.unresolvedTies.length > 0 && `수상 경계 동점 ${results.unresolvedTies.length}건 위원회 결정 필요`,
                !verifyOk && '계산 검증 오류',
              ].filter(Boolean).join(' / ')}
            </Notice>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {menu.map((m) => (
          <button key={m.tab} onClick={() => setTab(m.tab)} className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-navy-600">
            <div className="font-bold text-navy-800">{m.title}</div>
            <div className="mt-1 text-sm text-gray-600">{m.desc}</div>
          </button>
        ))}
      </div>

      <Card title="심사 개요">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-gray-500">일시 </dt><dd className="inline">2026. 10. 19.(월) 14:00 ~ 16:00</dd></div>
          <div><dt className="inline text-gray-500">장소 </dt><dd className="inline">{data.meta.place}</dd></div>
          <div><dt className="inline text-gray-500">심사방법 </dt><dd className="inline">심사기준표(실시가능성, 창의성 등)에 따른 서면 평가, 100점 만점</dd></div>
          <div><dt className="inline text-gray-500">집계방법 </dt><dd className="inline">제안별 최고·최저점 각 1개 제외 후 4명 평균</dd></div>
          <div><dt className="inline text-gray-500">선정 </dt><dd className="inline">최우수 1(1,000천원), 우수 2(각 500천원), 장려 3(각 200천원)</dd></div>
        </dl>
      </Card>
    </div>
  )
}
