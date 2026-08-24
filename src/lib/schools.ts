import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { schools } from "./db/schema";

function cleanName(name: string) {
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 120) throw new Error("School name must be between 2 and 120 characters.");
  return value;
}

export function createSchool(db: AppDatabase, workspaceId: string, input: { name: string; notes?: string }) {
  const id = crypto.randomUUID();
  db.insert(schools).values({
    id,
    workspaceId,
    name: cleanName(input.name),
    notes: input.notes?.trim() || null,
  }).run();
  return db.select().from(schools).where(and(eq(schools.id, id), eq(schools.workspaceId, workspaceId))).get();
}

export function updateSchool(db: AppDatabase, workspaceId: string, schoolId: string, input: { name: string; notes?: string }) {
  const result = db.update(schools)
    .set({ name: cleanName(input.name), notes: input.notes?.trim() || null, updatedAt: new Date() })
    .where(and(eq(schools.id, schoolId), eq(schools.workspaceId, workspaceId)))
    .run();
  if (result.changes !== 1) throw new Error("School not found in the active workspace.");
}

export function deleteSchool(db: AppDatabase, workspaceId: string, schoolId: string) {
  const result = db.delete(schools)
    .where(and(eq(schools.id, schoolId), eq(schools.workspaceId, workspaceId)))
    .run();
  if (result.changes !== 1) throw new Error("School not found in the active workspace.");
}
