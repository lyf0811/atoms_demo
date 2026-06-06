import crypto from "crypto";
import { cookies } from "next/headers";
import type { PublicUser, Session, User } from "@/lib/types";
import { readJsonFile, writeJsonFile } from "@/lib/storage";

export const SESSION_COOKIE = "atoms_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = "sha512";

type UsersFile = { users: User[] };
type SessionsFile = { sessions: Session[] };

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, ...publicUser } = user;
  void passwordHash;
  return publicUser;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");

  return `${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [iterationsRaw, salt, expectedHash] = stored.split(":");
  const iterations = Number(iterationsRaw);

  if (!iterations || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function readUsers() {
  return readJsonFile<UsersFile>("users.json", { users: [] });
}

export async function saveUsers(usersFile: UsersFile) {
  await writeJsonFile("users.json", usersFile);
}

export async function readSessions() {
  return readJsonFile<SessionsFile>("sessions.json", { sessions: [] });
}

export async function saveSessions(sessionsFile: SessionsFile) {
  await writeJsonFile("sessions.json", sessionsFile);
}

export async function createUser(email: string, password: string, name?: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    throw new Error("Enter a valid email.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const usersFile = await readUsers();
  const exists = usersFile.users.some((user) => user.email === normalizedEmail);

  if (exists) {
    throw new Error("This email is already registered.");
  }

  const user: User = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail.split("@")[0],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  usersFile.users.push(user);
  await saveUsers(usersFile);
  return user;
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const usersFile = await readUsers();
  const user = usersFile.users.find((candidate) => candidate.email === normalizedEmail);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Email or password is incorrect.");
  }

  return user;
}

export async function createSession(userId: string) {
  const sessionsFile = await readSessions();
  const now = Date.now();
  sessionsFile.sessions = sessionsFile.sessions.filter(
    (session) => new Date(session.expiresAt).getTime() > now,
  );

  const session: Session = {
    token: crypto.randomBytes(32).toString("hex"),
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  sessionsFile.sessions.push(session);
  await saveSessions(sessionsFile);
  return session;
}

export async function getUserBySessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const [sessionsFile, usersFile] = await Promise.all([readSessions(), readUsers()]);
  const now = Date.now();
  const session = sessionsFile.sessions.find(
    (candidate) => candidate.token === token && new Date(candidate.expiresAt).getTime() > now,
  );

  if (!session) {
    return null;
  }

  return usersFile.users.find((user) => user.id === session.userId) ?? null;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getUserBySessionToken(token);
  return user ? toPublicUser(user) : null;
}

export async function destroySession(token?: string) {
  if (!token) {
    return;
  }

  const sessionsFile = await readSessions();
  sessionsFile.sessions = sessionsFile.sessions.filter((session) => session.token !== token);
  await saveSessions(sessionsFile);
}

export function sessionCookieOptions(expiresAt?: string) {
  const secureCookie =
    process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookie,
    path: "/",
    expires: expiresAt ? new Date(expiresAt) : undefined,
  };
}
