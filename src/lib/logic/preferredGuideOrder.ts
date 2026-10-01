/**
 * ลำดับไกด์ที่ต้องการ (ต่อผู้ใช้) — ตรรกะล้วน ไม่แตะเบราว์เซอร์/เครือข่าย — ทดสอบได้ตรง ๆ
 *
 * พนักงานแต่ละคนมีประสบการณ์ทำงานกับไกด์ต่างกัน จึงจัดลำดับไกด์ที่อยากใช้ก่อน-หลังของตัวเองได้
 * (ดู usePreferredGuideOrder + services/preferredGuideOrderStore สำหรับการอ่าน/บันทึกจริง)
 * ตอนเลือกไกด์ลงงาน นำลำดับนี้มาเป็นเกณฑ์เรียงหลัก — คนที่ยังไม่เคยจัดอันดับคงตำแหน่งสัมพัทธ์เดิมไว้ท้ายแถว
 */

/** เรียง items ตามลำดับที่ผู้ใช้จัดไว้ (order) — ไม่อยู่ใน order คงตำแหน่งสัมพัทธ์เดิม (stable sort) ไว้ท้ายแถว */
export function sortByPreferredOrder<T>(
  items: T[],
  order: string[],
  getId: (item: T) => string,
): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(getId(a));
    const rb = rank.get(getId(b));
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

/**
 * เรียง items โดยให้ไกด์ที่ผู้ใช้ "ปักดาว" ไว้ขึ้นก่อนเสมอ (เร็วกว่าการจัดลำดับละเอียด — กดดาวจากรายชื่อได้เลย)
 * ภายในกลุ่มดาว/ไม่ดาว เรียงตาม order (Preferred Guide List) ต่อ — รวมสองกลไกเป็นเกณฑ์เดียว
 */
export function sortByPreference<T>(
  items: T[],
  favorited: Set<string>,
  order: string[],
  getId: (item: T) => string,
): T[] {
  if (favorited.size === 0) return sortByPreferredOrder(items, order, getId);
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const idA = getId(a);
    const idB = getId(b);
    const favA = favorited.has(idA) ? 0 : 1;
    const favB = favorited.has(idB) ? 0 : 1;
    if (favA !== favB) return favA - favB;
    const ra = rank.get(idA);
    const rb = rank.get(idB);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

/**
 * ลำดับเต็มสำหรับแสดงในหน้าจัดอันดับ — รวมไกด์ที่ยังไม่เคยจัดอันดับ (ต่อท้ายเรียงตาม baseline)
 * และตัดรหัสที่ไม่มีตัวตนแล้วออก (ถูกลบ/ปิดใช้งานออกจากระบบ)
 */
export function fullPreferredOrder(
  stored: string[],
  allIds: string[],
  baselineCompare: (a: string, b: string) => number,
): string[] {
  const known = new Set(allIds);
  const kept = stored.filter((id) => known.has(id));
  const keptSet = new Set(kept);
  const missing = allIds.filter((id) => !keptSet.has(id)).sort(baselineCompare);
  return [...kept, ...missing];
}

/** ย้าย id ไปอยู่อันดับที่ rank1 (นับจาก 1) ในลำดับเต็ม — ใช้ตอนกรอกเลขอันดับตรง ๆ แทนการลาก */
export function moveIdToRank(full: string[], id: string, rank1: number): string[] {
  const from = full.indexOf(id);
  if (from < 0) return full;
  const to = Math.min(Math.max(Math.round(rank1) - 1, 0), full.length - 1);
  if (to === from) return full;
  const next = [...full];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** รวมลำดับใหม่ของกลุ่มย่อยที่ถูกกรอง (เช่นตอนค้นหา) กลับเข้า full order — ตำแหน่งของรายการอื่นไม่ขยับ */
export function reorderWithinSubset(full: string[], subsetNewOrder: string[]): string[] {
  const subsetSet = new Set(subsetNewOrder);
  const slots: number[] = [];
  full.forEach((id, i) => {
    if (subsetSet.has(id)) slots.push(i);
  });
  const next = [...full];
  slots.forEach((slotIndex, i) => {
    next[slotIndex] = subsetNewOrder[i];
  });
  return next;
}
