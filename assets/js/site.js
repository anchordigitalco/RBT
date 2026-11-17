/* Research for Better Teaching. Shared behavior: nav, mobile menu, scroll reveals.
   Built from src/js by tools/build.py. Everything here is an enhancement:
   the page is complete without it. */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  window.RBT_READY = true;

  /* ---------------------------------------------------------- dropdowns */
  var primary = doc.querySelector('.primary');
  var openTrigger = null;

  function closeDropdown(returnFocus) {
    if (!openTrigger) return;
    var panel = doc.getElementById(openTrigger.getAttribute('aria-controls'));
    openTrigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.classList.remove('is-open');
    if (returnFocus) openTrigger.focus();
    openTrigger = null;
  }

  function openDropdown(btn) {
    if (openTrigger && openTrigger !== btn) closeDropdown(false);
    var panel = doc.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', 'true');
    if (panel) panel.classList.add('is-open');
    openTrigger = btn;
  }

  if (primary) {
    // Links work without JS. With JS, the ones that own a panel become buttons.
    primary.querySelectorAll('a[data-dropdown]').forEach(function (a) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = a.className;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', a.getAttribute('data-dropdown'));
      btn.innerHTML = '<span>' + a.textContent + '</span><span class="primary__plus" aria-hidden="true"></span>';
      a.parentNode.replaceChild(btn, a);
      btn.addEventListener('click', function () {
        if (btn.getAttribute('aria-expanded') === 'true') closeDropdown(false);
        else openDropdown(btn);
      });
    });

    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && openTrigger) closeDropdown(true);
    });
    doc.addEventListener('click', function (ev) {
      if (openTrigger && !primary.contains(ev.target)) closeDropdown(false);
    });
    primary.addEventListener('focusout', function () {
      setTimeout(function () {
        if (openTrigger && !primary.contains(doc.activeElement)) closeDropdown(false);
      }, 0);
    });
  }

  /* ---------------------------------------------------------- mobile menu */
  var menuTriggers = doc.querySelectorAll('.menu-btn[aria-controls="mnav"]');
  // the homepage has no top header; its triggers are the hero's button and the header bar's
  var menuBtn = doc.querySelector('.site-header__top .menu-btn') || menuTriggers[0];
  var mnav = doc.getElementById('mnav');

  function focusables(el) {
    return Array.prototype.filter.call(
      el.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"])'),
      function (n) { return n.offsetParent !== null; }
    );
  }
  function closeMenu() {
    if (!mnav || mnav.hidden) return;
    mnav.hidden = true;
    root.classList.remove('menu-open');
    menuTriggers.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    (lastTrigger || menuBtn).focus();
  }
  var lastTrigger = null;
  function openMenu(ev) {
    lastTrigger = ev && ev.currentTarget ? ev.currentTarget : menuBtn;
    mnav.hidden = false;
    root.classList.add('menu-open');
    lastTrigger.setAttribute('aria-expanded', 'true');
    var f = focusables(mnav);
    if (f.length) f[0].focus();
  }

  if (menuBtn && mnav) {
    menuTriggers.forEach(function (b) { b.addEventListener('click', openMenu); });
    mnav.querySelector('[data-menu-close]').addEventListener('click', closeMenu);
    mnav.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closeMenu(); return; }
      if (ev.key !== 'Tab') return;
      var f = focusables(mnav);
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    mnav.querySelectorAll('.mnav__toggle').forEach(function (t) {
      t.addEventListener('click', function () {
        var sub = doc.getElementById(t.getAttribute('aria-controls'));
        var open = t.getAttribute('aria-expanded') === 'true';
        t.setAttribute('aria-expanded', String(!open));
        sub.hidden = open;
      });
    });
    // Following an in-page link from the menu should close it.
    mnav.addEventListener('click', function (ev) {
      var a = ev.target.closest('a[href*="#"]');
      if (a && a.pathname === location.pathname) closeMenu();
    });
    window.matchMedia('(min-width: 1000px)').addEventListener('change', function (mq) {
      if (mq.matches) closeMenu();
    });
  }

  /* ---------------------------------------------------------- header bar */
  // Appears once the visitor is past the first screen (on the homepage, past the tree takeover).
  var bar = doc.querySelector('[data-header-bar]');
  if (bar) {
    var header = doc.querySelector('.site-header');
    var limit = 0;
    var measure = function () {
      var stage = doc.querySelector('.takeover');
      limit = stage ? stage.offsetTop + stage.offsetHeight - window.innerHeight * 0.6 : header.offsetTop + header.offsetHeight;
      root.style.setProperty('--header-h', header.offsetHeight + 'px');
    };
    var ticking = false;
    var update = function () {
      ticking = false;
      var show = window.scrollY > limit;
      if (show !== bar.classList.contains('is-visible')) bar.classList.toggle('is-visible', show);
    };
    measure();
    update();
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', function () { measure(); update(); });
    window.addEventListener('load', function () { measure(); update(); });
  }

  /* ---------------------------------------------------------- scroll reveals */
  if (root.classList.contains('motion-ok')) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px 70% 0px', threshold: 0 }); // start before it scrolls into view, so nothing reads as empty
    doc.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  }
})();

/* Video library filter. Without JS every video shows and the filter bar stays hidden. */
(function () {
  'use strict';
  var bar = document.querySelector('[data-vfilter]');
  var grid = document.querySelector('[data-vgrid]');
  if (!bar || !grid) return;

  var buttons = Array.prototype.slice.call(bar.querySelectorAll('[data-filter]'));
  var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-tags]'));
  var count = bar.querySelector('[data-vcount]');

  function apply(filter) {
    var shown = 0;
    cards.forEach(function (card) {
      var tags = card.getAttribute('data-tags').split(' ');
      var match = filter === 'all' || tags.indexOf(filter) !== -1;
      card.hidden = !match;
      if (match) shown += 1;
    });
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === filter));
    });
    count.textContent = 'Showing ' + shown + ' of ' + cards.length;
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { apply(b.getAttribute('data-filter')); });
  });
  bar.hidden = false;
  apply('all');
})();
