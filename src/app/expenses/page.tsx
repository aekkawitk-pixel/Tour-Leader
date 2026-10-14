'use client';

/**
 * ตรวจสอบรายการจ่าย — คิวตรวจอย่างเดียว (ใบเสร็จค่าใช้จ่ายจริง · เบี้ยเลี้ยง · ค่าส่งกรุ๊ป)
 * สถานะ: รอตรวจ · ให้แก้ไข · ตรวจแล้ว · ปฏิเสธ · ยกเลิกแล้ว — การโอนเงิน (รอจ่าย / จ่ายแล้ว) อยู่ที่เมนู "จ่ายเงิน" (/payments)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import Link from 'next/link';
import { can, canViewPath } from '@/lib/permissions';
import { Icon } from '@/components/ui/Icon';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { Button, Card, cx, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { StatCard } from '@/components/ui/Charts';
import { SearchBox } from '@/components/ui/FormField';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { ExpenseFormModal } from '@/components/expenses/ExpenseFormModal';
import { CurrencyStack } from '@/app/guide/expenses/CurrencyStack';
import { expenseApprovedTotals, isPartiallyApproved, requestedAtOf } from '@/app/guide/expenses/expenseAmounts';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { GroupUsageReviewDrawer } from '@/components/expenses/GroupUsageReviewDrawer';
import {
  advanceDocIndex, expenseStatusMeta, isUsageReport, lineTitle, summarizeUsageGroups, USAGE_GROUP_STATUS,
  type UsageGroupStatus, type UsageGroupSummary,
} from '@/lib/logic/usageReport';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import type { ExpenseRequest, ExpenseStatus } from '@/types';
import {
  EXPENSE_KIND_LABEL, expenseKindOf, expenseRef, ExpenseRefCell, expenseTypeOf, REQUESTER_ROLE, requesterLabel, requesterRoleOf,
  type ExpenseKind,
} from '@/components/expenses/expenseKinds';

// ไม่มี "ร่าง" — ร่างของผู้อื่นไม่ขึ้นหน้านี้ (ยังไม่ได้ส่ง)
// หน้านี้ = ผลการตรวจเท่านั้น · อนุมัติ / รอจ่าย / จ่ายแล้ว นับเป็น "ตรวจแล้ว" (การจ่ายอยู่ที่เมนูจ่ายเงิน)
const ALL_STATUSES: ExpenseStatus[] = ['submitted', 'revise', 'approved', 'rejected', 'cancelled'];

/** สถานะในมุมการตรวจ — ผ่านการตรวจแล้วไม่ว่าจะจ่ายหรือยัง = approved */
function reviewStatusOf(e: ExpenseRequest): ExpenseStatus {
  return e.status === 'awaiting_payment' || e.status === 'paid' ? 'approved' : e.status;
}

/**
 * แท็บ = ประเภทใบที่เข้ามาให้ตรวจจริง (แทนหมวดเงินเดิม)
 * ตัด "เงินทดรองก่อนเดินทาง" (เอกสารเบิกนำเข้า → จัดซองที่จัดการค่าใช้จ่ายกรุ๊ป) และ "เงินคืน / จ่ายเพิ่ม" (→ เคลียร์เงินกรุ๊ป) ออก
 * "ค่าตอบแทนหัวหน้าทัวร์" เดิม = ใบเบิกเบี้ยเลี้ยง → ใช้ชื่อ "เบี้ยเลี้ยง"
 */
type ReviewTab = 'all' | ExpenseKind;
const reviewKindOf = expenseKindOf;
const REVIEW_TABS = (['per_diem', 'actual', 'sendoff', 'other'] as const).map((key) => ({ key, label: EXPENSE_KIND_LABEL[key] }));

/** มุมมองตาราง — รายการ (ทีละใบ) / กรุ๊ป (แถวละกรุ๊ป) · จำไว้ในเครื่อง */
type ReviewView = 'list' | 'group';
const VIEW_KEY = 'expensesReviewView';

/** 1 แถวของมุมมองกรุ๊ป — ใบทั้งหมดของกรุ๊ปในแท็บ/คำค้นปัจจุบัน */
interface ReviewGroup {
  key: string;
  jobId: string;
  docs: ExpenseRequest[];
  /** สรุปใบเสร็จค่าใช้จ่ายจริง (เทียบใบเบิก) — ไม่มีใบเสร็จ = null */
  usage: UsageGroupSummary | null;
  /** ใบเบิก (เบี้ยเลี้ยง / ค่าส่งกรุ๊ป / อื่น ๆ) */
  claims: ExpenseRequest[];
  status: UsageGroupStatus;
  latest: string;
}

export default function ExpensesPage() {
  const { expenses, jobs, leaders, currentUser, resetSubmittedExpenses } = useDemo();
  const [resetting, setResetting] = useState(false);
  const submittedCount = expenses.filter((e) => !isGroupAdvanceDoc(e)).length;

  const [tab, setTab] = useState<ReviewTab>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** แท็บค่าใช้จ่ายจริง = 1 แถวต่อกรุ๊ป — กรองตามสถานะของกรุ๊ป */
  const [groupStatus, setGroupStatus] = useState<'all' | UsageGroupStatus>('all');
  /** ตรวจทั้งกรุ๊ป (รายงานการใช้เงิน) — เปิดตรวจรายใบจากแผงนี้ ปิดแล้วกลับมาที่กรุ๊ปเดิม */
  const [reviewGroup, setReviewGroup] = useState<string | null>(null);
  const [fromGroup, setFromGroup] = useState<string | null>(null);
  /** เปิดใบจากหน้าตรวจทั้งกรุ๊ปพร้อมคำสั่ง ส่งกลับแก้ไข / ปฏิเสธ */
  const [startAction, setStartAction] = useState<'revise' | 'rejected' | null>(null);

  /** อ้างอิงด้วย id เพื่อให้ Drawer/ฟอร์มเห็นข้อมูลล่าสุดเสมอหลังเปลี่ยนสถานะ */
  const selected = expenses.find((e) => e.id === selectedId) ?? null;
  const editing = expenses.find((e) => e.id === editingId) ?? null;

  /*
   * รายการใบเบิกหน้านี้ = ที่ส่งมา (หัวหน้าทัวร์/สร้างในระบบ) เท่านั้น
   * เอกสารเบิกกรุ๊ปที่นำเข้าจากไฟล์เป็นรายการงบให้หัวหน้าทัวร์ ไม่ใช่ใบที่ส่งมา → แยกไปการ์ดของตัวเองด้านล่าง
   */
  const scoped = useMemo(() => {
    const leaderId = currentUser.leaderId;
    // ร่าง = ผู้ขอเบิกยังไม่ส่ง → ไม่ใช่งานตรวจ · เห็นเฉพาะร่างของตัวเอง (เช่น พนักงานที่สร้างใบในระบบ)
    const submitted = expenses.filter((e) => !isGroupAdvanceDoc(e)
      && (e.status !== 'draft' || e.requesterId === currentUser.id || (!!leaderId && e.requesterId === leaderId)));
    if (currentUser.role !== 'leader' || !leaderId) return submitted;
    return submitted.filter((e) => e.requesterId === leaderId);
  }, [expenses, currentUser]);

  /** อ้างอิงกรุ๊ปของใบ (คอลัมน์ "รายการทัวร์") — ดู expenseRef */
  const refOf = useCallback((expense: ExpenseRequest) => expenseRef(expense, jobs), [jobs]);


  /*
    ตัวกรอง: แท็บประเภท + ค้นหา + ชิปสถานะ (แตะทีเดียว) — ตัดตัวกรองผู้ขอเบิกออก (ค้นด้วยชื่อผู้ขอเบิกได้ในช่องค้นหา)
    ตัวเลขบนชิปนับจากแท็บ + คำค้นปัจจุบัน (ยังไม่กรองสถานะ) จึงรู้ก่อนแตะว่าแต่ละสถานะมีกี่ใบ
  */
  /** รายการเบิก → เลขใบเบิกเงินทดรอง (สร้างครั้งเดียว) — ค้นด้วยเลข EXPOP ได้ */
  const advIndex = useMemo(() => advanceDocIndex(expenses), [expenses]);
  const beforeStatus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((expense) => {
        if (tab !== 'all' && reviewKindOf(expense) !== tab) return false;
        if (!q) return true;
        const r = refOf(expense);
        // ค้นด้วยรหัสกรุ๊ปเจอทั้งใบของกรุ๊ปนั้น และใบค่าส่งกรุ๊ปรายเดือนที่มีกรุ๊ปนั้นอยู่
        const docIds = expense.lines.map((l) => (l.budgetLineId ? advIndex.get(`${expense.jobId}|${l.budgetLineId}`) ?? '' : ''));
        return [expense.id, ...docIds, expense.jobId, r.title, ...r.codes, r.programName, expense.requesterName]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => requestedAtOf(b).localeCompare(requestedAtOf(a)));
  }, [scoped, tab, query, refOf, advIndex]);
  const statusCounts = useMemo(() => {
    const m = new Map<ExpenseStatus, number>();
    for (const e of beforeStatus) m.set(reviewStatusOf(e), (m.get(reviewStatusOf(e)) ?? 0) + 1);
    return m;
  }, [beforeStatus]);
  /*
    ชิปสถานะตามชนิดใบที่มีในแท็บ (ไม่ขึ้นกับคำค้น)
    - รายงานการใช้เงิน (ใบเสร็จค่าใช้จ่ายจริง): รอตรวจ · ให้แก้ไข · ตรวจแล้ว · ปฏิเสธ · ยกเลิกแล้ว
    - ใบเบิก (เบี้ยเลี้ยง/ค่าส่งกรุ๊ป): ส่งอนุมัติ · ให้แก้ไข · อนุมัติ · ปฏิเสธ · ยกเลิกแล้ว (การจ่ายอยู่ที่เมนูจ่ายเงิน)
    - มีทั้งสองชนิด: ชื่อชิปแสดงทั้งสองคำ เช่น "รอตรวจ / ส่งอนุมัติ" · ชื่อชิปตรงกับป้ายในแถวเสมอ
  */
  const tabScope = tab === 'all' ? scoped : scoped.filter((e) => reviewKindOf(e) === tab);
  const hasUsage = tabScope.some(isUsageReport);
  const hasClaim = tabScope.some((e) => !isUsageReport(e));
  const kinds = hasUsage || hasClaim ? { usage: hasUsage, claim: hasClaim } : { usage: tab === 'actual', claim: tab !== 'actual' };
  const chipStatuses = ALL_STATUSES;
  const chipLabel = (st: ExpenseStatus) => [...new Set([
    ...(kinds.usage ? [expenseStatusMeta({ category: 'actual', status: st } as ExpenseRequest).label] : []),
    ...(kinds.claim ? [EXPENSE_STATUS[st].label] : []),
  ])].join(' / ');
  /** สถานะที่เลือกไว้แต่ไม่มีในแท็บนี้ (เช่น รอจ่าย → ย้ายมาแท็บที่มีแต่ใบเสร็จ) = ทั้งหมด */
  const activeStatus: 'all' | ExpenseStatus = status !== 'all' && chipStatuses.includes(status) ? status : 'all';
  const filtered = useMemo(
    () => (activeStatus === 'all' ? beforeStatus : beforeStatus.filter((e) => reviewStatusOf(e) === activeStatus)),
    [beforeStatus, activeStatus],
  );

  /*
    มุมมอง: รายการ (ทีละใบ · ค่าเริ่มต้น) หรือ กรุ๊ป (แถวละกรุ๊ป) — ใช้ได้ทุกแท็บ จำค่าที่เลือกไว้ในเครื่อง
    ตัวเลขบนแท็บนับเป็น "ใบ" เสมอ ทุกแท็บหน่วยเดียวกัน (ทั้งหมด = ผลรวมของแท็บย่อย)
    ใบเสร็จค่าใช้จ่ายจริงตรวจผ่านหน้าตรวจทั้งกรุ๊ปเสมอ (เทียบใบเบิกเงินทดรอง) — กดจากมุมมองรายการก็เปิดหน้านั้นแล้วเลื่อนไปที่ใบที่กด
  */
  const [view, setView] = useState<ReviewView>('list');
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านค่าที่จำไว้ (localStorage) ครั้งเดียวตอน mount
      if (window.localStorage.getItem(VIEW_KEY) === 'group') setView('group');
    } catch { /* ไม่มี storage */ }
  }, []);
  const pickView = (v: ReviewView) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* แค่ไม่จำ */ }
  };
  const groupMode = view === 'group';
  /** ใบเสร็จที่กดมาจากมุมมองรายการ — เน้นในหน้าตรวจทั้งกรุ๊ป */
  const [focusReport, setFocusReport] = useState<string | null>(null);

  /*
    มุมมองกรุ๊ป — รวมทุกใบของกรุ๊ปเดียวกัน (ใบเสร็จ + เบี้ยเลี้ยง + อื่น ๆ) เป็น 1 แถว
    ใบค่าส่งกรุ๊ปรายเดือน / ใบที่ไม่ผูกกรุ๊ป = แถวของตัวเอง · สถานะกรุ๊ป: มีใบรอตรวจ → รอตรวจ · มีใบให้แก้ไข → ให้แก้ไข · ไม่งั้น ตรวจแล้ว
  */
  const usageGroups = useMemo(() => summarizeUsageGroups(beforeStatus, expenses), [beforeStatus, expenses]);
  const groups = useMemo<ReviewGroup[]>(() => {
    if (!groupMode) return [];
    const usageBy = new Map(usageGroups.map((g) => [g.jobId, g]));
    const byKey = new Map<string, ExpenseRequest[]>();
    for (const e of beforeStatus) {
      const key = e.claimMonth || !e.jobId ? `doc:${e.id}` : e.jobId;
      byKey.set(key, [...(byKey.get(key) ?? []), e]);
    }
    const ORDER: Record<UsageGroupStatus, number> = { pending: 0, revise: 1, done: 2 };
    return [...byKey].map(([key, docs]) => {
      const usage = docs.some(isUsageReport) ? usageBy.get(docs[0].jobId) ?? null : null;
      const claims = docs.filter((e) => !isUsageReport(e));
      const status: UsageGroupStatus = (usage?.pending ?? 0) > 0 || claims.some((c) => c.status === 'submitted') ? 'pending'
        : (usage?.revise ?? 0) > 0 || claims.some((c) => c.status === 'revise') ? 'revise' : 'done';
      return { key, jobId: docs[0].jobId, docs, usage, claims, status, latest: docs.map(requestedAtOf).sort().at(-1) ?? '' };
    }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.latest.localeCompare(a.latest));
  }, [groupMode, beforeStatus, usageGroups]);
  const groupCounts = useMemo(() => {
    const m = new Map<UsageGroupStatus, number>();
    for (const g of groups) m.set(g.status, (m.get(g.status) ?? 0) + 1);
    return m;
  }, [groups]);
  const shownGroups = groupStatus === 'all' ? groups : groups.filter((g) => g.status === groupStatus);
  /** กรุ๊ปถัดไปที่มีใบเสร็จรอตรวจ (ต่อจากกรุ๊ปที่เปิดอยู่ · หมดแล้ววนกลับต้นรายการ) — ใช้ได้ทั้งสองมุมมอง */
  const nextGroup = (() => {
    if (!reviewGroup) return null;
    const waiting = usageGroups.filter((g) => g.status === 'pending' && g.jobId !== reviewGroup);
    const at = usageGroups.findIndex((g) => g.jobId === reviewGroup);
    return waiting.find((g) => usageGroups.indexOf(g) > at) ?? waiting[0] ?? null;
  })();
  /** เปิดตรวจ — ใบเสร็จไปหน้าตรวจทั้งกรุ๊ป (เลื่อนไปที่ใบนั้น) · ใบเบิกอื่นเปิดรายใบ */
  const openDoc = (e: ExpenseRequest) => {
    if (isUsageReport(e)) { setFocusReport(e.id); setReviewGroup(e.jobId); }
    else setSelectedId(e.id);
  };

  const pendingCount = scoped.filter((e) => e.status === 'submitted').length;
  const reviseCount = scoped.filter((e) => e.status === 'revise').length;

  // แท็บ "อื่น ๆ" ขึ้นเฉพาะเมื่อมีใบ (เช่น ใบที่สร้างในระบบ / ใบเก่า) — ไม่มีแท็บว่างค้าง · ตัวเลข = จำนวนใบ
  const tabs = [
    { key: 'all', label: 'ทั้งหมด', badge: scoped.length },
    ...REVIEW_TABS
      .map((t) => ({ key: t.key, label: t.label, badge: scoped.filter((e) => reviewKindOf(e) === t.key).length }))
      .filter((t) => t.key !== 'other' || t.badge > 0),
  ];


  const columns: Column<ExpenseRequest>[] = [
    {
      // ประเภทอยู่หน้าสุด — ไม่แสดงเลขใบเบิก/อ้างอิง (ดูได้ในหน้ารายละเอียด · ค้นหาด้วยเลขได้)
      key: 'category',
      header: 'ประเภท',
      render: (expense) => <StatusBadge meta={expenseTypeOf(expense)} size="sm" dot={false} />,
    },
    {
      key: 'requester',
      header: 'ผู้ทำรายการ',
      render: (expense) => {
        const role = REQUESTER_ROLE[requesterRoleOf(expense, leaders)];
        return (
          <div>
            {/* หัวหน้าทัวร์ = ชื่อ นามสกุล (ชื่อเล่น) · ผู้ทำรายการอื่นใช้ชื่อที่บันทึกไว้ */}
            <p className="zego-text whitespace-nowrap">{requesterLabel(expense, leaders)}</p>
            <p className="zego-text-tertiary whitespace-nowrap text-xs">{role.label}</p>
            {/* วันเวลาที่ทำรายการ */}
            <p className="zego-text-tertiary whitespace-nowrap text-xs tabular-nums">{formatDateTime(requestedAtOf(expense))}</p>
          </div>
        );
      },
    },
    {
      key: 'ref',
      header: 'รายการทัวร์',
      render: (expense) => <ExpenseRefCell expense={expense} r={refOf(expense)} />,
    },
    {
      key: 'lines',
      header: 'รายการ',
      hideOnMobile: true,
      // รายการที่ทำมา (ไม่ใช่จำนวน) — บรรทัดแรก + ประเภทค่าใช้จ่าย · หลายบรรทัด = "และอีก n รายการ"
      render: (expense) => {
        const first = expense.lines[0];
        if (!first) return <span className="zego-text-tertiary">—</span>;
        return (
          <div className="min-w-[16rem] max-w-[36rem]">
            <p className="zego-text line-clamp-2 text-sm" title={expense.lines.map((l) => l.purpose).join(' · ')}>{lineTitle(first)}</p>
            <p className="zego-text-tertiary truncate text-xs">
              {first.expenseType}
              {expense.lines.length > 1 && ` · และอีก ${expense.lines.length - 1} รายการ`}
            </p>
          </div>
        );
      },
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
      render: (expense) => <StatusBadge meta={expenseStatusMeta(expense, reviewStatusOf(expense))} size="sm" />,
    },
  ];

  const hasFilter = query.trim() !== '' || (groupMode ? groupStatus !== 'all' : activeStatus !== 'all');

  /** คอลัมน์มุมมองกรุ๊ป — คอลัมน์ใบเสร็จ/เทียบใบเบิก ขึ้นเมื่อมีกรุ๊ปที่มีใบเสร็จ · คอลัมน์ใบเบิก ขึ้นเมื่อมีใบเบิก */
  const anyUsage = groups.some((g) => g.usage);
  const anyClaims = groups.some((g) => g.claims.length > 0);
  const groupColumns: Column<ReviewGroup>[] = [
    {
      key: 'group',
      header: 'รายการทัวร์',
      render: (g) => {
        const r = refOf(g.docs[0]);
        return (
          <div className="min-w-[14rem] max-w-[24rem]">
            <p className="zego-text whitespace-nowrap font-medium">{r.title}</p>
            {r.programName && <p className="zego-text-tertiary text-xs">{r.programName}</p>}
            {r.dates && <p className="zego-text-tertiary whitespace-nowrap text-xs tabular-nums">{r.dates}</p>}
          </div>
        );
      },
    },
    {
      key: 'leader',
      header: 'ผู้ทำรายการ',
      render: (g) => (
        <div>
          <p className="zego-text whitespace-nowrap">{requesterLabel(g.docs[0], leaders)}</p>
          <p className="zego-text-tertiary whitespace-nowrap text-xs tabular-nums">ส่งล่าสุด {formatDateTime(g.latest)}</p>
        </div>
      ),
    },
    ...(anyUsage ? [
      {
        key: 'receipts',
        header: 'ใบเสร็จ',
        render: (g: ReviewGroup) => (!g.usage ? <span className="zego-text-tertiary">—</span> : (
          <div className="whitespace-nowrap">
            {g.usage.pending > 0
              ? <p className="zego-text font-medium">รอตรวจ <span className="tabular-nums">{g.usage.pending}</span></p>
              : <p className="zego-text-secondary">ไม่มีรอตรวจ</p>}
            <p className="zego-text-tertiary text-xs">จากทั้งหมด <span className="tabular-nums">{g.usage.receipts}</span> ใบ</p>
          </div>
        )),
      },
      {
        key: 'budget',
        header: 'เทียบใบเบิก',
        hideOnMobile: true,
        // จุดที่ผู้ตรวจต้องดูเอง — รายการที่ใช้เกิน / ใบเสร็จนอกรายการเบิก
        render: (g: ReviewGroup) => (!g.usage ? <span className="zego-text-tertiary">—</span> : g.usage.over === 0 && g.usage.outside === 0
          ? <span className="text-xs font-medium text-emerald-700">ไม่เกินงบ</span>
          : (
            <div className="space-y-0.5 whitespace-nowrap text-xs">
              {g.usage.over > 0 && <p className="font-medium text-rose-700">เกิน {g.usage.over} รายการ</p>}
              {g.usage.outside > 0 && <p className="zego-text-warning">นอกรายการเบิก {g.usage.outside} ใบ</p>}
            </div>
          )),
      },
    ] : []),
    ...(anyClaims ? [{
      key: 'claims',
      header: 'ใบเบิก',
      // เบี้ยเลี้ยง / ค่าส่งกรุ๊ป / อื่น ๆ ของกรุ๊ปนี้ — ใบละบรรทัดพร้อมสถานะ
      render: (g: ReviewGroup) => (g.claims.length === 0 ? <span className="zego-text-tertiary">—</span> : (
        <div className="space-y-1">
          {g.claims.map((c) => (
            <p key={c.id} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
              <span className="zego-text-secondary">{EXPENSE_KIND_LABEL[reviewKindOf(c)]}</span>
              <StatusBadge meta={expenseStatusMeta(c, reviewStatusOf(c))} size="sm" />
            </p>
          ))}
        </div>
      )),
    }] : []),
    {
      key: 'status',
      header: 'สถานะ',
      render: (g) => <StatusBadge meta={USAGE_GROUP_STATUS[g.status]} size="sm" />,
    },
  ];

  /* แบ่งหน้า — เปลี่ยนแท็บ/คำค้น/ตัวกรอง/ขนาดหน้า กลับไปหน้าแรก */
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const pageSig = [tab, query, activeStatus, groupStatus, pageSize].join('|');
  const [prevPageSig, setPrevPageSig] = useState(pageSig);
  if (prevPageSig !== pageSig) { setPrevPageSig(pageSig); setPage(1); }
  const totalRows = groupMode ? shownGroups.length : filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = <T,>(rows: T[]) => rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  /* แท็บค่าใช้จ่ายจริง = รายงานการใช้เงิน — สถานะแค่ รอตรวจ / ให้แก้ไข / ตรวจแล้ว / ปฏิเสธ (ไม่มีรอจ่าย/จ่ายแล้ว) */

  return (
    <>
      <PageHeader
        title="ตรวจสอบรายการจ่าย"
        description="ตรวจใบเสร็จค่าใช้จ่ายจริงของหัวหน้าทัวร์เทียบกับใบเบิกเงินทดรอง และตรวจอนุมัติใบเบิกเบี้ยเลี้ยง / ค่าส่งกรุ๊ป · การโอนเงินอยู่ที่เมนูจ่ายเงิน"
        actions={
          <div className="flex flex-wrap gap-2">
            {/* ล้างใบเบิกที่ส่งเข้ามาทั้งหมด เพื่อทดสอบ flow ใหม่ — เอกสารเบิกค่าใช้จ่ายกรุ๊ป/ซองเงินไม่ถูกแตะ */}
            {submittedCount > 0 && (
              <Button
                variant="secondary"
                loading={resetting}
                onClick={async () => {
                  if (!window.confirm(`รีเซ็ตใบเบิกทั้งหมด ${submittedCount} ใบ?\nใบเบิกที่หัวหน้าทัวร์/เจ้าหน้าที่ส่งมา (และรูปหลักฐาน) จะถูกลบ — เอกสารเบิกค่าใช้จ่ายกรุ๊ปและซองเงินยังอยู่ · ย้อนกลับไม่ได้`)) return;
                  setResetting(true);
                  try {
                    await resetSubmittedExpenses();
                  } catch {
                    /* แจ้งผ่าน toast แล้ว */
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                รีเซ็ตใบเบิก (ทดสอบใหม่)
              </Button>
            )}
            {/* เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls / จัดซองเงิน) ย้ายไปเมนู "จัดการค่าใช้จ่ายกรุ๊ป" */}
            {canViewPath(currentUser.role, '/payments') && (
              <Link href="/payments" className="zego-button">
                <Icon name="money" className="h-4 w-4" />
                จ่ายเงิน
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

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <StatCard label="รอตรวจ / รออนุมัติ" value={pendingCount} tone="violet" hint="ใบเสร็จและใบเบิกที่ส่งแล้ว" />
        <StatCard label="ส่งกลับแก้ไข" value={reviseCount} tone="amber" hint="รอผู้ทำรายการแก้แล้วส่งใหม่" />
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as ReviewTab)} />
          </div>
          {/* มุมมอง — รายการ (ทีละใบ) / กรุ๊ป (รวมใบของกรุ๊ปเดียวกัน) · จำค่าไว้ */}
          <div className="mb-1 flex shrink-0 rounded-lg zego-surface-soft-bg p-0.5" role="group" aria-label="มุมมอง">
            {([['list', 'list', 'รายการ'], ['group', 'briefcase', 'กรุ๊ป']] as const).map(([v, icon, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => pickView(v)}
                className={cx('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition', view === v ? 'bg-emerald-600 text-white' : 'zego-text-secondary zego-hover-surface')}
              >
                <Icon name={icon} className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="ค้นหาเลขที่ใบเบิก รหัสกรุ๊ป ชื่อโปรแกรม หรือผู้ทำรายการ"
            label="ค้นหาใบเบิก"
          />
          {/* สถานะ — แตะทีเดียว · แสดงครบทุกสถานะ (ตัวเลข = จำนวนใบตามแท็บ/คำค้นปัจจุบัน · 0 = สีจาง) */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="สถานะใบเบิก">
            {(groupMode
              ? [['all', 'ทุกกรุ๊ป', groups.length] as const, ...(['pending', 'revise', 'done'] as const).map((st) => [st, USAGE_GROUP_STATUS[st].label, groupCounts.get(st) ?? 0] as const)]
              : [['all', 'ทั้งหมด', beforeStatus.length] as const, ...chipStatuses.map((st) => [st, chipLabel(st), statusCounts.get(st) ?? 0] as const)]
            ).map(([key, label, n]) => {
              const on = (groupMode ? groupStatus : activeStatus) === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (groupMode ? setGroupStatus(key as 'all' | UsageGroupStatus) : setStatus(key as 'all' | ExpenseStatus))}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                    on ? 'bg-emerald-600 text-white ring-emerald-600' : 'zego-surface-bg zego-text-secondary ring-[var(--zego-border-soft)] zego-hover-surface',
                    !on && n === 0 && 'opacity-60',
                  )}
                >
                  {label}
                  <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', on ? 'bg-white/20' : 'zego-surface-soft-bg')}>{n}</span>
                </button>
              );
            })}
            {hasFilter && (
              <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setStatus('all'); setGroupStatus('all'); }}>
                ล้างตัวกรอง
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        {groupMode ? (
          <DataTable
            columns={groupColumns}
            rows={pageSlice(shownGroups)}
            rowKey={(g) => g.key}
            // มีใบเสร็จ = ตรวจทั้งกรุ๊ป · ไม่มี = เปิดใบเบิกที่รอตรวจ (หรือใบแรก)
            onRowClick={(g) => {
              if (g.usage) { setFocusReport(null); setReviewGroup(g.jobId); }
              else setSelectedId((g.claims.find((c) => c.status === 'submitted') ?? g.claims[0]).id);
            }}
            emptyIcon={hasFilter ? 'search' : 'receipt'}
            emptyTitle={hasFilter ? 'ไม่พบกรุ๊ปที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบที่ส่งมาในหมวดนี้'}
            emptyDescription={hasFilter ? 'ลองปรับคำค้นหาหรือเปลี่ยนตัวกรองสถานะ' : undefined}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={pageSlice(filtered)}
            rowKey={(e) => e.id}
            onRowClick={openDoc}
            emptyIcon={hasFilter ? 'search' : 'receipt'}
            emptyTitle={hasFilter ? 'ไม่พบใบเบิกที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบเบิกในหมวดนี้'}
            emptyDescription={
              hasFilter
                ? 'ลองปรับคำค้นหาหรือเปลี่ยนตัวกรองสถานะ'
                : 'กดปุ่ม “สร้างใบเบิก” เพื่อเริ่มต้น'
            }
          />
        )}
        {totalRows > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm zego-text-secondary">
            <span>พบ <strong className="zego-text tabular-nums">{totalRows.toLocaleString()}</strong> {groupMode ? 'กรุ๊ป' : 'รายการ'}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs">แสดง
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="zego-border-color zego-surface-bg rounded-lg border px-2 py-1 text-sm">
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>/หน้า
              </label>
              <span className="tabular-nums">หน้า {safePage}/{totalPages}</span>
              <div className="inline-flex gap-1">
                <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>ก่อนหน้า</Button>
                <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>ถัดไป</Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <ExpenseFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        expense={editing}
      />

      <GroupUsageReviewDrawer
        groupId={reviewGroup}
        focusReportId={focusReport}
        onClose={() => { setReviewGroup(null); setFocusReport(null); }}
        onOpenReport={(id, action) => { setFromGroup(reviewGroup); setReviewGroup(null); setStartAction(action ?? null); setSelectedId(id); }}
        onNext={nextGroup ? () => { setFocusReport(null); setReviewGroup(nextGroup.jobId); } : undefined}
        nextLabel={nextGroup ? refOf(nextGroup.reports[0]).title : undefined}
      />

      <ExpenseDrawer
        expense={selected}
        hidePayment
        startAction={startAction}
        onClose={() => {
          setSelectedId(null);
          setStartAction(null);
          // เปิดมาจากตรวจทั้งกรุ๊ป — ปิดแล้วกลับไปที่กรุ๊ปเดิม
          if (fromGroup) { setReviewGroup(fromGroup); setFromGroup(null); }
        }}
        onEdit={(expense) => {
          setSelectedId(null);
          setStartAction(null);
          setEditingId(expense.id);
          setFormOpen(true);
        }}
      />
    </>
  );
}
