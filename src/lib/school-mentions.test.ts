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
  // Requiring a capital is not enough on its own: the first word of a sentence
  // or a title is capitalised whatever it means. These all used to be read as
  // mentions of a real school, which makes scoreMatch return "high" risk and
  // tells the student to rewrite an essay that never named that school.
  describe("capitalisation from sentence or title position", () => {
    it("does not treat a sentence-opening ordinary word as a school", () => {
      expect(detectSchoolMentions("Brown paper covered the table.", SCHOOLS)).toEqual([]);
      expect(detectSchoolMentions("Rice and beans were dinner every Sunday.", SCHOOLS)).toEqual([]);
    });

    it("does not treat a title-opening ordinary word as a school", () => {
      // reuse.ts feeds `${essay.title} ${essay.currentContent}` in, so the
      // title's first word is always capitalised.
      expect(detectSchoolMentions("Rice and Identity — my grandmother's kitchen", SCHOOLS)).toEqual([]);
    });

    it("does not treat a word after a full stop as a school", () => {
      expect(detectSchoolMentions("We cleared the table. Brown paper lined the drawer.", SCHOOLS)).toEqual([]);
    });

    // The signal that survives: mid-sentence capitalisation, or a possessive,
    // neither of which happens to an ordinary noun.
    it("still detects the school when the capital actually means something", () => {
      expect(detectSchoolMentions("I applied to Brown last year.", SCHOOLS)).toEqual(["Brown University"]);
      expect(detectSchoolMentions("Brown's open curriculum is the reason.", SCHOOLS)).toEqual(["Brown University"]);
      expect(detectSchoolMentions("What draws me to Rice is the residential college system.", SCHOOLS)).toEqual(["Rice University"]);
    });

    // An unambiguous name is not an English word, so sentence position tells us
    // nothing and must not suppress it.
    it("does not suppress an unambiguous name at the start of a sentence", () => {
      expect(detectSchoolMentions("Stanford is where I want to study.", SCHOOLS)).toEqual(["Stanford University"]);
    });
  });
});
