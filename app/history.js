const links = [...document.querySelectorAll('.chapter-nav a')];
const sections = links.map(link => document.querySelector(link.hash));
let scheduled = false;

function updateChapter() {
  scheduled = false;
  let current = -1;
  sections.forEach((section, index) => {
    if (section && section.getBoundingClientRect().top <= 130) current = index;
  });
  links.forEach((link, index) => {
    if (index === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

window.addEventListener('scroll', () => {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(updateChapter);
  }
}, {passive: true});
window.addEventListener('resize', updateChapter);
updateChapter();
