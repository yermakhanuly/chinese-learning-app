export type ReminderResult = 'scheduled' | 'denied' | 'unsupported';

export type Reminders = {
  /** Device notifications exist on this platform (iPhone yes, web no). */
  supported: boolean;
  /** Asks for permission if needed, then schedules one notification a day at hour:minute. */
  schedule(hour: number, minute: number): Promise<ReminderResult>;
  cancel(): Promise<void>;
};
