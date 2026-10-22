'use client';

/**
 * คะแนนแบบสอบถาม — /guide/profile/survey
 * placeholder เพราะ SURVEY_RESPONSES ว่างเปล่าจริงทั้งระบบ (ยังไม่ได้นำเข้าไฟล์แบบสอบถามจริง)
 * ดู src/data/scores/groupScores.seed.ts
 * ใช้แพทเทิร์น "ยังไม่เปิดใช้งาน" ของธีม v3 (เดียวกับทุกหน้าที่รอข้อมูล/API)
 */

import { ProfileBackHeader } from '../ProfileBackHeader';
import { GuideComingSoon } from '../../GuideUi';

export default function GuideSurveyPage() {
  return (
    <div>
      <ProfileBackHeader title="คะแนนแบบสอบถาม" />
      <GuideComingSoon
        icon="star"
        description="คะแนนแบบสอบถามรายกรุ๊ปจากลูกทัวร์ยังไม่มีข้อมูลนำเข้าในระบบ"
      />
    </div>
  );
}
