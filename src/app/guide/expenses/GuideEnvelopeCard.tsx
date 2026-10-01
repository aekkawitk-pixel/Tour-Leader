'use client';

/**
 * ซองเงินของกรุ๊ป — ฝั่งหัวหน้าทัวร์ · รับซองที่รายละเอียดงาน (mode 'receive') · ใช้ซองที่หน้าบันทึกใบเสร็จ (mode 'use')
 *
 * หลักการถือเงิน: การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → (ส่งให้แลนด์ต่างประเทศ | ใช้ตามรายการ)
 * ซองเป็นของกรุ๊ป — การเงินอาจรวมทุกเอกสารในซองเดียว หรือแยกหลายซอง (เช่น ซองค่าแลนด์ / ซองทิป) · ยืนยันรับทีละซอง
 * - ส่งมอบแล้ว → หัวหน้าทัวร์กด "ยืนยันการรับ" (ระบุว่ารับต่อจากเจ้าหน้าที่คนไหน) = หลักฐานทอดที่สาม · ไม่บังคับแนบรูป
 * - รับแล้ว → เห็นยอดคงเหลือในซอง · บันทึก "ส่งเงินให้แลนด์" (ชื่อแลนด์ ยอด สกุลเงิน)
 *   รูปใบรับเงิน/หลักฐานจากแลนด์ไม่บังคับ — แนบตอนบันทึก หรือกด "แนบหลักฐาน" ภายหลังก็ได้
 *   ใช้ตามรายการ = บันทึกใบเสร็จตามปกติ ยอดถูกหักจากซองให้อัตโนมัติ
 * - เปิดใช้แล้วยอดในซองไม่ตรงหน้าซอง → "แจ้งยอดในซองไม่ตรง" การเงินเห็นทันที (ไม่มีการนับซ้ำตอนรับ)
 */

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { TextArea, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency, formatDateTime, toISODateTime } from '@/lib/format';
import { compressImageToDataUrl } from '@/lib/image/compressImage';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { envelopeBalance, envelopeName, handoverReceiverText, envelopeStage, groupEnvelopeStatus, groupLines, sumAmounts, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { EnvelopeStatusBadge, StatusPill, spentByReceipts } from '@/components/expenses/CashEnvelopeDrawer';
import { PhotoConfirmModal, ProofThumb } from '@/components/expenses/EnvelopeProofPhoto';

/**
 * mode
 * - 'receive' (รายละเอียดงาน /guide/jobs/[id]) — ขั้นตอนรับซอง: ยืนยันการรับ + แนบรูปซองที่ได้รับ (ไม่บังคับ)
 * - 'use' (หน้าบันทึกค่าใช้จ่าย) — ใช้เงินในซอง: ยอดคงเหลือ · ส่งเงินให้แลนด์ · แจ้งยอดไม่ตรง
 *   ซองที่ยังไม่ยืนยันรับ มีลิงก์พาไปยืนยันที่รายละเอียดงาน
 */
export function GuideEnvelopeCard({ periodId, mode }: { periodId: string; mode: 'receive' | 'use' }) {
  const receiving = mode === 'receive';
  const { expenses, envelopes, saveEnvelope, currentUser, leaders } = useDemo();
  const [landOpen, setLandOpen] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  /** ซองที่กำลังยืนยันรับ — ยืนยันอย่างเดียว ไม่บังคับแนบรูป */
  const [ackTarget, setAckTarget] = useState<CashEnvelope | null>(null);
  /** รายการส่งแลนด์ที่กำลังแนบหลักฐานภายหลัง */
  const [proofTarget, setProofTarget] = useState<{ env: CashEnvelope; paymentId: string } | null>(null);
  /** ซองที่รับแล้ว กำลังแนบรูปหลักฐานการรับภายหลัง */
  const [ackPhotoTarget, setAckPhotoTarget] = useState<CashEnvelope | null>(null);
  /** ซองที่กำลังส่งต่อให้คนอื่น — บังคับรูป + ชื่อผู้รับ */
  const [forwardTarget, setForwardTarget] = useState<CashEnvelope | null>(null);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardNote, setForwardNote] = useState('');
  const docs =expenses.filter((e) => isGroupAdvanceDoc(e) && e.jobId === periodId);
  if (docs.length === 0) return null;

  const all = envelopes.filter((e) => e.periodId === periodId && e.packedLineIds.length > 0).sort((a, b) => a.no - b.no);
  // หัวหน้าทัวร์เห็นเฉพาะซองที่การเงินปิดแล้ว (ยอดหน้าซองนิ่งแล้ว)
  const envs = all.filter((e) => e.sealed);
  const status = groupEnvelopeStatus(groupLines(docs), all);
  const received = envs.filter((e) => e.leaderAck);
  const leader = leaders.find((l) => l.id === currentUser.leaderId);
  const leaderName = leader ? `${leader.firstName} ${leader.lastName}`.trim() : currentUser.name;

  const face = sumAmounts(received.flatMap((e) => e.sealed!.faceTotals));
  const landList = received.flatMap((e) => (e.landPayments ?? []).map((lp) => ({ ...lp, env: e, envName: envelopeName(e) })));
  const land = sumAmounts(landList.map((l) => ({ amount: l.amount, currency: l.currency })));
  /** ซองที่รับแล้วและยังไม่ได้ส่งให้แลนด์ (ส่งทั้งซองครั้งเดียว) */
  const landable = received.filter((e) => !e.landPayments?.length);
  const spent = spentByReceipts(expenses, periodId, currentUser.leaderId);
  const balance = envelopeBalance(face, land, spent);

  // คนที่ถือซองมาให้ = ผู้รับแทน (ถ้ามี) หรือเจ้าหน้าที่ที่ระบุไว้
  const fromStaffOf = (env: CashEnvelope) => env.handover?.proxyName ?? (env.handover?.receiverKind === 'staff' ? env.handover.receiverName : undefined);
  const acknowledge = async (env: CashEnvelope) => {
    const fromStaff = fromStaffOf(env);
    await saveEnvelope(
      { ...env, leaderAck: { at: toISODateTime(new Date()), leaderId: currentUser.leaderId ?? '', leaderName, ...(fromStaff ? { fromStaffName: fromStaff } : {}) } },
      'หัวหน้าทัวร์ยืนยันรับซอง',
      `${envelopeName(env)}${fromStaff ? ` · รับต่อจาก ${fromStaff}` : ''}`,
    );
  };
  /** แนบรูปซองที่ได้รับ ให้ซองที่กดยืนยันรับไปแล้ว (ไม่บังคับ) */
  const attachAckPhoto = async (env: CashEnvelope, photo: string) => {
    if (!env.leaderAck) return;
    await saveEnvelope({ ...env, leaderAck: { ...env.leaderAck, photo } }, 'หัวหน้าทัวร์แนบรูปรับซอง', envelopeName(env), photo);
  };
  /** ส่งต่อซองให้คนอื่น — เก็บชื่อผู้รับ หมายเหตุ และรูปถ่ายตอนส่ง */
  const forward = async (env: CashEnvelope, photo: string) => {
    const toName = forwardTo.trim();
    const note = forwardNote.trim();
    await saveEnvelope(
      { ...env, leaderForward: { at: toISODateTime(new Date()), byName: leaderName, toName, ...(note ? { note } : {}), photo } },
      'หัวหน้าทัวร์ส่งต่อซอง',
      `${envelopeName(env)} · ส่งให้ ${toName}${note ? ` · ${note}` : ''}`,
      photo,
    );
  };
  const openForward = (env: CashEnvelope | null) => {
    setForwardTo('');
    setForwardNote('');
    setForwardTarget(env);
  };
  /** แนบรูปใบรับเงินจากแลนด์ให้รายการส่งแลนด์ที่บันทึกไปแล้ว */
  const attachLandProof = async (env: CashEnvelope, paymentId: string, photo: string) => {
    const lp = env.landPayments?.find((p) => p.id === paymentId);
    if (!lp) return;
    await saveEnvelope(
      { ...env, landPayments: (env.landPayments ?? []).map((p) => (p.id === paymentId ? { ...p, evidenceImage: photo } : p)) },
      'แนบหลักฐานส่งเงินให้แลนด์',
      `${envelopeName(env)} · ${formatCurrency(lp.amount, lp.currency)}`,
      photo,
    );
  };
  // รายการเดิมมีชื่อแลนด์ · รายการใหม่ไม่กรอกชื่อแล้ว
  const landLabel = (lp: { landName: string }) => (lp.landName ? `ส่งแลนด์ ${lp.landName}` : 'ส่งแลนด์');
  const fmt = (list: { amount: number; currency: string }[]) => list.map((f) => formatCurrency(f.amount, f.currency)).join(' · ');

  return (
    <Card className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white">
            <Icon name="money" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold zego-text">ซองเงินของกรุ๊ป{envs.length > 1 ? ` · ${envs.length} ซอง` : ''}</p>
            <p className="text-[11px] zego-text-tertiary">ตามเอกสารเบิก {docs.map((d) => d.id).join(', ')}</p>
          </div>
        </div>
        <StatusPill label={status.label} tone={status.tone} />
      </div>

      {envs.length === 0 ? (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">การเงินกำลังจัดเงินใส่ซอง</p>
      ) : (
        <ul className="space-y-2">
          {envs.map((env) => {
            const stage = envelopeStage(env);
            return (
              <li key={env.id} className="space-y-1.5 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold zego-text">{envelopeName(env)}</span>
                  <EnvelopeStatusBadge env={env} short />
                </div>
                <p className="zego-text-secondary">
                  ยอดหน้าซอง <span className="font-semibold tabular-nums zego-text">{fmt(env.sealed!.faceTotals)}</span>
                </p>
                {/* ประเภท 4 — เงินฝากไปจ่ายแลนด์ของกรุ๊ปอื่น ต้องเห็นชัดว่าไม่ใช่เงินของกรุ๊ปนี้ */}
                {env.kind === 'land_tip' && env.forGroup && (
                  <p className="rounded bg-amber-50 px-2 py-1 font-medium text-amber-900">ฝากจ่ายแลนด์ให้กรุ๊ป {env.forGroup}</p>
                )}
                {env.handover ? (
                  <p className="zego-text-tertiary">
                    {env.handover.receiverKind === 'staff' && env.handover.proxyStaffId ? `การเงินฝากเจ้าหน้าที่ส่งกรุ๊ป ${env.handover.proxyName} นำมาส่งคุณ` : `การเงินส่งมอบให้ ${handoverReceiverText(env.handover)}`} · {formatDateTime(env.handover.at)}
                  </p>
                ) : (
                  <p className="zego-text-tertiary">จัดซองแล้ว — รอส่งมอบ</p>
                )}
                {env.handover?.proxyStaffId && !env.leaderAck && (
                  <p className="zego-text-secondary">
                    {env.staffReturn
                      ? `${env.staffReturn.staffName} ส่งซองคืนการเงินแล้ว (${env.staffReturn.reason}) — รอการเงินส่งมอบใหม่`
                      : env.staffHandoff
                      ? `${env.staffHandoff.staffName} แจ้งว่าส่งซองให้คุณแล้ว · ${formatDateTime(env.staffHandoff.at)}`
                      : env.staffAck
                        ? `${env.staffAck.staffName} รับซองจากการเงินแล้ว กำลังนำมาส่งคุณ`
                        : `รอ ${env.handover.proxyName} รับซองจากการเงิน`}
                  </p>
                )}
                {env.leaderAck && (
                  <p className="zego-text-success">
                    คุณยืนยันรับซองแล้ว · {formatDateTime(env.leaderAck.at)}{' '}
                    <ProofThumb src={env.leaderAck.photo} label={`รับ${envelopeName(env)}`} />
                  </p>
                )}
                {receiving && env.leaderAck && !env.leaderAck.photo && (
                  <button
                    type="button"
                    onClick={() => setAckPhotoTarget(env)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium zego-text-info hover:underline"
                  >
                    <Icon name="camera" className="h-3 w-3" />
                    แนบรูปซองที่ได้รับ (ไม่บังคับ)
                  </button>
                )}
                {env.leaderForward && (
                  <div className="space-y-0.5 rounded bg-sky-50 px-2 py-1.5 text-sky-900">
                    <p>
                      ส่งต่อให้ <span className="font-semibold">{env.leaderForward.toName}</span> · {formatDateTime(env.leaderForward.at)}
                    </p>
                    {env.leaderForward.note && <p className="text-sky-800">{env.leaderForward.note}</p>}
                    <ProofThumb src={env.leaderForward.photo} label={`ส่งต่อ${envelopeName(env)} ให้ ${env.leaderForward.toName}`} />
                  </div>
                )}
                {receiving && env.leaderAck && !env.leaderForward && (
                  <Button variant="secondary" size="sm" className="w-full" icon="camera" onClick={() => openForward(env)}>
                    ส่งต่อซอง
                  </Button>
                )}
                {env.mismatch &&<p className="rounded bg-rose-50 px-2 py-1" style={{ color: '#9f1239' }}>แจ้งยอดไม่ตรงแล้ว · {env.mismatch.note}</p>}
                {/* ซองถูกส่งคืนการเงินระหว่างทาง → ไม่อยู่กับหัวหน้าทัวร์แล้ว ห้ามกดยืนยันรับ */}
                {stage === 'handed_over' && !env.staffReturn && (receiving ? (
                  <Button variant="primary" size="sm" className="w-full" icon="check" onClick={() => setAckTarget(env)}>
                    ยืนยันการรับ
                  </Button>
                ) : (
                  <Link href={`/guide/jobs/${periodId}`} className="inline-flex items-center gap-1 text-[11px] font-medium zego-text-info hover:underline">
                    ยังไม่ได้ยืนยันรับ — ไปยืนยันที่ งานของฉัน
                    <Icon name="chevronRight" className="h-3 w-3" />
                  </Link>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {ackTarget && (
        <AckModal
          title={`ยืนยันรับ${envelopeName(ackTarget)}`}
          face={fmt(ackTarget.sealed?.faceTotals ?? [])}
          fromStaff={fromStaffOf(ackTarget)}
          onClose={() => setAckTarget(null)}
          onConfirm={async () => { await acknowledge(ackTarget); setAckTarget(null); }}
        />
      )}
      {ackPhotoTarget && (
        <PhotoConfirmModal
          title={`แนบรูป${envelopeName(ackPhotoTarget)}`}
          description={`ยอดหน้าซอง ${fmt(ackPhotoTarget.sealed?.faceTotals ?? [])}`}
          confirmLabel="บันทึกรูป"
          photoHint="ถ่ายรูปซองที่ได้รับ ให้เห็นหน้าซองและยอดเงินชัดเจน"
          onClose={() => setAckPhotoTarget(null)}
          onConfirm={async (photo) => { await attachAckPhoto(ackPhotoTarget, photo); setAckPhotoTarget(null); }}
        />
      )}
      {forwardTarget && (
        <PhotoConfirmModal
          title={`ส่งต่อ${envelopeName(forwardTarget)}`}
          description={`ยอดหน้าซอง ${fmt(forwardTarget.sealed?.faceTotals ?? [])}`}
          confirmLabel="ยืนยันส่งต่อ"
          photoHint="ถ่ายรูปซองคู่กับผู้รับ ให้เห็นหน้าซองชัดเจน"
          canConfirm={forwardTo.trim().length > 0}
          onClose={() => openForward(null)}
          onConfirm={async (photo) => { await forward(forwardTarget, photo); openForward(null); }}
        >
          <TextInput label="ส่งให้ใคร" required value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} placeholder="ชื่อผู้รับ เช่น ไกด์ท้องถิ่น / แลนด์" />
          <TextArea label="หมายเหตุ" optional rows={2} value={forwardNote} onChange={(e) => setForwardNote(e.target.value)} />
        </PhotoConfirmModal>
      )}
      {proofTarget && (
        <PhotoConfirmModal
          title="แนบหลักฐานส่งเงินให้แลนด์"
          description={(() => {
            const lp = proofTarget.env.landPayments?.find((p) => p.id === proofTarget.paymentId);
            return lp ? `${landLabel(lp)} · ${formatCurrency(lp.amount, lp.currency)}` : undefined;
          })()}
          confirmLabel="บันทึกหลักฐาน"
          photoHint="ถ่ายรูปใบรับเงิน / หลักฐานการรับเงินจากแลนด์"
          onClose={() => setProofTarget(null)}
          onConfirm={async (photo) => { await attachLandProof(proofTarget.env, proofTarget.paymentId, photo); setProofTarget(null); }}
        />
      )}

      {!receiving && received.length > 0 && (
        <>
          <table className="w-full text-xs tabular-nums">
            <thead className="zego-text-tertiary">
              <tr>
                <th className="py-1 text-left font-medium">สกุลเงิน</th>
                <th className="py-1 text-right font-medium">ส่งแลนด์</th>
                <th className="py-1 text-right font-medium">ใช้ตามใบเสร็จ</th>
                <th className="py-1 text-right font-medium">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {balance.map((b) => (
                <tr key={b.currency} className="zego-divider-top">
                  <td className="py-1">{b.currency}</td>
                  <td className="py-1 text-right">{b.land.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1 text-right">{b.spent.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td className={`py-1 text-right font-semibold ${b.remaining < 0 ? 'zego-text-danger' : 'zego-text-success'}`}>
                    {b.remaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {landList.length > 0 && (
            <ul className="space-y-1.5 text-xs zego-text-secondary">
              {landList.map((lp) => (
                <li key={lp.id} className="space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{landLabel(lp)} · {received.length > 1 ? `${lp.envName} · ` : ''}{formatDateTime(lp.at)}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatCurrency(lp.amount, lp.currency)}</span>
                  </div>
                  {lp.note && <p className="zego-text-tertiary">{lp.note}</p>}
                  {lp.evidenceImage ? (
                    <ProofThumb src={lp.evidenceImage} label={landLabel(lp)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setProofTarget({ env: lp.env, paymentId: lp.id })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium zego-text-info hover:underline"
                    >
                      <Icon name="camera" className="h-3 w-3" />
                      แนบหลักฐาน (ไม่บังคับ)
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="sm" icon="plane" onClick={() => setLandOpen(true)} disabled={landable.length === 0}>ส่งเงินให้แลนด์</Button>
            <Button variant="secondary" size="sm" icon="warning" onClick={() => setMismatchOpen(true)} disabled={received.every((e) => e.mismatch)}>
              แจ้งยอดในซองไม่ตรง
            </Button>
          </div>
          <p className="text-[11px] zego-text-tertiary">ใช้จ่ายตามรายการ = บันทึกใบเสร็จตามปกติ ระบบหักจากยอดในซองให้เอง</p>
        </>
      )}

      {landOpen && (
        <LandPaymentModal
          envelopes={landable}
          fmt={fmt}
          onClose={() => setLandOpen(false)}
          onSave={async (env, p) => {
            // ส่งให้แลนด์ทั้งซอง — ยอด = ยอดหน้าซอง (สกุลละ 1 รายการ)
            const at = toISODateTime(new Date());
            const stamp = Date.now();
            const payments = env.sealed!.faceTotals.map((f, i) => ({ id: `LP-${stamp}-${i}`, at, byName: leaderName, landName: '', amount: f.amount, currency: f.currency, ...p }));
            await saveEnvelope(
              { ...env, landPayments: [...(env.landPayments ?? []), ...payments] },
              'ส่งเงินให้แลนด์',
              `${envelopeName(env)} · ${fmt(env.sealed!.faceTotals)}${p.note ? ` · ${p.note}` : ''}`,
              p.evidenceImage,
            );
            setLandOpen(false);
          }}
        />
      )}
      {mismatchOpen && (
        <MismatchModal
          envelopes={received.filter((e) => !e.mismatch)}
          onClose={() => setMismatchOpen(false)}
          onSave={async (env, note) => {
            await saveEnvelope({ ...env, mismatch: { at: toISODateTime(new Date()), byName: leaderName, note } }, 'แจ้งยอดในซองไม่ตรง', `${envelopeName(env)} · ${note}`);
            setMismatchOpen(false);
          }}
        />
      )}
    </Card>
  );
}

/** ยืนยันรับซอง — ยืนยันอย่างเดียว ไม่ต้องแนบรูป */
function AckModal({
  title,
  face,
  fromStaff,
  onClose,
  onConfirm,
}: {
  title: string;
  face: string;
  fromStaff?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      description={`ยอดหน้าซอง ${face}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button
            variant="primary"
            icon="check"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm();
              } finally {
                setSaving(false);
              }
            }}
          >
            ยืนยันการรับ
          </Button>
        </div>
      }
    >
      <p className="text-sm zego-text-secondary">
        ยืนยันว่าได้รับซองนี้แล้ว{fromStaff ? ` (รับต่อจาก ${fromStaff})` : ''} — หลังยืนยันจึงจะบันทึกรายการจากซองนี้ได้
      </p>
    </Modal>
  );
}

/** เลือกซอง (แสดงเมื่อมีมากกว่า 1 ซอง) */
function EnvelopeSelect({ envelopes, value, onChange }: { envelopes: CashEnvelope[]; value: string; onChange: (id: string) => void }) {
  if (envelopes.length <= 1) return null;
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium zego-text-secondary">จากซอง</span>
      <select className="w-full rounded-lg border zego-border-color px-2 py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {envelopes.map((e) => <option key={e.id} value={e.id}>{envelopeName(e)}</option>)}
      </select>
    </label>
  );
}

/** ส่งซองให้แลนด์ทั้งซอง — กรอกแค่หมายเหตุ + รูปหลักฐาน (ไม่บังคับ) · ยอดใช้ยอดหน้าซอง */
function LandPaymentModal({
  envelopes,
  fmt,
  onClose,
  onSave,
}: {
  envelopes: CashEnvelope[];
  fmt: (list: { amount: number; currency: string }[]) => string;
  onClose: () => void;
  onSave: (env: CashEnvelope, p: { note?: string; evidenceImage?: string }) => Promise<void>;
}) {
  const [envId, setEnvId] = useState(envelopes[0]?.id ?? '');
  const env = envelopes.find((e) => e.id === envId);
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ok = Boolean(env);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="ส่งเงินให้แลนด์ต่างประเทศ"
      description={env ? `${envelopeName(env)} · ยอดหน้าซอง ${fmt(env.sealed?.faceTotals ?? [])}` : undefined}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!ok}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(env!, { ...(note.trim() ? { note: note.trim() } : {}), ...(image ? { evidenceImage: image } : {}) });
              } finally {
                setSaving(false);
              }
            }}
          >
            บันทึก
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <EnvelopeSelect envelopes={envelopes} value={envId} onChange={setEnvId} />
        <TextArea label="หมายเหตุ" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <div>
          <p className="mb-1 text-sm font-medium zego-text-secondary">รูปใบรับเงิน / หลักฐานจากแลนด์ <span className="text-xs zego-text-tertiary">(ไม่บังคับ)</span></p>
          <div className="flex items-center gap-3">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="หลักฐาน" className="h-16 w-16 rounded border zego-border-color object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded border border-dashed zego-border-color text-[11px] zego-text-tertiary">ไม่มีรูป</span>
            )}
            <Button variant="secondary" size="sm" icon="camera" onClick={() => fileRef.current?.click()}>ถ่าย/เลือกรูป</Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setImage(await compressImageToDataUrl(f));
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

function MismatchModal({
  envelopes,
  onClose,
  onSave,
}: {
  envelopes: CashEnvelope[];
  onClose: () => void;
  onSave: (env: CashEnvelope, note: string) => Promise<void>;
}) {
  const [envId, setEnvId] = useState(envelopes[0]?.id ?? '');
  const env = envelopes.find((e) => e.id === envId);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="แจ้งยอดในซองไม่ตรง"
      description="ยอดเงินในซองไม่ตรงกับยอดหน้าซอง — การเงินจะเห็นทันที"
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={!env || !note.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(env!, note.trim());
              } finally {
                setSaving(false);
              }
            }}
          >
            ส่งแจ้งการเงิน
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
      <EnvelopeSelect envelopes={envelopes} value={envId} onChange={setEnvId} />
      <TextArea
        label="รายละเอียด"
        required
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="เช่น ยอดจริง 1,576,607 เยน ขาด 10,000 เยน (ธนบัตร 10,000 เยน 1 ใบ)"
      />
      </div>
    </Modal>
  );
}
