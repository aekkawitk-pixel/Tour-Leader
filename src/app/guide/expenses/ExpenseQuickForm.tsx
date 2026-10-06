'use client';

/**
 * ฟอร์มบันทึกค่าใช้จ่ายแบบย่อ — ผูกกับพีเรียดที่กำหนดมาตายตัว (ไม่มีตัวเลือกกรุ๊ป)
 *
 * ใช้ฝังในหน้ารายละเอียดงาน (/guide/jobs/[id]) เท่านั้น — ให้หัวหน้าทัวร์ "กดเข้าไปในกรุ๊ปที่ต้องการ
 * ก่อนเสมอ" แล้วค่อยบันทึกค่าใช้จ่ายจากตรงนั้น กันบันทึกผิดกรุ๊ปจากดรอปดาวน์เลือกเอง (เคยเป็นแบบนั้น
 * ที่ /guide/expenses มาก่อน — ตัดออกแล้วตามที่ตกลง)
 *
 * รายการค่าใช้จ่ายแยกเป็นหลายบรรทัดได้ (ExpenseLine[]) — สแกนใบเสร็จที่มีหลายรายการจะแตกเป็นบรรทัด
 * ตามจริงให้อัตโนมัติ ผู้ใช้แก้ไข/เพิ่ม/ลบทีละบรรทัดได้ก่อนบันทึกเสมอ
 *
 * แต่ละบรรทัดเลือกสกุลเงินของตัวเองได้ (ไม่ใช่สกุลเงินเดียวทั้งใบ) — ใบเสร็จบางใบมีหลายสกุลเงินปนกันจริง
 * (เช่น ค่าทัวร์จ่ายเยน + ทิปจ่ายบาท) แสดง/บันทึกตามสกุลเงินเดิมเสมอ ไม่แปลงรวมเป็นบาท (ตามที่ตกลง)
 */

import { useMemo, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { compressImageToDataUrl } from '@/lib/image/compressImage';
import { scanReceipt, ReceiptScanClientError, type ReceiptScanResult } from '@/services/receiptScan';
import { formatCurrency, toISODate, toISODateTime } from '@/lib/format';
import { advanceDocsReleased, leaderBudgetItems, recordedByBudgetLine } from '@/lib/logic/groupBudget';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { baseControl, SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Icon, type IconName } from '@/components/ui/Icon';
import { groupAmountsByCurrency } from './expenseAmounts';
import { CurrencyStack } from './CurrencyStack';
import { AdvanceRequestPicker } from './AdvanceRequestPicker';
import { RecordedSection } from './RecordedExpenseList';
import { GuideExpenseDetailDrawer } from './GuideExpenseDetailDrawer';
import type { ExpenseLine, ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

const NO_RECEIPT = 'ไม่มีหลักฐาน';
/** "บันทึกยอดก่อน" — สร้างรายการไว้ก่อน แล้วค่อยแนบหลักฐานภายหลัง */
export const PENDING_RECEIPT = 'รอแนบหลักฐาน';
const DEFAULT_CURRENCY = 'THB';

type EvidenceMethod = {
  key: string;
  title: string;
  subtitle: string;
  icon: IconName;
  tile: string;
};

/** วิธีบันทึกหลักฐาน — อยู่ภายในทั้งสองหัวข้อ (ตามรายการเบิก / นอกเหนือรายการเบิก) · ถ่าย/เลือกรูป เปิดตัวเลือกไฟล์ทันที */
const EVIDENCE_METHODS: EvidenceMethod[] = [
  { key: 'camera', title: 'ถ่ายใบเสร็จ', subtitle: 'เปิดกล้องถ่ายทันที', icon: 'camera', tile: 'bg-emerald-700' },
  { key: 'gallery', title: 'เลือกรูปจากเครื่อง', subtitle: 'เลือกรูปที่มีอยู่แล้ว', icon: 'image', tile: 'bg-emerald-600' },
  { key: 'none', title: 'ไม่มีใบเสร็จ', subtitle: 'ใช้หลักฐานอื่นแทน', icon: 'file', tile: 'bg-amber-500' },
  { key: 'later', title: 'บันทึกยอดก่อน', subtitle: 'สร้างรายการแล้วแนบภายหลัง', icon: 'edit', tile: 'bg-orange-500' },
];

const SCAN_CONFIDENCE_LABEL: Record<ReceiptScanResult['confidence'], string> = {
  high: 'มั่นใจสูง',
  medium: 'มั่นใจปานกลาง — โปรดตรวจทาน',
  low: 'มั่นใจต่ำ — โปรดตรวจทานให้ละเอียด',
};

/**
 * หมวดในเอกสารเบิกค่าใช้จ่ายกรุ๊ป (เช่น "ค่ายานพาหนะ", "ค่าเข้าชมสถานที่") ไม่ตรงกับชื่อประเภทใน Master ทุกตัวอักษร
 * (Master: "ค่าพาหนะ / รถโค้ช", "ค่าบัตรเข้าชม") — จับคู่ด้วยคำสำคัญแทน · ไม่เจอ = ให้ผู้ใช้เลือกเอง
 */
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/โรงแรม|ที่พัก/, 'HOTEL'],
  [/อาหาร/, 'MEAL'],
  [/พาหนะ|รถ/, 'TRANSPORT'],
  [/เข้าชม|บัตร/, 'TICKET'],
  [/ทิป/, 'TIP'],
  [/วีซ่า/, 'VISA'],
  [/โทรศัพท์|อินเทอร์เน็ต/, 'COMM'],
  [/ฉุกเฉิน/, 'EMERGENCY'],
  [/เบ็ดเตล็ด/, 'MISC'],
];
/** หัวข้อหน้าแรกหลังเลือกกรุ๊ป — วิธีบันทึกหลักฐาน (EVIDENCE_METHODS) อยู่ภายในทั้งสองหัวข้อ */
const SCOPE_BUDGET: EvidenceMethod = { key: 'budget', title: 'ตามรายการเบิก', subtitle: 'เลือกจากรายการที่ฝ่ายเบิกจ่ายเตรียมไว้', icon: 'receipt', tile: 'bg-sky-600' };
const SCOPE_OUTSIDE: EvidenceMethod = { key: 'outside', title: 'นอกเหนือรายการเบิก', subtitle: 'ค่าใช้จ่ายที่ไม่อยู่ในรายการเบิก', icon: 'plus', tile: 'bg-slate-500' };

function MethodButton({
  method: m,
  onClick,
  disabled,
  subtitle,
}: {
  method: EvidenceMethod;
  onClick: () => void;
  disabled?: boolean;
  subtitle?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-3 rounded-xl border zego-border-color px-3 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 disabled:pointer-events-none disabled:opacity-50"
      >
        <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white', m.tile)}>
          <Icon name={m.icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold zego-text">{m.title}</span>
          <span className="block text-xs zego-text-tertiary">{subtitle ?? m.subtitle}</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
      </button>
    </li>
  );
}

const expenseTypeCodeFromCategory = (category: string) => CATEGORY_KEYWORDS.find(([re]) => re.test(category))?.[1];

interface DraftLine {
  id: string;
  description: string;
  amount: string;
  currency: string;
  /** true = มาจากสแกนและอ่านได้ไม่ชัดเจน ยังไม่ผ่านการตรวจทานจากผู้ใช้ */
  uncertain?: boolean;
}

const emptyLine = (currency: string = DEFAULT_CURRENCY): DraftLine => ({
  id: `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: '',
  amount: '',
  currency,
});

export function ExpenseQuickForm({
  period,
  onCancel,
  onSaved,
  initialPickBudget = false,
}: {
  period: TourPeriodMaster;
  onCancel: () => void;
  /** viaBudget = บันทึกผ่าน "ตามรายการเบิก" — ใช้ตัดสินว่า "ทำรายการต่อไป" ควรเปิดรายการเบิกให้เลย */
  onSaved: (expense: ExpenseRequest, viaBudget: boolean) => void;
  /** เปิดฟอร์มที่หน้าเลือกรายการเบิกทันที (กด "ทำรายการต่อไป" หลังบันทึกรายการเบิกก่อนหน้า) */
  initialPickBudget?: boolean;
}) {
  const { currentUser, leaders, master, saveExpense, createExpenseId, expenses, envelopes, noEnvelopeMarks } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);

  const [expenseType, setExpenseType] = useState('');
  /*
   * รายการตามงบของกรุ๊ป (ใบเบิกเงินทดรองที่คนทำเบิกเตรียมไว้) — เลือกได้ว่าใบเสร็จนี้เป็นของรายการไหน
   * '' = นอกรายการงบ · เลือกแล้วเติมประเภท/รายละเอียด/สกุลเงินให้ (แก้ต่อได้) และผูกทุกบรรทัดกับรายการนั้น
   */
  // เอกสารเบิกกรุ๊ปที่การเงินยังจัดซองไม่เสร็จ ยังไม่ให้หัวหน้าทัวร์เห็น/เลือก (ยอดยังเปลี่ยนได้)
  const budgetItems = useMemo(
    () => leaderBudgetItems(expenses, envelopes, noEnvelopeMarks, period.internalId),
    [expenses, envelopes, noEnvelopeMarks, period.internalId],
  );
  const docsPending = !advanceDocsReleased(expenses, envelopes, noEnvelopeMarks, period.internalId);
  const usedByBudget = useMemo(() => recordedByBudgetLine(expenses, period.internalId), [expenses, period.internalId]);
  const [budgetLineId, setBudgetLineId] = useState('');
  /** ใบเบิกที่มีรายการงบ — ใช้แสดงแบบเอกสาร (หัวเอกสาร + หมวด) ในวิธี "ตามรายการเบิก" */
  const advanceDocs = useMemo(() => {
    const ids = new Set(budgetItems.map((b) => b.expenseId));
    return expenses.filter((e) => ids.has(e.id));
  }, [expenses, budgetItems]);
  /** กำลังเลือกรายการเบิก (วิธี "ตามรายการเบิก") — เลือกแล้วกลับไปหน้าเลือกวิธีเพื่อเลือกหลักฐานต่อ */
  const [pickingBudget, setPickingBudget] = useState(() => initialPickBudget && budgetItems.length > 0);
  /**
   * หัวข้อที่เลือกในหน้าแรก — null = ยังไม่เลือก (แสดง 2 หัวข้อ)
   * 'budget' = ตามรายการเบิก (เลือกรายการ → เลือกหลักฐาน) · 'outside' = นอกเหนือรายการเบิก (เลือกหลักฐานเลย)
   */
  /** ค่าใช้จ่ายนอกรายการเบิกที่บันทึกแล้วของกรุ๊ปนี้ (ไม่รวมที่ยกเลิก) — โชว์ในหน้าเลือกวิธีบันทึกของ "นอกเหนือ" กันบันทึกซ้ำ */
  const recordedOutside = useMemo(
    () => expenses.filter((e) =>
      e.jobId === period.internalId && e.category === 'actual' && e.requesterId === leaderId
      && e.status !== 'cancelled' && !e.lines.some((l) => l.budgetLineId)),
    [expenses, period.internalId, leaderId],
  );
  const [detailExpense, setDetailExpense] = useState<ExpenseRequest | null>(null);
  const [scope, setScope] = useState<'budget' | 'outside' | null>(() => (initialPickBudget && budgetItems.length > 0 ? 'budget' : null));
  // ค่าเริ่มต้นวันที่ใบเสร็จ = วันที่จริงของเครื่อง (ไม่ใช่วันอ้างอิงของ Demo) — ปกติบันทึกใบเสร็จวันเดียวกับที่จ่าย
  // ฟอร์มนี้แสดงหลังเลือกกรุ๊ปฝั่ง Client เท่านั้น จึงอ่าน new Date() ตอนสร้าง state ได้โดยไม่ชนกับ HTML ฝั่ง server
  const [receiptDate, setReceiptDate] = useState(() => toISODate(new Date()));
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [note, setNote] = useState('');
  const [evidenceFileName, setEvidenceFileName] = useState('');
  /** รูปหลักฐานที่ย่อแล้ว — เก็บไปกับรายการเพื่อเปิดดูภายหลัง (ไม่มี = ไม่มีรูป เช่น ไม่มีใบเสร็จ/รอแนบ) */
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(null);
  const [showFullTranslation, setShowFullTranslation] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const fxRateFor = (code: string) => Number(master.currencies.find((c) => c.code === code)?.extra ?? '1') || 1;
  const validLines = lines
    .map((l) => ({ ...l, amountNum: Number(l.amount) || 0 }))
    .filter((l) => l.description.trim() && l.amountNum !== 0);
  const uncertainCount = validLines.filter((l) => l.uncertain).length;
  /** สิ่งที่ยังขาดก่อนบันทึกได้ — บอกผู้ใช้ตรง ๆ แทนปุ่มที่กดไม่ได้เฉย ๆ โดยไม่รู้สาเหตุ */
  const missing = [
    !evidenceFileName && 'หลักฐานการจ่ายเงิน (ถ่ายรูป / เลือกรูป / ไม่มีใบเสร็จ)',
    !expenseType && 'ประเภทค่าใช้จ่าย',
    validLines.length === 0 && 'รายการค่าใช้จ่าย (รายละเอียด + จำนวนเงิน)',
  ].filter(Boolean) as string[];
  // แยกยอดรวมตามสกุลเงิน — ห้ามบวกข้ามสกุลเงินรวมเป็นตัวเลขเดียว เพราะแต่ละบรรทัดเลือกสกุลเงินเองได้
  const totalsByCurrency = groupAmountsByCurrency(validLines.map((l) => ({ amount: l.amountNum, currency: l.currency })));

  /** แก้ไขบรรทัดเอง = ถือว่าตรวจทานแล้ว เอาเครื่องหมาย "อ่านไม่ชัด" ออก */
  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch, uncertain: false } : l)));
  };
  // บรรทัดใหม่เริ่มด้วยสกุลเงินเดียวกับบรรทัดล่าสุด (ต่อเนื่องกันในใบเดียว) — ไม่ใช่รีเซ็ตเป็นบาททุกครั้ง
  const addLine = () => setLines((prev) => [...prev, emptyLine(prev.at(-1)?.currency ?? DEFAULT_CURRENCY)]);
  const removeLine = (index: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  /*
   * ถ่ายรูป/เลือกรูป → แนบไฟล์นี้เป็นหลักฐานเสมอ (สำเร็จหรือไม่ก็ตาม) แล้วลองสแกน+แปลใบเสร็จ
   * มีหลายรายการ → แตกเป็นหลายบรรทัดตามจริง ไม่มีรายการย่อย (อ่านได้แค่ยอดรวม) → บรรทัดเดียว
   * ผู้ใช้ต้องตรวจทาน/แก้ไขเองก่อนบันทึกเสมอ สแกนไม่สำเร็จ → ไม่บล็อกอะไร กรอกเองได้ตามปกติ
   */
  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEvidenceFileName(file.name);
    setEvidenceImage(null);
    // ย่อรูปคู่ขนานกับการสแกน — ไม่ต้องรอกัน
    void compressImageToDataUrl(file).then(setEvidenceImage);
    setScanResult(null);
    setScanError(null);
    setShowFullTranslation(false);
    setEvidencePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setScanning(true);
    try {
      const expenseTypeOptions = master.expenseTypes.filter((t) => t.active).map((t) => ({ code: t.code, name: t.name }));
      const result = await scanReceipt(file, expenseTypeOptions);
      setScanResult(result);
      if (result.suggestedExpenseTypeCode && expenseTypeOptions.some((t) => t.code === result.suggestedExpenseTypeCode)) {
        setExpenseType(result.suggestedExpenseTypeCode);
      }
      // สแกนบอกสกุลเงินโดยรวมของทั้งใบ — ใช้เป็นค่าเริ่มต้นให้ทุกบรรทัด แต่ผู้ใช้แก้ทีละบรรทัดได้เสมอ
      // (เผื่อใบเสร็จจริงมีหลายสกุลเงินปนกัน ซึ่ง AI อ่านสรุปมาเป็นสกุลเดียว)
      const matchedCurrency = master.currencies.find((c) => c.active && c.code === result.currency)?.code ?? DEFAULT_CURRENCY;
      if (result.items && result.items.length > 0) {
        setLines(
          result.items.map((item) => ({
            id: emptyLine().id,
            description: item.descriptionTh || item.descriptionOriginal || '',
            amount: typeof item.amount === 'number' && item.amount !== 0 ? String(item.amount) : '',
            currency: matchedCurrency,
            uncertain: item.uncertain === true,
          })),
        );
      } else if (result.totalAmount > 0 || result.merchantNameTh) {
        setLines([
          {
            id: emptyLine().id,
            description: result.merchantNameTh || '',
            amount: result.totalAmount > 0 ? String(result.totalAmount) : '',
            currency: matchedCurrency,
          },
        ]);
      }
      // อ่านวันที่จากใบเสร็จได้ → ใช้ค่านั้นแทนวันนี้ (ตรวจรูปแบบ ISO คร่าว ๆ กันของเสียจากโมเดล)
      if (result.receiptDate && /^\d{4}-\d{2}-\d{2}$/.test(result.receiptDate)) {
        setReceiptDate(result.receiptDate);
      }
    } catch (err) {
      setScanError(err instanceof ReceiptScanClientError ? err.message : 'อ่านใบเสร็จไม่สำเร็จ — กรอกข้อมูลด้วยตนเองได้ตามปกติ');
    } finally {
      setScanning(false);
    }
  };

  /**
   * บันทึก — asDraft = เก็บเป็นร่างไว้ก่อน (ทำทีละรายการ แล้วส่งอนุมัติพร้อมกันทีหลังที่รายการร่างของกรุ๊ป)
   * ไม่ใช่ร่าง = ส่งอนุมัติทันที (แบบเดิม)
   */
  const submit = async (asDraft = false) => {
    if (!leaderId || !expenseType || validLines.length === 0 || !evidenceFileName) return;
    setSaving(true);
    try {
      const id = await createExpenseId();
      const expenseTypeName = master.expenseTypes.find((t) => t.code === expenseType)?.name ?? expenseType;
      const expenseLines: ExpenseLine[] = validLines.map((l, i) => {
        const fxRate = fxRateFor(l.currency);
        return {
          id: `L-${Date.now()}-${i}`,
          expenseType: expenseTypeName,
          purpose: l.description.trim(),
          amount: l.amountNum,
          currency: l.currency,
          fxRate,
          amountTHB: Math.round(l.amountNum * fxRate),
          receiptNo: '—',
          evidenceFileName,
          ...(evidenceImage ? { evidenceImage } : {}),
          receiptDate: receiptDate || undefined,
          ...(budgetLineId ? { budgetLineId } : {}),
        };
      });
      const bank = leader?.bankAccounts.find((b) => b.isPrimary) ?? leader?.bankAccounts[0];
      // เวลาจริงที่กดบันทึก — ใช้ค่าเดียวกันทั้งใน submittedAt และ history เพื่อไม่ให้ "บันทึกเมื่อ" กับ
      // เวลาใน Timeline การอนุมัติ ไม่ตรงกัน (เคยเป็นบั๊ก: history ใช้ today ซึ่งเป็นวันที่จำลองของ Demo
      // ไม่ใช่เวลาจริง ทำให้ Timeline โชว์วันที่คนละวันกับ "บันทึกเมื่อ")
      // ห้ามใช้ new Date().toISOString() — คืนเวลาแบบ UTC แต่ parseDate ทั้งระบบอ่านเป็น local ตรง ๆ
      // (ไม่แปลง timezone) ผสมกันจะได้เวลาที่แสดงเพี้ยนไปเท่าผลต่าง timezone ของเครื่อง (ไทย UTC+7 → เร็วกว่าจริง 7 ชม.)
      const submittedAt = toISODateTime(new Date());
      const expense: ExpenseRequest = {
        id,
        jobId: period.internalId,
        category: 'actual',
        requesterId: leaderId,
        requesterName: leader ? `${leader.firstName} ${leader.lastName}`.trim() : currentUser.name,
        requestedAt: toISODate(new Date()), // วันที่จริง ไม่ใช่วันที่จำลองของ Demo
        ...(asDraft ? {} : { submittedAt }),
        lines: expenseLines,
        totalTHB: expenseLines.reduce((sum, l) => sum + l.amountTHB, 0),
        bankAccount: bank
          ? { bank: bank.bank, accountNoMasked: bank.accountNoMasked, accountName: bank.accountName, branch: bank.branch ?? '' }
          : { bank: '', accountNoMasked: '', accountName: '', branch: '' },
        note: note.trim(),
        status: asDraft ? 'draft' : 'submitted',
        history: [makeStatusEvent(null, asDraft ? 'draft' : 'submitted', currentUser.name, submittedAt, asDraft ? 'บันทึกเป็นร่างจากพอร์ทัลหัวหน้าทัวร์' : 'บันทึกจากพอร์ทัลหัวหน้าทัวร์')],
      };
      await saveExpense(expense);
      onSaved(expense, Boolean(budgetLineId));
    } finally {
      setSaving(false);
    }
  };

  /** ยอดงบที่ยังไม่ได้ใช้ของรายการเบิก (สกุลเงินเดียวกับรายการ) */
  const remainingOf = (line: ExpenseLine) => line.amount - (usedByBudget.get(line.id)?.get(line.currency) ?? 0);

  /**
   * เลือกรายการงบ → เติมประเภท (ถ้าตรงกับ Master) รายละเอียดบรรทัดแรก และสกุลเงินของทุกบรรทัดที่ยังว่าง
   * fillAmount (วิธี "ตามรายการเบิก") → เติมยอดบรรทัดแรกที่ยังว่างด้วยยอดงบคงเหลือด้วย (แก้ต่อได้)
   */
  const pickBudget = (id: string, fillAmount = false) => {
    setBudgetLineId(id);
    const item = budgetItems.find((b) => b.line.id === id)?.line;
    if (!item) return;
    const type =
      master.expenseTypes.find((t) => t.active && (t.name === item.expenseType || t.code === item.expenseType)) ??
      master.expenseTypes.find((t) => t.active && t.code === expenseTypeCodeFromCategory(item.expenseType));
    if (type) setExpenseType(type.code);
    const remaining = remainingOf(item);
    setLines((prev) => prev.map((l, i) => ({
      ...l,
      description: i === 0 && !l.description.trim() ? [item.purpose, item.description].filter(Boolean).join(' — ') : l.description,
      amount: fillAmount && i === 0 && !l.amount.trim() ? String(remaining > 0 ? remaining : item.amount) : l.amount,
      currency: l.amount.trim() ? l.currency : item.currency,
    })));
  };
  const selectedBudget = budgetItems.find((b) => b.line.id === budgetLineId)?.line;

  const clearEvidence = () => {
    setEvidenceFileName('');
    setEvidenceImage(null);
    setScanResult(null);
    setScanError(null);
    setShowFullTranslation(false);
    setEvidencePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const chooseMethod = (key: string) => {
    if (key === 'camera') cameraInputRef.current?.click();
    else if (key === 'gallery') galleryInputRef.current?.click();
    else {
      setEvidenceImage(null);
      setEvidenceFileName(key === 'none' ? NO_RECEIPT : PENDING_RECEIPT);
    }
  };

  /** ล้างสิ่งที่ "ตามรายการเบิก" เติมไว้ — เปลี่ยนไปนอกเหนือรายการเบิกแล้วต้องไม่ค้างประเภท/รายละเอียด/ยอดของรายการเดิม */
  const resetDraft = () => {
    setBudgetLineId('');
    setExpenseType('');
    setLines([emptyLine()]);
  };

  const chooseScope = (next: 'budget' | 'outside') => {
    if (next === 'outside' && budgetLineId) resetDraft();
    setScope(next);
    setPickingBudget(next === 'budget');
  };

  /** ย้อนกลับจากหน้าเลือกหลักฐาน — ตามรายการเบิกกลับไปเลือกรายการ · นอกเหนือรายการเบิกกลับไปหน้าหัวข้อ */
  const backFromEvidence = () => {
    if (scope === 'budget') setPickingBudget(true);
    else setScope(null);
  };

  // ถ่าย/เลือกรูป → ถ้าผู้ใช้ปิดตัวเลือกไฟล์โดยไม่เลือก จะยังอยู่หน้าเลือกวิธีเหมือนเดิม
  const fileInputs = (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
    </>
  );

  // หน้าแรก — 2 หัวข้อ
  if (!evidenceFileName && scope === null) {
    const noBudget = budgetItems.length === 0;
    return (
      <Card className="space-y-3">
        <p className="text-sm font-semibold zego-text">เลือกประเภทรายการ</p>
        <ul className="space-y-2.5">
          <MethodButton
            method={SCOPE_BUDGET}
            onClick={() => chooseScope('budget')}
            disabled={noBudget}
            subtitle={noBudget ? (docsPending ? 'การเงินกำลังจัดซอง — เลือกรายการเบิกได้เมื่อจัดซองเสร็จ' : 'ยังไม่มีรายการเบิกของกรุ๊ปนี้') : undefined}
          />
          <MethodButton method={SCOPE_OUTSIDE} onClick={() => chooseScope('outside')} />
        </ul>
        <Button variant="secondary" className="w-full" onClick={onCancel}>
          ยกเลิก
        </Button>
      </Card>
    );
  }

  // ตามรายการเบิก ขั้นที่ 1 — เลือกรายการที่ฝ่ายเบิกจ่ายเตรียมไว้ (เติมประเภท/รายละเอียด/ยอดคงเหลือให้) แล้วไปเลือกหลักฐาน
  if (!evidenceFileName && pickingBudget) {
    return (
      <Card>
        <AdvanceRequestPicker
          period={period}
          documents={advanceDocs}
          usedByBudget={usedByBudget}
          selectedLineId={budgetLineId}
          onPick={(id) => {
            pickBudget(id, true);
            setPickingBudget(false);
          }}
          // ย้อนกลับจากรายการเบิก = กลับหน้าหัวข้อเสมอ (ไม่วนกลับไปหน้าเลือกหลักฐาน) — ถ้าไปเลือก "นอกเหนือ" ต่อ chooseScope ล้างรายการที่ค้างให้
          onBack={() => {
            setPickingBudget(false);
            setScope(null);
          }}
        />
      </Card>
    );
  }

  // เลือกหลักฐาน — ภายในหัวข้อที่เลือก
  if (!evidenceFileName) {
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={backFromEvidence} className="rounded p-1 zego-text-secondary" aria-label="ย้อนกลับ">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold zego-text">
            {scope === 'budget' ? 'ตามรายการเบิก' : 'นอกเหนือรายการเบิก'} · เลือกวิธีบันทึก
          </p>
        </div>
        {scope === 'outside' && (
          <RecordedSection title="นอกรายการเบิกที่บันทึกแล้ว" tone="warning" list={recordedOutside} onOpen={setDetailExpense} />
        )}
        {scope === 'budget' && selectedBudget && (
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs">
            <Icon name="receipt" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-sky-800">{selectedBudget.purpose}</span>
              {selectedBudget.description && <span className="block text-sky-700">{selectedBudget.description}</span>}
              <span className="block text-sky-700">งบ {formatCurrency(selectedBudget.amount, selectedBudget.currency)}</span>
            </span>
            <button type="button" onClick={() => setPickingBudget(true)} className="shrink-0 font-medium text-sky-800 underline">
              เปลี่ยนรายการ
            </button>
          </div>
        )}
        <ul className="space-y-2.5">
          {EVIDENCE_METHODS.map((m) => (
            <MethodButton key={m.key} method={m} onClick={() => chooseMethod(m.key)} />
          ))}
        </ul>
        <Button variant="secondary" className="w-full" onClick={onCancel}>
          ยกเลิก
        </Button>
        {fileInputs}
        <GuideExpenseDetailDrawer expense={detailExpense} onClose={() => setDetailExpense(null)} />
      </Card>
    );
  }

  const evidenceWarn = evidenceFileName === NO_RECEIPT || evidenceFileName === PENDING_RECEIPT;

  return (
    <Card className="space-y-3">
      {/* หลักฐานที่เลือกจากขั้นเลือกวิธีบันทึก — กด "เปลี่ยน" กลับไปเลือกวิธีใหม่ (ข้อมูลที่กรอกไว้ไม่หาย)
          ถ่าย/เลือกรูป → ลองสแกน+แปลแตกเป็นบรรทัดให้อัตโนมัติ (ตรวจทาน/แก้ไขได้เสมอก่อนบันทึก)
          เก็บเฉพาะชื่อไฟล์ ไม่เก็บตัวรูปจริง (ตรงกับ ExpenseLine.evidenceFileName ที่ประกาศไว้แล้วว่าเป็นหลักฐานจำลอง) */}
      <div>
        <p className="mb-1.5 text-xs font-medium zego-text-secondary">
          หลักฐานการจ่ายเงิน <span className="zego-text-danger">*</span>
        </p>
        <div
          className={cx(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
            evidenceWarn ? 'border-amber-200 bg-amber-50 zego-text-warning' : 'border-emerald-200 bg-emerald-50 zego-text-success',
          )}
        >
          <Icon name={evidenceFileName === PENDING_RECEIPT ? 'clock' : evidenceWarn ? 'warning' : 'file'} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{evidenceFileName}</span>
          <button type="button" onClick={clearEvidence} className="shrink-0 text-xs font-medium underline">
            เปลี่ยน
          </button>
        </div>
        {fileInputs}
      </div>

      {scanning && (
        <p className="flex items-center gap-2 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 zego-border-color border-t-transparent" aria-hidden="true" />
          กำลังอ่านและแปลใบเสร็จ...
        </p>
      )}

      {!scanning && scanError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs zego-text-warning">{scanError}</p>
      )}

      {!scanning && scanResult && (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold zego-text-success">อ่านจากใบเสร็จแล้ว — โปรดตรวจทานรายการด้านล่างก่อนบันทึก</p>
            <span className="shrink-0 text-[11px] zego-text-success">{SCAN_CONFIDENCE_LABEL[scanResult.confidence]}</span>
          </div>
          {scanResult.merchantNameTh && (
            <p className="text-xs zego-text-secondary">
              ร้าน: {scanResult.merchantNameTh}
              {scanResult.merchantNameOriginal && <span className="zego-text-tertiary"> ({scanResult.merchantNameOriginal})</span>}
            </p>
          )}
          {scanResult.merchantAddressTh && (
            <p className="text-xs zego-text-secondary">
              ที่อยู่: {scanResult.merchantAddressTh}
              {scanResult.merchantAddressOriginal && <span className="zego-text-tertiary"> ({scanResult.merchantAddressOriginal})</span>}
            </p>
          )}
          {scanResult.notes && <p className="text-xs zego-text-warning">หมายเหตุ: {scanResult.notes}</p>}
          {scanResult.fullTextTh && scanResult.fullTextTh.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFullTranslation((v) => !v)}
              className="text-xs font-medium zego-text-success underline"
            >
              {showFullTranslation ? 'ซ่อนตัวอย่างการแปล' : 'ดูตัวอย่างการแปลทั้งใบ'}
            </button>
          )}
        </div>
      )}

      {/* ตัวอย่างการแปลแบบละเอียด — เทียบต้นฉบับ/คำแปลทุกบรรทัด พร้อมรูปใบเสร็จ ไว้ตรวจสอบ ไม่ใช่ข้อมูลที่บันทึกลงฟอร์ม */}
      {!scanning && showFullTranslation && scanResult?.fullTextTh && (
        <div className="space-y-2 rounded-lg border zego-border-color zego-surface-soft-bg p-2.5">
          {evidencePreviewUrl && (
            // ไฟล์ผู้ใช้เป็น blob: URL ชั่วคราว — ใช้ <img> ตรง ๆ (next/image ไม่รองรับ blob)
            <img src={evidencePreviewUrl} alt="รูปใบเสร็จที่ถ่าย" className="max-h-64 w-full rounded-md border zego-border-color object-contain" />
          )}
          <div className="max-h-56 overflow-y-auto rounded-md border zego-border-color zego-surface-bg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 zego-surface-soft-bg zego-text-secondary">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">ต้นฉบับ</th>
                  <th className="px-2 py-1 text-left font-medium">คำแปล</th>
                </tr>
              </thead>
              <tbody>
                {scanResult.fullTextTh.map((line, i) => (
                  <tr key={i} className="zego-divider-top">
                    <td className="px-2 py-1 align-top zego-text-tertiary">{line.original}</td>
                    <td className="px-2 py-1 align-top zego-text">{line.translated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ผูกรายการเบิกได้ทางเดียว = วิธี "ตามรายการเบิก" · วิธีอื่นทั้งหมด = นอกรายการเบิก (ไม่มีดรอปดาวน์ให้เลือกเองในฟอร์ม)
          เปลี่ยนหลักฐาน: กด "เปลี่ยน" → กลับหน้าเลือกวิธีในหัวข้อเดิม (ย้อนกลับต่อได้ถึงหน้าหัวข้อ) */}
      {selectedBudget ? (
        <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs">
          <Icon name="receipt" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-sky-800">ตามรายการเบิก: {selectedBudget.purpose}</span>
            {selectedBudget.description && <span className="block text-sky-700">{selectedBudget.description}</span>}
            <span className="block text-sky-700">
              งบ {formatCurrency(selectedBudget.amount, selectedBudget.currency)}
              {(usedByBudget.get(selectedBudget.id)?.get(selectedBudget.currency) ?? 0) > 0 &&
                ` · คงเหลือ ${formatCurrency(remainingOf(selectedBudget), selectedBudget.currency)}`}
            </span>
          </span>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">
          <Icon name="info" className="h-3.5 w-3.5 shrink-0" />
          นอกรายการเบิก
        </p>
      )}

      <SelectInput
        label="ประเภทค่าใช้จ่าย"
        value={expenseType}
        onChange={(e) => setExpenseType(e.target.value)}
        placeholder="เลือกประเภท"
        options={master.expenseTypes.filter((t) => t.active).map((t) => ({ value: t.code, label: t.name }))}
        hint={
          scanResult?.suggestedExpenseTypeCode && scanResult.suggestedExpenseTypeCode === expenseType
            ? 'เดาจากใบเสร็จให้อัตโนมัติ — ตรวจสอบก่อนบันทึก'
            : undefined
        }
      />

      <DateField
        label="วันที่ใบเสร็จ"
        value={receiptDate}
        onChange={setReceiptDate}
        hint={
          scanResult?.receiptDate && scanResult.receiptDate === receiptDate
            ? 'อ่านจากใบเสร็จให้อัตโนมัติ — ตรวจสอบก่อนบันทึก'
            : undefined
        }
      />

      {/* รายการค่าใช้จ่าย — แยกเป็นบรรทัดตามจริง เพิ่ม/ลบ/แก้ไขได้ทุกบรรทัดก่อนบันทึก
          แต่ละบรรทัดเลือกสกุลเงินเอง — ใบเสร็จเดียวมีหลายสกุลเงินปนกันได้จริง */}
      <div>
        <p className="mb-1.5 text-xs font-medium zego-text-secondary">รายการค่าใช้จ่าย</p>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={line.id} className="space-y-1.5 rounded-lg border zego-border-color p-2">
              {/* ห้ามใส่ w-24/flex-1 ตรง input เดียวกับ baseControl — baseControl มี w-full อยู่แล้ว
                  จะชนกัน (ลำดับ class ใน stylesheet ตัดสิน ไม่ใช่ลำดับใน className) ทำให้ความกว้างเพี้ยน
                  ครอบด้วย div กำหนดความกว้างแทน แล้วให้ input เป็น w-full ภายใน wrapper นั้นแทน */}
              <textarea
                className={cx(baseControl, 'resize-none text-sm leading-snug', line.uncertain && 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-100')}
                rows={2}
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="เช่น ค่าแท็กซี่จากสนามบิน"
                aria-label="รายละเอียดรายการ"
              />
              <div className="flex items-stretch gap-2">
                <div className="flex-1">
                  <input
                    className={cx(baseControl, 'h-full', line.uncertain && 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-100')}
                    type="number"
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                    placeholder="จำนวนเงิน"
                    aria-label="จำนวนเงินรายการ"
                  />
                </div>
                <div className="w-20 shrink-0">
                  <select
                    className={cx(baseControl, 'h-full')}
                    value={line.currency}
                    onChange={(e) => updateLine(i, { currency: e.target.value })}
                    aria-label="สกุลเงินรายการ"
                  >
                    {master.currencies.filter((c) => c.active).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={lines.length <= 1}
                  className="shrink-0 self-center rounded p-1.5 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-0"
                  aria-label="ลบรายการนี้"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              {line.uncertain && (
                <p className="flex items-center gap-1 text-[11px] zego-text-warning">
                  <Icon name="warning" className="h-3 w-3 shrink-0" />
                  อ่านจากใบเสร็จได้ไม่ชัดเจน — โปรดตรวจสอบตัวเลข/รายละเอียดนี้
                </p>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="mt-2 text-xs font-medium zego-text-info hover:underline">
          + เพิ่มรายการ
        </button>
      </div>

      {validLines.length > 0 && (
        <div className="text-sm zego-text-secondary">
          <p>
            รวม {validLines.length} รายการ
            {uncertainCount > 0 && <span className="ml-1 zego-text-warning">· {uncertainCount} รายการอ่านไม่ชัด โปรดตรวจสอบ</span>}
          </p>
          {/* แยกยอดเป็นบรรทัดตามสกุลเงิน — กันข้อความยาวล้นเมื่อใบเสร็จมีหลายสกุลเงินปนกัน */}
          <CurrencyStack totals={totalsByCurrency} lineClassName="font-semibold" />
        </div>
      )}

      <TextArea
        label="หมายเหตุ"
        optional
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="ข้อมูลเพิ่มเติมสำหรับบัญชี เช่น เหตุผลที่ไม่มีใบเสร็จ"
        rows={2}
      />

      {missing.length > 0 && !scanning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs zego-text-warning">
          ยังบันทึกไม่ได้ — ยังขาด: {missing.join(' · ')}
        </p>
      )}

      {/* บันทึกไว้ก่อน = ร่าง (ส่งพร้อมกันทีหลังได้) · บันทึกและส่งอนุมัติ = ส่งทันที */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          variant="secondary"
          disabled={missing.length > 0 || saving || scanning}
          onClick={() => void submit(true)}
        >
          บันทึกไว้ก่อน
        </Button>
        <Button
          variant="primary"
          disabled={missing.length > 0 || saving || scanning}
          loading={saving}
          onClick={() => void submit(false)}
        >
          บันทึกและส่งอนุมัติ
        </Button>
      </div>
      <button type="button" onClick={onCancel} className="w-full text-center text-xs font-medium zego-text-tertiary hover:underline">
        ยกเลิก
      </button>
    </Card>
  );
}
