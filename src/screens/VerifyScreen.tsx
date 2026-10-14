import { useApp } from '../components/ctx'
import { Card, Notice } from '../components/ui'
import { fmt2, fmtScore, verifyResults } from '../lib/calc'

export default function VerifyScreen() {
  const { data, results } = useApp()
  const verify = verifyResults(data, results)
  const errors = verify.filter((v) => !v.ok)
  const byNo = new Map(results.rows.map((r) => [r.no, r]))

  return (
    <div className="space-y-4">
      {errors.length === 0
        ? <Notice kind="ok">계산 검증 통과 — 집계된 {results.completeCount}건 모두 독립 재계산(정렬 후 양 끝 제거)과 일치하고, 세부점수 합계·배점 범위·제외 개수에 이상이 없습니다.</Notice>
        : <Notice kind="error">계산 검증 오류 {errors.length}건 — 아래 빨간 행을 확인하세요. 오류가 있으면 결과를 확정할 수 없습니다.</Notice>}

      <Card title="제안별 계산 과정">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-navy-50 text-navy-900">
                <th className="border border-gray-300 px-1 py-2">번호</th>
                <th className="border border-gray-300 px-2">위원 점수 (낮은 순 정렬)</th>
                <th className="border border-gray-300 px-2">6명 합계</th>
                <th className="border border-gray-300 px-2">− 최고</th>
                <th className="border border-gray-300 px-2">− 최저</th>
                <th className="border border-gray-300 px-2">= 반영 합계</th>
                <th className="border border-gray-300 px-2">÷ 4 (원값)</th>
                <th className="border border-gray-300 px-2">표시</th>
                <th className="border border-gray-300 px-2">검증</th>
              </tr>
            </thead>
            <tbody>
              {verify.map((v) => {
                const a = byNo.get(v.no)!.agg
                const sorted = a.complete ? (a.scores as number[]).slice().sort((x, y) => x - y) : []
                return (
                  <tr key={v.no} className={v.ok ? '' : 'bg-red-50'}>
                    <td className="num border border-gray-300 text-center font-bold text-navy-700">{v.no}</td>
                    <td className="num border border-gray-300 px-2">
                      {a.complete ? sorted.map((s, i) => (
                        <span key={i} className={`mr-2 ${i === 0 ? 'text-gray-400 line-through' : i === sorted.length - 1 ? 'font-bold text-red-600 line-through' : ''}`}>{fmtScore(s)}</span>
                      )) : <span className="text-amber-700">입력 {a.enteredCount}/{data.judges.length}명 — 집계 대기</span>}
                    </td>
                    <td className="num border border-gray-300 px-2 text-right">{fmtScore(a.sumAll)}</td>
                    <td className="num border border-gray-300 px-2 text-right text-red-600">{fmtScore(a.max)}</td>
                    <td className="num border border-gray-300 px-2 text-right text-gray-500">{fmtScore(a.min)}</td>
                    <td className="num border border-gray-300 px-2 text-right">{fmtScore(a.trimmedSum)}</td>
                    <td className="num border border-gray-300 px-2 text-right text-xs">{a.avg ?? ''}</td>
                    <td className="num border border-gray-300 px-2 text-right font-bold">{fmt2(a.avg)}</td>
                    <td className="border border-gray-300 px-2 text-xs">
                      {v.ok ? <span className="text-emerald-700">✓ {v.checks.length}개 점검 통과</span>
                        : v.checks.filter((c) => !c.ok).map((c, i) => <div key={i} className="text-red-700">✗ {c.name}: {c.detail}</div>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
          <li>점검 항목: 제외 후 합계 독립 재계산, 제외 최고점·최저점이 실제 최고·최저인지, 제외 점수가 정확히 2개인지, 평균 재계산, 반영 위원 4명, 세부점수 합계, 배점 범위.</li>
          <li>최고점(최저점)이 여러 명 같아도 1개만 제외됩니다. 제안마다 독립적으로 판정합니다.</li>
          <li>모든 계산은 0.01점 단위 정수로 처리하여 부동소수 오차가 없습니다.</li>
        </ul>
      </Card>
    </div>
  )
}
