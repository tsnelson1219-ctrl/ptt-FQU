import { registerPluginPrefs } from '../js/pref.js';
import {
  EasyReading,
  EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
} from './easy_reading/index.js';
import {
  LiveUpdate,
  LiveUpdatePlugin,
} from './live_update/index.js';
import {
  MouseBrowsing,
} from './mouse_browsing/index.js';
import {
  InputHelper,
} from './input_helper/index.js';
import {
  AntiIdle,
} from './anti_idle/index.js';
import {
  AutoWrap,
  AutoWrapPlugin,
} from './auto_wrap/index.js';
import {
  MediaPreviewer,
  MediaPreviewerPlugin,
} from './media_previewer/index.js';
import {
  PacketDump,
  PacketDumpPlugin,
} from './packet_dump/index.js';
import {
  FpsMeter,
  FpsMeterPlugin,
} from './fps_meter/index.js';
import {
  TouchDebugHUD,
  TouchDebugHUDPlugin,
} from './touch_debug_hud/index.js';
import {
  LoginAssist,
  LoginAssistPlugin,
  AutoLogin,
  AutoLoginPlugin,
} from './login_assist/index.js';
import {
  PwaPrompt,
  PwaPromptPlugin,
} from './pwa_prompt/index.js';
import {
  VirtualKeyboard,
  VirtualKeyboardPlugin,
  TouchKeyboardPlugin,
  TouchUIPlugin,
} from './virtual_keyboard/index.js';
import { Blacklist } from './blacklist/index.js';
import { QuickBoards } from './quick_boards/QuickBoards.js';

export {
  EasyReading,
  EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
  LiveUpdate,
  LiveUpdatePlugin,
  MouseBrowsing,
  InputHelper,
  AntiIdle,
  AutoWrap,
  AutoWrapPlugin,
  MediaPreviewer,
  MediaPreviewerPlugin,
  PacketDump,
  PacketDumpPlugin,
  FpsMeter,
  FpsMeterPlugin,
  TouchDebugHUD,
  TouchDebugHUDPlugin,
  LoginAssist,
  LoginAssistPlugin,
  AutoLogin,
  AutoLoginPlugin,
  PwaPrompt,
  PwaPromptPlugin,
  VirtualKeyboard,
  VirtualKeyboardPlugin,
  TouchKeyboardPlugin,
  TouchUIPlugin,
  Blacklist,
  QuickBoards,
};

export { PluginBase } from './PluginBase.js';

export const PLUGIN_GROUPS = [
  {
    id: 'ui',
    titleKey: 'plugin_group_ui',
    title: 'User Interface',
    color: '#007aff',
    pluginIds: ['media_previewer', 'input_helper', 'virtual_keyboard', 'pwa_prompt'],
  },
  {
    id: 'bbs',
    titleKey: 'plugin_group_bbs',
    title: 'Taiwan BBS',
    color: '#34c759',
    pluginIds: ['quick_boards', 'blacklist', 'easy_reading', 'login_assist', 'auto_wrap', 'anti_idle', 'mouse_browsing', 'live_update'],
  },
  {
    id: 'debug',
    titleKey: 'plugin_group_debug',
    title: 'Debug & Development',
    color: '#af52de',
    pluginIds: ['fps_meter', 'touch_debug_hud', 'packet_dump'],
  },
];

export const PLUGIN_GROUP_MAP = {
  virtual_keyboard: 'ui',
  touch_keyboard: 'ui',
  media_previewer: 'ui',
  input_helper: 'ui',
  pwa_prompt: 'ui',
  login_assist: 'bbs',
  auto_login: 'bbs',
  easy_reading: 'bbs',
  anti_idle: 'bbs',
  auto_wrap: 'bbs',
  mouse_browsing: 'bbs',
  live_update: 'bbs',
  blacklist: 'bbs',
  quick_boards: 'bbs',
  fps_meter: 'debug',
  touch_debug_hud: 'debug',
  packet_dump: 'debug',
};

export function groupPlugins(plugins = []) {
  const groupsMap = new Map();
  for (const group of PLUGIN_GROUPS) {
    groupsMap.set(group.id, {
      ...group,
      plugins: [],
    });
  }

  const otherGroup = {
    id: 'other',
    titleKey: 'plugin_group_other',
    title: 'Other',
    color: '#8e8e93',
    plugins: [],
  };

  for (const plugin of plugins) {
    const pluginId = plugin.id || plugin.name;
    const groupId = plugin.group || PLUGIN_GROUP_MAP[pluginId] || 'other';
    const targetGroup = groupsMap.get(groupId) || otherGroup;
    targetGroup.plugins.push({
      ...plugin,
      group: groupId,
    });
  }

  const result = [];
  for (const group of groupsMap.values()) {
    if (group.plugins.length > 0) {
      if (group.pluginIds) {
        group.plugins.sort((a, b) => {
          const aId = a.id || a.name;
          const bId = b.id || b.name;
          const aIdx = group.pluginIds.indexOf(aId);
          const bIdx = group.pluginIds.indexOf(bId);
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          if (aIdx !== -1) return -1;
          if (bIdx !== -1) return 1;
          return 0;
        });
      }
      result.push(group);
    }
  }

  if (otherGroup.plugins.length > 0) {
    result.push(otherGroup);
  }

  return result;
}

export const BUILTIN_PLUGINS = [
  LoginAssist,
  MediaPreviewer,
  InputHelper,
  LiveUpdate,
  EasyReading,
  AntiIdle,
  AutoWrap,
  MouseBrowsing,
  FpsMeter,
  TouchDebugHUDPlugin,
  PacketDump,
  VirtualKeyboardPlugin,
  PwaPromptPlugin,
  Blacklist,
  QuickBoards,
];

registerPluginPrefs(BUILTIN_PLUGINS);

export function getAvailablePlugins(app) {
  let list = [];
  if (app && app.getPluginList) {
    const appList = app.getPluginList();
    if (appList && appList.length > 0) {
      list = appList;
    }
  }
  if (list.length === 0) {
    list = BUILTIN_PLUGINS.map((PluginClass) => {
      const meta = { ...PluginClass.getMetadata() };
      if (PluginClass.renderOptions && !meta.renderOptions) {
        meta.renderOptions = PluginClass.renderOptions;
      }
      if (PluginClass.onTogglePref && !meta.onTogglePref) {
        meta.onTogglePref = PluginClass.onTogglePref.bind(PluginClass);
      }
      return meta;
    });
  }
  return list.map((meta) => {
    const pluginId = meta.id || meta.name;
    const group = meta.group || PLUGIN_GROUP_MAP[pluginId] || 'other';
    return {
      ...meta,
      group,
    };
  });
}
