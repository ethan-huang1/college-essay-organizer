import { amherst } from "./sources/amherst";
import { arizonaState } from "./sources/arizona-state";
import { bostonCollege } from "./sources/boston-college";
import { bostonUniversity } from "./sources/boston-university";
import { bowdoin } from "./sources/bowdoin";
import { brandeis } from "./sources/brandeis";
import { brown } from "./sources/brown";
import { bucknell } from "./sources/bucknell";
import { caltech } from "./sources/caltech";
import { carleton } from "./sources/carleton";
import { carnegieMellon } from "./sources/carnegie-mellon";
import { caseWesternReserve } from "./sources/case-western-reserve";
import { universityOfChicago } from "./sources/chicago";
import { claremontMcKenna } from "./sources/claremont-mckenna";
import { colby } from "./sources/colby";
import { colgate } from "./sources/colgate";
import { universityOfColoradoBoulder } from "./sources/colorado-boulder";
import { coloradoCollege } from "./sources/colorado-college";
import { columbia } from "./sources/columbia";
import { cornell } from "./sources/cornell";
import { dartmouth } from "./sources/dartmouth";
import { davidson } from "./sources/davidson";
import { duke } from "./sources/duke";
import { emory } from "./sources/emory";
import { universityOfFlorida } from "./sources/florida";
import { floridaState } from "./sources/florida-state";
import { georgeWashington } from "./sources/george-washington";
import { georgiaTech } from "./sources/georgia-tech";
import { universityOfGeorgia } from "./sources/georgia";
import { georgetown } from "./sources/georgetown";
import { grinnell } from "./sources/grinnell";
import { hamilton } from "./sources/hamilton";
import { harvard } from "./sources/harvard";
import { harveyMudd } from "./sources/harvey-mudd";
import { haverford } from "./sources/haverford";
import { universityOfIllinoisUrbanaChampaign } from "./sources/illinois-urbana-champaign";
import { indianaBloomington } from "./sources/indiana-bloomington";
import { johnsHopkins } from "./sources/johns-hopkins";
import { lehigh } from "./sources/lehigh";
import { universityOfMarylandCollegePark } from "./sources/maryland-college-park";
import { michiganState } from "./sources/michigan-state";
import { middlebury } from "./sources/middlebury";
import { mit } from "./sources/mit";
import { northCarolinaState } from "./sources/north-carolina-state";
import { northeastern } from "./sources/northeastern";
import { northwestern } from "./sources/northwestern";
import { nyu } from "./sources/nyu";
import { notreDame } from "./sources/notre-dame";
import { oberlin } from "./sources/oberlin";
import { ohioState } from "./sources/ohio-state";
import { pennState } from "./sources/penn-state";
import { pitzer } from "./sources/pitzer";
import { universityOfPittsburgh } from "./sources/pittsburgh";
import { princeton } from "./sources/princeton";
import { pomona } from "./sources/pomona";
import { purdue } from "./sources/purdue";
import { reed } from "./sources/reed";
import { rice } from "./sources/rice";
import { universityOfRichmond } from "./sources/richmond";
import { universityOfRochester } from "./sources/rochester";
import { rutgers } from "./sources/rutgers";
import { scripps } from "./sources/scripps";
import { smith } from "./sources/smith";
import { universityOfSouthernCalifornia } from "./sources/southern-california";
import { stanford } from "./sources/stanford";
import { swarthmore } from "./sources/swarthmore";
import { texasAM } from "./sources/texas-am";
import { universityOfTexasAtAustin } from "./sources/texas-austin";
import { trinityCollege } from "./sources/trinity-college";
import { tufts } from "./sources/tufts";
import { tulane } from "./sources/tulane";
import { universityOfConnecticut } from "./sources/uconn";
import {
  universityOfCaliforniaBerkeley,
  universityOfCaliforniaDavis,
  universityOfCaliforniaIrvine,
  universityOfCaliforniaLosAngeles,
  universityOfCaliforniaSanDiego,
  universityOfCaliforniaSantaBarbara,
  universityOfCaliforniaSantaCruz,
} from "./sources/university-of-california";
import { universityOfMassachusettsAmherst } from "./sources/university-of-massachusetts-amherst";
import { universityOfMiami } from "./sources/university-of-miami";
import { universityOfMichigan } from "./sources/university-of-michigan";
import { universityOfMinnesotaTwinCities } from "./sources/university-of-minnesota-twin-cities";
import { universityOfNorthCarolinaChapelHill } from "./sources/university-of-north-carolina-chapel-hill";
import { universityOfPennsylvania } from "./sources/university-of-pennsylvania";
import { vanderbiltUniversity } from "./sources/vanderbilt";
import { vassarCollege } from "./sources/vassar";
import { villanova } from "./sources/villanova";
import { virginiaTech } from "./sources/virginia-tech";
import { universityOfVirginia } from "./sources/virginia";
import { wakeForest } from "./sources/wake-forest";
import { washingtonAndLee } from "./sources/washington-and-lee";
import { washingtonUniversityStLouis } from "./sources/washington-university-st-louis";
import { universityOfWashington } from "./sources/washington";
import { wellesley } from "./sources/wellesley";
import { wesleyan } from "./sources/wesleyan";
import { williamAndMary } from "./sources/william-and-mary";
import { williams } from "./sources/williams";
import { universityOfWisconsinMadison } from "./sources/wisconsin-madison";
import { yale } from "./sources/yale";
import { validateRecord } from "./normalize";
import type { SchoolSourceRecord } from "./types";

const SOURCES: SchoolSourceRecord[] = [
  amherst,
  arizonaState,
  bostonCollege,
  bostonUniversity,
  bowdoin,
  brandeis,
  brown,
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
  bucknell,
  caltech,
  carleton,
  carnegieMellon,
  caseWesternReserve,
  universityOfChicago,
  claremontMcKenna,
  colby,
  colgate,
  universityOfColoradoBoulder,
  coloradoCollege,
  columbia,
  cornell,
  dartmouth,
  davidson,
  duke,
  emory,
  universityOfFlorida,
  floridaState,
  georgeWashington,
  georgiaTech,
  universityOfGeorgia,
  grinnell,
  hamilton,
  harveyMudd,
  haverford,
  universityOfIllinoisUrbanaChampaign,
  indianaBloomington,
  johnsHopkins,
  lehigh,
  universityOfMarylandCollegePark,
  michiganState,
  middlebury,
  notreDame,
  northCarolinaState,
  northeastern,
  northwestern,
  nyu,
  oberlin,
  ohioState,
  pennState,
  pitzer,
  universityOfPittsburgh,
  pomona,
  purdue,
  reed,
  rice,
  universityOfRichmond,
  universityOfRochester,
  rutgers,
  scripps,
  smith,
  universityOfSouthernCalifornia,
  swarthmore,
  texasAM,
  universityOfTexasAtAustin,
  trinityCollege,
  tufts,
  tulane,
  universityOfConnecticut,
  universityOfMassachusettsAmherst,
  universityOfMiami,
  universityOfMichigan,
  universityOfMinnesotaTwinCities,
  universityOfNorthCarolinaChapelHill,
  universityOfPennsylvania,
  vanderbiltUniversity,
  vassarCollege,
  villanova,
  virginiaTech,
  universityOfVirginia,
  wakeForest,
  washingtonAndLee,
  washingtonUniversityStLouis,
  universityOfWashington,
  wellesley,
  wesleyan,
  williamAndMary,
  williams,
  universityOfWisconsinMadison,
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
