// Simulation der Rundenpaarung: npm run simulate -w @comatch/server -- --people 100 --rounds 8
import { parseArgs } from "node:util";
import { DEFAULT_QUESTIONS } from "@comatch/shared";
import { questionsFromInput, randomPeople, recordRound } from "./fixtures.ts";
import { pairRound } from "./pair.ts";

const { values } = parseArgs({
  options: {
    people: { type: "string", default: "100" },
    rounds: { type: "string", default: "8" },
    seed: { type: "string", default: "sim" },
  },
});
const peopleCount = Number(values.people);
const rounds = Number(values.rounds);

const questions = questionsFromInput(DEFAULT_QUESTIONS);
const people = randomPeople(peopleCount, DEFAULT_QUESTIONS, values.seed);
const history = new Map<string, { timesMet: number; lastRound: number }>();
const partners = new Map<string, Set<string>>(people.map((p) => [p.id, new Set()]));

console.log(`${peopleCount} Personen, ${rounds} Runden, Standardfragen\n`);
console.log("Runde  Gruppen  Dreier  Ø Übereinst.  perfekt  Wiederholungen  Laufzeit");

let totalRepeats = 0;
for (let round = 1; round <= rounds; round++) {
  const start = performance.now();
  const { groups } = pairRound(people, { questions, history, round, seed: `${values.seed}:${round}` });
  const ms = performance.now() - start;

  recordRound(history, groups, round);
  for (const { members } of groups) {
    for (const a of members) for (const b of members) if (a !== b) partners.get(a)!.add(b);
  }
  const repeats = groups.reduce((sum, g) => sum + g.repeats, 0);
  totalRepeats += repeats;
  const avg = groups.reduce((sum, g) => sum + g.similarity, 0) / groups.length;
  const perfect = groups.filter((g) => g.similarity === 1).length;
  const triples = groups.filter((g) => g.members.length === 3).length;

  console.log(
    [
      String(round).padStart(5),
      String(groups.length).padStart(8),
      String(triples).padStart(7),
      avg.toFixed(2).padStart(13),
      String(perfect).padStart(8),
      String(repeats).padStart(15),
      `${ms.toFixed(1)} ms`.padStart(10),
    ].join(" "),
  );
}

const distinct = [...partners.values()].map((s) => s.size);
console.log(`\nWiederholte Paare gesamt: ${totalRepeats}`);
console.log(
  `Verschiedene Gesprächspartner je Person: min ${Math.min(...distinct)}, max ${Math.max(...distinct)}`,
);
