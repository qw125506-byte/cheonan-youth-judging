import { useState } from 'react'
import { useApp } from '../components/ctx'
import { AwardBadge, Button, Card, Modal, Notice, kst } from '../components/ui'
import { fmt2, fmtScore, verifyResults, type TieGroup } from '../lib/calc'
import { logSystem, nowIso } from '../lib/store'
import type { FinalResultRow } from '../lib/types'

export default function FinalScreen() {
  const { data, results, update, notify } = useApp()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const verifyOk = verifyResults(data, results).every((v) => v.ok)
  const canFinalize = results.allComplete && results.unresolvedTies.length === 0 && verifyOk && !data.finalized
  const proposalOf = (no: number) => data.proposals.find((p) => p.no === no)!

  // 확정 후 현재 계산과 확정 당시 결과가 다른지(정상이라면 잠금으로 같아야 함)
  const drift = data.finalized && data.finalized.rows.some((fr) => {
    const r = results.rows.find((x) => x.no === fr.no)
    return !r || r.award !== fr.award || r.position !== fr.position
  })

  return (
    <div className="space-y-4">
      {!results.allComplete && <Notice kind="warn">전체 {data.judges.length * data.proposals.length}건 평가 입력이 끝나지 않아 아래 순위·수상은 <b>잠정</b>입니다. 입력 완료 전에는 최종 확정할 수 없습니다.</Notice>}
      {results.unresolvedTies.length > 0 && (
        <Notice kind="warn">수상 등급 경계에 동점이 있어 자동으로 수상자를 확정하지 않습니다. 아래 「동점 처리」에서 위원회 결정 결과와 사유를 기록하세요.</Notice>
      )}
      {drift && <Notice kind="error">확정 당시 결과와 현재 계산이 다릅니다. 확정 이후 데이터가 변경되었는지 수정 이력을 확인하세요.</Notice>}

      <TiePanel />

      <Card
        title="최종 순위 및 수상자"
        right={data.finalized ? (
          <>
            <span className="text-sm text-emerald-700">확정 {kst(data.finalized.at)} · {data.finalized.by}</span>
            <Button variant="danger" onClick={() => setUnlockOpen(true)}>확정 해제</Button>
          </>
        ) : (
          <Button variant="primary" disabled={!canFinalize} onClick={() => setConfirmOpen(true)}
            title={canFinalize ? '' : '전체 입력 완료·검증 통과·동점 결정 후 가능합니다'}>
            심사결과 확정
          </Button>
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="bg-navy-50 text-navy-900">
                <th className="border border-gray-300 px-2 py-2">순위</th>
                <th className="border border-gray-300 px-2">제안번호</th>
                <th className="border border-gray-300 px-2">제안명</th>
                <th className="border border-gray-300 px-2">검토부서</th>
                <th className="border border-gray-300 px-2">최종 평균</th>
                <th className="border border-gray-300 px-2">선정 등급</th>
                <th className="border border-gray-300 px-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {results.rows.map((r) => {
                const awarded = ['최우수', '우수', '장려'].includes(r.award)
                return (
                  <tr key={r.no} className={`${awarded ? 'bg-navy-50/40' : ''} ${r.needsDecision ? 'bg-amber-50' : ''}`}>
                    <td className="num border border-gray-300 px-2 py-2 text-center text-base font-bold">
                      {r.position === null ? '-' : r.decided ? r.position : r.tieSize > 1 ? `공동 ${r.rank}` : r.rank}
                    </td>
                    <td className="num border border-gray-300 text-center">{r.no}</td>
                    <td className="border border-gray-300 px-2">{r.title}</td>
                    <td className="border border-gray-300 px-2 text-center">{proposalOf(r.no).dept}</td>
                    <td className="num border border-gray-300 px-2 text-center text-base font-bold text-navy-800">{fmt2(r.agg.avg)}</td>
                    <td className="border border-gray-300 px-2 text-center"><AwardBadge award={r.award} provisional={!results.allComplete} /></td>
                    <td className="border border-gray-300 px-2 text-xs text-gray-600">
                      {r.decided ? `동점 기준으로도 같음(공동 ${r.rank}위) → 위원회 결정` : r.needsDecision ? '동점 기준으로도 같음 — 위원회 결정 필요' : r.tieSize > 1 ? '공동순위(등급 영향 없음)' : ''}
                      {r.brokenBy && r.avgTieSize > 1 && <div>평균 동점({r.avgTieSize}건) → {r.brokenBy}로 결정</div>}
                      {r.avgTieSize > 1 && r.tieBreak && <div className="num text-gray-500">실시가능성 {fmtScore(r.tieBreak[0])} · 효율성 {fmtScore(r.tieBreak[1])}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">선정 기준: 1위 최우수(1명), 2~3위 우수(2명), 4~6위 장려(3명), 7위 이하 미선정. 최종 평균이 같으면 ① 실시가능성 합계(위원 6명 소계 합) ② 효율성(경제성) 합계가 높은 순으로 순위를 정하고, 그래도 같으면 공동순위로 두고 수상 등급 경계에 걸치면 위원회가 결정합니다.</p>
      </Card>

      {confirmOpen && <FinalizeModal onClose={() => setConfirmOpen(false)} onConfirm={(by) => {
        const rows: FinalResultRow[] = results.rows.map((r) => ({ no: r.no, title: r.title, avg: r.agg.avg!, position: r.position!, rank: r.rank!, award: r.award }))
        if (update((d) => logSystem({ ...d, finalized: { at: nowIso(), by, rows } }, `심사결과 확정 (확정자: ${by})`))) notify('심사결과를 확정했습니다. 점수가 잠깁니다.')
        setConfirmOpen(false)
      }} />}
      {unlockOpen && <UnlockModal onClose={() => setUnlockOpen(false)} onConfirm={(reason) => {
        update((d) => logSystem({ ...d, finalized: null }, `확정 해제 — 사유: ${reason} (확정 당시: ${kst(d.finalized!.at)} ${d.finalized!.by})`))
        notify('확정을 해제했습니다. 수정 내용은 이력에 남습니다.')
        setUnlockOpen(false)
      }} />}
    </div>
  )
}

function TiePanel() {
  const { data, results } = useApp()
  const relevant = results.tieGroups.filter((g) => g.crossesBoundary)
  const other = results.tieGroups.filter((g) => !g.crossesBoundary)
  if (results.tieGroups.length === 0) return null
  return (
    <Card title="동점 처리">
      {other.length > 0 && (
        <p className="mb-3 text-sm text-gray-600">
          등급에 영향 없는 동점: {other.map((g) => `제안 ${g.nos.join('·')} (${fmt2(g.avg)}점, 공동 ${g.start}위)`).join(', ')} — 공동순위로 표시하며 별도 결정이 필요 없습니다.
        </p>
      )}
      <div className="space-y-3">
        {relevant.map((g) => <TieDecisionEditor key={g.key} group={g} locked={!!data.finalized} />)}
      </div>
    </Card>
  )
}

function TieDecisionEditor({ group, locked }: { group: TieGroup; locked: boolean }) {
  const { data, update, notify } = useApp()
  const [order, setOrder] = useState<number[]>(group.decision?.order ?? group.nos)
  const [reason, setReason] = useState(group.decision?.reason ?? '')
  const title = (no: number) => data.proposals.find((p) => p.no === no)!.title
  const move = (i: number, d: number) => {
    const o = [...order]
    ;[o[i], o[i + d]] = [o[i + d], o[i]]
    setOrder(o)
  }

  return (
    <div className={`rounded border p-3 ${group.decision ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/50'}`}>
      <div className="mb-2 text-sm font-semibold">
        공동 {group.start}위 · 평균 {fmt2(group.avg)}점 · 제안 {group.nos.join(', ')} — 정렬 {group.start}~{group.end}위가 수상 등급 경계에 걸침
        <div className="mt-0.5 text-xs font-normal text-gray-600">
          {group.tieBreak
            ? `실시가능성 합계(${fmtScore(group.tieBreak[0])})와 효율성(경제성) 합계(${fmtScore(group.tieBreak[1])})까지 같아 기준으로 가릴 수 없습니다.`
            : '총점 직접입력(세부점수 없음) 평가가 있어 실시가능성·효율성 합계 기준을 적용할 수 없습니다.'}
        </div>
        {group.decision && <span className="ml-2 text-emerald-700">위원회 결정 기록됨 ({kst(group.decision.at)})</span>}
      </div>
      <ol className="space-y-1">
        {order.map((no, i) => (
          <li key={no} className="flex items-center gap-2 rounded bg-white px-2 py-1 text-sm">
            <span className="num w-10 font-bold">{group.start + i}위</span>
            <span className="num w-14 text-navy-700">제안 {no}</span>
            <span className="min-w-0 flex-1 truncate">{title(no)}</span>
            <Button disabled={locked || i === 0} onClick={() => move(i, -1)} aria-label="위로">▲</Button>
            <Button disabled={locked || i === order.length - 1} onClick={() => move(i, 1)} aria-label="아래로">▼</Button>
          </li>
        ))}
      </ol>
      <label className="mt-2 block text-sm">
        결정 사유(필수)
        <textarea value={reason} disabled={locked} onChange={(e) => setReason(e.target.value)} rows={2}
          placeholder="예: 심사위원회 협의 결과 창의성 항목 평균이 높은 제안을 상위로 결정"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
      </label>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" disabled={locked || !reason.trim()} onClick={() => {
          update((d) => logSystem({ ...d, tieDecisions: { ...d.tieDecisions, [group.key]: { order, reason: reason.trim(), at: nowIso() } } },
            `동점 처리 결정: 제안 ${order.join('→')} / 사유: ${reason.trim()}`))
          notify('동점 처리 결정을 기록했습니다')
        }}>결정 저장</Button>
        {group.decision && (
          <Button disabled={locked} onClick={() => {
            update((d) => {
              const t = { ...d.tieDecisions }
              delete t[group.key]
              return logSystem({ ...d, tieDecisions: t }, `동점 처리 결정 취소: 제안 ${group.nos.join(',')}`)
            })
          }}>결정 취소</Button>
        )}
      </div>
    </div>
  )
}

function FinalizeModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (by: string) => void }) {
  const [by, setBy] = useState('')
  return (
    <Modal title="심사결과 확정" onClose={onClose}>
      <p className="text-sm">확정하면 모든 점수 입력·수정이 잠기고 확정 일시가 기록됩니다. 이후 수정은 관리자가 사유를 남기고 확정을 해제해야 가능합니다.</p>
      <label className="mt-3 block text-sm">확정자(성명·직위)
        <input value={by} onChange={(e) => setBy(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="예: 청년정책팀장 ○○○" autoFocus />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>취소</Button>
        <Button variant="primary" disabled={!by.trim()} onClick={() => onConfirm(by.trim())}>확정</Button>
      </div>
    </Modal>
  )
}

function UnlockModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const [word, setWord] = useState('')
  return (
    <Modal title="확정 해제(관리자)" onClose={onClose}>
      <Notice kind="warn">확정된 심사결과의 잠금을 풉니다. 해제 사유와 일시가 수정 이력에 남습니다.</Notice>
      <label className="mt-3 block text-sm">해제 사유(필수)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
      </label>
      <label className="mt-2 block text-sm">확인을 위해 <b>확정해제</b>를 입력하세요
        <input value={word} onChange={(e) => setWord(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>취소</Button>
        <Button variant="danger" disabled={!reason.trim() || word !== '확정해제'} onClick={() => onConfirm(reason.trim())}>확정 해제</Button>
      </div>
    </Modal>
  )
}
