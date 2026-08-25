import { describe, expect, it } from "vitest";

import { detectSchoolMentions } from "./school-mentions";

const SCHOOLS = [
  "Stanford University",
  "Brown University",
  "Rice University",
  "University of Pennsylvania",
  "University of California, Los Angeles",
  "Massachusetts Institute of Technology",
  "Ohio State University",
];

describe("detectSchoolMentions", () => {
  it("finds a school named in full", () => {
    expect(detectSchoolMentions("Stanford University is where I want to study.", SCHOOLS)).toEqual(["Stanford University"]);
  });

  it("finds a school by its distinctive name alone", () => {
    expect(detectSchoolMentions("What draws me to Stanford is the design school.", SCHOOLS)).toEqual(["Stanford University"]);
  });

  // False positives are worse than misses here: telling a student to rewrite a
  // fine essay is a real cost, and these words appear in ordinary prose.
  it("does not fire on ordinary words that happen to be school names", () => {
    expect(detectSchoolMentions("I wrapped it in brown paper and tied it with string.", SCHOOLS)).toEqual([]);
    expect(detectSchoolMentions("We ate rice and beans every Sunday.", SCHOOLS)).toEqual([]);
    expect(detectSchoolMentions("She priced the tickets carefully.", SCHOOLS)).toEqual([]);
  });

  it("still finds those schools when they are named properly", () => {
    expect(detectSchoolMentions("Brown University's open curriculum.", SCHOOLS)).toEqual(["Brown University"]);
    expect(detectSchoolMentions("I visited Rice University in July.", SCHOOLS)).toEqual(["Rice University"]);
  });

  it("recognises unambiguous short forms", () => {
    expect(detectSchoolMentions("Penn's Wharton program is the draw.", SCHOOLS)).toEqual(["University of Pennsylvania"]);
    expect(detectSchoolMentions("I took a summer course at MIT.", SCHOOLS)).toEqual(["Massachusetts Institute of Technology"]);
    expect(detectSchoolMentions("UCLA has the lab I want.", SCHOOLS)).toEqual(["University of California, Los Angeles"]);
  });

  // A short form is only meaningful against schools on the student's list; the
  // canonical name is returned so it behaves like a manually typed phrase.
  it("ignores a short form for a school not on the list", () => {
    expect(detectSchoolMentions("I took a summer course at MIT.", ["Stanford University"])).toEqual([]);
  });

  it("does not match a bare generic word from a school's name", () => {
    expect(detectSchoolMentions("The university library was open late.", SCHOOLS)).toEqual([]);
    expect(detectSchoolMentions("I go to a state school.", SCHOOLS)).toEqual([]);
  });

  it("finds several schools at once, and nothing in empty text", () => {
    expect(detectSchoolMentions("Stanford and Brown University both appealed.", SCHOOLS).sort())
      .toEqual(["Brown University", "Stanford University"]);
    expect(detectSchoolMentions("   ", SCHOOLS)).toEqual([]);
  });
});
