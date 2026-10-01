'use client';

/**
 * จัดการค่าใช้จ่ายกรุ๊ป — /group-expenses (ฝ่ายบัญชี/การเงิน)
 *
 * เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls) → การเงินจัดเงินใส่ซอง → ส่งมอบให้เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์รับ
 * → ส่งแลนด์ / ใช้ตามรายการ · แยกจากเมนู "ตรวจสอบรายการจ่าย" (/expenses) ที่เป็นคิวตรวจ/อนุมัติใบที่หัวหน้าทัวร์ส่งมา
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { PageHeader, Button, Card, cx } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { GroupAdvanceDocsCard, type GroupDocs } from '@/components/expenses/GroupAdvanceDocsCard';
import { AdvanceImportModal } from '@/components/expenses/AdvanceImportModal';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { groupEnvelopeStatus, groupLines } from '@/lib/logic/cashEnvelope';
import { getTourPeriodById } from '@/services/tourPeriodMaster';

type Filter = 'all' | 'packing' | 'sealed' | 'handed_over' | 'received' | 'mismatch';

const FILTERS: { key: Filter; label: string; hint: string; tone: string }[] = [
  { key: 'all', label: 'ทั้งหมด', hint: 'กรุ๊ปที่มีเอกสารเบิก', tone: '#475569' },
  { key: 'packing', label: 'รอจัดซอง', hint: 'ยังจัดไม่ครบทุกรายการ', tone: '#b45309' },
  { key: 'sealed', label: 'รอส่งมอบ', hint: 'ปิดซองแล้ว', tone: '#0369a1' },
  { key: 'handed_over', label: 'ระหว่างส่งมอบ', hint: 'รอเจ้าหน้าที่ / หัวหน้าทัวร์ยืนยันรับ', tone: '#6d28d9' },
  { key: 'received', label: 'หัวหน้าทัวร์รับแล้ว', hint: 'อยู่ในมือหัวหน้าทัวร์', tone: '#15803d' },
  { key: 'mismatch', label: 'แจ้งยอดไม่ตรง', hint: 'ต้องตรวจสอบ', tone: '#be123c' },
];

function matches(s: { stage: string; mismatch: boolean }, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'mismatch') return s.mismatch;
  return s.stage === f;
}

export default function GroupExpensesPage() {
  const { expenses, envelopes, currentUser } = useDemo();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const canImport = can(currentUser.role, 'expense.create') || can(currentUser.role, 'expense.approve');

  // 1 แถว = 1 กรุ๊ป (เอกสารเบิกหลายใบของกรุ๊ปเดียวกันรวมกัน — ซองเงินเป็นของกรุ๊ป)
  const groups = useMemo(() => {
    const m = new Map<string, GroupDocs>();
    for (const d of expenses.filter(isGroupAdvanceDoc)) {
      const g = m.get(d.jobId) ?? { periodId: d.jobId, docs: [] };
      g.docs.push(d);
      m.set(d.jobId, g);
    }
    return [...m.values()];
  }, [expenses]);
  const statusOf = (g: GroupDocs) => groupEnvelopeStatus(groupLines(g.docs), envelopes.filter((e) => e.periodId === g.periodId));

  const q = query.trim().toLowerCase();
  const shown = groups
    .filter((g) => matches(statusOf(g), filter))
    .filter((g) => {
      if (!q) return true;
      const p = getTourPeriodById(g.periodId);
      return [...g.docs.map((d) => d.id), p?.groupCode, p?.displayName, g.docs[0]?.sourceDoc?.groupCode].join(' ').toLowerCase().includes(q);
    })
    // เดินทางใกล้สุดก่อน — การเงินต้องจัดซองให้ทันก่อนกรุ๊ปออก
    .sort((a, b) => (getTourPeriodById(a.periodId)?.startDate ?? '9').localeCompare(getTourPeriodById(b.periodId)?.startDate ?? '9'));

  return (
    <>
      <PageHeader
        title="จัดการค่าใช้จ่ายกรุ๊ป"
        description="เอกสารเบิกค่าใช้จ่ายกรุ๊ป · การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → ส่งแลนด์ / ใช้ตามรายการ"
        actions={
          canImport && (
            <Button variant="primary" icon="download" onClick={() => setImportOpen(true)}>
              นำเข้าเอกสารเบิก (.xls)
            </Button>
          )
        }
      />

      {/* สรุปสถานะซอง — แตะเพื่อกรอง */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {FILTERS.map((f) => {
          const count = groups.filter((g) => matches(statusOf(g), f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cx('zego-card-surface rounded-xl px-3 py-2.5 text-left transition', active ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-emerald-200')}
            >
              <p className="text-xs zego-text-tertiary">{f.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: count > 0 && f.key !== 'all' ? f.tone : undefined }}>{count}</p>
              <p className="text-[11px] zego-text-tertiary">{f.hint}</p>
            </button>
          );
        })}
      </div>

      <Card className="mb-4">
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหา Ref รหัสกรุ๊ป หรือชื่อโปรแกรม" label="ค้นหาเอกสารเบิก" />
      </Card>

      <GroupAdvanceDocsCard
        groups={shown}
        emptyText={groups.length === 0 ? 'ยังไม่มีเอกสารเบิก — กด "นำเข้าเอกสารเบิก (.xls)"' : 'ไม่พบเอกสารที่ตรงกับตัวกรอง'}
      />

      <AdvanceImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
