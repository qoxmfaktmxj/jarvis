CREATE OR REPLACE FUNCTION source_document_search_vector_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.external_id, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.provider, ''))), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER source_document_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, external_id, provider ON source_document
FOR EACH ROW EXECUTE FUNCTION source_document_search_vector_update();

CREATE OR REPLACE FUNCTION legal_case_search_vector_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.case_number, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.court_or_agency, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.holding_summary, ''))), 'C') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.issues::text, ''))), 'D');
  RETURN NEW;
END $$;
CREATE TRIGGER legal_case_search_vector_trigger
BEFORE INSERT OR UPDATE OF case_number, court_or_agency, holding_summary, issues ON legal_case
FOR EACH ROW EXECUTE FUNCTION legal_case_search_vector_update();

CREATE OR REPLACE FUNCTION wiki_page_index_search_vector_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.slug, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.snippet, ''))), 'C') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.frontmatter::text, ''))), 'D');
  RETURN NEW;
END $$;
CREATE TRIGGER wiki_page_index_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, slug, snippet, frontmatter ON wiki_page_index
FOR EACH ROW EXECUTE FUNCTION wiki_page_index_search_vector_update();

UPDATE source_document SET title = title;
UPDATE legal_case SET case_number = case_number;
UPDATE wiki_page_index SET title = title;

CREATE INDEX source_document_search_vector_gin_idx ON source_document USING gin(search_vector);
CREATE INDEX source_document_title_trgm_idx ON source_document USING gin(title gin_trgm_ops);
CREATE INDEX legal_case_search_vector_gin_idx ON legal_case USING gin(search_vector);
CREATE INDEX legal_case_case_number_trgm_idx ON legal_case USING gin(case_number gin_trgm_ops);
CREATE INDEX legal_case_court_trgm_idx ON legal_case USING gin(court_or_agency gin_trgm_ops);
CREATE INDEX wiki_page_index_search_vector_gin_idx ON wiki_page_index USING gin(search_vector);
CREATE INDEX wiki_page_index_title_trgm_idx ON wiki_page_index USING gin(title gin_trgm_ops);
CREATE INDEX wiki_page_index_slug_trgm_idx ON wiki_page_index USING gin(slug gin_trgm_ops);
