/**
 * ซองเงินตามเอกสารเบิกค่าใช้จ่ายกรุ๊ป — ตรรกะล้วน (ทดสอบได้ตรง ๆ)
 *
 * หลักการถือเงิน: การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → (ส่งให้แลนด์ต่างประเทศ | ใช้ตามรายการ)
 * บัญชีบันทึกเอกสารเบิกแล้ว → การเงินจัดเงินใส่ซองทีละรายการ → เขียนยอดหน้าซอง → ส่งมอบให้เจ้าหน้าที่ส่งกรุ๊ป
 * (หรือหัวหน้าทัวร์มารับเองเป็นกรณียกเว้น) → หัวหน้าทัวร์ยืนยันรับในแอป → ผู้รับไม่เปิดนับจนกว่าจะใช้
 * หัวหน้าทัวร์ใช้เงินในซอง 2 ทาง: ส่งให้แลนด์ต่างประเทศ (บันทึกที่นี่ landPayments) หรือจ่ายตามรายการ
 * (บันทึกใบเสร็จตามปกติ) → ยอดคงเหลือ = ยอดหน้าซอง − ส่งแลนด์ − ใช้ตามใบเสร็จ แยกสกุลเงิน
 *
 * ซองเป็นของ "กรุ๊ป" ไม่ผูกกับเอกสารใบเดียว:
 * - กรุ๊ปมีเอกสารเบิกหลายใบ → รวมทุกใบไว้ในซองเดียวได้
 * - หรือแยกหลายซองตามค่าใช้จ่ายที่ถือไป (เช่น ซองค่าแลนด์ / ซองทิป) — 1 รายการเบิกอยู่ได้ซองเดียว
 * รายการในซองอ้างด้วย lineKey = "<เลข Ref>::<id บรรทัด>" (id บรรทัดซ้ำกันข้ามเอกสารได้)
 *
 * จึงไม่มีขั้น "นับซ้ำ" — ใช้ "ยอดหน้าซอง" (รวมรายการในซองตอนปิดซอง) เป็นยอดอ้างอิงเดียวของทุกฝ่าย
 * ถ้าหัวหน้าทัวร์เปิดใช้แล้วยอดไม่ตรง แจ้งกลับในแอปได้ (mismatch) การเงินเห็นทันที
 */

export interface EnvelopeAmount {
  amount: number;
  currency: string;
}

export interface EnvelopeHistoryEntry {
  at: string; // ISO datetime (เวลาจริง)
  byName: string;
  action: string;
  note?: string;
  /** รูปหลักฐานของทอดนี้ (data URL) — เก็บจริงใน IndexedDB · ดูได้จาก Timeline */
  photo?: string;
}

export type EnvelopeReceiverKind = 'leader' | 'staff' | 'other';

export interface CashEnvelope {
  id: string;
  /** กรุ๊ป (TourPeriodMaster.internalId) */
  periodId: string;
  /** ลำดับซองในกรุ๊ป (ซอง 1, ซอง 2, …) */
  no: number;
  /** ชื่อซอง (ไม่บังคับ) เช่น "ค่าแลนด์", "ทิปไกด์/คนขับ" */
  label?: string;
  /** รายการเบิกที่ใส่ซองนี้ — lineKey(เลข Ref, id บรรทัด) */
  packedLineIds: string[];
  /** ข้อมูลเดิม (1 เอกสาร = 1 ซอง) — ใช้แปลงข้อมูลเก่าเท่านั้น */
  advanceDocId?: string;
  /** ปิดซอง — ยอดหน้าซองคือยอดที่เขียนบนซองจริง และ snapshot รายการ ณ ตอนปิด (ไว้จับว่าเอกสารถูกแก้ทีหลัง) */
  sealed?: {
    at: string;
    byName: string;
    faceTotals: EnvelopeAmount[];
    lineSnapshot: { id: string; amount: number; currency: string }[];
  };
  /** ส่งมอบจากการเงิน — ผู้รับ + ลายเซ็น + รูปผู้รับคู่ซอง */
  handover?: {
    at: string;
    byName: string;
    receiverKind: EnvelopeReceiverKind;
    receiverId?: string;
    /** ผู้รับที่ระบุไว้ (เจ้าหน้าที่ส่งกรุ๊ปที่จัดให้กรุ๊ป / หัวหน้าทัวร์ของกรุ๊ป) */
    receiverName: string;
    /** คนที่มารับซองจริง เมื่อไม่ใช่ผู้รับที่ระบุไว้ (รับแทน) */
    proxyName?: string;
    /** ผู้รับแทนเป็นเจ้าหน้าที่ส่งกรุ๊ป (SOS-xxx) — ต้องยืนยันรับในพอร์ทัล /staff ของตัวเอง */
    proxyStaffId?: string;
    /** หลักฐานการรับ — อย่างใดอย่างหนึ่ง: เซ็นชื่อบนจอ หรือ ถ่ายรูปผู้รับคู่ซอง */
    proof?: 'signature' | 'photo';
    /** data URL — เก็บจริงใน IndexedDB (ดู cashEnvelopeStore) */
    signature?: string;
    photo?: string;
  };
  /*
    ทุกทอดของการรับส่งซองต้องแนบรูปถ่ายเป็นหลักฐาน (photo = data URL ย่อแล้ว) — เก็บจริงใน IndexedDB (ดู cashEnvelopeStore)
    ข้อมูลที่บันทึกก่อนมีกติกานี้ไม่มีรูป จึงยังเป็น optional ในชนิดข้อมูล แต่หน้าจอบังคับแนบทุกครั้งที่กดยืนยันใหม่
  */
  /** เจ้าหน้าที่ส่งกรุ๊ป (ผู้รับแทน) กดยืนยันรับซองจากการเงินในเครื่องของตัวเอง */
  staffAck?: { at: string; staffId: string; staffName: string; photo?: string };
  /** เจ้าหน้าที่ส่งกรุ๊ปกดว่าส่งต่อให้หัวหน้าทัวร์แล้ว — รอหัวหน้าทัวร์ยืนยันรับ */
  staffHandoff?: { at: string; staffName: string; photo?: string };
  /**
   * เจ้าหน้าที่ส่งกรุ๊ปติดปัญหาหน้างาน ส่งซองคืนการเงิน — ยังไม่ถือว่าคืนจนกว่าการเงินกดยืนยันรับซองคืน
   * (เงินยังอยู่ระหว่างทาง ห้ามล้างการส่งมอบทิ้งฝ่ายเดียว) การเงินยืนยันแล้วซองกลับไปเป็น "รอส่งมอบ"
   */
  staffReturn?: { at: string; staffId: string; staffName: string; reason: string; photo?: string };
  /**
   * การส่งคืนครั้งล่าสุดที่การเงินยืนยันรับแล้ว — เก็บไว้ให้เจ้าหน้าที่คนที่คืนเห็นสถานะจริง "ส่งคืนการเงินแล้ว"
   * (หลังยืนยัน ซองกลับเป็นรอส่งมอบ ถ้าไม่เก็บไว้ ฝั่งเจ้าหน้าที่จะเห็นแค่ "รอส่งมอบ" เหมือนยังไม่เคยรับซอง)
   * photo = รูปตอนเจ้าหน้าที่ส่งคืน · receivedPhoto = รูปตอนการเงินรับคืน
   */
  lastReturn?: { at: string; staffId: string; staffName: string; reason: string; receivedAt: string; photo?: string; receivedPhoto?: string };
  /** หัวหน้าทัวร์กดยืนยันรับซองในแอป (รับเองจากการเงิน หรือรับต่อจากเจ้าหน้าที่ส่งกรุ๊ป) */
  leaderAck?: { at: string; leaderId: string; leaderName: string; fromStaffName?: string; photo?: string };
  /** หัวหน้าทัวร์เปิดใช้แล้วยอดในซองไม่ตรงยอดหน้าซอง */
  mismatch?: { at: string; byName: string; note: string };
  /** หัวหน้าทัวร์ส่งเงินจากซองให้แลนด์ต่างประเทศ (ทีละครั้ง) — ยอดแยกสกุลเงิน + หลักฐาน */
  landPayments?: LandPayment[];
  history: EnvelopeHistoryEntry[];
}

export interface LandPayment {
  id: string;
  at: string;
  byName: string;
  landName: string;
  amount: number;
  currency: string;
  note?: string;
  /** รูปใบรับเงิน/หลักฐานจากแลนด์ (data URL ย่อแล้ว) */
  evidenceImage?: string;
}

export type EnvelopeStage = 'packing' | 'sealed' | 'handed_over' | 'received';
export type EnvelopeTone = 'slate' | 'amber' | 'blue' | 'violet' | 'green' | 'red';

const STAGE_ORDER: EnvelopeStage[] = ['packing', 'sealed', 'handed_over', 'received'];

export function envelopeStage(env: CashEnvelope | undefined): EnvelopeStage {
  if (!env?.sealed) return 'packing';
  if (!env.handover) return 'sealed';
  if (!env.leaderAck) return 'handed_over';
  return 'received';
}

/** ข้อความสถานะของซองใบเดียว + โทนสี — ใช้ทั้งฝั่งการเงินและหัวหน้าทัวร์ */
export function envelopeStatusLabel(env: CashEnvelope | undefined): { label: string; tone: EnvelopeTone } {
  if (env?.mismatch) return { label: 'แจ้งยอดในซองไม่ตรง', tone: 'red' };
  switch (envelopeStage(env)) {
    case 'packing':
      return env && env.packedLineIds.length > 0 ? { label: 'กำลังจัดซอง', tone: 'amber' } : { label: 'รอจัดซอง', tone: 'slate' };
    case 'sealed':
      return { label: 'จัดซองแล้ว รอส่งมอบ', tone: 'blue' };
    case 'handed_over':
      if (env!.staffReturn) return { label: 'เจ้าหน้าที่ส่งคืนการเงิน รอการเงินยืนยันรับ', tone: 'amber' };
      if (env!.handover!.proxyStaffId && !env!.staffAck) return { label: 'รอเจ้าหน้าที่ส่งกรุ๊ปยืนยันรับ', tone: 'violet' };
      if (env!.staffAck && !env!.staffHandoff) return { label: 'เจ้าหน้าที่ส่งกรุ๊ปถือซอง รอส่งหัวหน้าทัวร์', tone: 'violet' };
      if (env!.staffHandoff) return { label: 'ส่งต่อให้หัวหน้าทัวร์แล้ว รอยืนยันรับ', tone: 'violet' };
      return env!.handover!.receiverKind === 'staff' || env!.handover!.proxyName
        ? { label: 'ฝากผู้รับแทน รอหัวหน้าทัวร์ยืนยันรับ', tone: 'violet' }
        : { label: 'ส่งมอบแล้ว รอหัวหน้าทัวร์ยืนยัน', tone: 'violet' };
    case 'received':
      return { label: 'หัวหน้าทัวร์รับซองแล้ว', tone: 'green' };
  }
}

const SHORT: Record<EnvelopeStage, string> = {
  packing: 'รอจัด',
  sealed: 'รอส่งมอบ',
  handed_over: 'รอหัวหน้าทัวร์รับ',
  received: 'หัวหน้าทัวร์รับแล้ว',
};

/** สถานะแบบสั้นของซองใบเดียว (โทนเดียวกับ envelopeStatusLabel) */
export function envelopeShortLabel(env: CashEnvelope | undefined): { label: string; tone: EnvelopeTone } {
  const { tone } = envelopeStatusLabel(env);
  if (env?.mismatch) return { label: 'ยอดไม่ตรง', tone };
  const stage = envelopeStage(env);
  if (stage === 'packing' && env && env.packedLineIds.length > 0) return { label: 'กำลังจัด', tone };
  if (stage === 'handed_over' && env!.staffReturn) return { label: 'ส่งคืนการเงิน', tone };
  if (stage === 'handed_over' && env!.handover!.proxyStaffId && !env!.staffAck) return { label: 'รอเจ้าหน้าที่ส่งกรุ๊ปรับ', tone };
  if (stage === 'handed_over' && env!.staffAck && !env!.staffHandoff) return { label: 'เจ้าหน้าที่ส่งกรุ๊ปถือซอง', tone };
  return { label: SHORT[stage], tone };
}

/**
 * ผู้รับซองสำหรับแสดง
 * - ส่งให้หัวหน้าทัวร์: "ชัยมงคล" / "ชัยมงคล (รับแทนโดย สมศักดิ์)"
 * - ฝากเจ้าหน้าที่ส่งกรุ๊ป: "เจ้าหน้าที่ส่งกรุ๊ป ธนกฤต → นำส่ง ชัยมงคล"
 */
export const handoverReceiverText = (
  h: Pick<NonNullable<CashEnvelope['handover']>, 'receiverName' | 'proxyName'> & Partial<Pick<NonNullable<CashEnvelope['handover']>, 'receiverKind' | 'proxyStaffId'>>,
) =>
  h.receiverKind === 'staff' && h.proxyStaffId && h.proxyName
    ? `เจ้าหน้าที่ส่งกรุ๊ป ${h.proxyName} → นำส่ง ${h.receiverName}`
    : `${h.receiverName}${h.proxyName ? ` (รับแทนโดย ${h.proxyName})` : ''}`;

/**
 * ซองนี้ถูกเจ้าหน้าที่คนนี้ส่งคืนการเงิน และการเงินรับคืนแล้ว (ยังไม่ได้ส่งมอบใหม่) หรือไม่
 * อ่านจาก lastReturn ก่อน · ข้อมูลที่คืนก่อนมีฟิลด์นี้ ไล่จากประวัติแทน (ประวัติเรียงเก่า → ใหม่ และเก็บชื่อคนกด)
 */
export function returnedToFinanceBy(
  env: CashEnvelope,
  staff: { id: string; name: string },
): { at: string; receivedAt: string; reason: string } | null {
  if (env.handover) return null; // ส่งมอบใหม่ไปแล้ว — ไม่ใช่สถานะ "คืนแล้ว" อีกต่อไป
  if (env.lastReturn) {
    return env.lastReturn.staffId === staff.id
      ? { at: env.lastReturn.at, receivedAt: env.lastReturn.receivedAt, reason: env.lastReturn.reason }
      : null;
  }
  const iReceived = env.history.map((h) => h.action).lastIndexOf('การเงินรับซองคืน');
  if (iReceived < 0) return null;
  const sent = env.history.slice(0, iReceived).reverse().find((h) => h.action === 'เจ้าหน้าที่ส่งกรุ๊ปส่งซองคืนการเงิน');
  if (!sent || sent.byName !== staff.name) return null;
  const reason = sent.note?.match(/เหตุผล: (.*?)(?: · |$)/)?.[1] ?? '';
  return { at: sent.at, receivedAt: env.history[iReceived].at, reason };
}

/** ชื่อซองสำหรับแสดง เช่น "ซอง 2 · ค่าแลนด์" */
export const envelopeName = (env: Pick<CashEnvelope, 'no' | 'label'>) => `ซอง ${env.no}${env.label ? ` · ${env.label}` : ''}`;

/** เหตุการณ์ใน Timeline ของกรุ๊ป (แบบติดตามพัสดุ) — ใหม่สุดอยู่บน */
export interface EnvelopeEvent {
  at: string;
  title: string;
  /** ชื่อซอง เช่น "ซอง 1 · ค่าเข้าชม" */
  envName: string;
  /** รายละเอียดแยกเป็นบรรทัด (ตัดชื่อซองที่ขึ้นต้นโน้ตออกแล้ว) */
  details: string[];
  byName: string;
  envelopeId: string;
  /** รูปหลักฐานของทอดนี้ (ถ้ามี) — กดดูได้ใน Timeline */
  photo?: string;
}

/**
 * รูปหลักฐานของแต่ละทอดที่เก็บไว้บนตัวซอง (ก่อนมีรูปในรายการประวัติ) — ใช้เป็นตัวสำรองให้ข้อมูลเดิม
 * ฟิลด์เหล่านี้ถูกเขียนทับเมื่อทำทอดเดิมซ้ำ จึงผูกได้กับ "รายการล่าสุด" ของ action นั้นเท่านั้น
 */
function fallbackPhoto(e: CashEnvelope, action: string): string | undefined {
  switch (action) {
    case 'เจ้าหน้าที่ส่งกรุ๊ปยืนยันรับซอง': return e.staffAck?.photo;
    case 'เจ้าหน้าที่ส่งกรุ๊ปส่งต่อให้หัวหน้าทัวร์':
    case 'เจ้าหน้าที่ส่งกรุ๊ปส่งต่อให้ผู้รับคนอื่น': return e.staffHandoff?.photo;
    case 'หัวหน้าทัวร์ยืนยันรับซอง': return e.leaderAck?.photo;
    case 'เจ้าหน้าที่ส่งกรุ๊ปส่งซองคืนการเงิน': return e.staffReturn?.photo ?? e.lastReturn?.photo;
    case 'การเงินรับซองคืน': return e.lastReturn?.receivedPhoto;
    default: return undefined;
  }
}

/** รวมประวัติของทุกซองในกรุ๊ปเป็น Timeline เดียว เรียงใหม่ → เก่า (เวลาเท่ากัน: บันทึกทีหลังอยู่บน) */
export function envelopeTimeline(envs: CashEnvelope[]): EnvelopeEvent[] {
  const rows = envs.flatMap((e) =>
    e.history.map((h, i) => {
      const isLatestOfAction = e.history.findLastIndex((x) => x.action === h.action) === i;
      const photo = h.photo ?? (isLatestOfAction ? fallbackPhoto(e, h.action) : undefined);
      const envName = envelopeName(e);
      let note = h.note ?? '';
      // โน้ตส่วนใหญ่ขึ้นต้นด้วยชื่อซอง — แสดงชื่อซองแยกเป็นป้ายแล้ว จึงตัดออก
      for (const prefix of [envName, `ซอง ${e.no}`]) {
        if (note === prefix) { note = ''; break; }
        if (note.startsWith(`${prefix} · `)) { note = note.slice(prefix.length + 3); break; }
      }
      const details = note ? note.split(' · ').map((x) => x.trim()).filter(Boolean) : [];
      return { at: h.at, title: h.action, envName, details, byName: h.byName, envelopeId: e.id, seq: i, ...(photo ? { photo } : {}) };
    }),
  );
  rows.sort((a, b) => b.at.localeCompare(a.at) || b.seq - a.seq);
  return rows.map(({ seq: _seq, ...ev }) => (void _seq, ev));
}

/** รวมยอดแยกสกุลเงิน (ไม่บวกข้ามสกุล) — เรียงตามลำดับที่พบ */
export function sumAmounts(items: EnvelopeAmount[]): EnvelopeAmount[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.currency, (m.get(it.currency) ?? 0) + it.amount);
  return [...m].map(([currency, amount]) => ({ currency, amount }));
}

/** รายการเบิกหนึ่งบรรทัดของกรุ๊ป — id = lineKey */
export interface GroupLine {
  id: string;
  amount: number;
  currency: string;
}

export const lineKey = (docId: string, lineId: string) => `${docId}::${lineId}`;
export const docIdOfLineKey = (key: string) => key.split('::')[0];

/** รายการเบิกทุกใบของกรุ๊ปรวมเป็นชุดเดียว (id = lineKey) */
export function groupLines(docs: { id: string; lines: { id: string; amount: number; currency: string }[] }[]): GroupLine[] {
  return docs.flatMap((d) => d.lines.map((l) => ({ id: lineKey(d.id, l.id), amount: l.amount, currency: l.currency })));
}

/** ยอดที่ต้องจัดทั้งหมด และยอดของรายการที่เลือก */
export function envelopeTotals(lines: GroupLine[], packedLineIds: string[]): { required: EnvelopeAmount[]; packed: EnvelopeAmount[] } {
  const packed = new Set(packedLineIds);
  return {
    required: sumAmounts(lines),
    packed: sumAmounts(lines.filter((l) => packed.has(l.id))),
  };
}

/** ปิดซองได้เมื่อมีรายการในซองอย่างน้อย 1 รายการ และทุกรายการยังอยู่ในเอกสาร */
export function canSeal(lines: GroupLine[], packedLineIds: string[]): boolean {
  const have = new Set(lines.map((l) => l.id));
  return packedLineIds.length > 0 && packedLineIds.every((k) => have.has(k));
}

/** เจ้าของรายการ: lineKey → id ซอง (1 รายการอยู่ได้ซองเดียว) */
export function lineOwners(envs: Pick<CashEnvelope, 'id' | 'packedLineIds'>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of envs) for (const k of e.packedLineIds) if (!m.has(k)) m.set(k, e.id);
  return m;
}

/** รายการเบิกที่ยังไม่ได้ใส่ซองใดเลย */
export function unassignedLines(lines: GroupLine[], envs: Pick<CashEnvelope, 'id' | 'packedLineIds'>[]): GroupLine[] {
  const owners = lineOwners(envs);
  return lines.filter((l) => !owners.has(l.id));
}

/**
 * เอกสารเบิกถูกแก้หลังปิดซอง (นำเข้าฉบับแก้ไข) — รายการในซองหายไปหรือยอดเปลี่ยน
 * รายการที่เพิ่มเข้ามาใหม่ไม่นับ (จะเป็น "ยังไม่ได้จัดใส่ซอง" แทน)
 */
export function docChangedSinceSeal(env: CashEnvelope | undefined, lines: GroupLine[]): boolean {
  if (!env?.sealed) return false;
  const now = new Map(lines.map((l) => [l.id, l]));
  return env.sealed.lineSnapshot.some((s) => {
    const l = now.get(s.id);
    return !l || l.amount !== s.amount || l.currency !== s.currency;
  });
}

/** ซองใหม่ของกรุ๊ป — ลำดับถัดจากซองที่มีอยู่ */
export function newEnvelope(periodId: string, existing: Pick<CashEnvelope, 'periodId' | 'no'>[]): CashEnvelope {
  const no = Math.max(0, ...existing.filter((e) => e.periodId === periodId).map((e) => e.no)) + 1;
  return { id: `ENV-${periodId}-${no}`, periodId, no, packedLineIds: [], history: [] };
}

/** แปลงข้อมูลซองรุ่นเก่า (1 เอกสาร = 1 ซอง, id บรรทัดล้วน) ให้เป็นรูปแบบปัจจุบัน */
export function normalizeEnvelope(raw: CashEnvelope): CashEnvelope {
  const doc = raw.advanceDocId;
  const fix = (id: string) => (doc && !id.includes('::') ? lineKey(doc, id) : id);
  return {
    ...raw,
    no: raw.no ?? 1,
    packedLineIds: (raw.packedLineIds ?? []).map(fix),
    ...(raw.sealed ? { sealed: { ...raw.sealed, lineSnapshot: raw.sealed.lineSnapshot.map((l) => ({ ...l, id: fix(l.id) })) } } : {}),
  };
}

/** ส่งมอบแล้วแต่ยังไม่มีใครกดตอบรับ (เจ้าหน้าที่/หัวหน้าทัวร์) — การเงินยังแก้ไขการส่งมอบได้ */
export function canEditHandover(env: CashEnvelope): boolean {
  return !!env.handover && !env.staffAck && !env.leaderAck;
}

/** การเงินยังเข้าไปจัดการกรุ๊ปนี้ได้ไหม: ยังจัด/ส่งมอบไม่ครบ หรือมีซองที่ส่งมอบแล้วแต่ยังไม่มีผู้ตอบรับ */
export function groupManageable(lines: GroupLine[], envs: CashEnvelope[]): boolean {
  const s = groupEnvelopeStatus(lines, envs);
  return s.stage === 'packing' || s.stage === 'sealed'
    || envs.some((e) => e.packedLineIds.length > 0 && (canEditHandover(e) || (!!e.staffReturn && !e.leaderAck)));
}

/**
 * ลำดับความคืบหน้าของซอง 1 ใบ (น้อย = ช้ากว่า) — แยกทอดย่อยในขั้นส่งมอบ:
 * ฝากเจ้าหน้าที่แต่ยังไม่ยืนยันรับ < เจ้าหน้าที่ถือซอง < รอหัวหน้าทัวร์ยืนยัน
 */
export function handoverRank(env: CashEnvelope): number {
  const stage = envelopeStage(env);
  if (stage !== 'handed_over') return STAGE_ORDER.indexOf(stage) * 10;
  const base = STAGE_ORDER.indexOf('handed_over') * 10;
  // ส่งคืนการเงิน = ถอยกลับไปก่อนส่งมอบ ช้ากว่าทุกทอดในขั้นนี้
  if (env.staffReturn) return base - 1;
  if (env.handover!.proxyStaffId && !env.staffAck) return base;
  if (env.staffAck && !env.staffHandoff) return base + 1;
  return base + 2;
}

/**
 * สถานะรวมของกรุ๊ป (ทุกเอกสาร ทุกซอง) สำหรับตาราง
 * - ยังมีรายการที่ไม่อยู่ในซองที่ปิดแล้ว → รอจัด (ยังไม่มีรายการในซองเลย) / กำลังจัด
 * - จัดครบแล้ว → ขั้นของซองที่ช้าที่สุด · มีซองแจ้งยอดไม่ตรง → ยอดไม่ตรง
 */
export function groupEnvelopeStatus(
  lines: GroupLine[],
  envs: CashEnvelope[],
): { stage: EnvelopeStage; label: string; tone: EnvelopeTone; mismatch: boolean; envelopeCount: number; unassigned: number; awaiting?: string } {
  const used = envs.filter((e) => e.packedLineIds.length > 0);
  const sealedKeys = new Set(used.filter((e) => e.sealed).flatMap((e) => e.packedLineIds));
  const mismatch = used.some((e) => e.mismatch);
  const unassigned = unassignedLines(lines, used).length;
  const base = { mismatch, envelopeCount: used.length, unassigned };

  let stage: EnvelopeStage;
  let label: string;
  let tone: EnvelopeTone;
  /** ผู้ที่ต้องกดตอบรับในขั้นนี้ (เจ้าหน้าที่ส่งกรุ๊ป / หัวหน้าทัวร์) */
  let awaiting: string | undefined;
  if (lines.length === 0 || lines.some((l) => !sealedKeys.has(l.id))) {
    stage = 'packing';
    const started = used.length > 0;
    label = started ? 'กำลังจัด' : 'รอจัด';
    tone = started ? 'amber' : 'slate';
  } else {
    // ซองที่ช้าที่สุด (ละเอียดถึงทอดของเจ้าหน้าที่ส่งกรุ๊ป) เป็นตัวกำหนดสถานะของกรุ๊ป
    const slowest = used.reduce((a, b) => (handoverRank(b) < handoverRank(a) ? b : a));
    stage = envelopeStage(slowest);
    label = envelopeShortLabel({ ...slowest, mismatch: undefined }).label;
    tone = stage === 'sealed' ? 'blue' : stage === 'handed_over' ? 'violet' : 'green';
    if (stage === 'handed_over') {
      const h = slowest.handover!;
      awaiting = slowest.staffReturn
        ? `${slowest.staffReturn.staffName} ส่งคืน — รอการเงินยืนยันรับ`
        : h.proxyStaffId && !slowest.staffHandoff ? h.proxyName : h.receiverName;
    }
  }
  if (mismatch) return { ...base, stage, label: 'ยอดไม่ตรง', tone: 'red' };
  return { ...base, stage, label, tone, ...(awaiting ? { awaiting } : {}) };
}

/**
 * ยอดคงเหลือ แยกสกุลเงิน = ยอดหน้าซอง − ส่งแลนด์ − ใช้ตามใบเสร็จ
 * spent = ยอดใบเสร็จของกรุ๊ปที่หัวหน้าทัวร์บันทึก (ผู้เรียกคัดใบที่ยกเลิก/ไม่อนุมัติออกแล้ว)
 * สกุลเงินที่ใช้แต่ไม่อยู่ในหน้าซอง (เช่น จ่ายบาทจากเงินตัวเอง) แสดงเป็นติดลบ ให้ตรวจตอนเคลียร์
 */
export function envelopeBalance(
  face: EnvelopeAmount[],
  land: EnvelopeAmount[],
  spent: EnvelopeAmount[],
): { currency: string; face: number; land: number; spent: number; remaining: number }[] {
  const cur = [...new Set([...face, ...land, ...spent].map((a) => a.currency))];
  const pick = (list: EnvelopeAmount[], c: string) => list.filter((a) => a.currency === c).reduce((s, a) => s + a.amount, 0);
  return cur.map((c) => {
    const f = pick(face, c);
    const l = pick(land, c);
    const sp = pick(spent, c);
    return { currency: c, face: f, land: l, spent: sp, remaining: f - l - sp };
  });
}
