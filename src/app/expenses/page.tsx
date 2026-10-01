'use client';

/** หน้าเบิกจ่าย — แบ่งตามประเภทเงิน ค้นหา กรอง สร้างใบเบิก และดำเนินการอนุมัติ/จ่าย */

import { useCallback, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import Link from 'next/link';
import { can, canViewPath } from '@/lib/permissions';
import { Icon } from '@/components/ui/Icon';
import { EXPENSE_STATUS, MONEY_CATEGORY, MONEY_CATEGORY_ORDER } from '@/lib/labels';
import { formatTHB, formatDate, formatDateRange, formatThaiMonthYear } from '@/lib/format';
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
import type { StatusMeta } from '@/lib/labels';
import { isHolidayFeeLine, SEND_OFF_FEE_TYPE } from '@/lib/logic/staffPortal';

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

/** ผู้ขอเบิก — หัวหน้าทัวร์ / เจ้าหน้าที่ส่งกรุ๊ป / พนักงานที่สร้างใบในระบบ */
type RequesterRole = 'leader' | 'sendoff' | 'staff';
const REQUESTER_ROLE: Record<RequesterRole, StatusMeta> = {
  leader: { label: 'หัวหน้าทัวร์', tone: 'teal' },
  sendoff: { label: 'เจ้าหน้าที่ส่งกรุ๊ป', tone: 'orange' },
  staff: { label: 'พนักงาน', tone: 'slate' },
};

/** ประเภทของใบ — ใบเจ้าหน้าที่ส่งกรุ๊ปแยกเป็น "ค่าส่งกรุ๊ป" (ไม่ปนกับค่าใช้จ่ายจริงของหัวหน้าทัวร์) */
function expenseTypeOf(expense: ExpenseRequest): StatusMeta {
  if (expense.claimMonth) return { label: 'ค่าส่งกรุ๊ป (รายเดือน)', tone: 'orange' };
  if (expense.requesterKind === 'sendoff') return { label: 'ค่าส่งกรุ๊ป', tone: 'orange' };
  // ใบเบิกของหัวหน้าทัวร์ที่ไม่ใช่ใบเสร็จ — แยกเอกสารต่อกรุ๊ป (ดู leaderClaims.ts)
  if (expense.claimKind === 'per_diem') return { label: 'เบี้ยเลี้ยง', tone: 'indigo' };
  if (expense.claimKind === 'tip') return { label: 'ค่าทิป', tone: 'sky' };
  return MONEY_CATEGORY[expense.category];
}

export default function ExpensesPage() {
  const { expenses, jobs, leaders, currentUser } = useDemo();

  const [tab, setTab] = useState<'all' | MoneyCategory>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all');
  const [requester, setRequester] = useState<'all' | RequesterRole>('all');
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
   * อ้างอิงของใบเบิก (คอลัมน์ "อ้างอิง (กรุ๊ป / งวด)")
   * - ใบค่าส่งกรุ๊ปรายเดือน: งวดเดือน + จำนวนกรุ๊ป · รหัสกรุ๊ปทุกกรุ๊ปในใบ (กรุ๊ปอยู่ที่บรรทัด)
   * - ใบของกรุ๊ปเดียว: งานเดิม (JOB-…) ก่อน ไม่พบ = กรุ๊ปจาก Tour Period Master · หาไม่เจอเลย = jobId ดิบ
   */
  const refOf = useCallback((expense: ExpenseRequest): { title: string; codes: string[]; programName: string; dates: string } => {
    if (expense.claimMonth) {
      const codes = [...new Set(expense.lines.map((l) => l.periodId).filter((id): id is string => Boolean(id)))]
        .map((id) => getTourPeriodById(id)?.groupCode ?? id);
      return { title: `${formatThaiMonthYear(`${expense.claimMonth}-01`)} · ${codes.length} กรุ๊ป`, codes, programName: '', dates: '' };
    }
    const job = jobs.find((j) => j.id === expense.jobId);
    if (job) {
      const code = job.periodCode ?? job.id;
      return { title: code, codes: [code], programName: job.title, dates: formatDateRange(job.departDate, job.returnDate) };
    }
    const period = getTourPeriodById(expense.jobId);
    return period
      ? { title: period.groupCode, codes: [period.groupCode], programName: period.displayName, dates: formatDateRange(period.startDate, period.endDate) }
      : { title: expense.jobId, codes: [expense.jobId], programName: '', dates: '' };
  }, [jobs]);

  /** ผู้ขอเบิกเป็นใคร — ใช้ทั้งป้ายในตารางและตัวกรอง */
  const requesterRoleOf = useCallback(
    (expense: ExpenseRequest): RequesterRole =>
      expense.requesterKind === 'sendoff' ? 'sendoff' : leaders.some((l) => l.id === expense.requesterId) ? 'leader' : 'staff',
    [leaders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((expense) => {
        if (tab !== 'all' && expense.category !== tab) return false;
        if (status !== 'all' && expense.status !== status) return false;
        if (requester !== 'all' && requesterRoleOf(expense) !== requester) return false;
        if (!q) return true;
        const r = refOf(expense);
        // ค้นด้วยรหัสกรุ๊ปเจอทั้งใบของกรุ๊ปนั้น และใบค่าส่งกรุ๊ปรายเดือนที่มีกรุ๊ปนั้นอยู่
        return [expense.id, expense.jobId, r.title, ...r.codes, r.programName, expense.requesterName]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => requestedAtOf(b).localeCompare(requestedAtOf(a)));
  }, [scoped, tab, status, requester, query, refOf, requesterRoleOf]);

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
      key: 'id',
      header: 'เลขที่ใบเบิก',
      render: (expense) => (
        <div>
          <p className="zego-text whitespace-nowrap font-medium tabular-nums">{expense.id}</p>
          <p className="zego-text-tertiary whitespace-nowrap text-xs">ยื่น {formatDate(requestedAtOf(expense))}</p>
        </div>
      ),
    },
    {
      key: 'requester',
      header: 'ผู้ขอเบิก',
      render: (expense) => {
        const role = REQUESTER_ROLE[requesterRoleOf(expense)];
        return (
          <div>
            <p className="zego-text-secondary whitespace-nowrap">{expense.requesterName}</p>
            <span className="mt-0.5 inline-block"><StatusBadge meta={role} size="sm" dot={false} /></span>
          </div>
        );
      },
    },
    {
      key: 'category',
      header: 'ประเภท',
      hideOnMobile: true,
      render: (expense) => <StatusBadge meta={expenseTypeOf(expense)} size="sm" dot={false} />,
    },
    {
      key: 'ref',
      header: 'อ้างอิง (กรุ๊ป / งวด)',
      render: (expense) => {
        const r = refOf(expense);
        if (expense.claimMonth) {
          /*
            เจ้าหน้าที่ 1 คนส่งได้ 20+ กรุ๊ป/เดือน — ไล่รหัสกรุ๊ปในตารางอ่านไม่ได้และดันแถวสูง
            จึงสรุปเป็น ช่วงวันไปส่ง + จำนวนอัตราปกติ/วันหยุด (สิ่งที่บัญชีใช้ตรวจยอด) · รายชื่อกรุ๊ปครบอยู่ในหน้ารายละเอียด
            รหัสกรุ๊ปยังค้นหาได้ และชี้ค้างดูได้ (title)
          */
          const fees = expense.lines.filter((l) => l.expenseType === SEND_OFF_FEE_TYPE && l.periodId);
          const dates = fees.map((l) => l.receiptDate).filter((d): d is string => Boolean(d)).sort();
          const holiday = fees.filter(isHolidayFeeLine).length;
          return (
            <div className="min-w-0" title={r.codes.join(', ')}>
              <p className="zego-text font-medium">{r.title}</p>
              <p className="zego-text-tertiary text-xs">
                {dates.length > 0 && `ไปส่ง ${formatDate(dates[0])}${dates.length > 1 ? `–${formatDate(dates.at(-1))}` : ''} · `}
                ปกติ {fees.length - holiday}{holiday > 0 && <span className="zego-text-warning"> · วันหยุด {holiday}</span>}
              </p>
            </div>
          );
        }
        return (
          <div className="min-w-0">
            <p className="zego-text whitespace-nowrap font-medium">{r.title}</p>
            {(r.programName || r.dates) && (
              <p className="zego-text-tertiary line-clamp-1 text-xs">{[r.programName, r.dates].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        );
      },
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

  const hasFilter = query.trim() !== '' || status !== 'all' || requester !== 'all';
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

        <div className="mt-4 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="zego-text-secondary text-sm font-medium">ค้นหา</label>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="เลขที่ใบเบิก รหัสกรุ๊ป ชื่อโปรแกรม หรือผู้ขอเบิก"
              label="ค้นหาใบเบิก"
            />
          </div>
          <SelectInput
            label="ผู้ขอเบิก"
            value={requester}
            onChange={(e) => setRequester(e.target.value as 'all' | RequesterRole)}
            options={[
              { value: 'all', label: 'ทั้งหมด' },
              ...(Object.keys(REQUESTER_ROLE) as RequesterRole[]).map((r) => ({ value: r, label: REQUESTER_ROLE[r].label })),
            ]}
          />
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
                  setRequester('all');
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
