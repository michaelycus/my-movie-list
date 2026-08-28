import type { SupabaseClient } from "@supabase/supabase-js";

/** Logs one usage event (build-plan feature 19b) for the admin dashboard
 * (19c) to aggregate later. Best-effort - errors are logged, never thrown,
 * matching seen.ts/admin.ts's pattern: a logging failure must never break
 * the real action it's attached to.
 *
 * Plain .insert(), never .insert().select(): usage_events' insert policy
 * has no matching SELECT policy for anon/non-admin callers, and Postgres
 * applies SELECT-policy visibility to INSERT...RETURNING - .select() would
 * turn a valid insert into an RLS error (see the usage_events migration's
 * own comment, from 19a). */
export async function logUsageEvent(
  client: SupabaseClient,
  eventType: string,
  userId: string | null,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { error } = await client
      .from("usage_events")
      .insert({ event_type: eventType, user_id: userId, meta });

    if (error) throw error;
  } catch (error) {
    console.error(`logUsageEvent(${eventType}) failed`, error);
  }
}
