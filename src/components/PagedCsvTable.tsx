import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type TableCell = string | number | null;
type TableRow = Record<string, TableCell>;
type CachedTable = { columns: string[]; rows: TableRow[] };

interface PagedCsvTableProps {
  columns: string[];
  fallbackRows: TableRow[];
  sourcePath?: string;
  totalRows: number;
  rowLabel?: string;
  searchable?: boolean;
}

const pageSize = 10;
const csvTableCache = new Map<string, CachedTable>();

export function PagedCsvTable({
  columns,
  fallbackRows,
  rowLabel = "rows",
  searchable = true,
  sourcePath,
  totalRows
}: PagedCsvTableProps) {
  const [page, setPage] = useState(1);
  const [jumpValue, setJumpValue] = useState("1");
  const [search, setSearch] = useState("");
  const [loadedRows, setLoadedRows] = useState<TableRow[] | null>(null);
  const [loadedColumns, setLoadedColumns] = useState<string[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setPage(1);
    setJumpValue("1");
  }, [sourcePath, columns.join("\u0000")]);

  useEffect(() => {
    if (!sourcePath) {
      setLoadedRows(null);
      setLoadedColumns(null);
      setLoadFailed(false);
      return;
    }

    const cached = csvTableCache.get(sourcePath);
    if (cached) {
      setLoadedColumns(cached.columns.length ? cached.columns : columns);
      setLoadedRows(cached.rows);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;
    setLoadedRows(null);
    setLoadedColumns(null);
    setLoadFailed(false);
    invoke<string>("read_text_file", { path: sourcePath })
      .then((content) => {
        if (cancelled) {
          return;
        }
        const parsed = parseCsv(content);
        csvTableCache.set(sourcePath, parsed);
        setLoadedColumns(parsed.columns.length ? parsed.columns : columns);
        setLoadedRows(parsed.rows);
        setLoadFailed(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLoadedRows(null);
        setLoadedColumns(null);
        setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [sourcePath, columns]);

  const useFallbackRows = !sourcePath || loadFailed;
  const isLoadingRows = Boolean(sourcePath && !loadedRows && !loadFailed);
  const tableColumns = loadedColumns?.length ? loadedColumns : columns;
  const allRows = useFallbackRows ? fallbackRows : loadedRows ?? [];
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return allRows;
    }
    return allRows.filter((row) => tableColumns.some((column) => String(row[column] ?? "").toLowerCase().includes(query)));
  }, [allRows, search, tableColumns]);
  const resolvedTotalRows = loadedRows ? filteredRows.length : useFallbackRows ? totalRows : 0;
  const pageCount = Math.max(1, Math.ceil(Math.max(resolvedTotalRows, 0) / pageSize));
  const safePage = Math.min(page, pageCount);
  const firstIndex = (safePage - 1) * pageSize;
  const pageRows = loadedRows ? filteredRows.slice(firstIndex, firstIndex + pageSize) : useFallbackRows ? fallbackRows.slice(0, pageSize) : [];
  const startRow = resolvedTotalRows ? firstIndex + 1 : 0;
  const endRow = resolvedTotalRows ? Math.min(firstIndex + pageRows.length, resolvedTotalRows) : 0;
  const pageButtons = buildPageButtons(safePage, pageCount);

  function goToPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(pageCount, nextPage));
    setPage(normalized);
    setJumpValue(String(normalized));
  }

  function submitJump() {
    const parsed = Number.parseInt(jumpValue, 10);
    if (Number.isNaN(parsed)) {
      setJumpValue(String(safePage));
      return;
    }
    goToPage(parsed);
  }

  return (
    <div className="matrix-preview matrix-preview--preprocess">
      <div className="matrix-preview__toolbar">
        {searchable ? (
          <label className="matrix-preview__search">
            <span>Search</span>
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                goToPage(1);
              }}
              placeholder="Search table"
            />
          </label>
        ) : null}
        <label className="matrix-preview__jump">
          <span>Go to page</span>
          <input
            min="1"
            max={pageCount}
            type="number"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitJump();
              }
            }}
          />
          <button type="button" onClick={submitJump}>Go</button>
        </label>
      </div>

      <div className="matrix-preview__scroll">
        <table>
          <thead>
            <tr>{tableColumns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {isLoadingRows ? (
              <tr>
                <td colSpan={tableColumns.length || 1} className="matrix-preview__empty">Loading table...</td>
              </tr>
            ) : pageRows.length ? (
              pageRows.map((row, rowIndex) => (
                <tr key={`${safePage}-${rowIndex}`}>{tableColumns.map((column) => <td key={`${rowIndex}-${column}`}>{formatCellValue(row[column], column)}</td>)}</tr>
              ))
            ) : (
              <tr>
                <td colSpan={tableColumns.length || 1} className="matrix-preview__empty">No rows matched the current search.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="matrix-preview__pager">
        <span className="matrix-preview__note">
          Page {safePage} of {pageCount} | Showing {formatNumber(startRow)}-{formatNumber(endRow)} of {formatNumber(resolvedTotalRows)} {rowLabel}
        </span>
        <div className="matrix-preview__pager-actions">
          <button type="button" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}>Previous</button>
          {pageButtons.map((button, index) => button === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="matrix-preview__pager-ellipsis">...</span>
          ) : (
            <button key={button} type="button" className={button === safePage ? "is-active" : ""} onClick={() => goToPage(button)}>{button}</button>
          ))}
          <button type="button" disabled={safePage >= pageCount} onClick={() => goToPage(safePage + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

function parseCsv(content: string): { columns: string[]; rows: TableRow[] } {
  const records = parseDelimited(content.replace(/^\uFEFF/, ""));
  const [header = [], ...body] = records;
  const columns = header.map((column) => column.trim());
  const rows = body
    .filter((record) => record.some((cell) => cell.length > 0))
    .map((record) => Object.fromEntries(columns.map((column, index) => [column, record[index] ?? ""])));
  return { columns, rows };
}

function formatCellValue(value: TableCell, column?: string) {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = String(value).trim();
  if (!raw) {
    return "";
  }
  if (!isNumericCell(raw)) {
    return raw;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return raw;
  }
  if (isPValueColumn(column)) {
    return formatPValueCell(numeric);
  }
  if (Number.isInteger(numeric) && !/[.eE]/.test(raw)) {
    return raw;
  }

  return numeric.toFixed(4);
}

function formatPValueCell(value: number) {
  if (value === 0) {
    return "<1e-300";
  }
  const [mantissa = "", exponent = ""] = value.toExponential(3).split("e");
  const compactMantissa = mantissa.replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
  const compactExponent = exponent.replace(/^\+/u, "").replace(/^-0+/u, "-").replace(/^0+/u, "");
  return `${compactMantissa}e${compactExponent || "0"}`;
}
function isPValueColumn(column?: string) {
  const normalized = String(column ?? "").trim().toLowerCase();
  return normalized === "pvalue" || normalized === "padj";
}
function isNumericCell(value: string) {
  if (/^0\d+/u.test(value)) {
    return false;
  }
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value);
}

function parseDelimited(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function buildPageButtons(currentPage: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)
    .sort((left, right) => left - right);
  const buttons: Array<number | "ellipsis"> = [];

  sorted.forEach((pageNumber, index) => {
    const previous = sorted[index - 1];
    if (previous && pageNumber - previous > 1) {
      buttons.push("ellipsis");
    }
    buttons.push(pageNumber);
  });

  return buttons;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}
