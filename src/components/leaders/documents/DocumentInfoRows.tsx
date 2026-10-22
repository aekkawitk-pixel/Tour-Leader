'use client';

/**
 * รายละเอียดเอกสารแบบแถวข้อมูล (มุมหัวหน้าทัวร์ในพอร์ทัล) — แทนหน้าเอกสารจำลอง (VisaTemplate ฯลฯ) และการ์ดไฟล์ในแถว
 * แบบเดียวกับรายละเอียดหนังสือเดินทางในแผ่นของหัวหน้าทัวร์ (PassportCard → LeaderDetails):
 * ชื่อช่องซ้าย ค่าขวา · จัดเป็นกลุ่ม · ไม่มีค่า = "ยังไม่ระบุ"
 *
 * ช่องมาจาก DOC_SCHEMAS ชุดเดียวกับฟอร์ม → กรอกช่องไหนในฟอร์มก็เห็นช่องนั้นที่นี่
 *   วีซ่า — 3 กลุ่ม (ข้อมูลวีซ่า · วันที่และสถานที่ออก · ผู้ถือวีซ่า)
 *   เอกสารแนบไฟล์ (ประวัติอาชญากรรม · ใบเซอร์ · อื่น ๆ) — ตามต้นแบบ D3 "วันออกเอกสารและวันหมดอายุ"
 *   ชนิดอื่น (บัตรประชาชน · บัตรหัวหน้าทัวร์) — รวมกลุ่มเดียว
 * ทุกชนิด: แถว "ระยะเวลาคงเหลือ" สีตามสถานะต่อจากวันหมดอายุ · กลุ่ม "ไฟล์แนบ" ท้ายสุด (ชื่อไฟล์ ขนาด ผู้แนบ เปิดไฟล์)
 */

import type { ReactNode } from 'react';
import { useDemo } from '@/store/DemoStore';
import { diffDays, formatDate, formatDateTime } from '@/lib/format';
import { maskDocumentNumber } from '@/modules/tour-leaders/utils';
import { DOC_SCHEMAS, isFileBasedDocKind, type DocFieldDef } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/Primitives';

/** ช่องเสมือน — ชื่อผู้ถือวีซ่า ประกอบจากนามสกุล + ชื่อ (เรียงแบบที่พิมพ์บนสติกเกอร์) */
const HOLDER_NAME = '__holderName';
/** ช่องเสมือน — ระยะเวลาคงเหลือจนหมดอายุ (คำนวณ ไม่ได้กรอก) */
const REMAINING = '__remaining';
/** เกณฑ์ "ใกล้หมดอายุ" — เท่ากับป้ายในแถวและกระดิ่งเอกสาร */
const SOON_DAYS = 120;

const VISA_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'ข้อมูลวีซ่า', keys: ['countryId', 'number', 'visaType', 'category', 'entries', 'validFor', 'duration'] },
  { title: 'วันที่และสถานที่ออก', keys: ['issuedPlace', 'issuedDate', 'startDate', 'expiryDate', REMAINING] },
  { title: 'ผู้ถือวีซ่า', keys: [HOLDER_NAME, 'birthDate', 'nationality', 'sex', 'passportNo', 'authorizedBy'] },
];

/** ตัดคำอังกฤษ/"(ถ้ามี)" ในวงเล็บท้ายชื่อช่อง ("วันที่เริ่มใช้ (Valid from)" → "วันที่เริ่มใช้") · วงเล็บอื่น เช่น "(ไทย)" คงไว้ */
const shortLabel = (label: string) => label.replace(/\s*\((?:[A-Za-z][A-Za-z.\s/]*|ถ้ามี)\)\s*$/, '');

function InfoRow({ label, value, mono = false, emptyText = 'ยังไม่ระบุ', tone }: {
  label: string; value: ReactNode; mono?: boolean; emptyText?: string; tone?: 'red' | 'gold' | 'green';
}) {
  const empty = value === null || value === undefined || value === '';
  const color = tone ? `var(--zego-chip-${tone}-fg)` : undefined;
  return (
    <div className="zego-guide-inforow zego-divider-bottom py-2 last:border-b-0">
      <dt className="text-xs zego-text-tertiary">{label}</dt>
      <dd
        className={cx('text-sm', empty ? 'zego-text-disabled' : 'zego-text', mono && !empty && 'font-mono', tone && 'font-medium')}
        style={color && !empty ? { color } : undefined}
      >
        {empty ? emptyText : value}
      </dd>
    </div>
  );
}

function InfoGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 zego-divider-top pt-2.5">
      <h4 className="mb-0.5 text-xs font-semibold zego-text-secondary">{title}</h4>
      <dl>{children}</dl>
    </section>
  );
}

export function DocumentInfoRows({ doc, today, file, onViewFile }: {
  doc: AnyLeaderDocumentRecord;
  /** วันที่ใช้คำนวณวันคงเหลือ — ค่าเดียวกับป้ายสถานะของแถว */
  today: string;
  /** ข้อมูลไฟล์แนบที่แถวคำนวณไว้แล้ว (ขนาด · เวลาแนบ · ผู้แนบ) */
  file: { size: string; uploadedAt: string | null; uploadedBy: string | null };
  onViewFile?: () => void;
}) {
  const { countries } = useDemo();
  const schema = DOC_SCHEMAS[doc.kind].filter((f) => !f.hidden);
  const byKey = new Map(schema.map((f) => [f.key, f]));
  const raw = (key: string) => doc.fields[key]?.trim() || '';
  const fileBased = isFileBasedDocKind(doc.kind);

  /** ค่าที่แสดงตามชนิดช่อง — วันที่ dd/mm/yy · ตัวเลือกใช้ป้าย · ประเทศใช้ชื่อไทย (อังกฤษ) · เลขบัตรประชาชนปิดบัง */
  const display = (f: DocFieldDef): string => {
    const v = raw(f.key);
    if (!v) return '';
    switch (f.type) {
      case 'date': return formatDate(v);
      case 'select': {
        const label = f.options?.find((o) => o.value === v)?.label ?? v;
        // "MALE — ชาย" → "ชาย (MALE)" ให้ภาษาไทยขึ้นก่อนแบบเดียวกับแถวหนังสือเดินทาง ("ชาย (M)")
        const [code, th] = label.split(' — ');
        return th ? `${th} (${code})` : label;
      }
      case 'country': {
        const c = countries.find((x) => x.id === v);
        return c ? `${c.nameTh} (${c.nameEn})` : v;
      }
      case 'idnumber': return maskDocumentNumber('national_id', v);
      default: return v;
    }
  };

  const remainingRow = () => {
    const expiry = raw('expiryDate');
    if (!expiry) return <InfoRow key={REMAINING} label="ระยะเวลาคงเหลือ" value="ไม่มีวันหมดอายุ" />;
    const days = diffDays(today, expiry);
    if (days < 0) return <InfoRow key={REMAINING} label="ระยะเวลาคงเหลือ" value={`หมดอายุแล้ว ${Math.abs(days)} วัน`} tone="red" />;
    return <InfoRow key={REMAINING} label="ระยะเวลาคงเหลือ" value={`เหลือ ${days} วัน`} tone={days <= SOON_DAYS ? 'gold' : 'green'} />;
  };

  const row = (key: string) => {
    if (key === REMAINING) return remainingRow();
    if (key === HOLDER_NAME) {
      const name = [raw('holderLastName'), raw('holderFirstName')].filter(Boolean).join(' ') || raw('holderName');
      return <InfoRow key={key} label="ชื่อ–นามสกุล" value={name} />;
    }
    const f = byKey.get(key);
    if (!f) return null;
    return <InfoRow key={key} label={shortLabel(f.label)} value={display(f)} mono={key === 'number' || key === 'passportNo' || key === 'category'} />;
  };

  /** ใส่แถวระยะเวลาคงเหลือต่อจากวันหมดอายุ (ชนิดที่มีช่องวันหมดอายุ) */
  const withRemaining = (keys: string[]) =>
    keys.flatMap((k) => (k === 'expiryDate' && !keys.includes(REMAINING) ? [k, REMAINING] : [k]));

  const groups = doc.kind === 'visa'
    ? VISA_GROUPS
    : fileBased
      // ชื่อเอกสารเป็นหัวแถวอยู่แล้ว — เหลือแค่วันที่ (ต้นแบบ D3)
      ? [{ title: 'วันออกเอกสารและวันหมดอายุ', keys: withRemaining(schema.map((f) => f.key).filter((k) => k !== 'docTitle')) }]
      : [{ title: 'ข้อมูลเอกสาร', keys: withRemaining(schema.map((f) => f.key)) }];

  return (
    <div>
      {groups.map((g) => (
        <InfoGroup key={g.title} title={g.title}>{g.keys.map(row)}</InfoGroup>
      ))}

      {/* ไฟล์แนบ — ชื่อไฟล์ ขนาด ผู้แนบ และลิงก์เปิดไฟล์ (ต้นแบบ D3) */}
      <section className="mt-3 zego-divider-top pt-2.5">
        <h4 className="mb-1.5 text-xs font-semibold zego-text-secondary">ไฟล์แนบ</h4>
        {doc.imageId ? (
          <div className="flex items-center gap-3">
            <span className="zego-guide-tile zego-guide-tile--green"><Icon name="file" className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm zego-text">{doc.sourceFileName || 'ไฟล์แนบ'}</span>
              <span className="block text-xs zego-text-tertiary">
                {[file.size, file.uploadedAt && `แนบเมื่อ ${formatDateTime(file.uploadedAt)}`, file.uploadedBy && `โดย ${file.uploadedBy}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            {onViewFile && (
              <button type="button" onClick={onViewFile} className="zego-guide-link inline-flex shrink-0 items-center gap-1">
                <Icon name="eye" className="h-3.5 w-3.5" />
                เปิดไฟล์
              </button>
            )}
          </div>
        ) : fileBased ? (
          <p className="text-sm" style={{ color: 'var(--zego-chip-gold-fg)' }}>ยังไม่ได้แนบไฟล์ — เอกสารกลุ่มนี้ต้องแนบ PDF หรือรูปภาพ</p>
        ) : (
          <p className="text-sm zego-text-disabled">ยังไม่มีไฟล์</p>
        )}
      </section>
    </div>
  );
}
