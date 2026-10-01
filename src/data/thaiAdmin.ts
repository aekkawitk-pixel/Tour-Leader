/**
 * Master เขตปกครองไทย — จังหวัด / อำเภอ-เขต / ตำบล-แขวง / รหัสไปรษณีย์
 *
 * ⚠️ ข้อมูลสำหรับ Demo:
 *   - "จังหวัด" ครบทั้ง 77 จังหวัด (ใช้เป็นรายการมาตรฐานชุดเดียวของทั้งระบบ)
 *   - "อำเภอ/เขต" และ "ตำบล/แขวง" มีเฉพาะจังหวัดตัวอย่าง — จังหวัดที่ยังไม่มีข้อมูล
 *     ผู้ใช้พิมพ์เองได้ (ระบบแจ้งไว้ในช่องกรอก) และไม่บล็อกการบันทึก
 *
 * โหลดครั้งเดียวตอน import — การพิมพ์ค้นหาไม่มีการเรียกข้อมูลใหม่
 */

export interface Province {
  /** รหัสจังหวัดมาตรฐาน (2 หลัก) */
  code: string;
  nameTh: string;
  nameEn: string;
}

export interface District {
  /** รหัสอำเภอ (4 หลัก) */
  code: string;
  provinceCode: string;
  nameTh: string;
  nameEn: string;
}

export interface Subdistrict {
  districtCode: string;
  nameTh: string;
  nameEn: string;
  /** รหัสไปรษณีย์ — บางตำบลมีมากกว่าหนึ่งรหัส */
  postalCodes: string[];
}

/** กรุงเทพมหานคร ใช้คำว่า "เขต / แขวง" แทน "อำเภอ / ตำบล" */
export const BANGKOK_CODE = '10';

export const PROVINCES: Province[] = [
  { code: '10', nameTh: 'กรุงเทพมหานคร', nameEn: 'Bangkok' },
  { code: '11', nameTh: 'สมุทรปราการ', nameEn: 'Samut Prakan' },
  { code: '12', nameTh: 'นนทบุรี', nameEn: 'Nonthaburi' },
  { code: '13', nameTh: 'ปทุมธานี', nameEn: 'Pathum Thani' },
  { code: '14', nameTh: 'พระนครศรีอยุธยา', nameEn: 'Phra Nakhon Si Ayutthaya' },
  { code: '15', nameTh: 'อ่างทอง', nameEn: 'Ang Thong' },
  { code: '16', nameTh: 'ลพบุรี', nameEn: 'Lopburi' },
  { code: '17', nameTh: 'สิงห์บุรี', nameEn: 'Sing Buri' },
  { code: '18', nameTh: 'ชัยนาท', nameEn: 'Chai Nat' },
  { code: '19', nameTh: 'สระบุรี', nameEn: 'Saraburi' },
  { code: '20', nameTh: 'ชลบุรี', nameEn: 'Chonburi' },
  { code: '21', nameTh: 'ระยอง', nameEn: 'Rayong' },
  { code: '22', nameTh: 'จันทบุรี', nameEn: 'Chanthaburi' },
  { code: '23', nameTh: 'ตราด', nameEn: 'Trat' },
  { code: '24', nameTh: 'ฉะเชิงเทรา', nameEn: 'Chachoengsao' },
  { code: '25', nameTh: 'ปราจีนบุรี', nameEn: 'Prachinburi' },
  { code: '26', nameTh: 'นครนายก', nameEn: 'Nakhon Nayok' },
  { code: '27', nameTh: 'สระแก้ว', nameEn: 'Sa Kaeo' },
  { code: '30', nameTh: 'นครราชสีมา', nameEn: 'Nakhon Ratchasima' },
  { code: '31', nameTh: 'บุรีรัมย์', nameEn: 'Buriram' },
  { code: '32', nameTh: 'สุรินทร์', nameEn: 'Surin' },
  { code: '33', nameTh: 'ศรีสะเกษ', nameEn: 'Sisaket' },
  { code: '34', nameTh: 'อุบลราชธานี', nameEn: 'Ubon Ratchathani' },
  { code: '35', nameTh: 'ยโสธร', nameEn: 'Yasothon' },
  { code: '36', nameTh: 'ชัยภูมิ', nameEn: 'Chaiyaphum' },
  { code: '37', nameTh: 'อำนาจเจริญ', nameEn: 'Amnat Charoen' },
  { code: '38', nameTh: 'บึงกาฬ', nameEn: 'Bueng Kan' },
  { code: '39', nameTh: 'หนองบัวลำภู', nameEn: 'Nong Bua Lamphu' },
  { code: '40', nameTh: 'ขอนแก่น', nameEn: 'Khon Kaen' },
  { code: '41', nameTh: 'อุดรธานี', nameEn: 'Udon Thani' },
  { code: '42', nameTh: 'เลย', nameEn: 'Loei' },
  { code: '43', nameTh: 'หนองคาย', nameEn: 'Nong Khai' },
  { code: '44', nameTh: 'มหาสารคาม', nameEn: 'Maha Sarakham' },
  { code: '45', nameTh: 'ร้อยเอ็ด', nameEn: 'Roi Et' },
  { code: '46', nameTh: 'กาฬสินธุ์', nameEn: 'Kalasin' },
  { code: '47', nameTh: 'สกลนคร', nameEn: 'Sakon Nakhon' },
  { code: '48', nameTh: 'นครพนม', nameEn: 'Nakhon Phanom' },
  { code: '49', nameTh: 'มุกดาหาร', nameEn: 'Mukdahan' },
  { code: '50', nameTh: 'เชียงใหม่', nameEn: 'Chiang Mai' },
  { code: '51', nameTh: 'ลำพูน', nameEn: 'Lamphun' },
  { code: '52', nameTh: 'ลำปาง', nameEn: 'Lampang' },
  { code: '53', nameTh: 'อุตรดิตถ์', nameEn: 'Uttaradit' },
  { code: '54', nameTh: 'แพร่', nameEn: 'Phrae' },
  { code: '55', nameTh: 'น่าน', nameEn: 'Nan' },
  { code: '56', nameTh: 'พะเยา', nameEn: 'Phayao' },
  { code: '57', nameTh: 'เชียงราย', nameEn: 'Chiang Rai' },
  { code: '58', nameTh: 'แม่ฮ่องสอน', nameEn: 'Mae Hong Son' },
  { code: '60', nameTh: 'นครสวรรค์', nameEn: 'Nakhon Sawan' },
  { code: '61', nameTh: 'อุทัยธานี', nameEn: 'Uthai Thani' },
  { code: '62', nameTh: 'กำแพงเพชร', nameEn: 'Kamphaeng Phet' },
  { code: '63', nameTh: 'ตาก', nameEn: 'Tak' },
  { code: '64', nameTh: 'สุโขทัย', nameEn: 'Sukhothai' },
  { code: '65', nameTh: 'พิษณุโลก', nameEn: 'Phitsanulok' },
  { code: '66', nameTh: 'พิจิตร', nameEn: 'Phichit' },
  { code: '67', nameTh: 'เพชรบูรณ์', nameEn: 'Phetchabun' },
  { code: '70', nameTh: 'ราชบุรี', nameEn: 'Ratchaburi' },
  { code: '71', nameTh: 'กาญจนบุรี', nameEn: 'Kanchanaburi' },
  { code: '72', nameTh: 'สุพรรณบุรี', nameEn: 'Suphan Buri' },
  { code: '73', nameTh: 'นครปฐม', nameEn: 'Nakhon Pathom' },
  { code: '74', nameTh: 'สมุทรสาคร', nameEn: 'Samut Sakhon' },
  { code: '75', nameTh: 'สมุทรสงคราม', nameEn: 'Samut Songkhram' },
  { code: '76', nameTh: 'เพชรบุรี', nameEn: 'Phetchaburi' },
  { code: '77', nameTh: 'ประจวบคีรีขันธ์', nameEn: 'Prachuap Khiri Khan' },
  { code: '80', nameTh: 'นครศรีธรรมราช', nameEn: 'Nakhon Si Thammarat' },
  { code: '81', nameTh: 'กระบี่', nameEn: 'Krabi' },
  { code: '82', nameTh: 'พังงา', nameEn: 'Phang Nga' },
  { code: '83', nameTh: 'ภูเก็ต', nameEn: 'Phuket' },
  { code: '84', nameTh: 'สุราษฎร์ธานี', nameEn: 'Surat Thani' },
  { code: '85', nameTh: 'ระนอง', nameEn: 'Ranong' },
  { code: '86', nameTh: 'ชุมพร', nameEn: 'Chumphon' },
  { code: '90', nameTh: 'สงขลา', nameEn: 'Songkhla' },
  { code: '91', nameTh: 'สตูล', nameEn: 'Satun' },
  { code: '92', nameTh: 'ตรัง', nameEn: 'Trang' },
  { code: '93', nameTh: 'พัทลุง', nameEn: 'Phatthalung' },
  { code: '94', nameTh: 'ปัตตานี', nameEn: 'Pattani' },
  { code: '95', nameTh: 'ยะลา', nameEn: 'Yala' },
  { code: '96', nameTh: 'นราธิวาส', nameEn: 'Narathiwat' },
];

/**
 * อำเภอ / เขต — ข้อมูลตัวอย่างของจังหวัดที่ใช้บ่อยใน Demo
 * จังหวัดอื่นยังไม่มีข้อมูล → ช่องอำเภอเปิดให้พิมพ์เอง
 */
export const DISTRICTS: District[] = [
  /* กรุงเทพมหานคร (เขต) */
  { code: '1001', provinceCode: '10', nameTh: 'พระนคร', nameEn: 'Phra Nakhon' },
  { code: '1004', provinceCode: '10', nameTh: 'บางรัก', nameEn: 'Bang Rak' },
  { code: '1005', provinceCode: '10', nameTh: 'ปทุมวัน', nameEn: 'Pathum Wan' },
  { code: '1009', provinceCode: '10', nameTh: 'ห้วยขวาง', nameEn: 'Huai Khwang' },
  { code: '1010', provinceCode: '10', nameTh: 'คลองเตย', nameEn: 'Khlong Toei' },
  { code: '1017', provinceCode: '10', nameTh: 'บางเขน', nameEn: 'Bang Khen' },
  { code: '1026', provinceCode: '10', nameTh: 'จตุจักร', nameEn: 'Chatuchak' },
  { code: '1030', provinceCode: '10', nameTh: 'ราชเทวี', nameEn: 'Ratchathewi' },
  { code: '1033', provinceCode: '10', nameTh: 'วัฒนา', nameEn: 'Watthana' },
  { code: '1035', provinceCode: '10', nameTh: 'สาทร', nameEn: 'Sathon' },

  /* นนทบุรี */
  { code: '1201', provinceCode: '12', nameTh: 'เมืองนนทบุรี', nameEn: 'Mueang Nonthaburi' },
  { code: '1206', provinceCode: '12', nameTh: 'ปากเกร็ด', nameEn: 'Pak Kret' },

  /* ปทุมธานี */
  { code: '1301', provinceCode: '13', nameTh: 'เมืองปทุมธานี', nameEn: 'Mueang Pathum Thani' },
  { code: '1303', provinceCode: '13', nameTh: 'ธัญบุรี', nameEn: 'Thanyaburi' },

  /* ชลบุรี */
  { code: '2001', provinceCode: '20', nameTh: 'เมืองชลบุรี', nameEn: 'Mueang Chonburi' },
  { code: '2004', provinceCode: '20', nameTh: 'ศรีราชา', nameEn: 'Si Racha' },
  { code: '2005', provinceCode: '20', nameTh: 'บางละมุง', nameEn: 'Bang Lamung' },

  /* เชียงใหม่ */
  { code: '5001', provinceCode: '50', nameTh: 'เมืองเชียงใหม่', nameEn: 'Mueang Chiang Mai' },
  { code: '5006', provinceCode: '50', nameTh: 'สันทราย', nameEn: 'San Sai' },
  { code: '5012', provinceCode: '50', nameTh: 'หางดง', nameEn: 'Hang Dong' },

  /* นครศรีธรรมราช */
  { code: '8001', provinceCode: '80', nameTh: 'เมืองนครศรีธรรมราช', nameEn: 'Mueang Nakhon Si Thammarat' },

  /* ภูเก็ต */
  { code: '8301', provinceCode: '83', nameTh: 'เมืองภูเก็ต', nameEn: 'Mueang Phuket' },
  { code: '8302', provinceCode: '83', nameTh: 'กะทู้', nameEn: 'Kathu' },
  { code: '8303', provinceCode: '83', nameTh: 'ถลาง', nameEn: 'Thalang' },

  /* สงขลา */
  { code: '9001', provinceCode: '90', nameTh: 'เมืองสงขลา', nameEn: 'Mueang Songkhla' },
  { code: '9011', provinceCode: '90', nameTh: 'หาดใหญ่', nameEn: 'Hat Yai' },
];

/** ตำบล / แขวง — พร้อมรหัสไปรษณีย์ (บางแห่งมีหลายรหัส) */
export const SUBDISTRICTS: Subdistrict[] = [
  /* กรุงเทพฯ — บางรัก */
  { districtCode: '1004', nameTh: 'สีลม', nameEn: 'Si Lom', postalCodes: ['10500'] },
  { districtCode: '1004', nameTh: 'สุริยวงศ์', nameEn: 'Suriyawong', postalCodes: ['10500'] },
  { districtCode: '1004', nameTh: 'มหาพฤฒาราม', nameEn: 'Maha Phruettharam', postalCodes: ['10500'] },

  /* กรุงเทพฯ — ปทุมวัน */
  { districtCode: '1005', nameTh: 'ลุมพินี', nameEn: 'Lumphini', postalCodes: ['10330'] },
  { districtCode: '1005', nameTh: 'ปทุมวัน', nameEn: 'Pathum Wan', postalCodes: ['10330'] },

  /* กรุงเทพฯ — ห้วยขวาง */
  { districtCode: '1009', nameTh: 'ห้วยขวาง', nameEn: 'Huai Khwang', postalCodes: ['10310'] },
  { districtCode: '1009', nameTh: 'บางกะปิ', nameEn: 'Bang Kapi', postalCodes: ['10310'] },
  // ตำบลที่มีหลายรหัสไปรษณีย์ — ผู้ใช้ต้องเลือกเอง
  { districtCode: '1009', nameTh: 'สามเสนนอก', nameEn: 'Sam Sen Nok', postalCodes: ['10310', '10320'] },

  /* กรุงเทพฯ — คลองเตย */
  { districtCode: '1010', nameTh: 'คลองเตย', nameEn: 'Khlong Toei', postalCodes: ['10110'] },
  { districtCode: '1010', nameTh: 'คลองตัน', nameEn: 'Khlong Tan', postalCodes: ['10110'] },
  { districtCode: '1010', nameTh: 'พระโขนง', nameEn: 'Phra Khanong', postalCodes: ['10110'] },

  /* กรุงเทพฯ — บางเขน */
  { districtCode: '1017', nameTh: 'อนุสาวรีย์', nameEn: 'Anusawari', postalCodes: ['10220'] },
  { districtCode: '1017', nameTh: 'ท่าแร้ง', nameEn: 'Tha Raeng', postalCodes: ['10220', '10230'] },

  /* กรุงเทพฯ — จตุจักร */
  { districtCode: '1026', nameTh: 'ลาดยาว', nameEn: 'Lat Yao', postalCodes: ['10900'] },
  { districtCode: '1026', nameTh: 'จันทรเกษม', nameEn: 'Chantharakasem', postalCodes: ['10900'] },
  { districtCode: '1026', nameTh: 'จอมพล', nameEn: 'Chom Phon', postalCodes: ['10900'] },

  /* กรุงเทพฯ — ราชเทวี */
  { districtCode: '1030', nameTh: 'ทุ่งพญาไท', nameEn: 'Thung Phaya Thai', postalCodes: ['10400'] },
  { districtCode: '1030', nameTh: 'ถนนพญาไท', nameEn: 'Thanon Phaya Thai', postalCodes: ['10400'] },
  { districtCode: '1030', nameTh: 'มักกะสัน', nameEn: 'Makkasan', postalCodes: ['10400'] },

  /* กรุงเทพฯ — วัฒนา */
  { districtCode: '1033', nameTh: 'คลองเตยเหนือ', nameEn: 'Khlong Toei Nuea', postalCodes: ['10110'] },
  { districtCode: '1033', nameTh: 'คลองตันเหนือ', nameEn: 'Khlong Tan Nuea', postalCodes: ['10110'] },
  { districtCode: '1033', nameTh: 'พระโขนงเหนือ', nameEn: 'Phra Khanong Nuea', postalCodes: ['10110'] },

  /* กรุงเทพฯ — สาทร */
  { districtCode: '1035', nameTh: 'ทุ่งวัดดอน', nameEn: 'Thung Wat Don', postalCodes: ['10120'] },
  { districtCode: '1035', nameTh: 'ยานนาวา', nameEn: 'Yannawa', postalCodes: ['10120'] },
  { districtCode: '1035', nameTh: 'ทุ่งมหาเมฆ', nameEn: 'Thung Maha Mek', postalCodes: ['10120'] },

  /* กรุงเทพฯ — พระนคร */
  { districtCode: '1001', nameTh: 'พระบรมมหาราชวัง', nameEn: 'Phra Borom Maha Ratchawang', postalCodes: ['10200'] },
  { districtCode: '1001', nameTh: 'บวรนิเวศ', nameEn: 'Bowon Niwet', postalCodes: ['10200'] },

  /* นนทบุรี */
  { districtCode: '1201', nameTh: 'สวนใหญ่', nameEn: 'Suan Yai', postalCodes: ['11000'] },
  { districtCode: '1201', nameTh: 'บางกระสอ', nameEn: 'Bang Kraso', postalCodes: ['11000'] },
  { districtCode: '1206', nameTh: 'ปากเกร็ด', nameEn: 'Pak Kret', postalCodes: ['11120'] },
  { districtCode: '1206', nameTh: 'บางตลาด', nameEn: 'Bang Talat', postalCodes: ['11120'] },

  /* ปทุมธานี */
  { districtCode: '1301', nameTh: 'บางปรอก', nameEn: 'Bang Prok', postalCodes: ['12000'] },
  { districtCode: '1303', nameTh: 'ประชาธิปัตย์', nameEn: 'Prachathipat', postalCodes: ['12130'] },

  /* ชลบุรี */
  { districtCode: '2001', nameTh: 'บางปลาสร้อย', nameEn: 'Bang Pla Soi', postalCodes: ['20000'] },
  { districtCode: '2004', nameTh: 'ศรีราชา', nameEn: 'Si Racha', postalCodes: ['20110'] },
  { districtCode: '2004', nameTh: 'สุรศักดิ์', nameEn: 'Surasak', postalCodes: ['20110'] },
  { districtCode: '2005', nameTh: 'หนองปรือ', nameEn: 'Nong Prue', postalCodes: ['20150'] },

  /* เชียงใหม่ */
  { districtCode: '5001', nameTh: 'ศรีภูมิ', nameEn: 'Si Phum', postalCodes: ['50200'] },
  { districtCode: '5001', nameTh: 'สุเทพ', nameEn: 'Suthep', postalCodes: ['50200'] },
  { districtCode: '5001', nameTh: 'ช้างคลาน', nameEn: 'Chang Khlan', postalCodes: ['50100'] },
  { districtCode: '5006', nameTh: 'สันทรายหลวง', nameEn: 'San Sai Luang', postalCodes: ['50210'] },
  { districtCode: '5012', nameTh: 'หางดง', nameEn: 'Hang Dong', postalCodes: ['50230'] },

  /* นครศรีธรรมราช */
  { districtCode: '8001', nameTh: 'ในเมือง', nameEn: 'Nai Mueang', postalCodes: ['80000'] },
  { districtCode: '8001', nameTh: 'ท่าวัง', nameEn: 'Tha Wang', postalCodes: ['80000'] },

  /* ภูเก็ต */
  { districtCode: '8301', nameTh: 'ตลาดใหญ่', nameEn: 'Talat Yai', postalCodes: ['83000'] },
  { districtCode: '8301', nameTh: 'ตลาดเหนือ', nameEn: 'Talat Nuea', postalCodes: ['83000'] },
  { districtCode: '8301', nameTh: 'ราไวย์', nameEn: 'Rawai', postalCodes: ['83100'] },
  { districtCode: '8302', nameTh: 'กะทู้', nameEn: 'Kathu', postalCodes: ['83120'] },
  { districtCode: '8302', nameTh: 'ป่าตอง', nameEn: 'Patong', postalCodes: ['83150'] },
  { districtCode: '8303', nameTh: 'เชิงทะเล', nameEn: 'Choeng Thale', postalCodes: ['83110'] },

  /* สงขลา */
  { districtCode: '9001', nameTh: 'บ่อยาง', nameEn: 'Bo Yang', postalCodes: ['90000'] },
  { districtCode: '9011', nameTh: 'หาดใหญ่', nameEn: 'Hat Yai', postalCodes: ['90110'] },
  { districtCode: '9011', nameTh: 'คอหงส์', nameEn: 'Kho Hong', postalCodes: ['90110'] },
];

/* --------------------------------- ค้นหา --------------------------------- */

const normalize = (value: string) => value.trim().toLowerCase();

/** ค้นหาจังหวัดจากชื่อไทย / อังกฤษ / บางส่วนของชื่อ · ค่าว่าง = คืนทั้งหมด */
export function searchProvinces(query: string): Province[] {
  const q = normalize(query);
  if (!q) return PROVINCES;
  return PROVINCES.filter(
    (p) => p.nameTh.toLowerCase().includes(q) || p.nameEn.toLowerCase().includes(q),
  );
}

export function findProvinceByName(name: string): Province | undefined {
  const q = normalize(name);
  return PROVINCES.find((p) => p.nameTh.toLowerCase() === q || p.nameEn.toLowerCase() === q);
}

export function findProvinceByCode(code?: string): Province | undefined {
  if (!code) return undefined;
  return PROVINCES.find((p) => p.code === code);
}

/** อำเภอ/เขตของจังหวัดนั้น — ไม่มีข้อมูล = คืนอาร์เรย์ว่าง (ช่องจะเปิดให้พิมพ์เอง) */
export function districtsOf(provinceCode?: string): District[] {
  if (!provinceCode) return [];
  return DISTRICTS.filter((d) => d.provinceCode === provinceCode);
}

export function searchDistricts(provinceCode: string | undefined, query: string): District[] {
  const q = normalize(query);
  const list = districtsOf(provinceCode);
  if (!q) return list;
  return list.filter(
    (d) => d.nameTh.toLowerCase().includes(q) || d.nameEn.toLowerCase().includes(q),
  );
}

export function findDistrictByName(
  provinceCode: string | undefined,
  name: string,
): District | undefined {
  const q = normalize(name);
  return districtsOf(provinceCode).find(
    (d) => d.nameTh.toLowerCase() === q || d.nameEn.toLowerCase() === q,
  );
}

export function subdistrictsOf(districtCode?: string): Subdistrict[] {
  if (!districtCode) return [];
  return SUBDISTRICTS.filter((s) => s.districtCode === districtCode);
}

export function searchSubdistricts(
  districtCode: string | undefined,
  query: string,
): Subdistrict[] {
  const q = normalize(query);
  const list = subdistrictsOf(districtCode);
  if (!q) return list;
  return list.filter(
    (s) => s.nameTh.toLowerCase().includes(q) || s.nameEn.toLowerCase().includes(q),
  );
}

export function findSubdistrictByName(
  districtCode: string | undefined,
  name: string,
): Subdistrict | undefined {
  const q = normalize(name);
  return subdistrictsOf(districtCode).find(
    (s) => s.nameTh.toLowerCase() === q || s.nameEn.toLowerCase() === q,
  );
}

/** รหัสไปรษณีย์ของตำบล — ว่าง = ไม่มีข้อมูล · 1 รายการ = เติมให้อัตโนมัติ · >1 = ให้ผู้ใช้เลือก */
export function postalCodesOf(districtCode: string | undefined, subdistrictName: string): string[] {
  return findSubdistrictByName(districtCode, subdistrictName)?.postalCodes ?? [];
}

/* ------------------------------- ป้ายกำกับ ------------------------------- */

export const isBangkok = (provinceCode?: string) => provinceCode === BANGKOK_CODE;

/** กรุงเทพฯ ใช้ "เขต / แขวง" · จังหวัดอื่นใช้ "อำเภอ / ตำบล" */
export const districtLabel = (provinceCode?: string) => (isBangkok(provinceCode) ? 'เขต' : 'อำเภอ');
export const subdistrictLabel = (provinceCode?: string) =>
  isBangkok(provinceCode) ? 'แขวง' : 'ตำบล';
