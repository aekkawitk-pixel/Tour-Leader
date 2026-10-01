'use client';

/** หน้าเบิกจ่าย — แบ่งตามประเภทเงิน ค้นหา กรอง สร้างใบเบิก และดำเนินการอนุมัติ/จ่าย */

import { useCallback, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import Link from 'next/link';
import { can, canViewPath } from '@/lib/permissions';
import { Icon } from '@/components/ui/Icon';
import { EXPENSE_STATUS, MONEY_CATEGORY, MONEY_CATEGORY_ORDER } from '@/lib/labels';
import { formatTHB, formatDate, formatDateRange } from '@/lib/format';
import { Button, Card, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { StatCard } from '@/components/ui/Charts';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { ExpenseFormModal } from '@/components/expenses/ExpenseFormModal';
import { CurrencyStack } from '@/app/guide/expenses/CurrencyStack';
import { expenseApprovedTotals, isPartiallyApproved, requestedAtOf } from '@/app/guide/expenses/expenseAmounts';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import type { ExpenseRequest, ExpenseStatus, MoneyCategory } from '@/types';

const ALL_STATUSES: ExpenseStatus[] = [
  'draft',
  'submitted',
  'revise',
  'rejected',
  'approved',
  'awaiting_payment',
  'paid',
  'cancelled',
];

export default function ExpensesPage() {
  const { expenses, jobs, currentUser } = useDemo();

  const [tab, setTab] = useState<'all' | MoneyCategory>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** อ้างอิงด้วย id เพื่อให้ Drawer/ฟอร์มเห็นข้อมูลล่าสุดเสมอหลังเปลี่ยนสถานะ */
  const selected = expenses.find((e) => e.id === selectedId) ?? null;
  const editing = expenses.find((e) => e.id === editingId) ?? null;

  /*
   * รายการใบเบิกหน้านี้ = ที่ส่งมา (หัวหน้าทัวร์/สร้างในระบบ) เท่านั้น
   * เอกสารเบิกกรุ๊ปที่นำเข้าจากไฟล์เป็นรายการงบให้หัวหน้าทัวร์ ไม่ใช่ใบที่ส่งมา → แยกไปการ์ดของตัวเองด้านล่าง
   */
  const scoped = useMemo(() => {
    const leaderId = currentUser.leaderId;
    const submitted = expenses.filter((e) => !isGroupAdvanceDoc(e));
    if (currentUser.role !== 'leader' || !leaderId) return submitted;
    return submitted.filter((e) => e.requesterId === leaderId);
  }, [expenses, currentUser]);

  /**
   * กรุ๊ปของใบเบิก — งานเดิม (JOB-…) ก่อน ไม่พบ = กรุ๊ปจาก Tour Period Master (ใบเสร็จหัวหน้าทัวร์ / เงินทดรองของกรุ๊ป)
   * รหัสกรุ๊ป: groupCode ของพีเรียด · งานเดิมใช้ periodCode (ไม่มี = รหัสงาน) · หาไม่เจอเลย = jobId ดิบ
   */
  const groupOf = useCallback((expense: ExpenseRequest) => {
    const job = jobs.find((j) => j.id === expense.jobId);
    if (job) {
      return { groupCode: job.periodCode ?? job.id, programName: job.title, dates: formatDateRange(job.departDate, job.returnDate) };
    }
    const period = getTourPeriodById(expense.jobId);
    return period
      ? { groupCode: period.groupCode, programName: period.displayName, dates: formatDateRange(period.startDate, period.endDate) }
      : { groupCode: expense.jobId, programName: '—', dates: '' };
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((expense) => {
        if (tab !== 'all' && expense.category !== tab) return false;
        if (status !== 'all' && expense.status !== status) return false;
        if (!q) return true;
        const g = groupOf(expense);
        return [expense.id, expense.jobId, g.groupCode, g.programName, expense.requesterName]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => requestedAtOf(b).localeCompare(requestedAtOf(a)));
  }, [scoped, tab, status, query, groupOf]);

  const pendingCount = scoped.filter((e) => e.status === 'submitted').length;
  const awaitingPayTotal = scoped
    .filter((e) => e.status === 'awaiting_payment')
    .reduce((sum, e) => sum + e.totalTHB, 0);
  const paidTotal = scoped
    .filter((e) => e.status === 'paid')
    .reduce((sum, e) => sum + e.totalTHB, 0);
  const draftCount = scoped.filter((e) => e.status === 'draft' || e.status === 'revise').length;

  const tabs = [
    { key: 'all', label: 'ทั้งหมด', badge: scoped.length },
    ...MONEY_CATEGORY_ORDER.map((c) => ({
      key: c,
      label: MONEY_CATEGORY[c].label,
      badge: scoped.filter((e) => e.category === c).length,
    })),
  ];

  const columns: Column<ExpenseRequest>[] = [
    {
      key: 'group',
      header: 'รหัสกรุ๊ป',
      render: (expense) => (
        <div>
          <p className="zego-text whitespace-nowrap font-medium">{groupOf(expense).groupCode}</p>
          <p className="zego-text-tertiary whitespace-nowrap text-xs">ทำรายการ {formatDate(requestedAtOf(expense))}</p>
        </div>
      ),
    },
    {
      key: 'program',
      header: 'ชื่อโปรแกรม',
      render: (expense) => {
        const g = groupOf(expense);
        return (
          <div className="min-w-0">
            <p className="zego-text-secondary truncate">{g.programName}</p>
            {g.dates && <p className="zego-text-tertiary text-xs">{g.dates}</p>}
          </div>
        );
      },
    },
    {
      key: 'requester',
      header: 'ผู้ขอเบิก',
      hideOnMobile: true,
      render: (expense) => (
        <span className="zego-text-secondary whitespace-nowrap">{expense.requesterName}</span>
      ),
    },
    {
      key: 'category',
      header: 'ประเภทเงิน',
      hideOnMobile: true,
      render: (expense) => (
        <StatusBadge meta={MONEY_CATEGORY[expense.category]} size="sm" dot={false} />
      ),
    },
    {
      key: 'lines',
      header: 'รายการ',
      align: 'center',
      hideOnMobile: true,
      render: (expense) => <span className="tabular-nums">{expense.lines.length}</span>,
    },
    {
      key: 'total',
      header: 'ยอดรวม',
      align: 'right',
      // ตามสกุลเงินที่ทำรายการมา ไม่แปลงเป็นบาท — ใบเดียวมีหลายสกุลได้ แสดงบรรทัดละสกุล (ไม่บวกข้ามสกุล)
      render: (expense) => (
        <span className="block text-right">
          <CurrencyStack
            totals={expenseApprovedTotals(expense)}
            className="whitespace-nowrap"
            lineClassName="zego-text font-semibold tabular-nums"
          />
          {isPartiallyApproved(expense) && <span className="block text-[11px] text-rose-600">อนุมัติบางรายการ</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (expense) => <StatusBadge meta={EXPENSE_STATUS[expense.status]} size="sm" />,
    },
  ];

  const hasFilter = query.trim() !== '' || status !== 'all';
  const canManageGroup = canViewPath(currentUser.role, '/group-expenses');

  return (
    <>
      <PageHeader
        title="ตรวจสอบรายการจ่าย"
        description="ตรวจ อนุมัติ และบันทึกการจ่าย — ค่าตอบแทน เงินทดรอง ค่าใช้จ่ายจริง และเงินคืน/จ่ายเพิ่ม"
        actions={
          <div className="flex flex-wrap gap-2">
            {/* เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls / จัดซองเงิน) ย้ายไปเมนู "จัดการค่าใช้จ่ายกรุ๊ป" */}
            {canManageGroup && (
              <Link href="/group-expenses" className="zego-button">
                <Icon name="money" className="h-4 w-4" />
                จัดการค่าใช้จ่ายกรุ๊ป
              </Link>
            )}
            {can(currentUser.role, 'expense.create') && (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  setEditingId(null);
                  setFormOpen(true);
                }}
              >
                สร้างใบเบิก
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="รออนุมัติ" value={pendingCount} tone="violet" hint="ใบเบิกที่ส่งแล้ว" />
        <StatCard label="ร่าง / รอแก้ไข" value={draftCount} tone="amber" hint="ยังไม่ส่งอนุมัติ" />
        <StatCard
          label="รอจ่าย"
          value={formatTHB(awaitingPayTotal)}
          tone="blue"
          hint="อนุมัติแล้ว รอโอน"
        />
        <StatCard
          label="จ่ายแล้ว (สะสม)"
          value={formatTHB(paidTotal)}
          tone="green"
          hint="ข้อมูลจำลอง"
        />
      </div>

      <Card className="mb-5">
        <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as 'all' | MoneyCategory)} />

        <div className="mt-4 grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="zego-text-secondary text-sm font-medium">ค้นหา</label>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="รหัสกรุ๊ป ชื่อโปรแกรม เลขที่ใบเบิก หรือผู้ขอเบิก"
              label="ค้นหาใบเบิก"
            />
          </div>
          <SelectInput
            label="สถานะใบเบิก"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | ExpenseStatus)}
            options={[
              { value: 'all', label: 'ทุกสถานะ' },
              ...ALL_STATUSES.map((s) => ({ value: s, label: EXPENSE_STATUS[s].label })),
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
          rowKey={(e) => e.id}
          onRowClick={(e) => setSelectedId(e.id)}
          emptyIcon={hasFilter ? 'search' : 'receipt'}
          emptyTitle={hasFilter ? 'ไม่พบใบเบิกที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบเบิกในหมวดนี้'}
          emptyDescription={
            hasFilter
              ? 'ลองปรับคำค้นหาหรือเปลี่ยนตัวกรองสถานะ'
              : 'กดปุ่ม “สร้างใบเบิก” เพื่อเริ่มต้น'
          }
        />
      </Card>

      <ExpenseFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        expense={editing}
      />

      <ExpenseDrawer
        expense={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(expense) => {
          setSelectedId(null);
          setEditingId(expense.id);
          setFormOpen(true);
        }}
      />
    </>
  );
}
