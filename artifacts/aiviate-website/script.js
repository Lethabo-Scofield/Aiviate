// Scroll reveal: elements with class "rv" fade up once when they enter the screen.
// Skipped for people who have "reduce motion" turned on.
if (!matchMedia('(prefers-reduced-motion:reduce)').matches && 'IntersectionObserver' in window) {
  var io = new IntersectionObserver(function(es) {
    es.forEach(function(e) {
      if (e.isIntersecting) {
        e.target.classList.add('on');
        io.unobserve(e.target)
      }
    })
  }, {
    threshold: .12
  });
  document.querySelectorAll('.rv').forEach(function(el, i) {
    if (el.tagName === 'LI') el.style.transitionDelay = (i % 4) * .12 + 's';
    io.observe(el)
  });
} else {
  document.querySelectorAll('.rv').forEach(function(el) {
    el.classList.add('on')
  })
}
 
// Highlight the nav link of the section that is currently on screen.
var navLinks = document.querySelectorAll('nav a.n');
var byId = {};
navLinks.forEach(function (l) { byId[l.getAttribute('href').slice(1)] = l; });
var spy = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (!e.isIntersecting) return;
    navLinks.forEach(function (l) { l.classList.remove('active'); });
    if (byId[e.target.id]) byId[e.target.id].classList.add('active');
  });
}, { rootMargin: '-45% 0px -50% 0px' });
Object.keys(byId).forEach(function (id) {
  var s = document.getElementById(id);
  if (s) spy.observe(s);
});
 