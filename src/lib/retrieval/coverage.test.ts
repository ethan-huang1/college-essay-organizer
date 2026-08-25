import { describe, expect, it } from "vitest";

import { CURRENT_CYCLE_LABEL } from "../cycle";
import { TOP_UNIVERSITIES } from "../top-universities";
import { classifyText } from "../classification";
import { PROMPT_FAMILIES } from "../db/taxonomy";
import { CLASSIFICATION_OVERRIDES, classificationOverride } from "./classification-overrides";
import { listCoveredSchoolNames, lookupSchoolSource } from "./registry";

// A secondary-source (admissions-consultant-blog) domain must never be the
// sole citation for a current-cycle claim - see the college-import.ts /
// registry.ts research policy. Extend this list as new secondary sources
// are noticed during research.
const KNOWN_SECONDARY_SOURCE_DOMAINS = [
  "ivycoach.com", "collegevine.com", "prepmaven.com", "gradgpt.com",
  "collegeessayguy.com", "collegeessaygrader.com", "deweysmart.com",
  "cosmic.nyc", "collegetransitions.com", "selectiveadmissions.com",
  "collegeessayadvisors.com", "ivywise.com", "ivymax.com", "connectprep.com",
  "toptieradmissions.com", "internationalcollegecounselors.com", "clearadmit.com",
];

describe("prompt-retrieval coverage (top-100 college list)", () => {
  it("has exactly 100 schools in the picker list", () => {
    expect(TOP_UNIVERSITIES).toHaveLength(100);
    expect(new Set(TOP_UNIVERSITIES).size).toBe(100);
  });

  it("has a coverage record for every one of the 100 picker schools - none unresearched", () => {
    const missing = TOP_UNIVERSITIES.filter((name) => !lookupSchoolSource(name));
    expect(missing).toEqual([]);
    const covered = listCoveredSchoolNames();
    expect(covered).toHaveLength(100);
    expect(new Set(covered).size).toBe(100);
  });

  it("reports how many of the 100 schools still need research (informational, always passes)", () => {
    const missing = TOP_UNIVERSITIES.filter((name) => !lookupSchoolSource(name));
    console.log(`Coverage: ${TOP_UNIVERSITIES.length - missing.length}/${TOP_UNIVERSITIES.length} schools researched.`);
    expect(missing.length).toBeGreaterThanOrEqual(0);
  });

  it("gives every coverage record a source URL, checked date, platform, cycle, and verification status", () => {
    for (const name of TOP_UNIVERSITIES) {
      const record = lookupSchoolSource(name);
      if (!record) continue; // reported by the previous test
      expect(record.sourceUrl, `${name}: sourceUrl`).toBeTruthy();
      expect(record.sourceUrl, `${name}: sourceUrl must be https`).toMatch(/^https:\/\//);
      expect(record.retrievedAt, `${name}: retrievedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.applicationPlatform, `${name}: applicationPlatform`).toBeTruthy();
      expect(record.cycleLabel, `${name}: cycleLabel`).toBeTruthy();
      expect(record.verificationStatus, `${name}: verificationStatus`).toBeTruthy();
      expect(record.note.trim().length, `${name}: note must be a real explanation`).toBeGreaterThan(10);
    }
  });

  it("never labels a previous-cycle record with the current cycle, and never labels a current-cycle record with an old one", () => {
    for (const name of TOP_UNIVERSITIES) {
      const record = lookupSchoolSource(name);
      if (!record) continue;
      if (record.verificationStatus === "previous-cycle") {
        expect(record.cycleLabel, `${name} is previous-cycle but labeled current`).not.toBe(CURRENT_CYCLE_LABEL);
      }
      if (record.verificationStatus === "officially-verified" || record.verificationStatus === "common-app-verified") {
        expect(record.cycleLabel, `${name} claims current-cycle verification but isn't labeled the current cycle`).toBe(CURRENT_CYCLE_LABEL);
      }
    }
  });

  it("distinguishes no-supplement-confirmed schools from unresearched ones (both have real, cited records)", () => {
    const noSupplementSchools = TOP_UNIVERSITIES
      .map((name) => ({ name, record: lookupSchoolSource(name) }))
      .filter(({ record }) => record?.verificationStatus === "no-supplement-confirmed");
    for (const { name, record } of noSupplementSchools) {
      expect(record?.sourceUrl, `${name}: no-supplement-confirmed still needs a source`).toBeTruthy();
      expect(record?.prompts, `${name}: no-supplement-confirmed must carry zero prompts`).toEqual([]);
    }
  });

  it("never relies solely on a secondary/consultant source for a current-cycle (officially- or Common-App-verified) claim", () => {
    for (const name of TOP_UNIVERSITIES) {
      const record = lookupSchoolSource(name);
      if (!record) continue;
      if (record.verificationStatus !== "officially-verified" && record.verificationStatus !== "common-app-verified") continue;
      const url = record.sourceUrl ?? "";
      const isSecondary = KNOWN_SECONDARY_SOURCE_DOMAINS.some((domain) => url.includes(domain));
      expect(isSecondary, `${name}: current-cycle claim's sourceUrl (${url}) looks like a secondary source, not official`).toBe(false);
    }
  });

  it("reports a verification-status breakdown across all 100 schools (informational - always passes, printed for the record)", () => {
    const counts: Record<string, number> = {};
    for (const name of TOP_UNIVERSITIES) {
      const status = lookupSchoolSource(name)?.verificationStatus ?? "unresearched";
      counts[status] = (counts[status] ?? 0) + 1;
    }
    console.log("Coverage breakdown:", counts);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(100);
  });
  // Encoding the catalogue's group and program metadata is incremental: these
  // schools are done, and the list grows as more are encoded. Naming them
  // explicitly is what stops a half-finished file from passing quietly.
  const GROUPS_ENCODED = [
    "University of California, Berkeley",
    "University of California, Los Angeles",
    "University of California, Davis",
    "University of California, Irvine",
    "University of California, San Diego",
    "University of California, Santa Barbara",
    "University of California, Santa Cruz",
    "Yale University",
    "California Institute of Technology",
    "Dartmouth College",
    "Washington and Lee University",
  ];

  const PROGRAMS_ENCODED = [
    "University of Pennsylvania",
    "Georgetown University",
    "Washington and Lee University",
  ];

  it("declares a choose-N group for every school whose set has been encoded", () => {
    for (const name of GROUPS_ENCODED) {
      const record = lookupSchoolSource(name);
      expect(record, `${name} should be in the registry`).toBeTruthy();
      const groups = record?.promptGroups ?? [];
      expect(groups.length, `${name}: expected at least one prompt group`).toBeGreaterThan(0);
      for (const group of groups) {
        const size = record!.prompts.filter((prompt) => prompt.groupKey === group.key).length;
        expect(size, `${name}: group "${group.key}" has no prompts`).toBeGreaterThan(0);
        expect(group.requiredCount, `${name}: group "${group.key}" asks for more than it holds`).toBeLessThanOrEqual(size);
        expect(group.requiredCount, `${name}: group "${group.key}" must ask for at least one`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // A conditional prompt with no programKey cannot be resolved for or against a
  // student, so it is shown as unresolved rather than counted. That is the
  // correct behaviour for a file nobody has encoded yet, but it must not
  // silently appear in one that is supposed to be done.
  it("gives every conditional prompt a programKey in the schools already encoded", () => {
    for (const name of PROGRAMS_ENCODED) {
      const record = lookupSchoolSource(name);
      expect(record, `${name} should be in the registry`).toBeTruthy();
      for (const prompt of record?.prompts ?? []) {
        if (prompt.requirement !== "conditional") continue;
        expect(prompt.programKey, `${name}: conditional prompt "${prompt.externalRef}" has no programKey`).toBeTruthy();
      }
    }
  });

  it("reports how much of the catalogue still needs group or program metadata (informational)", () => {
    let unresolvedConditionals = 0;
    const pending: string[] = [];
    for (const name of listCoveredSchoolNames()) {
      const record = lookupSchoolSource(name);
      const missing = (record?.prompts ?? []).filter(
        (prompt) => prompt.requirement === "conditional" && !prompt.programKey,
      ).length;
      if (missing > 0) {
        unresolvedConditionals += missing;
        pending.push(`${name} (${missing})`);
      }
    }
    console.log(`Conditional prompts still unencoded: ${unresolvedConditionals} across ${pending.length} schools`);
    console.log(pending.join(", "));
    // Informational, but it must never grow silently past what is on file.
    expect(unresolvedConditionals).toBeLessThanOrEqual(60);
  });
  // The old keyword set could not see a fit prompt: measured on this catalogue,
  // zero of 255 prompts ever classified as why-school and 44% classified as
  // nothing at all. Why Us is the one category you must NOT reuse across
  // schools, so an empty Why Us made the reuse map quietly wrong.
  describe("classification coverage", () => {
    const classified = listCoveredSchoolNames().flatMap((name) => {
      const record = lookupSchoolSource(name);
      return (record?.prompts ?? []).map((prompt) => ({
        school: name,
        prompt,
        result: classifyText(`${prompt.title} ${prompt.promptText}`),
        override: classificationOverride(name, prompt.externalRef),
      }));
    });

    it("classifies Why Us prompts instead of leaving the category empty", () => {
      const whyUs = classified.filter((row) => (row.override ?? row.result.primarySlug) === "why-us");
      expect(whyUs.length).toBeGreaterThan(20);
    });

    it("leaves under 10% of the catalogue needing review", () => {
      const needsReview = classified.filter((row) => !row.override && !row.result.primarySlug);
      const share = needsReview.length / classified.length;
      console.log(`Needs review: ${needsReview.length}/${classified.length} (${Math.round(share * 100)}%)`);
      expect(share).toBeLessThan(0.1);
    });

    it("never emits a category outside the seven", () => {
      const slugs = new Set(PROMPT_FAMILIES.map(([slug]) => slug as string));
      for (const row of classified) {
        if (row.result.primarySlug) expect(slugs, `${row.school}: ${row.prompt.title}`).toContain(row.result.primarySlug);
        if (row.override) expect(slugs, `${row.school}: ${row.prompt.title}`).toContain(row.override);
      }
    });

    it("populates every category the catalogue can reach", () => {
      const populated = new Set(classified.map((row) => row.override ?? row.result.primarySlug).filter(Boolean));
      for (const slug of ["why-us", "why-major", "community", "diversity", "shorts", "personal-statement"]) {
        expect(populated, slug).toContain(slug);
      }
    });

    // A stale override would silently do nothing, so every entry has to still
    // name a prompt that exists.
    it("keeps every hand-classified override pointing at a real prompt", () => {
      for (const [schoolName, externalRef] of CLASSIFICATION_OVERRIDES) {
        const record = lookupSchoolSource(schoolName);
        expect(record, `${schoolName} is not in the registry`).toBeTruthy();
        expect(
          record?.prompts.some((prompt) => prompt.externalRef === externalRef),
          `${schoolName} has no prompt "${externalRef}"`,
        ).toBe(true);
      }
    });
  });
});
