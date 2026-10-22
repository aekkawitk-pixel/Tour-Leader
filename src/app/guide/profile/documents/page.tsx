'use client';

/**
 * เอกสารประจำตัว — /guide/profile/documents — หนังสือเดินทาง · วีซ่า · เอกสารอื่น ๆ
 *
 * หน้ารายการแบบย่อ (ธีม v3 แบบเดียวกับหน้าย่อยอื่นของโปรไฟล์) — ดูภาพรวมได้ในจอเดียว
 *   • บนสุด: สรุปสถานะเอกสารทั้งหมด "รวมหนังสือเดินทาง" (กล่องทอง = มีฉบับต้องตรวจ · กล่องเขียว = ใช้ได้ทั้งหมด)
 *     ตัวเลขมาจาก useGuideDocuments ชุดเดียวกับกระดิ่ง หน้าหลัก และป้ายในเมนูโปรไฟล์ จึงตรงกันทุกจุด
 *   • 3 กลุ่ม: 1 ฉบับ = 1 แถว (ไอคอนสีตามสถานะ · ชื่อ · เลขที่ปิดบัง · วันหมดอายุ/เหลือกี่วัน · ป้ายสถานะ)
 *     กลุ่มที่ยังไม่มีเอกสาร = บรรทัดเดียว "ยังไม่มี…" + ปุ่มเพิ่ม (ไม่โชว์แบบฟอร์มเปล่า)
 *   • แตะแถว/ปุ่มเพิ่ม → แผ่นเต็มกรอบมือถือของกลุ่มนั้น ซึ่งใช้ component เดียวกับฝั่งผู้จัด
 *     (LeaderPassportTab · LeaderDocumentsCard) ในโหมด leaderView — หน้าเล่ม/แก้ไข/เพิ่ม/ดูไฟล์อยู่ในแผ่นนั้น
 *     ตัดข้อความสำหรับเจ้าหน้าที่ (กติกาเล่มหลัก · ที่มาของข้อมูล · Audit Log) · สิทธิ์/การบันทึกเหมือนเดิมทุกอย่าง
 *
 * สิทธิ์: role 'leader' มีสิทธิ์ passport.* เท่ากับ coordinator ยกเว้น "ลบถาวร" (ดู src/lib/permissions.ts)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { useGuideDocuments, PASSPORT_NOT_IN_USE } from '@/lib/useGuideDocuments';
import type { DocumentExpiryAlert } from '@/lib/logic/documentExpiryAlerts';
import { PASSPORT_CARD_STATUS_META } from '@/lib/logic/passportCard';
import { maskPassport } from '@/lib/logic/tourLeaderMaster';
import { formatDate } from '@/lib/format';
import { getDocument } from '@/services/documentStore';
import { LeaderPassportTab } from '@/components/leaders/LeaderPassportTab';
import {
  IDENTITY_DOC_KINDS,
  ID_CARD_KINDS,
  LeaderDocumentsCard,
  OTHER_DOC_KINDS,
  TOUR_CARD_KINDS,
} from '@/components/leaders/documents/LeaderDocumentsCard';
import { DocumentFormModal } from '@/components/leaders/documents/DocumentFormModal';
import { Drawer } from '@/components/ui/Modal';
import { Button, Card, EmptyState, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { DocumentKind } from '@/types';
import { ProfileBackHeader } from '../ProfileBackHeader';

type Group = 'passport' | 'visa' | 'other';

const GROUPS: { key: Group; title: string; empty: string }[] = [
  { key: 'passport', title: 'หนังสือเดินทาง', empty: 'ยังไม่มีหนังสือเดินทาง' },
  { key: 'visa', title: 'วีซ่า', empty: 'ยังไม่มีวีซ่า' },
  { key: 'other', title: 'เอกสารอื่น ๆ', empty: 'ยังไม่มีเอกสารอื่น ๆ' },
];

/** แผ่นเอกสารอื่น ๆ แสดงทุกชนิดที่ตกกลุ่มนี้ (รวมบัตรประชาชน/บัตรหัวหน้าทัวร์ที่ผู้จัดบันทึกไว้) · ปุ่มเพิ่มเป็นชนิด "อื่น ๆ" ปุ่มเดียว */
const OTHER_SHEET_KINDS = [...ID_CARD_KINDS, ...TOUR_CARD_KINDS, ...OTHER_DOC_KINDS];

const KIND_ICON: Partial<Record<DocumentKind, IconName>> = {
  passport: 'passport',
  visa: 'passport',
  national_id: 'idCard',
  license: 'shield',
};

type Tone = 'red' | 'gold' | 'green' | 'neutral';

interface DocRow {
  id: string;
  icon: IconName;
  title: string;
  sub: string;
  tone: Tone;
  chip: string;
  label: string;
  /** แตะเปิดแผ่นได้ — เอกสารรูปแบนเดิมที่ไม่มีในที่เก็บเอกสาร (แก้ไม่ได้) แสดงเฉย ๆ */
  tappable: boolean;
  /** ลำดับความเร่ง — ต้องตรวจขึ้นก่อน (ติดลบ = หมดอายุไปแล้ว) */
  urgency: number;
}

/** สถานะต่อเอกสาร → สีไอคอน/ป้าย (แดง หมดอายุ · ทอง ใกล้หมดอายุ · เขียว ใช้ได้ · เทา ไม่ได้ใช้แล้ว/ไม่มีวันหมดอายุ) */
function docState(alert: DocumentExpiryAlert | undefined, expiresAt: string | null, notInUse?: string) {
  if (notInUse) return { tone: 'neutral', chip: 'zego-chip--neutral', label: notInUse } as const;
  if (alert?.severity === 'expired') return { tone: 'red', chip: 'zego-chip--red', label: 'หมดอายุแล้ว' } as const;
  if (alert?.severity === 'soon') return { tone: 'gold', chip: 'zego-chip--gold', label: 'ใกล้หมดอายุ' } as const;
  if (!expiresAt) return { tone: 'green', chip: 'zego-chip--neutral', label: 'ไม่มีวันหมดอายุ' } as const;
  return { tone: 'green', chip: 'zego-chip--green', label: 'ใช้ได้' } as const;
}

/** บรรทัดรอง: เลขที่ (ปิดบัง) · หมดอายุ dd/mm/yy · อีกกี่วัน (เฉพาะใกล้หมดอายุ) */
function subLine(number: string, expiresAt: string | null, alert: DocumentExpiryAlert | undefined) {
  const expiry = expiresAt ? `หมดอายุ ${formatDate(expiresAt)}` : 'ไม่ระบุวันหมดอายุ';
  const left = alert?.severity === 'soon' ? `อีก ${alert.daysLeft} วัน` : null;
  return [number && number !== '-' ? number : null, expiry, left].filter(Boolean).join(' · ');
}

export default function GuideProfileDocumentsPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  /** แผ่นที่เปิดอยู่ — add = เปิดมาพร้อมฟอร์มเพิ่ม */
  const [sheet, setSheet] = useState<{ group: Group; add: boolean } | null>(null);
  /** อ่านรายการใหม่ทุกครั้งที่ปิดแผ่น (แก้/เพิ่ม/ลบในแผ่นบันทึกลงที่เก็บเอกสารโดยตรง) */
  const [rev, setRev] = useState(0);
  const { passports, others, alerts } = useGuideDocuments(leader, rev);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="เอกสารประจำตัว" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const alertById = new Map(alerts.map((a) => [a.docId, a]));
  const urgencyOf = (id: string) => alertById.get(id)?.daysLeft ?? Number.POSITIVE_INFINITY;

  const rows: Record<Group, DocRow[]> = { passport: [], visa: [], other: [] };

  for (const card of passports) {
    const alert = alertById.get(card.id);
    const expiresAt = card.fields.expiryDate || null;
    const notInUse = PASSPORT_NOT_IN_USE.has(card.status) ? PASSPORT_CARD_STATUS_META[card.status].label : undefined;
    const st = docState(alert, expiresAt, notInUse);
    rows.passport.push({
      id: card.id,
      icon: 'passport',
      // มีหลายเล่ม → บอกว่าเล่มไหนเป็นเล่มหลัก (เล่มเดียวไม่ต้องบอก)
      title: passports.length > 1 && card.isPrimary ? 'หนังสือเดินทาง · เล่มหลัก' : 'หนังสือเดินทาง',
      sub: subLine(maskPassport(card.fields.passportNo || null), expiresAt, alert),
      ...st,
      tappable: true,
      urgency: urgencyOf(card.id),
    });
  }

  for (const d of others) {
    const alert = alertById.get(d.id);
    rows[d.kind === 'visa' ? 'visa' : 'other'].push({
      id: d.id,
      icon: KIND_ICON[d.kind] ?? 'file',
      title: d.name,
      sub: subLine(d.number, d.expiresAt, alert),
      ...docState(alert, d.expiresAt),
      tappable: getDocument(d.id) !== null,
      urgency: urgencyOf(d.id),
    });
  }

  // ในแต่ละกลุ่ม: ฉบับที่ต้องตรวจขึ้นก่อน (หมดอายุนานสุด → ใกล้หมดอายุสุด) ที่เหลือคงลำดับเดิม (เล่มหลักก่อน)
  for (const g of GROUPS) rows[g.key].sort((a, b) => a.urgency - b.urgency);

  const total = rows.passport.length + rows.visa.length + rows.other.length;
  const expiredCount = alerts.filter((a) => a.severity === 'expired').length;
  const soonCount = alerts.length - expiredCount;

  const open = (group: Group, add = false) => setSheet({ group, add });
  const closeSheet = () => { setSheet(null); setRev((v) => v + 1); };
  const sheetTitle = sheet ? GROUPS.find((g) => g.key === sheet.group)!.title : '';

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="เอกสารประจำตัว" />

      {/* สรุปบนสุด — รวมหนังสือเดินทางแล้ว */}
      {alerts.length > 0 ? (
        <div className="zego-guide-warnbox">
          <span className="zego-guide-warnbox__icon"><Icon name="warning" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="zego-guide-warnbox__title">ต้องตรวจ {alerts.length} รายการ</p>
            <p className="zego-guide-warnbox__sub">
              {[expiredCount > 0 && `หมดอายุแล้ว ${expiredCount}`, soonCount > 0 && `ใกล้หมดอายุ ${soonCount}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      ) : total > 0 ? (
        <div className="zego-guide-warnbox zego-guide-warnbox--ok">
          <span className="zego-guide-warnbox__icon"><Icon name="checkCircle" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="zego-guide-warnbox__title">เอกสารพร้อมใช้ ({total} ฉบับ)</p>
            <p className="zego-guide-warnbox__sub">ไม่มีฉบับที่หมดอายุหรือใกล้หมดอายุ</p>
          </div>
        </div>
      ) : null}

      {GROUPS.map((g) => {
        const list = rows[g.key];
        return (
          <section key={g.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="zego-guide-label">
                {g.title}
                {list.length > 0 && <span className="font-normal zego-text-tertiary">{list.length}</span>}
              </h2>
              {list.length > 0 && (
                <button type="button" onClick={() => open(g.key, true)} className="zego-guide-link ml-auto mt-1.5 flex shrink-0 items-center gap-0.5 px-1">
                  <Icon name="plus" className="h-3.5 w-3.5" />
                  เพิ่ม
                </button>
              )}
            </div>

            {list.length === 0 ? (
              <div className="zego-guide-list zego-guide-row">
                <span className="flex-1 text-sm zego-text-tertiary">{g.empty}</span>
                <Button size="sm" variant="secondary" icon="plus" onClick={() => open(g.key, true)}>เพิ่ม</Button>
              </div>
            ) : (
              <ul className="zego-guide-list">
                {list.map((r) => {
                  const body = (
                    <>
                      <span className={cx('zego-guide-tile', `zego-guide-tile--${r.tone}`)}>
                        <Icon name={r.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="zego-guide-row__title line-clamp-2">{r.title}</span>
                        <span className="zego-guide-row__sub">{r.sub}</span>
                      </span>
                      <span className={cx('zego-chip shrink-0', r.chip)}>{r.label}</span>
                      {r.tappable && <Icon name="chevronRight" className="zego-guide-chev h-4 w-4" />}
                    </>
                  );
                  return (
                    <li key={r.id}>
                      {r.tappable ? (
                        <button type="button" onClick={() => open(g.key)} className="zego-guide-row zego-guide-row--tall" aria-label={`${r.title} — ${r.label} · แตะเพื่อดูหรือแก้ไข`}>
                          {body}
                        </button>
                      ) : (
                        <div className="zego-guide-row zego-guide-row--tall">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {/*
        "+ เพิ่ม" เอกสารอื่น ๆ = หน้าต่างฟอร์มแนบไฟล์โดยตรง (ไม่ต้องผ่านแผ่นรายการ)
        ถ้าเปิดพร้อมแผ่น หน้าต่างฟอร์มจะถูกแผ่นที่เปิดทีหลังบังไว้
      */}
      {sheet?.group === 'other' && sheet.add && (
        <DocumentFormModal
          key={`add-other-${rev}`}
          open
          kind="other"
          tourLeaderId={leader.id}
          editing={null}
          onClose={closeSheet}
          onSaved={() => setRev((v) => v + 1)}
        />
      )}

      {/* แผ่นเต็มกรอบมือถือของกลุ่มที่แตะ — key ใหม่ทุกครั้งที่เปิด ให้ฟอร์มเพิ่ม/สถานะภายในเริ่มใหม่ */}
      {sheet && !(sheet.group === 'other' && sheet.add) && (
        <Drawer key={`${sheet.group}-${sheet.add}-${rev}`} open onClose={closeSheet} title={sheetTitle}>
          {sheet.group === 'passport' && <LeaderPassportTab leader={leader} leaderView startAdding={sheet.add} />}
          {sheet.group === 'visa' && (
            <LeaderDocumentsCard
              leader={leader}
              kinds={IDENTITY_DOC_KINDS}
              title="วีซ่า"
              description="วีซ่าของประเทศปลายทาง"
              leaderView
              startAdding={sheet.add}
            />
          )}
          {sheet.group === 'other' && (
            <LeaderDocumentsCard
              leader={leader}
              kinds={OTHER_SHEET_KINDS}
              addKind="other"
              title="เอกสารอื่น ๆ"
              description="ประวัติอาชญากรรม ใบเซอร์ และเอกสารอื่น — ทุกฉบับต้องแนบไฟล์ PDF หรือรูปภาพ"
              leaderView
            />
          )}
        </Drawer>
      )}
    </div>
  );
}
