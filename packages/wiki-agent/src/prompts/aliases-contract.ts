import { MIN_ALIASES } from "../constants.js";

export const ALIASES_CONTRACT = [
  "## ALIASES REQUIREMENT",
  "",
  `Each generated page must include at least ${MIN_ALIASES} aliases across Korean, English, and shorthand forms when they exist.`,
  "- Include one Korean surface form when the topic has a Korean rendering.",
  "- Include one English or spacing variant when an English label exists.",
  "- Include one abbreviation or official short form when it exists.",
].join("\n");
