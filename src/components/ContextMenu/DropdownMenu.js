import cx from "classnames";
import React, { useRef, useLayoutEffect } from "react";
import { _ } from "../../js/i18n";
import "./DropdownMenu.css";

const top = (mouseHeight, menuHeight) => {
  const pageHeight = typeof window !== "undefined" ? window.innerHeight : 600;

  // opening menu would pass the bottom of the page
  if (mouseHeight + menuHeight > pageHeight && menuHeight < mouseHeight) {
    return mouseHeight - menuHeight;
  }
  return mouseHeight;
};

const getSafeAreaLeft = () => {
  if (typeof document !== "undefined") {
    const termWin = document.getElementById("TermWindow");
    if (termWin && typeof termWin.getBoundingClientRect === "function") {
      return termWin.getBoundingClientRect().left || 0;
    }
  }
  return 0;
};

const left = (mouseWidth, menuWidth) => {
  const pageWidth = typeof window !== "undefined" ? window.innerWidth : 800;
  const minLeft = getSafeAreaLeft();

  // opening menu would pass the side of the page
  if (mouseWidth + menuWidth > pageWidth && menuWidth < mouseWidth) {
    return Math.max(minLeft, mouseWidth - menuWidth);
  }
  return Math.max(minLeft, mouseWidth);
};

const normalizeSelectedText = (selectedText) => {
  if (selectedText.length > 15) {
    return `${selectedText.slice(0, 15)} …`;
  }
  return selectedText;
};

const isMac = typeof navigator !== "undefined" && (
  /Mac|iPod|iPhone|iPad/i.test(navigator.platform || "") ||
  /Macintosh|Mac OS X/i.test(navigator.userAgent || "")
);

const MenuItem = ({
  eventKey,
  onSelect,
  onClick,
  divider,
  disabled,
  className,
  children,
  openedAtRef,
}) => {
  if (divider) {
    return <li role="separator" className="divider" />;
  }
  const handleClick = (e) => {
    e.preventDefault();
    if (disabled) {
      e.stopPropagation();
      return;
    }
    if (openedAtRef && Date.now() < openedAtRef.current + 350) {
      return;
    }
    if (onSelect) onSelect(eventKey);
    if (onClick) onClick(e);
  };
  return (
    <li role="presentation" className={cx(className, { disabled })}>
      <a
        role="menuitem"
        aria-disabled={disabled || undefined}
        tabIndex="-1"
        href="#"
        onClick={handleClick}
      >
        {children}
      </a>
    </li>
  );
};

export const DropdownMenu = ({
  open,
  pageX,
  pageY,
  anchorRect,
  urlEnabled,
  normalEnabled,
  selEnabled,
  selectedText,
  onMenuSelect,
  onSettingsClick,
  pluginItems = [],
}) => {
  const menuRef = useRef(null);
  const openedAtRef = useRef(0);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    if (!open) {
      el.style.visibility = "hidden";
      return;
    }

    openedAtRef.current = Date.now();

    const updatePosition = () => {
      el.style.visibility = "hidden";
      const pageHeight =
        typeof window !== "undefined" ? window.innerHeight : 600;
      const pageWidth =
        typeof window !== "undefined" ? window.innerWidth : 800;

      if (anchorRect) {
        const isBottomHalf = anchorRect.top > pageHeight / 2;
        if (isBottomHalf) {
          const menuTop = Math.max(8, anchorRect.top - el.clientHeight - 6);
          el.style.top = `${menuTop}px`;
        } else {
          const menuTop = Math.min(
            pageHeight - el.clientHeight - 8,
            anchorRect.bottom + 6
          );
          el.style.top = `${menuTop}px`;
        }
        const minLeft = Math.max(8, getSafeAreaLeft() + 8);
        const menuLeft = Math.max(
          minLeft,
          Math.min(
            pageWidth - el.clientWidth - 8,
            anchorRect.right - el.clientWidth
          )
        );
        el.style.left = `${menuLeft}px`;
      } else {
        el.style.top = `${top(pageY, el.clientHeight)}px`;
        el.style.left = `${left(pageX, el.clientWidth)}px`;
      }
      el.style.visibility = "visible";
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, pageX, pageY, anchorRect]);

  const handleContextMenu = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <ul
      className="dropdown-menu DropdownMenu--reset"
      ref={menuRef}
      onContextMenu={handleContextMenu}
      onClickCapture={(e) => {
        if (Date.now() < openedAtRef.current + 350) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {selEnabled && (
        <React.Fragment>
          <MenuItem eventKey="copy" onSelect={onMenuSelect}>
            {_("cmenu_copy")}
            <span className="DropdownMenu__Item__HotKey">
              {isMac ? "⌘C" : "Ctrl+C"}
            </span>
          </MenuItem>
          <MenuItem eventKey="copyAnsi" onSelect={onMenuSelect}>
            {_("cmenu_copyAnsi")}
          </MenuItem>
        </React.Fragment>
      )}
      {(normalEnabled || selEnabled) && (
        <MenuItem eventKey="paste" onSelect={onMenuSelect}>
          {_("cmenu_paste")}
          <span className="DropdownMenu__Item__HotKey">
            {isMac ? "⌘V" : "Shift+Insert"}
          </span>
        </MenuItem>
      )}
      {selEnabled && (
        <MenuItem eventKey="searchGoogle" onSelect={onMenuSelect}>
          {_("cmenu_searchGoogle")}{" "}
          <span>'{normalizeSelectedText(selectedText)}'</span>
        </MenuItem>
      )}
      {urlEnabled && (
        <React.Fragment>
          <MenuItem eventKey="openUrlNewTab" onSelect={onMenuSelect}>
            {_("cmenu_openUrlNewTab")}
          </MenuItem>
          <MenuItem eventKey="copyLinkUrl" onSelect={onMenuSelect}>
            {_("cmenu_copyLinkUrl")}
          </MenuItem>
        </React.Fragment>
      )}
      {(selEnabled || pluginItems.some((item) => item.showWhenClicked)) && pluginItems.some((item) => (selEnabled && item.showWhenSelected) || (!selEnabled && item.showWhenClicked)) && (
        <React.Fragment>
          {pluginItems.filter((item) => (selEnabled && item.showWhenSelected) || (!selEnabled && item.showWhenClicked)).map((item) => (
            <MenuItem
              key={item.id}
              disabled={item.enabled === false}
              onClick={item.onClick}
              className={cx({
                "DropdownMenu__Item--checked": item.checked,
                "DropdownMenu__Item--disabled": item.enabled === false,
              })}
            >
              {typeof item.label === "function" ? item.label() : item.label}
            </MenuItem>
          ))}
        </React.Fragment>
      )}
      <MenuItem divider />
      {normalEnabled && (
        <React.Fragment>
          <MenuItem eventKey="selectAll" onSelect={onMenuSelect}>
            {_("cmenu_selectAll")}
            <span className="DropdownMenu__Item__HotKey">
              {isMac ? "⌘A" : "Ctrl+A"}
            </span>
          </MenuItem>
          {pluginItems &&
            pluginItems.filter((item) => item.showInNormal).map((item) => (
              <MenuItem
                key={item.id}
                disabled={item.enabled === false}
                onClick={item.onClick}
                className={cx({
                  "DropdownMenu__Item--checked": item.checked,
                  "DropdownMenu__Item--disabled": item.enabled === false,
                })}
              >
                {typeof item.label === "function" ? item.label() : item.label}
              </MenuItem>
            ))}
          <MenuItem divider />
        </React.Fragment>
      )}
      <MenuItem onClick={onSettingsClick}>{_("cmenu_settings")}</MenuItem>
    </ul>
  );
};

export default DropdownMenu;
