'use client';

/**
 * บัตรประจำตัวประชาชน — จำลองหน้าบัตรจริงตามตำแหน่งที่พิมพ์อยู่บนบัตร
 *
 * จุดประสงค์เดียวกับหน้าเล่มหนังสือเดินทางและบัตรผู้นำเที่ยว: ให้ผู้ตรวจกวาดตาเทียบกับ
 * บัตรจริงได้ทีละช่องโดยไม่ต้องไล่หา — ไม่ใช่การตกแต่งให้สวย
 *
 * ผังตามบัตรจริง (ซ้าย→ขวา): ชิป · ช่องข้อมูล · รูปพร้อมสเกลวัดส่วนสูง
 * เรียงบนลงล่าง: ตราครุฑ+ชื่อบัตร · เลข 13 หลัก · ชื่อไทย → ชื่ออังกฤษ · วันเกิด ·
 * ที่อยู่ · แถวล่าง (วันออกบัตร | วันบัตรหมดอายุ)
 *
 * ป้ายกำกับพิมพ์สองภาษา — ไทยด้านบน อังกฤษสีน้ำเงินด้านล่าง เหมือนบัตรจริง
 * ชิปเป็นองค์ประกอบบนบัตรที่ไม่มีข้อมูลจริงให้แสดง จึงวาดเป็นภาพประกอบและซ่อนจาก
 * โปรแกรมอ่านหน้าจอ (aria-hidden) เพื่อไม่ให้อ่านเป็นข้อมูล
 */

import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate, formatThaiId } from '@/lib/format';
import { BANGKOK_CODE } from '@/data/thaiAdmin';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';

const DASH = '—';

/** สเกลวัดส่วนสูงข้างรูป — พิมพ์อยู่บนบัตรจริง (หน่วยเซนติเมตร) */
const HEIGHT_MARKS = [180, 170, 160, 150];

export function IdCardTemplate({
  doc,
  onViewFile,
}: {
  doc: AnyLeaderDocumentRecord;
  /** เปิดดูไฟล์บัตรใบนี้ (ไม่ส่งมา = ไม่มีไฟล์แนบ) */
  onViewFile?: () => void;
}) {
  const v = (key: string) => doc.fields[key]?.trim() || '';
  const date = (key: string) => {
    const raw = doc.fields[key]?.trim();
    return raw ? formatDate(raw) : DASH;
  };

  const thaiName = [v('title'), v('firstName'), v('lastName')].filter(Boolean).join(' ');
  /* บรรทัด Name บนบัตรพิมพ์คำนำหน้าไว้หน้าชื่อ เช่น "Mr. Sample" */
  const nameEn = [v('titleEn'), v('firstNameEn')].filter(Boolean).join(' ');
  const address = composeAddress(doc);

  return (
    /* คุมความกว้างไว้ให้ได้สัดส่วนใกล้บัตรจริง — ยืดเต็มจอแล้วช่องจะห่างจนเทียบกับบัตรยาก */
    <div className="mt-3 max-w-[44rem] overflow-hidden rounded-xl border border-slate-300 bg-gradient-to-br from-sky-50 via-sky-50/50 to-white shadow-sm">
      {/* หัวบัตร — ตราครุฑซ้าย ชื่อบัตรสองภาษา */}
      <div className="flex items-center gap-2.5 px-3 pb-1.5 pt-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-300 text-rose-300">
          <Icon name="star" className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 text-[13px] font-semibold leading-tight text-slate-800">
          ข้อมูลประจำตัวประชาชน
          <span className="ml-1.5 font-semibold text-blue-700">Thai National ID Card Data</span>
        </p>
      </div>

      <div className="px-3 pb-3">
        <div className="min-w-0">
          {/* เลข 13 หลัก — บนบัตรคั่นด้วยช่องว่าง ไม่ใช่ขีด */}
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <CardLabel th="เลขประจำตัวประชาชน" en="Identification Number" />
            <p className="font-mono text-[15px] font-bold tracking-wide text-slate-900">
              {formatThaiId(v('idNumber'), ' ') || DASH}
            </p>
          </div>

          {/* ชื่อ — ไทยตัวใหญ่ ตามด้วยอังกฤษสองบรรทัด · ชิปอยู่ซ้ายมือของบล็อกนี้ */}
          <div className="mt-1.5 flex gap-3 border-t border-sky-200/70 pt-1.5">
            <Chip />
            <div className="min-w-0 flex-1">
              <CardLabel th="ชื่อตัวและชื่อสกุล" />
              <p className="break-words text-[15px] font-semibold leading-snug text-slate-900">
                {thaiName || DASH}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[13px]">
                <span className="font-semibold text-blue-700">Given Name</span>
                <span className="font-medium text-slate-800">{nameEn || DASH}</span>
              </p>
              <p className="flex flex-wrap gap-x-2 text-[13px]">
                <span className="font-semibold text-blue-700">Surname</span>
                <span className="font-medium text-slate-800">{v('lastNameEn') || DASH}</span>
              </p>

              {/* วันเกิด — ป้ายสองภาษาตามบัตรจริง ส่วนตัววันที่ใช้รูปแบบมาตรฐานของระบบ (dd/mm/yy) */}
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="text-slate-500">เกิดวันที่</span>
                <span className="font-semibold text-blue-700">Date of Birth</span>
                <span className="font-medium text-slate-900">{date('birthDate')}</span>
              </p>
            </div>

            {/* รูปอยู่ขวาพร้อมสเกลวัดส่วนสูงขนาบสองข้างเหมือนบัตรจริง */}
            <div className="flex shrink-0 items-stretch gap-0.5">
              <HeightScale />
              <button
                type="button"
                onClick={onViewFile}
                disabled={!onViewFile}
                aria-label={onViewFile ? 'เปิดดูไฟล์บัตรใบนี้' : 'ยังไม่มีไฟล์แนบ'}
                className={cx(
                  'flex h-[6.5rem] w-[5rem] flex-col items-center justify-center gap-1 rounded border border-slate-300 bg-white text-slate-300',
                  onViewFile ? 'cursor-pointer hover:border-blue-400 hover:text-blue-500' : 'cursor-not-allowed',
                )}
              >
                <Icon name="file" className="h-5 w-5" />
                <span className="px-1 text-center text-[9px] leading-tight text-slate-400">
                  {onViewFile ? 'ดูไฟล์บัตร' : 'ไม่มีไฟล์แนบ'}
                </span>
              </button>
              <HeightScale />
            </div>
          </div>

          {/* ที่อยู่กินเต็มความกว้างใต้รูป เหมือนบนบัตรจริง */}
          <p className="mt-1.5 flex flex-wrap gap-x-2 border-t border-sky-200/70 pt-1.5 text-[13px]">
            <span className="shrink-0 text-slate-500">ที่อยู่</span>
            <span className="min-w-0 whitespace-pre-line break-words font-medium leading-snug text-slate-900">
              {address || DASH}
            </span>
          </p>

          {/* แถวล่าง — วันออกบัตรซ้าย วันหมดอายุขวา */}
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-sky-200/70 pt-1.5">
            <CardDate th="วันออกบัตร" en="Date of Issue" iso={v('issuedDate')} />
            <CardDate th="วันบัตรหมดอายุ" en="Date of Expiry" iso={v('expiryDate')} fallback="ตลอดชีพ" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** ป้ายกำกับสองภาษาซ้อนกัน — ไทยบน อังกฤษสีน้ำเงินล่าง ตามที่พิมพ์บนบัตร */
function CardLabel({ th, en }: { th: string; en?: string }) {
  return (
    <span className="block shrink-0">
      <span className="block text-[11px] leading-tight text-slate-500">{th}</span>
      {en && <span className="block text-[10px] font-semibold leading-tight text-blue-700">{en}</span>}
    </span>
  );
}

/**
 * วันที่บนบัตร — ป้ายกำกับสองภาษาตามที่พิมพ์บนบัตร
 * ตัววันที่ใช้รูปแบบมาตรฐานของระบบ (dd/mm/yy) เหมือนทุกหน้าจอ ไม่แปลงเป็น พ.ศ.
 * เพื่อไม่ให้ผู้ใช้ต้องแปลปีเองว่าหน้าไหนเป็น พ.ศ. หน้าไหนเป็น ค.ศ.
 */
function CardDate({
  th, en, iso, fallback = DASH,
}: { th: string; en: string; iso: string; fallback?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-slate-900">{iso ? formatDate(iso) : fallback}</p>
      <p className="text-[11px] leading-tight text-slate-500">{th}</p>
      <p className="text-[10px] font-semibold leading-tight text-blue-700">{en}</p>
    </div>
  );
}

/** สเกลวัดส่วนสูงข้างรูป — องค์ประกอบบนบัตรจริง ช่วยให้เทียบหน้าบัตรได้ตรง */
function HeightScale() {
  return (
    <div className="flex w-4 flex-col justify-between py-0.5 text-[7px] leading-none text-slate-400" aria-hidden="true">
      {HEIGHT_MARKS.map((m) => (
        <span key={m} className="text-right">{m}</span>
      ))}
    </div>
  );
}

/** ชิปทองบนบัตร — ภาพประกอบเช่นเดียวกับบาร์โค้ด */
function Chip() {
  return (
    <div
      aria-hidden="true"
      className="mt-1 h-9 w-11 shrink-0 rounded-[3px] border border-amber-500/60 bg-gradient-to-br from-amber-200 to-amber-400"
    >
      <div className="mx-auto mt-1 h-[calc(100%-0.5rem)] w-[60%] border-x border-amber-600/40" />
    </div>
  );
}

/**
 * ประกอบที่อยู่เป็นบรรทัดเดียวตามที่พิมพ์บนบัตร — รายละเอียด แขวง เขต จังหวัด รหัสไปรษณีย์
 * เติมคำนำหน้า "แขวง/เขต" หรือ "ต.เมื่ออยู่ต่างจังหวัด" ให้ตามที่บัตรจริงพิมพ์
 * เอกสารเก่าที่เก็บที่อยู่เป็นข้อความก้อนเดียว (ช่อง address) ยังแสดงได้เหมือนเดิม
 */
function composeAddress(doc: AnyLeaderDocumentRecord): string {
  const v = (key: string) => doc.fields[key]?.trim() || '';
  const bangkok = v('provinceCode') === BANGKOK_CODE;

  const parts = [
    v('addressLine'),
    v('subdistrict') && `${bangkok ? 'แขวง' : 'ต.'}${v('subdistrict')}`,
    v('district') && `${bangkok ? 'เขต' : 'อ.'}${v('district')}`,
    v('province') && (bangkok ? v('province') : `จ.${v('province')}`),
    v('postalCode'),
  ].filter(Boolean);

  // เอกสารรุ่นก่อนแยกช่อง — ที่อยู่ทั้งก้อนอยู่ในช่องเดียว
  return parts.length > 0 ? parts.join(' ') : v('address');
}
