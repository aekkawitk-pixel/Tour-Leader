'use client';

/**
 * การ์ดรายการเอกสารของหัวหน้าทัวร์ — ใช้ซ้ำได้ทุกกลุ่ม (ระบุชนิดที่ดูแลผ่าน props)
 *
 * อ่าน/เขียนผ่าน documentStore จุดเดียว จึงได้กติกาเดียวกับหนังสือเดินทางฟรี:
 * ฉบับหลัก 1 ฉบับต่อชนิด · เก็บฉบับเก่าไว้เมื่อต่ออายุ · ประวัติการแก้ไขครบ
 *
 * หนังสือเดินทางไม่อยู่ในการ์ดนี้ — มีโมดูลของตัวเองที่รองรับ OCR/MRZ/รูปเล่ม
 * สิทธิ์ใช้ชุด passport.* ร่วมกัน เพราะเป็น "เอกสารประจำตัว" กลุ่มเดียวกัน
 */

import { useMemo, useState } from 'react';
import { Button, Card, CardHeader, EmptyState, StatusBadge, cx } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { diffDays, formatDate, formatDateTime } from '@/lib/format';
import { DOC_KIND_DISPLAY_NAME } from '@/lib/logic/documentView';
import { documentNumberFieldKey } from '@/data/leaders/documentFieldKeys';
import {
  DOCUMENT_LIFECYCLE_LABEL,
  type AnyLeaderDocumentRecord,
  type DocumentHistoryEntry,
  type DocumentLifecycle,
} from '@/data/leaders/documentRecordTypes';
import { isFileBasedDocKind, type DocKind } from '@/data/leaders/documentSchemas';
import { addDocumentBlockedReason, blankDocumentDraft, deleteDocument, getDocuments, setDocumentLifecycle, setPrimaryDocument } from '@/services/documentStore';
import { openDocumentImageUrl, releaseImageUrl } from '@/services/documentImageStore';
import { maskDocumentNumber } from '@/modules/tour-leaders/utils';
import { DocumentFormModal } from './DocumentFormModal';
import { TourCardTemplate } from './TourCardTemplate';
import { IdCardTemplate } from './IdCardTemplate';
import { VisaTemplate } from './VisaTemplate';
import type { TourLeader } from '@/types';

/** บัตรหัวหน้าทัวร์ — แยกเป็นการ์ดของตัวเอง เพราะมี template หน้าบัตรและใช้บ่อยที่สุด */
export const TOUR_CARD_KINDS: DocKind[] = ['tour_card'];

/** บัตรประชาชน — แยกการ์ดเหมือนบัตรหัวหน้าทัวร์ เพราะมี template หน้าบัตรของตัวเอง */
export const ID_CARD_KINDS: DocKind[] = ['id_card'];

/** เอกสารประจำตัวอื่น — หนังสือเดินทาง/บัตรหัวหน้าทัวร์/บัตรประชาชน แยกการ์ดของตัวเองแล้ว */
export const IDENTITY_DOC_KINDS: DocKind[] = ['visa'];

/** เอกสารอื่น ๆ — ตัวไฟล์คือเนื้อหาหลัก */
export const OTHER_DOC_KINDS: DocKind[] = ['criminal_record', 'certificate', 'other'];

/**
 * ชนิดที่มี "หน้าเอกสารจำลอง" ของตัวเอง — แถวจะมีปุ่มดู/ย่อรายละเอียด
 * (หนังสือเดินทางมี template ของตัวเองอยู่แล้วในโมดูล Passport)
 */
const KINDS_WITH_TEMPLATE: readonly DocKind[] = ['tour_card', 'id_card', 'visa'];

/**
 * ชนิดที่ "เพิ่มใหม่" แล้วกรอกในการ์ดเลย ไม่เปิดหน้าต่างซ้อน
 *
 * ยังไม่กดเพิ่ม = แสดงหน้าเอกสารเปล่าไว้เฉย ๆ ให้เห็นว่าช่องนี้คือเอกสารอะไร
 * กดเพิ่มแล้วจึงกลายเป็นฟอร์มให้กรอก — ผู้ใช้จึงรู้เสมอว่ากำลังทำส่วนไหนอยู่
 */
const KINDS_WITH_INLINE_FORM: readonly DocKind[] = ['tour_card', 'id_card', 'visa'];

/** เอกสารอ่อนไหวต้องปิดบังเลขก่อนแสดง */
const MASK_AS: Partial<Record<DocKind, 'national_id' | 'passport'>> = {
  id_card: 'national_id',
  criminal_record: 'national_id',
};

/**
 * ตัวกรองสถานะการใช้งาน — ค่าเริ่มต้นคือ "ใช้งานอยู่"
 * เอกสารที่สูญหาย/ยกเลิก/ปิดใช้งานยังอยู่ครบเป็นประวัติ แค่ไม่ปนกับฉบับที่ใช้งานจริง
 */
type LifecycleFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

const LIFECYCLE_FILTERS: { value: LifecycleFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'ใช้งานอยู่' },
  { value: 'INACTIVE', label: 'ไม่ใช้งานแล้ว' },
  { value: 'ALL', label: 'ทั้งหมด' },
];

const matchesLifecycleFilter = (doc: AnyLeaderDocumentRecord, filter: LifecycleFilter): boolean => {
  if (filter === 'ALL') return true;
  return filter === 'ACTIVE' ? doc.lifecycle === 'ACTIVE' : doc.lifecycle !== 'ACTIVE';
};

/** ป้ายเหตุการณ์ในประวัติ — ต้องอ่านรู้เรื่องโดยไม่ต้องเปิดโค้ดดู */
const HISTORY_LABEL: Record<DocumentHistoryEntry['action'], string> = {
  OCR_IMPORT: 'นำเข้าข้อมูลจากไฟล์ด้วย OCR',
  MANUAL_ENTRY: 'สร้างเอกสารและแนบไฟล์',
  USER_EDIT: 'แก้ไขข้อมูล',
  CONFIRM: 'ยืนยันและบันทึก',
  SAVE_DRAFT: 'บันทึกเป็นฉบับร่าง',
  SET_PRIMARY: 'ตั้งเป็นฉบับหลัก',
  UNSET_PRIMARY: 'เปลี่ยนเป็นฉบับรอง',
  RE_OCR: 'อ่านข้อมูลด้วย OCR ใหม่',
  LIFECYCLE_CHANGE: 'เปลี่ยนสถานะการใช้งาน',
  REPLACE_IMAGE: 'เปลี่ยนไฟล์แนบ',
};

const LIFECYCLE_ACTIONS: { value: DocumentLifecycle; label: string }[] = [
  { value: 'LOST', label: 'แจ้งสูญหาย' },
  { value: 'REVOKED', label: 'ยกเลิกเอกสาร' },
  { value: 'INACTIVE', label: 'ปิดใช้งาน' },
  { value: 'ACTIVE', label: 'กลับมาใช้งาน' },
];

export function LeaderDocumentsCard({
  leader,
  kinds,
  addKind,
  title,
  description,
  onChanged,
}: {
  leader: TourLeader;
  /** ชนิดเอกสารที่การ์ดนี้ดูแล (แสดงรวมกันทุกชนิด) */
  kinds: DocKind[];
  /**
   * ระบุเมื่ออยากให้ปุ่ม "เพิ่ม" เหลือปุ่มเดียว (แทนที่จะขึ้นปุ่มละชนิดตาม kinds) —
   * ใช้เมื่อ kinds มีมากกว่า 1 ชนิดแต่อยากให้เพิ่มเอกสารใหม่ทุกฉบับเป็นชนิดเดียวกันหมด
   * (เอกสารเก่าของชนิดอื่นใน kinds ยังแสดงอยู่ตามปกติ ไม่หายไปไหน)
   */
  addKind?: DocKind;
  title: string;
  description: string;
  /** แจ้งหน้าจอแม่ให้อ่านเอกสารใหม่ — การ์ดอื่นบนหน้าเดียวกันอ่านจาก store เหมือนกัน */
  onChanged?: () => void;
}) {
  const { currentUser, today, pushToast } = useDemo();

  const canView = can(currentUser.role, 'passport.view');
  const canEdit = can(currentUser.role, 'passport.edit');
  const canChangePrimary = can(currentUser.role, 'passport.changePrimary');
  const canDeactivate = can(currentUser.role, 'passport.deactivate');
  const canDelete = can(currentUser.role, 'passport.delete');

  const [rev, setRev] = useState(0);
  const reload = () => { setRev((v) => v + 1); onChanged?.(); };

  const [form, setForm] = useState<{ kind: DocKind; editing: AnyLeaderDocumentRecord | null } | null>(null);
  /** ชนิดที่กำลังกรอกฟอร์มฝังอยู่บนการ์ดนี้ (null = ยังไม่ได้กดเพิ่ม) */
  const [inlineAdding, setInlineAdding] = useState<DocKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AnyLeaderDocumentRecord | null>(null);
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('ACTIVE');

  /** ทุกฉบับที่มีจริง — ใช้นับรวมและนับที่ถูกซ่อน ไม่ผ่านตัวกรอง */
  const allByKind = useMemo(() => {
    void rev;
    const map = new Map<DocKind, AnyLeaderDocumentRecord[]>();
    if (!canView) return map;
    for (const kind of kinds) {
      const rows = getDocuments(leader.id, kind);
      if (rows.length > 0) map.set(kind, rows);
    }
    return map;
  }, [rev, leader.id, canView, kinds]);

  const byKind = useMemo(() => {
    const map = new Map<DocKind, AnyLeaderDocumentRecord[]>();
    for (const [kind, rows] of allByKind) {
      const shown = rows.filter((d) => matchesLifecycleFilter(d, lifecycleFilter));
      if (shown.length > 0) map.set(kind, shown);
    }
    return map;
  }, [allByKind, lifecycleFilter]);

  /** ชนิดไหนเพิ่มไม่ได้ตอนนี้ + เพราะอะไร (เช่น บัตรประชาชนที่ยังถือใบเดิมอยู่) */
  const blockedReason = useMemo(() => {
    void rev;
    const map = new Map<DocKind, string>();
    for (const kind of kinds) {
      const reason = addDocumentBlockedReason(leader.id, kind, `${today}T00:00`);
      if (reason) map.set(kind, reason);
    }
    return map;
  }, [rev, leader.id, kinds, today]);

  /** การ์ดนี้ควรขึ้นฟอร์มกรอกทันทีหรือไม่ (ชนิดเดียว · ยังไม่มีข้อมูล · มีสิทธิ์แก้ไข) */
  const inlineFormKind = kinds.length === 1 && KINDS_WITH_INLINE_FORM.includes(kinds[0]) ? kinds[0] : null;

  const total = useMemo(
    () => Array.from(byKind.values()).reduce((sum, rows) => sum + rows.length, 0),
    [byKind],
  );
  const totalAll = useMemo(
    () => Array.from(allByKind.values()).reduce((sum, rows) => sum + rows.length, 0),
    [allByKind],
  );
  const hidden = totalAll - total;

  if (!canView) {
    return (
      <Card>
        <CardHeader title={title} description={description} />
        <EmptyState icon="eye" title="ไม่มีสิทธิ์ดูเอกสารประจำตัว" />
      </Card>
    );
  }

  const changePrimary = (doc: AnyLeaderDocumentRecord) => {
    try {
      setPrimaryDocument(doc.docId, currentUser.name, `${today}T00:00`);
      pushToast('success', 'ตั้งเป็นฉบับหลักเรียบร้อย');
      reload();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const changeLifecycle = (doc: AnyLeaderDocumentRecord, lifecycle: DocumentLifecycle) => {
    try {
      setDocumentLifecycle(doc.docId, lifecycle, { by: currentUser.name, at: `${today}T00:00` });
      pushToast('success', `เปลี่ยนสถานะเป็น “${DOCUMENT_LIFECYCLE_LABEL[lifecycle]}” เรียบร้อย`);
      reload();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** เปิดไฟล์ตาม imageId — ผู้เรียกผ่านการตรวจสิทธิ์ canView มาแล้ว */
  const viewImage = async (imageId: string) => {
    const url = await openDocumentImageUrl(imageId, {
      canView: true, by: currentUser.name, at: `${today}T00:00`, tourLeaderId: leader.id,
    });
    if (!url) { pushToast('error', 'เปิดไฟล์ไม่สำเร็จ — อาจถูกลบไปแล้ว'); return; }
    window.open(url, '_blank', 'noopener');
    setTimeout(() => releaseImageUrl(url), 60_000);
  };

  /** เปิดไฟล์แนบปัจจุบันของเอกสารใบนี้ */
  const viewFile = async (doc: AnyLeaderDocumentRecord) => {
    if (!doc.imageId) return;
    await viewImage(doc.imageId);
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    try {
      deleteDocument(confirmDelete.docId);
      pushToast('success', 'ลบเอกสารเรียบร้อย');
      setConfirmDelete(null);
      reload();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    }
  };

  return (
    <>
      <Card>
        {/* ปุ่มเพิ่มอยู่มุมขวาบนของการ์ด รูปแบบเดียวกับการ์ดหนังสือเดินทาง */}
        <CardHeader
          title={title}
          description={totalAll > 0 ? `${total} ฉบับ · ${description}` : description}
          action={
            canEdit ? (
              <div className="flex flex-wrap gap-2">
                {addKind ? (
                  <Button
                    variant="primary"
                    icon="plus"
                    disabled={inlineAdding === addKind || blockedReason.has(addKind)}
                    title={blockedReason.get(addKind)}
                    onClick={() => {
                      if (KINDS_WITH_INLINE_FORM.includes(addKind)) setInlineAdding(addKind);
                      else setForm({ kind: addKind, editing: null });
                    }}
                  >
                    เพิ่มเอกสาร
                  </Button>
                ) : (
                  kinds.map((kind) => (
                    <Button
                      key={kind}
                      variant="primary"
                      icon="plus"
                      disabled={inlineAdding === kind || blockedReason.has(kind)}
                      title={blockedReason.get(kind)}
                      onClick={() => {
                        if (KINDS_WITH_INLINE_FORM.includes(kind)) setInlineAdding(kind);
                        else setForm({ kind, editing: null });
                      }}
                    >
                      เพิ่ม{DOC_KIND_DISPLAY_NAME[kind]}
                    </Button>
                  ))
                )}
              </div>
            ) : undefined
          }
        />

        {/*
          ตัวกรองสถานะ — โผล่เมื่อมีเอกสารแล้วเท่านั้น
          บอกจำนวนที่ถูกซ่อนไว้เสมอ ไม่งั้นค่าเริ่มต้นที่กรองอยู่จะดูเหมือนเอกสารหาย
        */}
        {totalAll > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs zego-text-tertiary">สถานะเอกสาร</span>
            <div className="inline-flex overflow-hidden rounded-lg border zego-border-color">
              {LIFECYCLE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={lifecycleFilter === f.value}
                  onClick={() => setLifecycleFilter(f.value)}
                  className={cx(
                    'px-2.5 py-1 text-xs',
                    lifecycleFilter === f.value
                      ? 'zego-selected-fill font-medium'
                      : 'zego-surface-bg zego-text-secondary zego-hover-surface',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {hidden > 0 && (
              <span className="text-xs zego-text-tertiary">ซ่อนอยู่ {hidden} ฉบับ</span>
            )}
          </div>
        )}

        {/* บอกเหตุผลไว้ตรงนี้ด้วย — ปุ่มจางอย่างเดียวผู้ใช้จะไม่รู้ว่าติดกติกาข้อไหน */}
        {canEdit && blockedReason.size > 0 && !inlineAdding && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            {[...blockedReason].map(([kind, reason]) => (
              <p key={kind} className="text-xs text-amber-800">{reason}</p>
            ))}
          </div>
        )}

        {inlineAdding ? (
          /* กดเพิ่มแล้ว → หน้าเอกสารเปล่ากลายเป็นฟอร์มให้กรอกตรงนี้ ไม่เปิดหน้าต่างซ้อน */
          <DocumentFormModal
            key={`inline-${inlineAdding}-${rev}`}
            open
            variant="inline"
            kind={inlineAdding}
            tourLeaderId={leader.id}
            editing={null}
            onClose={() => setInlineAdding(null)}
            onSaved={() => { setInlineAdding(null); reload(); }}
          />
        ) : total === 0 && totalAll > 0 ? (
          /* มีเอกสารอยู่ แต่ตัวกรองซ่อนไว้ทั้งหมด — ต้องไม่บอกว่ายังไม่มีเอกสาร */
          <EmptyState
            icon="file"
            title={`ไม่มีเอกสารสถานะ “${LIFECYCLE_FILTERS.find((f) => f.value === lifecycleFilter)!.label}”`}
            description={`มีทั้งหมด ${totalAll} ฉบับ — เลือก “ทั้งหมด” เพื่อดูทุกฉบับ`}
          />
        ) : total === 0 && inlineFormKind ? (
          /* ยังไม่มีเอกสาร → โชว์หน้าเอกสารเปล่าไว้ให้รู้ว่าช่องนี้คือเอกสารอะไร ยังกรอกไม่ได้ */
          <DocumentPreview kind={inlineFormKind} />
        ) : total === 0 ? (
          <EmptyState
            icon="file"
            title={`ยังไม่มี${title}`}
            description={canEdit ? 'กดปุ่มด้านบนเพื่อเพิ่มเอกสารฉบับแรก' : undefined}
          />
        ) : (
          <div className="space-y-5">
            {kinds.filter((k) => byKind.has(k)).map((kind) => (
              <section key={kind}>
                {/* การ์ดที่ดูแลชนิดเดียวไม่ต้องมีหัวข้อย่อย — ชื่อการ์ดบอกอยู่แล้ว */}
                {kinds.length > 1 && (
                  <h3 className="mb-2 text-sm font-semibold zego-text">
                    {DOC_KIND_DISPLAY_NAME[kind]}
                    <span className="ml-2 text-xs font-normal zego-text-tertiary">
                      {byKind.get(kind)!.length} ฉบับ
                    </span>
                  </h3>
                )}
                <ul className="space-y-2">
                  {byKind.get(kind)!.map((doc) => (
                    <DocumentRow
                      key={doc.docId}
                      doc={doc}
                      today={today}
                      canEdit={canEdit}
                      canChangePrimary={canChangePrimary}
                      canDeactivate={canDeactivate}
                      canDelete={canDelete}
                      onEdit={() => setForm({ kind: doc.kind, editing: doc })}
                      onViewFile={() => { void viewFile(doc); }}
                      onViewImage={(imageId) => { void viewImage(imageId); }}
                      onPrimary={() => changePrimary(doc)}
                      onLifecycle={(lc) => changeLifecycle(doc, lc)}
                      onDelete={() => setConfirmDelete(doc)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {form && (
        <DocumentFormModal
          key={`${form.kind}-${form.editing?.docId ?? "new"}`}
          open
          kind={form.kind}
          tourLeaderId={leader.id}
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={reload}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        tone="danger"
        title="ลบเอกสารนี้?"
        message={
          confirmDelete
            ? `ลบ${DOC_KIND_DISPLAY_NAME[confirmDelete.kind]}ฉบับนี้ถาวร — ประวัติการแก้ไขจะหายไปด้วย `
              + 'ถ้าเอกสารเพียงใช้ไม่ได้แล้ว ให้ใช้ “แจ้งสูญหาย/ยกเลิก” แทนเพื่อเก็บประวัติไว้'
            : ''
        }
        confirmLabel="ลบถาวร"
      />
    </>
  );
}

/* --------------------- หน้าเอกสารเปล่า (ยังไม่ได้กดเพิ่ม) --------------------- */

/**
 * ตัวอย่างหน้าเอกสารแบบยังไม่มีข้อมูล — ทำให้เห็นว่าช่องนี้คือเอกสารอะไรและมีช่องอะไรบ้าง
 * โดยที่ยังไม่เปิดให้กรอก เพื่อไม่ให้สับสนว่ากำลังกรอกฉบับไหนอยู่
 * ทั้งใบจางลงและกันการคลิก — เป็นภาพประกอบ ไม่ใช่ของที่แก้ได้
 */
function DocumentPreview({ kind }: { kind: DocKind }) {
  const blank = {
    ...blankDocumentDraft(kind),
    docId: `preview-${kind}`,
    kind,
    imageId: null,
  } as unknown as AnyLeaderDocumentRecord;

  return (
    <div>
      <div className="pointer-events-none select-none opacity-55 grayscale-[35%]" aria-hidden="true">
        {kind === 'tour_card' && <TourCardTemplate doc={blank} />}
        {kind === 'id_card' && <IdCardTemplate doc={blank} />}
        {kind === 'visa' && <VisaTemplate doc={blank} />}
      </div>
      <p className="mt-2 text-center text-sm zego-text-tertiary">
        ยังไม่มีข้อมูล — กด “เพิ่ม{DOC_KIND_DISPLAY_NAME[kind]}” ด้านบนเพื่อเริ่มกรอก
      </p>
    </div>
  );
}

/* ------------------------------- แถวเอกสาร 1 ฉบับ ------------------------------ */

function DocumentRow({
  doc,
  today,
  canEdit,
  canChangePrimary,
  canDeactivate,
  canDelete,
  onEdit,
  onViewFile,
  onViewImage,
  onPrimary,
  onLifecycle,
  onDelete,
}: {
  doc: AnyLeaderDocumentRecord;
  today: string;
  canEdit: boolean;
  canChangePrimary: boolean;
  canDeactivate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onViewFile: () => void;
  /** เปิดไฟล์เวอร์ชันใดก็ได้จากประวัติ (ไฟล์เดิมที่ถูกแทนที่ยังเก็บไว้) */
  onViewImage: (imageId: string) => void;
  onPrimary: () => void;
  onLifecycle: (lifecycle: DocumentLifecycle) => void;
  onDelete: () => void;
}) {
  /**
   * หัวแถว: เอกสารประจำตัวใช้ "เลขที่เอกสาร" เป็นตัวระบุ
   * ส่วนกลุ่มแนบไฟล์มักไม่มีเลขที่ จึงใช้ชื่อเอกสารที่ผู้ใช้ระบุแทน
   */
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const hasTemplate = KINDS_WITH_TEMPLATE.includes(doc.kind);
  const fileBased = isFileBasedDocKind(doc.kind);
  /* ระเบียนที่บันทึกไว้ก่อนมีเมตาไฟล์ → ถอยไปใช้ผู้สร้าง/เวลาสร้าง ซึ่งคือตอนที่แนบไฟล์ครั้งแรก */
  const uploadedAt = doc.fileUploadedAt ?? (doc.imageId ? doc.createdAt : null);
  const uploadedBy = doc.fileUploadedBy ?? (doc.imageId ? doc.createdBy : null);
  const fileSize = doc.fileByteSize ? `${(doc.fileByteSize / 1024 / 1024).toFixed(2)} MB` : '';

  /* กลุ่มแนบไฟล์: ใช้ชื่อเอกสารที่ระบุไว้ก่อน ไม่มีจึงใช้ชื่อไฟล์ แล้วค่อยตกไปที่ชื่อชนิด */
  const docTitle = fileBased
    ? (doc.fields.docTitle?.trim() || doc.sourceFileName?.trim() || DOC_KIND_DISPLAY_NAME[doc.kind])
    : (doc.fields.docTitle?.trim() ?? '');
  const rawNumber = doc.fields[documentNumberFieldKey(doc.kind)] ?? '';
  const maskAs = MASK_AS[doc.kind];
  /* ไม่มีเลขที่เอกสาร = ไม่ต้องแสดงอะไร — ปิดบังค่าว่างจะได้ "xxxxxxxx" ที่ดูเหมือนมีเลขอยู่ */
  const number = !rawNumber.trim() ? '' : maskAs ? maskDocumentNumber(maskAs, rawNumber) : rawNumber;

  const expiry = doc.fields.expiryDate?.trim() || null;
  const daysLeft = expiry ? diffDays(today, expiry) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 120;
  const usable = doc.lifecycle === 'ACTIVE' && !expired;

  return (
    <li
      className={cx(
        'rounded-lg border px-3 py-2.5',
        expired || doc.lifecycle !== 'ACTIVE'
          ? 'border-rose-200 bg-rose-50'
          : soon
            ? 'border-amber-200 bg-amber-50'
            : 'zego-border-color',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium zego-text">
            {docTitle ? (
              <span>{docTitle}</span>
            ) : (
              <span className="font-mono">{number || '—'}</span>
            )}
            {docTitle && number && <span className="font-mono text-xs zego-text-tertiary">{number}</span>}

            {doc.isPrimary && (
              <StatusBadge meta={{ label: 'ฉบับหลัก', tone: 'blue' }} size="sm" dot={false} />
            )}
            {doc.status === 'DRAFT' && (
              <StatusBadge meta={{ label: 'ฉบับร่าง', tone: 'slate' }} size="sm" dot={false} />
            )}
            {doc.lifecycle !== 'ACTIVE' && (
              <StatusBadge meta={{ label: DOCUMENT_LIFECYCLE_LABEL[doc.lifecycle], tone: 'red' }} size="sm" dot={false} />
            )}
            {usable && doc.status === 'CONFIRMED' && (
              <StatusBadge meta={{ label: 'ใช้งานได้', tone: 'green' }} size="sm" dot={false} />
            )}
          </p>

          {/* ชนิดที่ไม่มีช่องวันที่ในฟอร์มแล้ว (ใบเซอร์ · เอกสารอื่น) จะไม่มีบรรทัดนี้ ไม่ใช่ขึ้นว่า "ไม่ระบุ" ลอย ๆ */}
          {(doc.fields.issuedDate || expiry) && (
          <p className="mt-0.5 text-xs zego-text-tertiary">
            {doc.fields.issuedDate && `ออกเมื่อ ${formatDate(doc.fields.issuedDate)}`}
            {expiry ? (
              <>
                {doc.fields.issuedDate ? ' · ' : ''}
                หมดอายุ {formatDate(expiry)}
                {daysLeft !== null && (
                  <span className={cx('ml-1', expired ? 'text-rose-700' : soon ? 'text-amber-700' : 'zego-text-tertiary')}>
                    ({expired ? `เกิน ${Math.abs(daysLeft)} วัน` : `เหลือ ${daysLeft} วัน`})
                  </span>
                )}
              </>
            ) : (
              `${doc.fields.issuedDate ? ' · ' : ''}ไม่ระบุวันหมดอายุ`
            )}
          </p>
          )}

          {/*
            กลุ่มแนบไฟล์ — ตัวไฟล์คือเนื้อหาหลัก จึงต้องเปิดดูได้จากแถวเลย
            ไม่ใช่ชื่อไฟล์สีเทาที่ต้องกดเข้าไปแก้ไขก่อนถึงจะเห็นของจริง
          */}
          {fileBased ? (
            doc.imageId ? (
              <div className="mt-1.5 flex max-w-full items-center gap-2.5 rounded-lg border zego-border-color zego-surface-bg px-2.5 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded zego-icon-well">
                  <Icon name="file" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium zego-text-secondary">
                    {doc.sourceFileName || 'ไฟล์แนบ'}
                    {fileSize && <span className="ml-1.5 font-normal zego-text-tertiary">{fileSize}</span>}
                  </p>
                  <p className="text-xs zego-text-tertiary">
                    {uploadedAt ? `แนบเมื่อ ${formatDateTime(uploadedAt)}` : 'ไม่ทราบเวลาที่แนบ'}
                    {uploadedBy && ` · โดย ${uploadedBy}`}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon="eye" onClick={onViewFile}>เปิดไฟล์</Button>
              </div>
            ) : (
              <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700">
                <Icon name="warning" className="h-3.5 w-3.5" />
                ยังไม่ได้แนบไฟล์
              </p>
            )
          ) : (
            doc.imageId && doc.sourceFileName && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs zego-text-tertiary">
                <Icon name="file" className="h-3 w-3" />
                {doc.sourceFileName}
              </p>
            )
          )}

          {doc.note && <p className="mt-0.5 text-xs zego-text-tertiary">{doc.note}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {hasTemplate && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((x) => !x)}>
              {expanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียด'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((x) => !x)}>
            {showHistory ? 'ปิดประวัติ' : `ประวัติ (${doc.history.length})`}
          </Button>
          {canEdit && (
            <Button size="sm" variant="secondary" icon="edit" onClick={onEdit}>แก้ไข</Button>
          )}
          {/* "เอกสารอื่น ๆ" และ "วีซ่า" ไม่มีแนวคิดฉบับหลัก/ฉบับรอง — แต่ละฉบับใช้งานอยู่ทั้งหมด (ดูเหตุผลเดียวกันในฟอร์มเพิ่ม) */}
          {doc.kind !== 'other' && doc.kind !== 'visa' && canChangePrimary && !doc.isPrimary && doc.lifecycle === 'ACTIVE' && (
            <Button size="sm" variant="secondary" onClick={onPrimary}>ตั้งเป็นฉบับหลัก</Button>
          )}
          {canDeactivate && (
            <select
              aria-label="เปลี่ยนสถานะการใช้งาน"
              value=""
              onChange={(e) => {
                const value = e.target.value as DocumentLifecycle | '';
                if (value) onLifecycle(value);
                e.currentTarget.value = '';
              }}
              className="rounded-lg border zego-border-color px-2 py-1 text-xs zego-text-secondary"
            >
              <option value="">สถานะ…</option>
              {LIFECYCLE_ACTIONS.filter((a) => a.value !== doc.lifecycle).map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="ลบเอกสาร"
              className="rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/*
        ประวัติการแก้ไข — ตรวจย้อนหลังได้ว่าใครทำอะไรเมื่อไร
        รายการที่ผูกไฟล์ไว้เปิดดูไฟล์เวอร์ชันนั้นได้ ไม่ใช่รู้แค่ชื่อไฟล์
      */}
      {showHistory && (
        <div className="mt-2.5 rounded-lg border zego-border-color zego-surface-soft-bg p-2.5">
          <ul className="space-y-1.5">
            {doc.history.length === 0 && <li className="text-xs zego-text-tertiary">ยังไม่มีประวัติ</li>}
            {[...doc.history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 zego-divider-bottom pb-1.5 text-xs last:border-0 last:pb-0">
                <span className="zego-text-tertiary">{formatDateTime(h.at)}</span>
                <span className="font-medium zego-text-secondary">{HISTORY_LABEL[h.action]}</span>
                <span className="zego-text-tertiary">โดย {h.by}</span>
                {h.note && <span className="zego-text-tertiary">— {h.note}</span>}
                {h.imageId && (
                  <button
                    type="button"
                    onClick={() => onViewImage(h.imageId!)}
                    className="font-medium zego-text-info underline-offset-2 hover:underline"
                  >
                    เปิดไฟล์ตอนนั้น
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* หน้าเอกสารจำลอง — เฉพาะชนิดที่มี template ของตัวเอง */}
      {expanded && doc.kind === 'tour_card' && (
        <TourCardTemplate doc={doc} onViewFile={doc.imageId ? onViewFile : undefined} />
      )}
      {expanded && doc.kind === 'id_card' && (
        <IdCardTemplate doc={doc} onViewFile={doc.imageId ? onViewFile : undefined} />
      )}
      {expanded && doc.kind === 'visa' && (
        <VisaTemplate doc={doc} onViewFile={doc.imageId ? onViewFile : undefined} />
      )}
    </li>
  );
}
