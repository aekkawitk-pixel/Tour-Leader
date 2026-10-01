'use client';

/**
 * Hook โหลดข้อมูลที่อยู่ไทยครั้งเดียวตอน mount
 * - ยกเลิก request อัตโนมัติเมื่อ component ถูกถอดออก (กัน memory leak)
 * - สถานะ: loading → ready / error
 */

import { useEffect, useState } from 'react';
import { fetchGeography, type GeographyRow } from './thaiGeography';

export type GeographyStatus = 'loading' | 'ready' | 'error';

export interface UseThaiGeography {
  rows: GeographyRow[];
  status: GeographyStatus;
}

export function useThaiGeography(): UseThaiGeography {
  const [rows, setRows] = useState<GeographyRow[]>([]);
  const [status, setStatus] = useState<GeographyStatus>('loading');

  useEffect(() => {
    const controller = new AbortController();

    fetchGeography(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows(data);
        setStatus('ready');
      })
      .catch(() => {
        // ยกเลิกเอง (unmount) ไม่ถือเป็นข้อผิดพลาด
        if (controller.signal.aborted) return;
        setStatus('error');
      });

    return () => controller.abort();
  }, []);

  return { rows, status };
}
