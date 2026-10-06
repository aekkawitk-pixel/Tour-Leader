'use client';

/**
 * จ่ายเงิน — โอนเงินใบเบิกที่ตรวจอนุมัติแล้ว (เบี้ยเลี้ยง · ค่าส่งกรุ๊ป · อื่น ๆ)
 * แยกจาก "ตรวจสอบรายการจ่าย" ที่เป็นคิวตรวจอย่างเดียว · ใบเสร็จค่าใช้จ่ายจริงไม่มาที่นี่ (ดู lib/logic/payments.ts)
 * ขั้นจ่าย: รอตั้งเรื่องจ่าย → รอโอน → จ่ายแล้ว — กดแถวเปิดรายละเอียดเพื่อตั้งเรื่อง / บันทึกจ่าย
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { canViewPath } from '@/lib/permissions';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { Button, Card, cx, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { CurrencyStatCard } from '@/components/ui/CurrencyStatCard';
import { SearchBox } from '@/components/ui/FormField';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { CurrencyStack } from '@/app/guide/expenses/CurrencyStack';
import { expenseApprovedTotals, isPartiallyApproved, sumByCurrency } from '@/app/guide/expenses/expenseAmounts';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import {
  EXPENSE_KIND_LABEL, expenseKindOf, expenseRef, ExpenseRefCell, expenseTypeOf, REQUESTER_ROLE, requesterLabel, requesterRoleOf,
  type ExpenseKind,
} from '@/components/expenses/expenseKinds';
import { isPayable, PAY_STAGE, PAY_STAGES, sortForPayment, type PayStage } from '@/lib/logic/payments';
import type { ExpenseRequest } from '@/types';

type PayTab = 'all' | Exclude<ExpenseKind, 'actual'>;
const PAY_TABS: Exclude<PayTab, 'all'>[] = ['per_diem', 'sendoff', 'other'];

export default function PaymentsPage() {
  const { expenses, jobs, leaders, currentUser } = useDemo();
  const [tab, setTab] = useState<PayTab>('all');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<'all' | PayStage>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = expenses.find((e) => e.id === selectedId) ?? null;

  const payable = useMemo(() => sortForPayment(expenses.filter(isPayable)), [expenses]);
  const refOf = useCallback((e: ExpenseRequest) => expenseRef(e, jobs), [jobs]);

  const beforeStage = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payable.filter((e) => {
      if (tab !== 'all' && expenseKindOf(e) !== tab) return false;
      if (!q) return true;
      const r = refOf(e);
      return [e.id, e.paidRef ?? '', r.title, ...r.codes, r.programName, requesterLabel(e, leaders), e.bankAccount.accountName]
        .join(' ').toLowerCase().includes(q);
    });
  }, [payable, tab, query, refOf, leaders]);
  const stageCounts = useMemo(() => {
    const m = new Map<PayStage, number>();
    for (const e of beforeStage) m.set(e.status as PayStage, (m.get(e.status as PayStage) ?? 0) + 1);
    return m;
  }, [beforeStage]);
  const shown = stage === 'all' ? beforeStage : beforeStage.filter((e) => e.status === stage);

  const toPay = payable.filter((e) => e.status !== 'paid');
  const paid = payable.filter((e) => e.status === 'paid');

  const tabs = [
    { key: 'all', label: 'ทั้งหมด', badge: payable.length },
    ...PAY_TABS
      .map((k) => ({ key: k, label: EXPENSE_KIND_LABEL[k], badge: payable.filter((e) => expenseKindOf(e) === k).length }))
      .filter((t) => t.key !== 'other' || t.badge > 0),
  ];

  /* แบ่งหน้า — เปลี่ยนแท็บ/คำค้น/ตัวกรอง/ขนาดหน้า กลับไปหน้าแรก */
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const pageSig = [tab, query, stage, pageSize].join('|');
  const [prevPageSig, setPrevPageSig] = useState(pageSig);
  if (prevPageSig !== pageSig) { setPrevPageSig(pageSig); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = shown.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: Column<ExpenseRequest>[] = [
    {
      key: 'category',
      header: 'ประเภท',
      render: (e) => <StatusBadge meta={expenseTypeOf(e)} size="sm" dot={false} />,
    },
    {
      key: 'payee',
      header: 'ผู้รับเงิน',
      render: (e) => (
        <div>
          <p className="zego-text whitespace-nowrap">{requesterLabel(e, leaders)}</p>
          <p className="zego-text-tertiary whitespace-nowrap text-xs">{REQUESTER_ROLE[requesterRoleOf(e, leaders)].label}</p>
          {/* บัญชีรับเงิน (ปิดบังเลข) */}
          {e.bankAccount.bank
            ? <p className="zego-text-tertiary whitespace-nowrap text-xs">{e.bankAccount.bank} {e.bankAccount.accountNoMasked}</p>
            : <p className="whitespace-nowrap text-xs zego-text-warning">ยังไม่มีบัญชีรับเงิน</p>}
        </div>
      ),
    },
    {
      key: 'ref',
      header: 'รายการทัวร์',
      render: (e) => <ExpenseRefCell expense={e} r={refOf(e)} />,
    },
    {
      key: 'total',
      header: 'ยอดที่ต้องจ่าย',
      align: 'right',
      // ยอดอนุมัติ ตามสกุลเงินที่ทำรายการมา (ไม่แปลงเป็นบาท)
      render: (e) => (
        <span className="block text-right">
          <CurrencyStack totals={expenseApprovedTotals(e)} className="whitespace-nowrap" lineClassName="zego-text font-semibold tabular-nums" />
          {isPartiallyApproved(e) && <span className="block text-[11px] text-rose-600">อนุมัติบางรายการ</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (e) => (
        <div>
          <StatusBadge meta={PAY_STAGE[e.status as PayStage]} size="sm" />
          {e.status === 'paid' && (
            <p className="zego-text-tertiary mt-1 whitespace-nowrap text-xs">
              {e.paidAt ? formatDate(e.paidAt) : ''}{e.paidRef ? ` · ${e.paidRef}` : ''}
            </p>
          )}
        </div>
      ),
    },
  ];

  const hasFilter = query.trim() !== '' || stage !== 'all';

  return (
    <>
      <PageHeader
        title="จ่ายเงิน"
        description="โอนเงินใบเบิกที่ตรวจอนุมัติแล้ว — เบี้ยเลี้ยง · ค่าส่งกรุ๊ป · กดแถวเพื่อตั้งเรื่องรอจ่ายหรือบันทึกการจ่าย"
        actions={canViewPath(currentUser.role, '/expenses') ? (
          <Link href="/expenses" className="zego-button">
            <Icon name="receipt" className="h-4 w-4" />
            ตรวจสอบรายการจ่าย
          </Link>
        ) : undefined}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {/* ยอดเงินหลายสกุล — จำนวนใบเป็นตัวเลขหลัก ยอดเรียงบรรทัดละสกุล */}
        <CurrencyStatCard label="รอจ่าย" count={toPay.length} totals={sumByCurrency(toPay)} tone="blue" hint="อนุมัติแล้ว ยังไม่ได้โอน" />
        <CurrencyStatCard label="จ่ายแล้ว (สะสม)" count={paid.length} totals={sumByCurrency(paid)} tone="green" hint="บันทึกการจ่ายแล้ว" />
      </div>

      <Card className="mb-5">
        <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as PayTab)} />
        <div className="mt-4 space-y-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="ค้นหาผู้รับเงิน รหัสกรุ๊ป เลขที่ใบเบิก หรือเลขอ้างอิงการจ่าย"
            label="ค้นหาการจ่ายเงิน"
          />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="สถานะการจ่าย">
            {([['all', 'ทั้งหมด', beforeStage.length] as const, ...PAY_STAGES.map((st) => [st, PAY_STAGE[st].label, stageCounts.get(st) ?? 0] as const)]).map(([key, label, n]) => {
              const on = stage === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStage(key)}
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
              <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setStage('all'); }}>ล้างตัวกรอง</Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(e) => e.id}
          onRowClick={(e) => setSelectedId(e.id)}
          emptyIcon={hasFilter ? 'search' : 'money'}
          emptyTitle={hasFilter ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบเบิกที่ต้องจ่าย'}
          emptyDescription={hasFilter ? 'ลองปรับคำค้นหาหรือเปลี่ยนตัวกรองสถานะ' : 'ใบเบิกที่ตรวจอนุมัติแล้วจะมาที่นี่'}
        />
        {shown.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm zego-text-secondary">
            <span>พบ <strong className="zego-text tabular-nums">{shown.length.toLocaleString()}</strong> รายการ</span>
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

      <ExpenseDrawer expense={selected} onClose={() => setSelectedId(null)} onEdit={() => setSelectedId(null)} />
    </>
  );
}
