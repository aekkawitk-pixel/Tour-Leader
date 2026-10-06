'use client';

/**
 * แผงรายละเอียดค่าใช้จ่าย — ใช้ในพอร์ทัลหัวหน้าทัวร์เพื่อดูรายการที่บันทึกไปแล้ว
 *
 * ดูรูปหลักฐานได้ (แตะภาพย่อ = เต็มจอ) · แก้ไขเองได้ขณะบัญชียังไม่ตรวจ (ส่งอนุมัติ) หรือบัญชีส่งกลับมาให้แก้ (ให้แก้ไข)
 * สถานะอื่น (อนุมัติ/รอจ่าย/จ่ายแล้ว) เงินอาจขยับไปแล้ว → ต้องแจ้งเจ้าหน้าที่บัญชีเท่านั้น
 * ใบเบิกที่ส่งหลายใบเสร็จพร้อมกัน: การ์ดละใบเสร็จ แก้ทีละใบ · บัญชีส่งกลับแก้ไข = ใบที่ต้องแก้มีป้าย "ต้องแก้"
 *   แก้ครบแล้วกด "ส่งให้บัญชีตรวจอีกครั้ง" (ทั้งใบกลับไปส่งอนุมัติ)
 * ต่างจาก ExpenseDrawer ฝั่งบัญชี (src/components/expenses/ExpenseDrawer.tsx) ตรงที่ไม่มีปุ่มอนุมัติ/ปฏิเสธ/บันทึกจ่ายเงิน
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Drawer, ConfirmDialog } from '@/components/ui/Modal';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { Timeline } from '@/components/ui/Timeline';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { expenseApprovedTotals, expenseOriginalTotals, groupAmountsByCurrency } from './expenseAmounts';
import { CurrencyStack } from './CurrencyStack';
import { EvidencePreview } from './EvidencePreview';
import { GuideExpenseEditForm } from './GuideExpenseEditForm';
import type { ExpenseLine, ExpenseRequest, ExpenseStatus } from '@/types';
import { receiptGroups } from '@/lib/logic/expenseReceipts';
import { expenseStatusMeta, isUsageReport } from '@/lib/logic/usageReport';

export function GuideExpenseDetailDrawer({
  expense: expenseProp,
  onClose,
}: {
  expense: ExpenseRequest | null;
  onClose: () => void;
}) {
  const { changeExpenseStatus, saving, expenses } = useDemo();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  /** ใบที่กำลังแก้ — ผูกกับ id กันค้างโหมดแก้ไขเมื่อเปิดใบอื่น · receiptKey = แก้เฉพาะใบเสร็จนั้น (ใบที่มีหลายใบเสร็จ) */
  const [editingTarget, setEditingTarget] = useState<{ id: string; receiptKey?: string } | null>(null);
  const setEditingId = (id: string | null) => setEditingTarget(id ? { id } : null);

  // ผู้เรียกส่งออบเจกต์ที่ถือไว้ตอนกดเปิด — อ่านฉบับล่าสุดจาก Store ตาม id เสมอ (หลังแก้ไขจะเห็นข้อมูลใหม่ทันที)
  const expense = expenseProp ? (expenses.find((e) => e.id === expenseProp.id) ?? expenseProp) : null;
  if (!expense) return null;
  const editing = editingTarget?.id === expense.id;
  const groups = receiptGroups(expense.lines);
  const many = groups.length > 1;
  const editingIndex = many ? groups.findIndex((g) => g.key === editingTarget?.receiptKey) : -1;
  const pendingFix = expense.lines.some((l) => l.needsFix);
  const close = () => {
    setEditingId(null);
    onClose();
  };

  const lastNote = expense.history.filter((h) => h.to === expense.status).at(-1)?.note;
  const originalTotals = expenseOriginalTotals(expense);
  const approvedTotals = expenseApprovedTotals(expense);
  const partial = expense.lines.some((l) => l.rejected);
  // ยกเลิกเองได้เฉพาะตอนยังรอบัญชีตรวจ — เผื่อบันทึกซ้ำแล้วอยากลบทิ้งกันสับสน
  // อนุมัติ/รอจ่าย/จ่ายแล้วไปแล้ว ต้องแจ้งบัญชีเท่านั้น (เงินอาจขยับไปแล้ว)
  const canCancel = expense.status === 'submitted';
  // แก้ไขเองได้ตอนบัญชียังไม่ตรวจ หรือบัญชีส่งกลับมาให้แก้ — บันทึกแล้ว "ให้แก้ไข" จะกลับเป็น "ส่งอนุมัติ"
  const canEdit = expense.status === 'submitted' || expense.status === 'revise';

  const resubmit = async () => {
    await changeExpenseStatus(expense.id, 'submitted', 'หัวหน้าทัวร์แก้ไขแล้ว ส่งให้บัญชีตรวจอีกครั้ง');
    close();
  };

  const confirmCancel = async () => {
    await changeExpenseStatus(expense.id, 'cancelled', 'หัวหน้าทัวร์ยกเลิกรายการนี้เอง (บันทึกซ้ำ)');
    setConfirmCancelOpen(false);
    close();
  };

  return (
    <>
      <Drawer
        open={expense !== null}
      onClose={close}
      // ใบเสร็จค่าใช้จ่ายจริง = รายงานการใช้เงิน ไม่ใช่ใบเบิก — ไม่แสดงเลข EXP
      title={isUsageReport(expense)
        ? (editing ? `แก้ไขใบเสร็จ${editingIndex >= 0 ? `ที่ ${editingIndex + 1}` : ''}` : 'ใบเสร็จค่าใช้จ่าย')
        : (editing ? `แก้ไขค่าใช้จ่าย ${expense.id}` : `ค่าใช้จ่าย ${expense.id}`)}
      description={`บันทึกเมื่อ ${formatDateTime(expense.submittedAt ?? expense.requestedAt)}`}
      footer={
        editing ? undefined : (
          <>
            <Button variant="secondary" onClick={close}>
              ปิด
            </Button>
            {canCancel && (
              <Button variant="danger" onClick={() => setConfirmCancelOpen(true)} disabled={saving}>
                ยกเลิกรายการนี้
              </Button>
            )}
            {canEdit && !many && (
              <Button variant="primary" icon="edit" onClick={() => setEditingId(expense.id)} disabled={saving}>
                แก้ไข
              </Button>
            )}
            {/* หลายใบเสร็จ — แก้ที่การ์ดของแต่ละใบ แล้วส่งกลับทั้งใบครั้งเดียว */}
            {many && expense.status === 'revise' && (
              <Button variant="primary" onClick={resubmit} disabled={saving || pendingFix} title={pendingFix ? 'แก้ใบเสร็จที่มีป้าย "ต้องแก้" ให้ครบก่อน' : undefined}>
                ส่งให้บัญชีตรวจอีกครั้ง
              </Button>
            )}
          </>
        )
      }
    >
      {editing ? (
        <GuideExpenseEditForm expense={expense} receiptId={many ? editingTarget?.receiptKey : undefined} onCancel={() => setEditingId(null)} onSaved={() => setEditingId(null)} />
      ) : (
      <div className="space-y-4">
        <StatusBadge meta={expenseStatusMeta(expense)} />

        {(expense.status === 'revise' || expense.status === 'rejected') && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm zego-text-warning">
            {lastNote ?? 'กรุณาติดต่อเจ้าหน้าที่บัญชีเพื่อขอรายละเอียดเพิ่มเติม'}
            <p className="mt-1 text-xs zego-text-warning">
              {expense.status === 'rejected'
                ? 'รายการที่ถูกปฏิเสธ ต้องแจ้งเจ้าหน้าที่บัญชีเท่านั้น'
                : many
                  ? 'แก้ใบเสร็จที่มีป้าย "ต้องแก้" แล้วกด "ส่งให้บัญชีตรวจอีกครั้ง"'
                  : 'กด "แก้ไข" ด้านล่างเพื่อแก้แล้วส่งให้บัญชีตรวจอีกครั้ง'}
            </p>
          </div>
        )}

        {/* การ์ดละใบเสร็จ — หัวการ์ดแสดงประเภท+ยอด ตามด้วยรายการย่อย แล้วปิดท้ายด้วยวันที่ใบเสร็จ/หลักฐาน
            (บรรทัดในใบเสร็จเดียวกันใช้วันที่/ไฟล์เดียวกัน) · ใบเบิกแบบเดิม = การ์ดเดียว */}
        {groups.map((g, gi) => (
          <ReceiptCard
            key={g.key}
            lines={g.lines}
            title={many ? `ใบเสร็จที่ ${gi + 1}` : undefined}
            onEdit={many && canEdit ? () => setEditingTarget({ id: expense.id, receiptKey: g.key }) : undefined}
            saving={saving}
          />
        ))}

        <div className="space-y-1 rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-200">
          {partial && (
            <div className="flex items-start justify-between text-xs zego-text-tertiary">
              <span>ยอดที่ขอ</span>
              <CurrencyStack totals={originalTotals} className="text-right" lineClassName="tabular-nums line-through" />
            </div>
          )}
          <div className="flex items-start justify-between">
            <span className="text-sm font-semibold zego-text-success">{partial ? 'ยอดอนุมัติ (บางรายการ)' : 'ยอดรวมทั้งใบ'}</span>
            <CurrencyStack totals={approvedTotals} className="text-right" lineClassName="text-lg font-bold tabular-nums zego-text-success" />
          </div>
        </div>

        {expense.note && (
          <div className="rounded-lg zego-surface-soft-bg px-4 py-3">
            <p className="text-xs font-semibold zego-text-tertiary">หมายเหตุ</p>
            <p className="mt-1 text-sm zego-text-secondary whitespace-pre-wrap">{expense.note}</p>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold zego-text">Timeline การอนุมัติ</h3>
          <Timeline
            events={expense.history}
            resolve={(key) => (EXPENSE_STATUS[key as ExpenseStatus] ? expenseStatusMeta(expense, key as ExpenseStatus) : { label: key, tone: 'slate' })}
          />
        </div>
      </div>
      )}
    </Drawer>

    <ConfirmDialog
      open={confirmCancelOpen}
      onClose={() => setConfirmCancelOpen(false)}
      onConfirm={confirmCancel}
      loading={saving}
      tone="danger"
      title="ยกเลิกรายการนี้?"
      message={`ยืนยันว่าจะยกเลิก${isUsageReport(expense) ? 'ใบเสร็จนี้' : `ค่าใช้จ่าย ${expense.id}`} — ใช้เมื่อบันทึกซ้ำโดยไม่ตั้งใจ รายการนี้จะไม่ถูกส่งเข้าคิวตรวจของบัญชี`}
      confirmLabel="ยกเลิกรายการ"
    />
    </>
  );
}

function ReceiptCard({ lines, title, onEdit, saving }: { lines: ExpenseLine[]; title?: string; onEdit?: () => void; saving: boolean }) {
  const first = lines[0];
  const fix = lines.some((l) => l.needsFix);
  const totals = groupAmountsByCurrency(lines.filter((l) => !l.rejected).map((l) => ({ amount: l.amount, currency: l.currency })));
  return (
    <div className={cx('overflow-hidden rounded-xl border', fix ? 'border-amber-300 ring-1 ring-amber-200' : 'zego-border-color')}>
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Icon name="receipt" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {title && (
            <p className="flex items-center gap-1.5 text-xs font-semibold zego-text-tertiary">
              {title}
              {fix && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-200">ต้องแก้</span>}
            </p>
          )}
          <p className="truncate text-base font-bold zego-text">{first?.expenseType ?? '—'}</p>
          <p className="text-sm zego-text-tertiary">{lines.length} รายการ</p>
        </div>
        <CurrencyStack totals={totals} className="shrink-0 text-right" lineClassName="text-lg font-bold tabular-nums zego-text-success" />
      </div>

      <div className="divide-y divide-[var(--zego-border-soft)] zego-divider-top">
        {lines.map((line, i) => (
          <div key={line.id} className={cx('px-4 py-3', line.rejected && 'bg-rose-50/50')}>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold zego-text-success">
                {i + 1}
              </span>
              <span className={cx('min-w-0 flex-1 truncate text-sm', line.rejected ? 'zego-text-tertiary' : 'zego-text')}>{line.purpose}</span>
              <span
                className={cx(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  line.rejected ? 'line-through zego-text-tertiary' : line.amount < 0 ? 'zego-text-danger' : 'zego-text',
                )}
              >
                {formatCurrency(line.amount, line.currency)}
              </span>
            </div>
            {/* บัญชีไม่อนุมัติบรรทัดนี้ (อนุมัติบางรายการ) — บอกเหตุผลให้หัวหน้าทัวร์ */}
            {line.rejected && (
              <p className="ml-10 mt-1 text-xs text-rose-700">
                <span className="font-semibold">ไม่อนุมัติ</span>
                {line.rejectNote ? ` — ${line.rejectNote}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 zego-divider-top zego-surface-soft-bg px-4 py-3 text-xs zego-text-tertiary">
        {first?.receiptDate && (
          <span className="flex items-center gap-1.5">
            <Icon name="calendar" className="h-4 w-4 shrink-0 zego-text-tertiary" />
            <span>
              <span className="block">วันที่ใบเสร็จ</span>
              <span className="block font-medium zego-text-secondary">{formatDate(first.receiptDate)}</span>
            </span>
          </span>
        )}
        <EvidencePreview fileName={first?.evidenceFileName} image={first?.evidenceImage} />
        {onEdit && (
          <Button size="sm" variant={fix ? 'primary' : 'secondary'} icon="edit" className="ml-auto" onClick={onEdit} disabled={saving}>
            แก้ไขใบเสร็จนี้
          </Button>
        )}
      </div>
    </div>
  );
}
