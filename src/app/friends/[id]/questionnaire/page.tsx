import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFriend } from "@/lib/friends/list";
import { getCalibrationMovies, getGenres } from "@/lib/movies/browse";
import { QuestionnaireForm } from "@/components/friends/QuestionnaireForm";
import { PosterCalibration } from "@/components/friends/PosterCalibration";

export default async function QuestionnairePage({
  params,
}: PageProps<"/friends/[id]/questionnaire">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;

  if (typeof ownerId !== "string") {
    return (
      <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Sign in to manage friends.
        </p>
      </main>
    );
  }

  let friend;
  let genres;
  let calibrationMovies;
  try {
    [friend, genres, calibrationMovies] = await Promise.all([
      getFriend(id, ownerId),
      getGenres(),
      getCalibrationMovies(),
    ]);
  } catch (error) {
    console.error("Failed to load questionnaire", error);
    return (
      <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load this right now. Try refreshing the page.
        </p>
      </main>
    );
  }

  if (!friend) notFound();

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <Link href="/friends" className="w-fit text-sm text-neon-cyan hover:underline">
        ← Back to friends
      </Link>
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {friend.displayName}&apos;s taste profile
      </h1>
      <PosterCalibration
        friendId={friend.id}
        movies={calibrationMovies}
        initialPicks={friend.calibrationPicks}
      />
      <QuestionnaireForm friendId={friend.id} answers={friend.answers} genres={genres} />
    </main>
  );
}
