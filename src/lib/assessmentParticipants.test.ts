import test from "node:test";
import assert from "node:assert/strict";

import { parseAssessmentParticipantCsv } from "./assessmentParticipants.ts";

test("parses participant CSV rows into assessment subject records", () => {
  const csv = `name,email,level,function_name,region,portfolio
Amina Lawal,amina.lawal@example.com,director,Network Operations,North Central,Radio access network and field operations
Chinedu Okoye,chinedu.okoye@example.com,director,Enterprise Business,National,B2B growth and strategic accounts`;

  assert.deepEqual(parseAssessmentParticipantCsv(csv), [
    {
      name: "Amina Lawal",
      email: "amina.lawal@example.com",
      level: "director",
      functionName: "Network Operations",
      region: "North Central",
      portfolio: "Radio access network and field operations",
    },
    {
      name: "Chinedu Okoye",
      email: "chinedu.okoye@example.com",
      level: "director",
      functionName: "Enterprise Business",
      region: "National",
      portfolio: "B2B growth and strategic accounts",
    },
  ]);
});

test("ignores empty or malformed rows when parsing CSV", () => {
  const csv = `name,email,level
Amina Lawal,amina.lawal@example.com,director
, ,
`;

  assert.deepEqual(parseAssessmentParticipantCsv(csv), [
    {
      name: "Amina Lawal",
      email: "amina.lawal@example.com",
      level: "director",
      functionName: "",
      region: "",
      portfolio: "",
    },
  ]);
});
