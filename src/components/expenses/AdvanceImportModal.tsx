'use client';

/**
 * นำเข้าใบเบิกเงินทดรองจากไฟล์ "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" (.xls) — เลือกได้หลายไฟล์พร้อมกัน (1 ไฟล์ = 1 กรุ๊ป)
 *
 * ขั้นตอน: เลือกไฟล์ → อ่าน + แสดงตัวอย่างทีละไฟล์ (หัวเอกสาร / จำนวนรายการ / ยอดรวม / คำเตือน)
 * → จับคู่กรุ๊ปจาก "รหัสกรุ๊ป" ในไฟล์กับ Tour Period Master ให้อัตโนมัติ (ไม่เจอ = ค้นหาเลือกเอง)
 * → กดนำเข้า = ได้ใบเบิกเงินทดรอง (อนุมัติแล้ว) ของกรุ๊ปนั้น ที่หัวหน้าทัวร์เห็นในวิธีบันทึก "ตามรายการเบิก"
 */

import { useMemo, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Modal } from '@/components/ui/Modal';
import { Button, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency, formatDateRange } from '@/lib/format';
import { parseAdvanceXls, AdvanceXlsError, type ParsedAdvanceDoc } from '@/lib/import/advanceXls';
import { advanceDocToExpense } from '@/services/advanceImportStore';
import { diffAdvanceDoc, type AdvanceDiff } from '@/lib/import/advanceDiff';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { ExpenseRequest } from '@/types';

interface Entry {
  key: string;
  fileName: string;
  doc?: ParsedAdvanceDoc;
  error?: string;
  periodId: string;
  query: string;
  /** ยืนยันแล้วว่ารับทราบ — ต้องมีเมื่อฉบับใหม่ทำให้ใบเสร็จหลุดจากรายการเบิก */
  ackOrphans?: boolean;
}

export function AdvanceImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser, expenses, importAdvanceDocs } = useDemo();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // อ่านครั้งเดียวตอนเปิด — รายการพีเรียดไม่เปลี่ยนระหว่างนำเข้า
  const periods = useMemo(() => (open ? getTourPeriods() : []), [open]);
  const periodById = useMemo(() => new Map(periods.map((p) => [p.internalId, p])), [periods]);

  const close = () => {
    setEntries([]);
    onClose();
  };

  const pickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    setReading(true);
    const next: Entry[] = [];
    for (const file of files) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      try {
        const doc = parseAdvanceXls(await file.arrayBuffer(), file.name);
        // รหัสกรุ๊ปซ้ำได้ (§1) — เลือกพีเรียดแรกที่ตรง ผู้ใช้เปลี่ยนเองได้
        const existingGroup = expenses.find((x) => x.id === doc.ref && x.category === 'advance')?.jobId;
        const match = periods.find((p) => p.groupCode === doc.groupCode);
        next.push({ key, fileName: file.name, doc, periodId: existingGroup ?? match?.internalId ?? '', query: '' });
      } catch (err) {
        next.push({
          key,
          fileName: file.name,
          error: err instanceof AdvanceXlsError ? err.message : 'อ่านไฟล์ไม่สำเร็จ',
          periodId: '',
          query: '',
        });
      }
    }
    setEntries((prev) => [...prev.filter((p) => !next.some((n) => n.key === p.key)), ...next]);
    setReading(false);
  };

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((en) => (en.key === key ? { ...en, ...patch } : en)));
  const remove = (key: string) => setEntries((prev) => prev.filter((en) => en.key !== key));

  /** ใบเสร็จ (ค่าใช้จ่ายจริง ที่ยังไม่ถูกปฏิเสธ/ยกเลิก) ต่อ line id ของรายการงบ */
  const receiptsByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) {
      if (e.category !== 'actual' || e.status === 'rejected' || e.status === 'cancelled') continue;
      for (const l of e.lines) if (l.budgetLineId && !l.rejected) m.set(l.budgetLineId, (m.get(l.budgetLineId) ?? 0) + 1);
    }
    return m;
  }, [expenses]);

  /** Ref เดิมที่มีในระบบ → เทียบรายการ (จับคู่ด้วยเนื้อหา ไม่ใช่ลำดับ) */
  const diffs = useMemo(() => {
    const out = new Map<string, { existing: ExpenseRequest; diff: AdvanceDiff }>();
    for (const en of entries) {
      if (!en.doc) continue;
      const existing = expenses.find((x) => x.id === en.doc!.ref && x.category === 'advance');
      if (!existing) continue;
      out.set(en.key, { existing, diff: diffAdvanceDoc(en.doc.ref, existing.lines, en.doc.items, (id) => receiptsByLine.get(id) ?? 0) });
    }
    return out;
  }, [entries, expenses, receiptsByLine]);

  const ready = entries.filter((en) => {
    if (!en.doc || !en.periodId) return false;
    const d = diffs.get(en.key)?.diff;
    return !d || d.orphanedReceipts === 0 || en.ackOrphans;
  });

  const submit = () => {
    const docs = ready.map((en) =>
      advanceDocToExpense(en.doc!, en.periodId, { id: currentUser.id, name: currentUser.name }, diffs.get(en.key)?.diff.lineIds),
    );
    importAdvanceDocs(docs);
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="นำเข้าใบเบิกจากไฟล์ (.xls)"
      description="ไฟล์ &quot;เอกสารเบิกค่าใช้จ่ายกรุ๊ป&quot; — 1 ไฟล์ = 1 กรุ๊ป เลือกหลายไฟล์พร้อมกันได้ รายการจะแสดงให้หัวหน้าทัวร์ในเมนู &quot;ตามรายการเบิก&quot;"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs zego-text-tertiary">
            {entries.length > 0 && `พร้อมนำเข้า ${ready.length}/${entries.length} ไฟล์`}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>ยกเลิก</Button>
            <Button variant="primary" icon="download" disabled={ready.length === 0} onClick={submit}>
              นำเข้า {ready.length > 0 ? `${ready.length} ไฟล์` : ''}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={reading}
          className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed zego-border-color px-4 py-5 text-center hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60"
        >
          <Icon name="file" className="h-6 w-6 zego-text-tertiary" />
          <span className="text-sm font-medium zego-text">{reading ? 'กำลังอ่านไฟล์...' : 'เลือกไฟล์ .xls'}</span>
          <span className="text-xs zego-text-tertiary">เลือกได้หลายไฟล์ · นำเข้าไฟล์เลข Ref เดิมซ้ำ = แทนที่ใบเดิม</span>
        </button>
        <input ref={inputRef} type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={pickFiles} />

        {entries.map((en) => (
          <EntryCard
            key={en.key}
            entry={en}
            period={periodById.get(en.periodId)}
            periods={periods}
            compare={diffs.get(en.key)}
            onChange={(patch) => update(en.key, patch)}
            onRemove={() => remove(en.key)}
          />
        ))}
      </div>
    </Modal>
  );
}

function EntryCard({
  entry,
  period,
  periods,
  compare,
  onChange,
  onRemove,
}: {
  entry: Entry;
  period?: TourPeriodMaster;
  periods: TourPeriodMaster[];
  compare?: { existing: ExpenseRequest; diff: AdvanceDiff };
  onChange: (patch: Partial<Entry>) => void;
  onRemove: () => void;
}) {
  const { doc } = entry;
  const q = entry.query.trim().toUpperCase();
  const results = q.length >= 2
    ? periods.filter((p) => p.groupCode.includes(q) || p.displayName.toUpperCase().includes(q)).slice(0, 8)
    : [];
  const categories = doc ? [...new Set(doc.items.map((i) => i.category))] : [];

  return (
    <div className={cx('rounded-xl border p-3', entry.error ? 'border-rose-200 bg-rose-50/50' : 'zego-border-color')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold zego-text">{doc ? `Ref : ${doc.ref}` : entry.fileName}</p>
          <p className="truncate text-xs zego-text-tertiary">{entry.fileName}</p>
        </div>
        <button type="button" onClick={onRemove} className="shrink-0 rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600" aria-label="เอาไฟล์นี้ออก">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      {entry.error && <p className="mt-2 text-xs zego-text-danger">{entry.error}</p>}

      {doc && (
        <div className="mt-2 space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="zego-text-tertiary">รหัสกรุ๊ป (ไฟล์)</dt>
            <dd className="font-medium zego-text">{doc.groupCode || '—'}</dd>
            {doc.programName && (<><dt className="zego-text-tertiary">ชื่อรายการทัวร์</dt><dd className="zego-text-secondary">{doc.programName}</dd></>)}
            {doc.travelDates && (<><dt className="zego-text-tertiary">วันที่เดินทาง</dt><dd className="zego-text-secondary">{doc.travelDates}</dd></>)}
            {doc.pax && (<><dt className="zego-text-tertiary">Pax</dt><dd className="zego-text-secondary">{doc.pax}</dd></>)}
            {doc.printedBy && (<><dt className="zego-text-tertiary">พิมพ์โดย</dt><dd className="zego-text-secondary">{doc.printedBy}{doc.printedAt && ` · ${doc.printedAt}`}</dd></>)}
            {doc.contact && (<><dt className="zego-text-tertiary">ผู้ติดต่อ</dt><dd className="zego-text-secondary">{doc.contact}</dd></>)}
            <dt className="zego-text-tertiary">รายการ</dt>
            <dd className="zego-text-secondary">{doc.items.length} รายการ · {categories.length} หมวด ({categories.join(', ')})</dd>
            <dt className="zego-text-tertiary">ยอดรวม</dt>
            <dd className="font-semibold zego-text">
              {Object.entries(doc.totalsByCurrency).map(([c, a]) => formatCurrency(a, c)).join(' · ')}
              {doc.fileTotal !== null && Object.keys(doc.totalsByCurrency).length === 1 &&
                Math.abs(Object.values(doc.totalsByCurrency)[0] - doc.fileTotal) <= 0.01 && (
                  <span className="ml-1 font-normal zego-text-success">✓ ตรงกับยอดท้ายเอกสาร</span>
                )}
            </dd>
          </dl>

          {doc.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs zego-text-warning">
              <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />{w}
            </p>
          ))}
          {compare && (
            <RevisionSummary
              ref_={doc.ref}
              diff={compare.diff}
              ack={Boolean(entry.ackOrphans)}
              onAck={(v) => onChange({ ackOrphans: v })}
            />
          )}

          {/* กรุ๊ปที่จะผูก */}
          {period ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <Icon name="check" className="h-4 w-4 shrink-0 zego-text-success" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold zego-text">{period.groupCode} · {period.displayName}</span>
                <span className="block zego-text-tertiary">{period.countryName} · {formatDateRange(period.startDate, period.endDate)}</span>
              </span>
              <button type="button" onClick={() => onChange({ periodId: '' })} className="shrink-0 font-medium underline zego-text-success">
                เปลี่ยน
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
              <p className="text-xs zego-text-warning">
                {doc.groupCode ? `ไม่พบกรุ๊ป ${doc.groupCode} ในโปรแกรมทัวร์ — ค้นหาแล้วเลือกกรุ๊ปที่จะผูก` : 'เลือกกรุ๊ปที่จะผูกใบเบิกนี้'}
              </p>
              <input
                className="w-full rounded-md border zego-border-color zego-surface-bg px-2 py-1.5 text-sm"
                placeholder="พิมพ์รหัสกรุ๊ป หรือชื่อโปรแกรม (อย่างน้อย 2 ตัวอักษร)"
                value={entry.query}
                onChange={(e) => onChange({ query: e.target.value })}
              />
              {results.length > 0 && (
                <ul className="max-h-48 overflow-y-auto rounded-md border zego-border-color zego-surface-bg">
                  {results.map((p) => (
                    <li key={p.internalId}>
                      <button
                        type="button"
                        onClick={() => onChange({ periodId: p.internalId, query: '' })}
                        className="block w-full px-2 py-1.5 text-left text-xs hover:bg-emerald-50"
                      >
                        <span className="font-medium zego-text">{p.groupCode}</span>
                        <span className="zego-text-tertiary"> · {p.displayName} · {formatDateRange(p.startDate, p.endDate)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q.length >= 2 && results.length === 0 && <p className="text-xs zego-text-tertiary">ไม่พบกรุ๊ปที่ตรง</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Ref นี้มีในระบบแล้ว → สรุปว่าฉบับใหม่ต่างจากเดิมอย่างไร ก่อนแทนที่
 * รายการที่จับคู่ได้ใช้ id เดิม ใบเสร็จที่ผูกไว้จึงยังชี้ถูกรายการ · รายการที่ถูกลบ → ใบเสร็จหลุดเป็นนอกรายการ ต้องยืนยันก่อน
 */
function RevisionSummary({
  ref_,
  diff,
  ack,
  onAck,
}: {
  ref_: string;
  diff: AdvanceDiff;
  ack: boolean;
  onAck: (v: boolean) => void;
}) {
  const noChange = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
  const receiptsKept = diff.changed.reduce((s, c) => s + c.receipts, 0);
  return (
    <div className="space-y-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-900">
      <p className="flex items-start gap-1 font-semibold">
        <Icon name="info" className="mt-0.5 h-3 w-3 shrink-0" />
        มีใบเบิก {ref_} ในระบบแล้ว — นำเข้าจะแทนที่ด้วยฉบับนี้
      </p>
      {noChange ? (
        <p>รายการเหมือนเดิมทุกรายการ ({diff.unchangedCount} รายการ)</p>
      ) : (
        <>
          <p>
            เหมือนเดิม {diff.unchangedCount} · แก้ไข {diff.changed.length} · เพิ่มใหม่ {diff.added.length} · ถูกลบ {diff.removed.length}
          </p>
          {diff.changed.length > 0 && (
            <ul className="space-y-0.5">
              {diff.changed.map((c) => (
                <li key={c.oldLine.id}>
                  <span className="font-medium">แก้ไข: {c.item.purpose}</span> — {c.changes.join(' · ')}
                  {c.receipts > 0 && <span className="text-sky-700"> (ใบเสร็จ {c.receipts} ใบยังผูกกับรายการนี้)</span>}
                </li>
              ))}
            </ul>
          )}
          {diff.added.length > 0 && (
            <p>
              <span className="font-medium">เพิ่มใหม่:</span> {diff.added.map((a) => a.purpose).join(', ')}
            </p>
          )}
          {diff.removed.length > 0 && (
            <ul className="space-y-0.5">
              {diff.removed.map((r) => (
                <li key={r.line.id} className={r.receipts > 0 ? 'font-medium zego-text-danger' : ''}>
                  ถูกลบ: {r.line.purpose}
                  {r.line.description ? ` (${r.line.description})` : ''}
                  {r.receipts > 0 && ` — มีใบเสร็จผูกอยู่ ${r.receipts} ใบ`}
                </li>
              ))}
            </ul>
          )}
          {receiptsKept > 0 && <p className="text-sky-700">ใบเสร็จที่บันทึกไว้แล้วจะยังผูกกับรายการเดิม แม้ลำดับในไฟล์จะเปลี่ยน</p>}
        </>
      )}
      {diff.orphanedReceipts > 0 && (
        <label className="flex items-start gap-1.5 rounded bg-rose-50 px-2 py-1.5 zego-text-danger">
          <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => onAck(e.target.checked)} />
          <span>
            รับทราบ: ใบเสร็จ {diff.orphanedReceipts} ใบจะหลุดจากรายการเบิก (นับเป็นนอกรายการ) เพราะรายการที่ผูกอยู่ถูกลบในฉบับนี้
          </span>
        </label>
      )}
    </div>
  );
}
