'use client';

/**
 * ลำดับไกด์ที่ผู้ใช้ปัจจุบันจัดไว้ — โหลดใหม่ทุกครั้งที่สลับ User (Header) · บันทึกทันทีที่เปลี่ยน
 */

import { useCallback, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { readPreferredGuideOrder, writePreferredGuideOrder } from '@/services/preferredGuideOrderStore';
import { saveErrorMessage } from '@/services/browserStorage';

export function usePreferredGuideOrder(): {
  /** รหัสหัวหน้าทัวร์เรียงตามลำดับที่ผู้ใช้คนนี้ตั้งไว้ — ยังไม่เคยตั้งคืนอาร์เรย์ว่าง */
  order: string[];
  setOrder: (next: string[]) => void;
} {
  const { currentUser, pushToast } = useDemo();

  // สลับ User (Header) แล้วต้องอ่านลำดับของคนใหม่ทันที — รีเซ็ตค่าตอน render แทนการใช้ effect
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [loadedFor, setLoadedFor] = useState(currentUser.id);
  const [order, setOrderState] = useState<string[]>(() => readPreferredGuideOrder(currentUser.id));
  if (loadedFor !== currentUser.id) {
    setLoadedFor(currentUser.id);
    setOrderState(readPreferredGuideOrder(currentUser.id));
  }

  const setOrder = useCallback(
    (next: string[]) => {
      setOrderState(next);
      try {
        writePreferredGuideOrder(currentUser.id, next);
      } catch (err) {
        pushToast('error', 'บันทึกลำดับไกด์ไม่สำเร็จ', saveErrorMessage(err));
      }
    },
    [currentUser.id, pushToast],
  );

  return { order, setOrder };
}
