/**
 * เทสต์ Airport Master
 *   - ป้องกันสนามบินซ้ำด้วย iata_code
 *   - ดึงเฉพาะสนามบินของประเทศ (country_code) — ไม่ปนประเทศอื่น
 *   - สนามบินยอดนิยมเรียงขึ้นก่อน
 *   - คงรหัสสนามบินเดิม (route id) ที่ระบบเคยใช้ → การจับคู่งานไม่พัง
 *   - geo.tourRoutes สร้างสนามบินจาก Airport Master ครบและไม่ซ้ำ id
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  AIRPORT_SEED,
  airports,
  airportsOfCountry,
  airportByIata,
  dedupeAirports,
} from '@/data/airports';
import { tourRoutes } from '@/data/geo';

/* --------------------------------- ชุด seed --------------------------------- */

describe('Airport Master', () => {
  test('ทุกสนามบินมี iata/country_code/ชื่อไทย-อังกฤษ/เมือง ครบ', () => {
    for (const a of airports) {
      assert.match(a.iata, /^[A-Z]{3}$/, `iata ผิด: ${a.iata}`);
      assert.match(a.countryCode, /^[A-Z]{2}$/, `country_code ผิด: ${a.iata}`);
      assert.ok(a.nameTh.trim() && a.nameEn.trim(), `ชื่อไม่ครบ: ${a.iata}`);
      assert.ok(a.cityTh.trim() && a.cityEn.trim(), `เมืองไม่ครบ: ${a.iata}`);
    }
  });

  test('ไม่มี iata ซ้ำ (ป้องกันข้อมูลซ้ำด้วย iata_code)', () => {
    const set = new Set(airports.map((a) => a.iata));
    assert.equal(set.size, airports.length);
  });

  test('dedupeAirports กันซ้ำและ idempotent', () => {
    const withDup = [...AIRPORT_SEED, AIRPORT_SEED[0], AIRPORT_SEED[1]];
    const once = dedupeAirports(withDup);
    assert.equal(once.length, airports.length);
    assert.equal(dedupeAirports(once).length, once.length);
  });

  test('airportByIata ค้นเจอและ case-insensitive', () => {
    assert.equal(airportByIata('nrt')?.iata, 'NRT');
    assert.equal(airportByIata('BKK')?.countryCode, 'TH');
    assert.equal(airportByIata('ZZZ'), undefined);
  });
});

/* ----------------------------- กรองรายประเทศ ----------------------------- */

describe('airportsOfCountry', () => {
  test('คืนเฉพาะสนามบินของประเทศนั้น — ไม่ปนประเทศอื่น', () => {
    const jp = airportsOfCountry('JP');
    assert.ok(jp.length > 0);
    assert.ok(jp.every((a) => a.countryCode === 'JP'));
    assert.ok(jp.some((a) => a.iata === 'NRT'));
    assert.ok(!jp.some((a) => a.iata === 'ICN')); // เกาหลีต้องไม่โผล่
  });

  test('รองรับ country_code ตัวพิมพ์เล็ก', () => {
    assert.deepEqual(
      airportsOfCountry('th').map((a) => a.iata),
      airportsOfCountry('TH').map((a) => a.iata),
    );
  });

  test('สนามบินยอดนิยมเรียงขึ้นก่อน', () => {
    const th = airportsOfCountry('TH');
    let seenNonPopular = false;
    for (const a of th) {
      if (!a.popular) seenNonPopular = true;
      else assert.ok(!seenNonPopular, `ยอดนิยม ${a.iata} อยู่หลังรายการไม่ยอดนิยม`);
    }
  });

  test('ประเทศที่ไม่มีสนามบินในชุดข้อมูลคืน []', () => {
    assert.deepEqual(airportsOfCountry('AQ'), []);
  });
});

/* ----------------------- เชื่อมกับ TourRoute (การจับคู่งาน) ----------------------- */

describe('สนามบินใน tourRoutes', () => {
  test('คงรหัสสนามบินเดิมที่หัวหน้าทัวร์/งานอ้างถึง', () => {
    for (const id of ['R-JP-A1', 'R-KR-A1', 'R-CN-A2', 'R-AU-A1', 'R-GE-A1']) {
      const r = tourRoutes.find((x) => x.id === id);
      assert.ok(r, `หาย route id: ${id}`);
      assert.equal(r?.routeType, 'airport');
    }
  });

  test('สนามบินใน Airport Master มี TourRoute ครบทุกตัว', () => {
    for (const a of airports) {
      assert.ok(
        tourRoutes.some((r) => r.id === a.id && r.routeType === 'airport'),
        `ไม่มี TourRoute ของสนามบิน ${a.iata}`,
      );
    }
  });

  test('ไม่มี route id ซ้ำ และรหัสสนามบิน (code) ตรงกับ Airport Master', () => {
    const ids = tourRoutes.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    const nrt = tourRoutes.find((r) => r.id === 'R-JP-A1');
    assert.equal(nrt?.code, 'NRT');
  });
});
