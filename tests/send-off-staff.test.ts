/**
 * เจ้าหน้าที่ส่งกรุ๊ป — กติกาเวลาไปส่งและข้อจำกัดของประเภทพนักงาน
 *
 * เกณฑ์จากผู้ใช้:
 *   • เวลาไปถึงสนามบิน = เวลาเครื่องออกจากไทย − 3 ชั่วโมง
 *   • ประเภทพนักงานติดงานประจำ 09:00–18:00 จึงไปส่งช่วงนั้นไม่ได้ — เช็คทั้งช่วงที่ต้องอยู่กับกรุ๊ป (เวลานัดถึงเวลาบิน)
 *     ทับซ้อนกับเวลางานหรือไม่ ทับซ้อนแค่บางส่วนก็ติด ไม่ใช่เช็คแค่เวลานัดอย่างเดียวหรือเวลาบินอย่างเดียว
 *   • ตัวอย่าง: เครื่องออก 19:00 → ต้องถึง 16:00 (ช่วง 16:00–19:00 ทับซ้อนกับ 09:00–18:00) → พนักงานไปไม่ได้
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSendOffByStatus, checkSendOff, eligibleStaff, isValidThaiId, isWithinEmployeeWorkHours,
  reachedMonthlyCapacity, remainingMonthlyCapacity,
  SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_STATUS_ORDER,
  sendOffArrival, sendOffStaffName, toMinutes, toTimeText, SEND_OFF_LEAD_HOURS,
  type ThaiIdCard,
} from '../src/lib/logic/sendOffStaff';
import { formatThaiId } from '../src/lib/format';

describe('เวลาที่ต้องไปถึงสนามบิน', () => {
  test('หักจากเวลาเครื่องออก 3 ชั่วโมง', () => {
    assert.equal(SEND_OFF_LEAD_HOURS, 3);
    assert.deepEqual(sendOffArrival('19:00'), { time: '16:00', dayOffset: 0 });
    assert.deepEqual(sendOffArrival('12:30'), { time: '09:30', dayOffset: 0 });
  });

  test('เที่ยวบินดึกย้อนไปเป็นวันก่อนหน้า', () => {
    assert.deepEqual(sendOffArrival('01:00'), { time: '22:00', dayOffset: -1 });
    assert.deepEqual(sendOffArrival('02:30'), { time: '23:30', dayOffset: -1 });
    assert.deepEqual(sendOffArrival('03:00'), { time: '00:00', dayOffset: 0 }, 'พอดี 00:00 ยังเป็นวันเดียวกัน');
  });

  test('เวลาไม่ถูกรูปแบบ → null ไม่เดา', () => {
    assert.equal(sendOffArrival('19:00:00'), null);
    assert.equal(sendOffArrival('25:00'), null);
    assert.equal(sendOffArrival(''), null);
  });
});

describe('ช่วงเวลางานประจำของพนักงาน', () => {
  test('อยู่ในช่วง 09:00–18:00 นับรวมหัวท้าย', () => {
    assert.equal(isWithinEmployeeWorkHours('09:00'), true, 'เริ่มงานพอดีก็ติด');
    assert.equal(isWithinEmployeeWorkHours('13:00'), true);
    assert.equal(isWithinEmployeeWorkHours('18:00'), true, 'เลิกงานพอดี ไปยืนรออยู่สนามบินพร้อมกันไม่ได้');
  });

  test('นอกช่วงไม่ติด', () => {
    assert.equal(isWithinEmployeeWorkHours('08:59'), false);
    assert.equal(isWithinEmployeeWorkHours('18:01'), false);
    assert.equal(isWithinEmployeeWorkHours('23:00'), false);
    assert.equal(isWithinEmployeeWorkHours('05:00'), false);
  });
});

describe('เกณฑ์เวลางานพนักงาน — ทับซ้อนกับ "ช่วงที่ต้องอยู่กับกรุ๊ป" (เวลานัดถึงเวลาบิน) แม้บางส่วนก็ติด', () => {
  test('เครื่องออกเองอยู่ในเวลางาน 09:00–18:00 → พนักงานไปไม่ได้', () => {
    const r = checkSendOff('employee', '15:00');
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('15:00'), 'ต้องบอกเวลาเครื่องออก');
    assert.ok(r.reason.includes('09:00–18:00'), 'ต้องบอกว่าติดเวลางาน');
  });

  test('ประจำไปได้เสมอไม่ว่าเวลาไหน', () => {
    const r = checkSendOff('permanent', '15:00');
    assert.equal(r.ok, true);
    assert.equal(r.arrivalTime, '12:00');
  });

  test('เครื่องออกพ้นเวลางานไปแล้ว แต่เวลาที่ต้องถึงสนามบินยังทับซ้อนอยู่ — พนักงานยังไปไม่ได้ (เช็คทั้งช่วง ไม่ใช่แค่เวลาบิน)', () => {
    // เครื่องออก 20:00 (พ้น 18:00 ไปแล้ว) แต่ต้องถึง 17:00 (ยังอยู่ในเวลางาน) — ช่วง 17:00–20:00 ทับซ้อนกับเวลางานที่ 17:00–18:00
    const r = checkSendOff('employee', '20:00');
    assert.equal(r.ok, false);
    assert.equal(r.arrivalTime, '17:00');
  });

  test('เครื่องออกในเวลางาน แม้เวลาที่ต้องถึงสนามบินจะพ้นเวลางานมาก่อนแล้ว — พนักงานยังไปไม่ได้ (เช็คทั้งช่วง ไม่ใช่แค่เวลานัด)', () => {
    // เครื่องออก 10:00 (อยู่ในเวลางาน) แม้ต้องถึง 07:00 (ก่อนเข้างาน) — ช่วง 07:00–10:00 ทับซ้อนกับเวลางานที่ 09:00–10:00
    const r = checkSendOff('employee', '10:00');
    assert.equal(r.ok, false);
    assert.equal(r.arrivalTime, '07:00');
  });

  test('ทั้งเวลานัดและเวลาบินอยู่นอกเวลางาน และช่วงระหว่างก็ไม่ทับซ้อนเลย — พนักงานไปได้', () => {
    // เครื่องออก 21:01 → ต้องถึง 18:01 — ทั้งคู่พ้นเวลางานแล้ว ช่วง 18:01–21:01 ไม่ทับซ้อนกับ 09:00–18:00
    const r = checkSendOff('employee', '21:01');
    assert.equal(r.ok, true);
    assert.equal(r.arrivalTime, '18:01');
  });
});

describe('ขอบเขตของกติกา', () => {
  test('เครื่องออกพอดี 09:00 เริ่มงาน พนักงานไปไม่ได้', () => {
    assert.equal(checkSendOff('employee', '09:00').ok, false);
  });

  test('เครื่องออก 08:59 ก่อนเข้างาน พนักงานไปได้', () => {
    assert.equal(checkSendOff('employee', '08:59').ok, true);
  });

  test('เครื่องออกพอดี 21:00 (ต้องถึง 18:00 พอดี) ช่วงยังทับซ้อนกับเวลาเลิกงาน พนักงานยังไปไม่ได้', () => {
    const r = checkSendOff('employee', '21:00');
    assert.equal(r.ok, false);
    assert.equal(r.arrivalTime, '18:00');
  });

  test('เครื่องออก 21:01 (ต้องถึง 18:01 พ้นเวลางาน) ช่วงไม่ทับซ้อนแล้ว พนักงานไปได้', () => {
    const r = checkSendOff('employee', '21:01');
    assert.equal(r.ok, true);
    assert.equal(r.arrivalTime, '18:01');
  });

  test('เที่ยวบินดึก 01:00 → ไปตั้งแต่ 22:00 คืนก่อน พนักงานไปได้', () => {
    const r = checkSendOff('employee', '01:00');
    assert.equal(r.ok, true);
    assert.equal(r.dayOffset, -1);
    assert.ok(r.reason.includes('คืนก่อนวันเดินทาง'));
  });

  test('ไม่รู้เวลาเครื่องออก → ตอบว่าไม่รู้ ไม่เดาว่าไปได้', () => {
    for (const t of [null, undefined, '']) {
      const r = checkSendOff('employee', t);
      assert.equal(r.ok, false, 'ไม่รู้เวลาต้องไม่ผ่าน');
      assert.ok(r.reason.includes('ยังไม่รู้เวลาเครื่องออก'));
    }
    assert.equal(checkSendOff('permanent', null).ok, false, 'ประจำก็ต้องไม่เดาเหมือนกัน');
  });
});

describe('คัดเจ้าหน้าที่ที่ส่งเที่ยวบินนี้ได้', () => {
  const staff = [
    { id: 'S1', staffType: 'permanent' as const, status: 'active' as const },
    { id: 'S2', staffType: 'employee' as const, status: 'active' as const },
    { id: 'S3', staffType: 'permanent' as const, status: 'disabled' as const },
    { id: 'S4', staffType: 'permanent' as const, status: 'suspended' as const },
  ];

  test('เครื่องออก 15:00 (ในเวลางาน) เหลือเฉพาะประจำที่ยังใช้งานอยู่', () => {
    assert.deepEqual(eligibleStaff(staff, '15:00').map((s) => s.id), ['S1']);
  });

  test('เครื่องออก 23:00 (นอกเวลางาน) ได้ทั้งสองประเภท', () => {
    assert.deepEqual(eligibleStaff(staff, '23:00').map((s) => s.id), ['S1', 'S2']);
  });

  test('คนที่ปิดใช้งานหรือระงับชั่วคราว ไม่ถูกเลือกไม่ว่าเวลาไหน', () => {
    for (const t of ['15:00', '23:00', '05:00']) {
      const ids = eligibleStaff(staff, t).map((s) => s.id);
      assert.equal(ids.includes('S3'), false, 'ปิดการใช้งานต้องไม่ถูกเลือก');
      assert.equal(ids.includes('S4'), false, 'ระงับชั่วคราวต้องไม่ถูกเลือก');
    }
  });
});

describe('สถานะเจ้าหน้าที่', () => {
  test('มีครบ 3 สถานะตามที่กำหนด', () => {
    assert.deepEqual(SEND_OFF_STAFF_STATUS_ORDER, ['active', 'suspended', 'disabled']);
    assert.equal(SEND_OFF_STAFF_STATUS.active.label, 'ใช้งาน');
    assert.equal(SEND_OFF_STAFF_STATUS.suspended.label, 'ระงับชั่วคราว');
    assert.equal(SEND_OFF_STAFF_STATUS.disabled.label, 'ปิดการใช้งาน');
  });

  test('เฉพาะสถานะใช้งานเท่านั้นที่เลือกไปส่งกรุ๊ปได้', () => {
    assert.equal(canSendOffByStatus('active'), true);
    assert.equal(canSendOffByStatus('suspended'), false, 'ระงับชั่วคราวต้องเลือกไม่ได้');
    assert.equal(canSendOffByStatus('disabled'), false, 'ปิดการใช้งานต้องเลือกไม่ได้');
  });

  test('ทุกสถานะมีคำอธิบายและสีของตัวเอง แยกจากกันได้', () => {
    const tones = SEND_OFF_STAFF_STATUS_ORDER.map((st) => SEND_OFF_STAFF_STATUS[st].tone);
    assert.equal(new Set(tones).size, 3, 'สีต้องไม่ซ้ำกัน จะได้แยกออกจากกันบนหน้าจอ');
    for (const st of SEND_OFF_STAFF_STATUS_ORDER) {
      assert.ok(SEND_OFF_STAFF_STATUS[st].note.length > 0, st + ' ต้องมีคำอธิบาย');
    }
  });
});

describe('เพดานจำนวนกรุ๊ปต่อเดือน — ตั้งแยกได้ต่อคนและต่อเดือน เกินแล้วเลือกไม่ได้อีก', () => {
  test('ไม่ได้ตั้งเพดานไว้ (null/undefined) = ไม่จำกัด', () => {
    assert.equal(remainingMonthlyCapacity(null, 100), null);
    assert.equal(remainingMonthlyCapacity(undefined, 100), null);
    assert.equal(reachedMonthlyCapacity(null, 100), false);
  });

  test('ตั้งเพดานไว้ — เหลือรับได้อีกเท่ากับเพดานลบยอดที่มีอยู่แล้ว', () => {
    assert.equal(remainingMonthlyCapacity(20, 15), 5);
    assert.equal(reachedMonthlyCapacity(20, 15), false);
  });

  test('พอดีเพดาน = ครบแล้ว เลือกเพิ่มไม่ได้', () => {
    assert.equal(remainingMonthlyCapacity(20, 20), 0);
    assert.equal(reachedMonthlyCapacity(20, 20), true);
  });

  test('เกินเพดานไปแล้ว (เช่น ปรับเพดานลดหลังจัดไปแล้ว) — เหลือไม่ติดลบ ยังถือว่าครบแล้ว', () => {
    assert.equal(remainingMonthlyCapacity(10, 15), 0, 'ไม่ควรติดลบ');
    assert.equal(reachedMonthlyCapacity(10, 15), true);
  });

  test('เพดาน 0 = รับไม่ได้เลยตั้งแต่ต้น', () => {
    assert.equal(remainingMonthlyCapacity(0, 0), 0);
    assert.equal(reachedMonthlyCapacity(0, 0), true);
  });
});

describe('เลขบัตรประชาชน', () => {
  test('ตรวจหลักตรวจสอบตัวสุดท้าย', () => {
    assert.equal(isValidThaiId('1101700207366'), true);
    assert.equal(isValidThaiId('1101700207364'), false, 'หลักตรวจสอบผิดต้องไม่ผ่าน');
    assert.equal(isValidThaiId('110170020736'), false, 'ไม่ครบ 13 หลัก');
    assert.equal(isValidThaiId(''), false);
  });

  test('รับเลขที่มีขีดคั่นได้', () => {
    assert.equal(isValidThaiId('1-1017-00207-36-6'), true);
  });

  test('จัดรูปแบบตามที่พิมพ์บนบัตรจริง', () => {
    assert.equal(formatThaiId('1101700207366'), '1-1017-00207-36-6');
    assert.equal(formatThaiId('123'), '123', 'ไม่ครบ 13 หลักคืนค่าเดิม');
  });
});

describe('ตัวช่วยเวลาและชื่อ', () => {
  test('แปลงเวลาไป-กลับ', () => {
    assert.equal(toMinutes('16:00'), 960);
    assert.equal(toTimeText(960), '16:00');
    assert.equal(toTimeText(-60), '23:00', 'ติดลบต้องวนกลับเป็นวันก่อน');
    assert.equal(toTimeText(1500), '01:00', 'เกิน 24 ชม. ต้องวนรอบ');
  });

  test('ชื่อที่ใช้แสดง — มีชื่อเล่นต่อท้ายในวงเล็บ', () => {
    const idCard = { firstName: 'สมชาย', lastName: 'ใจดี' } as ThaiIdCard;
    assert.equal(sendOffStaffName({ idCard, nickname: 'ชาย' }), 'สมชาย ใจดี (ชาย)');
    assert.equal(sendOffStaffName({ idCard, nickname: '' }), 'สมชาย ใจดี');
  });
});

/* ------------------- เมนูและข้อมูลตั้งต้น ------------------- */

import { readFileSync } from 'node:fs';
import { navForRole, NAV_ITEMS } from '../src/lib/permissions';
import { sendOffStaffSeed } from '../src/data/sendOffStaff';

describe('เมนูเจ้าหน้าที่ส่งกรุ๊ป', () => {
  test('มีเมนูและชี้ไปหน้าที่มีอยู่จริง', () => {
    const item = NAV_ITEMS.find((i) => i.key === 'sendOffStaff');
    assert.ok(item, 'ต้องมีเมนู');
    assert.equal(item!.label, 'เจ้าหน้าที่ส่งกรุ๊ป');
    assert.equal(item!.href, '/send-off-staff');
  });

  test('เปิดให้ผู้ดูแลระบบและฝ่ายจัดหัวหน้าทัวร์ — หัวหน้าทัวร์ไม่เห็น', () => {
    assert.ok(navForRole('admin').some((i) => i.key === 'sendOffStaff'));
    assert.ok(navForRole('coordinator').some((i) => i.key === 'sendOffStaff'));
    assert.equal(navForRole('leader').some((i) => i.key === 'sendOffStaff'), false);
  });
});

describe('ข้อมูลตั้งต้น', () => {
  test('มีครบทั้งสองประเภท', () => {
    assert.ok(sendOffStaffSeed.some((s) => s.staffType === 'permanent'));
    assert.ok(sendOffStaffSeed.some((s) => s.staffType === 'employee'));
  });

  test('เลขบัตรทุกคนผ่านหลักตรวจสอบ — ข้อมูลตัวอย่างต้องไม่ใช่เลขมั่ว', () => {
    for (const s of sendOffStaffSeed) {
      assert.equal(isValidThaiId(s.idCard.idNumber), true, `${s.id} เลขบัตรไม่ผ่านหลักตรวจสอบ`);
    }
  });

  test('รหัสไม่ซ้ำกัน', () => {
    assert.equal(new Set(sendOffStaffSeed.map((s) => s.id)).size, sendOffStaffSeed.length);
  });
});

describe('หน้าจอ', () => {
  // รายชื่อ + เกณฑ์เวลา อยู่ในหน้าทะเบียน — กดชื่อแล้วพาไปหน้าโปรไฟล์เต็ม (/send-off-staff/[id])
  // ซึ่งแยกเป็นคนละไฟล์ (SendOffStaffDetailView) ไม่ใช่ drawer ในหน้าเดียวกันแบบที่เคยออกแบบไว้แรก ๆ
  // ส่วนฟอร์มแก้ไข/เพิ่มก็แยกเป็น SendOffStaffFormDrawer ใช้ร่วมกันทั้งจากหน้าทะเบียนและหน้าโปรไฟล์
  const SRC = readFileSync(new URL('../src/components/staff/SendOffStaffView.tsx', import.meta.url), 'utf8');
  const DETAIL = readFileSync(new URL('../src/components/staff/SendOffStaffDetailView.tsx', import.meta.url), 'utf8');
  const FORM = readFileSync(new URL('../src/components/staff/SendOffStaffFormDrawer.tsx', import.meta.url), 'utf8');

  test('อ่านเกณฑ์จากค่าที่ตั้งไว้ ไม่พิมพ์ตัวเลขค้างไว้ในหน้าจอ', () => {
    // เกณฑ์ปรับได้จากแท็บ "เงื่อนไขการจัด" แล้ว หน้าจอจึงต้องอ่านค่าปัจจุบัน ไม่ใช่ค่าคงที่ของระบบ
    assert.ok(SRC.includes('formatHours(rules.leadHours)'), 'ชั่วโมงที่ต้องไปก่อนต้องมาจากค่าที่ตั้งไว้');
    assert.ok(SRC.includes('rules.employeeWorkStart') && SRC.includes('rules.employeeWorkEnd'), 'ช่วงเวลางานต้องมาจากค่าที่ตั้งไว้');
    assert.ok(SRC.includes('loadSendOffRules()'), 'ต้องโหลดค่าที่ผู้จัดตั้งไว้');
  });

  test('เปลี่ยนสถานะแทนการลบ — ไม่มีปุ่มลบถาวร', () => {
    assert.ok(DETAIL.includes('setSendOffStaffStatus'), 'ต้องเปลี่ยนสถานะผ่าน Store');
    assert.equal(/ลบเจ้าหน้าที่|deleteSendOffStaff/.test(DETAIL), false, 'ต้องไม่มีการลบทิ้ง');
  });

  test('เลือกสถานะได้ทั้ง 3 แบบ และวนจากลำดับกลาง ไม่ไล่เขียนเอง', () => {
    assert.ok(DETAIL.includes('SEND_OFF_STAFF_STATUS_ORDER.map'), 'ต้องวนจากลำดับกลาง');
    assert.equal(DETAIL.includes("'ปิดใช้งาน'"), false, 'ต้องไม่เหลือปุ่มสองสถานะแบบเดิม');
  });

  test('เปลี่ยนสถานะต้องยืนยันก่อน ไม่เปลี่ยนทันทีจากปุ่มเดียว', () => {
    assert.ok(DETAIL.includes('open={!!statusTarget}'), 'ต้องผ่านกล่องยืนยัน');
    assert.ok(DETAIL.includes('onConfirm={applyStatus}'));
  });

  test('นับจำนวนต่อประเภทเฉพาะคนที่เลือกไปส่งได้จริง', () => {
    assert.ok(SRC.includes('canSendOffByStatus(s.status) && s.staffType'),
      'คนที่ถูกระงับหรือปิดต้องไม่ถูกนับรวมจนดูเหมือนมีคนพอ');
  });

  test('กดที่ชื่อเพื่อดูรายละเอียดได้', () => {
    assert.ok(SRC.includes('router.push(`/send-off-staff/${s.id}`)'), 'แถวรายชื่อต้องกดเปิดหน้าโปรไฟล์เต็มได้');
    assert.ok(SRC.includes('ดูโปรไฟล์ของ'), 'ต้องมีป้ายบอกให้เครื่องอ่านหน้าจอรู้ว่าปุ่มนี้ทำอะไร');
  });

  test('รายละเอียดแสดงหน้าบัตรจาก template กลาง ไม่ไล่วางช่องเอง', () => {
    assert.ok(DETAIL.includes('<IdCardTemplate'), 'ต้องใช้ template หน้าบัตรกลาง');
    assert.ok(DETAIL.includes('doc={toIdCardDoc(staff)}'), 'ต้องแปลงข้อมูลเจ้าหน้าที่เป็นเอกสารก่อนส่งเข้า template');
    assert.ok(DETAIL.includes('onViewFile={staff.idCardFile ?'), 'ถ้ามีไฟล์แนบต้องกดเปิดดูได้ ถ้าไม่มีต้องไม่ให้กด');
    // ช่องที่ยังไม่กรอกขึ้นขีด — เป็นหน้าที่ของ IdCardTemplate เอง (ใช้ร่วมกับหัวหน้าทัวร์) ไม่ใช่ของหน้านี้
    const TEMPLATE = readFileSync(new URL('../src/components/leaders/documents/IdCardTemplate.tsx', import.meta.url), 'utf8');
    assert.ok(TEMPLATE.includes("DASH = '—'"), 'template กลางต้องมี fallback ขีดให้ช่องที่ว่าง');
  });

  test('ฟอร์มใช้ชุดช่องกรอกเดียวกับบัตรของหัวหน้าทัวร์ ไม่กำหนดป้ายกำกับเอง', () => {
    // ป้ายกำกับ ชนิดช่อง และข้อความ placeholder ต้องมาจาก schema กลางชุดเดียว
    assert.ok(FORM.includes('DOC_SCHEMAS.id_card.map('), 'ต้องอ่านนิยามช่องจาก schema id_card กลาง');
    assert.ok(FORM.includes('docFieldPlaceholder(f)'), 'ข้อความ placeholder ต้องมาจาก schema เดียวกัน');
    assert.ok(!/const CARD_FIELDS/.test(FORM), 'ต้องไม่มีตารางป้ายกำกับที่เขียนเองซ้อนกับ schema');
    assert.ok(FORM.includes('<IdCardForm'), 'ต้องใช้ผังหน้าบัตรชุดเดียวกับหัวหน้าทัวร์');
  });

  test('แนบไฟล์สำเนาบัตรได้ด้วยตัวเดียวกับเอกสารหัวหน้าทัวร์', () => {
    assert.ok(FORM.includes('<DocumentFileField'), 'ช่องแนบไฟล์ต้องเป็นตัวเดียวกับของหัวหน้าทัวร์');
    assert.ok(FORM.includes('onRead={readFromFile}'), 'ต้องมีปุ่มอ่านข้อมูลจากไฟล์เหมือนกัน');
    assert.ok(FORM.includes('idCardFile: file'), 'กดบันทึกต้องเก็บไฟล์ที่แนบไว้กับเจ้าหน้าที่ด้วย');
    assert.ok(!FORM.includes('ยังไม่รองรับการแนบรูปบัตร'), 'ต้องไม่เหลือช่องแนบไฟล์ที่ใช้งานไม่ได้');
  });

  test('เปิดจากรายละเอียดไปแก้ไขต่อได้ และเป็นคนเดียวกัน', () => {
    // แก้ไขเปิดจาก state เดียวกับที่กำลังดูอยู่ (cardEditOpen) ส่ง staff ปัจจุบันเป็น initial ให้ฟอร์มตรง ๆ
    // จึงรับประกันว่าเป็นคนเดียวกันโดยไม่ต้องส่งต่อ id แยก
    assert.ok(DETAIL.includes('setCardEditOpen(true)'), 'ต้องมีปุ่มเปิดฟอร์มแก้ไขจากหน้ารายละเอียด');
    assert.ok(DETAIL.includes('initial={staff}'), 'ฟอร์มแก้ไขต้องรับคนที่กำลังดูอยู่เป็นค่าตั้งต้นโดยตรง');
  });

  test('บันทึกไม่ได้ถ้าเลขบัตรหรือชื่อไม่ครบ', () => {
    assert.ok(FORM.includes('isValidThaiId('), 'ต้องตรวจเลขบัตรก่อนบันทึก');
    assert.ok(FORM.includes('disabled={!valid}'), 'ปุ่มบันทึกต้องปิดเมื่อข้อมูลยังไม่ผ่าน');
  });
});

/* ------------------- ใช้ template บัตรประชาชนชุดเดียวกับหัวหน้าทัวร์ ------------------- */

import { ID_CARD_FORM_FIELD_KEYS } from '../src/components/leaders/documents/IdCardForm';
import { EMPTY_ID_CARD } from '../src/lib/logic/sendOffStaff';

describe('template บัตรประชาชน', () => {
  // ฟอร์มกรอก (IdCardForm/ThaiAddressFields) อยู่ใน SendOffStaffFormDrawer · หน้าอ่าน (IdCardTemplate) อยู่ใน
  // SendOffStaffDetailView — คนละไฟล์กัน ไม่ใช่ทั้งคู่อยู่ใน SendOffStaffView แบบที่เคยออกแบบไว้แรก ๆ
  const FORM = readFileSync(new URL('../src/components/staff/SendOffStaffFormDrawer.tsx', import.meta.url), 'utf8');
  const DETAIL = readFileSync(new URL('../src/components/staff/SendOffStaffDetailView.tsx', import.meta.url), 'utf8');

  test('ใช้ผังฟอร์มและหน้าบัตรชุดเดียวกับหัวหน้าทัวร์ ไม่เขียนผังใหม่', () => {
    assert.ok(FORM.includes('<IdCardForm'), 'ฟอร์มต้องใช้ผังหน้าบัตรกลาง');
    assert.ok(DETAIL.includes('<IdCardTemplate'), 'หน้ารายละเอียดต้องใช้ template หน้าบัตรกลาง');
    assert.ok(FORM.includes('<ThaiAddressFields'), 'ที่อยู่ต้องใช้ชุดเขตปกครองกลาง');
  });

  test('ชื่อช่องตรงกับ schema id_card กลาง จึงส่งเข้า template ได้ตรง ๆ', () => {
    /* ช่องที่ผังหน้าบัตรวางไว้ ต้องมีที่เก็บใน ThaiIdCard ครบ (ยกเว้นรหัสที่ ThaiAddressFields ดูแลเอง) */
    for (const key of ID_CARD_FORM_FIELD_KEYS) {
      assert.ok(key in EMPTY_ID_CARD, `ThaiIdCard ต้องมีช่อง ${key} ให้ตรงกับผังหน้าบัตร`);
    }
  });

  test('ใช้ชื่อ issuedDate ตามกลาง ไม่ใช่ issueDate ของเดิม', () => {
    assert.ok('issuedDate' in EMPTY_ID_CARD);
    assert.equal('issueDate' in EMPTY_ID_CARD, false, 'ชื่อเดิมต้องไม่เหลือ ไม่งั้น template อ่านไม่เจอ');
  });

  test('มีช่องชื่ออังกฤษที่บัตรจริงพิมพ์ไว้', () => {
    for (const key of ['titleEn', 'firstNameEn', 'lastNameEn']) {
      assert.ok(key in EMPTY_ID_CARD, `ต้องมีช่อง ${key}`);
    }
  });

  test('ข้อมูลตั้งต้นกรอกช่องของ template ครบ', () => {
    for (const s of sendOffStaffSeed) {
      for (const key of Object.keys(EMPTY_ID_CARD)) {
        assert.ok(key in s.idCard, `${s.id} ขาดช่อง ${key}`);
      }
      assert.ok(s.idCard.provinceCode, `${s.id} ต้องมีรหัสจังหวัด ไม่งั้นหน้าบัตรเลือกคำนำหน้าเขต/อำเภอผิด`);
    }
  });
});
