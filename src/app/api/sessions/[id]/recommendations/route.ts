import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getGroupRecommendations } from "@/lib/sessions/recommendations";

const idSchema = z.string().uuid();

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/recommendations">) {
  const { id } = await ctx.params;
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid session" }, { status: 400 });
  }

  const supabase = await createClient();
  // getClaims(), not getUser(): matches /sessions/[id]/page.tsx's existing
  // pattern for this same protected route.
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;
  if (typeof ownerId !== "string") {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const result = await getGroupRecommendations(
      supabase,
      process.env.OPENAI_API_KEY!,
      idResult.data,
      ownerId
    );

    if (!result) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    console.error(`GET /api/sessions/${idResult.data}/recommendations failed`, error);
    return Response.json({ error: "Could not get recommendations" }, { status: 500 });
  }
}
