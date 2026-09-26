type ExtensionApi = typeof chrome & { menus?: typeof chrome.contextMenus };

function extensionGlobals(): typeof globalThis & { browser?: ExtensionApi } {
  return globalThis as typeof globalThis & { browser?: ExtensionApi };
}

export function getBrowserApi(): ExtensionApi {
  const globals = extensionGlobals();
  return globals.browser ?? chrome;
}

export function getMenusApi(): typeof chrome.contextMenus {
  const api = getBrowserApi();
  return api.menus ?? api.contextMenus;
}

export function isFirefox(): boolean {
  return typeof extensionGlobals().browser !== "undefined";
}
