'use client';

/**
 * Passport Card (§2/§3/§4/§6) — หนังสือเดินทาง 1 เล่ม = 1 Card
 *
 * ส่วนหัว: เลข Mask · Tag เล่มหลัก · Tag สถานะ · อายุคงเหลือ · วันหมดอายุ · เมนูจัดการ
 * เนื้อใน: จำลอง "หน้าข้อมูลในเล่ม" ตามตำแหน่งจริง — รูปซ้าย · ช่องข้อมูลขวา · MRZ ล่างสุด
 *          ไม่มีแถบสรุปของระบบต่อท้าย เพื่อให้เนื้อในเป็นหน้าเล่มล้วน ๆ เทียบกับเล่มจริงได้ตรง ๆ
 *          เพิ่มเล่มใหม่ = Card ใบใหม่ต่อลงมาโดยใช้ template เดียวกัน
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Card, cx, Pill } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { maskPassport, maskPersonalId, passportRemainingText } from '@/lib/logic/tourLeaderMaster';
import { PASSPORT_CARD_STATUS_META, type CardActionEligibility } from '@/lib/logic/passportCard';
import type { PassportFieldKey } from '@/data/leaders/passportBookTypes';
import type { PassportCardModel } from '@/lib/logic/passportCardModel';
import { PassportDataPage } from './PassportDataPage';

const DASH = '—';

export type PassportCardAction =
  | 'viewImage' | 'edit' | 'replaceImage' | 'reOcr'
  | 'setPrimary' | 'deactivate' | 'history' | 'delete';

interface Props {
  card: PassportCardModel;
  todayISO: string;
  /** แสดงเลขเต็ม/วันเกิด/สถานที่เกิด (ผู้มีสิทธิ์เท่านั้น) */
  canViewFull: boolean;
  /** จัดการเล่มได้ (มีเมนู ⋮ + ปุ่มแก้ไข) */
  canManage: boolean;
  /** มีสิทธิ์แก้ไขข้อมูล (§11) */
  canEdit: boolean;
  /** เงื่อนไข Action ของเล่มนี้ (§2) */
  eligibility: CardActionEligibility;
  /** เปิดรายละเอียดเป็นค่าเริ่มต้น (เล่มหลัก §5) */
  defaultExpanded: boolean;
  /**
   * กำลังแก้ไขเล่มนี้อยู่ — ซ่อนหน้าเล่มแบบอ่านอย่างเดียว
   * เพราะฟอร์มแก้ไขที่กางอยู่ด้านล่างแสดงข้อมูลชุดเดียวกันแล้ว ไม่ต้องโชว์ซ้ำสองชั้น
   */
  editing?: boolean;
  /** ฟอร์มแก้ไขที่กางอยู่ในการ์ดใบนี้ — อยู่ในกรอบเดียวกับหน้าเล่มที่กำลังแก้ */
  children?: ReactNode;
  onAction: (action: PassportCardAction, card: PassportCardModel) => void;
  onToggleReveal: () => void;
  revealed: boolean;
  /** มุมหัวหน้าทัวร์ (พอร์ทัล) — ไม่แสดงป้าย/หมายเหตุที่มาของข้อมูล · ปุ่มขึ้นบรรทัดใหม่ได้บนจอแคบ */
  leaderView?: boolean;
}

export function PassportCard({
  card, todayISO, canViewFull, canManage, canEdit, eligibility, defaultExpanded, editing = false, children, onAction, onToggleReveal, revealed,
  leaderView = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  /** กำลังแก้ไข → ไม่ต้องแสดงหน้าเล่มอ่านอย่างเดียวซ้อนกับฟอร์ม · มุมหัวหน้าทัวร์ (อยู่ในแผ่นรายละเอียดแล้ว) แสดงเสมอ */
  const showDetails = (expanded || leaderView) && !editing;
  const meta = PASSPORT_CARD_STATUS_META[card.status];
  const expiry = card.fields.expiryDate || null;
  const showFull = canViewFull && revealed;

  const value = (key: PassportFieldKey) => card.fields[key]?.trim() || DASH;
  const dateValue = (key: PassportFieldKey) => {
    const v = card.fields[key]?.trim();
    return v ? formatDate(v) : DASH;
  };

  return (
    <Card className={cx(card.isPrimary && 'ring-1 ring-[var(--zego-primary-500)]')}>
      {/* ------------------------------ ส่วนหัว (§2) ------------------------------ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold zego-text">
              {showFull ? (card.fields.passportNo || DASH) : maskPassport(card.fields.passportNo || null)}
            </span>
            {card.isPrimary && <Pill tone="blue">เล่มหลัก</Pill>}
            <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', meta.tone)}>
              {meta.label}
            </span>
            {/* §10 Tag แหล่งที่มาของข้อมูล (เจ้าหน้าที่เท่านั้น) */}
            {!leaderView && <Pill tone="slate">{card.source === 'MASTER' ? 'จากไฟล์ต้นทาง' : card.entryMethod === 'OCR' ? 'จาก OCR' : 'กรอกเอง'}</Pill>}
            {card.saveStatus === 'DRAFT' && <Pill tone="amber">ฉบับร่าง</Pill>}
          </div>
          <p className="mt-1 text-sm zego-text-tertiary">
            {expiry
              ? `${passportRemainingText(expiry, todayISO)} · หมดอายุ ${formatDate(expiry)}`
              : 'ไม่ระบุวันหมดอายุ'}
          </p>
        </div>

        <div className={cx('flex items-center gap-1.5', leaderView ? 'w-full flex-wrap' : 'shrink-0')}>
          {canViewFull && card.fields.passportNo && (
            <Button size="sm" variant="secondary" icon="eye" onClick={onToggleReveal}>
              {revealed ? 'ซ่อนเลขเต็ม' : 'แสดงเลขเต็ม'}
            </Button>
          )}
          {/* §1 ปุ่มแก้ไขของเล่มนี้ — แสดงตลอดเวลาแม้ Card ย่ออยู่ (ไม่ต้องขยายก่อน) */}
          {/* กำลังแก้อยู่แล้ว → ไม่ต้องมีปุ่มเข้าโหมดแก้ไขซ้ำ (ปุ่มบันทึก/ยกเลิกอยู่ท้ายฟอร์ม) */}
          {card.manageable && canEdit && !editing && (
            <Button size="sm" variant="secondary" icon="edit" onClick={() => onAction('edit', card)}>
              แก้ไขข้อมูล Passport
            </Button>
          )}
          {!editing && !leaderView && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียด'}
            </Button>
          )}
          {card.manageable && canManage && (
            <ActionMenu card={card} eligibility={eligibility} canEdit={canEdit} onAction={(a) => onAction(a, card)} />
          )}
        </div>
      </div>

      {card.source === 'MASTER' && !leaderView && (
        <p className="mt-2 rounded-lg zego-surface-soft-bg px-3 py-1.5 text-xs zego-text-tertiary">
          ข้อมูลเล่มนี้มาจากไฟล์นำเข้าต้นทาง — แก้ไขที่ระบบต้นทางแล้วนำเข้าใหม่ (ระบบไม่แก้ทับให้อัตโนมัติ)
        </p>
      )}

      {/* ---------------- หน้าข้อมูลในเล่ม — วางตำแหน่งตามหน้าจริง (§6) ---------------- */}
      {/*
        แสดงเฉพาะหน้าเล่มจริง — แถบสรุป (อายุคงเหลือ/สถานะ/MRZ/แหล่งที่มา) ถูกนำออกแล้ว
        เพราะซ้ำกับส่วนหัวการ์ดที่บอกอายุคงเหลือ · วันหมดอายุ · สถานะ · แหล่งที่มาอยู่แล้ว
      */}
      {/* มุมหัวหน้าทัวร์: แถวข้อมูลแบบเดียวกับหน้าโปรไฟล์อื่น แทนหน้าเล่มจำลองที่ยาวและอ่านยากบนมือถือ */}
      {showDetails && leaderView && (
        <LeaderDetails card={card} showFull={showFull} onViewImage={() => onAction('viewImage', card)} />
      )}
      {showDetails && !leaderView && (
        <DataPage
          card={card}
          showFull={showFull}
          value={value}
          dateValue={dateValue}
          onViewImage={() => onAction('viewImage', card)}
        />
      )}

      {/* โหมดแก้ไข — ฟอร์มมาแทนหน้าเล่มอ่านอย่างเดียว โดยยังอยู่ในการ์ดใบเดิม */}
      {children}
    </Card>
  );
}

/* ------------------------- หน้าข้อมูลในเล่มหนังสือเดินทาง ------------------------- */

/**
 * หน้าเล่มแบบอ่านอย่างเดียว — ใช้ผังเดียวกับตอนแก้ไข (PassportDataPage)
 * ที่นี่จึงเหลือแค่ "ค่าในช่อง" ส่วนตำแหน่งช่องและป้ายกำกับสองภาษาเป็นหน้าที่ของผัง
 */
function DataPage({
  card, showFull, value, dateValue, onViewImage,
}: {
  card: PassportCardModel;
  showFull: boolean;
  value: (key: PassportFieldKey) => string;
  dateValue: (key: PassportFieldKey) => string;
  onViewImage: () => void;
}) {
  /** ค่าที่แสดงต่างจากค่าดิบ — ช่องอ่อนไหวปิดบัง · ช่องวันที่จัดรูปแบบ dd/mm/yy */
  const shown = (key: PassportFieldKey): string => {
    switch (key) {
      case 'passportNo': return showFull ? (card.fields.passportNo || DASH) : maskPassport(card.fields.passportNo || null);
      case 'nationalId': return showFull ? (card.fields.nationalId || DASH) : maskPersonalId(card.fields.nationalId || null);
      case 'dateOfBirth': return showFull ? dateValue('dateOfBirth') : '••/••/••';
      case 'placeOfBirth': return showFull ? value('placeOfBirth') : '••••';
      case 'issueDate':
      case 'expiryDate': return dateValue(key);
      default: return value(key);
    }
  };

  const mrz1 = card.fields.mrzLine1?.trim() ?? '';
  const mrz2 = card.fields.mrzLine2?.trim() ?? '';

  return (
    <PassportDataPage
      className="mt-4"
      photo={
        <button
          type="button"
          onClick={onViewImage}
          disabled={!card.imageId}
          aria-label={card.imageId ? 'เปิดดูไฟล์ต้นฉบับของเล่มนี้' : 'ยังไม่มีไฟล์แนบ'}
          className={cx(
            'flex h-32 w-24 flex-col items-center justify-center gap-1 rounded border zego-border-color zego-surface-bg zego-text-disabled',
            card.imageId ? 'cursor-pointer hover:border-[var(--zego-info)] hover:text-[var(--zego-info)]' : 'cursor-not-allowed',
          )}
        >
          <Icon name="file" className="h-7 w-7" />
          <span className="px-1 text-center text-[10px] leading-tight zego-text-tertiary">
            {card.imageId ? 'ดูไฟล์ต้นฉบับ' : 'ไม่มีไฟล์แนบ'}
          </span>
        </button>
      }
      renderSlot={(slot) => (
        <p className={cx('break-words text-sm font-medium zego-text', slot.mono && 'font-mono')}>
          {shown(slot.key)}
        </p>
      )}
      mrz={
        mrz1 || mrz2 ? (
          <div className="overflow-x-auto">
            {/* ตัวอักษรความกว้างเท่ากันเหมือนแถบ MRZ บนเล่มจริง */}
            <pre className="whitespace-pre font-mono text-xs leading-5 tracking-wider zego-text-secondary">
              {mrz1 || ' '}
              {'\n'}
              {mrz2 || ' '}
            </pre>
          </div>
        ) : (
          <p className="font-mono text-xs zego-text-disabled">ยังไม่มีข้อมูล MRZ</p>
        )
      }
    />
  );
}

/* ------------------- รายละเอียดแบบแถวข้อมูล (มุมหัวหน้าทัวร์) ------------------- */

/** เพศตามเล่ม (M/F) → ภาษาไทย + ตัวย่อเดิมในวงเล็บ ให้เทียบกับเล่มจริงได้ */
const GENDER_TH: Record<string, string> = { M: 'ชาย', F: 'หญิง' };

/** แถวข้อมูล (ชื่อช่อง : ค่า) — รูปแบบเดียวกับหน้าย่อยอื่นของโปรไฟล์ในพอร์ทัล · ไม่มีค่า = "ยังไม่ระบุ" */
function InfoRow({ label, value, mono = false, emptyText = 'ยังไม่ระบุ' }: { label: string; value: ReactNode; mono?: boolean; emptyText?: string }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="zego-guide-inforow zego-divider-bottom py-2 last:border-b-0">
      <dt className="text-xs zego-text-tertiary">{label}</dt>
      <dd className={cx('text-sm', empty ? 'zego-text-disabled' : 'zego-text', mono && !empty && 'font-mono')}>
        {empty ? emptyText : value}
      </dd>
    </div>
  );
}

function InfoGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 zego-divider-top pt-3">
      <h3 className="mb-1 text-xs font-semibold zego-text-secondary">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

/**
 * ข้อมูลในเล่มสำหรับหัวหน้าทัวร์ — ช่องเดียวกับหน้าเล่มจำลองครบทุกช่อง (ยกเว้นแถบ MRZ ที่เป็นข้อมูลเทคนิค)
 * จัดเป็น 3 กลุ่มอ่านง่ายบนจอแคบ · ช่องอ่อนไหวยังปิดบังจนกว่าจะกด "แสดงเลขเต็ม" (กติกาเดียวกับหน้าเล่ม)
 */
function LeaderDetails({ card, showFull, onViewImage }: { card: PassportCardModel; showFull: boolean; onViewImage: () => void }) {
  const f = card.fields;
  const v = (key: PassportFieldKey) => f[key]?.trim() || '';
  const d = (key: PassportFieldKey) => (v(key) ? formatDate(v(key)) : '');
  const nameEn = [v('firstName'), v('lastName')].filter(Boolean).join(' ');
  const nameTh = v('fullNameTh') || v('nameInThaiRaw') || [v('titleNameTh'), v('firstNameTh'), v('lastNameTh')].filter(Boolean).join(' ');
  const gender = v('gender');

  return (
    <div>
      <InfoGroup title="ข้อมูลเล่ม">
        <InfoRow label="เลขที่หนังสือเดินทาง" mono value={v('passportNo') && (showFull ? v('passportNo') : maskPassport(v('passportNo')))} />
        <InfoRow label="ประเภท" value={v('passportType')} />
        <InfoRow label="ประเทศผู้ออก" value={v('issuingCountry')} />
        <InfoRow label="ออกให้โดย" value={v('issuingAuthority')} />
        <InfoRow label="วันที่ออก" value={d('issueDate')} />
        <InfoRow label="วันหมดอายุ" value={d('expiryDate')} />
      </InfoGroup>

      <InfoGroup title="ชื่อตามหนังสือเดินทาง">
        <InfoRow label="ชื่อ–นามสกุล (อังกฤษ)" value={nameEn} />
        <InfoRow label="ชื่อ–นามสกุล (ไทย)" value={nameTh} />
      </InfoGroup>

      <InfoGroup title="ข้อมูลส่วนตัวในเล่ม">
        <InfoRow label="สัญชาติ" value={v('nationality')} />
        <InfoRow label="วันเกิด" value={v('dateOfBirth') && (showFull ? d('dateOfBirth') : '••/••/••')} />
        <InfoRow label="เพศ" value={gender && (GENDER_TH[gender.toUpperCase()] ? `${GENDER_TH[gender.toUpperCase()]} (${gender})` : gender)} />
        <InfoRow label="สถานที่เกิด" value={v('placeOfBirth') && (showFull ? v('placeOfBirth') : '••••')} />
        <InfoRow label="เลขประจำตัวประชาชน" mono value={v('nationalId') && (showFull ? v('nationalId') : maskPersonalId(v('nationalId')))} />
        <InfoRow label="ส่วนสูง" value={v('height')} />
      </InfoGroup>

      <InfoGroup title="ไฟล์หน้าเล่ม">
        <InfoRow
          label="รูปหน้าเล่ม"
          emptyText="ยังไม่มีไฟล์"
          value={card.imageId ? (
            <button type="button" onClick={onViewImage} className="zego-guide-link inline-flex items-center gap-1">
              <Icon name="eye" className="h-3.5 w-3.5" />
              ดูไฟล์
            </button>
          ) : ''}
        />
      </InfoGroup>
    </div>
  );
}

/* ------------------------------ เมนูจัดการ (§6) ------------------------------ */

function ActionMenu({
  card, eligibility, canEdit, onAction,
}: { card: PassportCardModel; eligibility: CardActionEligibility; canEdit: boolean; onAction: (a: PassportCardAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // §2 รายการเมนู · Action ที่ใช้ไม่ได้ → Disable + Tooltip อธิบายเหตุผล
  const items: { key: PassportCardAction; label: string; disabled?: boolean; hint?: string; danger?: boolean }[] = [
    { key: 'viewImage', label: 'ดูรูป Passport', disabled: !card.imageId, hint: 'ยังไม่มีรูปแนบ' },
    { key: 'edit', label: 'แก้ไขข้อมูล Passport', disabled: !canEdit, hint: 'ไม่มีสิทธิ์แก้ไข' },
    { key: 'replaceImage', label: 'อัปโหลดรูปใหม่', disabled: !canEdit, hint: 'ไม่มีสิทธิ์แก้ไข' },
    { key: 'reOcr', label: 'อ่านข้อมูลด้วย OCR ใหม่', disabled: !canEdit, hint: 'ไม่มีสิทธิ์แก้ไข' },
    // §6 เล่มหลักอยู่แล้วไม่ต้องแสดงคำสั่งนี้
    ...(card.isPrimary ? [] : [{
      key: 'setPrimary' as const,
      label: 'ตั้งเป็นเล่มหลัก',
      disabled: !eligibility.setPrimary.enabled,
      hint: eligibility.setPrimary.reason,
    }]),
    { key: 'history', label: 'ดูประวัติการแก้ไข' },
    {
      key: 'deactivate',
      label: card.lifecycle === 'ACTIVE' ? 'ปิดใช้งาน' : 'กลับมาใช้งาน',
      // ปิดใช้งานถูกล็อกเฉพาะตอนกำลัง "ปิด" เล่มหลักที่ยังมีเล่มอื่น · การกลับมาใช้งานทำได้เสมอ
      disabled: card.lifecycle === 'ACTIVE' && !eligibility.deactivate.enabled,
      hint: eligibility.deactivate.reason,
    },
    { key: 'delete', label: 'ลบ Passport', danger: true, disabled: !eligibility.delete.enabled, hint: eligibility.delete.reason },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`เมนูจัดการหนังสือเดินทาง ${maskPassport(card.fields.passportNo || null)}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex rounded-lg p-1.5 zego-text-tertiary zego-hover-surface"
      >
        <Icon name="more" className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border zego-border-color zego-surface-bg py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? item.hint : undefined}
              onClick={() => { setOpen(false); onAction(item.key); }}
              className={cx(
                'block w-full px-3 py-2 text-left text-sm transition-colors',
                item.disabled
                  ? 'cursor-not-allowed zego-text-disabled'
                  : item.danger
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'zego-text-secondary zego-hover-surface',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
