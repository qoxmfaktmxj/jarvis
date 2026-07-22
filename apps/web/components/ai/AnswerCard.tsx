import { AnswerBody } from "./AnswerBody";
import { SourceRefCard, type SourceRef } from "./SourceRefCard";

export function AnswerCard(props: { text: string; sources: SourceRef[] }) {
  const slugToPath = Object.fromEntries(
    props.sources
      .filter((source) => source.wikiPath)
      .map((source) => [source.label, source.wikiPath as string]),
  );

  return (
    <section className="space-y-4">
      <AnswerBody text={props.text} slugToPath={slugToPath} />
      {props.sources.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {props.sources.map((source, index) => (
            <SourceRefCard key={`${source.label}-${index}`} source={source} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
