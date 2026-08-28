import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionDetail } from "@/lib/sessions/detail";
import { getMovieDetail } from "@/lib/movies/detail";
import { writeGroupRationale } from "@/lib/sessions/rationale";

const idSchema = z.string().uuid();
const bodySchema = z.object({ movieId: z.coerce.number().int().positive() });

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/rationale">) {
  const { id } = await ctx.params;
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid session" }, { status: 400 });
  }

  const bodyResult = bodySchema.safeParse(await request.json().catch(() => null));
  if (!bodyResult.success) {
    return Response.json({ error: "movieId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  // getClaims(), not getUser(): matches this route's sibling
  // recommendations route and /sessions/[id]/page.tsx.
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;
  if (typeof ownerId !== "string") {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const [session, movie] = await Promise.all([
      getSessionDetail(idResult.data, ownerId),
      getMovieDetail(bodyResult.data.movieId),
    ]);

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    if (!movie) {
      return Response.json({ error: "Movie not found" }, { status: 404 });
    }

    const rationale = await writeGroupRationale(movie, session.participants, process.env.OPENROUTER_API_KEY!);

    return Response.json({ rationale });
  } catch (error) {
    console.error(`POST /api/sessions/${idResult.data}/rationale failed`, error);
    return Response.json({ error: "Could not write rationale" }, { status: 500 });
  }
}
