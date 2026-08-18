/**
 * Two ways in.
 *
 * Dashboard users carry a JWT. SDK clients carry a project API key and never
 * need a JWT, so an app shipping to browsers never has to embed a user token.
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import type { Project, Role, Store, User } from "./store.js";

/**
 * Augment Express's Request rather than defining a separate subtype.
 *
 * A subtype with extra required properties is not assignable to Express's
 * handler signature, so every route would need a cast. Merging keeps handlers
 * plain and type-safe. `store` is attached by middleware in index.ts before
 * any route runs.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      store: Store;
      user?: User;
      project?: Project;
    }
  }
}

export type AuthedRequest = Request;

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiry as any,
  });
}

/** Require a logged-in dashboard user. */
export async function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = await req.store.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Unknown user" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Require a valid project API key, used by the SDK. */
export async function requireApiKey(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const key =
    (req.headers["x-api-key"] as string | undefined) ??
    (typeof req.query.key === "string" ? req.query.key : undefined);
  if (!key) return res.status(401).json({ error: "Missing project API key" });

  const project = await req.store.findProjectByApiKey(key);
  if (!project) return res.status(401).json({ error: "Invalid project API key" });

  req.project = project;
  next();
}

const RANK: Record<Role, number> = { viewer: 0, translator: 1, owner: 2 };

/**
 * Require project membership at or above a role.
 *
 * Reads the project id from :projectId and attaches it to the request, so
 * handlers never have to re-fetch or re-authorize.
 */
export function requireMember(minimum: Role) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const project = await req.store.findProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const member = project.members.find((m) => m.userId === req.user!.id);
    if (!member) return res.status(403).json({ error: "Not a member of this project" });
    if (RANK[member.role] < RANK[minimum]) {
      return res
        .status(403)
        .json({ error: `Requires ${minimum} access, you have ${member.role}` });
    }

    req.project = project;
    next();
  };
}

/**
 * Translators can be scoped to specific locales. An empty list means all of
 * them. Owners are never scoped.
 */
export function canEditLocale(project: Project, userId: string, locale: string): boolean {
  const member = project.members.find((m) => m.userId === userId);
  if (!member) return false;
  if (member.role === "viewer") return false;
  if (member.role === "owner") return true;
  return member.locales.length === 0 || member.locales.includes(locale);
}
