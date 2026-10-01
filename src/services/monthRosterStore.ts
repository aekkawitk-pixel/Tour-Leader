/**
 * Month Roster Store (§14/§15) — รายชื่อหัวหน้าทัวร์ที่ผู้จัดเลือกให้แสดงในหน้า Schedule รายเดือน
 *
 * ⚠️ มีผลเฉพาะการแสดงผล — ไม่แตะ Master/สถานะหัวหน้าทัวร์/งาน/วันลา (§9/§10)
 * เก็บใน localStorage แยกตามเดือน (schedule_month_rosters) · unique = year+month+tourLeaderId (§14)
 * เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

export type RosterSourceType = 'manual' | 'copied_previous_month' | 'suggested' | 'assigned_job' | 'temporary';

/** 1 รายการในรายชื่อประจำเดือน */
export interface RosterEntry {
  tourLeaderId: string;
  displayOrder: number;
  sourceType: RosterSourceType;
  isPinned: boolean;
  addedBy: string;
  addedAt: string;
}

/** ประวัติการแก้ไขรายชื่อ (§15) */
export interface RosterHistoryEntry {
  monthKey: string;
  action: 'ADD' | 'REMOVE' | 'COPY' | 'REORDER' | 'ADD_FROM_ASSIGN' | 'ADD_TEMPORARY' | 'PROMOTE_TEMPORARY' | 'SUGGEST' | 'SAVE';
  tourLeaderId?: string;
  detail?: string;
  by: string;
  at: string;
}

const KEY = 'scheduleMonthRosters';
const HISTORY_KEY = 'scheduleRosterHistory';

function canUseStorage(): boolean {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

/** คีย์เดือนจากวันที่ ISO (yyyy-mm-dd) → "yyyy-mm" */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function yearMonthOf(monthKey: string): { year: number; month: number } {
  return { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) };
}

/** เดือนก่อนหน้า (คีย์) */
export function previousMonthKey(monthKey: string): string {
  const { year, month } = yearMonthOf(monthKey);
  const d = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return `${d.y}-${String(d.m).padStart(2, '0')}`;
}

/** เดือนถัดไป (คีย์) */
export function nextMonthKey(monthKey: string): string {
  const { year, month } = yearMonthOf(monthKey);
  const d = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return `${d.y}-${String(d.m).padStart(2, '0')}`;
}

function loadAll(): Record<string, RosterEntry[]> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RosterEntry[]>) : {};
  } catch { return {}; }
}

function saveAll(map: Record<string, RosterEntry[]>): void {
  if (!canUseStorage()) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* โควตาเต็ม — ไม่ทำให้ UI ล้ม */ }
}

/** มีการกำหนดรายชื่อของเดือนนี้แล้วหรือยัง (§10) */
export function hasRoster(monthKey: string): boolean {
  return (loadAll()[monthKey] ?? []).length > 0;
}

/** รายการของเดือน — เรียงตาม displayOrder */
export function getRosterEntries(monthKey: string): RosterEntry[] {
  return [...(loadAll()[monthKey] ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** เฉพาะ id (เรียงตามลำดับ) */
export function getRosterIds(monthKey: string): string[] {
  return getRosterEntries(monthKey).map((e) => e.tourLeaderId);
}

/* --------------------------------- ประวัติ -------------------------------- */

function loadHistory(): RosterHistoryEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RosterHistoryEntry[]) : [];
  } catch { return []; }
}

function logHistory(entry: RosterHistoryEntry): void {
  if (!canUseStorage()) return;
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify([...loadHistory(), entry].slice(-500))); } catch { /* ignore */ }
}

export function getRosterHistory(monthKey: string): RosterHistoryEntry[] {
  return loadHistory().filter((h) => h.monthKey === monthKey);
}

/* -------------------------------- เขียนข้อมูล ------------------------------ */

/** ผลการอัปเดตรายชื่อแบบเฉพาะส่วน (§4) */
export interface RosterSaveResult {
  entries: RosterEntry[];
  added: string[];   // เพิ่มใหม่
  kept: string[];    // คงเดิม (ไม่ถูกแก้ไข metadata)
  removed: string[]; // นำออก
}

/**
 * อัปเดตรายชื่อของเดือนแบบ Incremental (§4/§5) — ไม่ลบทั้งชุดแล้วสร้างใหม่
 *   • คงเดิม: ใช้ entry เดิม (addedAt/addedBy/sourceType/isPinned เดิม) แก้เฉพาะ displayOrder ตามลำดับใหม่
 *   • เพิ่มใหม่: Insert เฉพาะคนที่ยังไม่มี (unique = year+month+tourLeaderId §5)
 *   • นำออก: ลบเฉพาะ Monthly Roster Record ของคนที่ยกเลิกการเลือก (ไม่แตะ Master/งาน/วันลา §5)
 * บันทึกประวัติแยกราย ADD/REMOVE เพื่อไม่ให้ประวัติ/ลำดับ/ข้อมูลเชื่อมโยงสูญหาย
 */
export function saveRoster(
  monthKey: string,
  ids: string[],
  opts: { by: string; at: string; sourceType?: Record<string, RosterSourceType>; pinned?: Set<string> },
): RosterSaveResult {
  const map = loadAll();
  const prev = new Map((map[monthKey] ?? []).map((e) => [e.tourLeaderId, e]));

  // unique ตามลำดับที่ส่งมา (§5 กันซ้ำในเดือนเดียวกัน)
  const seen = new Set<string>();
  const nextIds: string[] = [];
  for (const id of ids) { if (!seen.has(id)) { seen.add(id); nextIds.push(id); } }
  const nextSet = new Set(nextIds);

  const added: string[] = [];
  const kept: string[] = [];
  const entries: RosterEntry[] = nextIds.map((id, i) => {
    const existing = prev.get(id);
    if (existing) {
      kept.push(id);
      // คงเดิม — แก้เฉพาะลำดับ (ไม่ทับ addedAt/addedBy/sourceType/isPinned)
      return { ...existing, displayOrder: i };
    }
    added.push(id);
    return {
      tourLeaderId: id,
      displayOrder: i,
      sourceType: opts.sourceType?.[id] ?? 'manual',
      isPinned: opts.pinned?.has(id) ?? false,
      addedBy: opts.by,
      addedAt: opts.at,
    };
  });
  const removed = [...prev.keys()].filter((id) => !nextSet.has(id));

  map[monthKey] = entries;
  saveAll(map);
  // ประวัติแยกราย (§4) — เพิ่ม/นำออกเฉพาะส่วนที่เปลี่ยน
  for (const id of removed) logHistory({ monthKey, action: 'REMOVE', tourLeaderId: id, by: opts.by, at: opts.at });
  for (const id of added) logHistory({ monthKey, action: 'ADD', tourLeaderId: id, by: opts.by, at: opts.at });
  logHistory({ monthKey, action: 'SAVE', detail: `เพิ่มใหม่ ${added.length} · คงเดิม ${kept.length} · นำออก ${removed.length}`, by: opts.by, at: opts.at });
  return { entries, added, kept, removed };
}

/** เพิ่ม 1 คน (ไม่ซ้ำ) — คืน entries ล่าสุด (§6/§7/§8) */
export function addToRoster(
  monthKey: string, tourLeaderId: string, sourceType: RosterSourceType,
  opts: { by: string; at: string },
): RosterEntry[] {
  const map = loadAll();
  const list = map[monthKey] ?? [];
  if (list.some((e) => e.tourLeaderId === tourLeaderId)) return getRosterEntries(monthKey); // มีแล้ว ไม่ซ้ำ
  const nextOrder = list.reduce((m, e) => Math.max(m, e.displayOrder), -1) + 1;
  map[monthKey] = [...list, { tourLeaderId, displayOrder: nextOrder, sourceType, isPinned: false, addedBy: opts.by, addedAt: opts.at }];
  saveAll(map);
  const action = sourceType === 'assigned_job' ? 'ADD_FROM_ASSIGN' : sourceType === 'temporary' ? 'ADD_TEMPORARY' : 'ADD';
  logHistory({ monthKey, action, tourLeaderId, by: opts.by, at: opts.at });
  return getRosterEntries(monthKey);
}

/** นำ 1 คนออก — ไม่ลบงาน/วันลา/สถานะ (§9) */
export function removeFromRoster(monthKey: string, tourLeaderId: string, opts: { by: string; at: string }): RosterEntry[] {
  const map = loadAll();
  map[monthKey] = (map[monthKey] ?? []).filter((e) => e.tourLeaderId !== tourLeaderId);
  saveAll(map);
  logHistory({ monthKey, action: 'REMOVE', tourLeaderId, by: opts.by, at: opts.at });
  return getRosterEntries(monthKey);
}

/** จัดลำดับใหม่ (§8) */
export function reorderRoster(monthKey: string, orderedIds: string[], opts: { by: string; at: string }): RosterEntry[] {
  const map = loadAll();
  const byId = new Map((map[monthKey] ?? []).map((e) => [e.tourLeaderId, e]));
  const entries: RosterEntry[] = [];
  orderedIds.forEach((id, i) => { const e = byId.get(id); if (e) entries.push({ ...e, displayOrder: i }); });
  map[monthKey] = entries;
  saveAll(map);
  logHistory({ monthKey, action: 'REORDER', detail: `จัดลำดับ ${entries.length} คน`, by: opts.by, at: opts.at });
  return getRosterEntries(monthKey);
}

/** คัดลอกจากเดือนอื่น (§4) — โหมด replace/merge · คืน entries ล่าสุด */
export function copyRosterFrom(
  srcMonthKey: string, destMonthKey: string,
  mode: 'replace' | 'merge', idsToCopy: string[],
  opts: { by: string; at: string },
): RosterEntry[] {
  const map = loadAll();
  const dest = map[destMonthKey] ?? [];
  const destIds = mode === 'replace' ? [] : dest.map((e) => e.tourLeaderId);
  const merged: string[] = [...destIds];
  for (const id of idsToCopy) if (!merged.includes(id)) merged.push(id);

  const prev = new Map(dest.map((e) => [e.tourLeaderId, e]));
  map[destMonthKey] = merged.map((id, i) => {
    const existing = prev.get(id);
    return {
      tourLeaderId: id,
      displayOrder: i,
      sourceType: existing?.sourceType ?? 'copied_previous_month',
      isPinned: existing?.isPinned ?? false,
      addedBy: existing?.addedBy ?? opts.by,
      addedAt: existing?.addedAt ?? opts.at,
    };
  });
  saveAll(map);
  logHistory({ monthKey: destMonthKey, action: 'COPY', detail: `คัดลอกจาก ${srcMonthKey} (${mode === 'replace' ? 'แทนที่' : 'เพิ่มเฉพาะที่ยังไม่มี'}) ${idsToCopy.length} คน`, by: opts.by, at: opts.at });
  return getRosterEntries(destMonthKey);
}
