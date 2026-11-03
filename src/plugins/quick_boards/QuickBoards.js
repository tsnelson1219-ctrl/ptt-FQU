import React from "preact/compat";
import { PluginBase } from "../PluginBase.js";
import { PAGE_STATE } from "../../js/sites/index.js";
import "./QuickBoards.css";

const STORAGE_KEY = "ptt-fqu.quick-boards.v1";
const MAX_BOARDS = 12;
const MAX_LABEL_LENGTH = 16;
const BOARD_ID_RE = /^[a-z0-9_.-]{1,30}$/i;
const SAFE_PAGE_STATES = new Set([
  PAGE_STATE.MENU,
  PAGE_STATE.LIST,
  PAGE_STATE.MAPLE_LIST,
]);

function readBoards() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed
      .filter((item) => item && BOARD_ID_RE.test(String(item.board || "")))
      .map((item) => ({
        board: String(item.board).trim(),
        label: String(item.label || item.board).trim().slice(0, MAX_LABEL_LENGTH),
      }))
      .filter((item) => {
        const key = item.board.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_BOARDS);
  } catch {
    return [];
  }
}

class QuickBoardsOverlay extends React.Component {
  state = { manageOpen: false, board: "", label: "", toast: "" };

  componentDidMount() {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
    clearTimeout(this.toastTimer);
  }

  handleKeyDown = (event) => {
    if (event.key === "Escape" && this.state.manageOpen) {
      this.setState({ manageOpen: false });
      this.props.app?.setInputAreaFocus?.(true);
    }
  };

  notify = (message) => {
    clearTimeout(this.toastTimer);
    this.setState({ toast: message });
    this.toastTimer = setTimeout(() => this.setState({ toast: "" }), 1800);
  };

  addBoard = (event) => {
    event.preventDefault();
    const result = this.props.plugin.addBoard(this.state.board, this.state.label);
    if (!result.ok) {
      const message = result.reason === "duplicate"
        ? "看板已加入"
        : result.reason === "limit"
          ? `最多加入 ${MAX_BOARDS} 個看板`
          : "請輸入有效的看板代號";
      this.notify(message);
      return;
    }
    this.setState({ board: "", label: "" });
    this.notify("已加入快速看板");
  };

  openBoard = (board) => {
    const result = this.props.plugin.openBoard(board);
    if (result === "ok") {
      this.setState({ manageOpen: false });
      return;
    }
    this.notify(
      result === "disconnected"
        ? "尚未連線"
        : "請先回到看板列表或主選單"
    );
  };

  render() {
    const { plugin } = this.props;
    const boards = plugin.boards;
    return React.createElement(
      "div",
      {
        className: "PTTQuickBoards nomouse_command",
        onMouseDown: (event) => event.stopPropagation(),
        onClick: (event) => event.stopPropagation(),
        onContextMenu: (event) => event.stopPropagation(),
      },
      React.createElement(
        "div",
        { className: "PTTQuickBoards__bar", role: "toolbar", "aria-label": "快速看板" },
        React.createElement("span", { className: "PTTQuickBoards__title" }, "看板"),
        boards.map((item) =>
          React.createElement(
            "button",
            {
              key: item.board,
              type: "button",
              className: "PTTQuickBoards__board",
              title: item.board,
              onClick: () => this.openBoard(item.board),
            },
            item.label || item.board
          )
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "PTTQuickBoards__manageButton",
            "aria-label": "管理快速看板",
            title: "管理快速看板",
            onClick: () => this.setState((state) => ({ manageOpen: !state.manageOpen })),
          },
          "+"
        )
      ),
      this.state.manageOpen && React.createElement(
        "section",
        { className: "PTTQuickBoards__panel", role: "dialog", "aria-label": "管理快速看板" },
        React.createElement(
          "header",
          { className: "PTTQuickBoards__panelHeader" },
          React.createElement("strong", null, "快速看板"),
          React.createElement(
            "button",
            { type: "button", "aria-label": "關閉", onClick: () => this.setState({ manageOpen: false }) },
            "×"
          )
        ),
        React.createElement(
          "form",
          { className: "PTTQuickBoards__form", onSubmit: this.addBoard },
          React.createElement("input", {
            value: this.state.board,
            onInput: (event) => this.setState({ board: event.target.value }),
            placeholder: "看板代號",
            maxLength: 30,
            autoComplete: "off",
            spellCheck: false,
            "aria-label": "看板代號",
          }),
          React.createElement("input", {
            value: this.state.label,
            onInput: (event) => this.setState({ label: event.target.value }),
            placeholder: "按鍵名稱（選填）",
            maxLength: MAX_LABEL_LENGTH,
            autoComplete: "off",
            "aria-label": "按鍵名稱（選填）",
          }),
          React.createElement("button", { type: "submit" }, "加入")
        ),
        React.createElement(
          "div",
          { className: "PTTQuickBoards__list" },
          boards.length
            ? boards.map((item) => React.createElement(
                "div",
                { className: "PTTQuickBoards__item", key: item.board },
                React.createElement("span", null, item.label || item.board),
                React.createElement("code", null, item.board),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    "aria-label": `移除 ${item.board}`,
                    onClick: () => plugin.removeBoard(item.board),
                  },
                  "移除"
                )
              ))
            : React.createElement("p", { className: "PTTQuickBoards__empty" }, "尚未加入看板")
        ),
        React.createElement(
          "p",
          { className: "PTTQuickBoards__hint" },
          "在主選單或看板列表中，按看板按鍵即可跳轉。"
        )
      ),
      React.createElement(
        "div",
        { className: `PTTQuickBoards__toast${this.state.toast ? " is-visible" : ""}`, role: "status" },
        this.state.toast
      )
    );
  }
}

export class QuickBoards extends PluginBase {
  static id = "quick_boards";
  static name = "quick_boards";
  static prefKey = "enableQuickBoards";
  static group = "bbs";
  static icon = "star";
  static title = "快速看板";
  static description = "用固定按鍵快速跳到常用看板。";
  static defaultPrefs = { enableQuickBoards: true };

  constructor(app, options = {}) {
    super(app, options);
    this.boards = readBoards();
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.boards));
    } catch {
      // Keep shortcuts usable for the current session when storage is unavailable.
    }
    this.app?.emit?.("term:overlay:update");
  }

  addBoard(rawBoard, rawLabel = "") {
    const board = String(rawBoard || "").trim();
    const label = String(rawLabel || "").trim().slice(0, MAX_LABEL_LENGTH);
    if (!BOARD_ID_RE.test(board)) return { ok: false, reason: "invalid" };
    if (this.boards.some((item) => item.board.toLowerCase() === board.toLowerCase())) {
      return { ok: false, reason: "duplicate" };
    }
    if (this.boards.length >= MAX_BOARDS) return { ok: false, reason: "limit" };
    this.boards = [...this.boards, { board, label: label || board }];
    this.persist();
    return { ok: true };
  }

  removeBoard(board) {
    this.boards = this.boards.filter((item) => item.board !== board);
    this.persist();
  }

  openBoard(board) {
    if (this.app?.connectState !== 1 || !this.app?.conn) return "disconnected";
    if (!SAFE_PAGE_STATES.has(this.app?.site?.pageState)) return "unsafe-state";
    this.app.send(`s${board}\r`);
    this.app.setInputAreaFocus?.(true);
    return "ok";
  }

  renderOverlay({ app } = {}) {
    if (!this.enabled) return null;
    return React.createElement(QuickBoardsOverlay, {
      app: app || this.app,
      plugin: this,
    });
  }
}

export default QuickBoards;
