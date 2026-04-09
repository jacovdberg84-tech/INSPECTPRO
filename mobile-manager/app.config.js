/**
 * EAS `preview` builds use a different Android applicationId so the test APK
 * installs as a separate app ("InspectPro Manager (Preview)").
 *
 * IRONLOG (live server): set at build time so the app works without typing a URL.
 *   eas.json → build.<profile>.env.IRONLOG_API_BASE = "https://your-host/api"
 *   or:       eas secret:create --name IRONLOG_API_BASE --value "https://.../api" --type string
 * Default production host: https://ironlog.ironlogafrica.com/api (see app.json extra.ironlogApiBase).
 * Local dev: .env with EXPO_PUBLIC_IRONLOG_API_BASE=http://192.168.x.x:3002/api
 */
module.exports = ({ config }) => {
  const ironlogApiBase = String(
    process.env.IRONLOG_API_BASE || process.env.EXPO_PUBLIC_IRONLOG_API_BASE || ""
  ).trim();

  const merged = {
    ...config,
    extra: {
      ...(config.extra || {}),
      ...(ironlogApiBase ? { ironlogApiBase } : {})
    }
  };

  const profile = process.env.EAS_BUILD_PROFILE || "";
  if (profile === "preview") {
    return {
      ...merged,
      name: "InspectPro Manager (Preview)",
      android: {
        ...merged.android,
        package: "com.jakes84.inspectpromanager.preview"
      }
    };
  }
  return merged;
};
