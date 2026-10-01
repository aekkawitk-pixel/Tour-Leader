/**
 * ใบเบิกเงินทดรองตัวอย่าง — แปลงจากไฟล์ "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" จริง (ด้วย parseAdvanceXls)
 *
 * ผูกกับกรุ๊ปด้วย "รหัสกรุ๊ป" ตอนโหลด (ไม่ใช่ internalId ตายตัว — พีเรียดมาจาก Zego/CSV คนละชุดได้)
 * กรุ๊ปที่ไม่มีในข้อมูลโปรแกรมทัวร์ของเครื่องนั้น = ข้ามไป ไม่แสดง
 * เพิ่มตัวอย่างกรุ๊ปอื่น: นำเข้าผ่านปุ่ม "นำเข้าใบเบิก (.xls)" ที่หน้าเบิกจ่าย หรือเพิ่มผลอ่านไฟล์ต่อท้ายรายการนี้
 */

import type { ParsedAdvanceDoc } from '@/lib/import/advanceXls';

export const ADVANCE_SAMPLE_DOCS: ParsedAdvanceDoc[] = [
  {
    "fileName": "EXPOP26090218.xls",
    "ref": "EXPOP26090218",
    "groupCode": "KIX-261001K-MM",
    "programName": "ZGKIX-2648MM : โอซาก้า คามิโคจิ ชิราคาวาโกะ เกียวโต ชมใบไม้เปลี่ยนสี (อิสระ 1 วัน) 6 วัน 4 คืน",
    "travelDates": "01/10/26 - 06/10/26",
    "pax": "34 ท่าน + 1 TL",
    "printedBy": "คุณเอกวิทย์ กิจเพิ่มเกียรติ (เอก)",
    "printedAt": "30/09/26 เวลา : 10:18",
    "contact": "นางมุกดา หมื่นศรี (มุกดา)",
    "items": [
      {
        "no": 1,
        "category": "ค่าเข้าชมสถานที่",
        "purpose": "Kiyomizu Temple",
        "description": "",
        "quantity": 34,
        "unitPrice": 500,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 17000
      },
      {
        "no": 2,
        "category": "ค่าเข้าชมสถานที่",
        "purpose": "Katsuoji Temple",
        "description": "",
        "quantity": 34,
        "unitPrice": 500,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 17000
      },
      {
        "no": 3,
        "category": "ค่าเบ็ดเตล็ด",
        "purpose": "ค่าทางด่วน",
        "description": "ค่าเบ็ดเตล็ด",
        "quantity": 1,
        "unitPrice": 150000,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 150000
      },
      {
        "no": 4,
        "category": "ค่าเบ็ดเตล็ด",
        "purpose": "ค่าอาหารคนขับ",
        "description": "วันละ 2,500 เยน (เที่ยง 1,000+ค่ำ 1,500)",
        "quantity": 4,
        "unitPrice": 2500,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 10000
      },
      {
        "no": 5,
        "category": "ค่าเบ็ดเตล็ด",
        "purpose": "ค่าอาหารมื้ออิสระ",
        "description": "ไกด์",
        "quantity": 7,
        "unitPrice": 1500,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 10500
      },
      {
        "no": 6,
        "category": "ค่าเบ็ดเตล็ด",
        "purpose": "ค่าโทรศัพท์ (เส้นทางญี่ปุ่น)",
        "description": "ค่าโทรศัพท์ ระหว่างเดินทาง",
        "quantity": 4,
        "unitPrice": 1000,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 4000
      },
      {
        "no": 7,
        "category": "ค่าเบ็ดเตล็ด",
        "purpose": "ค่าน้ำ (เส้นทางญี่ปุ่น)",
        "description": "ค่าน้ำ ระหว่างเดินทาง",
        "quantity": 34,
        "unitPrice": 400,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 13600
      },
      {
        "no": 8,
        "category": "ค่าเบ็ดเตล็ด",
        "purpose": "ค่ารถไฟวันอิสระ",
        "description": "รถไฟวันอิสระ (เส้นทางญี่ปุ่น)",
        "quantity": 1,
        "unitPrice": 2000,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 2000
      },
      {
        "no": 9,
        "category": "ค่าโรงแรม",
        "purpose": "ค่าโรงแรม/ที่พัก",
        "description": "Hotel Koyo 2 คืน",
        "quantity": 1,
        "unitPrice": 450000,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 450000
      },
      {
        "no": 10,
        "category": "ค่าโรงแรม",
        "purpose": "ค่าโรงแรม/ที่พัก",
        "description": "Sarasa Hotel Namba 2 คืน",
        "quantity": 1,
        "unitPrice": 470300,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 470300
      },
      {
        "no": 11,
        "category": "ค่ายานพาหนะ",
        "purpose": "Tabist Bus",
        "description": "วันละ 76,000 เยน",
        "quantity": 4,
        "unitPrice": 76000,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 304000
      },
      {
        "no": 12,
        "category": "ค่าอาหาร",
        "purpose": "156 Restaurant Lucky",
        "description": "ลูกค้า",
        "quantity": 34,
        "unitPrice": 2035,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 69190
      },
      {
        "no": 13,
        "category": "ค่าอาหาร",
        "purpose": "156 Restaurant Lucky",
        "description": "ไกด์ครึ่งราคา",
        "quantity": 1,
        "unitPrice": 1017,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 1017
      },
      {
        "no": 14,
        "category": "ค่าอาหาร",
        "purpose": "Ikoro Sumochaya",
        "description": "ลูกค้า (ไกด์ฟรี)",
        "quantity": 34,
        "unitPrice": 2000,
        "discount": 0,
        "currency": "JPY",
        "fxRate": 0.2057,
        "amount": 68000
      }
    ],
    "fileTotal": 1586607,
    "totalsByCurrency": {
      "JPY": 1586607
    },
    "warnings": []
  }
];
