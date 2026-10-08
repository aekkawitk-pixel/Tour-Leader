'use client';

/**
 * ตั้งค่าระบบ → ค่าส่งกรุ๊ป — มาตรฐานค่าส่งกรุ๊ปที่เจ้าหน้าที่ส่งกรุ๊ปเบิกได้ (ผู้ดูแลระบบเท่านั้น)
 *
 * ระบบคิดค่าส่งกรุ๊ปให้อัตโนมัติจากค่าที่ตั้งไว้ที่นี่ เจ้าหน้าที่แก้ยอดเองไม่ได้
 * มีผลกับใบเบิกที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดของตัวเองไว้ ไม่เปลี่ยนตามย้อนหลัง
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, CardHeader } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { formatCurrency, formatDate, formatDateTime, toISODateTime } from '@/lib/format';
import { getHolidays, missingAnnualHolidays, type Holiday } from '@/services/holidayService';
import { DEFAULT_SEND_OFF_FEE_RATES, validateSendOffFeeRates, type SendOffFeeRates } from '@/lib/logic/staffPortal';
import { loadSendOffFeeRates, saveSendOffFeeRates, type StoredSendOffFeeRates } from '@/services/sendOffFeeStore';

/** ค่าในฟอร์มเก็บเป็นข้อความ — ช่องว่างระหว่างพิมพ์ไม่กลายเป็น 0 ทันที */
interface FormState { normal: string; holiday: string; weekendAsHoliday: boolean }
const toForm = (r: SendOffFeeRates): FormState => ({ normal: String(r.normal), holiday: String(r.holiday), weekendAsHoliday: r.weekendAsHoliday });
const toRates = (f: FormState): SendOffFeeRates => ({ normal: Number(f.normal), holiday: Number(f.holiday), weekendAsHoliday: f.weekendAsHoliday });

export function SendOffFeeSettings() {
  const { currentUser, pushToast } = useDemo();
  const [saved, setSaved] = useState<StoredSendOffFeeRates>(DEFAULT_SEND_OFF_FEE_RATES);
  const [form, setForm] = useState<FormState>(toForm(DEFAULT_SEND_OFF_FEE_RATES));

  useEffect(() => {
    const r = loadSendOffFeeRates();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setSaved(r);
    setForm(toForm(r));
  }, []);

  const rates = toRates(form);
  const error = validateSendOffFeeRates(rates);
  const dirty = JSON.stringify(rates) !== JSON.stringify(toRates(toForm(saved)));
  const isDefault = JSON.stringify(rates) === JSON.stringify(DEFAULT_SEND_OFF_FEE_RATES);

  const submit = () => {
    if (error) return;
    try {
      setSaved(saveSendOffFeeRates(rates, currentUser.name, toISODateTime(new Date())));
      pushToast('success', 'บันทึกมาตรฐานค่าส่งกรุ๊ปแล้ว', 'มีผลกับใบเบิกที่ทำใหม่ตั้งแต่ตอนนี้');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-4">
      <CardHeader
        title="มาตรฐานค่าส่งกรุ๊ป"
        description="ค่าที่เจ้าหน้าที่ส่งกรุ๊ปเบิกได้ต่อ 1 กรุ๊ป — ระบบคิดให้อัตโนมัติตามวันที่ไปส่ง เจ้าหน้าที่แก้ยอดเองไม่ได้"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          label="วันปกติ (บาท / กรุ๊ป)"
          type="number"
          inputMode="decimal"
          min={1}
          value={form.normal}
          onChange={(e) => setForm((p) => ({ ...p, normal: e.target.value }))}
          hint={`ค่าเริ่มต้น ${formatCurrency(DEFAULT_SEND_OFF_FEE_RATES.normal, 'THB')}`}
        />
        <TextInput
          label="วันหยุด (บาท / กรุ๊ป)"
          type="number"
          inputMode="decimal"
          min={1}
          value={form.holiday}
          onChange={(e) => setForm((p) => ({ ...p, holiday: e.target.value }))}
          hint={`ค่าเริ่มต้น ${formatCurrency(DEFAULT_SEND_OFF_FEE_RATES.holiday, 'THB')} · ใช้เมื่อวันไปส่งตรงกับวันหยุด`}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg zego-surface-soft-bg px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
          checked={form.weekendAsHoliday}
          onChange={(e) => setForm((p) => ({ ...p, weekendAsHoliday: e.target.checked }))}
        />
        <span>
          <span className="block text-sm font-medium zego-text">นับเสาร์-อาทิตย์เป็นวันหยุดด้วย</span>
          <span className="block text-xs zego-text-tertiary">
            ไม่ติ๊ก = คิดอัตราวันหยุดเฉพาะวันที่ตั้งไว้ในเมนู &ldquo;วันหยุด&rdquo; (วันหยุดราชการ / วันหยุดที่เพิ่มเอง)
          </span>
        </span>
      </label>

      {error && <p className="zego-text-danger text-sm">{error}</p>}

      <div className="zego-divider-top flex flex-wrap items-center gap-2 pt-3">
        <Button variant="primary" disabled={Boolean(error) || !dirty} onClick={submit}>บันทึกมาตรฐาน</Button>
        <Button variant="secondary" disabled={!dirty} onClick={() => setForm(toForm(saved))}>ยกเลิกการแก้ไข</Button>
        <Button variant="ghost" disabled={isDefault} onClick={() => setForm(toForm(DEFAULT_SEND_OFF_FEE_RATES))}>ใช้ค่าเริ่มต้น</Button>
        {dirty && <span className="zego-text-warning text-xs">ยังไม่ได้บันทึก</span>}
        {saved.updatedAt && (
          <span className="zego-text-tertiary ml-auto text-xs">แก้ล่าสุด {formatDateTime(saved.updatedAt)}{saved.updatedBy ? ` โดย ${saved.updatedBy}` : ''}</span>
        )}
      </div>

      <HolidayRateList rates={rates} />

      <Callout tone="blue" title="มีผลกับใบเบิกไหนบ้าง">
        <ul className="ml-4 list-disc space-y-0.5">
          <li>ใบเบิกค่าส่งกรุ๊ปที่ทำใหม่ และใบที่เจ้าหน้าที่กด &ldquo;แก้ไข&rdquo; (คำนวณใหม่ทั้งใบ)</li>
          <li>ใบที่ส่งไปแล้วและไม่ได้แก้ไข เก็บยอดเดิมไว้ ไม่เปลี่ยนย้อนหลัง</li>
          <li>ตัวอย่างเดือนที่ส่ง 20 กรุ๊ปวันปกติ + 3 กรุ๊ปวันหยุด = {formatCurrency((Number(form.normal) || 0) * 20 + (Number(form.holiday) || 0) * 3, 'THB')}</li>
        </ul>
      </Callout>
    </div>
  );
}

/**
 * วันหยุดที่คิดอัตราวันหยุด — อ่านจากเมนู "วันหยุด" ของปีนั้น ๆ (holidayService) จุดเดียวกับปฏิทินทุกหน้า
 * ระบบดูปีของ "วันที่ไปส่ง" แล้วเทียบกับวันหยุดของปีนั้นเสมอ — แก้/เพิ่มวันหยุดที่เมนูวันหยุดแล้วมีผลทันที
 * วันหยุดทางจันทรคติต้องกรอกเองทุกปี → เตือนถ้ายังไม่ได้กรอก ไม่งั้นวันนั้นจะคิดอัตราปกติ
 */
function HolidayRateList({ rates }: { rates: SendOffFeeRates }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [list, setList] = useState<Holiday[]>([]);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    // อ่านหลัง mount — วันหยุดที่ผู้ดูแลแก้เก็บใน localStorage
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) เมื่อเปลี่ยนปี
    setList(getHolidays(year));
    setMissing(missingAnnualHolidays(year));
  }, [year]);

  return (
    <div className="rounded-lg border zego-border-color">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b zego-border-color px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold zego-text">วันหยุดที่คิดอัตราวันหยุด ({formatCurrency(rates.holiday || 0, 'THB')})</p>
          <p className="text-xs zego-text-tertiary">
            ตามเมนู &ldquo;วันหยุด&rdquo; ของแต่ละปี · ดูจากปีของวันที่ไปส่ง{rates.weekendAsHoliday ? ' · รวมเสาร์-อาทิตย์ทุกสัปดาห์' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border zego-border-color px-2 py-1.5 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="เลือกปี"
          >
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          <Link href="/holidays" className="text-xs font-medium zego-text-info hover:underline">แก้วันหยุด →</Link>
        </div>
      </div>
      {missing.length > 0 && (
        <p className="border-b zego-border-color bg-amber-50 px-3 py-2 text-xs zego-text-warning">
          ปี {year + 543} ยังไม่ได้กรอก: {missing.join(', ')} — วันเหล่านี้เปลี่ยนทุกปี ต้องกรอกที่เมนูวันหยุด ไม่งั้นวันนั้นจะคิดอัตราปกติ
        </p>
      )}
      {list.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs zego-text-tertiary">ยังไม่มีวันหยุดของปีนี้</p>
      ) : (
        <ul className="grid max-h-64 grid-cols-1 gap-x-4 overflow-y-auto px-3 py-2 text-sm sm:grid-cols-2">
          {list.map((h) => (
            <li key={h.date} className="flex gap-2 py-0.5">
              <span className="w-20 shrink-0 tabular-nums zego-text-tertiary">{formatDate(h.date)}</span>
              <span className="min-w-0 truncate zego-text-secondary">{h.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
