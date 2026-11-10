import type { Reminders } from '@/lib/reminders.types';

/** Web: no device notifications; Home shows a reminder banner instead. */
export const reminders: Reminders = {
  supported: false,
  async schedule() {
    return 'unsupported';
  },
  async cancel() {},
};
