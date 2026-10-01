/**
 * เทสต์ Utility กลางวันที่/เวลา — มาตรฐาน DD/MM/YY + HH:mm (24 ชม.)
 * ครอบคลุมเคสตาม §13 (เติม 0, สิ้นเดือน, ก.พ., อธิกสุรทิน, ข้ามวัน/เดือน/ปี, auto-format, ค่าไม่ถูกต้อง)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDate,
  formatThaiId,
  shortDateToISOWithin,
  shortDateToISO,
  withYearEraNote,
  YEAR_ERA_NOTE,
  formatTime,
  formatDateTime,
  formatDateRange,
  parseDisplayDate,
  parseDisplayTime,
  toStorageDate,
  toStorageDateTime,
  isValidDate,
  isValidTime,
  maskTime,
  maskShortDate,
} from '@/lib/format';

describe('maskShortDate — จัดรูปแบบวันที่ระหว่างพิมพ์ (dd/mm/yy)', () => {
  test('พิมพ์ 220726 → 22/07/26', () => {
    assert.equal(maskShortDate('220726'), '22/07/26');
  });
  test('พิมพ์ทีละตัว: 2 → 22 → 22/0 → 22/07 → 22/07/2 → 22/07/26', () => {
    assert.equal(maskShortDate('2'), '2');
    assert.equal(maskShortDate('22'), '22');
    assert.equal(maskShortDate('220'), '22/0');
    assert.equal(maskShortDate('2207'), '22/07');
    assert.equal(maskShortDate('220726'), '22/07/26');
  });
  test('พิมพ์ 22/07/26 (มี / อยู่แล้ว) → 22/07/26', () => {
    assert.equal(maskShortDate('22/07/26'), '22/07/26');
  });
  test('จำกัด 6 หลัก (ตัดส่วนเกิน)', () => {
    assert.equal(maskShortDate('22072699'), '22/07/26');
  });
});

describe('formatDate — DD/MM/YY', () => {
  test('เติม 0 หน้าเลขวัน/เดือนหลักเดียว', () => {
    assert.equal(formatDate('2026-07-01'), '01/07/26');
    assert.equal(formatDate('2026-08-09'), '09/08/26');
  });
  test('สิ้นเดือน / สิ้นปี', () => {
    assert.equal(formatDate('2026-12-31'), '31/12/26');
  });
  test('รับ ISO datetime ได้ (ตัดเวลา)', () => {
    assert.equal(formatDate('2026-07-21T23:00:00+07:00'), '21/07/26');
  });
  test('ว่าง → —', () => {
    assert.equal(formatDate(''), '—');
    assert.equal(formatDate(null), '—');
  });
});

describe('formatTime — HH:mm 24 ชม.', () => {
  test('เที่ยงคืน / เที่ยงวัน / เย็น', () => {
    assert.equal(formatTime('00:00'), '00:00');
    assert.equal(formatTime('12:00'), '12:00');
    assert.equal(formatTime('18:00'), '18:00'); // ไม่ใช่ 6:00 PM
  });
  test('เติม 0 + auto-format', () => {
    assert.equal(formatTime('7:5'), '07:05');
    assert.equal(formatTime('0900'), '09:00');
    assert.equal(formatTime('1830'), '18:30');
  });
  test('รับ ISO datetime ได้ (ดึงเวลา)', () => {
    assert.equal(formatTime('2026-07-21T23:00:00+07:00'), '23:00');
  });
});

describe('formatDateTime — DD/MM/YY HH:mm', () => {
  test('ประกอบวันและเวลา', () => {
    assert.equal(formatDateTime('2026-07-21T23:00:00'), '21/07/26 23:00');
    assert.equal(formatDateTime('2026-07-21T09:05:00'), '21/07/26 09:05');
  });
});

describe('formatDateRange', () => {
  test('ช่วงต่างวัน → มีขีดคั่น', () => {
    assert.equal(formatDateRange('2026-07-21', '2026-07-23'), '21/07/26–23/07/26');
  });
  test('วันเดียวกัน → ค่าเดียว', () => {
    assert.equal(formatDateRange('2026-07-21', '2026-07-21'), '21/07/26');
  });
  test('ข้ามเดือน/ข้ามปี', () => {
    assert.equal(formatDateRange('2026-07-30', '2026-08-03'), '30/07/26–03/08/26');
    assert.equal(formatDateRange('2026-12-30', '2027-01-02'), '30/12/26–02/01/27');
  });
});

describe('parseDisplayDate / isValidDate — ตรวจวันที่มีจริง', () => {
  test('วันที่ถูกต้อง → ISO', () => {
    assert.equal(parseDisplayDate('21/07/26'), '2026-07-21');
    assert.equal(toStorageDate('01/07/26'), '2026-07-01');
  });
  test('อธิกสุรทิน: 29/02/28 (2028 เป็นปีอธิกสุรทิน) ถูกต้อง', () => {
    assert.equal(parseDisplayDate('29/02/28'), '2028-02-29');
    assert.equal(isValidDate('29/02/28'), true);
  });
  test('29/02/27 (ไม่ใช่อธิกสุรทิน) ไม่ถูกต้อง', () => {
    assert.equal(parseDisplayDate('29/02/27'), null);
    assert.equal(isValidDate('29/02/27'), false);
  });
  test('วันเกิน/เดือนเกิน → null', () => {
    assert.equal(parseDisplayDate('31/04/26'), null); // เม.ย. มี 30 วัน
    assert.equal(parseDisplayDate('00/07/26'), null);
    assert.equal(parseDisplayDate('21/13/26'), null);
  });
  test('ยังกรอกไม่ครบ → null (ไม่เดา)', () => {
    assert.equal(parseDisplayDate('21/07'), null);
    assert.equal(isValidDate('2/7/26'), false);
  });
});

describe('parseDisplayTime / isValidTime — 24 ชม.', () => {
  test('auto-format', () => {
    assert.equal(parseDisplayTime('0900'), '09:00');
    assert.equal(parseDisplayTime('1830'), '18:30');
    assert.equal(parseDisplayTime('7:5'), '07:05');
    assert.equal(parseDisplayTime('18.30'), '18:30');
  });
  test('ขอบเขต 00:00–23:59', () => {
    assert.equal(parseDisplayTime('00:00'), '00:00');
    assert.equal(parseDisplayTime('23:59'), '23:59');
  });
  test('ค่าที่ไม่ถูกต้อง → null (ไม่แก้เป็นเวลาอื่น)', () => {
    assert.equal(parseDisplayTime('25:00'), null);
    assert.equal(parseDisplayTime('12:60'), null);
    assert.equal(parseDisplayTime(''), null);
    assert.equal(isValidTime('24:00'), false);
    assert.equal(isValidTime('18:30'), true);
  });
});

describe('maskTime — เติม : ระหว่างพิมพ์', () => {
  test('ทยอยพิมพ์', () => {
    assert.equal(maskTime('0'), '0');
    assert.equal(maskTime('09'), '09');
    assert.equal(maskTime('090'), '09:0');
    assert.equal(maskTime('0900'), '09:00');
    assert.equal(maskTime('09:00'), '09:00');
    assert.equal(maskTime('090055'), '09:00'); // จำกัด 4 หลัก
  });
});

describe('toStorageDateTime — ISO 8601 +07:00 (Asia/Bangkok)', () => {
  test('ประกอบวัน+เวลาเป็น timestamp มีโซนเวลา', () => {
    assert.equal(toStorageDateTime('2026-07-21', '18:30'), '2026-07-21T18:30:00+07:00');
    assert.equal(toStorageDateTime('2026-07-21', '0900'), '2026-07-21T09:00:00+07:00');
  });
});

/* ------------------------- เลขประจำตัวประชาชน ------------------------- */

describe('formatThaiId — จัดรูปเลขบัตรประชาชนตามที่พิมพ์บนบัตร', () => {
  test('13 หลัก → X-XXXX-XXXXX-XX-X', () => {
    assert.equal(formatThaiId('1234567890121'), '1-2345-67890-12-1');
  });

  test('มีขีด/ช่องว่างมาแล้วก็จัดรูปให้เหมือนกัน (ผู้ใช้พิมพ์มาได้หลายแบบ)', () => {
    assert.equal(formatThaiId('1-2345-67890-12-1'), '1-2345-67890-12-1');
    assert.equal(formatThaiId('1 2345 67890 12 1'), '1-2345-67890-12-1');
  });

  test('บนหน้าบัตรจริงคั่นด้วยช่องว่าง — ส่งตัวคั่นเองได้', () => {
    assert.equal(formatThaiId('1234567890121', ' '), '1 2345 67890 12 1');
  });

  test('ยังกรอกไม่ครบ 13 หลัก → คืนค่าเดิม ไม่จัดรูปให้ดูเหมือนเลขจริง', () => {
    assert.equal(formatThaiId('12345'), '12345');
    assert.equal(formatThaiId(''), '');
    assert.equal(formatThaiId(null), '');
  });
});

/* ------------- ปี 2 หลักในช่องที่ห้ามเป็นวันอนาคต (วันเกิด) ------------- */

describe('shortDateToISOWithin — ตีความปี 2 หลักตามขอบเขตของช่อง', () => {
  const TODAY = '2026-08-18';

  test('ช่องวันเกิด: ปีที่ตกไปอนาคตให้ถอยไปศตวรรษก่อน', () => {
    assert.equal(shortDateToISOWithin('17/12/52', { max: TODAY }), '1952-12-17');
    assert.equal(shortDateToISOWithin('01/01/54', { max: TODAY }), '1954-01-01');
  });

  test('ปีที่อยู่ในอดีตอยู่แล้วไม่ถูกแตะ', () => {
    assert.equal(shortDateToISOWithin('30/03/65', { max: TODAY }), '1965-03-30');
    assert.equal(shortDateToISOWithin('02/01/85', { max: TODAY }), '1985-01-02');
    assert.equal(shortDateToISOWithin('13/07/26', { max: TODAY }), '2026-07-13');
  });

  test('ไม่มี max (เช่น วันหมดอายุ) → ใช้เกณฑ์ตัดศตวรรษเดิม ไม่ถอยปีให้', () => {
    assert.equal(shortDateToISOWithin('12/02/29'), '2029-02-12');
    assert.equal(shortDateToISOWithin('12/02/29', { min: '2020-01-01' }), '2029-02-12');
  });

  test('ถอยแล้วยังหลุดขอบเขต min → คงค่าเดิมไว้ให้ error อธิบายเอง', () => {
    assert.equal(shortDateToISOWithin('01/01/52', { min: '2000-01-01', max: TODAY }), '2052-01-01');
  });

  test('กรอกยังไม่ครบ/ไม่ใช่วันที่จริง → null เหมือนเดิม', () => {
    assert.equal(shortDateToISOWithin('17/12', { max: TODAY }), null);
    assert.equal(shortDateToISOWithin('31/02/50', { max: TODAY }), null);
  });
});

/* ------------- บอกระบบปีที่หัวข้อช่องวันที่ ------------- */

describe('withYearEraNote — หัวข้อช่องวันที่ต้องบอกว่าใช้ปีอะไร', () => {
  test('หัวข้อธรรมดา → เติมวงเล็บใหม่', () => {
    assert.equal(withYearEraNote('วันที่ออกบัตร'), 'วันที่ออกบัตร (ปี ค.ศ.)');
  });

  test('หัวข้อที่มีวงเล็บอยู่แล้ว → เติมในวงเล็บเดิม ไม่ซ้อนสองชุด', () => {
    assert.equal(withYearEraNote('วันเกิด (Date of birth)'), 'วันเกิด (Date of birth · ปี ค.ศ.)');
  });

  test('ตัดช่องว่างหัวท้ายก่อนต่อข้อความ', () => {
    assert.equal(withYearEraNote('  วันที่ออก  '), 'วันที่ออก (ปี ค.ศ.)');
  });

  test('ระบุปี ค.ศ. ไม่ใช่ พ.ศ. — ตรงกับที่ shortDateToISO ตีความ', () => {
    assert.equal(YEAR_ERA_NOTE, 'ปี ค.ศ.');
    assert.equal(shortDateToISO('13/07/26'), '2026-07-13');
  });
});
