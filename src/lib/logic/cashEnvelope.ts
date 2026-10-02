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
 * - หรือแยกหลายซองตามค่าใช้จ่ายที่ถือไป (เช่น ซองค่าแลนด์ / ซองทิป)
 * - 1 รายการเบิกแบ่งใส่หลายซองได้ (splits = ยอดที่ใส่แต่ละซอง) รวมกันไม่เกินยอดรายการ
 * รายการในซองอ้างด้วย lineKey = "<เลข Ref>::<id บรรทัด>" (id บรรทัดซ้ำกันข้ามเอกสารได้)
 *
 * จึงไม่มีขั้น "นับซ้ำ" — ใช้ "ยอดหน้าซอง" (รวมรายการในซองตอนปิดซอง) เป็นยอดอ้างอิงเดียวของทุกฝ่าย
 * ถ้าหัวหน้าทัวร์เปิดใช้แล้วยอดไม่ตรง แจ้งกลับในแอปได้ (mismatch) การเงินเห็นทันที
 */

/**
 * ประเภทซอง (การเงินเลือกตอนจัดซอง)
 * 1) advance  — เงิน Advance ใช้จ่ายในกรุ๊ปทัวร์
 * 2) land     — ค่า Land
 * 3) local_tip — ค่าทิปไกด์ท้องถิ่น (ในต่างประเทศ)
 * 4) land_tip — ค่า Land + ค่าทิปไกด์ท้องถิ่น กรณีฝากเงินไปกับกรุ๊ปนี้เพื่อจ่ายแลนด์ของกรุ๊ปอื่น (ระบุ forGroup)
 */
export type EnvelopeKind = 'advance' | 'land' | 'local_tip' | 'land_tip';
export const ENVELOPE_KIND_ORDER: EnvelopeKind[] = ['advance', 'land', 'local_tip', 'land_tip'];
export const ENVELOPE_KIND: Record<EnvelopeKind, { label: string; short: string; hint?: string }> = {
  advance: { label: 'เงิน Advance เพื่อใช้ในกรุ๊ปทัวร์', short: 'Advance' },
  land: { label: 'ค่า Land', short: 'ค่า Land' },
  local_tip: { label: 'ค่าทิปไกด์ท้องถิ่น (ในต่างประเทศ)', short: 'ทิปไกด์ท้องถิ่น' },
  land_tip: { label: 'ค่า Land + ค่าทิปไกด์ท้องถิ่น', short: 'ค่า Land + ทิปไกด์', hint: 'กรณีเงินฝากกรุ๊ปอื่นไปจ่ายแลนด์' },
};

/** ปิดซองได้เมื่อเลือกประเภทแล้ว (ประเภท 4 ต้องระบุกรุ๊ปปลายทางด้วย) */
export function envelopeKindReady(kind: EnvelopeKind | undefined, forGroup: string | undefined): boolean {
  if (!kind) return false;
  return kind !== 'land_tip' || Boolean(forGroup?.trim());
}

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
  /** ประเภทซอง — บังคับเลือกก่อนปิดซอง (ซองเก่าก่อนมีฟิลด์นี้ไม่มี) ดู ENVELOPE_KIND */
  kind?: EnvelopeKind;
  /** ประเภท land_tip: เงินฝากไปจ่ายแลนด์ของกรุ๊ปไหน (รหัสกรุ๊ป) */
  forGroup?: string;
  /** ชื่อซองเพิ่มเติม (ไม่บังคับ) เช่น ชื่อบริษัทแลนด์ — ต่อท้ายประเภท */
  label?: string;
  /** รายการเบิกที่ใส่ซองนี้ — lineKey(เลข Ref, id บรรทัด) */
  packedLineIds: string[];
  /**
   * แบ่งรายการเดียวไว้หลายซอง: lineKey → ยอดที่ใส่ซองนี้ (สกุลเดียวกับรายการ)
   * ไม่มีคีย์ = ใส่เต็มจำนวนของรายการ (ข้อมูลเดิมก่อนมีฟิลด์นี้)
   */
  splits?: Record<string, number>;
  /** ข้อมูลเดิม (1 เอกสาร = 1 ซอง) — ใช้แปลงข้อมูลเก่าเท่านั้น */
  advanceDocId?: string;
  /** ปิดซอง — ยอดหน้าซองคือยอดที่เขียนบนซองจริง และ snapshot รายการ ณ ตอนปิด (ไว้จับว่าเอกสารถูกแก้ทีหลัง) */
  sealed?: {
    at: string;
    byName: string;
    faceTotals: EnvelopeAmount[];
    lineSnapshot: { id: string; amount: number; currency: string }[];
  };
  /**
   * รอฝากไปกับกรุ๊ปอื่น (ยังไม่ส่งมอบ) — การเงินเลือกแบบฝากไว้แต่ยังไม่ระบุคน
   * ตอนทำส่งมอบของกรุ๊ปอื่น (กรุ๊ป A) หยิบซองนี้ไปฝากกับคนของกรุ๊ป A ได้ แล้วนำส่งหัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง
   * staff: 'pending' = รอเจ้าหน้าที่กรุ๊ปอื่น · 'none' = ไม่ผ่านเจ้าหน้าที่ · {id,name} = ระบุแล้ว
   * leader: 'pending' = รอหัวหน้าทัวร์กรุ๊ปอื่น · 'main' = หัวหน้าทัวร์หลักของกรุ๊ปรับเอง · {id,name} = ระบุแล้ว
   */
  pendingDeposit?: PendingDeposit;
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
    /**
     * ผู้ถือซองเป็นหัวหน้าทัวร์คนอื่น (ฝากส่ง) — ยืนยันรับ/ส่งต่อในพอร์ทัลหัวหน้าทัวร์ของตัวเอง
     * ใช้ทอดเดียวกับเจ้าหน้าที่ส่งกรุ๊ป (staffAck / staffHandoff / staffReturn) — มีได้อย่างใดอย่างหนึ่งกับ proxyStaffId
     */
    proxyLeaderId?: string;
    /**
     * ฝากต่อหัวหน้าทัวร์ (กรุ๊ปอื่น) หลังเจ้าหน้าที่ส่งกรุ๊ป — เจ้าหน้าที่ส่งต่อให้คนนี้แทนหัวหน้าทัวร์หลัก
     * (เมื่อเจ้าหน้าที่กดส่งต่อ ผู้ถือซองเปลี่ยนเป็นคนนี้ → คนนี้กดรับ แล้วนำไปส่งหัวหน้าทัวร์หลัก)
     */
    nextLeaderCarrier?: { id: string; name: string; viaGroup?: string };
    /** ฝากไปกับกรุ๊ปไหน (รหัสกรุ๊ปที่ผู้ถือซองดูแลอยู่) — ไว้ตรวจย้อนหลังว่าซองเดินทางไปกับกรุ๊ปอะไร */
    viaGroup?: string;
    /** ผู้ถือคนก่อนที่ฝากต่อมา (เช่น "เจ้าหน้าที่ส่งกรุ๊ป ธนกฤต") — ผู้ถือคนใหม่เห็นว่ารับต่อจากใคร */
    relayFrom?: string;
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
  /** หัวหน้าทัวร์ส่งต่อซองให้คนอื่น (เช่น ไกด์ท้องถิ่น / แลนด์) — บังคับรูปถ่าย + ชื่อผู้รับ */
  leaderForward?: { at: string; byName: string; toName: string; note?: string; photo?: string };
  /** หัวหน้าทัวร์เปิดใช้แล้วยอดในซองไม่ตรงยอดหน้าซอง */
  mismatch?: { at: string; byName: string; note: string };
  /**
   * หัวหน้าทัวร์แจ้งว่าไม่ได้รับซอง (แจ้งได้เมื่อเดินทางกลับแล้วและยังไม่ได้กดรับ) — การเงินต้องตามซอง
   * ถ้าภายหลังได้รับจริงแล้วกดยืนยันรับ สถานะเป็นรับแล้ว (การแจ้งยังอยู่ในประวัติ)
   */
  notReceived?: { at: string; byName: string; note: string };
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

export interface PendingDeposit {
  at: string;
  byName: string;
  staff: 'pending' | 'none' | { id: string; name: string };
  leader: 'pending' | 'main' | { id: string; name: string; viaGroup?: string };
}

/** ข้อความสถานะรอฝาก — บอกว่ารอฝากไปกับใครของกรุ๊ปอื่น */
export function pendingDepositLabel(pd: PendingDeposit): string {
  if (pd.staff === 'pending' && pd.leader === 'pending') return 'รอฝากไปกับกรุ๊ปอื่น';
  if (pd.staff === 'pending') return 'รอฝากไปกับเจ้าหน้าที่กรุ๊ปอื่น';
  return 'รอฝากไปกับหัวหน้าทัวร์กรุ๊ปอื่น';
}

/**
 * กรุ๊ปที่ไม่มีซองเงินให้รับ (การเงินระบุ) — เช่น โอนจ่ายแลนด์ตรง / ไม่มีค่าใช้จ่ายเงินสด
 * ระบุได้เฉพาะกรุ๊ปที่ยังไม่มีรายการในซองใดเลย · ยกเลิกได้ (กลับไปเป็นรอจัดซอง)
 */
export interface NoEnvelopeMark {
  periodId: string;
  reason: string;
  note?: string;
  at: string;
  byName: string;
}
export const NO_ENVELOPE_REASONS = ['โอนจ่ายแลนด์/ซัพพลายเออร์โดยตรง', 'ไม่มีค่าใช้จ่ายที่ต้องถือเงินสด', 'หัวหน้าทัวร์สำรองจ่ายแล้วเบิกคืน', 'อื่น ๆ'] as const;
export type EnvelopeTone = 'slate' | 'amber' | 'blue' | 'violet' | 'green' | 'red';

const STAGE_ORDER: EnvelopeStage[] = ['packing', 'sealed', 'handed_over', 'received'];

export function envelopeStage(env: CashEnvelope | undefined): EnvelopeStage {
  if (!env?.sealed) return 'packing';
  if (!env.handover) return 'sealed';
  if (!env.leaderAck) return 'handed_over';
  return 'received';
}

/** ผู้ถือซองระหว่างทาง (ไม่ใช่ปลายทาง): เจ้าหน้าที่ส่งกรุ๊ป หรือหัวหน้าทัวร์คนอื่นที่ฝากส่ง */
export type CarrierKind = 'staff' | 'leader';
export function carrierOf(h: CashEnvelope['handover'] | undefined): { kind: CarrierKind; id: string; name: string } | null {
  if (!h) return null;
  if (h.proxyStaffId) return { kind: 'staff', id: h.proxyStaffId, name: h.proxyName ?? '' };
  if (h.proxyLeaderId) return { kind: 'leader', id: h.proxyLeaderId, name: h.proxyName ?? '' };
  return null;
}
export const carrierTitle = (kind: CarrierKind) => (kind === 'leader' ? 'หัวหน้าทัวร์ (ฝากส่ง)' : 'เจ้าหน้าที่ส่งกรุ๊ป');

/** ข้อความสถานะของซองใบเดียว + โทนสี — ใช้ทั้งฝั่งการเงินและหัวหน้าทัวร์ */
export function envelopeStatusLabel(env: CashEnvelope | undefined): { label: string; tone: EnvelopeTone } {
  if (env?.mismatch) return { label: 'แจ้งยอดในซองไม่ตรง', tone: 'red' };
  switch (envelopeStage(env)) {
    case 'packing':
      return env && env.packedLineIds.length > 0 ? { label: 'กำลังจัดซอง', tone: 'amber' } : { label: 'รอจัดซอง', tone: 'slate' };
    case 'sealed':
      if (env!.pendingDeposit) return { label: pendingDepositLabel(env!.pendingDeposit), tone: 'amber' };
      return { label: 'จัดซองแล้ว รอส่งมอบ', tone: 'blue' };
    case 'handed_over':
      if (env!.notReceived) return { label: 'หัวหน้าทัวร์แจ้งไม่ได้รับซอง', tone: 'red' };
      if (env!.staffReturn) return { label: `${carrierTitle(carrierOf(env!.handover)?.kind ?? 'staff')}ส่งคืนการเงิน รอการเงินยืนยันรับ`, tone: 'amber' };
      if (carrierOf(env!.handover) && !env!.staffAck) return { label: `รอ${carrierTitle(carrierOf(env!.handover)!.kind)}ยืนยันรับ`, tone: 'violet' };
      if (env!.staffAck && !env!.staffHandoff) return { label: `${carrierTitle(carrierOf(env!.handover)?.kind ?? 'staff')}ถือซอง รอส่งหัวหน้าทัวร์`, tone: 'violet' };
      if (env!.staffHandoff) return { label: 'ส่งต่อให้หัวหน้าทัวร์แล้ว รอยืนยันรับ', tone: 'violet' };
      return env!.handover!.receiverKind === 'staff' || env!.handover!.proxyName
        ? { label: 'ฝากผู้รับแทน รอหัวหน้าทัวร์ยืนยันรับ', tone: 'violet' }
        : { label: 'ส่งมอบแล้ว รอหัวหน้าทัวร์ยืนยัน', tone: 'violet' };
    case 'received':
      return env!.leaderForward
        ? { label: `หัวหน้าทัวร์รับแล้ว ส่งต่อให้ ${env!.leaderForward.toName}`, tone: 'green' }
        : { label: 'หัวหน้าทัวร์รับซองแล้ว', tone: 'green' };
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
  if (stage === 'sealed' && env!.pendingDeposit) return { label: pendingDepositLabel(env!.pendingDeposit), tone };
  if (stage === 'handed_over' && env!.notReceived) return { label: 'แจ้งไม่ได้รับซอง', tone };
  if (stage === 'handed_over' && env!.staffReturn) return { label: 'ส่งคืนการเงิน', tone };
  const car = stage === 'handed_over' ? carrierOf(env!.handover) : null;
  if (car && !env!.staffAck) return { label: car.kind === 'leader' ? 'รอหัวหน้าทัวร์ฝากส่งรับ' : 'รอเจ้าหน้าที่ส่งกรุ๊ปรับ', tone };
  if (car && !env!.staffHandoff) return { label: car.kind === 'leader' ? 'หัวหน้าทัวร์ฝากส่งถือซอง' : 'เจ้าหน้าที่ส่งกรุ๊ปถือซอง', tone };
  if (stage === 'received' && env!.leaderForward) return { label: 'รับแล้ว · ส่งต่อแล้ว', tone };
  return { label: SHORT[stage], tone };
}

/**
 * ผู้รับซองสำหรับแสดง
 * - ส่งให้หัวหน้าทัวร์: "ชัยมงคล" / "ชัยมงคล (รับแทนโดย สมศักดิ์)"
 * - ฝากเจ้าหน้าที่ส่งกรุ๊ป: "เจ้าหน้าที่ส่งกรุ๊ป ธนกฤต → นำส่ง ชัยมงคล"
 * - ฝากหัวหน้าทัวร์คนอื่น: "หัวหน้าทัวร์ (ฝากส่ง) สมชาย → นำส่ง ชัยมงคล"
 */
export const handoverReceiverText = (
  h: Pick<NonNullable<CashEnvelope['handover']>, 'receiverName' | 'proxyName'> & Partial<Pick<NonNullable<CashEnvelope['handover']>, 'receiverKind' | 'proxyStaffId' | 'proxyLeaderId' | 'viaGroup' | 'nextLeaderCarrier'>>,
) =>
  h.proxyLeaderId && h.proxyName
    ? `หัวหน้าทัวร์ (ฝากส่ง) ${h.proxyName}${h.viaGroup ? ` (ไปกับกรุ๊ป ${h.viaGroup})` : ''} → นำส่ง ${h.receiverName}`
    : h.proxyStaffId && h.proxyName
      ? `เจ้าหน้าที่ส่งกรุ๊ป ${h.proxyName}${h.nextLeaderCarrier
        ? ` → หัวหน้าทัวร์ (ฝากส่ง) ${h.nextLeaderCarrier.name}${h.nextLeaderCarrier.viaGroup ? ` (ไปกับกรุ๊ป ${h.nextLeaderCarrier.viaGroup})` : ''}`
        : ''} → นำส่ง ${h.receiverName}`
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
/** ชื่อซอง: "ซอง 1 · ค่า Land · ชื่อเพิ่มเติม" — ซองเก่าที่ไม่มีประเภทใช้ชื่อเดิม */
export const envelopeName = (env: Pick<CashEnvelope, 'no' | 'label'> & Partial<Pick<CashEnvelope, 'kind'>>) =>
  `ซอง ${env.no}${[env.kind ? ENVELOPE_KIND[env.kind].short : '', env.label ?? ''].filter(Boolean).map((s) => ` · ${s}`).join('')}`;

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
    case 'หัวหน้าทัวร์ส่งต่อซอง': return e.leaderForward?.photo;
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

/** ปัดเป็นทศนิยม 2 ตำแหน่ง — กันเศษลอยตัวตอนลบ/บวกยอดแบ่งซอง */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** การจัดของซอง 1 ใบ: lineKey → ยอดที่ใส่ซองนี้ */
export type Allocation = Record<string, number>;
type Packing = Pick<CashEnvelope, 'packedLineIds'> & Partial<Pick<CashEnvelope, 'splits'>>;

/** แปลงซองเป็นการจัด (lineKey → ยอด) — ไม่มี splits = เต็มจำนวนรายการ · รายการที่หายจากเอกสารแล้วข้าม */
export function allocationOf(env: Packing, lines: GroupLine[]): Allocation {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out: Allocation = {};
  for (const k of env.packedLineIds) {
    const l = byId.get(k);
    if (l) out[k] = env.splits?.[k] ?? l.amount;
  }
  return out;
}

/** การจัด → ฟิลด์ที่เก็บในซอง (เต็มจำนวน = ไม่ต้องเก็บใน splits) */
export function packingFromAllocation(alloc: Allocation, lines: GroupLine[]): { packedLineIds: string[]; splits?: Record<string, number> } {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const packedLineIds = Object.keys(alloc);
  const splits: Record<string, number> = {};
  for (const k of packedLineIds) if (alloc[k] !== byId.get(k)?.amount) splits[k] = alloc[k];
  return Object.keys(splits).length ? { packedLineIds, splits } : { packedLineIds };
}

/** ยอดที่ต้องจัดทั้งหมด และยอดในซองนี้ */
export function envelopeTotals(lines: GroupLine[], alloc: Allocation): { required: EnvelopeAmount[]; packed: EnvelopeAmount[] } {
  return {
    required: sumAmounts(lines),
    packed: sumAmounts(lines.filter((l) => l.id in alloc).map((l) => ({ amount: alloc[l.id] || 0, currency: l.currency }))), // ช่องว่างระหว่างพิมพ์ (NaN) = 0
  };
}

/**
 * ปิดซองได้เมื่อมีรายการในซองอย่างน้อย 1 รายการ ทุกรายการยังอยู่ในเอกสาร ยอดแต่ละรายการ > 0
 * และไม่เกินยอดที่เหลือของรายการ (others = ยอดที่ซองอื่นจัดรายการเดียวกันไปแล้ว)
 */
export function canSeal(lines: GroupLine[], alloc: Allocation, others: Map<string, number> = new Map()): boolean {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const keys = Object.keys(alloc);
  return keys.length > 0 && keys.every((k) => {
    const l = byId.get(k);
    return !!l && alloc[k] > 0 && round2(alloc[k] + (others.get(k) ?? 0)) <= l.amount;
  });
}

/** ยอดที่จัดแล้วต่อรายการ รวมทุกซอง (หรือเฉพาะซองที่ผ่าน filter) */
export function allocatedTotals(lines: GroupLine[], envs: Packing[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of envs) for (const [k, v] of Object.entries(allocationOf(e, lines))) m.set(k, round2((m.get(k) ?? 0) + (v || 0)));
  return m;
}

/** รายการเบิกที่ยังจัดใส่ซองไม่ครบยอด — amount = ยอดที่ยังเหลือ */
export function unassignedLines(lines: GroupLine[], envs: Packing[]): GroupLine[] {
  const done = allocatedTotals(lines, envs);
  return lines
    .map((l) => ({ ...l, amount: round2(l.amount - (done.get(l.id) ?? 0)) }))
    .filter((l) => l.amount > 0);
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

/**
 * ซองนี้อยู่ขั้นไหนในมุมของหัวหน้าทัวร์คนนี้
 * - 'to_ack'     ถึงมือแล้ว รอกดยืนยันรับ (การเงินส่งให้ตรง หรือเจ้าหน้าที่ส่งกรุ๊ปแจ้งว่าส่งต่อให้แล้ว)
 * - 'at_finance' ฝากเจ้าหน้าที่ส่งกรุ๊ป แต่เจ้าหน้าที่ยังไม่ได้รับซองจากการเงิน — ขั้นตอนยังมาไม่ถึง กดอะไรไม่ได้
 * - 'in_transit' เจ้าหน้าที่ส่งกรุ๊ปรับจากการเงินแล้ว ยังไม่กดส่งต่อ — หัวหน้าทัวร์กดรับได้
 *                เพราะหน้างานอาจฝากคนอื่นนำมาให้ระหว่างเดินทาง (ประวัติบันทึกว่ารับก่อนเจ้าหน้าที่กดส่งต่อ)
 * - 'not_received' หัวหน้าทัวร์แจ้งว่าไม่ได้รับซองแล้ว — รอการเงินตามซอง (ยังกดรับได้ถ้าได้รับภายหลัง)
 * - null         ไม่ใช่ซองที่ส่งถึงคนนี้ / ยังไม่ส่งมอบ / รับแล้ว / ส่งคืนการเงินอยู่
 */
export function leaderEnvelopeState(env: CashEnvelope, leaderId: string | null | undefined): 'to_ack' | 'in_transit' | 'at_finance' | 'not_received' | null {
  if (!leaderId || envelopeStage(env) !== 'handed_over' || env.handover?.receiverId !== leaderId || env.staffReturn) return null;
  if (env.notReceived) return 'not_received';
  const car = carrierOf(env.handover);
  if (car && !env.staffAck) return 'at_finance';
  return car && !env.staffHandoff ? 'in_transit' : 'to_ack';
}

/** หัวหน้าทัวร์กดยืนยันรับซองนี้ได้ไหม — ได้เมื่อซองออกจากการเงินแล้ว (ถึงมือ / ระหว่างทาง / เคยแจ้งไม่ได้รับ) */
export const leaderCanAck = (env: CashEnvelope, leaderId: string | null | undefined) => {
  const s = leaderEnvelopeState(env, leaderId);
  return s === 'to_ack' || s === 'in_transit' || (s === 'not_received' && !(carrierOf(env.handover) && !env.staffAck));
};

/** ข้อความประวัติเมื่อหัวหน้าทัวร์กดรับซองที่ยังอยู่ระหว่างทาง */
export const ACK_BEFORE_HANDOFF_NOTE = 'รับก่อนผู้ถือซองกดส่งต่อ (ฝากคนอื่นนำมาให้ระหว่างทาง)';

/**
 * ซองที่ฝากหัวหน้าทัวร์คนนี้นำส่ง (เป็นผู้ถือซองระหว่างทาง ไม่ใช่ปลายทาง) และยังไม่จบทอดของตัวเอง
 * จบทอด = ส่งต่อแล้ว / ส่งคืนการเงินแล้ว / หัวหน้าทัวร์ปลายทางกดรับแล้ว
 */
export function carriedByLeader(env: CashEnvelope, leaderId: string | null | undefined): boolean {
  return !!leaderId && envelopeStage(env) === 'handed_over' && env.handover?.proxyLeaderId === leaderId && !env.leaderAck;
}

/**
 * เส้นทางซอง (ตรวจย้อนหลัง) — ใครถือซองช่วงไหน ไล่จากประวัติจริงของซอง เรียงเก่า → ใหม่
 * ทุกทอดที่เปลี่ยนมือ: ส่งมอบ / ผู้ถือรับ / ฝากต่อ / ส่งต่อ / ส่งคืน / การเงินรับคืน / หัวหน้าทัวร์รับ / ส่งต่อซอง
 */
const CUSTODY_ACTIONS = /ส่งมอบซอง|ยืนยันรับซอง|ฝากต่อ|ส่งต่อ|ส่งซองคืน|รับซองคืน|แจ้งไม่ได้รับ|ยกเลิกการส่งมอบ/;
export function custodyTrail(env: CashEnvelope): EnvelopeHistoryEntry[] {
  return env.history.filter((h) => CUSTODY_ACTIONS.test(h.action));
}

/** ส่งมอบแล้วแต่ยังไม่มีใครกดตอบรับ (เจ้าหน้าที่/หัวหน้าทัวร์) — การเงินยังแก้ไขการส่งมอบได้ */
export function canEditHandover(env: CashEnvelope): boolean {
  return !!env.handover && !env.staffAck && !env.leaderAck;
}

/** การเงินยังเข้าไปจัดการกรุ๊ปนี้ได้ไหม: ยังจัด/ส่งมอบไม่ครบ หรือมีซองที่ส่งมอบแล้วแต่ยังไม่มีผู้ตอบรับ */
export function groupManageable(lines: GroupLine[], envs: CashEnvelope[], noEnvelope?: NoEnvelopeMark): boolean {
  const s = groupEnvelopeStatus(lines, envs, noEnvelope);
  // ระบุว่าไม่มีซอง — ยังเปิดเข้าไปยกเลิกการระบุได้
  return s.stage === 'none' || s.stage === 'packing' || s.stage === 'sealed'
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
  if (carrierOf(env.handover) && !env.staffAck) return base;
  if (env.staffAck && !env.staffHandoff) return base + 1;
  return base + 2;
}

/**
 * สถานะรวมของกรุ๊ป (ทุกเอกสาร ทุกซอง) สำหรับตาราง
 * - ยังมีรายการที่ไม่อยู่ในซองที่ปิดแล้ว → รอจัด (ยังไม่มีรายการในซองเลย) / กำลังจัด
 * - จัดครบแล้ว → ขั้นของซองที่ช้าที่สุด · มีซองแจ้งยอดไม่ตรง → ยอดไม่ตรง
 * - การเงินระบุว่ากรุ๊ปนี้ไม่มีซอง (และยังไม่มีรายการในซองใด) → stage 'none' "ไม่มีซอง"
 */
export function groupEnvelopeStatus(
  lines: GroupLine[],
  envs: CashEnvelope[],
  noEnvelope?: NoEnvelopeMark,
): { stage: EnvelopeStage | 'none'; label: string; tone: EnvelopeTone; mismatch: boolean; envelopeCount: number; unassigned: number; awaiting?: string } {
  const used = envs.filter((e) => e.packedLineIds.length > 0);
  if (noEnvelope && used.length === 0) {
    return { stage: 'none', label: 'ไม่มีซอง', tone: 'slate', mismatch: false, envelopeCount: 0, unassigned: 0, awaiting: noEnvelope.reason };
  }
  // รายการที่ซองปิดแล้วรวมกันครบยอด (แบ่งหลายซองได้)
  const sealedDone = allocatedTotals(lines, used.filter((e) => e.sealed));
  // ต้องตรวจสอบ: แจ้งยอดในซองไม่ตรง หรือหัวหน้าทัวร์แจ้งไม่ได้รับซอง (ที่ยังไม่ได้รับจริง)
  const notReceived = used.some((e) => e.notReceived && !e.leaderAck);
  const mismatch = used.some((e) => e.mismatch) || notReceived;
  const unassigned = unassignedLines(lines, used).length;
  const base = { mismatch, envelopeCount: used.length, unassigned };

  let stage: EnvelopeStage;
  let label: string;
  let tone: EnvelopeTone;
  /** ผู้ที่ต้องกดตอบรับในขั้นนี้ (เจ้าหน้าที่ส่งกรุ๊ป / หัวหน้าทัวร์) */
  let awaiting: string | undefined;
  if (lines.length === 0 || lines.some((l) => (sealedDone.get(l.id) ?? 0) < l.amount)) {
    stage = 'packing';
    const started = used.length > 0;
    label = started ? 'กำลังจัด' : 'รอจัด';
    tone = started ? 'amber' : 'slate';
  } else {
    // ซองที่ช้าที่สุด (ละเอียดถึงทอดของเจ้าหน้าที่ส่งกรุ๊ป) เป็นตัวกำหนดสถานะของกรุ๊ป
    const slowest = used.reduce((a, b) => (handoverRank(b) < handoverRank(a) ? b : a));
    stage = envelopeStage(slowest);
    // สถานะรวมไม่บอกการส่งต่อ (ตารางแสดงแยกรายซองแล้ว) — กันซองแรกที่ส่งต่อทำให้ทั้งกรุ๊ปขึ้นว่า "ส่งต่อแล้ว"
    label = envelopeShortLabel({ ...slowest, mismatch: undefined, leaderForward: undefined }).label;
    tone = stage === 'sealed' ? 'blue' : stage === 'handed_over' ? 'violet' : 'green';
    if (stage === 'handed_over') {
      const h = slowest.handover!;
      awaiting = slowest.staffReturn
        ? `${slowest.staffReturn.staffName} ส่งคืน — รอการเงินยืนยันรับ`
        : carrierOf(h) && !slowest.staffHandoff ? h.proxyName : h.receiverName;
    }
  }
  if (mismatch) return { ...base, stage, label: notReceived ? 'แจ้งไม่ได้รับซอง' : 'ยอดไม่ตรง', tone: 'red' };
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
