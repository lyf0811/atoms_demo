import { NextRequest } from "next/server";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { createUserProject, listUserProjects } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserBySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  const projects = await listUserProjects(user.id);
  return Response.json({ projects });
}

export async function POST(request: NextRequest) {
  const user = await getUserBySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!user) {
    return Response.json({ error: "Please login first." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const project = await createUserProject(user.id, String(body.name || ""));
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create project." },
      { status: 400 },
    );
  }
}
