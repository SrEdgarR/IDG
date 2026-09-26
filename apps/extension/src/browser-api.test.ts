import { afterEach, expect, it, vi } from "vitest";
import { getBrowserApi, getMenusApi, isFirefox } from "./browser-api";

afterEach(() => vi.unstubAllGlobals());

it("uses Firefox's promise API and menus namespace", () => {
  const menus = {};
  const firefox = { menus };
  vi.stubGlobal("browser", firefox);
  vi.stubGlobal("chrome", { contextMenus: {} });

  expect(getBrowserApi()).toBe(firefox);
  expect(getMenusApi()).toBe(menus);
  expect(isFirefox()).toBe(true);
});

it("uses Chromium's API and contextMenus namespace", () => {
  const contextMenus = {};
  const chromium = { contextMenus };
  vi.stubGlobal("chrome", chromium);

  expect(getBrowserApi()).toBe(chromium);
  expect(getMenusApi()).toBe(contextMenus);
  expect(isFirefox()).toBe(false);
});
