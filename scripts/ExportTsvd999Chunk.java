import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.HashMap;
import java.util.Map;

/**
 * Export a stable RN range from an Oracle TSVD999 table to UTF-8 TSV.
 *
 * Compile:
 *   javac -encoding UTF-8 -cp C:\path\to\ojdbc8.jar scripts\ExportTsvd999Chunk.java
 *
 * Run:
 *   java -cp "scripts;C:\path\to\ojdbc8.jar" ExportTsvd999Chunk --start 1 --end 1000 --output data\cases\chunks\tsvd999_000001_001000.tsv
 */
public final class ExportTsvd999Chunk {
  private static final int CLOB_EXCERPT_CHARS = 1000;

  private static final String QUERY_TEMPLATE = """
      SELECT *
      FROM (
        SELECT
          ROW_NUMBER() OVER (
            ORDER BY
              YYYY DESC NULLS LAST,
              MM DESC NULLS LAST,
              ENTER_CD NULLS LAST,
              SEQ NULLS LAST,
              ROWID
          ) AS RN,
          ROWID AS ORACLE_ROWID,
          ENTER_CD, YYYY, MM, SEQ,
          HIGHER_CD, HIGHER_NM, LOWER_CD, LOWER_NM,
          STATUS_CD, STATUS_NM, PROCESS_SPEED,
          TITLE,
          REQUEST_COMPANY_CD, REQUEST_COMPANY_NM,
          REQUEST_DEPT_NM, REQUEST_NM,
          REGISTER_DATE,
          APP_MENU,
          MANAGER_NM, MANAGER_DEPT_NM,
          RECEIPT_DATE, BUSINESS_LEVEL,
          COMPLETE_RESERVE_DATE, SOLUTION_FLAG,
          WORK_TIME, COMPLETE_DATE,
          PROCESS_CD, PROCESS_NM,
          VALUATION,
          GUBUN_CD, DELETE_FLAG,
          DBMS_LOB.SUBSTR(CONTENT, %d, 1) AS CONTENT_TEXT,
          DBMS_LOB.SUBSTR(COMPLETE_CONTENT, %d, 1) AS COMPLETE_TEXT,
          COMPLETE_CONTENT1
        FROM %s
        WHERE NVL(DELETE_FLAG, 'N') <> 'Y'
      )
      WHERE RN BETWEEN ? AND ?
      ORDER BY RN
      """;

  private ExportTsvd999Chunk() {}

  public static void main(String[] args) throws Exception {
    Map<String, String> parsed = parseArgs(args);
    int start = Integer.parseInt(require(parsed, "start"));
    int end = Integer.parseInt(require(parsed, "end"));
    if (start < 1 || end < start) {
      throw new IllegalArgumentException("--start must be >= 1 and --end must be >= --start");
    }
    Path output = Path.of(require(parsed, "output"));
    Files.createDirectories(output.toAbsolutePath().getParent());

    String user = requireEnv("ORACLE_USER");
    String password = requireEnv("ORACLE_PASSWORD");
    String jdbcUrl = requireEnv("ORACLE_JDBC_URL");
    String tableName = tableName();
    String query = QUERY_TEMPLATE.formatted(CLOB_EXCERPT_CHARS, CLOB_EXCERPT_CHARS, tableName);

    int rows = 0;
    try (
        Connection connection = DriverManager.getConnection(jdbcUrl, user, password);
        PreparedStatement statement = connection.prepareStatement(query);
        BufferedWriter writer = Files.newBufferedWriter(output, StandardCharsets.UTF_8)
    ) {
      statement.setInt(1, start);
      statement.setInt(2, end);
      statement.setFetchSize(500);
      try (ResultSet rs = statement.executeQuery()) {
        ResultSetMetaData meta = rs.getMetaData();
        int columns = meta.getColumnCount();
        for (int i = 1; i <= columns; i++) {
          if (i > 1) writer.write('\t');
          writer.write(meta.getColumnLabel(i));
        }
        writer.newLine();

        while (rs.next()) {
          for (int i = 1; i <= columns; i++) {
            if (i > 1) writer.write('\t');
            writer.write(escapeTsv(rs.getString(i)));
          }
          writer.newLine();
          rows += 1;
        }
      }
    }

    System.out.println("{\"output\":\"" + jsonEscape(output.toString()) + "\",\"rows\":" + rows + "}");
  }

  private static Map<String, String> parseArgs(String[] args) {
    Map<String, String> parsed = new HashMap<>();
    for (int i = 0; i < args.length; i++) {
      String token = args[i];
      if (!token.startsWith("--")) continue;
      String key = token.substring(2);
      if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
        throw new IllegalArgumentException("Missing value for " + token);
      }
      parsed.put(key, args[++i]);
    }
    return parsed;
  }

  private static String require(Map<String, String> values, String key) {
    String value = values.get(key);
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("Missing required --" + key);
    }
    return value;
  }

  private static String requireEnv(String key) {
    String value = System.getenv(key);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Missing " + key + " environment variable");
    }
    return value;
  }

  private static String tableName() {
    String value = System.getenv("ORACLE_TABLE");
    String table = (value == null || value.isBlank()) ? "TSVD999" : value.trim();
    if (!table.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)?")) {
      throw new IllegalStateException("ORACLE_TABLE must be TSVD999 or <schema>.TSVD999 style identifier");
    }
    return table;
  }

  private static String escapeTsv(String value) {
    if (value == null) return "";
    String normalized = value
        .replaceAll("[\\r\\n]+", " ")
        .replaceAll("\\s{2,}", " ")
        .trim();
    if (normalized.indexOf('\t') >= 0 || normalized.indexOf('"') >= 0) {
      return "\"" + normalized.replace("\"", "\"\"") + "\"";
    }
    return normalized;
  }

  private static String jsonEscape(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
