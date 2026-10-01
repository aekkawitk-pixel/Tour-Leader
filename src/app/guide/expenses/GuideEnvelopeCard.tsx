'use client';

/**
 * ซองเงินของกรุ๊ป — ฝั่งหัวหน้าทัวร์ (หน้าบันทึกใบเสร็จ เมื่อเลือกกรุ๊ปแล้ว)
 *
 * หลักการถือเงิน: การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → (ส่งให้แลนด์ต่างประเทศ | ใช้ตามรายการ)
 * ซองเป็นของกรุ๊ป — การเงินอาจรวมทุกเอกสารในซองเดียว หรือแยกหลายซอง (เช่น ซองค่าแลนด์ / ซองทิป) · ยืนยันรับทีละซอง
 * - ส่งมอบแล้ว → หัวหน้าทัวร์กด "ยืนยันรับซองแล้ว" (ระบุว่ารับต่อจากเจ้าหน้าที่คนไหน) = หลักฐานทอดที่สาม
 * - รับแล้ว → เห็นยอดคงเหลือในซอง · บันทึก "ส่งเงินให้แลนด์" (ชื่อแลนด์ ยอด สกุลเงิน รูปใบรับเงิน)
 *   ใช้ตามรายการ = บันทึกใบเสร็จตามปกติ ยอดถูกหักจากซองให้อัตโนมัติ
 * - เปิดใช้แล้วยอดในซองไม่ตรงหน้าซอง → "แจ้งยอดในซองไม่ตรง" การเงินเห็นทันที (ไม่มีการนับซ้ำตอนรับ)
 */

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

export function GuideEnvelopeCard({ periodId }: { periodId: string }) {
  const { expenses, envelopes, saveEnvelope, currentUser, leaders, master } = useDemo();
  const [landOpen, setLandOpen] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  /** ซองที่กำลังยืนยันรับ — ต้องแนบรูปถ่ายหลักฐานก่อนกดยืนยัน */
  const [ackTarget, setAckTarget] = useState<CashEnvelope | null>(null);
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
  const landList = received.flatMap((e) => (e.landPayments ?? []).map((lp) => ({ ...lp, envName: envelopeName(e) })));
  const land = sumAmounts(landList.map((l) => ({ amount: l.amount, currency: l.currency })));
  const spent = spentByReceipts(expenses, periodId, currentUser.leaderId);
  const balance = envelopeBalance(face, land, spent);

  const acknowledge = async (env: CashEnvelope, photo: string) => {
    // คนที่ถือซองมาให้ = ผู้รับแทน (ถ้ามี) หรือเจ้าหน้าที่ที่ระบุไว้
    const fromStaff = env.handover?.proxyName ?? (env.handover?.receiverKind === 'staff' ? env.handover.receiverName : undefined);
    await saveEnvelope(
      { ...env, leaderAck: { at: toISODateTime(new Date()), leaderId: currentUser.leaderId ?? '', leaderName, photo, ...(fromStaff ? { fromStaffName: fromStaff } : {}) } },
      'หัวหน้าทัวร์ยืนยันรับซอง',
      `${envelopeName(env)}${fromStaff ? ` · รับต่อจาก ${fromStaff}` : ''}`,
      photo,
    );
  };
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
                {env.mismatch && <p className="rounded bg-rose-50 px-2 py-1" style={{ color: '#9f1239' }}>แจ้งยอดไม่ตรงแล้ว · {env.mismatch.note}</p>}
                {/* ซองถูกส่งคืนการเงินระหว่างทาง → ไม่อยู่กับหัวหน้าทัวร์แล้ว ห้ามกดยืนยันรับ */}
                {stage === 'handed_over' && !env.staffReturn && (
                  <Button variant="primary" size="sm" className="w-full" icon="camera" onClick={() => setAckTarget(env)}>
                    ยืนยันรับ{envelopeName(env)}{env.handover!.proxyName ? ` (รับจาก ${env.handover!.proxyName})` : env.handover!.receiverKind === 'staff' ? ` (จาก ${env.handover!.receiverName})` : ''} · แนบรูป
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ackTarget && (
        <PhotoConfirmModal
          title={`ยืนยันรับ${envelopeName(ackTarget)}`}
          description={`ยอดหน้าซอง ${fmt(ackTarget.sealed?.faceTotals ?? [])}`}
          confirmLabel="ยืนยันรับซอง"
          photoHint="ถ่ายรูปซองที่ได้รับ ให้เห็นหน้าซองและยอดเงินชัดเจน"
          onClose={() => setAckTarget(null)}
          onConfirm={async (photo) => { await acknowledge(ackTarget, photo); setAckTarget(null); }}
        />
      )}

      {received.length > 0 && (
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
            <ul className="space-y-0.5 text-xs zego-text-secondary">
              {landList.map((lp) => (
                <li key={lp.id} className="flex justify-between gap-2">
                  <span className="truncate">ส่งแลนด์ {lp.landName} · {received.length > 1 ? `${lp.envName} · ` : ''}{formatDateTime(lp.at)}</span>
                  <span className="shrink-0 font-medium tabular-nums">{formatCurrency(lp.amount, lp.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="sm" icon="plane" onClick={() => setLandOpen(true)}>ส่งเงินให้แลนด์</Button>
            <Button variant="secondary" size="sm" icon="warning" onClick={() => setMismatchOpen(true)} disabled={received.every((e) => e.mismatch)}>
              แจ้งยอดในซองไม่ตรง
            </Button>
          </div>
          <p className="text-[11px] zego-text-tertiary">ใช้จ่ายตามรายการ = บันทึกใบเสร็จตามปกติ ระบบหักจากยอดในซองให้เอง</p>
        </>
      )}

      {landOpen && (
        <LandPaymentModal
          envelopes={received}
          currencies={[...new Set([...face.map((f) => f.currency), ...master.currencies.filter((c) => c.active).map((c) => c.code)])]}
          onClose={() => setLandOpen(false)}
          onSave={async (env, p) => {
            await saveEnvelope(
              { ...env, landPayments: [...(env.landPayments ?? []), { id: `LP-${Date.now()}`, at: toISODateTime(new Date()), byName: leaderName, ...p }] },
              'ส่งเงินให้แลนด์',
              `${envelopeName(env)} · ${p.landName} · ${formatCurrency(p.amount, p.currency)}`,
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

function LandPaymentModal({
  envelopes,
  currencies,
  onClose,
  onSave,
}: {
  envelopes: CashEnvelope[];
  currencies: string[];
  onClose: () => void;
  onSave: (env: CashEnvelope, p: { landName: string; amount: number; currency: string; note?: string; evidenceImage?: string }) => Promise<void>;
}) {
  const [envId, setEnvId] = useState(envelopes[0]?.id ?? '');
  const env = envelopes.find((e) => e.id === envId);
  const [landName, setLandName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(currencies[0] ?? 'THB');
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const amt = Number(amount);
  const ok = env && landName.trim() && amt > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="ส่งเงินให้แลนด์ต่างประเทศ"
      description="บันทึกยอดที่นำออกจากซองส่งให้แลนด์ พร้อมหลักฐาน"
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
                await onSave(env!, { landName: landName.trim(), amount: amt, currency, ...(note.trim() ? { note: note.trim() } : {}), ...(image ? { evidenceImage: image } : {}) });
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
        <TextInput label="ชื่อแลนด์ / บริษัทรับจัด" value={landName} onChange={(e) => setLandName(e.target.value)} placeholder="เช่น Osaka Land Co., Ltd." />
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <TextInput label="ยอดเงิน" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium zego-text-secondary">สกุลเงิน</span>
            <select className="w-full rounded-lg border zego-border-color px-2 py-2" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
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
