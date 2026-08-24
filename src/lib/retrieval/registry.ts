import { georgetown } from "./sources/georgetown";
import { harvard } from "./sources/harvard";
import { mit } from "./sources/mit";
import { princeton } from "./sources/princeton";
import { stanford } from "./sources/stanford";
import {
  universityOfCaliforniaBerkeley,
  universityOfCaliforniaDavis,
  universityOfCaliforniaIrvine,
  universityOfCaliforniaLosAngeles,
  universityOfCaliforniaSanDiego,
  universityOfCaliforniaSantaBarbara,
  universityOfCaliforniaSantaCruz,
} from "./sources/university-of-california";
import { yale } from "./sources/yale";
import { validateRecord } from "./normalize";
import type { SchoolSourceRecord } from "./types";

const SOURCES: SchoolSourceRecord[] = [
  stanford,
  mit,
  harvard,
  georgetown,
  princeton,
  yale,
  universityOfCaliforniaBerkeley,
  universityOfCaliforniaLosAngeles,
  universityOfCaliforniaDavis,
  universityOfCaliforniaIrvine,
  universityOfCaliforniaSanDiego,
  universityOfCaliforniaSantaBarbara,
  universityOfCaliforniaSantaCruz,
];

// Fail loudly at import time if a data file is malformed, rather than
// silently importing something wrong later - see normalize.ts.
for (const source of SOURCES) {
  const errors = validateRecord(source);
  if (errors.length > 0) {
    throw new Error(`Invalid source record for "${source.schoolName}":\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  }
}

const BY_SCHOOL_NAME = new Map<string, SchoolSourceRecord>(SOURCES.map((source) => [source.schoolName, source]));

// Returns null for any school not yet researched - the caller (college-
// import.ts) treats that as "not yet verified," never as an error.
export function lookupSchoolSource(schoolName: string): SchoolSourceRecord | null {
  return BY_SCHOOL_NAME.get(schoolName) ?? null;
}

export function listCoveredSchoolNames(): string[] {
  return SOURCES.map((source) => source.schoolName);
}
