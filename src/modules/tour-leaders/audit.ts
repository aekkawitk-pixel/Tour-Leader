/**
 * สร้างประวัติการเปลี่ยนแปลง (Audit) โดยเปรียบเทียบ record เดิมกับ record ใหม่
 * ⚠️ ข้อมูลอ่อนไหว (เลขเอกสาร / เลขบัญชี) ถูกปิดบังก่อนบันทึกลงประวัติเสมอ
 */

import type {
  AuditCategory,
  AuditEntry,
  Country,
  TourLeader,
  TourRoute,
} from '@/types';
import {
  LEADER_STATUS,
  LEADER_TYPE,
  ROUTE_SKILL_LEVEL,
} from '@/lib/labels';
import { maskForAudit, newChildId } from './utils';

interface DiffContext {
  countries: Country[];
  routes: TourRoute[];
  actor: string;
  now: string;
  reason?: string;
}

const countryName = (countries: Country[], id: string) =>
  countries.find((c) => c.id === id)?.nameEn ?? id;

const routeName = (routes: TourRoute[], id: string) => {
  const route = routes.find((r) => r.id === id);
  if (!route) return id;
  return route.code ?? route.nameTh;
};

/** สรุปความเชี่ยวชาญเส้นทางเป็นข้อความเดียว เพื่อเทียบค่าเดิม/ค่าใหม่ */
function routeSummary(leader: TourLeader, ctx: DiffContext): string {
  if (leader.routeSkills.length === 0) return '(ไม่มี)';
  return leader.routeSkills
    .map((s) => {
      const country = countryName(ctx.countries, s.countryId);
      const scope =
        s.coverage === 'all_routes'
          ? 'ทุกเส้นทาง'
          : s.routeIds.map((id) => routeName(ctx.routes, id)).join('/') || '(ยังไม่เลือก)';
      return `${country}: ${scope} [${ROUTE_SKILL_LEVEL[s.skillLevel].label}]`;
    })
    .join(' · ');
}

function languageSummary(leader: TourLeader): string {
  if (leader.languages.length === 0) return '(ไม่มี)';
  return leader.languages
    .map((l) => (l.isNativeLanguage ? `${l.languageName} (ภาษาแม่)` : `${l.languageName} (${l.levelCode})`))
    .join(' · ');
}

function assignedSummary(leader: TourLeader, ctx: DiffContext): string {
  if (leader.assignedCountries.length === 0) return '(ไม่มี)';
  return leader.assignedCountries
    .map(
      (a) =>
        `${countryName(ctx.countries, a.countryId)}${a.isPrimary ? ' ★หลัก' : ''}${
          a.regionOrCity ? ` (${a.regionOrCity})` : ''
        }`,
    )
    .join(' · ');
}

function tourSkillSummary(leader: TourLeader): string {
  if (leader.tourSkills.length === 0) return '(ไม่มี)';
  return leader.tourSkills.map((s) => s.name).join(' · ');
}

/** เอกสาร — ปิดบังเลขที่ */
function documentSummary(leader: TourLeader): string {
  if (leader.documents.length === 0) return '(ไม่มี)';
  return leader.documents
    .map((d) => `${d.name} (${maskForAudit(d.number)})${d.expiresAt ? ` หมด ${d.expiresAt}` : ''}`)
    .join(' · ');
}

/** บัญชีธนาคาร — ปิดบังเลขบัญชี */
function bankSummary(leader: TourLeader): string {
  if (leader.bankAccounts.length === 0) return '(ไม่มี)';
  return leader.bankAccounts
    .map(
      (b) =>
        `${b.bank} ${maskForAudit(b.accountNoMasked)}${b.isPrimary ? ' ★หลัก' : ''}${
          b.active ? '' : ' (ปิดใช้งาน)'
        }`,
    )
    .join(' · ');
}

function primaryContactSummary(leader: TourLeader): string {
  const primary = leader.contacts.find((c) => c.isPrimary);
  const count = leader.contacts.length;
  return primary ? `${primary.value} (หลัก) · ทั้งหมด ${count} ช่องทาง` : `${count} ช่องทาง`;
}

/**
 * เปรียบเทียบและสร้างรายการประวัติการเปลี่ยนแปลง
 * ถ้า previous = undefined → เป็นการสร้างใหม่ (คืนรายการเดียว)
 */
export function buildAuditEntries(
  previous: TourLeader | undefined,
  next: TourLeader,
  ctx: DiffContext,
): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const push = (
    category: AuditCategory,
    action: string,
    oldValue?: string,
    newValue?: string,
  ) => {
    entries.push({
      id: newChildId('AU'),
      at: ctx.now,
      by: ctx.actor,
      category,
      action,
      oldValue,
      newValue,
      reason: ctx.reason,
    });
  };

  if (!previous) {
    push('profile', 'สร้างข้อมูลหัวหน้าทัวร์', undefined, `${next.firstName} ${next.lastName}`);
    return entries;
  }

  /* ประเภทหัวหน้าทัวร์ */
  if (previous.leaderType !== next.leaderType) {
    push(
      'leaderType',
      'เปลี่ยนรูปแบบการร่วมงาน',
      LEADER_TYPE[previous.leaderType].label,
      LEADER_TYPE[next.leaderType].label,
    );
  }

  /* สถานะพร้อมรับงาน */
  if (previous.status !== next.status) {
    push(
      'workStatus',
      'เปลี่ยนสถานะพร้อมรับงาน',
      LEADER_STATUS[previous.status].label,
      LEADER_STATUS[next.status].label,
    );
  }

  /* การเปิด/ปิดใช้งาน */
  if (previous.active !== next.active) {
    push(
      'activation',
      next.active ? 'เปิดใช้งานข้อมูล' : 'ปิดใช้งานข้อมูล (ไม่ลบข้อมูล)',
      previous.active ? 'ใช้งาน' : 'ปิดใช้งาน',
      next.active ? 'ใช้งาน' : 'ปิดใช้งาน',
    );
  }

  /* ประเทศประจำ */
  const oldAssigned = assignedSummary(previous, ctx);
  const newAssigned = assignedSummary(next, ctx);
  if (oldAssigned !== newAssigned) {
    push('assignedCountry', 'แก้ไขประเทศประจำ', oldAssigned, newAssigned);
  }

  /* ประเทศ/เส้นทางที่เชี่ยวชาญ */
  const oldRoutes = routeSummary(previous, ctx);
  const newRoutes = routeSummary(next, ctx);
  if (oldRoutes !== newRoutes) {
    push('routeExpertise', 'แก้ไขประเทศ/เส้นทางที่เชี่ยวชาญ', oldRoutes, newRoutes);
  }

  /* ภาษา */
  const oldLang = languageSummary(previous);
  const newLang = languageSummary(next);
  if (oldLang !== newLang) {
    push('language', 'แก้ไขภาษาและระดับ', oldLang, newLang);
  }

  /* ความถนัด */
  const oldSkill = tourSkillSummary(previous);
  const newSkill = tourSkillSummary(next);
  if (oldSkill !== newSkill) {
    push('tourSkill', 'แก้ไขประเภททัวร์และความถนัด', oldSkill, newSkill);
  }

  /* ช่องทางติดต่อ */
  const oldContact = primaryContactSummary(previous);
  const newContact = primaryContactSummary(next);
  if (oldContact !== newContact) {
    push('contact', 'แก้ไขช่องทางติดต่อ', oldContact, newContact);
  }

  /* เอกสาร (ปิดบัง) */
  const oldDoc = documentSummary(previous);
  const newDoc = documentSummary(next);
  if (oldDoc !== newDoc) {
    push('document', 'แก้ไขเอกสาร', oldDoc, newDoc);
  }

  /* บัญชีธนาคาร (ปิดบัง) */
  const oldBank = bankSummary(previous);
  const newBank = bankSummary(next);
  if (oldBank !== newBank) {
    push('bankAccount', 'แก้ไขบัญชีธนาคาร', oldBank, newBank);
  }

  /* วันที่พร้อมเริ่มงาน (คนละอย่างกับวันที่เริ่มร่วมงาน) */
  if (previous.availableStartDate !== next.availableStartDate) {
    push(
      'workStatus',
      'แก้ไขวันที่พร้อมเริ่มงาน',
      previous.availableStartDate || '(ว่าง)',
      next.availableStartDate || '(ว่าง)',
    );
  }

  /* จังหวัด / ประเทศที่พักอาศัย */
  const oldPlace = `${previous.address.province ?? '(ไม่ระบุ)'} · ${
    countryName(ctx.countries, previous.address.countryId)
  }`;
  const newPlace = `${next.address.province ?? '(ไม่ระบุ)'} · ${
    countryName(ctx.countries, next.address.countryId)
  }`;
  if (oldPlace !== newPlace) {
    push('profile', 'แก้ไขจังหวัด/ประเทศที่พักอาศัย', oldPlace, newPlace);
  }

  /* ข้อควรระวัง */
  if (previous.cautions !== next.cautions) {
    push(
      'profile',
      'แก้ไขข้อควรระวัง',
      previous.cautions || '(ว่าง)',
      next.cautions || '(ว่าง)',
    );
  }

  /* ข้อมูลพื้นฐาน */
  const basicFields: [keyof TourLeader, string][] = [
    ['title', 'คำนำหน้า'],
    ['firstName', 'ชื่อ (ไทย)'],
    ['lastName', 'นามสกุล (ไทย)'],
    ['firstNameEn', 'ชื่อ (อังกฤษ)'],
    ['lastNameEn', 'นามสกุล (อังกฤษ)'],
    ['nickname', 'ชื่อเล่น'],
    ['birthDate', 'วันเกิด'],
  ];
  for (const [field, label] of basicFields) {
    const oldValue = String(previous[field] ?? '');
    const newValue = String(next[field] ?? '');
    if (oldValue !== newValue) {
      push('profile', `แก้ไข${label}`, oldValue || '(ว่าง)', newValue || '(ว่าง)');
    }
  }

  if (previous.photoUrl !== next.photoUrl) {
    push(
      'profile',
      next.photoUrl ? 'เปลี่ยนรูปประจำตัว' : 'นำรูปประจำตัวออก',
      previous.photoUrl ? 'มีรูป' : 'ไม่มีรูป',
      next.photoUrl ? 'มีรูป' : 'ไม่มีรูป',
    );
  }

  return entries;
}
