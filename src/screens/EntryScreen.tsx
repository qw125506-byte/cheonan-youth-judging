import { useState } from 'react'
import { useApp } from '../components/ctx'
import ScoreInput from '../components/ScoreInput'
import { Button, Card, Notice, kst } from '../components/ui'
import { categoriesOf, evalKey, fmtScore, summarizeEvaluation } from '../lib/calc'
import { clearScores, enteredSinceReset, resetEvaluation, restoreLastReset, setItemScore } from '../lib/store'
import type { AppData } from '../lib/types'

function statusText(data: AppData, judgeId: string, no: number) {
  const ev = data.evaluations[evalKey(judgeId, no)]
  const s = summarizeEvaluation(ev, data.criteria)
  if (!ev) return { text: '미입력', cls: 'text-gray-400' }
  if (ev.mode === 'total') return { text: `총점입력 ${fmtScore(ev.total)}`, cls: 'text-violet-700' }
  if (s.complete) return { text: `완료 ${fmtScore(s.total)}`, cls: 'text-emerald-700' }
  return { text: `작성중 ${s.enteredItems}/${data.criteria.length}`, cls: 'text-amber-700' }
}

export default function EntryScreen() {
  const { data } = useApp()
  const [judgeId, setJudgeId] = useState(data.judges[0].id)
  const [view, setView] = useState<'single' | 'batch'>('single')

  return (
    <div className="space-y-4">
      <Card
        title="심사위원 선택"
        right={
          <div className="flex rounded border border-gray-300 text-sm" role="tablist">
            <button role="tab" aria-selected={view === 'single'} className={`px-3 py-1.5 ${view === 'single' ? 'bg-navy-700 text-white' : ''}`} onClick={() => setView('single')}>한 건씩 입력</button>
            <button role="tab" aria-selected={view === 'batch'} className={`px-3 py-1.5 ${view === 'batch' ? 'bg-navy-700 text-white' : ''}`} onClick={() => setView('batch')}>14건 일괄입력</button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {data.judges.map((j, i) => {
            const done = data.proposals.filter((p) => summarizeEvaluation(data.evaluations[evalKey(j.id, p.no)], data.criteria).complete).length
            return (
              <button key={j.id} onClick={() => setJudgeId(j.id)}
                className={`rounded border px-3 py-2 text-left ${judgeId === j.id ? 'border-navy-700 bg-navy-700 text-white' : 'border-gray-300 bg-white hover:border-navy-600'}`}>
                <div className="text-xs opacity-75">위원{i + 1}</div>
                <div className="font-bold">{j.name}</div>
                <div className="num text-xs opacity-80">{done}/{data.proposals.length}건 완료</div>
              </button>
            )
          })}
        </div>
        {data.finalized && <div className="mt-3"><Notice kind="warn">결과가 확정되어 점수가 잠겨 있습니다(조회만 가능).</Notice></div>}
        <ResetButtons judgeId={judgeId} />
      </Card>
      {view === 'single' ? <SingleEntry judgeId={judgeId} /> : <BatchEntry judgeId={judgeId} />}
    </div>
  )
}

/** 점수 초기화: 선택한 위원 / 전체 위원. 위원·제안 정보와 설정은 그대로 둔다. */
function ResetButtons({ judgeId }: { judgeId: string }) {
  const { data, update, notify } = useApp()
  const judge = data.judges.find((j) => j.id === judgeId)!
  const locked = !!data.finalized
  const judgeCount = Object.keys(data.evaluations).filter((k) => k.startsWith(`${judgeId}:`)).length
  const allCount = Object.keys(data.evaluations).length
  const label = data.dataMode === 'test' ? '연습' : '실제 심사'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
      <span className="text-xs text-gray-500">입력값 초기화 (위원·제안 정보와 설정은 유지, 수정 이력에 기록)</span>
      <Button className="ml-auto" disabled={locked || judgeCount === 0} onClick={() => {
        if (!confirm(`${judge.name} 위원이 입력한 점수 ${judgeCount}건을 모두 지웁니다.
다른 위원 점수는 그대로입니다. 계속할까요?`)) return
        if (update((d) => clearScores(d, judgeId))) notify(`${judge.name} 위원 점수를 초기화했습니다`)
      }}>{judge.name} 위원 점수 초기화</Button>
      <Button variant="danger" disabled={locked || allCount === 0} onClick={() => {
        if (!confirm(`[${label} 데이터] 위원 6명의 점수 ${allCount}건과 동점 결정을 모두 지웁니다.
먼저 「⑤ 출력·백업」에서 백업 파일을 받아 두는 것을 권장합니다. 계속할까요?`)) return
        if (data.dataMode === 'real' && prompt("실제 심사 점수를 모두 지우려면 '초기화'를 입력하세요") !== '초기화') { notify('초기화를 취소했습니다'); return }
        if (update((d) => clearScores(d))) notify('전체 점수를 초기화했습니다')
      }}>전체 점수 초기화</Button>
      <RestoreButton />
    </div>
  )
}

/** 직전 점수 초기화(위원별·전체) 되돌리기. 보관본은 저장되므로 새로고침 후에도 복구할 수 있다. */
function RestoreButton() {
  const { data, update, notify } = useApp()
  const r = data.lastReset
  if (!r) return null
  const n = Object.keys(r.evaluations).length
  const who = r.judgeId ? `${data.judges.find((j) => j.id === r.judgeId)?.name ?? ''} 위원` : '전체'
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
      <span>직전 초기화: <b>{who} 점수 {n}건</b> ({kst(r.at)})</span>
      <Button variant="primary" className="ml-auto" disabled={!!data.finalized} onClick={() => {
        const since = enteredSinceReset(data)
        const msg = `${who} 점수 ${n}건을 초기화 직전 상태로 되살립니다.` +
          (since ? `\n\n주의: 초기화 이후 ${who === '전체' ? '' : who + '에게 '}새로 입력한 평가 ${since}건은 초기화 직전 점수로 바뀝니다.` : '') +
          '\n계속할까요?'
        if (!confirm(msg)) return
        if (update(restoreLastReset)) notify(`${who} 점수 ${n}건을 복구했습니다`)
      }}>복구</Button>
    </div>
  )
}

function SingleEntry({ judgeId }: { judgeId: string }) {
  const { data, update, notify } = useApp()
  const [no, setNo] = useState(data.proposals[0].no)
  const p = data.proposals.find((x) => x.no === no)!
  const judge = data.judges.find((j) => j.id === judgeId)!
  const ev = data.evaluations[evalKey(judgeId, no)]
  const sum = summarizeEvaluation(ev, data.criteria)
  const cats = categoriesOf(data.criteria)
  const idx = data.proposals.findIndex((x) => x.no === no)
  const locked = !!data.finalized

  const go = (d: number) => {
    const n = data.proposals[idx + d]
    if (n) setNo(n.no)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card title="제안 목록">
        <ol className="-m-2 max-h-[640px] space-y-0.5 overflow-y-auto">
          {data.proposals.map((x) => {
            const st = statusText(data, judgeId, x.no)
            return (
              <li key={x.no}>
                <button onClick={() => setNo(x.no)} className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm ${x.no === no ? 'bg-navy-50 ring-1 ring-navy-600' : 'hover:bg-gray-50'}`}>
                  <span className="num w-5 shrink-0 font-bold text-navy-700">{x.no}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{x.title}</span>
                    <span className={`num text-xs font-medium ${st.cls}`}>{st.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card
        title={<>{judge.name} 위원 · 제안 {p.no}번 심사표</>}
        right={<>
          <Button onClick={() => go(-1)} disabled={idx === 0}>← 이전 제안</Button>
          <Button variant="primary" onClick={() => go(1)} disabled={idx === data.proposals.length - 1}>다음 제안 →</Button>
        </>}
      >
        <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3">
          <div className="text-lg font-bold">{p.title}</div>
          <div className="mt-1 text-sm text-gray-700">{p.summary}</div>
          <div className="mt-1 text-xs text-gray-500">분야 {p.field} · 검토부서 {p.dept}</div>
        </div>

        {ev?.mode === 'total' ? (
          <div className="space-y-3">
            <Notice kind="info">
              이 평가는 <b>총점 직접입력({fmtScore(ev.total)}점)</b>으로 기록되어 있어 세부점수가 없습니다.
              세부항목으로 입력하려면 기존 총점을 삭제해야 합니다.
            </Notice>
            <Button disabled={locked} variant="danger" onClick={() => {
              if (confirm(`총점 ${fmtScore(ev.total)}점을 삭제하고 세부항목 입력으로 전환할까요? (수정 이력에 기록됩니다)`))
                update((d) => resetEvaluation(d, judgeId, no, '세부항목 입력으로 전환'))
            }}>총점 삭제 후 세부항목 입력</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm" key={`${judgeId}:${no}`}>
              <thead>
                <tr className="bg-navy-50 text-navy-900">
                  <th className="border border-gray-300 px-2 py-2">심사항목</th>
                  <th className="border border-gray-300 px-2 py-2">심사요소</th>
                  <th className="w-14 border border-gray-300 px-2 py-2">배점</th>
                  <th className="w-20 border border-gray-300 px-2 py-2">점수</th>
                  <th className="w-16 border border-gray-300 px-2 py-2">소계</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat) => {
                  const items = data.criteria.filter((c) => c.category === cat)
                  const catMax = items.reduce((a, c) => a + c.max, 0)
                  return items.map((c, k) => {
                    const row = data.criteria.indexOf(c)
                    return (
                      <tr key={c.id}>
                        {k === 0 && (
                          <th rowSpan={items.length} className="border border-gray-300 bg-gray-50 px-2 py-2 font-semibold">
                            {cat}<div className="num text-xs font-normal text-gray-500">({catMax}점)</div>
                          </th>
                        )}
                        <td className="border border-gray-300 px-2 py-2">{c.label}</td>
                        <td className="num border border-gray-300 px-2 text-center">{c.max}</td>
                        <td className="border border-gray-300 px-2 py-1 text-center">
                          <ScoreInput grid="single" row={row} col={0} value={ev?.items[c.id] ?? null} max={c.max}
                            allowDecimal={data.settings.allowDecimal} disabled={locked} title={`${c.label} (${c.max}점)`}
                            onCommit={(v) => update((d) => setItemScore(d, judgeId, no, c.id, v))} />
                        </td>
                        {k === 0 && (
                          <td rowSpan={items.length} className="num border border-gray-300 px-2 text-center font-semibold">
                            {sum.subtotals[cat] === null ? <span className="text-gray-300">-</span> : fmtScore(sum.subtotals[cat])}
                          </td>
                        )}
                      </tr>
                    )
                  })
                })}
                <tr className="bg-navy-50">
                  <th colSpan={2} className="border border-gray-300 px-2 py-2 text-right">계</th>
                  <td className="num border border-gray-300 text-center font-semibold">100</td>
                  <td colSpan={2} className="num border border-gray-300 px-2 py-2 text-center text-xl font-bold text-navy-800">
                    {sum.complete ? `${fmtScore(sum.total)}점` : <span className="text-sm font-medium text-amber-700">미완성 ({sum.enteredItems}/{data.criteria.length})</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>Enter·↓ 다음 항목, ↑ 이전 항목, Esc 입력 취소. 입력값은 즉시 자동 저장됩니다.</span>
          {ev && ev.mode === 'detail' && (
            <Button className="ml-auto" disabled={locked} onClick={() => {
              if (confirm(`${judge.name} 위원의 제안 ${no}번 입력값을 모두 지울까요? (수정 이력에 기록됩니다)`)) {
                update((d) => resetEvaluation(d, judgeId, no, '평가 초기화'))
                notify(`제안 ${no}번 평가를 초기화했습니다`)
              }
            }}>이 평가 초기화</Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function BatchEntry({ judgeId }: { judgeId: string }) {
  const { data, update } = useApp()
  const judge = data.judges.find((j) => j.id === judgeId)!
  const locked = !!data.finalized

  return (
    <Card title={<>{judge.name} 위원 · 14건 일괄입력</>} right={<span className="text-xs text-gray-500">종이 심사표 한 장 = 한 행. Enter로 오른쪽 칸 → 행 끝에서 다음 제안으로 이동</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="bg-navy-50 text-navy-900">
              <th rowSpan={2} className="border border-gray-300 px-1 py-1">번호</th>
              <th rowSpan={2} className="border border-gray-300 px-2 py-1">제안명</th>
              {categoriesOf(data.criteria).map((cat) => (
                <th key={cat} colSpan={data.criteria.filter((c) => c.category === cat).length} className="border border-gray-300 px-1 py-1">{cat}</th>
              ))}
              <th rowSpan={2} className="border border-gray-300 px-2 py-1">총점</th>
            </tr>
            <tr className="bg-navy-50 text-xs text-navy-900">
              {data.criteria.map((c) => (
                <th key={c.id} title={c.label} className="border border-gray-300 px-1 py-1 font-normal">
                  <span className="line-clamp-2 max-w-24">{c.label}</span><span className="num font-bold">({c.max})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.proposals.map((p, ri) => {
              const ev = data.evaluations[evalKey(judgeId, p.no)]
              const s = summarizeEvaluation(ev, data.criteria)
              const isTotal = ev?.mode === 'total'
              return (
                <tr key={p.no} className="even:bg-gray-50/60">
                  <td className="num border border-gray-300 text-center font-bold text-navy-700">{p.no}</td>
                  <td className="border border-gray-300 px-2"><span className="line-clamp-2 max-w-64" title={p.title}>{p.title}</span></td>
                  {isTotal ? (
                    <td colSpan={data.criteria.length} className="border border-gray-300 px-2 text-center text-violet-700">
                      총점 직접입력으로 기록됨 — 세부점수 없음 (한 건씩 입력 화면에서 전환 가능)
                    </td>
                  ) : data.criteria.map((c, ci) => (
                    <td key={c.id} className="border border-gray-300 px-0.5 py-0.5 text-center">
                      <ScoreInput grid={`batch-${judgeId}`} row={ri} col={ci} enterAxis="right" value={ev?.items[c.id] ?? null}
                        max={c.max} allowDecimal={data.settings.allowDecimal} disabled={locked} className="w-12"
                        title={`제안${p.no} ${c.label} (${c.max}점)`}
                        onCommit={(v) => update((d) => setItemScore(d, judgeId, p.no, c.id, v))} />
                    </td>
                  ))}
                  <td className={`num border border-gray-300 px-2 text-center font-bold ${s.complete ? 'text-navy-800' : 'text-amber-700'}`}>
                    {s.complete ? fmtScore(s.total) : isTotal ? '' : `${s.enteredItems}/${data.criteria.length}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
