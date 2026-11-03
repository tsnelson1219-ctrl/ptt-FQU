import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { PAGE_STATE } from "../../js/sites/index.js";
import BlacklistPanel from "./BlacklistPanel.js";
import { BLACKLIST_RULE_TYPES as RULE_TYPES, makeEmptyBlacklistData as makeEmptyData, normalizeBlacklistData } from "./blacklist_data.js";

const STORAGE_KEY = "ptt-fqu.blacklist.v1";
const THEME_KEY = "ptt-fqu.blacklist.theme";
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/i;

function readData() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const normalized = normalizeBlacklistData(raw);
    const { migrated, ...data } = normalized;
    if (migrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Keep migrated rules visible even when storage is read-only.
      }
    }
    return data;
  } catch {
    return makeEmptyData();
  }
}

function normalizeId(text) {
  const value = String(text || "").trim().replace(/\u00a0/g, " ");
  return ID_RE.test(value) ? value : "";
}

function normalizeKeywordSelection(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findArticleAuthorColumn(lines) {
  if (!Array.isArray(lines)) return null;
  const authorHeader = /作\s*者/;
  const listHeader = /編\s*號/;
  const followingHeaders = [
    /標\s*題/,
    /看\s*板/,
    /推\s*文/,
    /回\s*應/,
    /人\s*氣/,
    /狀\s*態/,
  ];

  for (let row = 0; row < Math.min(lines.length, 8); row += 1) {
    const text = rowText(lines[row]);
    if (!listHeader.test(text)) continue;
    const authorMatch = authorHeader.exec(text);
    if (!authorMatch) continue;

    const headerStart = authorMatch.index;
    const nextColumnStarts = followingHeaders
      .map((pattern) => {
        const match = pattern.exec(text);
        return match && match.index > headerStart ? match.index : -1;
      })
      .filter((index) => index >= 0);
    const searchStart = Math.max(0, headerStart - 20);
    const searchEnd = nextColumnStarts.length
      ? Math.min(text.length, Math.min(...nextColumnStarts))
      : Math.min(text.length, headerStart + 20);
    const starts = new Map();

    // Use repeated token alignment across visible article rows. The header can
    // be centered within its cell, while author IDs stay aligned row to row.
    for (let line = 0; line < lines.length; line += 1) {
      const rowTextValue = rowText(lines[line]);
      if (!isArticleListRow(rowTextValue)) continue;
      const area = rowTextValue.slice(searchStart, searchEnd);
      for (const match of area.matchAll(/[a-z0-9][a-z0-9_-]{0,23}/gi)) {
        const start = searchStart + match.index;
        starts.set(start, (starts.get(start) || 0) + 1);
      }
    }

    const alignedStart = [...starts.entries()].sort((a, b) =>
      b[1] - a[1] || Math.abs(a[0] - headerStart) - Math.abs(b[0] - headerStart)
    )[0]?.[0];
    if (alignedStart === undefined) {
      return {
        start: Math.max(0, headerStart - 20),
        end: searchEnd,
        anchor: headerStart,
      };
    }
    return {
      start: Math.max(0, alignedStart - 1),
      end: Math.min(searchEnd, alignedStart + 24),
      anchor: alignedStart,
    };
  }
  return null;
}

function fallbackAuthorColumn(length) {
  const start = Math.floor(length * 0.58);
  return { start, end: length, anchor: start };
}

function getIdTokenAtColumn(text, col, column) {
  if (!column || col < column.start || col >= column.end) return "";
  const isIdChar = (ch) => /^[a-z0-9_-]$/i.test(ch || "");
  if (!isIdChar(text[col])) return "";
  let start = col;
  let end = col + 1;
  while (start > column.start && isIdChar(text[start - 1])) start -= 1;
  while (end < column.end && isIdChar(text[end])) end += 1;
  return normalizeId(text.slice(start, end));
}

function getArticleAuthor(text, column) {
  const datedRow = /\d{1,2}\/\d{1,2}\s+([a-z0-9][a-z0-9_-]{0,23})(?=\s|$)/i.exec(text);
  if (datedRow && datedRow.index <= 40) {
    const start = datedRow.index + datedRow[0].lastIndexOf(datedRow[1]);
    return { id: normalizeId(datedRow[1]), start, end: start + datedRow[1].length };
  }
  if (!column) return null;
  const authorArea = text.slice(column.start, column.end);
  const matches = [...authorArea.matchAll(/[a-z0-9][a-z0-9_-]{0,23}/gi)];
  const match = matches.sort((a, b) =>
    Math.abs(column.start + a.index - (column.anchor ?? column.start)) -
    Math.abs(column.start + b.index - (column.anchor ?? column.start))
  )[0];
  if (!match) return null;
  const start = column.start + match.index;
  return { id: normalizeId(match[0]), start, end: start + match[0].length };
}

function getArticleAuthorId(text, column) {
  return getArticleAuthor(text, column)?.id || "";
}

function getPushAuthor(text) {
  const match = /^(\s*(?:推|噓|→)\s*)([a-z0-9][a-z0-9_-]{0,23})(?=\s*[:：])/i.exec(text);
  if (!match) return null;
  const start = match[1].length;
  return { id: normalizeId(match[2]), start, end: start + match[2].length };
}

function normalizeKeywordText(text) {
  return String(text || "")
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1")
    .toLowerCase();
}

function getContextAuthorId(app, context = {}) {
  const selected = normalizeId(context.selectedText);
  if (selected) return selected;
  const position = Number.isFinite(context.clickRow) && Number.isFinite(context.clickCol)
    ? { row: context.clickRow, col: context.clickCol }
    : Number.isFinite(context.clickX) && Number.isFinite(context.clickY)
    ? app?.clientToPos?.(context.clickX, context.clickY)
    : null;
  if (!position) return "";
  const row = Number(position?.row);
  const col = Number(position?.col);
  const chars = app?.buf?.lines?.[row];
  if (!Array.isArray(chars) || !Number.isFinite(col)) return "";
  const text = rowText(chars);
  const state = app?.site?.pageState;
  let tokenRange = null;

  const authorColumn = findArticleAuthorColumn(app?.buf?.lines);
  if (
    (state === PAGE_STATE.LIST || state === PAGE_STATE.MAPLE_LIST || authorColumn) &&
    isArticleListRow(text) &&
    hasArticleAuthor(text, authorColumn)
  ) {
    const column = authorColumn || fallbackAuthorColumn(chars.length);
    return getArticleAuthorId(text, column);
  } else if (state === PAGE_STATE.READING) {
    const pushAuthor = getPushAuthor(text);
    // A right-click anywhere on a push row should identify its author.
    if (pushAuthor) {
      return pushAuthor.id;
    }
    const match = text.match(/^\s*作\s*者\s*[:：]?\s*([a-z0-9][a-z0-9_-]{0,23})/i);
    if (match) {
      const start = match.index + match[0].lastIndexOf(match[1]);
      tokenRange = [start, start + match[1].length];
    }
  }
  if (!tokenRange || col < tokenRange[0] || col >= tokenRange[1]) return "";
  return getIdTokenAtColumn(text, col, { start: tokenRange[0], end: tokenRange[1] });
}

function rowText(row) {
  return (row || []).map((cell) => cell?.ch || " ").join("").replace(/\u00a0/g, " ");
}

function blankRow(row, label = "") {
  const copy = (row || []).map((cell) => {
    const next = Object.assign(Object.create(Object.getPrototypeOf(cell) || Object.prototype), cell);
    next.ch = " ";
    next.isDBCSLead = false;
    next.isDBCSTrail = false;
    next.startOfURL = false;
    next.endOfURL = false;
    next.partOfURL = false;
    next.fullurl = "";
    next.linkUrl = null;
    next.linkId = null;
    next.fg = 7;
    next.bg = 0;
    next.bright = false;
    next.invert = false;
    next.blink = false;
    next.underLine = false;
    return next;
  });
  for (let col = 0; col < Math.min(label.length, copy.length); col += 1) {
    copy[col].ch = label[col];
  }
  return copy;
}

function blankRowWithBlockedId(row, authorStart) {
  const copy = blankRow(row);
  const marker = "[Blocked]";
  for (let index = 0; index < marker.length && authorStart + index < copy.length; index += 1) {
    const cell = copy[authorStart + index];
    cell.ch = marker[index];
    cell.fg = 8;
    cell.bg = 0;
    cell.bright = false;
    cell.invert = false;
    cell.blink = false;
    cell.underLine = false;
  }
  return copy;
}

function isArticleListRow(text) {
  const dateAndAuthor = /\d{1,2}\/\d{1,2}\s+[a-z0-9][a-z0-9_-]{0,23}(?=\s|$)/i.exec(text);
  return (
    /^\s*(?:[>+*●◆]\s*)?(?:\[\s*\d+\s*\]|\d{1,6}[A-Za-z*]?)(?:\s*[+~\-!]\s*\d{0,3})?\s+/.test(text) ||
    Boolean(dateAndAuthor && dateAndAuthor.index <= 40)
  );
}

function hasArticleAuthor(text, authorColumn) {
  return Boolean(
    authorColumn ||
    /\d{1,2}\/\d{1,2}\s+[a-z0-9][a-z0-9_-]{0,23}(?=\s|$)/i.test(text)
  );
}

function wildcardMatch(value, pattern) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  try {
    return new RegExp(`^${escaped}$`, "i").test(value);
  } catch {
    return false;
  }
}

export class Blacklist extends PluginBase {
  static id = "blacklist";
  static name = "blacklist";
  static prefKey = "enableBlacklist";
  static group = "bbs";
  static icon = "filter";
  static title = "黑／白名單";
  static description = "管理黑名單規則與白名單作者 ID 例外。";
  static defaultPrefs = { enableBlacklist: true };

  constructor(app, options = {}) {
    super(app, options);
    this.data = readData();
    this.theme = this.readTheme();
    this.showsPanel = false;
  }

  onInit() {
    // Management and right-click actions remain available when filtering is disabled.
    this.unregisterOverlay(this.id);
    this.registerOverlay({
      id: this.id,
      render: (props) => this.renderOverlay(props),
    });
  }

  readTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  persist() {
    this.data.history = this.data.history.filter((event) => !event?.undone);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Keep the in-memory list usable when storage is unavailable.
    }
    this.app?.emit?.("term:overlay:update");
    this.app?.view?.redraw?.(true);
  }

  setTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, this.theme);
    } catch {
      // Theme selection remains available for the current session.
    }
    this.app?.emit?.("term:overlay:update");
  }

  openPanel(app = this.app) {
    this.showsPanel = true;
    app?.emit?.("term:overlay:update");
  }

  closePanel() {
    this.showsPanel = false;
    this.app?.emit?.("term:overlay:update");
    this.app?.setInputAreaFocus?.(true);
  }

  getContextMenuItems() {
    return [
      {
        id: "blacklist-unblock-blocked-id",
        order: 1,
        showWhenSelected: true,
        showWhenClicked: true,
        showInNormal: false,
        label: (app, context = {}) => {
          const info = this.getContextBlockedInfo(app, context);
          if (!info) return "解除封鎖";
          const ruleType = info.rule.type === "id" ? "作者 ID" : "ID 含字串";
          return `解除封鎖 ${info.id}（${ruleType}：${info.rule.value}）`;
        },
        visible: (app, context = {}) =>
          Boolean(this.getContextBlockedInfo(app, context)),
        onClick: (app, { state } = {}) => {
          const info = this.getContextBlockedInfo(app, state || {});
          if (info) this.undoEvent(info.rule.addedBySeq);
        },
      },
      {
        id: "blacklist-add-selected-id",
        order: 2,
        showWhenSelected: true,
        showWhenClicked: true,
        showInNormal: false,
        label: (app, context) => {
          const id = getContextAuthorId(app, context);
          return id ? `加入黑名單：${id}` : "加入黑名單";
        },
        visible: (app, context = {}) => {
          const id = getContextAuthorId(app, context);
          return Boolean(id && !this.getBlockingRule(id));
        },
        onClick: (app, { state } = {}) => {
          const id = getContextAuthorId(app, state || {});
          if (id) this.addRule("id", id, "右鍵加入");
        },
      },
      {
        id: "blacklist-open-manager",
        order: 80,
        showWhenSelected: true,
        showInNormal: true,
        label: "黑／白名單管理…",
        visible: () => true,
        onClick: (app) => this.openPanel(app || this.app),
      },
      {
        id: "whitelist-add-selected-id",
        order: 3,
        showWhenSelected: true,
        showWhenClicked: true,
        showInNormal: false,
        label: (app, context) => {
          const id = getContextAuthorId(app, context);
          return id ? `加入白名單：${id}` : "加入白名單";
        },
        visible: (app, context = {}) => {
          const id = getContextAuthorId(app, context);
          return Boolean(id && !this.isAllowlisted(id));
        },
        onClick: (app, { state } = {}) => {
          const id = getContextAuthorId(app, state || {});
          if (id) this.addRule("allow-id", id, "右鍵加入白名單");
        },
      },
      {
        id: "blacklist-add-selected-keyword",
        order: 4,
        showWhenSelected: true,
        showInNormal: false,
        label: (app, context = {}) => {
          const keyword = normalizeKeywordSelection(context.selectedText);
          const characters = Array.from(keyword);
          const preview = characters.slice(0, 18).join("");
          return `過濾關鍵字： ${preview}${characters.length > 18 ? "…" : ""}`;
        },
        visible: (app, context = {}) => Boolean(normalizeKeywordSelection(context.selectedText)),
        onClick: (app, { state } = {}) => {
          const keyword = normalizeKeywordSelection(state?.selectedText);
          if (keyword) this.addRule("keyword", keyword, "右鍵選取文字");
        },
      },
    ];
  }

  renderOverlay({ app } = {}) {
    if (app?.modalShown) {
      this.showsPanel = false;
      return null;
    }
    return React.createElement(BlacklistPanel, {
      app: app || this.app,
      plugin: this,
      open: this.showsPanel,
      data: this.data,
      theme: this.theme,
    });
  }

  onEnable() {
    this.app?.view?.redraw?.(true);
  }

  onDisable() {
    this.showsPanel = false;
    this.app?.view?.redraw?.(true);
  }

  addRule(type, rawValue, note = "", persist = true) {
    const value = String(rawValue || "").trim();
    if (!RULE_TYPES.has(type) || !value) return { ok: false, reason: "invalid" };
    if ((type === "id" || type === "allow-id") && !ID_RE.test(value)) return { ok: false, reason: "invalid-id" };
    if (this.data.rules.some((rule) => rule.type === type && rule.value.toLowerCase() === value.toLowerCase())) {
      return { ok: false, reason: "duplicate" };
    }
    const seq = this.data.nextSeq++;
    const rule = { type, value, note, addedBySeq: seq };
    this.data.rules.unshift(rule);
    this.data.history.unshift({
      seq,
      date: new Date().toISOString(),
      type,
      value,
      note,
      undone: false,
    });
    if (persist) this.persist();
    return { ok: true, rule, seq };
  }

  undoEvent(seq) {
    const historyIndex = this.data.history.findIndex((entry) => Number(entry.seq) === Number(seq));
    if (historyIndex < 0) return false;
    const ruleIndex = this.data.rules.findIndex((rule) => Number(rule.addedBySeq) === Number(seq));
    if (ruleIndex < 0) return false;
    this.data.rules.splice(ruleIndex, 1);
    this.data.history.splice(historyIndex, 1);
    this.persist();
    return true;
  }

  importText(text, defaultType = "id") {
    const lines = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    let added = 0;
    for (const line of lines) {
      const parts = line.split(/\t|,/);
      const candidateType = parts.length > 1 ? parts.shift().trim().toLowerCase() : defaultType;
      const value = parts.join(" ").trim() || line;
      const type = RULE_TYPES.has(candidateType) ? candidateType : (parts.length ? "" : defaultType);
      if (!type) continue;
      if (this.addRule(type, value, "文字檔匯入", false).ok) added += 1;
    }
    if (added) this.persist();
    return added;
  }

  matchesId(id) {
    return Boolean(this.getBlockingRule(id));
  }

  getBlockingRule(id) {
    const value = String(id || "").toLowerCase();
    return this.data.rules
      .filter((rule) =>
        (rule.type === "id" && rule.value.toLowerCase() === value) ||
        (rule.type === "idpart" && value.includes(rule.value.toLowerCase()))
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "id" ? -1 : 1;
        return b.value.length - a.value.length;
      })[0] || null;
  }

  getContextBlockedInfo(app, context = {}) {
    let id = getContextAuthorId(app, context);

    // The filter paints a blocked article body as [Blocked]. Resolve its
    // author from the source buffer so the row can be unblocked by context menu.
    if (!id && app?.site?.pageState === PAGE_STATE.READING) {
      const position = Number.isFinite(context.clickRow) && Number.isFinite(context.clickCol)
        ? { row: context.clickRow, col: context.clickCol }
        : Number.isFinite(context.clickX) && Number.isFinite(context.clickY)
        ? app?.clientToPos?.(context.clickX, context.clickY)
        : null;
      const clickedRow = Number(position?.row);
      const texts = (app?.buf?.lines || []).map(rowText);
      const authorRow = texts.findIndex((text) =>
        /^\s*作\s*者\s*[:：]?\s*([a-z0-9][a-z0-9_-]{0,23})/i.test(text)
      );
      if (Number.isFinite(clickedRow) && authorRow >= 0) {
        const match = texts[authorRow].match(
          /^\s*作\s*者\s*[:：]?\s*([a-z0-9][a-z0-9_-]{0,23})/i
        );
        const lastContentRow = Math.max(authorRow + 1, texts.length - 2);
        if (match && clickedRow > authorRow && clickedRow < lastContentRow) {
          id = normalizeId(match[1]);
        }
      }
    }

    if (!id || this.isAllowlisted(id)) return null;
    const rule = this.getBlockingRule(id);
    return rule ? { id, rule } : null;
  }

  isAllowlisted(id) {
    const value = String(id || "").toLowerCase();
    return this.data.rules.some((rule) =>
      rule.type === "allow-id" && rule.value.toLowerCase() === value
    );
  }

  filterLines(lines) {
    if (!Array.isArray(lines)) return lines;
    const rules = this.data.rules.filter((rule) => rule.type !== "watch");
    if (!rules.length) return lines;
    const state = this.app?.site?.pageState;
    const authorColumn = findArticleAuthorColumn(lines);
    const isList = state === PAGE_STATE.LIST || state === PAGE_STATE.MAPLE_LIST || Boolean(authorColumn);
    const texts = lines.map(rowText);

    const readingAuthorRow = state === PAGE_STATE.READING
      ? texts.findIndex((text) => /^\s*作\s*者\s*[:：]?\s*([a-z0-9][a-z0-9_-]{0,23})/i.test(text))
      : -1;
    const readingHeaderSeparator = readingAuthorRow >= 0
      ? texts.findIndex((text, index) => index > readingAuthorRow && !text.trim())
      : -1;
    const readingContentStart = readingAuthorRow >= 0
      ? readingHeaderSeparator >= 0 ? readingHeaderSeparator + 1 : readingAuthorRow + 4
      : 0;
    const readingContentEnd = Math.max(readingContentStart, texts.length - 2);

    if (readingAuthorRow >= 0) {
      const authorRow = readingAuthorRow;
      const match = texts[authorRow].match(/^\s*作\s*者\s*[:：]?\s*([a-z0-9][a-z0-9_-]{0,23})/i);
      // The article author's whitelist exempts that author only. Push rows
      // and keyword rules below must still be evaluated independently.
      if (match && !this.isAllowlisted(match[1]) && this.matchesId(match[1])) {
        const result = lines.slice();
        const lastContentRow = Math.max(authorRow + 1, result.length - 2);
        for (let row = authorRow + 1; row < lastContentRow; row += 1) {
          result[row] = blankRow(lines[row]);
        }
        if (authorRow + 1 < lastContentRow) {
          result[authorRow + 1] = blankRow(lines[authorRow + 1], `PTT-FQU: hidden author ${match[1]}`);
        }
        return result;
      }
    }

    let changed = false;
    const result = lines.map((row, index) => {
      const text = texts[index];
      const searchableText = normalizeKeywordText(text);
      let author = null;
      const isArticleRow = isList && isArticleListRow(text) && hasArticleAuthor(text, authorColumn);
      if (isArticleRow) {
        const column = authorColumn || fallbackAuthorColumn(text.length);
        author = getArticleAuthor(text, column);
      } else if (state === PAGE_STATE.READING) {
        author = getPushAuthor(text);
      }
      const authorAllowlisted = Boolean(author?.id && this.isAllowlisted(author.id));
      const isArticleContentRow = isArticleRow || (
        state === PAGE_STATE.READING &&
        index >= readingContentStart &&
        index < readingContentEnd
      );
      const hasKeyword = isArticleContentRow && rules.some((rule) =>
        rule.type === "keyword" && searchableText.includes(normalizeKeywordText(rule.value))
      );
      const blockedAuthor = Boolean(author?.id && !authorAllowlisted && this.matchesId(author.id));
      if (!hasKeyword && !blockedAuthor) return row;
      changed = true;
      if (author && (blockedAuthor || isList)) {
        return blankRowWithBlockedId(row, author.start);
      }
      return blankRow(row);
    });
    return changed ? result : lines;
  }
}

export default Blacklist;
