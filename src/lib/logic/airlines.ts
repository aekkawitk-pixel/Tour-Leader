/**
 * สายการบินของงาน — การ์ด "สายการบินเดือนนี้" ที่หน้าหลักหัวหน้าทัวร์
 * รหัสสายการบินมาจากข้อมูลพีเรียด (airlineCode — เที่ยวบินขาไป หรือท้ายรหัสกรุ๊ป เช่น NRT-261008J-NH → NH)
 * ระบบยังไม่มี Master สายการบิน — ใช้ชื่อสายการบินที่บริษัททัวร์ใช้บ่อย (รหัส IATA) · ไม่รู้จัก = แสดงรหัสอย่างเดียว
 */

/** ชื่อสายการบินตามรหัส IATA (ที่พบบ่อยในกรุ๊ปทัวร์) */
const AIRLINE_NAMES: Record<string, string> = {
  // ไทย
  TG: 'Thai Airways', WE: 'Thai Smile', FD: 'Thai AirAsia', XJ: 'Thai AirAsia X', SL: 'Thai Lion Air', DD: 'Nok Air', PG: 'Bangkok Airways', VZ: 'Thai VietJet',
  // ญี่ปุ่น
  NH: 'ANA', JL: 'Japan Airlines', MM: 'Peach', GK: 'Jetstar Japan', ZG: 'ZIPAIR',
  // เกาหลี
  KE: 'Korean Air', OZ: 'Asiana', '7C': 'Jeju Air', LJ: 'Jin Air', TW: "T'way Air", BX: 'Air Busan', ZE: 'Eastar Jet',
  // จีน / ฮ่องกง / ไต้หวัน
  CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', '3U': 'Sichuan Airlines', HU: 'Hainan Airlines', AQ: '9 Air', ZH: 'Shenzhen Airlines',
  FM: 'Shanghai Airlines', SC: 'Shandong Airlines', '8L': 'Lucky Air', KY: 'Kunming Airlines', JD: 'Capital Airlines', A6: 'Air Travel', GJ: 'Loong Air',
  HO: 'Juneyao Air', '9C': 'Spring Airlines', MF: 'Xiamen Air', CX: 'Cathay Pacific', HX: 'Hong Kong Airlines', UO: 'HK Express',
  CI: 'China Airlines', BR: 'EVA Air', IT: 'Tigerair Taiwan', JX: 'Starlux',
  // อาเซียน / เอเชียใต้
  VN: 'Vietnam Airlines', VJ: 'VietJet Air', QH: 'Bamboo Airways', SQ: 'Singapore Airlines', TR: 'Scoot', MH: 'Malaysia Airlines', AK: 'AirAsia',
  GA: 'Garuda Indonesia', PR: 'Philippine Airlines', '5J': 'Cebu Pacific', UL: 'SriLankan', AI: 'Air India', '6E': 'IndiGo', QV: 'Lao Airlines', K6: 'Cambodia Angkor Air', '8M': 'Myanmar Airways',
  // ตะวันออกกลาง / ยุโรป / อื่น ๆ
  EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad', TK: 'Turkish Airlines', MS: 'EgyptAir', ET: 'Ethiopian', KC: 'Air Astana', HY: 'Uzbekistan Airways', A9: 'Georgian Airways', J2: 'AZAL',
  LH: 'Lufthansa', AF: 'Air France', KL: 'KLM', BA: 'British Airways', LX: 'Swiss', OS: 'Austrian', AY: 'Finnair', SU: 'Aeroflot', QF: 'Qantas',
};

export interface AirlineCount {
  code: string;
  /** ชื่อสายการบิน — ไม่รู้จัก = รหัส · ไม่ทราบ = "ไม่ระบุสายการบิน" */
  label: string;
  count: number;
}

/** รหัสสายการบินของพีเรียด — ใช้ airlineCode ก่อน ไม่มีจึงดูท้ายรหัสกรุ๊ป (ตัวท้ายหลัง "-" ยาว 2 ตัว) */
export function airlineCodeOf(p: { airlineCode?: string | null; groupCode?: string | null }): string {
  const code = (p.airlineCode ?? '').trim().toUpperCase();
  if (code) return code;
  const tail = (p.groupCode ?? '').trim().toUpperCase().split('-').pop() ?? '';
  return /^[A-Z0-9]{2}$/.test(tail) ? tail : '';
}

export const airlineName = (code: string) => (code ? AIRLINE_NAMES[code] ?? code : 'ไม่ระบุสายการบิน');

/** นับงานแยกสายการบิน — เรียงจากมากไปน้อย (เท่ากันเรียงตามชื่อ) · ไม่ทราบสายการบินไว้ท้าย */
export function airlineBreakdown(trips: { airlineCode?: string | null; groupCode?: string | null }[]): AirlineCount[] {
  const m = new Map<string, number>();
  for (const t of trips) {
    const code = airlineCodeOf(t);
    m.set(code, (m.get(code) ?? 0) + 1);
  }
  return [...m]
    .map(([code, count]) => ({ code, label: airlineName(code), count }))
    .sort((a, b) => Number(!a.code) - Number(!b.code) || b.count - a.count || a.label.localeCompare(b.label));
}
