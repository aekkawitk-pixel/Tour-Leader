/**
 * รวมข้อมูล Zego ที่ดึงมาใหม่เข้ากับชุดเดิม (แทนการเขียนทับทั้งชุด)
 *
 * เหตุผล: งานในระบบ (จัดหัวหน้าทัวร์ / ส่งกรุ๊ป / ซองเงิน / ใบเสร็จ / เบี้ยเลี้ยง / เคลียร์เงิน / นัดหมาย) ผูกกับพีเรียดด้วย id
 * ถ้าเขียนทับ กรุ๊ปที่ Zego ไม่ส่งมารอบนี้ (เช่น เดินทางจบไปแล้ว) จะหายจากระบบ และงานที่ผูกไว้จะหายจากหน้าจอตามไปด้วย
 *
 * กติกา:
 *   • พีเรียดที่ได้มารอบนี้ = ใช้ข้อมูลใหม่ (ถ้าเคยถูกตั้ง "ไม่พบในต้นทาง" = ล้างออก นับเป็น "กลับมา")
 *   • พีเรียดเดิมที่ไม่ได้มารอบนี้
 *       - อยู่ในขอบเขตที่ดึง (ดึงทั้งหมด หรือโปรแกรมของมันถูกส่งมารอบนี้) → เก็บไว้ + ติด missingSince ("ไม่พบในต้นทาง")
 *       - นอกขอบเขต (ดึงเฉพาะประเทศ/โปรแกรมอื่น) → เก็บไว้ตามเดิม ไม่แตะ
 *   • id คงที่: พีเรียดใหม่ที่ id ไม่ตรงของเดิม แต่โปรแกรม + รหัสกรุ๊ป + วันไปตรงกับพีเรียดเดิม → ใช้ id เดิม
 *     (กันกรณี Zego ไม่ส่ง PeriodID แล้ว id ไปขึ้นกับลำดับในรายการ — งานที่ผูกไว้จะได้ไม่หลุด)
 *   • โปรแกรมเดิมที่ยังมีพีเรียดอ้างอยู่ เก็บไว้ (ชื่อโปรแกรม/เที่ยวบินของกรุ๊ปเก่ายังแสดงได้)
 */

import type { ZegoFlight, ZegoPeriod, ZegoProgram } from '@/data/zego/types';

export interface ZegoPeriodChange {
  id: string;
  groupCode: string;
  startDate: string;
  /** รายละเอียดที่เปลี่ยน เช่น "วันเดินทาง 01/10 → 03/10" */
  details: string[];
}

export interface ZegoMergeSummary {
  at: string;
  /** ดึงทั้งหมด (true) หรือดึงเฉพาะขอบเขต */
  fullScope: boolean;
  /** จำนวนพีเรียดที่ได้จาก Zego รอบนี้ */
  fetched: number;
  added: string[];
  changed: ZegoPeriodChange[];
  /** พีเรียดที่เพิ่งไม่พบในต้นทางรอบนี้ */
  missing: string[];
  /** เคยไม่พบ แล้วกลับมาในรอบนี้ */
  restored: string[];
  /** ไม่พบในต้นทางสะสม (รวมรอบก่อน ๆ) */
  missingTotal: number;
  /** พีเรียดนอกขอบเขตที่คงไว้ตามเดิม */
  keptOutOfScope: number;
  /** พีเรียดที่ได้ id ใหม่จาก Zego แต่ระบบผูกกลับเข้ากับ id เดิมให้ */
  reIdentified: number;
}

export interface ZegoMergeInput {
  programs: ZegoProgram[];
  periods: ZegoPeriod[];
}

const keyOf = (p: Pick<ZegoPeriod, 'programCode' | 'groupCode' | 'startDate'>) =>
  p.groupCode ? `${p.programCode}|${p.groupCode.trim().toUpperCase()}|${p.startDate}` : '';

/** ลายเซ็นเที่ยวบินของโปรแกรม (เลขเที่ยวบิน + เส้นทาง + เวลา) — ใช้ตรวจว่าเที่ยวบิน/เวลาบินเปลี่ยน */
function flightSig(flights: ZegoFlight[] | undefined): string {
  return (flights ?? []).map((f) => `${f.flightNo.trim()} ${f.route.trim()} ${f.departureTime.trim()}-${f.arrivalTime.trim()}`).join(' | ');
}

const shortDate = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '-');

/** สิ่งที่เปลี่ยนระหว่างพีเรียดเดิมกับใหม่ (เฉพาะเรื่องที่กระทบงาน) */
export function periodChangeDetails(
  prev: ZegoPeriod, next: ZegoPeriod, prevFlights: string, nextFlights: string,
): string[] {
  const out: string[] = [];
  if (prev.startDate !== next.startDate || prev.endDate !== next.endDate) {
    out.push(`วันเดินทาง ${shortDate(prev.startDate)}–${shortDate(prev.endDate)} → ${shortDate(next.startDate)}–${shortDate(next.endDate)}`);
  }
  if ((prev.groupCode || '') !== (next.groupCode || '')) out.push(`รหัสกรุ๊ป ${prev.groupCode || '-'} → ${next.groupCode || '-'}`);
  if ((prev.saleStatus || '') !== (next.saleStatus || '')) out.push(`สถานะขาย ${prev.saleStatus || '-'} → ${next.saleStatus || '-'}`);
  if ((prev.airlineCode ?? '') !== (next.airlineCode ?? '')) out.push(`สายการบิน ${prev.airlineCode || '-'} → ${next.airlineCode || '-'}`);
  if ((prev.airport ?? '') !== (next.airport ?? '')) out.push(`สนามบิน ${prev.airport || '-'} → ${next.airport || '-'}`);
  if ((prev.bus ?? '') !== (next.bus ?? '')) out.push(`บัส ${prev.bus || '-'} → ${next.bus || '-'}`);
  if (prevFlights !== nextFlights) out.push('เที่ยวบิน/เวลาบินเปลี่ยน');
  return out;
}

export function mergeZegoImport(
  prev: ZegoMergeInput | null,
  next: ZegoMergeInput,
  opts: { fullScope: boolean; now: string },
): { programs: ZegoProgram[]; periods: ZegoPeriod[]; summary: ZegoMergeSummary } {
  const prevPeriods = prev?.periods ?? [];
  const prevPrograms = prev?.programs ?? [];
  const prevById = new Map(prevPeriods.map((p) => [p.id, p]));
  const prevByKey = new Map<string, ZegoPeriod>();
  for (const p of prevPeriods) { const k = keyOf(p); if (k && !prevByKey.has(k)) prevByKey.set(k, p); }

  const prevFlights = new Map(prevPrograms.map((p) => [p.programCode, flightSig(p.flights)]));
  const nextFlights = new Map(next.programs.map((p) => [p.programCode, flightSig(p.flights)]));

  // ผูก id เดิมกลับ — เฉพาะเมื่อ id เดิมนั้นไม่ได้ถูกส่งมาในรอบนี้อยู่แล้ว (กันชนกัน)
  const fetchedIds = new Set(next.periods.map((p) => p.id));
  const usedOld = new Set<string>();
  let reIdentified = 0;
  const incoming = next.periods.map((p) => {
    if (prevById.has(p.id)) return p;
    const old = prevByKey.get(keyOf(p));
    if (old && !fetchedIds.has(old.id) && !usedOld.has(old.id)) {
      usedOld.add(old.id);
      reIdentified += 1;
      return { ...p, id: old.id };
    }
    return p;
  });

  const added: string[] = [];
  const restored: string[] = [];
  const changed: ZegoPeriodChange[] = [];
  const periods: ZegoPeriod[] = [];
  const nextIds = new Set<string>();
  for (const p of incoming) {
    nextIds.add(p.id);
    const old = prevById.get(p.id);
    const { missingSince: _drop, ...clean } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
    periods.push(clean);
    if (!old) { added.push(p.id); continue; }
    if (old.missingSince) restored.push(p.id);
    const details = periodChangeDetails(old, p, prevFlights.get(old.programCode) ?? '', nextFlights.get(p.programCode) ?? '');
    if (details.length) changed.push({ id: p.id, groupCode: p.groupCode || old.groupCode, startDate: p.startDate, details });
  }

  const fetchedPrograms = new Set(next.programs.map((p) => p.programCode));
  const missing: string[] = [];
  let keptOutOfScope = 0;
  for (const p of prevPeriods) {
    if (nextIds.has(p.id)) continue;
    const inScope = opts.fullScope || fetchedPrograms.has(p.programCode);
    if (!inScope) { periods.push(p); keptOutOfScope += 1; continue; }
    if (!p.missingSince) missing.push(p.id);
    periods.push({ ...p, missingSince: p.missingSince ?? opts.now });
  }

  // โปรแกรม: ชุดใหม่ + โปรแกรมเดิมที่ยังมีพีเรียดอ้างอยู่
  const usedPrograms = new Set(periods.map((p) => p.programCode));
  const programs = [
    ...next.programs,
    ...prevPrograms.filter((p) => !fetchedPrograms.has(p.programCode) && usedPrograms.has(p.programCode)),
  ];

  return {
    programs,
    periods,
    summary: {
      at: opts.now,
      fullScope: opts.fullScope,
      fetched: next.periods.length,
      added,
      changed,
      missing,
      restored,
      missingTotal: periods.filter((p) => p.missingSince).length,
      keptOutOfScope,
      reIdentified,
    },
  };
}
