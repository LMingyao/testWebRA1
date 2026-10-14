import { createNavigation } from "./navigation.js";
import { loadPublicContent, contentForDisplay } from "./backend.js";
import { applySiteChrome } from "./chrome.js";
import { validateContent, escapeHTML as e } from "./shared.js";
import { collections } from "./config.js";
import { categoryURL } from "./metadata.js";

createNavigation();
try {
  const content = contentForDisplay(validateContent(await loadPublicContent({rootRelative:true})));
  applySiteChrome(content);
  document.querySelector("#work-menu").innerHTML = collections(content).map(item =>
    `<a href="/${e(categoryURL(item.id, content))}">${e(item.label)}</a>`).join("");
} catch { /* The generated error page remains usable when content is unavailable. */ }
