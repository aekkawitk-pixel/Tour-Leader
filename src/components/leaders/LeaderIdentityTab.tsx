'use client';

/**
 * แท็บ "ข้อมูลส่วนตัวและ Passport" — ลำดับ Card ตาม §12
 *
 *   1. ข้อมูลทั่วไป      → ปุ่ม "แก้ไขข้อมูลทั่วไป"      (GeneralInfoEditModal)
 *   2. ข้อมูลติดต่อ      → ปุ่ม "แก้ไขข้อมูลติดต่อ"      (LeaderSectionEditModal · contact)
 *   3. ข้อมูลการร่วมงาน  → ปุ่ม "แก้ไขข้อมูลการร่วมงาน"  (LeaderSectionEditModal · employment)
 *   4. เอกสารประจำตัว    → ปุ่ม "แก้ไขเอกสารประจำตัว"    (LeaderSectionEditModal · identity-docs)
 *   5. จัดการหนังสือเดินทางทุกเล่ม (หลายเล่ม/OCR/ไฟล์/ประวัติ)
 *
 * การ์ดสรุป "ข้อมูล Passport" และ "การตรวจสอบข้อมูล" ถูกนำออกแล้ว —
 * ข้อมูลทุกช่องอ่านได้จากการ์ดหน้าเล่มใน "จัดการหนังสือเดินทางทุกเล่ม" โดยตรง
 *
 * โหมดดูข้อมูลเป็นค่าเริ่มต้น · แต่ละ Card มีปุ่มแก้ไขและบันทึกของตัวเอง —
 * ห้ามเปิด Modal แก้ไขแบบหลายแท็บสำหรับหัวหน้าทัวร์ที่มีข้อมูลแล้ว (§2)
 */

import { useMemo, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { Avatar, Button, Card, CardHeader, cx, Pill, StatusBadge } from '@/components/ui/Primitives';
import { GeneralInfoEditModal } from '@/components/leaders/GeneralInfoEditModal';
import { LeaderSectionEditModal, type LeaderSectionKey } from '@/components/leaders/LeaderSectionEditModal';
import {
  GENDER, LEADER_STATUS, LEADER_TYPE, LEADER_USAGE_STATUS, CONTACT_TYPE, LEADER_SOURCE_TYPE,
  PERSON_TYPE, PAY_TYPE, PAY_UNIT, RELIGION, MARITAL_STATUS, DOC_HOLDING_STATUS,
} from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { formatAddress } from '@/modules/tour-leaders/utils';
import { getPassportBooks } from '@/services/passportBookStore';
import { getTourLeaderById, getIdentityDocument } from '@/services/tourLeaderMaster';
import { isMasterPassportHidden } from '@/services/masterPassportHidden';
import { buildPassportCards, masterIdentityToCard } from '@/lib/logic/passportCardModel';
import { getPrimaryDocument } from '@/services/documentStore';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import { bookToCard } from '@/lib/logic/passportCardModel';
import { PassportEditModal } from '@/components/leaders/passport/PassportEditModal';
import { LeaderPassportTab } from '@/components/leaders/LeaderPassportTab';
import type { TourLeader } from '@/types';

/** แถว Label / Value — ไม่แสดง undefined/null (§20) */
function Row({
  label,
  value,
  mono,
  emptyText = '—',
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  /** ข้อความเมื่อไม่มีข้อมูล — บางการ์ดกำหนดให้ใช้ “ยังไม่ระบุ” แทนขีด */
  emptyText?: string;
}) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 zego-divider-bottom py-1.5 last:border-b-0">
      <dt className="text-xs zego-text-tertiary">{label}</dt>
      <dd className={cx('text-sm', empty ? 'zego-text-disabled' : 'zego-text', mono && 'font-mono')}>
        {empty ? emptyText : value}
      </dd>
    </div>
  );
}

/* ------------------- อ่านค่าจาก "เอกสาร" ไม่ใช่จากโปรไฟล์ ------------------- */

/**
 * ค่าช่องเดียวของเอกสาร — ว่าง/ไม่มีเอกสาร = undefined เพื่อให้ Row แสดง "ยังไม่ระบุ"
 * ห้ามตกไปใช้ค่าจากโปรไฟล์แทน: ชื่อบนบัตรกับชื่อในโปรไฟล์เป็นคนละค่ากันได้
 */
const docField = (doc: AnyLeaderDocumentRecord | null, key: string): string | undefined =>
  doc?.fields[key]?.trim() || undefined;

/** ประกอบชื่อจากช่องของเอกสารใบนั้นเท่านั้น */
const docName = (doc: AnyLeaderDocumentRecord | null, keys: readonly string[]): string | undefined =>
  keys.map((k) => docField(doc, k)).filter(Boolean).join(' ') || undefined;

/** ที่อยู่บนบัตร — เอกสารเก็บเป็นช่องข้อความแยก (ไม่ใช่ LeaderAddress) จึงประกอบเอง */
const docAddress = (doc: AnyLeaderDocumentRecord | null): string | undefined =>
  ['addressLine', 'subdistrict', 'district', 'province', 'postalCode']
    .map((k) => docField(doc, k))
    .filter(Boolean)
    .join(' ') || undefined;

/** ปิดบังเลขหนังสือเดินทาง — AA******45 (§7) */
const maskPassportNo = (no: string): string =>
  no.length <= 4 ? '*'.repeat(Math.max(no.length, 4)) : `${no.slice(0, 2)}${'*'.repeat(no.length - 4)}${no.slice(-2)}`;

/* ---------------- Inline Edit: ข้อมูลทั่วไป (§1–§4/§10) ---------------- */

/** ช่องเดียวใน grid — Label อยู่บน ค่า/Input อยู่ล่าง (ตำแหน่งเดิมทั้ง 2 โหมด → ไม่กระโดด §2/AC9) */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-1.5">
      <p className="mb-0.5 text-xs zego-text-tertiary">{label}</p>
      {children}
    </div>
  );
}

/** ค่าแบบอ่านอย่างเดียว — ไม่แสดง undefined/null (§20) */
function V({ value, mono }: { value?: React.ReactNode; mono?: boolean }) {
  const empty = value === undefined || value === null || value === '';
  return <p className={cx('text-sm', empty ? 'zego-text-disabled' : 'zego-text', mono && 'font-mono')}>{empty ? '—' : value}</p>;
}


/**
 * กลุ่มการ์ดที่เลือกแสดงได้ — ใช้แยกเนื้อหาไปคนละแท็บโดยไม่ต้องคัดลอกโค้ด
 *   personal  = ข้อมูลทั่วไป · ข้อมูลติดต่อ · ข้อมูลการร่วมงาน   (แท็บ "ข้อมูลส่วนตัว")
 *   documents = จัดการหนังสือเดินทางทุกเล่ม                        (แท็บ "เอกสารประจำตัว")
 * ⚠️ Passport ต้องอยู่แท็บ "เอกสารส่วนตัว" เท่านั้น ห้ามแสดงซ้ำในแท็บข้อมูลส่วนตัว
 */
export type IdentitySection = 'personal' | 'documents';

export function LeaderIdentityTab({
  leader,
  sections = ['personal', 'documents'],
  onGoStatus,
  onGoDocuments,
}: {
  leader: TourLeader;
  /** แสดงเฉพาะกลุ่มที่ระบุ (ค่าเริ่มต้น = ครบทุกกลุ่ม) */
  sections?: readonly IdentitySection[];
  /** §4 ลิงก์ไปแท็บ "สถานะและการลา" — สถานะพร้อมรับงานแก้ที่นั่นเท่านั้น */
  onGoStatus: () => void;
  /** ลิงก์ไปแท็บ "เอกสารประจำตัว" — เอกสารประจำตัวทุกใบกรอก/แก้ที่นั่นที่เดียว */
  onGoDocuments: () => void;
}) {
  const showPersonal = sections.includes('personal');
  const showDocuments = sections.includes('documents');
  const { countries, currentUser, today } = useDemo();
  const [rev, setRev] = useState(0);
  /** เปิดเผยเลขบัตรประชาชนเต็ม — เฉพาะผู้มีสิทธิ์ และต้องกดเปิดเองทุกครั้ง */
  const [showFullIdNo, setShowFullIdNo] = useState(false);
  const [editBook, setEditBook] = useState<ReturnType<typeof bookToCard> | null>(null);

  /** §1 แก้ไขข้อมูลทั่วไปผ่าน Modal เฉพาะหมวด (ไม่ใช่ Inline Edit) */
  const [generalModalOpen, setGeneralModalOpen] = useState(false);
  /** §1/§5 Modal เฉพาะหมวดอื่น ๆ ของแท็บนี้ */
  const [section, setSection] = useState<LeaderSectionKey | null>(null);

  const generalRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<HTMLDivElement>(null);

  const canViewIdentity = can(currentUser.role, 'passport.view');
  const passportCards = useMemo(() => {
    void rev;
    const books = canViewIdentity ? getPassportBooks(leader.id) : [];
    const master = canViewIdentity && !isMasterPassportHidden(leader.id)
      ? masterIdentityToCard(getTourLeaderById(leader.id), getIdentityDocument(leader.id, canViewIdentity), today)
      : null;
    return buildPassportCards(books, master, today);
  }, [leader.id, rev, canViewIdentity, today]);
  /* บัตรประชาชนฉบับหลัก — ต้นทางเดียวของ "ข้อมูลตามบัตร" (แท็บนี้แสดงอย่างเดียว ไม่แก้) */
  const idCard = useMemo(() => { void rev; return getPrimaryDocument(leader.id, 'id_card'); }, [leader.id, rev]);

  const canViewFullNo = can(currentUser.role, 'passport.viewFull');
  const canEdit = can(currentUser.role, 'leader.edit');

  const nationality = countries.find((c) => c.id === leader.nationalityCountryId);
  const birthCountry = countries.find((c) => c.id === leader.birthCountryId);
  const isForeigner = leader.personType === 'foreigner';
  /** เลขบัตรมาจากเอกสารเท่านั้น — ไม่ใช้ leader.nationalIdNumber ที่เป็นข้อมูลชุดเก่า */
  const idCardNumber = docField(idCard, 'idNumber');
  const displayName = `${leader.firstName} ${leader.lastName}`.trim() + (leader.nickname ? ` (${leader.nickname})` : '');



  // §3 ใช้ค่า default เสมอ — กันข้อมูลที่รูปแบบไม่ครบ (null/undefined) ทำให้เรนเดอร์ล้ม
  const contacts = leader.contacts ?? [];
  const emergencyContacts = leader.emergencyContacts ?? [];
  const assignedCountries = leader.assignedCountries ?? [];
  const address = leader.address ?? null;

  const contactOf = (type: string) => contacts.filter((c) => c.type === type).map((c) => c.value).join(' · ');

  return (
    <div className="space-y-5">
      {/* ==================== 1. ข้อมูลทั่วไป (เต็มความกว้าง §3) ==================== */}
      {showPersonal && (
      <div ref={generalRef}>
        <Card>
          <CardHeader
            title="ข้อมูลทั่วไป"
            description="ข้อมูลประจำตัวของหัวหน้าทัวร์"
            action={canEdit ? <Button size="sm" variant="secondary" icon="edit" onClick={() => setGeneralModalOpen(true)}>แก้ไขข้อมูลทั่วไป</Button> : undefined}
          />

          <div className="flex flex-wrap items-start gap-5">
            <Avatar initials={leader.avatarInitials} color={leader.avatarColor} size="lg" src={leader.photoUrl} alt={`รูปของ ${displayName}`} />

            <div className="grid min-w-0 flex-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              <Cell label="รหัสหัวหน้าทัวร์"><V value={leader.id} mono /></Cell>
              {/* เฉพาะ “ความพร้อมรับงาน” เท่านั้น — สถานะโปรไฟล์อยู่ที่ Card “ข้อมูลการร่วมงาน”
                  (เดิมติดป้าย “ระงับการใช้งาน” จาก !active ซึ่งเป็นจริงเฉพาะกรณี “สิ้นสุดการร่วมงาน”) */}
              <Cell label="ความพร้อมรับงาน">
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
                  <button type="button" onClick={onGoStatus} className="text-[11px] font-medium zego-text-info hover:underline">จัดการความพร้อมและการลา</button>
                </span>
              </Cell>
              <Cell label="ชื่อ–นามสกุล (ชื่อเล่น)"><V value={displayName} /></Cell>
              <Cell label="คำนำหน้า (ไทย)"><V value={leader.title} /></Cell>
              <Cell label="ชื่อ (ไทย)"><V value={leader.firstName} /></Cell>
              <Cell label="นามสกุล (ไทย)"><V value={leader.lastName} /></Cell>
              {/* คำนำหน้า/ชื่อเล่นภาษาอังกฤษ เก็บแยกจากภาษาไทย — เดิมกรอกได้ตอนสร้างแต่ไม่เคยแสดงที่ไหน */}
              <Cell label="คำนำหน้า (อังกฤษ)"><V value={leader.titleEn} /></Cell>
              <Cell label="ชื่อ (อังกฤษ)"><V value={leader.firstNameEn} /></Cell>
              <Cell label="นามสกุล (อังกฤษ)"><V value={leader.lastNameEn} /></Cell>
              <Cell label="ชื่อเล่น"><V value={leader.nickname} /></Cell>
              <Cell label="ชื่อเล่น (อังกฤษ)"><V value={leader.nicknameEn} /></Cell>
              <Cell label="เพศ"><V value={GENDER[leader.gender]?.label} /></Cell>
              <Cell label="วันเกิด"><V value={leader.birthDate ? formatDate(leader.birthDate) : ''} /></Cell>
              <Cell label="สัญชาติ"><V value={nationality ? `${nationality.nameEn} (${nationality.nameTh})` : ''} /></Cell>
              <Cell label="ประเทศที่เกิด"><V value={birthCountry ? `${birthCountry.nameEn} (${birthCountry.nameTh})` : ''} /></Cell>
              <Cell label="ศาสนา">
                <V value={leader.religion ? (leader.religion === 'other' ? `${RELIGION.other} (${leader.religionOther ?? '—'})` : RELIGION[leader.religion]) : ''} />
              </Cell>
              <Cell label="สถานภาพสมรส"><V value={leader.maritalStatus ? MARITAL_STATUS[leader.maritalStatus] : ''} /></Cell>
              <Cell label="ประเทศประจำ">
                <V value={assignedCountries.length === 0 ? '' : assignedCountries.map((a) => countries.find((c) => c.id === a.countryId)?.nameEn ?? a.countryId).join(' · ')} />
              </Cell>
              <Cell label="วันที่เริ่มร่วมงาน"><V value={leader.joinedAt ? formatDate(leader.joinedAt) : ''} /></Cell>
              <Cell label="แหล่งที่มาของข้อมูล">
                <V value={leader.sourceType ? (leader.sourceType === 'other' ? `${LEADER_SOURCE_TYPE.other} (${leader.sourceOther ?? '—'})` : LEADER_SOURCE_TYPE[leader.sourceType]) : ''} />
              </Cell>
            </div>
          </div>

          {/*
            ---------- เอกสารประจำตัว (สรุป) — หัวข้อย่อยใน Card เดียวกัน ----------

            ⚠️ ทุกแถวอ่านจาก "ส่วนที่เป็นเจ้าของข้อมูล" เท่านั้น
               บัตรประชาชน = เอกสาร id_card ในแท็บ "เอกสารประจำตัว" — ไม่ตกไปใช้ชื่อ/วันเกิด
               ในโปรไฟล์ทั่วไปแทน เพราะเป็นคนละค่ากันได้ และเคยทำให้หน้านี้ขึ้นชื่อ
               ทั้งที่ยังไม่เคยกรอกบัตรสักใบ (ดูเหมือนอ่านมาจากบัตรจริง)
            ⚠️ หนังสือเดินทางยังอยู่แท็บ "เอกสารประจำตัว" เท่านั้น — ที่นี่ลิงก์ไป ไม่แสดงซ้ำ
            ชุดแถวเปลี่ยนตาม personType เหมือนฟอร์มกรอก (ไทย = บัตรประชาชน · ต่างชาติ = วีซ่า/ใบอนุญาตทำงาน)
          */}
          <div className="mt-4 zego-divider-top pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold zego-text">
                {isForeigner ? 'เอกสารประจำตัว (บุคคลต่างชาติ)' : 'ข้อมูลบัตรประชาชน'}
              </p>
              <Button size="sm" variant="ghost" icon="file" onClick={onGoDocuments}>
                ไปที่เอกสารประจำตัว
              </Button>
            </div>

            {isForeigner ? (
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <Row
                  label="หนังสือเดินทาง"
                  emptyText="ยังไม่มีในระบบ"
                  value={passportCards.length > 0 ? `${passportCards.length} เล่มในระบบ — ดูที่แท็บเอกสารประจำตัว` : ''}
                />
                <Row label="สถานะวีซ่า" emptyText="ยังไม่ระบุ" value={leader.visaStatus ? DOC_HOLDING_STATUS[leader.visaStatus] : ''} />
                {leader.visaStatus === 'has' && (
                  <>
                    <Row label="ประเภทวีซ่า" emptyText="ยังไม่ระบุ" value={leader.visaType} />
                    <Row label="หมายเลขวีซ่า" mono emptyText="ยังไม่ระบุ" value={leader.visaNumber} />
                    <Row label="วันหมดอายุวีซ่า" emptyText="ยังไม่ระบุ" value={leader.visaExpiresAt ? formatDate(leader.visaExpiresAt) : ''} />
                  </>
                )}
                <Row label="สถานะใบอนุญาตทำงาน" emptyText="ยังไม่ระบุ" value={leader.workPermitStatus ? DOC_HOLDING_STATUS[leader.workPermitStatus] : ''} />
                {leader.workPermitStatus === 'has' && (
                  <>
                    <Row label="เลขที่ใบอนุญาตทำงาน" mono emptyText="ยังไม่ระบุ" value={leader.workPermitNumber} />
                    <Row label="วันหมดอายุใบอนุญาตทำงาน" emptyText="ยังไม่ระบุ" value={leader.workPermitExpiresAt ? formatDate(leader.workPermitExpiresAt) : ''} />
                  </>
                )}
              </dl>
            ) : idCard ? (
              <>
                <dl className="grid gap-x-8 sm:grid-cols-2">
                  <Row
                    label="เลขบัตรประจำตัวประชาชน"
                    mono
                    emptyText="ยังไม่ระบุ"
                    value={
                      idCardNumber
                        ? (canViewFullNo && showFullIdNo ? idCardNumber : maskPassportNo(idCardNumber))
                        : ''
                    }
                  />
                  <Row label="วันเกิดตามบัตร" emptyText="ยังไม่ระบุ" value={docField(idCard, 'birthDate') ? formatDate(docField(idCard, 'birthDate')!) : ''} />
                  <Row label="ชื่อ–นามสกุลตามบัตร (ไทย)" emptyText="ยังไม่ระบุ" value={docName(idCard, ['title', 'firstName', 'lastName'])} />
                  <Row label="ชื่อ–นามสกุลตามบัตร (อังกฤษ)" emptyText="ยังไม่ระบุ" value={docName(idCard, ['titleEn', 'firstNameEn', 'lastNameEn'])} />
                  <Row label="วันออกบัตร" emptyText="ยังไม่ระบุ" value={docField(idCard, 'issuedDate') ? formatDate(docField(idCard, 'issuedDate')!) : ''} />
                  {/* บัตรตลอดชีพไม่มีวันหมดอายุ — ต่างจาก "ยังไม่กรอก" จึงต้องแยกข้อความ */}
                  <Row label="วันหมดอายุ" emptyText="ตลอดชีพ" value={docField(idCard, 'expiryDate') ? formatDate(docField(idCard, 'expiryDate')!) : ''} />
                  <Row label="ที่อยู่ตามบัตรประชาชน" emptyText="ยังไม่ระบุ" value={docAddress(idCard)} />
                </dl>
                {idCardNumber && canViewFullNo && (
                  <button
                    type="button"
                    onClick={() => setShowFullIdNo((v) => !v)}
                    className="mt-2 text-xs font-medium zego-text-info hover:underline"
                  >
                    {showFullIdNo ? 'ซ่อนเลขบัตร' : 'ดูเลขบัตรเต็ม'}
                  </button>
                )}
              </>
            ) : (
              <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-sm zego-text-tertiary">
                ยังไม่มีบัตรประชาชนในระบบ — เพิ่มได้ที่แท็บ “เอกสารประจำตัว” แล้วข้อมูลตามบัตรจะขึ้นที่นี่
              </p>
            )}
          </div>

          {(leader.generalNote || leader.cautions) && (
            <div className="mt-3 space-y-1.5 zego-divider-top pt-3">
              {leader.generalNote && <p className="text-xs zego-text-secondary">หมายเหตุทั่วไป: {leader.generalNote}</p>}
              {leader.cautions && <p className="zego-status-bar zego-status-bar--warning rounded-lg px-3 py-2 text-xs">ข้อควรระวัง: {leader.cautions}</p>}
            </div>
          )}
        </Card>
      </div>
      )}

      {/*
        ====== 2. ข้อมูลติดต่อ (40%) + 3. ข้อมูลการร่วมงาน (60%) — §5/§12 ======
        Grid ใช้ align-items: stretch (ค่าเริ่มต้น) · ตัว <Card> ต้อง h-full ด้วย
        ไม่งั้นการ์ดจะสูงตามเนื้อหาของตัวเองและขอบล่างไม่ตรงกัน
        แนวตั้ง (< lg) ไม่บังคับความสูง — แต่ละใบสูงตามข้อมูลจริง
      */}
      {showPersonal && (
      <div className="grid items-stretch gap-5 lg:grid-cols-5">
        {/* ---------- ข้อมูลติดต่อ ---------- */}
        <div className="lg:col-span-2">
          <Card className="lg:h-full">
            <CardHeader
              title="ข้อมูลติดต่อ"
              description="ช่องทางติดต่อ ที่อยู่ และผู้ติดต่อฉุกเฉิน"
              action={canEdit ? <Button size="sm" variant="secondary" icon="edit" onClick={() => setSection('contact')}>แก้ไขข้อมูลติดต่อ</Button> : undefined}
            />
            <dl>
              <Row label="เบอร์โทรศัพท์" value={contactOf('phone')} />
              <Row label="อีเมล" value={contactOf('email')} />
              <Row label="LINE ID" value={contactOf('line')} />
              {contacts.filter((c) => !['phone', 'email', 'line'].includes(c.type)).map((c) => (
                <Row key={c.id} label={CONTACT_TYPE[c.type]?.label ?? 'ช่องทางอื่น'} value={c.value} />
              ))}
            </dl>

            <div className="mt-3 zego-divider-top pt-3">
              <p className="mb-1.5 text-xs font-semibold zego-text-secondary">ที่อยู่ปัจจุบัน</p>
              <p className={cx('text-sm', address?.houseNo || address?.province ? 'zego-text-secondary' : 'zego-text-disabled')}>
                {address && (address.houseNo || address.province) ? formatAddress(address, countries) : 'ยังไม่ได้ระบุที่อยู่'}
              </p>
            </div>

            {/* Subsection ผู้ติดต่อฉุกเฉิน (§5) */}
            <div className="mt-3 zego-divider-top pt-3">
              <p className="mb-1.5 text-xs font-semibold zego-text-secondary">ผู้ติดต่อฉุกเฉิน</p>
              {emergencyContacts.length === 0 ? (
                <p className="text-sm zego-text-disabled">ยังไม่มีผู้ติดต่อฉุกเฉิน</p>
              ) : (
                <ul className="space-y-1.5">
                  {emergencyContacts.map((c) => (
                    <li key={c.id} className="rounded-lg border zego-border-color px-2.5 py-1.5 text-sm">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium zego-text">
                        {c.name}
                        {c.relation && <span className="text-xs font-normal zego-text-tertiary">({c.relation})</span>}
                        {c.isPrimary && <Pill tone="blue">ผู้ติดต่อหลัก</Pill>}
                      </p>
                      <p className="zego-text-secondary">{c.phone}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* ---------- 3. ข้อมูลการร่วมงาน (§5) ---------- */}
        <div className="lg:col-span-3">
          <Card className="lg:h-full">
            <CardHeader
              title="ข้อมูลการร่วมงาน"
              description="ประเภทบุคคล รูปแบบการร่วมงาน และรายละเอียดตามรูปแบบที่เลือก"
              action={canEdit ? <Button size="sm" variant="secondary" icon="edit" onClick={() => setSection('employment')}>แก้ไขข้อมูลการร่วมงาน</Button> : undefined}
            />
            {/*
              รายการเรียงต่อเนื่องจากบนลงล่าง — ไม่ใช้ justify-between/space-y แบบกระจายเต็มความสูง
              การ์ดสูงเท่ากันด้วย h-full ที่ตัว Card เท่านั้น เนื้อหาไม่ถูกดันให้ห่าง

              “สถานะโปรไฟล์” (คุมว่าใช้งานในระบบได้หรือไม่) กับ “สถานะพร้อมรับงาน” (ความพร้อม ณ ช่วงเวลา)
              เป็นคนละมิติ — ห้ามรวมเป็น Field เดียว
            */}
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {/* §6 รูปแบบการร่วมงาน = ประเภทหัวหน้าทัวร์ — Field เดียว Master เดียว */}
              <Row
                label="รูปแบบการร่วมงาน"
                value={LEADER_TYPE[leader.leaderType] ? <StatusBadge meta={LEADER_TYPE[leader.leaderType]} size="sm" dot={false} /> : ''}
              />
              {/* สถานะโปรไฟล์ = คุมว่ายังใช้งานในระบบได้หรือไม่ (ใช้งาน / ระงับ / สิ้นสุด)
                  คนละมิติกับ “ความพร้อมรับงาน” ในการ์ดที่ 1 — ห้ามรวมเป็น Field เดียว */}
              <Row
                label="สถานะโปรไฟล์"
                value={<StatusBadge meta={LEADER_USAGE_STATUS[leader.usageStatus]} size="sm" />}
              />
              <Row label="ประเภทบุคคล" value={leader.personType ? PERSON_TYPE[leader.personType] : ''} emptyText="ยังไม่ระบุ" />
              <Row label="หน่วยงาน / ฝ่ายที่ดูแล" value={leader.team} emptyText="ยังไม่ระบุ" />
              <Row label="หมายเหตุภายใน" value={canEdit ? leader.internalNote : ''} emptyText="ยังไม่ระบุ" />

              {leader.leaderType === 'freelance' && (
                <>
                  <Row label="รูปแบบค่าจ้าง" value={leader.payType ? PAY_TYPE[leader.payType] : ''} />
                  <Row
                    label="อัตราค่าจ้างเบื้องต้น"
                    value={
                      leader.payRate === undefined || leader.payRate === null
                        ? ''
                        : `${leader.payRate.toLocaleString('th-TH')} บาท${leader.payUnit ? ` ${PAY_UNIT[leader.payUnit]}` : ''}`
                    }
                  />
                </>
              )}

              {leader.leaderType === 'agent' && (
                <>
                  <Row label="บริษัท / หน่วยงานที่สังกัด" value={leader.agencyName} />
                  <Row label="ผู้ติดต่อของเอเจนซี่" value={leader.agencyContactName} />
                  <Row label="เบอร์โทรผู้ติดต่อ" value={leader.agencyContactPhone} />
                  <Row label="รหัสอ้างอิงเอเจนซี่" value={leader.agencyRefCode} mono />
                </>
              )}
            </dl>

            {leader.leaderType === 'general' && (
              <p className="mt-3 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
                ยังไม่ได้กำหนดรูปแบบการร่วมงานเฉพาะ — ไม่มีรายละเอียดเพิ่มเติม
              </p>
            )}
            {leader.typeNote && (
              <p className="mt-3 zego-divider-top pt-3 text-xs zego-text-secondary">หมายเหตุ: {leader.typeNote}</p>
            )}
          </Card>
        </div>
      </div>
      )}

      {/* ============ 4. จัดการหนังสือเดินทางทุกเล่ม (คงฟังก์ชันเดิมครบ §1/AC3) ============ */}
      {showDocuments && (
      <div ref={managerRef}>
        <Card padded={false}>
          <div className="zego-divider-bottom px-5 py-3">
            <p className="text-sm font-semibold zego-text">จัดการหนังสือเดินทางทุกเล่ม</p>
            <p className="text-xs zego-text-tertiary">{passportCards.length} เล่ม · เพิ่มจากรูป/OCR · ตั้งเล่มหลัก · ดูไฟล์และประวัติรายเล่ม</p>
          </div>
          <div className="px-5 py-4">
            <LeaderPassportTab leader={leader} />
          </div>
        </Card>
      </div>
      )}

      {/* §1 Modal แก้ไขข้อมูลทั่วไป (แยกจาก Passport/การร่วมงาน §7/§11) */}
      <GeneralInfoEditModal
        open={generalModalOpen}
        leader={leader}
        onClose={() => setGeneralModalOpen(false)}
        onGoStatus={onGoStatus}
      />

      {/* §1/§8 Modal เฉพาะหมวด — ไม่มี Tab · บันทึกเฉพาะหมวดที่เปิด */}
      <LeaderSectionEditModal
        open={section !== null}
        leader={leader}
        section={section ?? 'contact'}
        onClose={() => setSection(null)}
        onSaved={() => setRev((v) => v + 1)}
      />

      <PassportEditModal
        card={editBook}
        open={!!editBook}
        onClose={() => setEditBook(null)}
        onSaved={() => { setEditBook(null); setRev((v) => v + 1); }}
      />
    </div>
  );
}
