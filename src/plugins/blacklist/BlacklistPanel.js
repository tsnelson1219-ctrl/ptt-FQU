import React from "preact/compat";
import "./Blacklist.css";

const BLACKLIST_TYPE_NAMES = {
  id: "作者 ID",
  idpart: "ID 含字串",
  keyword: "文章關鍵字",
  watch: "追蹤 ID",
};
const WHITELIST_TYPE_NAMES = { "allow-id": "作者 ID" };
const TYPE_NAMES = { ...BLACKLIST_TYPE_NAMES, "allow-id": "白名單 ID" };

function escapeText(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardMatch(value, query) {
  try {
    const pattern = query.split("*").map(escapeText).join(".*");
    return new RegExp(`^${pattern}$`, "i").test(value);
  } catch {
    return false;
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function downloadText(text, filename) {
  const contents = `\ufeff${text}`;

  // Chromium desktop exposes the native Save As dialog on secure origins,
  // including localhost. Keep the legacy download fallback for other browsers.
  if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "PTT-FQU 名單文字檔",
            accept: { "text/plain": [".txt"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

async function exportRules(rules, filename) {
  const text = [
    "# PTT-FQU blacklist export",
    "# 格式：類型<TAB>內容",
    ...rules.map((rule) => `${rule.type.toUpperCase()}\t${rule.value}`),
  ].join("\n");
  return downloadText(`${text}\n`, filename);
}

export class BlacklistPanel extends React.Component {
  state = {
    query: "",
    selected: new Set(),
    activeTab: "blacklist",
    addOpen: false,
    ruleType: "id",
    ruleValue: "",
    ruleNote: "",
    toast: "",
    matchLimit: 8,
    expanded: false,
  };

  componentDidMount() {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
    clearTimeout(this.toastTimer);
  }

  handleKeyDown = (event) => {
    if (!this.props.open) return;
    if (event.key === "Escape") {
      if (this.state.addOpen) this.setState({ addOpen: false });
      else this.props.plugin.closePanel();
    }
  };

  notify = (message) => {
    clearTimeout(this.toastTimer);
    this.setState({ toast: message });
    this.toastTimer = setTimeout(() => this.setState({ toast: "" }), 2000);
  };

  setQuery = (event) => {
    this.setState({ query: event.target.value, matchLimit: 8, expanded: false });
  };

  setActiveTab = (activeTab) => {
    this.setState({
      activeTab,
      query: "",
      selected: new Set(),
      addOpen: false,
      ruleType: activeTab === "whitelist" ? "allow-id" : "id",
      matchLimit: 8,
      expanded: false,
    });
  };

  toggleSelected = (seq, checked) => {
    this.setState((state) => {
      const selected = new Set(state.selected);
      if (checked) selected.add(seq);
      else selected.delete(seq);
      return { selected };
    });
  };

  undo = (seq) => {
    if (this.props.plugin.undoEvent(seq)) {
      this.setState((state) => {
        const selected = new Set(state.selected);
        selected.delete(seq);
        return { selected };
      });
      this.notify("已取消這筆加入");
    }
  };

  add = () => {
    const { ruleType, ruleValue, ruleNote } = this.state;
    const result = this.props.plugin.addRule(ruleType, ruleValue, ruleNote.trim());
    if (!result.ok) {
      this.notify(result.reason === "duplicate" ? "項目已存在" : "請檢查輸入內容");
      return;
    }
    this.setState({ addOpen: false, ruleValue: "", ruleNote: "", selected: new Set() });
    this.notify(this.state.activeTab === "whitelist" ? "已加入白名單" : "已加入黑名單");
  };

  importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const defaultType = this.state.activeTab === "whitelist" ? "allow-id" : "id";
    const added = this.props.plugin.importText(await file.text(), defaultType);
    event.target.value = "";
    this.notify(`匯入 ${added} 筆`);
  };

  exportSelected = async () => {
    const isWhitelist = this.state.activeTab === "whitelist";
    const selectedEvents = this.props.data.history
      .filter((event) => this.state.selected.has(Number(event.seq)) && !event.undone && (isWhitelist ? event.type === "allow-id" : event.type !== "allow-id"))
      .sort((a, b) => Number(a.seq) - Number(b.seq));
    const rows = selectedEvents
      .filter((event) => event.type !== "watch")
      .map((event) => ({ type: event.type, value: event.value }));
    if (!rows.length) {
      this.notify(`選取項目沒有可匯出的${isWhitelist ? "白名單" : "黑名單"}內容`);
      return;
    }
    try {
      const result = await exportRules(rows, isWhitelist ? "ptt-fqu-whitelist-history.txt" : "ptt-fqu-blacklist-history.txt");
      if (result === "cancelled") this.notify("已取消儲存");
      else this.notify(`已匯出 ${rows.length} 筆`);
    } catch (error) {
      console.error("[PTT-FQU] 匯出名單失敗：", error);
      this.notify("匯出失敗，請檢查檔案權限");
    }
  };

  exportCurrentList = async () => {
    const isWhitelist = this.state.activeTab === "whitelist";
    const rows = this.props.data.rules.filter((rule) =>
      isWhitelist
        ? rule.type === "allow-id"
        : rule.type !== "watch" && rule.type !== "allow-id"
    );
    try {
      const result = await exportRules(rows, isWhitelist ? "ptt-fqu-whitelist.txt" : "ptt-fqu-blacklist.txt");
      if (result === "cancelled") this.notify("已取消儲存");
      else this.notify(`已匯出 ${rows.length} 筆`);
    } catch (error) {
      console.error("[PTT-FQU] 匯出名單失敗：", error);
      this.notify("匯出失敗，請檢查檔案權限");
    }
  };

  renderLookup() {
    const query = this.state.query.trim();
    if (!query) return null;
    const isWhitelist = this.state.activeTab === "whitelist";
    const rules = this.props.data.rules.filter((rule) =>
      isWhitelist ? rule.type === "allow-id" : rule.type !== "allow-id"
    );
    if (query.includes("*")) {
      const type = isWhitelist ? "allow-id" : "id";
      const matches = rules.filter((rule) => rule.type === type && wildcardMatch(rule.value, query));
      const visible = matches.slice(0, this.state.matchLimit);
      return (
        <div className="PTTBlacklist__lookupResult">
          <div className="PTTBlacklist__lookupStatus">符合的{isWhitelist ? "白名單" : "黑名單"} ID（{matches.length}）</div>
          <div className={`PTTBlacklist__matches ${this.state.expanded ? "is-expanded" : ""}`}>
            {visible.map((rule) => <span className="PTTBlacklist__match" key={rule.addedBySeq}>{rule.value}</span>)}
            {!matches.length && <span className="PTTBlacklist__muted">沒有符合的{isWhitelist ? "白名單" : "黑名單"} ID</span>}
          </div>
          {matches.length > 8 && (
            <div className="PTTBlacklist__lookupActions">
              <button type="button" className="PTTBlacklist__textButton" onClick={() => this.setState((state) => {
                const expanded = !state.expanded;
                return { expanded, matchLimit: expanded ? matches.length : 8 };
              })}>{this.state.expanded ? "收合" : "展開瀏覽"}</button>
              {this.state.expanded && <button type="button" className="PTTBlacklist__textButton" onClick={async () => {
                try {
                  const result = await exportRules(matches, isWhitelist ? "ptt-fqu-whitelist-matches.txt" : "ptt-fqu-blacklist-matches.txt");
                  if (result === "cancelled") this.notify("已取消儲存");
                  else this.notify(`已匯出 ${matches.length} 筆`);
                } catch (error) {
                  console.error("[PTT-FQU] 匯出查詢結果失敗：", error);
                  this.notify("匯出失敗，請檢查檔案權限");
                }
              }}>匯出結果</button>}
            </div>
          )}
        </div>
      );
    }

    const id = query.toLowerCase();
    const exactType = isWhitelist ? "allow-id" : "id";
    const exact = rules.find((rule) => rule.type === exactType && rule.value.toLowerCase() === id);
    const partial = isWhitelist ? null : rules.find((rule) => rule.type === "idpart" && id.includes(rule.value.toLowerCase()));
    const allowlisted = !isWhitelist && this.props.data.rules.some((rule) => rule.type === "allow-id" && rule.value.toLowerCase() === id);
    const blocked = !allowlisted && Boolean(exact || partial);
    const statusClass = isWhitelist
      ? (exact ? "is-allowed" : "is-clear")
      : (allowlisted ? "is-allowed" : blocked ? "is-blocked" : "is-clear");
    const statusText = isWhitelist
      ? (exact ? "白名單例外" : "不在白名單")
      : allowlisted
        ? "白名單例外"
        : `${blocked ? "已拉黑" : "未拉黑"}${exact ? " · 作者 ID" : partial ? " · ID 含字串" : ""}`;
    return (
      <div className="PTTBlacklist__lookupResult">
        <span className={`PTTBlacklist__status ${statusClass}`}>{statusText}</span>
      </div>
    );
  }

  render() {
    const { open, data, theme, plugin } = this.props;
    if (!open) return null;
    const isWhitelist = this.state.activeTab === "whitelist";
    const blacklistCount = data.rules.filter((rule) => rule.type === "id" || rule.type === "idpart").length;
    const activeCount = isWhitelist
      ? data.rules.filter((rule) => rule.type === "allow-id").length
      : blacklistCount;
    const sortedHistory = data.history
      .filter((event) => !event.undone && (isWhitelist ? event.type === "allow-id" : event.type !== "allow-id"))
      .sort((a, b) => Number(b.seq) - Number(a.seq));

    return (
      <div className="PTTBlacklist__backdrop nomouse_command" onMouseDown={(event) => {
        if (event.target === event.currentTarget) plugin.closePanel();
      }}>
        <section className={`PTTBlacklist PTTBlacklist--${theme}`} role="dialog" aria-modal="true" aria-label="黑／白名單管理">
          <div className="PTTBlacklist__themeBar">
            <div className="PTTBlacklist__themeButtons" aria-label="主題">
              <button type="button" className={theme === "dark" ? "is-active" : ""} aria-pressed={theme === "dark"} onClick={() => plugin.setTheme("dark")}>深色</button>
              <button type="button" className={theme === "light" ? "is-active" : ""} aria-pressed={theme === "light"} onClick={() => plugin.setTheme("light")}>淺色</button>
            </div>
            <button type="button" className="PTTBlacklist__close" onClick={() => plugin.closePanel()} aria-label="關閉">×</button>
          </div>

          <header className="PTTBlacklist__header">
            <h2>黑／白名單管理</h2>
            <div className="PTTBlacklist__actions">
              <button type="button" className="PTTBlacklist__button PTTBlacklist__button--add" onClick={() => this.setState((state) => ({ addOpen: !state.addOpen, ruleType: state.activeTab === "whitelist" ? "allow-id" : "id", ruleValue: "", ruleNote: "" }))}>{this.state.addOpen ? "收合新增" : "＋ 新增"}</button>
              <label className="PTTBlacklist__button">
                匯入 TXT<input type="file" accept=".txt,text/plain" onChange={this.importFile} />
              </label>
              <button type="button" className="PTTBlacklist__button" onClick={this.exportCurrentList}>匯出{isWhitelist ? "白名單" : "黑名單"}</button>
            </div>
          </header>

          <div className="PTTBlacklist__tabs" role="tablist" aria-label="名單類型">
            <button type="button" role="tab" id="ptt-blacklist-tab" aria-selected={!isWhitelist} aria-controls="ptt-blacklist-tabpanel" className={!isWhitelist ? "is-active" : ""} onClick={() => this.setActiveTab("blacklist")}>黑名單</button>
            <button type="button" role="tab" id="ptt-whitelist-tab" aria-selected={isWhitelist} aria-controls="ptt-blacklist-tabpanel" className={isWhitelist ? "is-active" : ""} onClick={() => this.setActiveTab("whitelist")}>白名單</button>
          </div>

          <div className="PTTBlacklist__tabBody" id="ptt-blacklist-tabpanel" role="tabpanel" aria-labelledby={isWhitelist ? "ptt-whitelist-tab" : "ptt-blacklist-tab"}>
          {this.state.addOpen && (
            <form className="PTTBlacklist__addForm" onSubmit={(event) => { event.preventDefault(); this.add(); }}>
              <h3>新增{isWhitelist ? "白名單" : "黑名單"}項目</h3>
              {isWhitelist ? (
                <div className="PTTBlacklist__fixedType">{WHITELIST_TYPE_NAMES["allow-id"]} 白名單</div>
              ) : (
                <label>類型
                  <select value={this.state.ruleType} onChange={(event) => this.setState({ ruleType: event.currentTarget.value })}>
                    {Object.entries(BLACKLIST_TYPE_NAMES).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                  </select>
                </label>
              )}
              <label>{isWhitelist ? "作者 ID" : "ID 或內容"}
                <input autoFocus value={this.state.ruleValue} onChange={(event) => this.setState({ ruleValue: event.currentTarget.value })} />
              </label>
              <label>備註
                <input value={this.state.ruleNote} onChange={(event) => this.setState({ ruleNote: event.currentTarget.value })} placeholder="選填" />
              </label>
              <div className="PTTBlacklist__modalActions">
                <button type="button" className="PTTBlacklist__button" onClick={() => this.setState({ addOpen: false })}>取消</button>
                <button type="submit" className="PTTBlacklist__button PTTBlacklist__button--primary">加入</button>
              </div>
            </form>
          )}

          <div className="PTTBlacklist__lookup">
            <label htmlFor="ptt-blacklist-query">{isWhitelist ? "白名單查詢" : "黑名單查詢"}</label>
            <input id="ptt-blacklist-query" value={this.state.query} onInput={this.setQuery} placeholder="輸入 ID 或 *字串*" autoComplete="off" spellCheck="false" />
            {this.renderLookup()}
          </div>

          <section className="PTTBlacklist__history">
            <div className="PTTBlacklist__historyHeader">
              <h3>加入歷程</h3>
              <div className="PTTBlacklist__historyTools">
                <span>{`${isWhitelist ? "白名單" : "黑名單"} ${activeCount} 項`}</span>
                {this.state.selected.size > 0 && <span>已選 {this.state.selected.size} 筆</span>}
                <button type="button" className="PTTBlacklist__button" disabled={!this.state.selected.size} onClick={this.exportSelected}>匯出選取</button>
              </div>
            </div>
            <div className="PTTBlacklist__historyList">
              {sortedHistory.length ? sortedHistory.map((event) => {
                const active = data.rules.some((rule) => Number(rule.addedBySeq) === Number(event.seq));
                return (
                  <div className={`PTTBlacklist__entry ${event.undone ? "is-undone" : ""}`} key={event.seq}>
                    <input type="checkbox" aria-label={`選取歷程 ${event.seq}`} checked={this.state.selected.has(Number(event.seq))} onChange={(e) => this.toggleSelected(Number(event.seq), e.target.checked)} />
                    <span className="PTTBlacklist__seq">#{String(event.seq).padStart(5, "0")}</span>
                    <time className="PTTBlacklist__date" dateTime={event.date}>{formatDate(event.date)}</time>
                    <strong className="PTTBlacklist__value">{event.value}</strong>
                    <span className={`PTTBlacklist__type PTTBlacklist__type--${event.type}`}>{TYPE_NAMES[event.type] || event.type}</span>
                    <button type="button" className="PTTBlacklist__undo" disabled={!active} onClick={() => this.undo(Number(event.seq))}>{active ? "取消" : "已取消"}</button>
                  </div>
                );
              }) : <div className="PTTBlacklist__empty">尚無加入紀錄</div>}
            </div>
          </section>
          </div>

          <div className={`PTTBlacklist__toast ${this.state.toast ? "is-visible" : ""}`} role="status">{this.state.toast}</div>
        </section>
      </div>
    );
  }
}

export default BlacklistPanel;
