import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { applyMarketProjectToNewUserProject } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await applyMarketProjectToNewUserProject(id, user.id);
    return Response.json({ project: result, userProject: result.userProject });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not apply market project." },
      { status: 400 },
    );
  }
}
