import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryAverages, overallScore, responseRate, formatScore, formatRate,
  formatRespondents, routeCodeFromGroupCode, emptyCategoryScores,
} from '../src/lib/logic/groupScore';
import {
  buildGroupScoreRows, filterGroupScoreRows, groupScoreFilterOptions,
} from '../src/lib/logic/tourGroupScoreRows';
import type { SurveyResponse } from '../src/data/scores/groupScoreTypes';
import type { TourPeriodMaster } from '../src/data/schedule/masterTypes';

/** พีเรียดจำลองสำหรับทดสอบตรรกะ (ไม่ใช่ข้อมูลที่แสดงในระบบ) */
function period(over: Partial<TourPeriodMaster> & { internalId: string; groupCode: string }): TourPeriodMaster {
  return {
    id: over.groupCode, countryName: 'CHINA', tourCode: over.groupCode,
    programCode: null, bus: null, tourName: '', displayName: '', incName: null, periodStatus: null,
    systemNote: null, startDate: '2026-07-20', endDate: '2026-07-23', durationDays: 4, price: null,
    seat: 20, bookingBalance: 1, bookingCount: 19, visaRegularPrice: null, comStandard: null,
    saleStatus: 'SELL', airlineCode: 'HU',
    sourceSystem: 'CSV', sourceRecordId: '1', countryCode: 'CN', programId: null,
    startDateTime: null, endDateTime: null, durationNights: 3, departureAirportCode: null,
    arrivalAirportCode: null, firstSectorAirlineCode: 'HU', airlineSource: null, route: null,
    sectors: [], sourceTourStatus: '', sourceSellStatus: '', originalPrice: null, visaPrice: null,
    currency: 'THB', seatTotal: 20, seatBooked: 19, seatRemaining: 1, periodStatusDetail: null,
    commission: null, remark: null, dataStatus: 'ACTIVE', isActive: true, importedAt: '', updatedAt: '',
    lastSyncedAt: '', sourceFileName: '', sourceRowNumber: 1, validationStatus: 'VALID',
    validationMessages: [],
    ...over,
  } as TourPeriodMaster;
}

function response(id: string, periodId: string, answers: [string, number][], comment: string | null = null): SurveyResponse {
  return {
    surveyResponseId: id,
    periodId,
    groupCode: 'CKG-260720A-HU',
    answers: answers.map(([category, score]) => ({ category: category as never, score })),
    comment,
    submittedAt: null,
  };
}

describe('§4/§5-11 คะแนนรายหัวข้อและคะแนนรวม', () => {
  test('เฉลี่ยรายหัวข้อจากคำตอบทุกฉบับ', () => {
    const s = categoryAverages([
      response('S1', 'P1', [['TL', 10], ['GUIDE', 9]]),
      response('S2', 'P1', [['TL', 9], ['GUIDE', 8]]),
    ]);
    assert.equal(s.TL, 9.5);
    assert.equal(s.GUIDE, 8.5);
  });

  test('หัวข้อที่ไม่มีคำตอบ → null (ห้ามเป็น 0)', () => {
    const s = categoryAverages([response('S1', 'P1', [['TL', 10]])]);
    assert.equal(s.TL, 10);
    assert.equal(s.HOTEL, null);
    assert.equal(s.AIRLINE, null);
    assert.notEqual(s.HOTEL, 0);
  });

  test('คะแนนรวมเฉลี่ยเฉพาะหัวข้อที่ประเมินจริง (ไม่นับหัวข้อว่างเป็น 0)', () => {
    const s = categoryAverages([response('S1', 'P1', [['TL', 10], ['GUIDE', 8]])]);
    assert.equal(overallScore(s), 9); // (10+8)/2 ไม่ใช่ 18/7
  });

  test('ไม่มีคะแนนเลย → คะแนนรวม null', () => {
    assert.equal(overallScore(emptyCategoryScores()), null);
  });

  test('คะแนนที่ไม่ใช่ตัวเลข → ไม่ถูกนำมาคิด', () => {
    const s = categoryAverages([response('S1', 'P1', [['TL', Number.NaN], ['TL', 8]])]);
    assert.equal(s.TL, 8);
  });

  test('หัวข้อนอกรายการที่กำหนด → ไม่ถูกนำมาคิด', () => {
    const s = categoryAverages([response('S1', 'P1', [['UNKNOWN', 10], ['TL', 7]])]);
    assert.equal(s.TL, 7);
    assert.equal(overallScore(s), 7);
  });
});

describe('§3 เปอร์เซ็นต์การตอบแบบสอบถาม (คำนวณสด)', () => {
  test('7/19 → 36.84%', () => {
    assert.equal(formatRate(responseRate(7, 19)), '36.84%');
  });

  test('17/20 → 85.00%', () => {
    assert.equal(formatRate(responseRate(17, 20)), '85.00%');
  });

  test('13/15 → 86.67%', () => {
    assert.equal(formatRate(responseRate(13, 15)), '86.67%');
  });

  test('ไม่ทราบผู้เดินทาง หรือ 0 คน → null (หารไม่ได้)', () => {
    assert.equal(responseRate(7, null), null);
    assert.equal(responseRate(7, 0), null);
    assert.equal(responseRate(null, 19), null);
  });
});

describe('รูปแบบการแสดงผล — ไม่มีข้อมูลต้องเป็น "—"', () => {
  test('คะแนนทศนิยม 2 ตำแหน่ง · null → "—"', () => {
    assert.equal(formatScore(9.789), '9.79');
    assert.equal(formatScore(9.0), '9.00');
    assert.equal(formatScore(null), '—');
  });

  test('สัดส่วนผู้ตอบ', () => {
    assert.equal(formatRespondents(7, 19), '7/19');
    assert.equal(formatRespondents(null, 19), '—');
  });

  test('เปอร์เซ็นต์ null → "—"', () => {
    assert.equal(formatRate(null), '—');
  });
});

describe('§1 รหัสเส้นทางจาก Group Code', () => {
  test('CKG-260720A-HU → CKG', () => {
    assert.equal(routeCodeFromGroupCode('CKG-260720A-HU'), 'CKG');
  });

  test('รูปแบบไม่ตรง → null (ไม่เดา)', () => {
    assert.equal(routeCodeFromGroupCode('12345'), null);
    assert.equal(routeCodeFromGroupCode(''), null);
  });
});

/* ==================== การเชื่อมข้อมูล ==================== */

const P1 = period({ internalId: 'P1', groupCode: 'CKG-260720A-HU', startDate: '2026-07-20', countryName: 'CHINA' });
const P2 = period({ internalId: 'P2', groupCode: 'DAD-260801A-VJ', startDate: '2026-08-01', countryName: 'VIETNAM', bookingCount: 20 });
const P3 = period({ internalId: 'P3', groupCode: 'KIX-260901A-TG', startDate: '2026-09-01', countryName: 'JAPAN', bookingCount: null });

const BASE = {
  periods: [P1, P2, P3],
  assignments: [
    { periodId: 'P1', tourLeaderId: 'TL-1' },
    { periodId: 'P2', tourLeaderId: 'TL-2' },
    { periodId: 'P3', tourLeaderId: 'TL-1' },
  ],
  leaderNameById: new Map([['TL-1', 'สมชาย ใจดี'], ['TL-2', 'สมหญิง ดีใจ']]),
  responsesByPeriod: new Map<string, SurveyResponse[]>(),
  travelerCountByPeriod: new Map<string, number>(),
};

describe('การเชื่อมข้อมูล: พีเรียด × การมอบหมาย × แบบสอบถาม', () => {
  test('ผลแบบสอบถามของหัวหน้าทัวร์ = เฉพาะกรุ๊ปที่คนนี้ได้รับมอบหมาย', () => {
    const rows = buildGroupScoreRows({ ...BASE, tourLeaderId: 'TL-1' });
    assert.deepEqual(rows.map((r) => r.periodId), ['P3', 'P1']); // ล่าสุดก่อน
  });

  test('เรียงค่าเริ่มต้น: วันเดินทางล่าสุดก่อน', () => {
    const rows = buildGroupScoreRows(BASE);
    assert.deepEqual(rows.map((r) => r.periodId), ['P3', 'P2', 'P1']);
  });

  test('เดินทางแล้วแต่ยังไม่มีแบบสอบถาม → ตอบ 0/Pax · 0.00% · คะแนน "—"', () => {
    const rows = buildGroupScoreRows({ ...BASE, tourLeaderId: 'TL-1' });
    const row = rows.find((r) => r.periodId === 'P1')!; // travelers = 19
    assert.equal(row.overall, null);
    assert.equal(row.respondents, 0); // นับจริง = 0 (ไม่ใช่ null)
    assert.equal(row.responseRatePct, 0); // 0/19 → 0.00%
    assert.equal(formatRate(row.responseRatePct), '0.00%');
    assert.equal(formatRespondents(row.respondents, row.travelers), '0/19');
    assert.equal(row.scores.TL, null);
    assert.equal(formatScore(row.overall), '—');
  });

  test('ไม่ทราบจำนวนผู้เดินทาง → ตอบ 0/— · % แสดง "—" (หารไม่ได้)', () => {
    const rows = buildGroupScoreRows({ ...BASE, tourLeaderId: 'TL-1' });
    const row = rows.find((r) => r.periodId === 'P3')!; // travelers = null
    assert.equal(row.respondents, 0);
    assert.equal(row.responseRatePct, null);
    assert.equal(formatRespondents(row.respondents, row.travelers), '0/—');
    assert.equal(formatRate(row.responseRatePct), '—');
  });

  test('จำนวนผู้เดินทางใช้ยอดจองจริงจาก Master เมื่อไฟล์แบบสอบถามไม่ระบุ', () => {
    const rows = buildGroupScoreRows(BASE);
    assert.equal(rows.find((r) => r.periodId === 'P1')!.travelers, 19);
    assert.equal(rows.find((r) => r.periodId === 'P3')!.travelers, null); // Master ไม่มี → null ไม่เดา
  });

  test('มีแบบสอบถาม → คำนวณคะแนน/ผู้ตอบ/% ครบ', () => {
    const rows = buildGroupScoreRows({
      ...BASE,
      tourLeaderId: 'TL-1',
      responsesByPeriod: new Map([['P1', [
        response('S1', 'P1', [['TL', 10], ['GUIDE', 9], ['HOTEL', 8]], 'ประทับใจมาก'),
        response('S2', 'P1', [['TL', 9], ['GUIDE', 9], ['HOTEL', 9]], null),
      ]]]),
    });
    const row = rows.find((r) => r.periodId === 'P1')!;
    assert.equal(row.respondents, 2);
    assert.equal(row.travelers, 19);
    assert.equal(formatRate(row.responseRatePct), '10.53%');
    assert.equal(formatScore(row.scores.TL), '9.50');
    assert.equal(formatScore(row.scores.HOTEL), '8.50');
    assert.equal(formatScore(row.scores.BUS), '—');
    assert.equal(formatScore(row.overall), '9.00'); // (9.5+9+8.5)/3
    assert.equal(row.comments.length, 1);
    assert.equal(row.comments[0].comment, 'ประทับใจมาก');
  });

  test('ผูกหัวหน้าทัวร์และชื่อไว้ในแถว', () => {
    const rows = buildGroupScoreRows({ ...BASE, tourLeaderId: 'TL-1' });
    assert.equal(rows[0].tourLeaderId, 'TL-1');
    assert.equal(rows[0].leaderName, 'สมชาย ใจดี');
  });

  test('การมอบหมายที่พีเรียดหายจากต้นทาง → ข้ามไป (ไม่สร้างแถวเปล่า)', () => {
    const rows = buildGroupScoreRows({
      ...BASE,
      assignments: [...BASE.assignments, { periodId: 'MISSING', tourLeaderId: 'TL-1' }],
      tourLeaderId: 'TL-1',
    });
    assert.equal(rows.length, 2);
  });

  test('นับเฉพาะกรุ๊ปที่เดินทางแล้ว', () => {
    const rows = buildGroupScoreRows({ ...BASE, tourLeaderId: 'TL-1', travelledOnAsOf: '2026-07-25' });
    assert.deepEqual(rows.map((r) => r.periodId), ['P1']);
  });

  test('ประเทศ/รหัสเส้นทาง/Group Code มาจากข้อมูลจริง', () => {
    const rows = buildGroupScoreRows(BASE);
    const vn = rows.find((r) => r.periodId === 'P2')!;
    assert.equal(vn.countryName, 'VIETNAM');
    assert.equal(vn.routeCode, 'DAD');
    assert.equal(vn.groupCode, 'DAD-260801A-VJ');
  });
});

describe('ตัวกรอง', () => {
  const rows = buildGroupScoreRows({
    ...BASE,
    responsesByPeriod: new Map([['P2', [response('S1', 'P2', [['TL', 9]])]]]),
  });

  test('กรองตามประเทศ', () => {
    assert.deepEqual(filterGroupScoreRows(rows, { country: 'JAPAN' }).map((r) => r.periodId), ['P3']);
  });

  test('กรองตามเส้นทาง', () => {
    assert.deepEqual(filterGroupScoreRows(rows, { routeCode: 'CKG' }).map((r) => r.periodId), ['P1']);
  });

  test('ค้นได้ทั้งรหัสกรุ๊ปและชื่อโปรแกรม (ไม่สนตัวพิมพ์)', () => {
    assert.deepEqual(filterGroupScoreRows(rows, { keyword: '260801' }).map((r) => r.periodId), ['P2']);
    /* ค้นด้วยชื่อโปรแกรมต้องเจอด้วย ไม่ใช่ค้นได้เฉพาะรหัส */
    const withName = rows.find((r) => r.programName)?.programName ?? '';
    if (withName) {
      assert.ok(filterGroupScoreRows(rows, { keyword: withName.slice(0, 6) }).length > 0);
    }
  });

  test('มีคะแนนแล้ว / ยังไม่มีคะแนน', () => {
    assert.deepEqual(filterGroupScoreRows(rows, { scoreState: 'scored' }).map((r) => r.periodId), ['P2']);
    assert.deepEqual(filterGroupScoreRows(rows, { scoreState: 'unscored' }).map((r) => r.periodId), ['P3', 'P1']);
  });

  test('กรองตามเดือนที่เดินทาง', () => {
    assert.deepEqual(filterGroupScoreRows(rows, { months: ['08'] }).map((x) => x.periodId), ['P2']);
    assert.deepEqual(filterGroupScoreRows(rows, { months: ['09'] }).map((x) => x.periodId), ['P3']);
  });

  test('เลือกได้หลายเดือน — ได้ทุกกรุ๊ปในเดือนที่เลือก', () => {
    assert.deepEqual(
      filterGroupScoreRows(rows, { months: ['08', '09'] }).map((x) => x.periodId).sort(),
      ['P2', 'P3'],
    );
    /* เดือนที่ไม่มีกรุ๊ป ไม่ดึงแถวอื่นเข้ามา */
    assert.deepEqual(filterGroupScoreRows(rows, { months: ['08', '01'] }).map((x) => x.periodId), ['P2']);
  });

  test('ไม่เลือกเดือนเลย = ทั้งปี (ไม่กรองออก)', () => {
    assert.equal(filterGroupScoreRows(rows, { months: [] }).length, rows.length);
    assert.equal(filterGroupScoreRows(rows, {}).length, rows.length);
  });

  test('เดือนใช้ร่วมกับตัวกรองอื่นแบบ "และ"', () => {
    assert.deepEqual(
      filterGroupScoreRows(rows, { months: ['08', '09'], country: 'JAPAN' }).map((x) => x.periodId),
      ['P3'],
    );
  });

  test('กรองตามปี', () => {
    assert.equal(filterGroupScoreRows(rows, { year: '2026' }).length, 3);
    assert.equal(filterGroupScoreRows(rows, { year: '2025' }).length, 0);
  });

  test('ตัวเลือกตัวกรองสร้างจากข้อมูลจริงในตาราง', () => {
    const o = groupScoreFilterOptions(rows);
    assert.deepEqual(o.countries, ['CHINA', 'JAPAN', 'VIETNAM']);
    assert.deepEqual(o.routes, ['CKG', 'DAD', 'KIX']);
    assert.deepEqual(o.years, ['2026']);
  });
});
