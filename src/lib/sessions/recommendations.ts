import type { SupabaseClient } from "@supabase/supabase-js";
import type { HardFilters } from "@/types/questionnaire";
import type { GroupRankedMovie } from "@/types/recommendation";
import { blendTasteEmbedding, parseEmbeddingVector } from "@/lib/friends/taste";
import { getOrEmbedQuery } from "@/lib/search/retrieve";
import { scoreGroup } from "@/lib/sessions/scoreGroup";

export interface ParticipantScoringInput {
  participantId: string;
  moodTags: string[];
  moodNote: string | null;
  maxRuntimeOverride: number | null;
  tasteEmbedding: number[] | null;
  hardFilters: HardFilters;
}

export interface GroupRecommendations {
  scoredParticipantIds: string[];
  movies: GroupRankedMovie[];
}

/** Turns tonight's mood into one embeddable string, or null when the
 * participant gave neither tags nor a note - mirrors taste.ts's pattern of
 * skipping empty clauses rather than embedding a blank line. */
export function buildMoodQueryText(moodTags: string[], moodNote: string | null): string | null {
  const lines: string[] = [];
  if (moodTags.length > 0) {
    lines.push(`Tonight's mood tends toward: ${moodTags.join(", ")}.`);
  }
  if (moodNote) {
    lines.push(moodNote);
  }
  return lines.length > 0 ? lines.join(" ") : null;
}

const PERMISSIVE_HARD_FILTERS: HardFilters = {
  maxRuntime: null,
  minAgeCeiling: null,
  blockedGenres: [],
  subtitlesOk: true,
};

/** Defensive parse of the `friends.hard_filters` jsonb column, mirroring
 * mood.ts's toSessionConstraints - a friend who never finished the
 * questionnaire has `hard_filters: {}` (the column default), which parses to
 * a fully permissive HardFilters rather than a null the caller must branch
 * on. */
export function parseHardFilters(raw: unknown): HardFilters {
  const obj = (raw ?? {}) as Partial<HardFilters>;
  return {
    maxRuntime: typeof obj.maxRuntime === "number" ? obj.maxRuntime : null,
    minAgeCeiling: typeof obj.minAgeCeiling === "number" ? obj.minAgeCeiling : null,
    blockedGenres: Array.isArray(obj.blockedGenres) ? obj.blockedGenres : PERMISSIVE_HARD_FILTERS.blockedGenres,
    subtitlesOk: typeof obj.subtitlesOk === "boolean" ? obj.subtitlesOk : true,
  };
}

/** Unions every seated participant's hard filters into the room's combined
 * filters (project-overview.md §5.2) - every participant counts here, not
 * just scored ones, since a runtime cap or blocked genre should apply
 * room-wide even for someone contributing no personal score. Each
 * participant's own tonight-only maxRuntimeOverride (feature 13) wins over
 * their stored hard_filters.maxRuntime when set. subtitlesOk is deliberately
 * not combined here - see current-feature.md's Out of scope note. */
export function combineHardFilters(
  inputs: Pick<ParticipantScoringInput, "maxRuntimeOverride" | "hardFilters">[],
  youngestViewerAge: number | null
): { maxRuntime: number | null; minAgeCeiling: number | null; blockedGenres: number[] } {
  const runtimes = inputs
    .map((input) => input.maxRuntimeOverride ?? input.hardFilters.maxRuntime)
    .filter((value): value is number => value !== null);

  const ages = [youngestViewerAge, ...inputs.map((input) => input.hardFilters.minAgeCeiling)].filter(
    (value): value is number => value !== null
  );

  const blockedGenres = [...new Set(inputs.flatMap((input) => input.hardFilters.blockedGenres))];

  return {
    maxRuntime: runtimes.length > 0 ? Math.min(...runtimes) : null,
    minAgeCeiling: ages.length > 0 ? Math.min(...ages) : null,
    blockedGenres,
  };
}

/** Resolves each scored participant's query embedding (project-overview.md
 * §5.2's "taste_embedding blended with tonight's mood vector"), applying the
 * host/untasted-participant rule confirmed for 14b: no taste_embedding falls
 * back to mood-only, and no mood either excludes the participant from
 * scoring entirely. Excluded participants are simply absent from both
 * returned arrays, which stay aligned index-for-index. */
export async function resolveParticipantEmbeddings(
  client: SupabaseClient,
  apiKey: string,
  inputs: Pick<ParticipantScoringInput, "participantId" | "moodTags" | "moodNote" | "tasteEmbedding">[]
): Promise<{ scoredParticipantIds: string[]; embeddings: number[][] }> {
  const scoredParticipantIds: string[] = [];
  const embeddings: number[][] = [];

  for (const input of inputs) {
    const moodText = buildMoodQueryText(input.moodTags, input.moodNote);

    if (input.tasteEmbedding) {
      const embedding = moodText
        ? blendTasteEmbedding(input.tasteEmbedding, [
            { embedding: await getOrEmbedQuery(client, apiKey, moodText), liked: true },
          ])
        : input.tasteEmbedding;
      scoredParticipantIds.push(input.participantId);
      embeddings.push(embedding);
      continue;
    }

    if (moodText) {
      scoredParticipantIds.push(input.participantId);
      embeddings.push(await getOrEmbedQuery(client, apiKey, moodText));
    }
    // No taste embedding and no mood: excluded from scoring entirely.
  }

  return { scoredParticipantIds, embeddings };
}

/** Dedupes seen-movie rows into the id array `scoreGroup` needs. Room-wide,
 * not per-participant - matches combineHardFilters' "every participant
 * counts" reasoning: a film any seated person (host included) has already
 * seen is off the table for the whole group. */
export function collectSeenMovieIds(rows: { movie_id: number }[]): number[] {
  return [...new Set(rows.map((row) => row.movie_id))];
}

interface SessionRow {
  id: string;
  youngest_viewer_age: number | null;
}

interface ParticipantRow {
  id: string;
  friend_id: string | null;
  mood_tags: string[];
  mood_note: string | null;
  constraints: unknown;
}

interface FriendScoringRow {
  id: string;
  taste_embedding: unknown;
  hard_filters: unknown;
}

function maxRuntimeFromConstraints(raw: unknown): number | null {
  const maxRuntime = (raw as { maxRuntime?: unknown } | null)?.maxRuntime;
  return typeof maxRuntime === "number" ? maxRuntime : null;
}

/** Gathers a real session's participants and friends, resolves their query
 * embeddings and combined hard filters, and ranks the catalog via 14a's
 * score_group RPC. Scoped by id and owner_id explicitly, not RLS alone, same
 * as getSessionDetail. */
export async function getGroupRecommendations(
  client: SupabaseClient,
  apiKey: string,
  sessionId: string,
  ownerId: string
): Promise<GroupRecommendations | null> {
  const { data: session, error: sessionError } = await client
    .from("sessions")
    .select("id, youngest_viewer_age")
    .eq("id", sessionId)
    .eq("owner_id", ownerId)
    .maybeSingle()
    .returns<SessionRow | null>();

  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: participantRows, error: participantsError } = await client
    .from("session_participants")
    .select("id, friend_id, mood_tags, mood_note, constraints")
    .eq("session_id", session.id)
    .returns<ParticipantRow[]>();

  if (participantsError) throw participantsError;

  const friendIds = (participantRows ?? [])
    .map((row) => row.friend_id)
    .filter((friendId): friendId is string => friendId !== null);

  const { data: friendRows, error: friendsError } =
    friendIds.length > 0
      ? await client
          .from("friends")
          .select("id, taste_embedding, hard_filters")
          .in("id", friendIds)
          .returns<FriendScoringRow[]>()
      : { data: [] as FriendScoringRow[], error: null };

  if (friendsError) throw friendsError;

  const friendsById = new Map((friendRows ?? []).map((friend) => [friend.id, friend]));

  const inputs: ParticipantScoringInput[] = (participantRows ?? []).map((row) => {
    const friend = row.friend_id ? friendsById.get(row.friend_id) : undefined;
    return {
      participantId: row.id,
      moodTags: row.mood_tags,
      moodNote: row.mood_note,
      maxRuntimeOverride: maxRuntimeFromConstraints(row.constraints),
      tasteEmbedding: friend?.taste_embedding ? parseEmbeddingVector(friend.taste_embedding) : null,
      hardFilters: parseHardFilters(friend?.hard_filters),
    };
  });

  const { scoredParticipantIds, embeddings } = await resolveParticipantEmbeddings(client, apiKey, inputs);
  const filters = combineHardFilters(inputs, session.youngest_viewer_age);

  // Room-wide seen-list exclusion (build-plan feature 18): the host's own
  // seen rows have friend_id null, so both branches of this filter are
  // needed, not just "in friendIds".
  const seenFilter =
    friendIds.length > 0 ? `friend_id.is.null,friend_id.in.(${friendIds.join(",")})` : "friend_id.is.null";
  const { data: seenRows, error: seenError } = await client
    .from("seen_movies")
    .select("movie_id")
    .eq("owner_id", ownerId)
    .or(seenFilter);

  if (seenError) throw seenError;

  const movies = await scoreGroup(client, {
    embeddings,
    maxRuntime: filters.maxRuntime,
    minAgeCeiling: filters.minAgeCeiling,
    blockedGenres: filters.blockedGenres,
    excludedMovieIds: collectSeenMovieIds(seenRows ?? []),
  });

  return { scoredParticipantIds, movies };
}
