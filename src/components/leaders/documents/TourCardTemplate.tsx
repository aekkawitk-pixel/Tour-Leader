'use client';

/**
 * บัตรผู้นำเที่ยว (Tour Leader Licence) — วางข้อมูลตามตำแหน่งบนหน้าบัตรจริง
 *
 * จุดประสงค์เดียวกับหน้าข้อมูลในเล่มหนังสือเดินทาง: ให้ผู้ตรวจกวาดตาเทียบกับบัตรจริง
 * ได้ทีละช่องโดยไม่ต้องไล่หา — ไม่ใช่การตกแต่งให้สวย
 *
 * ป้ายกำกับสองภาษาเหมือนบนบัตร (ไทย/อังกฤษ) เก็บไว้ในไฟล์นี้เพราะเป็นเรื่องการแสดงผลล้วน ๆ
 */

import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { tourCardTitle } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';

const DASH = '—';

export function TourCardTemplate({
  doc,
  onViewFile,
}: {
  doc: AnyLeaderDocumentRecord;
  /** เปิดไฟล์แนบของบัตรใบนี้ (ไม่ส่งมา = ไม่มีไฟล์) */
  onViewFile?: () => void;
}) {
  const v = (key: string) => doc.fields[key]?.trim() || '';
  const date = (key: string) => {
    const raw = doc.fields[key]?.trim();
    return raw ? formatDate(raw) : DASH;
  };

  const expiry = v('expiryDate');
  const title = tourCardTitle(v('cardType'));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-300 bg-gradient-to-b from-sky-50/70 to-white">
      {/* หัวบัตร */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white/70 px-4 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon name="guide" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-slate-800">{title.th}</p>
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
            {title.en}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* รูปบนบัตร */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onViewFile}
            disabled={!onViewFile}
            aria-label={onViewFile ? 'เปิดดูไฟล์บัตรใบนี้' : 'ยังไม่มีไฟล์แนบ'}
            className={cx(
              'flex h-28 w-[5.5rem] flex-col items-center justify-center gap-1 rounded border border-slate-300 bg-white text-slate-300',
              onViewFile ? 'cursor-pointer hover:border-blue-400 hover:text-blue-500' : 'cursor-not-allowed',
            )}
          >
            <Icon name="file" className="h-6 w-6" />
            <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
              {onViewFile ? 'ดูไฟล์บัตร' : 'ไม่มีไฟล์แนบ'}
            </span>
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <CField th="เลขที่" en="NO." value={v('number') || DASH} mono />

          <div className="space-y-1 border-t border-slate-200/70 pt-3">
            <p className="text-[10px] leading-tight text-slate-400">อนุญาตให้</p>
            <p className="break-words text-base font-semibold leading-snug text-slate-900">
              {v('holderName') || DASH}
            </p>
            <p className="break-words text-sm font-medium uppercase leading-snug text-slate-700">
              {v('holderNameEn') || DASH}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200/70 pt-3">
            <CField th="วันที่ออกบัตร" en="Date of Issue" value={date('issuedDate')} />
            <CField
              th="วันหมดอายุ"
              en="Date of Expiry"
              value={expiry ? formatDate(expiry) : 'ไม่ระบุ'}
            />
            <CField th="ประเภทบัตร" en="Type" value={v('cardType') || DASH} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** ช่องข้อมูล 1 ช่องบนหน้าบัตร — ป้ายไทย/อังกฤษตัวเล็กด้านบน ค่าด้านล่าง */
function CField({
  th, en, value, mono,
}: { th: string; en: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] leading-tight text-slate-400">
        {th} <span className="text-slate-400/80">/ {en}</span>
      </p>
      <p className={cx('mt-0.5 break-words text-sm font-medium text-slate-900', mono && 'font-mono')}>
        {value}
      </p>
    </div>
  );
}
