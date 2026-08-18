/**
 * Datastore.
 *
 * Two implementations behind one interface. MongoDB when
 * MONGO_CONNECTION_URL is set, otherwise an in-memory store so the API can be
 * run and tested with no external service. Production refuses the in-memory
 * path in config.ts.
 */

import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export type Role = "owner" | "translator" | "viewer";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  role: Role;
  /** Locales this member may edit. Empty means all of them. */
  locales: string[];
}

export interface Project {
  id: string;
  name: string;
  /** Source locale that translations are drafted from. */
  sourceLocale: string;
  locales: string[];
  apiKey: string;
  members: Member[];
  createdAt: string;
}

export interface Translation {
  /** Register name, e.g. formal / neutral / casual. */
  [register: string]: string;
}

export interface Key {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  /** locale -> register -> value */
  values: Record<string, Translation>;
  /** Locales whose value came from AI and has not been approved by a human. */
  draft: string[];
  /**
   * Keys marked regulated only ever serve human-approved values. AI drafts are
   * held back until a reviewer signs off. Used for legal and financial copy.
   */
  regulated: boolean;
  updatedAt: string;
}

export interface Revision {
  id: string;
  projectId: string;
  keyId: string;
  keyName: string;
  locale: string;
  register: string;
  before: string | null;
  after: string | null;
  userId: string;
  source: "human" | "ai" | "import";
  at: string;
}

export interface Store {
  createUser(u: Omit<User, "id" | "createdAt">): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;

  createProject(p: Omit<Project, "id" | "createdAt">): Promise<Project>;
  listProjectsForUser(userId: string): Promise<Project[]>;
  findProject(id: string): Promise<Project | null>;
  findProjectByApiKey(apiKey: string): Promise<Project | null>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project | null>;

  listKeys(projectId: string): Promise<Key[]>;
  countKeys(projectId: string): Promise<number>;
  findKey(projectId: string, name: string): Promise<Key | null>;
  findKeyById(id: string): Promise<Key | null>;
  upsertKey(k: Omit<Key, "id" | "updatedAt"> & { id?: string }): Promise<Key>;
  deleteKey(id: string): Promise<void>;

  addRevision(r: Omit<Revision, "id" | "at">): Promise<Revision>;
  listRevisions(projectId: string, keyId?: string): Promise<Revision[]>;
}

// ------------------------------------------------------------------ passwords

/** scrypt with a per-user salt. No external dependency, and not plain SHA. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function newApiKey(): string {
  return `bhs_${randomBytes(24).toString("hex")}`;
}

// ------------------------------------------------------------------ in-memory

class MemoryStore implements Store {
  users = new Map<string, User>();
  projects = new Map<string, Project>();
  keys = new Map<string, Key>();
  revisions: Revision[] = [];

  async createUser(u: Omit<User, "id" | "createdAt">) {
    const user: User = { ...u, id: randomUUID(), createdAt: new Date().toISOString() };
    this.users.set(user.id, user);
    return user;
  }
  async findUserByEmail(email: string) {
    for (const u of this.users.values()) if (u.email === email) return u;
    return null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async createProject(p: Omit<Project, "id" | "createdAt">) {
    const project: Project = { ...p, id: randomUUID(), createdAt: new Date().toISOString() };
    this.projects.set(project.id, project);
    return project;
  }
  async listProjectsForUser(userId: string) {
    return [...this.projects.values()].filter((p) =>
      p.members.some((m) => m.userId === userId),
    );
  }
  async findProject(id: string) {
    return this.projects.get(id) ?? null;
  }
  async findProjectByApiKey(apiKey: string) {
    for (const p of this.projects.values()) if (p.apiKey === apiKey) return p;
    return null;
  }
  async updateProject(id: string, patch: Partial<Project>) {
    const p = this.projects.get(id);
    if (!p) return null;
    const next = { ...p, ...patch, id: p.id };
    this.projects.set(id, next);
    return next;
  }

  async listKeys(projectId: string) {
    return [...this.keys.values()]
      .filter((k) => k.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async countKeys(projectId: string) {
    return (await this.listKeys(projectId)).length;
  }
  async findKey(projectId: string, name: string) {
    for (const k of this.keys.values())
      if (k.projectId === projectId && k.name === name) return k;
    return null;
  }
  async findKeyById(id: string) {
    return this.keys.get(id) ?? null;
  }
  async upsertKey(k: Omit<Key, "id" | "updatedAt"> & { id?: string }) {
    const id = k.id ?? randomUUID();
    const key: Key = { ...k, id, updatedAt: new Date().toISOString() };
    this.keys.set(id, key);
    return key;
  }
  async deleteKey(id: string) {
    this.keys.delete(id);
  }

  async addRevision(r: Omit<Revision, "id" | "at">) {
    const rev: Revision = { ...r, id: randomUUID(), at: new Date().toISOString() };
    this.revisions.push(rev);
    return rev;
  }
  async listRevisions(projectId: string, keyId?: string) {
    return this.revisions
      .filter((r) => r.projectId === projectId && (!keyId || r.keyId === keyId))
      .sort((a, b) => b.at.localeCompare(a.at));
  }
}

// --------------------------------------------------------------------- mongo

class MongoStore implements Store {
  // Loaded lazily so the mongodb driver is not required for in-memory runs.
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  static async connect(url: string, dbName: string): Promise<MongoStore> {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(url);
    await client.connect();
    const db = client.db(dbName);
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("projects").createIndex({ apiKey: 1 }, { unique: true });
    await db.collection("keys").createIndex({ projectId: 1, name: 1 }, { unique: true });
    await db.collection("revisions").createIndex({ projectId: 1, at: -1 });
    return new MongoStore(db);
  }

  private strip<T extends { _id?: unknown }>(doc: T | null): any {
    if (!doc) return null;
    const { _id, ...rest } = doc as any;
    return rest;
  }

  async createUser(u: Omit<User, "id" | "createdAt">) {
    const user: User = { ...u, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.db.collection("users").insertOne({ ...user });
    return user;
  }
  async findUserByEmail(email: string) {
    return this.strip(await this.db.collection("users").findOne({ email }));
  }
  async findUserById(id: string) {
    return this.strip(await this.db.collection("users").findOne({ id }));
  }

  async createProject(p: Omit<Project, "id" | "createdAt">) {
    const project: Project = { ...p, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.db.collection("projects").insertOne({ ...project });
    return project;
  }
  async listProjectsForUser(userId: string) {
    const docs = await this.db
      .collection("projects")
      .find({ "members.userId": userId })
      .toArray();
    return docs.map((d: any) => this.strip(d));
  }
  async findProject(id: string) {
    return this.strip(await this.db.collection("projects").findOne({ id }));
  }
  async findProjectByApiKey(apiKey: string) {
    return this.strip(await this.db.collection("projects").findOne({ apiKey }));
  }
  async updateProject(id: string, patch: Partial<Project>) {
    const { id: _drop, ...rest } = patch as any;
    await this.db.collection("projects").updateOne({ id }, { $set: rest });
    return this.findProject(id);
  }

  async listKeys(projectId: string) {
    const docs = await this.db
      .collection("keys")
      .find({ projectId })
      .sort({ name: 1 })
      .toArray();
    return docs.map((d: any) => this.strip(d));
  }
  async countKeys(projectId: string) {
    return this.db.collection("keys").countDocuments({ projectId });
  }
  async findKey(projectId: string, name: string) {
    return this.strip(await this.db.collection("keys").findOne({ projectId, name }));
  }
  async findKeyById(id: string) {
    return this.strip(await this.db.collection("keys").findOne({ id }));
  }
  async upsertKey(k: Omit<Key, "id" | "updatedAt"> & { id?: string }) {
    const id = k.id ?? randomUUID();
    const key: Key = { ...k, id, updatedAt: new Date().toISOString() };
    await this.db
      .collection("keys")
      .updateOne({ id }, { $set: { ...key } }, { upsert: true });
    return key;
  }
  async deleteKey(id: string) {
    await this.db.collection("keys").deleteOne({ id });
  }

  async addRevision(r: Omit<Revision, "id" | "at">) {
    const rev: Revision = { ...r, id: randomUUID(), at: new Date().toISOString() };
    await this.db.collection("revisions").insertOne({ ...rev });
    return rev;
  }
  async listRevisions(projectId: string, keyId?: string) {
    const query: any = { projectId };
    if (keyId) query.keyId = keyId;
    const docs = await this.db
      .collection("revisions")
      .find(query)
      .sort({ at: -1 })
      .limit(500)
      .toArray();
    return docs.map((d: any) => this.strip(d));
  }
}

export async function createStore(): Promise<Store> {
  if (config.mongoUrl) {
    return MongoStore.connect(config.mongoUrl, config.mongoDb);
  }
  console.warn(
    "[selakata] No MONGO_CONNECTION_URL set. Using the in-memory store; " +
      "all data is lost on restart.",
  );
  return new MemoryStore();
}

export { MemoryStore };
