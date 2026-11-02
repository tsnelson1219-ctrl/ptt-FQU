import '../conv/uao.js';
import { App } from './app';
import { setupI18n } from './i18n';
import { getQueryVariable } from './util';
import { readValuesWithDefault } from './pref';

async function startApp() {
  if (typeof window !== 'undefined' && (window.name === 'site_auth_target_frame' || window.name === 'ptt_auth_target_frame')) {
    return;
  }
  setupI18n();

  // connect params
  const allowOverride = process.env.ALLOW_OVERRIDE_FROM_QUERY;
  const siteUrl = (allowOverride && getQueryVariable('site'))
    || process.env.SITE_URL;
  const siteType = (allowOverride && (getQueryVariable('type') || getQueryVariable('site_type') || getQueryVariable('profile')))
    || process.env.SITE_TYPE
    || 'auto';

  const app = new App({ siteType, siteUrl });
  window.app = app;

  console.log("load pref from storage");
  app.showTermWindow();
  app.onValuesPrefChange(app.prefValues || readValuesWithDefault());

  // connect.
  app.connect(siteUrl, siteType);
  app.setInputAreaFocus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
