'use client';

/** หน้าเคลียร์งาน — รายการรอเคลียร์ที่สร้างอัตโนมัติเมื่อจบงาน */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { SETTLEMENT_FLOW, SETTLEMENT_STATUS } from '@/lib/labels';
import { summarizeSettlement, totalOutstandingAdvance } from '@/lib/logic/settlement';
import { formatTHB, formatDate } from '@/lib/format';
import Link from 'next/link';
import { Button, Card, cx, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { StatCard } from '@/components/ui/Charts';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';
import { SettlementDrawer } from '@/components/settlements/SettlementDrawer';
import type { Settlement, SettlementStatus } from '@/types';

export default function SettlementsPage() {
  const { settlements, jobs, leaders, today, currentUser } = useDemo();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | SettlementStatus | 'overdue'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** อ้างอิงด้วย id เพื่อให้ Drawer เห็นข้อมูลล่าสุดเสมอหลังบันทึกผลการตรวจ */
  const selected = settlements.find((s) => s.id === selectedId) ?? null;

  const scoped = useMemo(() => {
    const leaderId = currentUser.leaderId;
    if (currentUser.role !== 'leader' || !leaderId) return settlements;
    return settlements.filter((s) => s.leaderId === leaderId);
  }, [settlements, currentUser]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((settlement) => {
        const summary = summarizeSettlement(settlement, today);
        if (status === 'overdue' && summary.overdueDays === 0) return false;
        if (status !== 'all' && status !== 'overdue' && settlement.status !== status) return false;
        if (!q) return true;
        const leader = leaders.find((l) => l.id === settlement.leaderId);
        return [
          settlement.id,
          settlement.jobId,
          leader ? `${leader.firstName} ${leader.lastName}` : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [scoped, query, status, today, leaders]);

  const open = scoped.filter((s) => s.status !== 'settled' && s.status !== 'closed');
  const overdue = open.filter((s) => summarizeSettlement(s, today).overdueDays > 0);
  const toReturn = open.reduce((sum, s) => {
    const net = summarizeSettlement(s, today).netTHB;
    return net < 0 ? sum + Math.abs(net) : sum;
  }, 0);
  const toPay = open.reduce((sum, s) => {
    const net = summarizeSettlement(s, today).netTHB;
    return net > 0 ? sum + net : sum;
  }, 0);

  const columns: Column<Settlement>[] = [
    {
      key: 'id',
      header: 'รายการเคลียร์',
      render: (settlement) => {
        const job = jobs.find((j) => j.id === settlement.jobId);
        return (
          <div className="min-w-0">
            <p className="font-medium zego-text">{settlement.id}</p>
            <p className="truncate text-xs zego-text-tertiary">
              {settlement.jobId} · {job?.title ?? '—'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'leader',
      header: 'หัวหน้าทัวร์',
      render: (settlement) => {
        const leader = leaders.find((l) => l.id === settlement.leaderId);
        return (
          <span className="whitespace-nowrap zego-text-secondary">
            {leader ? `${leader.firstName} ${leader.lastName}` : settlement.leaderId}
          </span>
        );
      },
    },
    {
      key: 'advance',
      header: 'เงินทดรอง',
      align: 'right',
      hideOnMobile: true,
      render: (settlement) => (
        <span className="whitespace-nowrap tabular-nums">{formatTHB(settlement.advanceTHB)}</span>
      ),
    },
    {
      key: 'approved',
      header: 'อนุมัติแล้ว',
      align: 'right',
      hideOnMobile: true,
      render: (settlement) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatTHB(summarizeSettlement(settlement, today).approvedTHB)}
        </span>
      ),
    },
    {
      key: 'net',
      header: 'ยอดสุทธิ',
      align: 'right',
      render: (settlement) => {
        const summary = summarizeSettlement(settlement, today);
        if (summary.netTHB === 0)
          return <span className="whitespace-nowrap text-xs zego-text-tertiary">เคลียร์พอดี</span>;
        return (
          <span
            className={cx(
              'block whitespace-nowrap font-semibold tabular-nums',
              summary.netTHB > 0 ? 'zego-text-success' : 'zego-text-danger',
            )}
          >
            {formatTHB(Math.abs(summary.netTHB))}
            <span className="block text-[10px] font-normal zego-text-tertiary">
              {summary.netTHB > 0 ? 'บริษัทจ่ายเพิ่ม' : 'ต้องคืนเงิน'}
            </span>
          </span>
        );
      },
    },
    {
      key: 'due',
      header: 'กำหนดเคลียร์',
      render: (settlement) => {
        const summary = summarizeSettlement(settlement, today);
        return (
          <div className="whitespace-nowrap">
            <p className="zego-text-secondary">{formatDate(settlement.dueDate)}</p>
            {summary.overdueDays > 0 ? (
              <p className="inline-flex items-center gap-1 text-xs font-semibold zego-text-danger">
                <Icon name="warning" className="h-3 w-3" />
                เกิน {summary.overdueDays} วัน
              </p>
            ) : (
              <p className="text-xs zego-text-tertiary">ตามกำหนด</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'docs',
      header: 'เอกสาร',
      align: 'center',
      hideOnMobile: true,
      render: (settlement) => {
        const summary = summarizeSettlement(settlement, today);
        if (settlement.items.length === 0)
          return <span className="text-xs zego-text-tertiary">ยังไม่ส่ง</span>;
        return (
          <div className="flex flex-col items-center gap-0.5 text-[11px]">
            {summary.missingDocCount > 0 && (
              <span className="font-medium zego-text-danger">
                ไม่ครบ {summary.missingDocCount} รายการ
              </span>
            )}
            {summary.pendingCount > 0 && (
              <span className="zego-text-tertiary">รอตรวจ {summary.pendingCount}</span>
            )}
            {summary.missingDocCount === 0 && summary.pendingCount === 0 && (
              <span className="zego-text-success">ครบถ้วน</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (settlement) => <StatusBadge meta={SETTLEMENT_STATUS[settlement.status]} size="sm" />,
    },
  ];

  const hasFilter = query.trim() !== '' || status !== 'all';

  return (
    <>
      <PageHeader
        title="เคลียร์งาน"
        description="ยอดสุทธิ = ค่าใช้จ่ายที่อนุมัติ − เงินทดรอง · ยอดบวก = บริษัทจ่ายเพิ่ม, ยอดลบ = หัวหน้าทัวร์คืนเงิน"
        actions={
          <Link href="/settlements/custody">
            <Button variant="secondary" size="sm" icon="money">เงินค่าแลนด์ที่ถือไป</Button>
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="งานรอเคลียร์" value={open.length} tone="blue" hint="ยังไม่ปิดการเคลียร์" />
        <StatCard
          label="เกินกำหนด"
          value={overdue.length}
          tone={overdue.length > 0 ? 'red' : 'green'}
          hint="เลยวันกำหนดเคลียร์"
        />
        <StatCard
          label="เงินทดรองค้างเคลียร์"
          value={formatTHB(totalOutstandingAdvance(scoped))}
          tone="amber"
          hint="ยอดรวมที่ยังไม่ปิดบัญชี"
        />
        <StatCard
          label="ยอดคืน / จ่ายเพิ่ม"
          value={`${formatTHB(toReturn)} / ${formatTHB(toPay)}`}
          tone="violet"
          hint="ต้องคืน / บริษัทต้องจ่าย"
        />
      </div>

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium zego-text-secondary">ค้นหา</label>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="รหัสเคลียร์งาน รหัสงาน หรือชื่อหัวหน้าทัวร์"
              label="ค้นหาการเคลียร์งาน"
            />
          </div>
          <SelectInput
            label="สถานะ"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | SettlementStatus | 'overdue')}
            options={[
              { value: 'all', label: 'ทุกสถานะ' },
              { value: 'overdue', label: '⚠ เกินกำหนดเท่านั้น' },
              ...SETTLEMENT_FLOW.map((s) => ({ value: s, label: SETTLEMENT_STATUS[s].label })),
              { value: 'docs_incomplete', label: SETTLEMENT_STATUS.docs_incomplete.label },
            ]}
          />
          <div>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                }}
              >
                ล้างตัวกรอง
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(s) => s.id}
          onRowClick={(s) => setSelectedId(s.id)}
          rowClassName={(s) =>
            summarizeSettlement(s, today).overdueDays > 14 ? 'bg-rose-50/50' : undefined
          }
          emptyIcon={hasFilter ? 'search' : 'checklist'}
          emptyTitle={hasFilter ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ไม่มีงานรอเคลียร์'}
          emptyDescription={
            hasFilter
              ? 'ลองปรับคำค้นหาหรือเปลี่ยนตัวกรองสถานะ'
              : 'เมื่อมีงานเปลี่ยนเป็นสถานะ “รอเคลียร์” ระบบจะสร้างรายการให้อัตโนมัติ'
          }
        />
      </Card>

      <SettlementDrawer settlement={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
