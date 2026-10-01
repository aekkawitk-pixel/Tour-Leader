/**
 * รหัสสนามบิน (IATA) → ประเทศ (ISO alpha-2) — ตารางสำรองสำหรับ "หาประเทศปลายทางจากหัวรหัสกรุ๊ป" เท่านั้น
 *
 * Airport Master (airportSeed) มีราว 100 สนามบินสำหรับให้เลือกเส้นทาง แต่รหัสกรุ๊ปจาก Zego ใช้ปลายทางกว้างกว่านั้นมาก
 * (CKG ฉงชิ่ง · TAO ชิงเต่า · HBE อเล็กซานเดรีย ฯลฯ ไม่มีใน Master) — ตารางนี้ใช้ตรวจประเทศอย่างเดียว
 * ไม่ได้เพิ่มเข้าตัวเลือกสนามบิน/เส้นทาง · อ่าน Airport Master ก่อนเสมอ แล้วค่อยมาที่นี่
 * เพิ่มรหัสใหม่ได้ที่นี่เมื่อพบกรุ๊ปที่ประเทศยังไม่ถูกตรวจ
 */
const IATA_COUNTRY: Record<string, string> = {
  // จีน
  CKG: 'CN', TAO: 'CN', YIH: 'CN', KMG: 'CN', URC: 'CN', XIY: 'CN', HGH: 'CN', NKG: 'CN', WUH: 'CN', CGO: 'CN',
  TSN: 'CN', SHE: 'CN', DLC: 'CN', HRB: 'CN', XMN: 'CN', FOC: 'CN', NNG: 'CN', KWL: 'CN', KWE: 'CN', LJG: 'CN',
  JHG: 'CN', DYG: 'CN', ZUH: 'CN', SYX: 'CN', HAK: 'CN', LXA: 'CN', XNN: 'CN', LHW: 'CN', TYN: 'CN', SJW: 'CN',
  HET: 'CN', CGQ: 'CN', YNJ: 'CN', JJN: 'CN', SWA: 'CN', WNZ: 'CN', NGB: 'CN', KHN: 'CN', HFE: 'CN', TNA: 'CN',
  YNT: 'CN', INC: 'CN', DSN: 'CN', ENH: 'CN', YIW: 'CN', SHA: 'CN', LZO: 'CN', MIG: 'CN', JZH: 'CN', WDS: 'CN',
  JGS: 'CN', KRL: 'CN', KHG: 'CN', AKU: 'CN', HTN: 'CN', YIN: 'CN', DQA: 'CN', WEH: 'CN', CZX: 'CN', HYN: 'CN',
  // ฮ่องกง / มาเก๊า / ไต้หวัน
  HKG: 'HK', MFM: 'MO', TPE: 'TW', TSA: 'TW', KHH: 'TW', RMQ: 'TW', TNN: 'TW',
  // ญี่ปุ่น
  NRT: 'JP', HND: 'JP', KIX: 'JP', ITM: 'JP', NGO: 'JP', CTS: 'JP', FUK: 'JP', OKA: 'JP', SDJ: 'JP', KMQ: 'JP',
  TOY: 'JP', HKD: 'JP', AOJ: 'JP', AXT: 'JP', HIJ: 'JP', OKJ: 'JP', KOJ: 'JP', KMJ: 'JP', NGS: 'JP', MYJ: 'JP',
  TAK: 'JP', FSZ: 'JP', IBR: 'JP', UKB: 'JP', KIJ: 'JP', AKJ: 'JP', MMB: 'JP', OBO: 'JP', KUH: 'JP',
  // เกาหลี
  ICN: 'KR', GMP: 'KR', PUS: 'KR', CJU: 'KR', TAE: 'KR', CJJ: 'KR', MWX: 'KR',
  // มองโกเลีย
  UBN: 'MN', ULN: 'MN',
  // เวียดนาม / ลาว / กัมพูชา / เมียนมา
  HAN: 'VN', SGN: 'VN', DAD: 'VN', CXR: 'VN', PQC: 'VN', HUI: 'VN', DLI: 'VN', VDO: 'VN', HPH: 'VN', VCA: 'VN', DIN: 'VN',
  VTE: 'LA', LPQ: 'LA', PKZ: 'LA', PNH: 'KH', REP: 'KH', SAI: 'KH', KOS: 'KH', RGN: 'MM', MDL: 'MM', NYT: 'MM',
  // ASEAN อื่น ๆ
  SIN: 'SG', KUL: 'MY', BKI: 'MY', PEN: 'MY', LGK: 'MY', KCH: 'MY', CGK: 'ID', DPS: 'ID', MNL: 'PH', CEB: 'PH', MPH: 'PH', BWN: 'BN',
  // เอเชียใต้
  DEL: 'IN', BOM: 'IN', BLR: 'IN', MAA: 'IN', CCU: 'IN', GAY: 'IN', VNS: 'IN', IXL: 'IN', SXR: 'IN', ATQ: 'IN', JAI: 'IN', GOI: 'IN',
  KTM: 'NP', PBH: 'BT', CMB: 'LK', MLE: 'MV', DAC: 'BD', ISB: 'PK', LHE: 'PK', KHI: 'PK',
  // เอเชียกลาง
  ALA: 'KZ', NQZ: 'KZ', TAS: 'UZ', SKD: 'UZ', FRU: 'KG', DYU: 'TJ',
  // ตะวันออกกลาง / คอเคซัส / ตุรกี
  DXB: 'AE', AUH: 'AE', DOH: 'QA', JED: 'SA', RUH: 'SA', MED: 'SA', AMM: 'JO', AQJ: 'JO', TLV: 'IL', BAH: 'BH', MCT: 'OM', KWI: 'KW', IKA: 'IR',
  IST: 'TR', SAW: 'TR', ESB: 'TR', ADB: 'TR', AYT: 'TR', NAV: 'TR', ASR: 'TR', DLM: 'TR', BJV: 'TR',
  TBS: 'GE', KUT: 'GE', BUS: 'GE', GYD: 'AZ', EVN: 'AM',
  // แอฟริกา
  CAI: 'EG', HBE: 'EG', HRG: 'EG', SSH: 'EG', LXR: 'EG', ASW: 'EG', RMF: 'EG',
  CMN: 'MA', RAK: 'MA', TUN: 'TN', NBO: 'KE', MBA: 'KE', JRO: 'TZ', ZNZ: 'TZ', DAR: 'TZ', ADD: 'ET', MRU: 'MU', SEZ: 'SC',
  JNB: 'ZA', CPT: 'ZA', VFA: 'ZW', LVI: 'ZM', WDH: 'NA',
  // ยุโรป
  LHR: 'GB', LGW: 'GB', MAN: 'GB', EDI: 'GB', CDG: 'FR', ORY: 'FR', NCE: 'FR', LYS: 'FR', FRA: 'DE', MUC: 'DE', BER: 'DE', DUS: 'DE', HAM: 'DE',
  FCO: 'IT', MXP: 'IT', VCE: 'IT', NAP: 'IT', FLR: 'IT', MAD: 'ES', BCN: 'ES', AGP: 'ES', LIS: 'PT', OPO: 'PT',
  ZRH: 'CH', GVA: 'CH', BSL: 'CH', AMS: 'NL', BRU: 'BE', VIE: 'AT', SZG: 'AT', INN: 'AT', PRG: 'CZ', BUD: 'HU', WAW: 'PL', KRK: 'PL',
  ATH: 'GR', JTR: 'GR', JMK: 'GR', DUB: 'IE', CPH: 'DK', ARN: 'SE', GOT: 'SE', OSL: 'NO', BGO: 'NO', TOS: 'NO', HEL: 'FI', RVN: 'FI', KEF: 'IS',
  ZAG: 'HR', DBV: 'HR', SPU: 'HR', LJU: 'SI', BEG: 'RS', OTP: 'RO', SOF: 'BG', TLL: 'EE', RIX: 'LV', VNO: 'LT', LUX: 'LU', MLA: 'MT', TIA: 'AL',
  SVO: 'RU', DME: 'RU', VKO: 'RU', LED: 'RU', VVO: 'RU', IKT: 'RU', KJA: 'RU', MMK: 'RU',
  // อเมริกา
  JFK: 'US', EWR: 'US', LAX: 'US', SFO: 'US', SEA: 'US', ORD: 'US', LAS: 'US', HNL: 'US', ANC: 'US', FAI: 'US', MIA: 'US', BOS: 'US', IAD: 'US',
  YVR: 'CA', YYZ: 'CA', YUL: 'CA', YYC: 'CA', YZF: 'CA', MEX: 'MX', CUN: 'MX', GRU: 'BR', GIG: 'BR', EZE: 'AR', USH: 'AR', FTE: 'AR',
  LIM: 'PE', CUZ: 'PE', SCL: 'CL', PUQ: 'CL', BOG: 'CO', UIO: 'EC', GPS: 'EC', HAV: 'CU',
  // โอเชียเนีย
  SYD: 'AU', MEL: 'AU', BNE: 'AU', PER: 'AU', ADL: 'AU', OOL: 'AU', CNS: 'AU', AYQ: 'AU', DRW: 'AU', HBA: 'AU',
  AKL: 'NZ', CHC: 'NZ', ZQN: 'NZ', WLG: 'NZ', NAN: 'FJ', PPT: 'PF',
};

/** ประเทศ (alpha-2) ของรหัสสนามบินจากตารางสำรอง — ไม่พบคืน undefined */
export function countryOfIata(iata: string): string | undefined {
  return IATA_COUNTRY[iata.trim().toUpperCase()];
}
