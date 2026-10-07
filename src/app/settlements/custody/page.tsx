'use client';

/**
 * เงินค่าแลนด์ที่เจ้าหน้าที่ส่งกรุ๊ปถือไปให้หัวหน้าทัวร์ — /settlements/custody
 *
 * ฝ่ายการเงินจัดเงินก้อนหนึ่งให้เจ้าหน้าที่ส่งกรุ๊ปถือไป ระบุล่วงหน้าว่าเผื่อไว้ให้กรุ๊ป/หัวหน้าทัวร์คนไหนบ้าง
 * (หนึ่งก้อนถือไปได้หลายกรุ๊ปพร้อมกันในทริปเดียว — ไม่ใช่ทุกกรุ๊ปที่ถือไปด้วยจะเป็นกรุ๊ปที่กำลังเดินทาง)
 * หัวหน้าทัวร์ต้องกดยืนยันรับเงินในพอร์ทัลของตัวเองก่อน จึงจะเพิ่มรายการ "ค่าแลนด์" ในฟอร์มเคลียร์ค่าใช้จ่ายได้
 * (ดู /guide/settlement/claim/SettlementClaimForm.tsx) — ยอดจะไปโผล่รวมกับค่าทิปในใบเคลียร์งานเดียวกันของกรุ๊ปนั้น
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { getTourPeriods, periodCodeOf } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { formatDateRange, formatDate } from '@/lib/format';
import { Button, Card, cx, EmptyState, PageHeader } from '@/components/ui/Primitives';
import { SelectInput, TextInput, baseControl } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { CustodyAllocation } from '@/types';

interface DraftAllocation {
  periodId: string;
  leaderId: string;
  groupCode: string;
  displayName: string;
  leaderName: string;
  amount: string;
}

export default function CustodyLedgerPage() {
  const { currentUser, leaders, master, custodyBatches, createCustodyBatch, saving } = useDemo();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'accounting';

  const allStaff = useMemo(() => loadSendOffStaff(), []);
  const staffList = useMemo(() => allStaff.filter((s) => s.status === 'active'), [allStaff]);
  const periods = useMemo(() => getTourPeriods(), []);
  const confirmedAssignments = useMemo(
    () => loadActiveGuideAssignments().filter((a) => a.assignmentStatus === 'CONFIRMED'),
    [],
  );

  const [showForm, setShowForm] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [allocations, setAllocations] = useState<DraftAllocation[]>([]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return periods
      .filter((p) => !allocations.some((a) => a.periodId === p.internalId))
      .filter((p) => p.groupCode.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, periods, allocations]);

  const addAllocation = (p: TourPeriodMaster) => {
    const assignment = confirmedAssignments.find((a) => a.periodId === p.internalId);
    if (!assignment) return;
    const leader = leaders.find((l) => l.id === assignment.tourLeaderId);
    setAllocations((prev) => [
      ...prev,
      {
        periodId: p.internalId,
        leaderId: assignment.tourLeaderId,
        groupCode: p.groupCode,
        displayName: p.displayName,
        leaderName: leader ? `${leader.title}${leader.firstName} ${leader.lastName}` : assignment.tourLeaderId,
        amount: '',
      },
    ]);
    setSearch('');
  };

  const removeAllocation = (periodId: string) => setAllocations((prev) => prev.filter((a) => a.periodId !== periodId));
  const updateAmount = (periodId: string, amount: string) =>
    setAllocations((prev) => prev.map((a) => (a.periodId === periodId ? { ...a, amount } : a)));

  const validAllocations = allocations.filter((a) => Number(a.amount) > 0);
  const totalAmount = validAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const canSubmit = Boolean(staffId) && validAllocations.length > 0;

  const reset = () => {
    setStaffId('');
    setCurrency('THB');
    setNote('');
    setSearch('');
    setAllocations([]);
    setShowForm(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    await createCustodyBatch({
      staffId,
      currency,
      note: note.trim() || undefined,
      allocations: validAllocations.map((a) => ({ periodId: a.periodId, leaderId: a.leaderId, amount: Number(a.amount) })),
    });
    reset();
  };

  return (
    <>
      <PageHeader
        title="เงินค่าแลนด์ (เจ้าหน้าที่ส่งกรุ๊ปถือ)"
        description="จัดเงินให้เจ้าหน้าที่ส่งกรุ๊ปถือไปให้หัวหน้าทัวร์ — ระบุล่วงหน้าว่าเผื่อไว้ให้กรุ๊ปไหนบ้าง หนึ่งก้อนถือไปได้หลายกรุ๊ปพร้อมกัน"
      />

      {canManage && (
        <Card className="mb-5 space-y-3">
          {!showForm ? (
            <Button variant="primary" icon="plus" onClick={() => setShowForm(true)}>
              จัดเงินค่าแลนด์ใหม่
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold zego-text">
                <Icon name="money" className="h-4 w-4 zego-text-success" />
                จัดเงินค่าแลนด์ใหม่
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectInput
                  label="เจ้าหน้าที่ส่งกรุ๊ปผู้ถือเงิน"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder="เลือกเจ้าหน้าที่"
                  options={staffList.map((s) => ({ value: s.id, label: `${s.nickname} (${s.id})` }))}
                />
                <SelectInput
                  label="สกุลเงิน"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  options={master.currencies.filter((c) => c.active).map((c) => ({ value: c.code, label: c.code }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium zego-text-secondary">เผื่อไว้ให้กรุ๊ป</label>
                <div className="relative">
                  <input
                    className={baseControl}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหา Group Code หรือชื่อโปรแกรม"
                  />
                  {searchResults.length > 0 && (
                    <div className="zego-border-color zego-surface-bg absolute z-10 mt-1 w-full rounded-lg border py-1 shadow-lg">
                      {searchResults.map((p) => {
                        const assignment = confirmedAssignments.find((a) => a.periodId === p.internalId);
                        return (
                          <button
                            key={p.internalId}
                            type="button"
                            disabled={!assignment}
                            onClick={() => addAllocation(p)}
                            className={cx(
                              'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                              assignment ? 'zego-hover-surface' : 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium zego-text">
                                {p.groupCode} · {p.displayName}
                              </span>
                              <span className="block text-xs zego-text-tertiary">
                                {formatDateRange(p.startDate, p.endDate)} ·{' '}
                                {assignment ? 'คอนเฟิร์มแล้ว' : 'ยังไม่มีหัวหน้าทัวร์คอนเฟิร์ม'}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {allocations.length > 0 && (
                <div className="space-y-2">
                  {allocations.map((a) => (
                    <div key={a.periodId} className="zego-border-color flex items-center gap-2 rounded-lg border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium zego-text">
                          {a.groupCode} · {a.displayName}
                        </p>
                        <p className="truncate text-xs zego-text-tertiary">หัวหน้าทัวร์: {a.leaderName}</p>
                      </div>
                      <div className="w-32 shrink-0">
                        <input
                          className={cx(baseControl, 'text-right')}
                          type="number"
                          inputMode="decimal"
                          value={a.amount}
                          onChange={(e) => updateAmount(a.periodId, e.target.value)}
                          placeholder="จำนวนเงิน"
                          aria-label={`จำนวนเงินสำหรับ ${a.groupCode}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAllocation(a.periodId)}
                        className="shrink-0 rounded p-1 zego-text-tertiary hover:text-[var(--zego-danger)]"
                        aria-label="ลบกรุ๊ปนี้"
                      >
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <p className="text-right text-sm font-semibold zego-text-success">
                    รวม {totalAmount.toLocaleString('th-TH')} {currency}
                  </p>
                </div>
              )}

              <TextInput label="หมายเหตุ" optional value={note} onChange={(e) => setNote(e.target.value)} />

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={reset}>
                  ยกเลิก
                </Button>
                <Button variant="success" className="flex-1" disabled={!canSubmit || saving} loading={saving} onClick={submit}>
                  บันทึกการจัดเงิน
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {custodyBatches.length === 0 ? (
        <Card>
          <EmptyState icon="money" title="ยังไม่มีรายการจัดเงินค่าแลนด์" description="กด “จัดเงินค่าแลนด์ใหม่” เพื่อเริ่มบันทึกรายการแรก" />
        </Card>
      ) : (
        <div className="space-y-3">
          {custodyBatches.map((batch) => {
            const staff = allStaff.find((s) => s.id === batch.staffId);
            const total = batch.allocations.reduce((sum, a) => sum + a.amount, 0);
            return (
              <Card key={batch.id} padded={false}>
                <div className="zego-divider-bottom flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold zego-text">
                      {batch.id} · {staff?.nickname ?? batch.staffId}
                    </p>
                    <p className="text-xs zego-text-tertiary">
                      จัดโดย {batch.issuedByName} · {formatDate(batch.issuedAt)}
                      {batch.note ? ` · ${batch.note}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold zego-text-success">
                    {total.toLocaleString('th-TH')} {batch.currency}
                  </p>
                </div>
                <ul className="divide-y divide-[var(--zego-border)]">
                  {batch.allocations.map((a) => {
                    const period = periods.find((p) => p.internalId === a.periodId);
                    const leader = leaders.find((l) => l.id === a.leaderId);
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium zego-text-secondary">
                            {period?.groupCode ?? periodCodeOf(a.periodId)} · {leader ? `${leader.firstName} ${leader.lastName}` : a.leaderId}
                          </p>
                          <p className="text-xs zego-text-tertiary">
                            {a.amount.toLocaleString('th-TH')} {batch.currency}
                          </p>
                        </div>
                        <CustodyStatusTag allocation={a} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function CustodyStatusTag({ allocation }: { allocation: CustodyAllocation }) {
  if (allocation.claimedAt) {
    return <span className="zego-badge--slate shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">เคลียร์แล้ว</span>;
  }
  if (allocation.acknowledgedAt) {
    return <span className="zego-badge--success shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">รับเงินแล้ว</span>;
  }
  return <span className="zego-badge--warning shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">รอหัวหน้าทัวร์รับเงิน</span>;
}
