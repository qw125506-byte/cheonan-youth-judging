import { useState } from 'react'
import { useApp } from '../components/ctx'
import ScoreInput from '../components/ScoreInput'
import { AwardBadge, Button, Card, Modal, Notice, kst } from '../components/ui'
import { categoriesOf, evalKey, fmt2, fmtScore, summarizeEvaluation } from '../lib/calc'
import { setTotalScore } from '../lib/store'

export default function MatrixScreen() {
  const { data, results, update } = useApp()
  const [quick, setQuick] = useState(false)
  const [detail, setDetail] = useState<{ judgeId: string; no: number } | null>(null)
  const locked = !!data.finalized
  const rowsByNo = new Map(results.rows.map((r) => [r.no, r]))

  return (
    <div className="space-y-4">
      <Card
        title="위원별 점수 집계표 (14건 × 6명)"
        right={
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={quick} disabled={locked} onChange={(e) => setQuick(e.target.checked)} className="h-4 w-4" />
            총점 직접입력 모드
          </label>
        }
      >
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          <span><span className="font-bold text-red-600">빨간색</span> = 제외된 최고점(1개)</span>
          <span><span className="font-bold text-gray-400 line-through">회색 취소선</span> = 제외된 최저점(1개)</span>
          <span>검정 = 평균에 반영된 점수</span>
          <span className="text-violet-700">보라 ‘총’ = 총점 직접입력(세부점수 없음)</span>
          <span className="rounded bg-amber-50 px-1 text-amber-800">노란 칸 = 미입력/작성중</span>
        </div>
        {quick && (
          <div className="mb-3">
            <Notice kind="info">
              총점 직접입력 모드: 세부점수가 없는 평가에만 총점(0~100)을 입력할 수 있습니다. 이렇게 입력한 점수는 ‘총점 직접입력’으로 구분 기록되며
              세부점수가 작성된 것으로 표시되지 않습니다. Enter를 누르면 아래 제안으로 이동합니다.
            </Notice>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="bg-navy-50 text-navy-900">
                <th className="border border-gray-300 px-1 py-2">번호</th>
                <th className="border border-gray-300 px-2 py-2">제안명</th>
                {data.judges.map((j, i) => (
                  <th key={j.id} className="border border-gray-300 px-1 py-2 font-semibold">위원{i + 1}<div className="text-xs font-normal">{j.name}</div></th>
                ))}
                <th className="border border-gray-300 px-1 py-2">최고점</th>
                <th className="border border-gray-300 px-1 py-2">최저점</th>
                <th className="border border-gray-300 px-1 py-2">제외 후<br />합계</th>
                <th className="border border-gray-300 px-1 py-2">최종 평균</th>
                <th className="border border-gray-300 px-1 py-2">순위</th>
                <th className="border border-gray-300 px-1 py-2">선정</th>
              </tr>
            </thead>
            <tbody>
              {data.proposals.map((p, ri) => {
                const row = rowsByNo.get(p.no)!
                const a = row.agg
                return (
                  <tr key={p.no} className="even:bg-gray-50/60">
                    <td className="num border border-gray-300 text-center font-bold text-navy-700">{p.no}</td>
                    <td className="border border-gray-300 px-2 py-1"><span className="line-clamp-2 max-w-72" title={p.title}>{p.title}</span></td>
                    {data.judges.map((j, ji) => {
                      const ev = data.evaluations[evalKey(j.id, p.no)]
                      const s = summarizeEvaluation(ev, data.criteria)
                      const isMax = a.maxIndex === ji
                      const isMin = a.minIndex === ji
                      const canQuick = quick && !locked && (!ev || ev.mode === 'total')
                      return (
                        <td key={j.id} className={`num border border-gray-300 px-1 text-center ${s.complete ? '' : 'bg-amber-50'}`}>
                          {canQuick ? (
                            <ScoreInput grid="matrix" row={ri} col={ji} value={ev?.total ?? null} max={100} allowDecimal={data.settings.allowDecimal}
                              title={`제안${p.no} ${j.name} 총점`} onCommit={(v) => update((d) => setTotalScore(d, j.id, p.no, v))} />
                          ) : (
                            <button onClick={() => setDetail({ judgeId: j.id, no: p.no })} title="클릭하면 상세 점수·수정 이력"
                              className={`w-full rounded px-1 py-1.5 text-[15px] hover:bg-navy-50 ${isMax ? 'font-bold text-red-600' : isMin ? 'text-gray-400' : ''}`}>
                              <span className={isMin ? 'line-through' : ''}>
                                {s.complete ? fmtScore(s.total) : ev ? <span className="text-xs text-amber-700">{s.enteredItems}/{data.criteria.length}</span> : <span className="text-gray-300">-</span>}
                              </span>
                              {ev?.mode === 'total' && <sup className="ml-0.5 text-[10px] font-normal text-violet-700">총</sup>}
                              {(isMax || isMin) && <span className="block text-[10px] leading-tight">{isMax ? '최고 제외' : '최저 제외'}</span>}
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="num border border-gray-300 text-center text-red-600">{fmtScore(a.max)}</td>
                    <td className="num border border-gray-300 text-center text-gray-500">{fmtScore(a.min)}</td>
                    <td className="num border border-gray-300 text-center">{fmtScore(a.trimmedSum)}</td>
                    <td className="num border border-gray-300 text-center text-base font-bold text-navy-800">
                      {a.complete ? fmt2(a.avg) : <span className="text-xs font-normal text-amber-700">{a.enteredCount}/{data.judges.length}명</span>}
                    </td>
                    <td className="num border border-gray-300 text-center font-semibold">
                      {row.rank === null ? '' : row.tieSize > 1 ? <span className="text-amber-700">공동{row.rank}</span> : row.rank}
                    </td>
                    <td className="border border-gray-300 px-1 text-center"><AwardBadge award={row.award} provisional={!results.allComplete} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          최종 평균 = (6명 점수 합계 − 최고점 1개 − 최저점 1개) ÷ 4. 표시는 소수 둘째 자리 반올림, 순위는 반올림 전 원값으로 판정합니다.
          6명 모두 입력되어야 해당 제안이 집계되며 미입력은 0점으로 계산하지 않습니다.
        </p>
      </Card>
      {detail && <CellDetail {...detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function CellDetail({ judgeId, no, onClose }: { judgeId: string; no: number; onClose: () => void }) {
  const { data } = useApp()
  const j = data.judges.find((x) => x.id === judgeId)!
  const p = data.proposals.find((x) => x.no === no)!
  const ev = data.evaluations[evalKey(judgeId, no)]
  const s = summarizeEvaluation(ev, data.criteria)
  const history = data.audit.filter((e) => e.judgeId === judgeId && e.proposalNo === no)
  const label = (f: string) => data.criteria.find((c) => c.id === f)?.label ?? (f === 'total' ? '총점' : '시스템')

  return (
    <Modal title={`${j.name} 위원 · 제안 ${no}번`} onClose={onClose} wide>
      <div className="mb-3 text-sm font-semibold">{p.title}</div>
      {!ev && <Notice kind="warn">아직 입력되지 않았습니다.</Notice>}
      {ev?.mode === 'total' && <Notice kind="info">총점 직접입력: <b className="num">{fmtScore(ev.total)}점</b> — 세부점수는 작성되지 않았습니다.</Notice>}
      {ev?.mode === 'detail' && (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {categoriesOf(data.criteria).map((cat) => {
              const items = data.criteria.filter((c) => c.category === cat)
              return items.map((c, k) => (
                <tr key={c.id}>
                  {k === 0 && <th rowSpan={items.length} className="border border-gray-300 bg-gray-50 px-2">{cat}</th>}
                  <td className="border border-gray-300 px-2 py-1">{c.label}</td>
                  <td className="num w-16 border border-gray-300 text-center">{fmtScore(ev.items[c.id] ?? null) || <span className="text-amber-600">미입력</span>}<span className="text-gray-400">/{c.max}</span></td>
                  {k === 0 && <td rowSpan={items.length} className="num w-14 border border-gray-300 text-center font-semibold">{fmtScore(s.subtotals[cat])}</td>}
                </tr>
              ))
            })}
            <tr className="bg-navy-50"><th colSpan={2} className="border border-gray-300 px-2 py-1 text-right">총점</th>
              <td colSpan={2} className="num border border-gray-300 text-center font-bold">{s.complete ? fmtScore(s.total) : `미완성 ${s.enteredItems}/${data.criteria.length}`}</td></tr>
          </tbody>
        </table>
      )}
      <h4 className="mb-1 mt-4 text-sm font-bold text-navy-800">입력·수정 이력 ({history.length}건)</h4>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-xs">
          <thead><tr className="bg-gray-50 text-left"><th className="px-2 py-1">일시</th><th className="px-2">항목</th><th className="px-2">변경 전</th><th className="px-2">변경 후</th><th className="px-2">비고</th></tr></thead>
          <tbody>
            {history.slice().reverse().map((e, i) => (
              <tr key={i} className="border-t">
                <td className="num px-2 py-1">{kst(e.at)}</td><td className="px-2">{label(e.field)}</td>
                <td className="num px-2">{e.before ?? '(미입력)'}</td><td className="num px-2">{e.after ?? '(미입력)'}</td><td className="px-2">{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-right"><Button onClick={onClose}>닫기</Button></div>
    </Modal>
  )
}
