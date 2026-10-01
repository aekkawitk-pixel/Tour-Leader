/**
 * ตัวแปลง Response จาก Zego API v1.5 → โครงสร้างภายใน (ZegoProgram / ZegoPeriod)
 *
 * ชื่อฟิลด์ทุกตัวอ้างตามเอกสาร https://www.zegoapi.com/document/v1.5
 * ชุดทดสอบนี้ล็อกกติกาสำคัญ: ไม่กุข้อมูลที่ API ไม่ได้ส่งมา และไม่กลืนความผิดปกติ
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZegoPrograms, readUpdatedAt, splitDateTime, toNumber } from '../src/lib/logic/zegoApi';
import { maskToken, scopeLabel, scopeQuery } from '../src/services/zegoConfigStore';
import { splitRoute, zegoSaleStatus, zegoSectors, zegoToTourPeriodMaster } from '../src/data/zego/zegoToMaster';
import { flightSummary, sectorSummary, splitFlightLegs } from '../src/lib/logic/guideBoard';

const sampleProgram = {
  ProductID: 101,
  ProductCode: 'JP-KIX-5D3N',
  ProductName: 'มหัศจรรย์ OSAKA KYOTO 5 วัน 3 คืน',
  CountryCode: 'JP',
  CountryName: 'JAPAN',
  Days: 5,
  Nights: 3,
  Periods: [
    {
      PeriodID: 9001,
      PeriodCode: 'KIX-260801A-TG',
      Bus: 'A',
      PeriodStartDate: '2026-08-01',
      PeriodEndDate: '2026-08-05',
      CountryCode: 'JP',
      CountryName: 'JAPAN',
      GroupSize: 30,
      Book: 12,
      Seat: 18,
      PeriodStatus: 'SELL',
      PeriodConfirm: 1,
      PeriodNew: 0,
      PeriodNote: 'ราคาโปรโมชั่น',
      Price: 39900,
      Deposit: 10000,
    },
  ],
};

describe('แปลง /programtours → ZegoProgram + ZegoPeriod', () => {
  test('แมปฟิลด์ระดับโปรแกรมครบ', () => {
    const { programs } = normalizeZegoPrograms([sampleProgram]);
    assert.equal(programs.length, 1);
    const p = programs[0];
    assert.equal(p.programCode, 'JP-KIX-5D3N');
    assert.equal(p.programName, 'มหัศจรรย์ OSAKA KYOTO 5 วัน 3 คืน');
    assert.equal(p.country, 'JAPAN');
    assert.equal(p.countryCode, 'JP');
    assert.equal(p.durationDays, 5);
    assert.equal(p.durationNights, 3);
    assert.equal(p.periodCount, 1);
    assert.equal(p.createdFromSampleFile, false, 'ข้อมูลจาก API ต้องไม่ถูกทำเครื่องหมายว่ามาจากไฟล์ตัวอย่าง');
  });

  test('แมปฟิลด์ระดับพีเรียดครบ และผูกกับโปรแกรมด้วย programCode', () => {
    const { periods } = normalizeZegoPrograms([sampleProgram]);
    const d = periods[0];
    assert.equal(d.programCode, 'JP-KIX-5D3N');
    assert.equal(d.groupCode, 'KIX-260801A-TG');
    assert.equal(d.bus, 'A');
    assert.equal(d.startDate, '2026-08-01');
    assert.equal(d.endDate, '2026-08-05');
    assert.equal(d.saleStatus, 'SELL');
    assert.equal(d.confirmStatus, 'CONFIRMED');
    assert.equal(d.totalSeats, 30);
    assert.equal(d.bookedSeats, 12);
    assert.equal(d.remainingSeats, 18);
    assert.equal(d.salePrice, 39900);
    assert.equal(d.remark, 'ราคาโปรโมชั่น');
    assert.deepEqual(d.importWarnings, [], 'ข้อมูลครบต้องไม่มีคำเตือน');
  });

  test('API ไม่มีข้อมูลหัวหน้าทัวร์ → ทุกพีเรียดเป็น "ยังไม่จัด" ไม่กุชื่อขึ้นมา', () => {
    const { periods } = normalizeZegoPrograms([sampleProgram]);
    assert.equal(periods[0].assignedTourLeaderName, null);
    assert.equal(periods[0].assignedTourLeaderType, null);
    assert.equal(periods[0].assignmentStatus, 'UNASSIGNED');
  });

  test('API ไม่มีเส้นตายออกตั๋ว → ปล่อยว่าง ไม่คำนวณจากวันเดินทาง', () => {
    const { periods } = normalizeZegoPrograms([sampleProgram]);
    assert.equal(periods[0].ticketDeadline, null);
    assert.equal(periods[0].ticketDeadlineText, null);
  });

  test('ที่นั่งไม่สอดคล้องกัน → บันทึกคำเตือน ไม่คำนวณทับให้ดูเหมือนถูก', () => {
    const bad = { ...sampleProgram, Periods: [{ ...sampleProgram.Periods[0], GroupSize: 30, Book: 12, Seat: 25 }] };
    const { periods } = normalizeZegoPrograms([bad]);
    assert.equal(periods[0].totalSeats, 30);
    assert.equal(periods[0].remainingSeats, 25, 'ต้องคงค่าที่ API ส่งมา');
    assert.ok(periods[0].importWarnings.some((w) => w.includes('ที่นั่งไม่สอดคล้อง')));
  });

  test('ที่นั่งคงเหลือติดลบ = overbook', () => {
    const over = { ...sampleProgram, Periods: [{ ...sampleProgram.Periods[0], GroupSize: 30, Book: 32, Seat: -2 }] };
    const { periods } = normalizeZegoPrograms([over]);
    assert.equal(periods[0].isOverbooked, true);
    assert.equal(periods[0].overbookedSeats, 2);
  });

  test('โปรแกรมที่ไม่มี ProductCode ถูกข้ามและรายงานไว้ ไม่หายเงียบ', () => {
    const { programs, skipped } = normalizeZegoPrograms([{ ProductID: 7, ProductName: 'ไม่มีรหัส' }, sampleProgram]);
    assert.equal(programs.length, 1);
    assert.equal(skipped.length, 1);
    assert.ok(skipped[0].includes('7'));
  });

  test('พีเรียดที่ขาดวันเดินทาง/รหัสกรุ๊ป → มีคำเตือนบอกว่าขาดอะไร', () => {
    const partial = { ...sampleProgram, Periods: [{ PeriodID: 1, Price: 100 }] };
    const { periods } = normalizeZegoPrograms([partial]);
    const w = periods[0].importWarnings.join(' ');
    assert.ok(w.includes('PeriodStartDate'));
    assert.ok(w.includes('PeriodEndDate'));
    assert.ok(w.includes('PeriodCode'));
  });

  test('seq เรียงต่อเนื่องข้ามโปรแกรม', () => {
    const second = { ...sampleProgram, ProductCode: 'TW-TPE-4D3N', Periods: [{ PeriodID: 2, PeriodCode: 'TPE-1', PeriodStartDate: '2026-09-01', PeriodEndDate: '2026-09-04' }] };
    const { periods } = normalizeZegoPrograms([sampleProgram, second]);
    assert.deepEqual(periods.map((p) => p.seq), [1, 2]);
  });

  test('ไม่ใช่ Array → คืนผลว่าง ไม่โยน error', () => {
    assert.deepEqual(normalizeZegoPrograms(null), { programs: [], periods: [], skipped: [] });
    assert.deepEqual(normalizeZegoPrograms({ error: 'x' }), { programs: [], periods: [], skipped: [] });
  });
});

describe('ตัวช่วยแปลงค่า', () => {
  test('toNumber — string/ตัวคั่นหลักพัน/ค่าว่าง', () => {
    assert.equal(toNumber('39,900'), 39900);
    assert.equal(toNumber(0), 0, '0 คือมีข้อมูลและเป็นศูนย์ ไม่ใช่ไม่มีข้อมูล');
    assert.equal(toNumber(''), null);
    assert.equal(toNumber(null), null);
    assert.equal(toNumber('ไม่ใช่ตัวเลข'), null);
  });

  test('splitDateTime — เวลา 00:00 ถือว่ายังไม่ระบุเวลา', () => {
    assert.deepEqual(splitDateTime('2026-08-01'), { date: '2026-08-01', time: null });
    assert.deepEqual(splitDateTime('2026-08-01 00:00:00'), { date: '2026-08-01', time: null });
    assert.deepEqual(splitDateTime('2026-08-01 06:30:00'), { date: '2026-08-01', time: '06:30' });
    assert.deepEqual(splitDateTime(''), { date: null, time: null });
  });

  test('hasExactWorkTime เป็นจริงเฉพาะเมื่อมีเวลาทั้งไปและกลับ', () => {
    const withTime = { ...sampleProgram, Periods: [{ ...sampleProgram.Periods[0], PeriodStartDate: '2026-08-01 06:30:00', PeriodEndDate: '2026-08-05 21:00:00' }] };
    assert.equal(normalizeZegoPrograms([withTime]).periods[0].hasExactWorkTime, true);
    assert.equal(normalizeZegoPrograms([sampleProgram]).periods[0].hasExactWorkTime, false);
  });

  test('readUpdatedAt — อ่าน PeriodUpdateDate', () => {
    assert.equal(readUpdatedAt({ PeriodUpdateDate: '2025-02-03 04:29:49' }), '2025-02-03 04:29:49');
    assert.equal(readUpdatedAt({}), null);
    assert.equal(readUpdatedAt(null), null);
  });
});

/* ------------- ค่าตั้งการเชื่อมต่อจากหน้า Setup ------------- */

describe('ค่าตั้งการเชื่อมต่อ (หน้าตั้งค่า Zego)', () => {
  const base = { token: 'abc', scopeKind: 'all' as const, scopeValue: '' };

  test('ขอบเขต "ทั้งหมด" ไม่ใส่ query', () => {
    assert.equal(scopeQuery(base), '');
    assert.equal(scopeLabel(base), 'ทั้งหมด');
  });

  test('ขอบเขตตามประเทศ / ISO / โปรแกรม ต่อ query ตรงกับ endpoint ของ Zego', () => {
    assert.equal(scopeQuery({ ...base, scopeKind: 'country', scopeValue: 'JP' }), '?country=JP');
    assert.equal(scopeQuery({ ...base, scopeKind: 'iso', scopeValue: 'JPN' }), '?iso=JPN');
    assert.equal(scopeQuery({ ...base, scopeKind: 'product', scopeValue: 'JP-KIX-5D3N' }), '?product=JP-KIX-5D3N');
  });

  test('เลือกขอบเขตแต่ไม่ใส่ค่า → ถือว่าดึงทั้งหมด ไม่ยิง query ที่ค้างเปล่า', () => {
    assert.equal(scopeQuery({ ...base, scopeKind: 'country', scopeValue: '   ' }), '');
    assert.equal(scopeLabel({ ...base, scopeKind: 'country', scopeValue: '' }), 'ทั้งหมด');
  });

  test('ค่าที่มีอักขระพิเศษถูก encode ไม่หลุดออกนอก query', () => {
    assert.equal(scopeQuery({ ...base, scopeKind: 'product', scopeValue: 'A/B&C' }), '?product=A%2FB%26C');
  });

  test('คำอธิบายขอบเขตอ่านรู้เรื่อง — เก็บติดไปกับข้อมูลที่นำเข้า', () => {
    assert.equal(scopeLabel({ ...base, scopeKind: 'country', scopeValue: 'JP' }), 'ประเทศ JP');
    assert.equal(scopeLabel({ ...base, scopeKind: 'product', scopeValue: 'X-1' }), 'โปรแกรม X-1');
  });

  test('maskToken ปิดบัง Token เหลือแค่ปลายท้าย ไม่โชว์ทั้งเส้น', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.payload.signature123';
    const masked = maskToken(jwt);
    assert.ok(!masked.includes('eyJhbGci'), 'ต้องไม่เห็นต้น Token');
    assert.ok(masked.endsWith('re123'));
    assert.equal(maskToken('short'), '••••');
  });
});

/* ------------- เที่ยวบิน (Flights[] ระดับโปรแกรม) ------------- */

describe('เที่ยวบินจาก /programtours', () => {
  const withFlights = {
    ...sampleProgram,
    Flights: [
      { AirlineCode: 'TG', AirlineName: 'THAI AIRWAYS', FlightNo: 'TG622', Route: 'BKK-KIX', DepartureTime: '23:59', ArrivalTime: '07:20' },
      { AirlineCode: 'TG', AirlineName: 'THAI AIRWAYS', FlightNo: 'TG623', Route: 'KIX-BKK', DepartureTime: '11:45', ArrivalTime: '15:45' },
    ],
  };

  test('แมปเที่ยวบินครบทุกฟิลด์', () => {
    const { programs } = normalizeZegoPrograms([withFlights]);
    assert.equal(programs[0].flights?.length, 2);
    assert.deepEqual(programs[0].flights?.[0], {
      airlineCode: 'TG', airlineName: 'THAI AIRWAYS', flightNo: 'TG622',
      route: 'BKK-KIX', departureTime: '23:59', arrivalTime: '07:20',
    });
  });

  test('เวลาเที่ยวบินเก็บเป็นข้อความตามที่ API ส่งมา ไม่แปลงเป็นวันที่', () => {
    const { programs } = normalizeZegoPrograms([withFlights]);
    assert.equal(typeof programs[0].flights?.[0].departureTime, 'string');
    assert.equal(programs[0].flights?.[1].arrivalTime, '15:45');
  });

  test('แถวที่ไม่มีทั้งเลขเที่ยวบินและเส้นทาง ถูกตัดทิ้ง ไม่เหลือบรรทัดเปล่า', () => {
    const noisy = { ...sampleProgram, Flights: [{ AirlineCode: 'TG' }, { FlightNo: 'TG622' }, { Route: 'BKK-KIX' }] };
    const { programs } = normalizeZegoPrograms([noisy]);
    assert.equal(programs[0].flights?.length, 2);
  });

  test('ไม่มี Flights มาด้วย → เป็น Array ว่าง ไม่ใช่ undefined ที่หน้าจอต้องคอยกัน', () => {
    const { programs } = normalizeZegoPrograms([sampleProgram]);
    assert.deepEqual(programs[0].flights, []);
  });

  test('สายการบิน/สนามบินระดับพีเรียดแยกจากเที่ยวบินระดับโปรแกรม', () => {
    const perPeriod = {
      ...sampleProgram,
      Periods: [{ ...sampleProgram.Periods[0], AirlineCode: 'XJ', AirlineName: 'THAI AIRASIA X', Airport: 'DMK' }],
    };
    const { periods } = normalizeZegoPrograms([perPeriod]);
    assert.equal(periods[0].airlineCode, 'XJ');
    assert.equal(periods[0].airlineName, 'THAI AIRASIA X');
    assert.equal(periods[0].airport, 'DMK');
  });
});

/* ------------- Zego → Tour Period Master (ข้อมูลกลางของทุกเมนู) ------------- */

describe('แปลง Zego → Tour Period Master', () => {
  const program = {
    id: 'ZEGO-ZGCAN-2605AQ', programCode: 'ZGCAN-2605AQ', programName: 'จีน กวางเจา จูไห่',
    rawProgramName: 'จีน กวางเจา จูไห่', country: 'CHINA', countryCode: 'CN',
    durationDays: 4, durationNights: 3, periodCount: 1, createdFromSampleFile: false,
    flights: [
      { airlineCode: 'AQ', airlineName: '9 AIR', flightNo: 'AQ1267', route: 'BKK-CAN', departureTime: '02:30:00', arrivalTime: '06:10:00' },
      { airlineCode: 'AQ', airlineName: '9 AIR', flightNo: 'AQ1267', route: 'CAN-BKK', departureTime: '23:30:00', arrivalTime: '01:25:00' },
    ],
  };
  const period = {
    id: 'ZEGO-PD-1', seq: 1, programId: program.id, programCode: 'ZGCAN-2605AQ', groupCode: 'can-260910e-aq',
    bus: 'A', country: 'CHINA', countryCode: 'CN', startDate: '2026-09-10', endDate: '2026-09-13',
    startDateTime: null, endDateTime: null, hasExactWorkTime: false, saleStatus: 'Book',
    confirmStatus: 'NOT_SPECIFIED', periodTags: [], ticketDeadline: null, ticketDeadlineText: null,
    paymentText: null, originalPrice: null, salePrice: 14990, totalSeats: 20, bookedSeats: 7,
    remainingSeats: 13, rawRemainingValue: '13', isOverbooked: false, overbookedSeats: 0,
    assignedTourLeaderName: null, assignedTourLeaderType: null, assignmentStatus: 'UNASSIGNED' as const,
    remark: 'ราคายังไม่รวมภาษีน้ำมัน', rawProgramName: 'จีน กวางเจา จูไห่',
    airlineCode: 'AQ', airlineName: '9 AIR', airport: 'SUVARNABHUMI',
    rawText: '', sourcePage: 0, importWarnings: [] as string[],
  };
  const build = () => zegoToTourPeriodMaster({
    programs: [program], periods: [period], importedAt: '2026-08-21T06:37:00.000Z', sourceUpdatedAt: '2026-08-21 13:19:55',
  });

  test('ได้ 1 พีเรียด พร้อมฟิลด์หลักที่ทุกเมนูใช้ร่วมกัน', () => {
    const [r] = build();
    assert.equal(r.groupCode, 'CAN-260910E-AQ', 'groupCode ต้อง uppercase เหมือนฝั่ง CSV');
    assert.equal(r.countryName, 'CHINA');
    assert.equal(r.startDate, '2026-09-10');
    assert.equal(r.endDate, '2026-09-13');
    assert.equal(r.durationNights, 3, 'คำนวณจากวันจริง');
    assert.equal(r.seatTotal, 20);
    assert.equal(r.seatBooked, 7);
    assert.equal(r.price, 14990);
    assert.equal(r.sourceSystem, 'REST');
    assert.equal(r.isActive, true);
  });

  test('สถานะขาย "Book" ของ Zego = SELL · ค่าดิบยังเก็บไว้ตรวจย้อนได้', () => {
    const [r] = build();
    assert.equal(r.saleStatus, 'SELL');
    assert.equal(r.sourceSellStatus, 'Book');
    assert.equal(zegoSaleStatus('NO SELL'), 'NO_SELL');
    assert.equal(zegoSaleStatus('Close'), 'CLOSED');
    assert.equal(zegoSaleStatus('อะไรไม่รู้'), 'SELL', 'ไม่ระบุว่าปิด = ยังขายอยู่');
  });

  test('เที่ยวบินกลายเป็น Sector พร้อมสนามบินต้นทาง/ปลายทาง', () => {
    const [r] = build();
    assert.equal(r.sectors.length, 2);
    assert.equal(r.sectors[0].flightNumber, 'AQ1267');
    assert.equal(r.departureAirportCode, 'BKK');
    assert.equal(r.arrivalAirportCode, 'CAN');
    assert.equal(r.route, 'BKK-CAN');
    assert.equal(r.firstSectorAirlineCode, 'AQ');
  });

  test('เวลาเที่ยวบินเป็นเวลาประจำเที่ยวบิน ไม่เอาไปต่อกับวันเดินทางจนได้วันที่ผิด', () => {
    const [r] = build();
    assert.equal(r.sectors[0].departureDateTime, null);
    assert.equal(r.sectors[0].arrivalDateTime, null);
  });

  test('ฟิลด์ที่ Zego ไม่มี ต้องเป็น null ไม่ใช่ค่าที่กุขึ้นมา', () => {
    const [r] = build();
    assert.equal(r.visaPrice, null);
    assert.equal(r.visaRegularPrice, null);
    assert.equal(r.commission, null);
    assert.equal(r.comStandard, null);
    assert.equal(r.periodStatusDetail, null);
    assert.equal(r.incName, null);
  });

  test('ไม่มีประเภทกรุ๊ปจากต้นทาง → ตั้ง COL และบันทึกไว้ว่าไม่ได้มาจากต้นทาง', () => {
    const [r] = build();
    assert.equal(r.periodStatus, 'COL');
    assert.ok(r.validationMessages.some((m) => m.includes('INC/COL')));
  });

  test('คำเตือนตอนนำเข้าติดมาด้วย และทำให้สถานะเป็น WARNING', () => {
    const withWarning = { ...period, importWarnings: ['ที่นั่งไม่สอดคล้อง'] };
    const [r] = zegoToTourPeriodMaster({ programs: [program], periods: [withWarning], importedAt: 'x' });
    assert.equal(r.validationStatus, 'WARNING');
    assert.ok(r.validationMessages.includes('ที่นั่งไม่สอดคล้อง'));
  });

  test('เรียงตามวันเดินทาง ไม่ขึ้นกับลำดับที่ API ส่งมา', () => {
    const later = { ...period, id: 'ZEGO-PD-2', groupCode: 'CAN-261008E-AQ', startDate: '2026-10-08', endDate: '2026-10-11' };
    const rows = zegoToTourPeriodMaster({ programs: [program], periods: [later, period], importedAt: 'x' });
    assert.deepEqual(rows.map((r) => r.startDate), ['2026-09-10', '2026-10-08']);
  });

  test('splitRoute อ่านเฉพาะรูปแบบที่มั่นใจ รูปแบบอื่นไม่เดา', () => {
    assert.deepEqual(splitRoute('BKK-CAN'), { from: 'BKK', to: 'CAN' });
    assert.deepEqual(splitRoute('bkk - can'), { from: 'BKK', to: 'CAN' });
    assert.equal(splitRoute('BKK CAN via HKG'), null);
    assert.equal(splitRoute(''), null);
  });
});

/* ------------- สรุปเที่ยวบินสำหรับแสดงบนการ์ดงาน ------------- */

describe('สรุปเที่ยวบิน (sectorSummary / flightSummary)', () => {
  const sector = (over = {}) => ({
    sectorSequence: 1, sectorType: 'OUTBOUND' as const, airlineCode: 'SC', flightNumber: 'SC8888',
    fromAirportCode: 'BKK', toAirportCode: 'TAO', departureDateTime: null, arrivalDateTime: null,
    departureTime: '02:30', arrivalTime: '06:10', ...over,
  });

  test('ครบทุกส่วน — เลขเที่ยวบิน เส้นทาง เวลา', () => {
    assert.equal(sectorSummary(sector()), 'SC8888 BKK–TAO 02:30–06:10');
  });

  test('ไม่มีเวลา → ตัดส่วนเวลาออก ไม่แสดงขีดค้างไว้', () => {
    assert.equal(sectorSummary(sector({ departureTime: null, arrivalTime: null })), 'SC8888 BKK–TAO');
  });

  test('ไม่มีสนามบิน → ตัดเส้นทางออก', () => {
    assert.equal(sectorSummary(sector({ fromAirportCode: '', toAirportCode: '' })), 'SC8888 02:30–06:10');
  });

  test('มีเวลาไปแต่ไม่มีเวลากลับ → แสดงขีดแทนฝั่งที่ไม่มี ไม่เดาเวลา', () => {
    assert.equal(sectorSummary(sector({ arrivalTime: null })), 'SC8888 BKK–TAO 02:30–—');
  });

  test('ไม่มีเที่ยวบินจากต้นทาง → คืนค่าว่าง (หน้าจอจะไม่แสดงบรรทัดนั้น)', () => {
    const period = { sectors: [] } as unknown as Parameters<typeof flightSummary>[0];
    assert.equal(flightSummary(period), '');
  });

  test('หลายช่วงบินต่อกันด้วยจุดคั่น', () => {
    const period = { sectors: [sector(), sector({ sectorSequence: 2, flightNumber: 'SC8889', fromAirportCode: 'TAO', toAirportCode: 'BKK', departureTime: '23:30', arrivalTime: '01:25' })] } as unknown as Parameters<typeof flightSummary>[0];
    assert.equal(flightSummary(period), 'SC8888 BKK–TAO 02:30–06:10 · SC8889 TAO–BKK 23:30–01:25');
  });

  test('เวลาจาก Zego ถูกตัดวินาทีก่อนเก็บลง Sector', () => {
    const withFlights = {
      ProductCode: 'P1', ProductName: 'x', CountryName: 'CHINA', CountryCode: 'CN',
      Flights: [{ AirlineCode: 'SC', FlightNo: 'SC8888', Route: 'BKK-TAO', DepartureTime: '02:30:00', ArrivalTime: '06:10:00' }],
      Periods: [{ PeriodID: 1, PeriodCode: 'G1', PeriodStartDate: '2026-09-01', PeriodEndDate: '2026-09-06' }],
    };
    const { programs, periods } = normalizeZegoPrograms([withFlights]);
    const [row] = zegoToTourPeriodMaster({ programs, periods, importedAt: 'x' });
    assert.equal(row.sectors[0].departureTime, '02:30');
    assert.equal(row.sectors[0].arrivalTime, '06:10');
    assert.equal(row.sectors[0].departureDateTime, null, 'วันที่-เวลาเต็มยังต้องเป็น null');
  });
});

/* ------------- แยกขาไป/ขากลับ (splitFlightLegs) ------------- */

describe('แยกขาไป/ขากลับจากเส้นทางจริง', () => {
  const leg = (seq: number, from: string, to: string, flightNo = `X${seq}`) => ({
    sectorSequence: seq, sectorType: 'OUTBOUND' as const, airlineCode: 'TK', flightNumber: flightNo,
    fromAirportCode: from, toAirportCode: to, departureDateTime: null, arrivalDateTime: null,
    departureTime: null, arrivalTime: null,
  });

  test('4 ช่วง เข้าเมืองหนึ่งออกอีกเมือง — แยกได้ถูกต้อง ไม่ใช่หารครึ่งมั่ว', () => {
    /* TLL เข้า · VNO ออก — เคสจริงจากทัวร์บอลติก */
    const sectors = [leg(1, 'BKK', 'IST', 'TK69'), leg(2, 'IST', 'TLL', 'TK1421'), leg(3, 'VNO', 'IST', 'TK1410'), leg(4, 'IST', 'BKK', 'TK68')];
    const { outbound, inbound } = splitFlightLegs(sectors);
    assert.deepEqual(outbound.map((x) => x.flightNumber), ['TK69', 'TK1421']);
    assert.deepEqual(inbound.map((x) => x.flightNumber), ['TK1410', 'TK68']);
  });

  test('ขาไป-ขากลับไม่เท่ากัน — ขาไปต่อเครื่อง ขากลับบินตรง', () => {
    const sectors = [leg(1, 'BKK', 'IST'), leg(2, 'IST', 'TLL'), leg(3, 'TLL', 'BKK')];
    const { outbound, inbound } = splitFlightLegs(sectors);
    assert.equal(outbound.length, 2);
    assert.equal(inbound.length, 1);
  });

  test('2 ช่วงไป-กลับธรรมดา', () => {
    const { outbound, inbound } = splitFlightLegs([leg(1, 'BKK', 'TAO'), leg(2, 'TAO', 'BKK')]);
    assert.equal(outbound.length, 1);
    assert.equal(inbound.length, 1);
  });

  test('ไม่ได้กลับถึงสนามบินต้นทาง → ไม่แยก คืนเป็นขาไปทั้งหมด', () => {
    const sectors = [leg(1, 'BKK', 'IST'), leg(2, 'IST', 'TLL')];
    const { outbound, inbound } = splitFlightLegs(sectors);
    assert.equal(outbound.length, 2);
    assert.equal(inbound.length, 0);
  });

  test('ไม่มีรหัสสนามบิน → ไม่เดา คืนเป็นขาไปทั้งหมด', () => {
    const sectors = [leg(1, '', ''), leg(2, '', '')];
    assert.equal(splitFlightLegs(sectors).inbound.length, 0);
  });

  test('ช่วงเดียว → ไม่มีขากลับ', () => {
    assert.equal(splitFlightLegs([leg(1, 'BKK', 'TAO')]).inbound.length, 0);
    assert.equal(splitFlightLegs([]).outbound.length, 0);
  });

  test('zegoSectors ตั้ง sectorType ตามขาไป/ขากลับจริง ไม่ใช่ช่วงแรกเป็นไปที่เหลือเป็นกลับ', () => {
    const flights = [
      { airlineCode: 'TK', airlineName: 'TURKISH', flightNo: 'TK69', route: 'BKK-IST', departureTime: '22:45', arrivalTime: '04:45' },
      { airlineCode: 'TK', airlineName: 'TURKISH', flightNo: 'TK1421', route: 'IST-TLL', departureTime: '06:50', arrivalTime: '10:20' },
      { airlineCode: 'TK', airlineName: 'TURKISH', flightNo: 'TK1410', route: 'VNO-IST', departureTime: '20:25', arrivalTime: '23:25' },
      { airlineCode: 'TK', airlineName: 'TURKISH', flightNo: 'TK68', route: 'IST-BKK', departureTime: '01:50', arrivalTime: '15:25' },
    ];
    assert.deepEqual(zegoSectors(flights).map((s) => s.sectorType), ['OUTBOUND', 'OUTBOUND', 'INBOUND', 'INBOUND']);
  });
});
