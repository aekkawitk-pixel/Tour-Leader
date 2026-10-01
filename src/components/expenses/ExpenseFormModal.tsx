'use client';

/** ฟอร์มสร้าง / แก้ไขใบเบิก — เพิ่มได้หลายรายการในใบเดียว และคำนวณยอดรวมทันที */

import { useMemo, useState } from 'react';
import { Combobox } from '@/components/ui/Combobox';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { budgetLineAmount } from '@/lib/logic/groupBudget';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout, cx, EmptyState } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { MONEY_CATEGORY, MONEY_CATEGORY_ORDER } from '@/lib/labels';
import { formatDateRange, formatTHB, toISODate } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { primaryBankAccount } from '@/lib/logic/leaderProfile';
import type { ExpenseLine, ExpenseRequest, MoneyCategory } from '@/types';

interface LineDraft {
  id: string;
  expenseType: string;
  purpose: string;
  amount: string;
  currency: string;
  fxRate: string;
  receiptNo: string;
  evidenceFileName: string;
  /** รายการงบ (เงินทดรอง) — จำนวน × ราคา/หน่วย − ส่วนลด = จำนวนเงิน */
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

/** ตัวเลือกกรุ๊ปในช่อง "งานทัวร์" — ทั้งงานเดิม (JOB-…) และกรุ๊ปจาก Tour Period Master ที่หัวหน้าทัวร์ใช้บันทึกใบเสร็จ */
interface GroupOption {
  id: string;
  label: string;
  sub?: string;
}

let lineSeq = 500;
const newLine = (currency = 'THB', fxRate = '1'): LineDraft => {
  lineSeq += 1;
  return {
    id: `L-${lineSeq}`,
    expenseType: '',
    purpose: '',
    amount: '',
    currency,
    fxRate,
    receiptNo: '',
    evidenceFileName: '',
    description: '',
    quantity: '',
    unitPrice: '',
    discount: '',
  };
};

const optionalNumber = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
/** จำนวนเงินของบรรทัด — มีจำนวน+ราคา/หน่วย ใช้ผลคำนวณ ไม่งั้นใช้ยอดที่กรอกตรง ๆ */
const lineAmount = (line: LineDraft): number =>
  budgetLineAmount(optionalNumber(line.quantity), optionalNumber(line.unitPrice), Number(line.discount || 0))
  ?? Number(line.amount || 0);
const toTHB = (line: LineDraft) => lineAmount(line) * Number(line.fxRate || 0);

/** เปิดเมื่อ open = true เท่านั้น เพื่อให้ฟอร์มเริ่มต้นใหม่ทุกครั้ง (ไม่ต้อง reset ผ่าน effect) */
export function ExpenseFormModal({
  open,
  onClose,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  expense: ExpenseRequest | null;
}) {
  if (!open) return null;
  return <ExpenseForm key={expense?.id ?? 'new'} onClose={onClose} expense={expense} />;
}

function ExpenseForm({
  onClose,
  expense,
}: {
  onClose: () => void;
  expense: ExpenseRequest | null;
}) {
  const { master, jobs, leaders, saveExpense, createExpenseId, saving, currentUser, today } =
    useDemo();

  const [jobId, setJobId] = useState(expense?.jobId ?? '');
  const [category, setCategory] = useState<MoneyCategory>(expense?.category ?? 'advance');
  const [note, setNote] = useState(expense?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    expense
      ? expense.lines.map((l) => ({
          id: l.id,
          expenseType: l.expenseType,
          purpose: l.purpose,
          amount: String(l.amount),
          currency: l.currency,
          fxRate: String(l.fxRate),
          receiptNo: l.receiptNo === '—' ? '' : l.receiptNo,
          evidenceFileName: l.evidenceFileName === 'ไม่มีหลักฐาน' ? '' : l.evidenceFileName,
          description: l.description ?? '',
          quantity: l.quantity !== undefined ? String(l.quantity) : '',
          unitPrice: l.unitPrice !== undefined ? String(l.unitPrice) : '',
          discount: l.discount ? String(l.discount) : '',
        }))
      : [newLine()],
  );
  const [errors, setErrors] = useState<{ jobId?: string; lines?: string }>({});

  const currencyOptions = useMemo(
    () => master.currencies.filter((c) => c.active),
    [master.currencies],
  );

  const total = lines.reduce((sum, line) => sum + toTHB(line), 0);

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        // เปลี่ยนสกุลเงิน → ดึงอัตราแลกเปลี่ยนจากข้อมูลตั้งต้นให้อัตโนมัติ
        if (patch.currency) {
          const rate = currencyOptions.find((c) => c.code === patch.currency)?.extra;
          if (rate) next.fxRate = rate;
        }
        return next;
      }),
    );
    setErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!jobId) next.jobId = 'กรุณาเลือกงานทัวร์';
    const invalid = lines.some(
      (l) => !l.expenseType || !l.purpose.trim() || !(lineAmount(l) > 0),
    );
    if (lines.length === 0) next.lines = 'ต้องมีอย่างน้อย 1 รายการ';
    else if (invalid)
      next.lines = 'ทุกรายการต้องระบุประเภทค่าใช้จ่าย วัตถุประสงค์ และจำนวนเงินที่มากกว่า 0';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildExpense = async (status: 'draft' | 'submitted'): Promise<ExpenseRequest> => {
    const id = expense?.id ?? (await createExpenseId());
    const leader = leaders.find((l) => l.id === currentUser.leaderId);

    const builtLines: ExpenseLine[] = lines.map((line) => ({
      id: line.id,
      expenseType: line.expenseType,
      purpose: line.purpose.trim(),
      amount: lineAmount(line),
      currency: line.currency,
      fxRate: Number(line.fxRate || 1),
      amountTHB: Math.round(toTHB(line)),
      receiptNo: line.receiptNo.trim() || '—',
      evidenceFileName: line.evidenceFileName.trim() || 'ไม่มีหลักฐาน',
      ...(line.description.trim() ? { description: line.description.trim() } : {}),
      ...(optionalNumber(line.quantity) !== undefined ? { quantity: optionalNumber(line.quantity) } : {}),
      ...(optionalNumber(line.unitPrice) !== undefined ? { unitPrice: optionalNumber(line.unitPrice) } : {}),
      ...(Number(line.discount || 0) ? { discount: Number(line.discount) } : {}),
    }));

    // ใช้บัญชีหลักของหัวหน้าทัวร์ (เลขบัญชีถูกปิดบังไว้แล้ว)
    const primaryBank = leader ? primaryBankAccount(leader) : undefined;

    const base: ExpenseRequest = expense ?? {
      id,
      jobId,
      category,
      requesterId: currentUser.leaderId ?? currentUser.id,
      requesterName: currentUser.name,
      requestedAt: toISODate(new Date()), // วันที่จริง ไม่ใช่วันที่จำลองของ Demo
      lines: [],
      totalTHB: 0,
      bankAccount: primaryBank
        ? {
            bank: primaryBank.bank,
            accountNoMasked: primaryBank.accountNoMasked,
            accountName: primaryBank.accountName,
            branch: primaryBank.branch ?? '—',
          }
        : {
            bank: '—',
            accountNoMasked: 'xxx-x-xxxxx-x',
            accountName: currentUser.name,
            branch: '—',
          },
      note: '',
      status: 'draft',
      history: [makeStatusEvent(null, 'draft', currentUser.name, `${today}T09:00`)],
    };

    const history = [...base.history];
    if (status === 'submitted' && base.status !== 'submitted') {
      history.push(makeStatusEvent(base.status, 'submitted', currentUser.name, `${today}T09:00`));
    }

    return {
      ...base,
      id,
      jobId,
      category,
      lines: builtLines,
      totalTHB: builtLines.reduce((sum, l) => sum + l.amountTHB, 0),
      note,
      status,
      history,
    };
  };

  const submit = async (status: 'draft' | 'submitted') => {
    if (!validate()) return;
    const next = await buildExpense(status);
    await saveExpense(next);
    onClose();
  };

  /*
   * งานเดิม (JOB-…) + กรุ๊ปจาก Tour Period Master — หัวหน้าทัวร์บันทึกใบเสร็จผูกกับรหัสกรุ๊ปของ Master
   * ใบเบิกเงินทดรองจึงต้องเลือกกรุ๊ปชุดเดียวกัน ไม่งั้นรายการงบไม่ไปโผล่ฝั่งหัวหน้าทัวร์
   */
  const groupOptions = useMemo<GroupOption[]>(() => [
    ...jobs.filter((j) => j.status !== 'draft').map((j) => ({ id: j.id, label: `${j.id} — ${j.title}` })),
    ...getTourPeriods()
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((p) => ({
        id: p.internalId,
        label: `${p.groupCode} — ${p.displayName}`,
        sub: `${p.countryName} · ${formatDateRange(p.startDate, p.endDate)}`,
      })),
  ], [jobs]);
  const [groupQuery, setGroupQuery] = useState('');
  const groupMatches = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    const list = q ? groupOptions.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q)) : groupOptions;
    return list.slice(0, 50); // รายการยาวหลายพัน — แสดงผลค้นหาแค่ช่วงต้น พิมพ์เพิ่มเพื่อแคบลง
  }, [groupOptions, groupQuery]);
  const selectedGroupLabel = groupOptions.find((o) => o.id === jobId)?.label ?? jobId;
  const isBudget = category === 'advance';

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={expense ? `แก้ไขใบเบิก ${expense.id}` : 'สร้างใบเบิกใหม่'}
      description="เพิ่มได้หลายรายการในใบเดียว ระบบคำนวณยอดรวมเป็นเงินบาทให้อัตโนมัติ"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="secondary" onClick={() => submit('draft')} loading={saving}>
            บันทึกร่าง
          </Button>
          <Button variant="primary" onClick={() => submit('submitted')} loading={saving}>
            บันทึกและส่งอนุมัติ
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Combobox<GroupOption>
            label="งานทัวร์ / กรุ๊ป"
            required
            placeholder="ค้นหารหัสกรุ๊ป หรือชื่อโปรแกรม"
            value={selectedGroupLabel}
            items={groupMatches}
            getKey={(o) => o.id}
            getLabel={(o) => o.label}
            getSubLabel={(o) => o.sub}
            onSearch={setGroupQuery}
            onSelect={(o) => {
              setJobId(o?.id ?? '');
              setGroupQuery('');
              setErrors((prev) => ({ ...prev, jobId: undefined }));
            }}
            error={errors.jobId}
            emptyMessage="ไม่พบกรุ๊ปที่ค้นหา"
          />
          <SelectInput
            label="ประเภทเงิน"
            required
            options={MONEY_CATEGORY_ORDER.map((c) => ({
              value: c,
              label: MONEY_CATEGORY[c].label,
            }))}
            value={category}
            onChange={(e) => setCategory(e.target.value as MoneyCategory)}
          />
        </div>

        {/* รายการค่าใช้จ่าย */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold zego-text">
              รายการค่าใช้จ่าย ({lines.length})
            </h3>
            <Button
              size="sm"
              variant="secondary"
              icon="plus"
              onClick={() => setLines((prev) => [...prev, newLine()])}
            >
              เพิ่มรายการ
            </Button>
          </div>

          {errors.lines && (
            <p className="mb-2 rounded-lg border zego-warned-border zego-warned-tint px-3 py-2 text-xs font-medium zego-text-danger">
              {errors.lines}
            </p>
          )}

          {lines.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="ยังไม่มีรายการ"
              description="กดปุ่ม “เพิ่มรายการ” เพื่อเริ่มกรอก"
            />
          ) : (
            <ul className="space-y-3">
              {lines.map((line, index) => (
                <li key={line.id} className="zego-border-color zego-surface-soft-bg rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold zego-text-tertiary">
                      รายการที่ {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                      aria-label={`ลบรายการที่ ${index + 1}`}
                      className="rounded p-1 zego-text-disabled hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SelectInput
                      label={isBudget ? 'หมวด' : 'ประเภทค่าใช้จ่าย'}
                      required
                      placeholder="เลือกประเภท"
                      options={[
                        ...master.expenseTypes.filter((t) => t.active).map((t) => ({ value: t.name, label: t.name })),
                        // หมวดจากระบบเดิม (API) ที่ไม่มีใน Master — ยังแสดง/เลือกค้างไว้ได้ ไม่หายจากฟอร์ม
                        ...(line.expenseType && !master.expenseTypes.some((t) => t.name === line.expenseType)
                          ? [{ value: line.expenseType, label: line.expenseType }]
                          : []),
                      ]}
                      value={line.expenseType}
                      onChange={(e) => updateLine(line.id, { expenseType: e.target.value })}
                    />
                    <TextInput
                      label={isBudget ? 'รายการ' : 'วัตถุประสงค์'}
                      required
                      wrapperClassName={isBudget ? '' : 'lg:col-span-3'}
                      placeholder={isBudget ? 'เช่น Kiyomizu Temple' : undefined}
                      value={line.purpose}
                      onChange={(e) => updateLine(line.id, { purpose: e.target.value })}
                    />
                    {isBudget && (
                      <TextInput
                        label="คำอธิบาย"
                        wrapperClassName="lg:col-span-2"
                        placeholder="เช่น Hotel Koyo 2 คืน"
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                      />
                    )}
                  </div>

                  {/* งบกรุ๊ป: จำนวน × ราคา/หน่วย − ส่วนลด = จำนวนเงิน (เว้นว่างจำนวน/ราคา = กรอกยอดเองแบบเดิม) */}
                  {isBudget && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <TextInput
                        label="จำนวน"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                      />
                      <TextInput
                        label="ราคา/หน่วย"
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                      />
                      <TextInput
                        label="ส่วนลด"
                        inputMode="decimal"
                        value={line.discount}
                        onChange={(e) => updateLine(line.id, { discount: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {isBudget && budgetLineAmount(optionalNumber(line.quantity), optionalNumber(line.unitPrice)) !== null ? (
                      <TextInput
                        label="จำนวนเงินรวม"
                        readOnly
                        value={lineAmount(line).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        hint="คำนวณจากจำนวน × ราคา/หน่วย − ส่วนลด"
                      />
                    ) : (
                      <TextInput
                        label="จำนวนเงิน"
                        required
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                      />
                    )}
                    <SelectInput
                      label="สกุลเงิน"
                      options={currencyOptions.map((c) => ({
                        value: c.code,
                        label: `${c.code} — ${c.name}`,
                      }))}
                      value={line.currency}
                      onChange={(e) => updateLine(line.id, { currency: e.target.value })}
                    />
                    <TextInput
                      label="อัตราแลกเปลี่ยน"
                      inputMode="decimal"
                      value={line.fxRate}
                      onChange={(e) => updateLine(line.id, { fxRate: e.target.value })}
                    />
                    <TextInput
                      label="เลขที่ใบเสร็จ"
                      value={line.receiptNo}
                      onChange={(e) => updateLine(line.id, { receiptNo: e.target.value })}
                    />
                    <TextInput
                      label="หลักฐาน (จำลอง)"
                      placeholder="receipt_demo.jpg"
                      value={line.evidenceFileName}
                      hint="ไม่มีการอัปโหลดจริง"
                      onChange={(e) => updateLine(line.id, { evidenceFileName: e.target.value })}
                    />
                  </div>

                  <p className="zego-divider-top mt-3 pt-2 text-right text-sm">
                    <span className="zego-text-tertiary">ยอดเทียบเงินบาท: </span>
                    <span
                      className={cx(
                        'font-semibold tabular-nums',
                        toTHB(line) > 0 ? 'zego-text' : 'zego-text-disabled',
                      )}
                    >
                      {formatTHB(Math.round(toTHB(line)))}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="zego-badge--info flex items-center justify-between rounded-xl border px-4 py-3">
          <span className="text-sm font-semibold">ยอดรวมทั้งใบ</span>
          <span className="text-xl font-bold tabular-nums">
            {formatTHB(Math.round(total))}
          </span>
        </div>

        <TextArea
          label="หมายเหตุ"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Callout tone="slate" title="บัญชีรับเงิน">
          ระบบจะใช้บัญชีธนาคารที่บันทึกไว้ในโปรไฟล์ของผู้ขอเบิก เลขบัญชีถูกปิดบังเสมอ (ข้อมูล Demo)
        </Callout>
      </div>
    </Modal>
  );
}
