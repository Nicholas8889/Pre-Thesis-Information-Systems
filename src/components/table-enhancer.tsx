"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  compareTableValues,
  getTablePageRange,
  haveSameOrderedReferences,
  parseTableDate,
  shouldOfferCheckboxFilter,
  shouldOfferTableTextExpansion
} from "@/lib/table-utils";

const dateHeaderPattern = /date|due|created|updated|contact|deadline|sent|issued/i;
const skippedHeaderPattern = /^actions?$/i;
const rowsPerPage = 10;

type FilterController = {
  reset: () => void;
  close: () => void;
  destroy: () => void;
};

type TableEnhancementState = {
  body: HTMLTableSectionElement;
  headers: HTMLTableCellElement[];
  rows: HTMLTableRowElement[];
  toolbar: HTMLDivElement;
  pagination: HTMLElement;
  destroy: () => void;
};

const tableStates = new Map<HTMLTableElement, TableEnhancementState>();

export function TableEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || pathname.endsWith("/print")) return;

    const enhanceTables = () => {
      [...tableStates.entries()].forEach(([table, state]) => {
        if (!table.isConnected) state.destroy();
      });
      document
        .querySelectorAll<HTMLTableElement>("main table:not([data-no-table-tools])")
        .forEach(enhanceTable);
    };

    const container = document.querySelector("main") ?? document.body;
    enhanceTables();
    let enhancementScheduled = false;
    const observer = new MutationObserver((mutations) => {
      if (!mutationsContainTable(mutations)) return;
      if (enhancementScheduled) return;
      enhancementScheduled = true;
      requestAnimationFrame(() => {
        enhancementScheduled = false;
        enhanceTables();
      });
    });
    observer.observe(container, {
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
      [...tableStates.values()].forEach((state) => state.destroy());
    };
  }, [pathname]);

  return null;
}

function mutationsContainTable(mutations: MutationRecord[]) {
  return mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches("table") || Boolean(node.querySelector("table"));
    })
  );
}

function enhanceTable(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const body = table.tBodies[0];
  if (!body || headers.length === 0) return;

  const rows = Array.from(body.rows);
  const existingState = tableStates.get(table);
  if (
    existingState &&
    existingState.body === body &&
    haveSameOrderedReferences(existingState.headers, headers) &&
    haveSameOrderedReferences(existingState.rows, rows) &&
    existingState.toolbar.isConnected &&
    existingState.pagination.isConnected
  ) {
    return;
  }
  existingState?.destroy();

  table.dataset.tableEnhanced = "true";
  const headerNames = headers.map((header) => header.textContent?.trim() ?? "");
  enhanceExpandableCells(rows, headerNames);
  const originalOrder = new Map(rows.map((row, index) => [row, index]));
  const columnFilters = new Map<number, (row: HTMLTableRowElement) => boolean>();
  const filterControllers: FilterController[] = [];
  const pageSearchInput = findPageSearchInput(table);
  const searchInput = pageSearchInput ?? document.createElement("input");
  let searchValue = searchInput.value.trim().toLowerCase();
  let currentPage = 1;

  const toolbar = document.createElement("div");
  toolbar.className = "table-enhancer-toolbar no-print";
  toolbar.dataset.tableToolbar = "true";

  if (!pageSearchInput) {
    const searchLabel = document.createElement("label");
    searchLabel.className = "table-enhancer-search";
    searchLabel.textContent = "Search";
    searchInput.type = "search";
    searchInput.placeholder = "Search rows...";
    searchInput.setAttribute("aria-label", "Search rows containing this text");
    searchLabel.append(searchInput);
    toolbar.append(searchLabel);
  }

  const onSearchInput = () => {
    searchValue = searchInput.value.trim().toLowerCase();
    currentPage = 1;
    applyFilters();
  };
  searchInput.addEventListener("input", onSearchInput);

  const resultCount = document.createElement("span");
  resultCount.className = "table-enhancer-count";
  toolbar.append(resultCount);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "table-enhancer-reset";
  resetButton.textContent = "Reset";
  resetButton.addEventListener("click", () => {
    searchInput.value = "";
    searchValue = "";
    currentPage = 1;
    columnFilters.clear();
    filterControllers.forEach((controller) => controller.reset());
    rows.sort((left, right) => (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0));
    rows.forEach((row) => body.append(row));
    headers.forEach((header) => {
      const indicator = header.querySelector<HTMLElement>("[data-sort-indicator]");
      if (indicator) indicator.textContent = "↕";
      delete header.dataset.sortDirection;
    });
    applyFilters();
  });
  toolbar.append(resetButton);
  table.parentElement?.insertBefore(toolbar, table);

  const pagination = document.createElement("nav");
  pagination.className = "table-enhancer-pagination no-print";
  pagination.setAttribute("aria-label", "Table pagination");
  const previousButton = createPaginationButton("Previous");
  const pageStatus = document.createElement("span");
  pageStatus.className = "table-enhancer-page-status";
  const nextButton = createPaginationButton("Next");
  previousButton.addEventListener("click", () => {
    currentPage -= 1;
    applyFilters();
  });
  nextButton.addEventListener("click", () => {
    currentPage += 1;
    applyFilters();
  });
  pagination.append(previousButton, pageStatus, nextButton);
  table.insertAdjacentElement("afterend", pagination);

  headers.forEach((header, columnIndex) => {
    const headerName = headerNames[columnIndex];
    if (!headerName || skippedHeaderPattern.test(headerName)) return;

    header.classList.add("table-enhanced-header");
    const controls = document.createElement("span");
    controls.className = "table-header-controls no-print";
    controls.dataset.tableHeaderControls = "true";

    const sortButton = document.createElement("button");
    sortButton.type = "button";
    sortButton.className = "table-sort-button";
    sortButton.setAttribute("aria-label", `Sort by ${headerName}`);
    sortButton.title = `Sort by ${headerName}`;
    const indicator = document.createElement("span");
    indicator.dataset.sortIndicator = "true";
    indicator.textContent = "↕";
    sortButton.append(indicator);
    sortButton.addEventListener("click", () => {
      const direction = header.dataset.sortDirection === "asc" ? "desc" : "asc";
      headers.forEach((otherHeader) => {
        delete otherHeader.dataset.sortDirection;
        const otherIndicator = otherHeader.querySelector<HTMLElement>("[data-sort-indicator]");
        if (otherIndicator) otherIndicator.textContent = "↕";
      });
      header.dataset.sortDirection = direction;
      indicator.textContent = direction === "asc" ? "↑" : "↓";
      rows.sort((left, right) => {
        const comparison = compareTableValues(
          getCellText(left, columnIndex),
          getCellText(right, columnIndex)
        );
        return direction === "asc" ? comparison : -comparison;
      });
      rows.forEach((row) => body.append(row));
      currentPage = 1;
      applyFilters();
    });
    controls.append(sortButton);

    const isDateColumn = dateHeaderPattern.test(headerName);
    const columnValues = rows.map((row) => getCellText(row, columnIndex));
    if (!isDateColumn && !shouldOfferCheckboxFilter(columnValues)) {
      header.append(controls);
      return;
    }

    const filterButton = document.createElement("button");
    filterButton.type = "button";
    filterButton.className = "table-filter-button";
    filterButton.setAttribute("aria-label", `Filter ${headerName}`);
    filterButton.title = `Filter ${headerName}`;
    filterButton.append(createFunnelIcon());
    controls.append(filterButton);
    header.append(controls);

    const controller = isDateColumn
      ? createDateFilter({
          headerName,
          columnIndex,
          button: filterButton,
          setFilter: (filter) => updateColumnFilter(columnIndex, filter)
        })
      : createCheckboxFilter({
          headerName,
          columnIndex,
          rows,
          button: filterButton,
          setFilter: (filter) => updateColumnFilter(columnIndex, filter)
        });
    filterControllers.push(controller);
  });

  applyFilters();

  const state: TableEnhancementState = {
    body,
    headers,
    rows,
    toolbar,
    pagination,
    destroy: () => {
      filterControllers.forEach((controller) => controller.destroy());
      searchInput.removeEventListener("input", onSearchInput);
      toolbar.remove();
      pagination.remove();
      headers.forEach((header) => {
        header
          .querySelectorAll("[data-table-header-controls]")
          .forEach((control) => control.remove());
        header.classList.remove("table-enhanced-header");
        delete header.dataset.sortDirection;
      });
      rows.forEach((row) => {
        row.hidden = false;
      });
      delete table.dataset.tableEnhanced;
      if (tableStates.get(table) === state) tableStates.delete(table);
    }
  };
  tableStates.set(table, state);

  function updateColumnFilter(
    columnIndex: number,
    filter: ((row: HTMLTableRowElement) => boolean) | null
  ) {
    if (filter) columnFilters.set(columnIndex, filter);
    else columnFilters.delete(columnIndex);
    currentPage = 1;
    applyFilters();
  }

  function applyFilters() {
    const matchingRows = rows.filter((row) => {
      const matchesSearch =
        !searchValue || getRowSearchText(row).includes(searchValue);
      const matchesColumns = [...columnFilters.values()].every((filter) => filter(row));
      return matchesSearch && matchesColumns;
    });
    const range = getTablePageRange(matchingRows.length, currentPage, rowsPerPage);
    currentPage = range.page;
    const pageRows = new Set(matchingRows.slice(range.start, range.end));
    rows.forEach((row) => {
      row.hidden = !pageRows.has(row);
    });

    const firstShown = matchingRows.length === 0 ? 0 : range.start + 1;
    resultCount.textContent =
      matchingRows.length === rows.length
        ? `Showing ${firstShown}-${range.end} of ${rows.length}`
        : `Showing ${firstShown}-${range.end} of ${matchingRows.length} matching (${rows.length} total)`;
    pageStatus.textContent = `Page ${range.page} of ${range.totalPages}`;
    previousButton.disabled = range.page <= 1;
    nextButton.disabled = range.page >= range.totalPages;
    pagination.hidden = range.totalPages <= 1;
  }
}

function findPageSearchInput(table: HTMLTableElement) {
  const card = table.closest<HTMLElement>(".shadow-soft");
  const searchInput = card?.querySelector<HTMLInputElement>('form input[name="q"]');
  return searchInput ?? null;
}

function createPaginationButton(text: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-enhancer-page-button";
  button.textContent = text;
  return button;
}

function enhanceExpandableCells(rows: HTMLTableRowElement[], headerNames: string[]) {
  rows.forEach((row) => {
    Array.from(row.cells).forEach((cell, columnIndex) => {
      if (cell.dataset.expandableCell === "true") return;
      if (cell.children.length > 0) return;

      const value = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!value || value === "-") return;

      cell.dataset.expandableCell = "true";
      cell.dataset.tableCellValue = value;
      cell.classList.add("table-cell-limited");

      const content = document.createElement("div");
      content.className = "table-cell-content";
      content.textContent = value;
      cell.replaceChildren(content);

      const isNotesColumn = /notes?|comments?/i.test(headerNames[columnIndex] ?? "");
      if (!shouldOfferTableTextExpansion(value, isNotesColumn ? 24 : 40)) return;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "table-cell-toggle no-print";
      toggle.textContent = "Show more";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const expanded = content.classList.toggle("table-cell-content-expanded");
        toggle.textContent = expanded ? "Show less" : "Show more";
        toggle.setAttribute("aria-expanded", String(expanded));
      });
      cell.append(toggle);
    });
  });
}

function createCheckboxFilter({
  headerName,
  columnIndex,
  rows,
  button,
  setFilter
}: {
  headerName: string;
  columnIndex: number;
  rows: HTMLTableRowElement[];
  button: HTMLButtonElement;
  setFilter: (filter: ((row: HTMLTableRowElement) => boolean) | null) => void;
}): FilterController {
  const values = [...new Set(rows.map((row) => getCellText(row, columnIndex)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .slice(0, 250);
  const popup = createPopup(headerName);
  const search = document.createElement("input");
  search.type = "search";
  search.className = "table-filter-search";
  search.placeholder = `Search ${headerName}`;
  search.setAttribute("aria-label", `Search values in ${headerName}`);
  popup.append(search);

  const options = document.createElement("div");
  options.className = "table-filter-options";
  const checkboxes = values.map((value) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    const text = document.createElement("span");
    text.textContent = value;
    label.append(checkbox, text);
    options.append(label);
    return { label, checkbox, value };
  });
  popup.append(options);

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    checkboxes.forEach((item) => {
      item.label.hidden = Boolean(query && !item.value.toLowerCase().includes(query));
    });
  });

  const actions = document.createElement("div");
  actions.className = "table-filter-actions";
  const clear = createPopupButton("Clear", "secondary");
  const apply = createPopupButton("Apply Filter", "primary");
  actions.append(clear, apply);
  popup.append(actions);

  clear.addEventListener("click", () => {
    checkboxes.forEach((item) => {
      item.checkbox.checked = false;
      item.label.hidden = false;
    });
    search.value = "";
    button.dataset.active = "false";
    setFilter(null);
    close();
  });
  apply.addEventListener("click", () => {
    const selected = new Set(
      checkboxes.filter((item) => item.checkbox.checked).map((item) => item.value)
    );
    button.dataset.active = selected.size > 0 ? "true" : "false";
    setFilter(
      selected.size > 0
        ? (row) => selected.has(getCellText(row, columnIndex))
        : null
    );
    close();
  });

  const close = connectPopup(button, popup);
  return {
    close,
    destroy: () => {
      close();
      popup.remove();
    },
    reset: () => {
      checkboxes.forEach((item) => {
        item.checkbox.checked = false;
        item.label.hidden = false;
      });
      search.value = "";
      button.dataset.active = "false";
      close();
    }
  };
}

function createDateFilter({
  headerName,
  columnIndex,
  button,
  setFilter
}: {
  headerName: string;
  columnIndex: number;
  button: HTMLButtonElement;
  setFilter: (filter: ((row: HTMLTableRowElement) => boolean) | null) => void;
}): FilterController {
  const popup = createPopup(headerName);
  const start = createDateField("Start Date");
  const end = createDateField("End Date");
  popup.append(start.label, end.label);

  const actions = document.createElement("div");
  actions.className = "table-filter-actions";
  const clear = createPopupButton("Clear", "secondary");
  const apply = createPopupButton("Apply Filter", "primary");
  actions.append(clear, apply);
  popup.append(actions);

  clear.addEventListener("click", () => {
    start.input.value = "";
    end.input.value = "";
    button.dataset.active = "false";
    setFilter(null);
    close();
  });
  apply.addEventListener("click", () => {
    const startDate = start.input.value
      ? new Date(`${start.input.value}T00:00:00`)
      : null;
    const endDate = end.input.value ? new Date(`${end.input.value}T23:59:59`) : null;
    const active = Boolean(startDate || endDate);
    button.dataset.active = active ? "true" : "false";
    setFilter(
      active
        ? (row) => {
            const rowDate = parseTableDate(getCellText(row, columnIndex));
            if (!rowDate) return false;
            return (!startDate || rowDate >= startDate) && (!endDate || rowDate <= endDate);
          }
        : null
    );
    close();
  });

  const close = connectPopup(button, popup);
  return {
    close,
    destroy: () => {
      close();
      popup.remove();
    },
    reset: () => {
      start.input.value = "";
      end.input.value = "";
      button.dataset.active = "false";
      close();
    }
  };
}

function createPopup(titleText: string) {
  const popup = document.createElement("div");
  popup.className = "table-filter-popup no-print";
  popup.dataset.tableFilterPopup = "true";
  popup.hidden = true;
  const title = document.createElement("strong");
  title.textContent = `Filter ${titleText}`;
  popup.append(title);
  document.body.append(popup);
  return popup;
}

function connectPopup(button: HTMLButtonElement, popup: HTMLDivElement) {
  let outsideHandler: ((event: MouseEvent) => void) | null = null;

  const close = () => {
    popup.hidden = true;
    if (outsideHandler) document.removeEventListener("click", outsideHandler);
    outsideHandler = null;
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll<HTMLElement>("[data-table-filter-popup]").forEach((item) => {
      if (item !== popup) item.hidden = true;
    });
    popup.hidden = !popup.hidden;
    if (popup.hidden) {
      close();
      return;
    }
    positionPopup(button, popup);
    outsideHandler = (outsideEvent) => {
      if (!popup.contains(outsideEvent.target as Node)) close();
    };
    document.addEventListener("click", outsideHandler);
  });
  popup.addEventListener("click", (event) => event.stopPropagation());
  return close;
}

function positionPopup(button: HTMLButtonElement, popup: HTMLDivElement) {
  const rect = button.getBoundingClientRect();
  const width = 288;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  popup.style.left = `${left}px`;
  popup.style.top = `${rect.bottom + 6}px`;
}

function createDateField(text: string) {
  const label = document.createElement("label");
  label.className = "table-filter-date-field";
  label.textContent = text;
  const input = document.createElement("input");
  input.type = "date";
  label.append(input);
  return { label, input };
}

function createPopupButton(text: string, tone: "primary" | "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `table-filter-${tone}`;
  button.textContent = text;
  return button;
}

function createFunnelIcon() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", "M3 4h18l-7 8v6l-4 2v-8L3 4z");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function getCellText(row: HTMLTableRowElement, columnIndex: number) {
  const cell = row.cells[columnIndex];
  if (!cell) return "";
  return (
    cell.dataset.tableCellValue ?? cell.textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

function getRowSearchText(row: HTMLTableRowElement) {
  return Array.from(row.cells)
    .map((_, columnIndex) => getCellText(row, columnIndex))
    .join(" ")
    .toLowerCase();
}
