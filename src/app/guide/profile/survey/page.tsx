'use client';

/**
 * คะแนนแบบสอบถาม — /guide/profile/survey
 * placeholder เพราะ SURVEY_RESPONSES ว่างเปล่าจริงทั้งระบบ (ยังไม่ได้นำเข้าไฟล์แบบสอบถามจริง)
 * ดู src/data/scores/groupScores.seed.ts
 */

import { Card, EmptyState } from '@/components/ui/Primitives';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideSurveyPage() {
  return (
    <div>
      <ProfileBackHeader title="คะแนนแบบสอบถาม" />
      <Card>
        <EmptyState
          icon="star"
          title="คะแนนแบบสอบถามของฉัน"
          description="ดูคะแนนแบบสอบถามรายกรุ๊ปของตัวเอง — ยังไม่มีข้อมูลนำเข้าในระบบ"
        />
      </Card>
    </div>
  );
}
