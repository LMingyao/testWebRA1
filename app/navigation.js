export function createNavigation() {
const menu = document.querySelector(".menu-toggle"),
  nav = document.querySelector("#navigation");
const workToggle = document.querySelector(".work-toggle"),
  workMenu = document.querySelector("#work-menu");
function setMenu(open) {
  menu.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
}
function setWorkMenu(open) {
  workToggle.setAttribute("aria-expanded", String(open));
  workMenu.hidden = !open;
  document.querySelector(".site-header").classList.toggle("work-is-open", open);
  if (open) document.querySelector(".site-header").style.setProperty("--work-menu-height", `${workMenu.offsetHeight}px`);
}
menu.onclick = () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  setMenu(open);
  if (!open) setWorkMenu(false);
};
workToggle.onclick = () => setWorkMenu(workMenu.hidden);
workToggle.addEventListener("keydown", event => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  const links = [...workMenu.querySelectorAll("a")];
  if (!links.length) return;
  event.preventDefault();
  setWorkMenu(true);
  (event.key === "ArrowDown" ? links[0] : links.at(-1)).focus();
});
workMenu.addEventListener("keydown", event => {
  const links = [...workMenu.querySelectorAll("a")];
  const index = links.indexOf(document.activeElement);
  if (index < 0 || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1
    : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + links.length) % links.length;
  links[next].focus();
});
document.querySelector(".work-navigation").addEventListener("focusout", event => {
  if (!event.currentTarget.contains(event.relatedTarget)) setWorkMenu(false);
});
document.querySelector(".site-header").addEventListener("focusout", event => {
  if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".work-navigation")) setWorkMenu(false);
  if (!event.target.closest(".site-header")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!workMenu.hidden) {
    setWorkMenu(false);
    workToggle.focus();
  } else if (menu.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    menu.focus();
  }
});
matchMedia("(max-width: 900px)").addEventListener("change", () => {
  setMenu(false);
  setWorkMenu(false);
});
return { setMenu, setWorkMenu, workToggle, workMenu };
}
