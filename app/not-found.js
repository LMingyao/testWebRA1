import { createNavigation } from "./navigation.js?v=20261116";
import { loadPublicContent, contentForDisplay } from "./backend.js?v=20261116";
import { applySiteChrome } from "./chrome.js?v=20261116";
import { validateContent, escapeHTML as e } from "./shared.js?v=20261116";
import { collections } from "./config.js?v=20261116";
import { categoryURL } from "./metadata.js?v=20261116";

createNavigation();
try {
  const content = contentForDisplay(validateContent(await loadPublicContent({rootRelative:true})));
  applySiteChrome(content);
  document.querySelector("#work-menu").innerHTML = collections(content).map(item =>
    `<a href="/${e(categoryURL(item.id, content))}">${e(item.label)}</a>`).join("");
} catch { /* The generated error page remains usable when content is unavailable. */ }
