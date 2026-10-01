'use client';

/**
 * สติกเกอร์วีซ่า — จำลองหน้าสติกเกอร์จริงตามตำแหน่งที่พิมพ์อยู่
 *
 * จุดประสงค์เดียวกับหน้าเล่มหนังสือเดินทางและบัตรอื่น ๆ: ให้ผู้ตรวจกวาดตาเทียบกับ
 * สติกเกอร์ในเล่มจริงได้ทีละช่องโดยไม่ต้องไล่หา — ไม่ใช่การตกแต่งให้สวย
 *
 * ผังเรียงตามที่พิมพ์บนสติกเกอร์ไทย:
 *   สถานที่ออก · เริ่มใช้ · หมดอายุ → ประเภท · รหัสวีซ่า · จำนวนครั้ง
 *   → นามสกุล ชื่อ · วันเกิด · สัญชาติ → เลขหนังสือเดินทาง · เพศ · อนุญาตโดย
 *   → เลขที่วีซ่าท้ายสติกเกอร์
 *
 * ช่องของสติกเกอร์แบบเชงเก้น (ใช้ได้สำหรับ · ระยะเวลาพำนัก · วันที่ออกเอกสารแยกต่างหาก)
 * แสดงเฉพาะเมื่อมีข้อมูล เพื่อไม่ให้สติกเกอร์ไทยมีช่องว่างที่ของจริงไม่มี
 */

import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { useDemo } from '@/store/DemoStore';
import { passportCountryCodeOf } from '@/data/countryMaster';
import { visaEntriesLabel } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';

const DASH = '—';

export function VisaTemplate({
  doc,
  onViewFile,
}: {
  doc: AnyLeaderDocumentRecord;
  /** เปิดดูไฟล์แนบของวีซ่าใบนี้ (ไม่ส่งมา = ไม่มีไฟล์) */
  onViewFile?: () => void;
}) {
  const { countries } = useDemo();
  const v = (key: string) => doc.fields[key]?.trim() || '';
  const date = (key: string) => {
    const raw = doc.fields[key]?.trim();
    return raw ? formatDate(raw) : DASH;
  };

  const country = countries.find((c) => c.id === v('countryId')) ?? null;

  /*
   * สติกเกอร์พิมพ์นามสกุลกับชื่อไว้บรรทัดเดียว (GEIER JAMES CHRISTOPHER)
   * ระบบเก็บแยกช่องเพื่อค้นหา/เทียบกับหน้าเล่มได้ จึงประกอบกลับตอนแสดง
   * วีซ่าที่บันทึกไว้ก่อนแยกช่อง (ช่อง holderName เดิม) ยังแสดงได้เหมือนเดิม
   */
  const holderName = [v('holderLastName'), v('holderFirstName')].filter(Boolean).join(' ') || v('holderName');

  return (
    <div className="mt-3 max-w-[44rem] overflow-hidden rounded-xl border border-slate-300 bg-gradient-to-br from-rose-50/50 via-sky-50/40 to-amber-50/40 shadow-sm">
      {/* หัวสติกเกอร์ — ประเทศผู้ออก + คำว่า VISA */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/70 px-4 py-2">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-800">
          {country ? `${country.nameEn}` : 'VISA'}
          {country && <span className="ml-2 font-normal normal-case text-slate-500">{country.nameTh}</span>}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Visa</span>
          {country && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
              {passportCountryCodeOf(country)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* รูป/ตราบนสติกเกอร์ */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onViewFile}
            disabled={!onViewFile}
            aria-label={onViewFile ? 'เปิดดูไฟล์วีซ่าใบนี้' : 'ยังไม่มีไฟล์แนบ'}
            className={cx(
              'flex h-28 w-[5.5rem] flex-col items-center justify-center gap-1 rounded border border-slate-300 bg-white text-slate-300',
              onViewFile ? 'cursor-pointer hover:border-blue-400 hover:text-blue-500' : 'cursor-not-allowed',
            )}
          >
            <Icon name="file" className="h-6 w-6" />
            <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
              {onViewFile ? 'ดูไฟล์วีซ่า' : 'ไม่มีไฟล์แนบ'}
            </span>
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* 1-3 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <VField th="สถานที่ออกวีซ่า" en="Place of issue" value={v('issuedPlace') || DASH} />
            <VField th="วันที่เริ่มใช้" en="Valid from" value={date('startDate')} />
            <VField th="วันที่หมดอายุ" en="Valid until" value={date('expiryDate')} />
          </div>

          {/* 4-6 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200/70 pt-3 sm:grid-cols-3">
            <VField th="ประเภทวีซ่า" en="Type of visa" value={v('visaType') || DASH} />
            <VField th="รหัสวีซ่า" en="Category" value={v('category') || DASH} mono />
            <VField th="จำนวนครั้งที่เข้าได้" en="No. of entry" value={visaEntriesLabel(v('entries')) || DASH} />
          </div>

          {/* 7-9 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200/70 pt-3 sm:grid-cols-3">
            <VField th="นามสกุล, ชื่อ" en="Surname, Given Name" value={holderName || DASH} strong />
            <VField th="วันเกิด" en="Date of birth" value={date('birthDate')} />
            <VField th="สัญชาติ" en="Nationality" value={v('nationality') || DASH} />
          </div>

          {/* 10-12 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200/70 pt-3 sm:grid-cols-3">
            <VField th="หมายเลขหนังสือเดินทาง" en="Passport number" value={v('passportNo') || DASH} mono />
            <VField th="เพศ" en="Sex" value={v('sex') || DASH} />
            <VField th="อนุญาตโดย" en="Authorized signature" value={v('authorizedBy') || DASH} />
          </div>

          {/* ช่องแบบเชงเก้น — มีเฉพาะบางประเทศ จึงแสดงเมื่อกรอกไว้เท่านั้น */}
          {(v('validFor') || v('duration') || v('issuedDate')) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200/70 pt-3 sm:grid-cols-3">
              {v('validFor') && <VField th="ใช้ได้สำหรับ" en="Valid for" value={v('validFor')} />}
              {v('duration') && <VField th="ระยะเวลาพำนัก" en="Duration of stay" value={v('duration')} />}
              {v('issuedDate') && <VField th="วันที่ออกเอกสาร" en="Date of issue" value={date('issuedDate')} />}
            </div>
          )}
        </div>
      </div>

      {/* ท้ายสติกเกอร์ — เลขที่วีซ่า */}
      <div className="border-t border-slate-300 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <VLabel th="เลขที่วีซ่า" en="Visa number" />
          <p className="font-mono text-sm font-bold tracking-wide text-slate-900">{v('number') || DASH}</p>
        </div>
      </div>
    </div>
  );
}

/** ป้ายกำกับสองภาษา — ไทยบน อังกฤษตัวเล็กล่าง ตามที่พิมพ์บนสติกเกอร์ */
function VLabel({ th, en }: { th: string; en: string }) {
  return (
    <span className="block">
      <span className="block text-[10px] leading-tight text-slate-500">{th}</span>
      <span className="block text-[9px] uppercase leading-tight tracking-wide text-slate-400">{en}</span>
    </span>
  );
}

/** ช่องข้อมูล 1 ช่องบนสติกเกอร์ */
function VField({
  th, en, value, mono, strong,
}: { th: string; en: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <VLabel th={th} en={en} />
      <p
        className={cx(
          'mt-0.5 break-words text-slate-900',
          strong ? 'text-sm font-semibold uppercase' : 'text-sm font-medium',
          mono && 'font-mono',
        )}
      >
        {value}
      </p>
    </div>
  );
}
