import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { listMarketProjects, publishMarketProject } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listMarketProjects();
  return Response.json({ projects });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string; description?: string; projectId?: string };
    const project = await publishMarketProject(
      user.id,
      String(body.projectId || "default"),
      String(body.name || ""),
      String(body.description || ""),
    );
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not publish project." },
      { status: 400 },
    );
  }
}
