'use client';

/**
 * แท็บ "ข้อมูลหนังสือเดินทาง" — หนังสือเดินทาง 1 เล่ม = 1 Card (§2)
 *
 * ข้อมูลของเล่มเดียวกัน (ข้อมูลเล่ม · ชื่อตาม Passport · ข้อมูลบุคคล · อายุเอกสาร)
 * อยู่ใน Card เดียวกันเสมอ — ห้ามนำข้อมูลคนละเล่มมาปนกัน
 * เล่มหลักมีได้เล่มเดียว (§7) · Mask เลขเป็นค่าเริ่มต้น เปิดดูเต็มเฉพาะผู้มีสิทธิ์ + บันทึก Audit (§9)
 */

import { useCallback, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { formatDateTime } from '@/lib/format';
import { Button, Card, CardHeader, Callout, cx, EmptyState } from '@/components/ui/Primitives';
import { ConfirmDialog, Drawer } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { can } from '@/lib/permissions';
import { getTourLeaderById, getIdentityDocument } from '@/services/tourLeaderMaster';
import { maskPassport, maskPersonalId, passportChecks } from '@/lib/logic/tourLeaderMaster';
import { logPassportReveal, getPassportAudit, PASSPORT_AUDIT_ACTION } from '@/lib/logic/passportAudit';
import { buildPassportCards, bookToCard, masterIdentityToCard, type PassportCardModel } from '@/lib/logic/passportCardModel';
import { evaluateSetPrimary } from '@/lib/logic/passportValidation';
import { cardActionEligibility } from '@/lib/logic/passportCard';
import {
  getPassportBooks, getPrimaryBook, setPrimaryBook, setBookLifecycle, deletePassportBook, isPassportReferenced, adoptMasterBook,
} from '@/services/passportBookStore';
import { openPassportImageUrl, releaseImageUrl } from '@/services/passportImageStore';
import { hideMasterPassport, isMasterPassportHidden } from '@/services/masterPassportHidden';
import { saveErrorMessage } from '@/services/browserStorage';
import { PASSPORT_FIELD_LABEL, type PassportBookHistoryEntry } from '@/data/leaders/passportBookTypes';
import { PassportCard, type PassportCardAction } from '@/components/leaders/passport/PassportCard';
import { PassportAddModal } from '@/components/leaders/passport/PassportAddModal';
import { PassportNewCard } from '@/components/leaders/passport/PassportNewCard';
import { PassportEditModal } from '@/components/leaders/passport/PassportEditModal';
import type { TourLeader } from '@/types';

const HISTORY_LABEL: Record<PassportBookHistoryEntry['action'], string> = {
  OCR_IMPORT: 'นำเข้าข้อมูลจากรูปด้วย OCR',
  MANUAL_ENTRY: 'กรอกข้อมูลด้วยตนเอง',
  USER_EDIT: 'ผู้ใช้แก้ไขข้อมูล',
  CONFIRM: 'ยืนยันและบันทึก',
  SAVE_DRAFT: 'บันทึกเป็นฉบับร่าง',
  SET_PRIMARY: 'ตั้งเป็นเล่มหลัก',
  UNSET_PRIMARY: 'เปลี่ยนเป็นเล่มรอง',
  RE_OCR: 'อ่านข้อมูลด้วย OCR ใหม่',
  LIFECYCLE_CHANGE: 'เปลี่ยนสถานะการใช้งาน',
  REPLACE_IMAGE: 'อัปโหลดรูปใหม่',
};

export function LeaderPassportTab({ leader }: { leader: TourLeader }) {
  const { currentUser, today, pushToast } = useDemo();
  // §11 สิทธิ์แยกละเอียด
  const canViewIdentity = can(currentUser.role, 'passport.view');
  const canViewFull = can(currentUser.role, 'passport.viewFull');
  const canEdit = can(currentUser.role, 'passport.edit');
  const canChangePrimary = can(currentUser.role, 'passport.changePrimary');
  const canDeactivate = can(currentUser.role, 'passport.deactivate');
  const canDelete = can(currentUser.role, 'passport.delete');
  const canManage = canEdit || canChangePrimary || canDeactivate || canDelete;
  const nowISO = `${today}T00:00`;

  const profile = getTourLeaderById(leader.id);
  const identity = getIdentityDocument(leader.id, canViewIdentity);

  const [rev, setRev] = useState(0);
  const reload = useCallback(() => setRev((v) => v + 1), []);

  /** การ์ดเปล่าสำหรับกรอกเล่มใหม่ในหน้าเดียวกัน */
  const [addingInline, setAddingInline] = useState(false);
  /** หน้าต่างอัปโหลดรูป + OCR — เส้นทางเสริมที่มีขั้นตอนหมุน/ครอปรูป */
  const [addOpen, setAddOpen] = useState(false);
  /** §7 OCR กำลังทำงานแต่ผู้ใช้ยังไม่ยืนยัน → แสดงสถานะชั่วคราว ไม่สร้าง Card จริง */
  const [pendingNew, setPendingNew] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editCard, setEditCard] = useState<PassportCardModel | null>(null);
  const [historyCard, setHistoryCard] = useState<PassportCardModel | null>(null);
  const [confirmPrimary, setConfirmPrimary] = useState<{ card: PassportCardModel; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PassportCardModel | null>(null);
  const [imageView, setImageView] = useState<{ card: PassportCardModel; url: string } | null>(null);

  /* ---- รายการ Card: เล่มในระบบ + เล่มจากไฟล์ต้นทาง (1 เล่ม = 1 Card) ---- */
  const cards = useMemo(() => {
    void rev;
    const books = canViewIdentity ? getPassportBooks(leader.id) : [];
    const masterHidden = isMasterPassportHidden(leader.id);
    const master = canViewIdentity && !masterHidden ? masterIdentityToCard(profile, identity, today) : null;
    return buildPassportCards(books, master, today);
  }, [rev, leader.id, profile, identity, today, canViewIdentity]);

  const checks = profile ? passportChecks(profile, identity ?? undefined, today) : [];

  // §3 เตือนชื่อในระบบ (อังกฤษ) ไม่ตรงกับชื่อในหนังสือเดินทาง (ไม่แก้อัตโนมัติ)
  const sysEnName = `${leader.firstNameEn} ${leader.lastNameEn}`.trim().toUpperCase();
  const primaryCard = cards.find((c) => c.isPrimary) ?? cards[0] ?? null;
  const bookEnName = primaryCard
    ? `${primaryCard.fields.firstName} ${primaryCard.fields.lastName}`.trim().toUpperCase()
    : '';
  const nameMismatch = !!sysEnName && !!bookEnName && sysEnName !== bookEnName;

  const toggleReveal = (card: PassportCardModel) => {
    if (!canViewFull) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) next.delete(card.id);
      else {
        next.add(card.id);
        logPassportReveal(leader.id, 'reveal_passport', currentUser.name, nowISO);
        pushToast('info', 'เปิดดูเลขหนังสือเดินทางเต็ม — บันทึกลง Audit Log แล้ว');
      }
      return next;
    });
  };

  /* --------------------------- เมนูจัดการ (§6) --------------------------- */
  const handleAction = async (action: PassportCardAction, card: PassportCardModel) => {
    /*
     * เล่มจากไฟล์นำเข้าต้นทางแก้ที่ต้นทางไม่ได้ — กดแก้ไขจึงคัดลอกมาเป็นเล่มของระบบก่อน
     * แล้วเปิดฟอร์มแก้ที่เล่มใหม่ (ผู้ใช้เห็นเป็นการกดแก้ไขครั้งเดียว ไม่มีขั้นตอนเพิ่ม)
     */
    if (!card.bookId && action === 'edit') {
      try {
        const book = adoptMasterBook({ tourLeaderId: leader.id, fields: card.fields, by: currentUser.name, at: nowISO });
        reload();
        setEditCard(bookToCard(book, today));
      } catch (err) {
        pushToast('error', 'เปิดแก้ไขไม่สำเร็จ', saveErrorMessage(err));
      }
      return;
    }
    if (!card.bookId && action === 'delete') { setConfirmDelete(card); return; }
    if (!card.bookId) return;

    switch (action) {
      // §5 อัปโหลดรูปใหม่ / อ่าน OCR ใหม่ ทำภายในหน้าแก้ไข (เทียบก่อนเขียนทับ)
      case 'edit':
      case 'replaceImage':
      case 'reOcr':
        setEditCard(card);
        break;

      case 'history':
        setHistoryCard(card);
        break;

      case 'viewImage': {
        if (!card.imageId) return;
        const url = await openPassportImageUrl(card.imageId, {
          canView: canViewFull, by: currentUser.name, at: nowISO, tourLeaderId: leader.id,
        });
        if (!url) { pushToast('error', 'ไม่มีสิทธิ์เปิดดูรูป หรือไม่พบไฟล์ในเครื่องนี้'); return; }
        setImageView({ card, url });
        pushToast('info', 'เปิดดูรูปหนังสือเดินทาง — บันทึกลง Audit Log แล้ว');
        break;
      }

      case 'setPrimary': {
        const current = getPrimaryBook(leader.id);
        const decision = evaluateSetPrimary(
          card.fields.expiryDate, today,
          current && current.bookId !== card.bookId ? { label: current.fields.passportNo || current.bookId } : null,
        );
        if (!decision.allowed) { pushToast('error', decision.reason); return; }
        if (decision.needsConfirm) {
          setConfirmPrimary({
            card,
            message: 'Passport เล่มนี้จะถูกตั้งเป็นเล่มหลัก และเล่มหลักเดิมจะเปลี่ยนเป็นเล่มรอง ต้องการดำเนินการต่อหรือไม่',
          });
          return;
        }
        if (decision.warning) pushToast('info', decision.warning);
        // แจ้งสำเร็จหลังบันทึกจริงเท่านั้น — เขียนไม่สำเร็จจะขึ้นสาเหตุจริงแทน
        try {
          setPrimaryBook(card.bookId, currentUser.name, nowISO);
          reload();
          pushToast('success', 'ตั้งเป็นหนังสือเดินทางเล่มหลักแล้ว');
        } catch (err) {
          pushToast('error', 'ตั้งเล่มหลักไม่สำเร็จ', saveErrorMessage(err));
        }
        break;
      }

      case 'deactivate': {
        const next = card.lifecycle === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        try {
          setBookLifecycle(card.bookId, next, { by: currentUser.name, at: nowISO });
          reload();
          pushToast('success', next === 'INACTIVE' ? 'ปิดใช้งานหนังสือเดินทางแล้ว' : 'กลับมาใช้งานหนังสือเดินทางแล้ว');
        } catch (err) {
          pushToast('error', 'เปลี่ยนสถานะหนังสือเดินทางไม่สำเร็จ', saveErrorMessage(err));
        }
        break;
      }

      case 'delete':
        setConfirmDelete(card);
        break;
    }
  };

  /* ------------------------------- ส่วนหัว (§1) ------------------------------- */
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold zego-text">หนังสือเดินทาง</h2>
        <p className="mt-0.5 text-sm zego-text-tertiary">
          {cards.length > 0 ? `${cards.length} เล่ม` : 'ยังไม่มีหนังสือเดินทางในระบบ'}
          {cards.length > 0 && ' · เล่มหลักได้เล่มเดียว · เลขปิดบังเป็นค่าเริ่มต้น'}
        </p>
      </div>
      {canViewIdentity && (
        <Button variant="primary" icon="plus" onClick={() => setAddingInline(true)} disabled={addingInline}>
          เพิ่มหนังสือเดินทาง
        </Button>
      )}
    </div>
  );

  if (!canViewIdentity) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <EmptyState
            icon="warning"
            title="ไม่มีสิทธิ์ดูข้อมูลหนังสือเดินทาง"
            description="บทบาทของคุณเห็นได้เฉพาะสถานะเอกสาร (ใช้งานได้/ใกล้หมดอายุ/หมดอายุ) เท่านั้น"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      {nameMismatch && (
        <Callout tone="amber" title="ชื่อในระบบไม่ตรงกับชื่อในหนังสือเดินทาง">
          ระบบ: {sysEnName} · Passport: {bookEnName} — โปรดตรวจสอบ (ระบบไม่แก้ให้อัตโนมัติ)
        </Callout>
      )}
      {checks.length > 0 && (
        <Callout tone="amber" title={`ข้อมูลควรตรวจสอบ ${checks.length} รายการ`}>
          <ul className="list-inside list-disc space-y-0.5">{checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Callout>
      )}

      {/* §7 สถานะชั่วคราวระหว่างตรวจสอบ — ยังไม่สร้าง Card จริง */}
      {pendingNew && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed zego-today-border zego-today-tint px-4 py-3">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 zego-today-border border-t-transparent" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium zego-text-info">กำลังตรวจสอบข้อมูล Passport ใหม่</p>
            <p className="text-xs zego-text-info">ระบบจะสร้าง Card ใหม่หลังจากคุณกด “ยืนยันและบันทึก” เท่านั้น</p>
          </div>
        </div>
      )}

      {/* เพิ่มเล่มใหม่ — การ์ดเปล่าอยู่บนสุด กรอกได้เลยโดยไม่ต้องเปิดหน้าต่างซ้อน */}
      {addingInline && (
        <PassportNewCard
          key={`new-${rev}`}
          leader={leader}
          onCancel={() => setAddingInline(false)}
          onSaved={() => { setAddingInline(false); reload(); }}
          onUseOcr={() => { setAddingInline(false); setAddOpen(true); }}
        />
      )}

      {/* -------------------- 1 เล่ม = 1 Card (§2/§5) -------------------- */}
      {cards.length === 0 && !addingInline ? (
        <Card>
          <EmptyState
            icon="file"
            title="ยังไม่มีหนังสือเดินทาง"
            description="กดปุ่ม “เพิ่มหนังสือเดินทาง” เพื่อกรอกข้อมูลหน้าเล่มได้ทันที หรือเลือกอัปโหลดรูปให้ระบบอ่านให้"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => {
            // §2 เงื่อนไข Action ของเล่มนี้ — นับเฉพาะเล่มในระบบ (เล่ม Master ไม่นับ)
            const otherBookCount = cards.filter((c) => c.source === 'BOOK' && c.id !== card.id).length;
            const eligibility = cardActionEligibility(
              { isPrimary: card.isPrimary, status: card.status, lifecycle: card.lifecycle },
              otherBookCount,
              card.bookId ? isPassportReferenced(card.bookId) : false,
            );
            const editingThis = editCard?.id === card.id;
            return (
              <PassportCard
                key={card.id}
                card={card}
                todayISO={today}
                canViewFull={canViewFull}
                canManage={canManage}
                canEdit={canEdit}
                eligibility={eligibility}
                // §5 เล่มหลักเปิดรายละเอียดเป็นค่าเริ่มต้น (ไม่มีเล่มหลัก → เปิดเล่มแรก)
                defaultExpanded={card.id === primaryCard?.id}
                editing={editingThis}
                revealed={revealed.has(card.id)}
                onToggleReveal={() => toggleReveal(card)}
                onAction={(a, c) => void handleAction(a, c)}
              >
                {/* แก้ไขในการ์ดใบเดิม — หน้าเล่มกลายเป็นช่องกรอกตรงตำแหน่งเดิม ไม่เปิดหน้าต่างซ้อน */}
                {editingThis && (
                  <PassportEditModal
                    key={`edit-${card.id}-${rev}`}
                    card={editCard}
                    open
                    variant="inline"
                    onClose={() => setEditCard(null)}
                    onSaved={() => { setEditCard(null); reload(); }}
                    /* ลบได้จากในฟอร์มเลย — ใช้เส้นทางยืนยันเดียวกับเมนู ⋮ ไม่มีทางลัดที่ข้ามการยืนยัน */
                    onDelete={() => void handleAction('delete', card)}
                    deleteDisabledReason={eligibility.delete.enabled ? null : eligibility.delete.reason}
                  />
                )}
              </PassportCard>
            );
          })}
        </div>
      )}

      {/* เลขบัตรประชาชน — ไม่ใช่ข้อมูลของเล่มใดเล่มหนึ่ง จึงแยกออกจาก Passport Card (§9) */}
      {identity?.personalID && (
        <Card>
          <CardHeader title="เลขบัตรประชาชน" description="ข้อมูลส่วนบุคคล — ไม่ผูกกับหนังสือเดินทางเล่มใดเล่มหนึ่ง" />
          <p className="font-mono text-sm zego-text-secondary">
            {canViewFull && revealed.has('personalId') ? identity.personalID : maskPersonalId(identity.personalID)}
          </p>
          {canViewFull && (
            <Button
              size="sm"
              variant="secondary"
              icon="eye"
              className="mt-2"
              onClick={() => {
                setRevealed((prev) => {
                  const next = new Set(prev);
                  if (next.has('personalId')) next.delete('personalId');
                  else {
                    next.add('personalId');
                    logPassportReveal(leader.id, 'reveal_personal_id', currentUser.name, nowISO);
                  }
                  return next;
                });
              }}
            >
              {revealed.has('personalId') ? 'ซ่อน' : 'แสดงเลขเต็ม'}
            </Button>
          )}
        </Card>
      )}

      {/* Audit (§9) */}
      {canViewFull && getPassportAudit(leader.id).length > 0 && (
        <Card>
          <CardHeader title="ประวัติการเข้าถึงข้อมูลสำคัญ (Audit Log)" description="บันทึกผู้อัปโหลด ผู้เปิดดู และเวลาของทุกครั้ง" />
          <ul className="space-y-1 text-xs zego-text-secondary">
            {getPassportAudit(leader.id).map((e, i) => (
              <li key={i}>{formatDateTime(e.at)} · {PASSPORT_AUDIT_ACTION[e.action]} · โดย {e.by}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------- Dialogs ------------------------------- */}
      <PassportAddModal
        key={addOpen ? `add-${rev}` : 'add-closed'}
        open={addOpen}
        leader={leader}
        onClose={() => { setAddOpen(false); setPendingNew(false); }}
        onSaved={() => { setPendingNew(false); reload(); }}
        onPendingChange={setPendingNew}
      />

      <ConfirmDialog
        open={!!confirmPrimary}
        onClose={() => setConfirmPrimary(null)}
        onConfirm={() => {
          if (!confirmPrimary?.card.bookId) return;
          try {
            setPrimaryBook(confirmPrimary.card.bookId, currentUser.name, nowISO);
            setConfirmPrimary(null);
            reload();
            pushToast('success', 'เปลี่ยนเล่มหลักเรียบร้อย — เล่มเดิมเปลี่ยนเป็นเล่มรองแล้ว');
          } catch (err) {
            pushToast('error', 'เปลี่ยนเล่มหลักไม่สำเร็จ', saveErrorMessage(err));
          }
        }}
        title="ตั้งเป็นหนังสือเดินทางเล่มหลัก"
        message={confirmPrimary?.message ?? ''}
        confirmLabel="ดำเนินการต่อ"
        tone="primary"
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          try {
            // เล่มนำเข้าไม่มีเล่มในระบบให้ลบ — ทำได้แค่ไม่แสดงอีก (ไฟล์ต้นทางไม่ถูกแตะ)
            if (confirmDelete.bookId) deletePassportBook(confirmDelete.bookId);
            else hideMasterPassport(leader.id);
            setConfirmDelete(null);
            setEditCard(null); // เล่มถูกลบแล้ว ฟอร์มแก้ไขของเล่มนี้ต้องไม่ค้างอยู่
            reload();
            pushToast('success', 'ลบหนังสือเดินทางเรียบร้อย');
          } catch (err) {
            pushToast('error', 'ลบหนังสือเดินทางไม่สำเร็จ', saveErrorMessage(err));
          }
        }}
        title="ลบหนังสือเดินทาง"
        message={
          confirmDelete && !confirmDelete.bookId
            ? `เล่ม ${maskPassport(confirmDelete.fields.passportNo)} มาจากไฟล์นำเข้าต้นทาง — ลบข้อมูลในไฟล์ต้นทางไม่ได้ ระบบจะเลิกแสดงเล่มนี้เท่านั้น`
            : `ต้องการลบเล่ม ${maskPassport(confirmDelete?.fields.passportNo ?? null)} ออกจากระบบหรือไม่ — การลบไม่สามารถย้อนกลับได้`
        }
        confirmLabel="ลบ"
      />

      {/* ดูรูป Passport (§6) */}
      <Drawer
        open={!!imageView}
        onClose={() => { if (imageView) releaseImageUrl(imageView.url); setImageView(null); }}
        title="รูปหนังสือเดินทาง"
        description={imageView ? maskPassport(imageView.card.fields.passportNo || null) : undefined}
        size="xl"
      >
        {imageView && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageView.url} alt="รูปหนังสือเดินทาง" className="w-full rounded-lg border zego-border-color" />
            <p className="text-xs zego-text-tertiary">
              เก็บในพื้นที่ส่วนตัวของเครื่องนี้ · ไม่มี Public URL · การเปิดดูถูกบันทึกลง Audit Log
            </p>
          </div>
        )}
      </Drawer>

      {/* ประวัติการแก้ไข (§6) */}
      <Drawer
        open={!!historyCard}
        onClose={() => setHistoryCard(null)}
        title="ประวัติการแก้ไข"
        description={historyCard ? maskPassport(historyCard.fields.passportNo || null) : undefined}
        size="md"
      >
        {historyCard && (
          <div className="space-y-4">
            <ul className="space-y-1.5 text-xs zego-text-secondary">
              {historyCard.history.length === 0 && <li className="zego-text-tertiary">ยังไม่มีประวัติ</li>}
              {historyCard.history.map((h, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 zego-divider-bottom pb-1.5">
                  <span className="zego-text-tertiary">{formatDateTime(h.at)}</span>
                  <span className="font-medium zego-text-secondary">{HISTORY_LABEL[h.action]}</span>
                  <span className="zego-text-tertiary">โดย {h.by}</span>
                  {h.changedFields && h.changedFields.length > 0 && (
                    <span className="zego-text-tertiary">({h.changedFields.map((k) => PASSPORT_FIELD_LABEL[k]).join(', ')})</span>
                  )}
                  {h.note && <span className="zego-text-tertiary">— {h.note}</span>}
                </li>
              ))}
            </ul>

            {/* §10 เทียบค่าที่ OCR อ่านครั้งแรก กับค่าที่ผู้ใช้แก้ */}
            {historyCard.ocrOriginal && (
              <OcrDiff card={historyCard} />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function OcrDiff({ card }: { card: PassportCardModel }) {
  const ocr = card.ocrOriginal;
  if (!ocr) return null;
  const keys = (Object.keys(PASSPORT_FIELD_LABEL) as (keyof typeof PASSPORT_FIELD_LABEL)[])
    .filter((k) => ocr[k].value !== card.fields[k]);

  return (
    <div>
      <p className="mb-1 text-xs font-medium zego-text-tertiary">
        {keys.length > 0 ? `ค่าที่ผู้ใช้แก้จากที่ OCR อ่านได้ (${keys.length} ช่อง)` : 'ข้อมูลทุกช่องตรงกับที่ OCR อ่านได้ครั้งแรก'}
      </p>
      {keys.length > 0 && (
        <ul className="space-y-1 text-xs">
          {keys.map((k) => (
            <li key={k} className={cx('flex flex-wrap gap-x-2 rounded px-2 py-1 border', 'zego-status-bar--warning')}>
              <span className="font-medium zego-text-secondary">{PASSPORT_FIELD_LABEL[k]}</span>
              <span className="zego-text-tertiary line-through">{ocr[k].value || '(ว่าง)'}</span>
              <Icon name="chevronRight" className="h-3 w-3 self-center zego-text-disabled" />
              <span className="font-medium zego-text-success">{card.fields[k] || '(ว่าง)'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
