// scripts/migrate/id-map.ts
// In-memory registry mapping legacy Oracle IDs → new PostgreSQL UUIDs.
// Keys use the pattern: "tableName:legacyId" for unambiguous lookups.

export class IdMap {
  private maps: Map<string, Map<string, string>> = new Map();

  set(table: string, legacyId: string, newId: string): void {
    if (!this.maps.has(table)) {
      this.maps.set(table, new Map());
    }
    this.maps.get(table)!.set(legacyId, newId);
  }

  get(table: string, legacyId: string): string | undefined {
    return this.maps.get(table)?.get(legacyId);
  }

  /** Throws if the mapping does not exist. Use when FK must resolve. */
  require(table: string, legacyId: string): string {
    const id = this.get(table, legacyId);
    if (!id) {
      throw new Error(
        `IdMap: no mapping for table="${table}" legacyId="${legacyId}". ` +
        `Ensure the parent table was migrated before this one.`
      );
    }
    return id;
  }

  /** Number of entries registered for a table. */
  count(table: string): number {
    return this.maps.get(table)?.size ?? 0;
  }

  /** All registered tables. */
  tables(): string[] {
    return Array.from(this.maps.keys());
  }
}
