import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import type { ReportKind } from '@/hooks/use-reports';

/** A small "Report a problem" link that opens the report form about this item. */
export function ReportLink({ kind, refId, label }: { kind: ReportKind; refId: string; label?: string }) {
  return (
    <ThemedText
      type="link"
      role="link"
      onPress={() => router.push({ pathname: '/report', params: { kind, ref: refId, ...(label ? { label } : {}) } })}>
      ⚑ Report a problem
    </ThemedText>
  );
}
