export const PAGE_TYPES = [
  "project",
  "system",
  "access",
  "runbook",
  "onboarding",
  "hr-policy",
  "tool-guide",
  "faq",
  "decision",
  "incident",
  "analysis",
  "glossary"
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const SENSITIVITY_LEVELS = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY"
] as const;

export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

export const REVIEW_STATUSES = [
  "draft",
  "review",
  "published",
  "archived"
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const SENSITIVITY_ORDER: Record<Sensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  RESTRICTED: 2,
  SECRET_REF_ONLY: 3
};

export type SearchParamValue = string | string[] | undefined;
export type SearchParams = Record<string, SearchParamValue>;

export interface PageProps<
  Params extends Record<string, string> = Record<string, string>,
  Query extends SearchParams = SearchParams
> {
  params?: Promise<Params>;
  searchParams?: Promise<Query>;
}
