(function () {
  // Sticky nav: solid background once the page has scrolled a bit.
  var nav = document.querySelector('.mkt-nav');
  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 12) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu toggle.
  var toggle = document.querySelector('.mkt-menu-toggle');
  var panel = document.querySelector('.mkt-mobile-panel');
  if (toggle && panel) {
    toggle.addEventListener('click', function () {
      panel.classList.toggle('open');
    });
    panel.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { panel.classList.remove('open'); });
    });
  }

  // Scroll-reveal animations.
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Only one FAQ item open at a time, for a cleaner accordion feel.
  var faqItems = document.querySelectorAll('.mkt-faq-item');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (item.open) {
        faqItems.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
    });
  });
})();
