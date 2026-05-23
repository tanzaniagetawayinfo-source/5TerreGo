/* global-actionbar.js
   5TerreGo global actionbar
   Include before </body> in every page:
   <script src="global-actionbar.js"></script>
*/

(function () {
  'use strict';

  var GLOBAL_ACTIONBAR_ID = 'ftg-global-actionbar';
  var GLOBAL_ACTIONBAR_STYLE_ID = 'ftg-global-actionbar-style';

  var GLOBAL_ACTIONBAR_TEXTS = {
    en: {
      blog: 'Read the blog',
      map: 'Explore the interactive map',
      ai: 'Talk to Captain Gull',
      contact: 'Contact us',
      privacy: 'Privacy',
      cookie: 'Cookie',
      terms: 'Terms',
      copyright: 'Copyright',
      hi: 'Hi',
      guest: 'Guest',
      login: 'Login',
      profile: 'Personal area',
      logout: 'Logout',
      search: 'Search everywhere on the site'
    },
    it: {
      blog: 'Leggi il blog',
      map: 'Esplora la mappa interattiva',
      ai: 'Parla con Captain Gull',
      contact: 'Contattaci',
      privacy: 'Privacy',
      cookie: 'Cookie',
      terms: 'Termini',
      copyright: 'Copyright',
      hi: 'Ciao',
      guest: 'Ospite',
      login: 'Login',
      profile: 'Area personale',
      logout: 'Logout',
      search: 'Cerca ovunque nel sito'
    },
    fr: {
      blog: 'Lire le blog',
      map: 'Explorer la carte interactive',
      ai: 'Parler avec Captain Gull',
      contact: 'Nous contacter',
      privacy: 'Confidentialité',
      cookie: 'Cookies',
      terms: 'Conditions',
      copyright: 'Copyright',
      hi: 'Bonjour',
      guest: 'Invité',
      login: 'Connexion',
      profile: 'Espace personnel',
      logout: 'Déconnexion',
      search: 'Rechercher partout sur le site'
    },
    de: {
      blog: 'Blog lesen',
      map: 'Interaktive Karte erkunden',
      ai: 'Mit Captain Gull sprechen',
      contact: 'Kontakt',
      privacy: 'Datenschutz',
      cookie: 'Cookies',
      terms: 'Bedingungen',
      copyright: 'Copyright',
      hi: 'Hallo',
      guest: 'Gast',
      login: 'Anmelden',
      profile: 'Persönlicher Bereich',
      logout: 'Abmelden',
      search: 'Überall auf der Website suchen'
    },
    ru: {
      blog: 'Читать блог',
      map: 'Открыть интерактивную карту',
      ai: 'Поговорить с Captain Gull',
      contact: 'Связаться',
      privacy: 'Конфиденциальность',
      cookie: 'Cookie',
      terms: 'Условия',
      copyright: 'Copyright',
      hi: 'Привет',
      guest: 'Гость',
      login: 'Войти',
      profile: 'Личный кабинет',
      logout: 'Выйти',
      search: 'Искать по всему сайту'
    },
    zh: {
      blog: '阅读博客',
      map: '探索互动地图',
      ai: '和 Captain Gull 对话',
      contact: '联系我们',
      privacy: '隐私',
      cookie: 'Cookie',
      terms: '条款',
      copyright: 'Copyright',
      hi: '你好',
      guest: '访客',
      login: '登录',
      profile: '个人中心',
      logout: '退出登录',
      search: '全站搜索'
    },
    ar: {
      blog: 'اقرأ المدونة',
      map: 'استكشف الخريطة التفاعلية',
      ai: 'تحدث مع Captain Gull',
      contact: 'تواصل معنا',
      privacy: 'الخصوصية',
      cookie: 'ملفات Cookie',
      terms: 'الشروط',
      copyright: 'Copyright',
      hi: 'مرحباً',
      guest: 'ضيف',
      login: 'تسجيل الدخول',
      profile: 'المنطقة الشخصية',
      logout: 'تسجيل الخروج',
      search: 'ابحث في الموقع كله'
    }
  };

  function getLang() {
    var lang = 'en';

    try {
      lang = localStorage.getItem('5terrego_language') || document.documentElement.lang || 'en';
    } catch (error) {
      lang = document.documentElement.lang || 'en';
    }

    lang = String(lang || 'en').toLowerCase().split('-')[0];
    return GLOBAL_ACTIONBAR_TEXTS[lang] ? lang : 'en';
  }

  function tr(key) {
    var lang = getLang();
    return (GLOBAL_ACTIONBAR_TEXTS[lang] && GLOBAL_ACTIONBAR_TEXTS[lang][key]) || GLOBAL_ACTIONBAR_TEXTS.en[key] || key;
  }

  function getUserName() {
    var user = window.FTG_CURRENT_USER || null;
    var meta;

    if (!user) return '';

    meta = user.user_metadata || {};
    return meta.username || meta.name || (user.email ? String(user.email).split('@')[0] : '');
  }

  function updateBodyAuthClass() {
    if (window.FTG_CURRENT_USER) {
      document.body.classList.add('user-logged-in');
    } else {
      document.body.classList.remove('user-logged-in');
    }
  }

  function ensureGlobalActionbarStyle() {
    var style;

    if (document.getElementById(GLOBAL_ACTIONBAR_STYLE_ID)) return;

    style = document.createElement('style');
    style.id = GLOBAL_ACTIONBAR_STYLE_ID;
    style.textContent = '\n' +
      '.ftg-global-actionbar{position:fixed;top:calc(8px + env(safe-area-inset-top));left:10px;right:10px;z-index:8000;display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:24px;background:rgba(8,14,18,.68);border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 14px 34px rgba(0,0,0,.24);backdrop-filter:blur(22px) saturate(1.22);-webkit-backdrop-filter:blur(22px) saturate(1.22);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}\n' +
      '.ftg-global-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;min-height:36px;}\n' +
      '.ftg-global-brand{justify-self:center;text-decoration:none;font-weight:950;font-size:15px;line-height:1;letter-spacing:-.06em;text-shadow:0 3px 10px rgba(0,0,0,.42);white-space:nowrap;}\n' +
      '.ftg-global-blue{color:#1e9bff}.ftg-global-orange{color:#ff8a1d}\n' +
      '.ftg-global-actions{justify-self:end;display:inline-flex;align-items:center;gap:7px;position:relative;}\n' +
      '.ftg-global-language{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;overflow:hidden;padding:3px;border-radius:999px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.16);}\n' +
      '.ftg-global-language.is-open{position:fixed;inset:0;z-index:9000;width:100vw;height:100dvh;padding:calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:center;align-content:center;flex-wrap:wrap;gap:10px;border-radius:0;border:0;background:rgba(0,0,0,.58);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow-y:auto;}\n' +
      '.ftg-global-lang{display:none;align-items:center;gap:6px;min-height:31px;padding:5px 10px 5px 5px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:900;font-family:inherit;white-space:nowrap;}\n' +
      '.ftg-global-lang.is-active{display:inline-flex;background:rgba(255,255,255,.94);color:#111;border-color:rgba(255,255,255,.72);}\n' +
      '.ftg-global-language.is-open .ftg-global-lang{display:inline-flex;min-height:42px;padding:8px 13px 8px 8px;background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.18);}\n' +
      '.ftg-global-language.is-open .ftg-global-lang.is-active{background:rgba(255,255,255,.96);color:#111;}\n' +
      '.ftg-global-lang img{width:22px;height:22px;border-radius:50%;display:block;box-shadow:0 2px 6px rgba(0,0,0,.18);}\n' +
      '.ftg-global-language:not(.is-open) .ftg-global-lang.is-active{width:30px;height:30px;min-height:30px;padding:0;justify-content:center;font-size:0;color:transparent;}\n' +
      '.ftg-global-language:not(.is-open) .ftg-global-lang.is-active img{width:24px;height:24px;}\n' +
      '.ftg-global-toggle{width:36px;height:36px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px;padding:9px;border:1px solid rgba(255,255,255,.16);border-radius:50%;background:rgba(255,255,255,.13);cursor:pointer;}\n' +
      '.ftg-global-toggle span{display:block;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.92);}\n' +
      '.ftg-global-menu{display:none;position:fixed;right:10px;top:calc(56px + env(safe-area-inset-top));z-index:8050;width:min(292px,calc(100vw - 20px));max-height:calc(100dvh - 76px - env(safe-area-inset-top));overflow-y:auto;padding:12px;border-radius:24px;background:rgba(8,14,18,.82);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 46px rgba(0,0,0,.30);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);}\n' +
      '.ftg-global-actionbar.is-open{bottom:calc(8px + env(safe-area-inset-bottom));}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-menu{display:grid;grid-template-rows:auto auto auto;gap:14px;left:21px;right:21px;top:calc(94px + env(safe-area-inset-top));bottom:calc(17px + env(safe-area-inset-bottom));width:auto;max-height:none;background:transparent;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0;}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-search{display:none;}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-toggle{position:fixed;right:19px;top:calc(34px + env(safe-area-inset-top));z-index:8060;transform:translateY(-50%);}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-toggle span{position:absolute;left:50%;top:50%;width:17px;height:3px;border-radius:999px;}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-toggle span:nth-child(1){transform:translate(-50%,-50%) rotate(45deg);}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-toggle span:nth-child(4){transform:translate(-50%,-50%) rotate(-45deg);}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-toggle span:nth-child(2),.ftg-global-actionbar.is-open .ftg-global-toggle span:nth-child(3){opacity:0;}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-brand{position:fixed;left:50%;top:calc(34px + env(safe-area-inset-top));transform:translate(-50%,-50%);z-index:8055;}\n' +
      '.ftg-global-actionbar.is-open .ftg-global-language{position:fixed;left:24px;top:calc(34px + env(safe-area-inset-top));z-index:8062;transform:translateY(-50%);}\n' +
      '.ftg-global-head{text-align:center;}\n' +
      '.ftg-global-kicker{margin-bottom:4px;font-size:11px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.46);}\n' +
      '.ftg-global-username{color:#fff;font-size:31px;line-height:1.08;letter-spacing:-.07em;font-weight:950;}\n' +
      '.ftg-global-auth{display:flex;justify-content:center;gap:8px;padding-top:8px;}\n' +
      '.ftg-global-auth a,.ftg-global-auth button{flex:1 1 0;height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.92);color:#111;font-size:12px;font-weight:950;text-decoration:none;font-family:inherit;cursor:pointer;}\n' +
      '.ftg-global-auth .ftg-global-logout{background:rgba(255,59,48,.96);color:#fff;border-color:rgba(255,59,48,.72);}\n' +
      'body:not(.user-logged-in) .ftg-user-only{display:none!important;}body.user-logged-in .ftg-guest-only{display:none!important;}\n' +
      '.ftg-global-main{display:flex;flex-direction:column;gap:9px;}\n' +
      '.ftg-global-pill{width:100%;min-height:46px;display:flex;align-items:center;justify-content:center;padding:12px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.13);color:#fff;text-decoration:none;font-size:14px;font-weight:950;letter-spacing:-.025em;font-family:inherit;cursor:pointer;}\n' +
      '.ftg-global-pill:first-child{background:rgba(255,255,255,.94);color:#111;border-color:rgba(255,255,255,.58);}.ftg-global-pill:nth-child(2){background:rgba(255,138,29,.96);color:#111;border-color:rgba(255,138,29,.56);}\n' +
      '.ftg-global-legal{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:7px;color:rgba(255,255,255,.38);font-size:12px;font-weight:850;}\n' +
      '.ftg-global-legal a{color:rgba(255,255,255,.58);text-decoration:underline;text-underline-offset:3px;}\n' +
      '.ftg-global-search{position:relative;}.ftg-global-search input{width:100%;min-height:40px;padding:9px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.13);outline:none;background:rgba(255,255,255,.12);color:#fff;font-size:14.5px;font-weight:650;}\n' +
      '@media (max-width:380px){.ftg-global-actionbar{left:8px;right:8px;padding:7px;border-radius:22px}.ftg-global-brand{font-size:12.5px}.ftg-global-username{font-size:27px}}\n';

    document.head.appendChild(style);
  }

  function buildGlobalActionbarHTML() {
    return '' +
      '<div class="ftg-global-row">' +
        '<span aria-hidden="true"></span>' +
        '<a class="ftg-global-brand" href="index.html" aria-label="5TerreGo home"><span class="ftg-global-blue">5Terre</span><span class="ftg-global-orange">Go</span><span class="ftg-global-blue">.com</span></a>' +
        '<div class="ftg-global-actions">' +
          '<div class="ftg-global-language" aria-label="Choose language">' +
            '<button class="ftg-global-lang" type="button" data-lang="en"><img src="https://hatscripts.github.io/circle-flags/flags/gb.svg" alt="">English</button>' +
            '<button class="ftg-global-lang" type="button" data-lang="it"><img src="https://hatscripts.github.io/circle-flags/flags/it.svg" alt="">Italiano</button>' +
            '<button class="ftg-global-lang" type="button" data-lang="fr"><img src="https://hatscripts.github.io/circle-flags/flags/fr.svg" alt="">Français</button>' +
            '<button class="ftg-global-lang" type="button" data-lang="de"><img src="https://hatscripts.github.io/circle-flags/flags/de.svg" alt="">Deutsch</button>' +
            '<button class="ftg-global-lang" type="button" data-lang="ru"><img src="https://hatscripts.github.io/circle-flags/flags/ru.svg" alt="">Русский</button>' +
            '<button class="ftg-global-lang" type="button" data-lang="zh"><img src="https://hatscripts.github.io/circle-flags/flags/cn.svg" alt="">中文</button>' +
            '<button class="ftg-global-lang" type="button" data-lang="ar"><img src="https://hatscripts.github.io/circle-flags/flags/sa.svg" alt="">العربية</button>' +
          '</div>' +
          '<button class="ftg-global-toggle" type="button" aria-label="Open quick menu" aria-expanded="false"><span></span><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div>' +
      '<div class="ftg-global-search"><input id="ftg-global-search-input" autocomplete="off"></div>' +
      '<div class="ftg-global-menu" aria-label="Quick menu">' +
        '<div class="ftg-global-head">' +
          '<div class="ftg-global-kicker"></div>' +
          '<div class="ftg-global-username"></div>' +
          '<div class="ftg-global-auth">' +
            '<a class="ftg-global-login ftg-guest-only" href="login.html"></a>' +
            '<a class="ftg-global-profile ftg-user-only" href="profile.html"></a>' +
            '<button class="ftg-global-logout ftg-user-only" type="button"></button>' +
          '</div>' +
        '</div>' +
        '<nav class="ftg-global-main" aria-label="Main menu">' +
          '<a class="ftg-global-pill" href="blog.html"></a>' +
          '<button class="ftg-global-pill" type="button" data-ftg-global-action="map"></button>' +
          '<button class="ftg-global-pill" type="button" data-ftg-global-action="ai"></button>' +
          '<a class="ftg-global-pill" href="mailto:5terrego.info@gmail.com?subject=Contatto%205TerreGo"></a>' +
        '</nav>' +
        '<div class="ftg-global-legal" aria-label="Legal links">' +
          '<a href="privacy.html"></a><span>·</span>' +
          '<a href="cookie.html"></a><span>·</span>' +
          '<a href="terms.html"></a><span>·</span>' +
          '<a href="copyright.html"></a>' +
        '</div>' +
      '</div>';
  }

  function applyGlobalActionbarCopy(root) {
    var userName = getUserName();
    var menuPills;
    var legalLinks;

    if (!root) return;

    updateBodyAuthClass();

    root.querySelectorAll('.ftg-global-lang').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-lang') === getLang());
    });

    menuPills = root.querySelectorAll('.ftg-global-pill');
    legalLinks = root.querySelectorAll('.ftg-global-legal a');

    if (root.querySelector('.ftg-global-kicker')) root.querySelector('.ftg-global-kicker').textContent = tr('hi');
    if (root.querySelector('.ftg-global-username')) root.querySelector('.ftg-global-username').textContent = userName || tr('guest');
    if (root.querySelector('.ftg-global-login')) root.querySelector('.ftg-global-login').textContent = tr('login');
    if (root.querySelector('.ftg-global-profile')) root.querySelector('.ftg-global-profile').textContent = tr('profile');
    if (root.querySelector('.ftg-global-logout')) root.querySelector('.ftg-global-logout').textContent = tr('logout');
    if (root.querySelector('#ftg-global-search-input')) root.querySelector('#ftg-global-search-input').setAttribute('placeholder', tr('search'));

    if (menuPills[0]) menuPills[0].textContent = tr('blog');
    if (menuPills[1]) menuPills[1].textContent = tr('map');
    if (menuPills[2]) menuPills[2].textContent = tr('ai');
    if (menuPills[3]) menuPills[3].textContent = tr('contact');

    if (legalLinks[0]) legalLinks[0].textContent = tr('privacy');
    if (legalLinks[1]) legalLinks[1].textContent = tr('cookie');
    if (legalLinks[2]) legalLinks[2].textContent = tr('terms');
    if (legalLinks[3]) legalLinks[3].textContent = tr('copyright');
  }

  function closeGlobalActionbar(bar) {
    var toggle;
    var langMenu;

    if (!bar) return;

    toggle = bar.querySelector('.ftg-global-toggle');
    langMenu = bar.querySelector('.ftg-global-language');

    bar.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (langMenu) langMenu.classList.remove('is-open');
  }

  function openMapFromAnyPage() {
    if (typeof window.FTG_OPEN_MAP_FOCUS === 'function') {
      window.FTG_OPEN_MAP_FOCUS();
      return;
    }

    if (window.map && typeof window.map.setZoom === 'function' && typeof window.map.getZoom === 'function') {
      try {
        window.map.setZoom(Math.max(window.map.getZoom() + 0.35, 11));
        return;
      } catch (error) {}
    }

    window.location.href = 'index.html#map';
  }

  function openCaptainGullFromAnyPage() {
    var aiBtn;

    if (typeof window.openCaptainGullForPOI === 'function' && window.currentFiveTerrePOI) {
      window.openCaptainGullForPOI(window.currentFiveTerrePOI);
      return;
    }

    if (typeof window.openCaptainGull === 'function') {
      window.openCaptainGull();
      return;
    }

    if (typeof window.FTG_OPEN_CAPTAIN_GULL === 'function') {
      window.FTG_OPEN_CAPTAIN_GULL();
      return;
    }

    aiBtn = document.getElementById('ai-chat-btn') || document.querySelector('[data-ai-chat-btn]') || document.querySelector('.ai-chat-btn');
    if (aiBtn) {
      aiBtn.click();
      return;
    }

    window.location.href = 'index.html#captain-gull';
  }

  function wireGlobalActionbar(bar) {
    var toggle;
    var langMenu;
    var searchInput;
    var logoutBtn;

    if (!bar || bar.getAttribute('data-ftg-global-wired') === 'true') return;
    bar.setAttribute('data-ftg-global-wired', 'true');

    toggle = bar.querySelector('.ftg-global-toggle');
    langMenu = bar.querySelector('.ftg-global-language');
    searchInput = bar.querySelector('#ftg-global-search-input');
    logoutBtn = bar.querySelector('.ftg-global-logout');

    if (toggle) {
      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        bar.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', bar.classList.contains('is-open') ? 'true' : 'false');
        if (!bar.classList.contains('is-open') && langMenu) langMenu.classList.remove('is-open');
      });
    }

    if (langMenu) {
      langMenu.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-lang]') : null;

        event.preventDefault();
        event.stopPropagation();

        if (!btn) {
          langMenu.classList.toggle('is-open');
          return;
        }

        if (btn.classList.contains('is-active') && !langMenu.classList.contains('is-open')) {
          langMenu.classList.add('is-open');
          return;
        }

        try {
          localStorage.setItem('5terrego_language', btn.getAttribute('data-lang') || 'en');
        } catch (error) {}

        document.documentElement.lang = getLang();
        document.documentElement.dir = getLang() === 'ar' ? 'rtl' : 'ltr';

        if (window.FTG_I18N && typeof window.FTG_I18N.setLanguage === 'function') {
          window.FTG_I18N.setLanguage(getLang(), { source: 'global-actionbar' });
        }

        applyGlobalActionbarCopy(bar);
        langMenu.classList.remove('is-open');
      });
    }

    bar.addEventListener('click', function (event) {
      var action = event.target && event.target.closest ? event.target.closest('[data-ftg-global-action]') : null;

      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      closeGlobalActionbar(bar);

      if (action.getAttribute('data-ftg-global-action') === 'map') {
        openMapFromAnyPage();
      }

      if (action.getAttribute('data-ftg-global-action') === 'ai') {
        openCaptainGullFromAnyPage();
      }
    });

    if (searchInput) {
      searchInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        if (!searchInput.value.trim()) return;

        window.location.href = 'index.html?search=' + encodeURIComponent(searchInput.value.trim());
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (window.fiveTerreSupabaseClient && window.fiveTerreSupabaseClient.auth) {
          try {
            await window.fiveTerreSupabaseClient.auth.signOut();
          } catch (error) {}
        }

        window.FTG_CURRENT_USER = null;
        document.body.classList.remove('user-logged-in');
        applyGlobalActionbarCopy(bar);
        closeGlobalActionbar(bar);
      });
    }

    document.addEventListener('click', function (event) {
      if (bar.contains(event.target)) return;
      closeGlobalActionbar(bar);
    });
  }

  function adoptExistingHomeActionbar() {
    var existingTopBar = document.querySelector('.top-bar');

    if (!existingTopBar) return null;

    existingTopBar.setAttribute('data-ftg-global-actionbar-source', 'home-actionbar');
    return existingTopBar;
  }

  function mountGlobalActionbar() {
    var existingHomeActionbar;
    var existingGlobal;
    var bar;

    existingHomeActionbar = adoptExistingHomeActionbar();
    if (existingHomeActionbar) {
      return existingHomeActionbar;
    }

    existingGlobal = document.getElementById(GLOBAL_ACTIONBAR_ID);
    if (existingGlobal) {
      applyGlobalActionbarCopy(existingGlobal);
      wireGlobalActionbar(existingGlobal);
      return existingGlobal;
    }

    ensureGlobalActionbarStyle();

    bar = document.createElement('div');
    bar.id = GLOBAL_ACTIONBAR_ID;
    bar.className = 'ftg-global-actionbar';
    bar.innerHTML = buildGlobalActionbarHTML();

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('ftg-has-global-actionbar');

    applyGlobalActionbarCopy(bar);
    wireGlobalActionbar(bar);

    return bar;
  }

  window.FTG_MOUNT_GLOBAL_ACTIONBAR = mountGlobalActionbar;
  window.FTG_APPLY_GLOBAL_ACTIONBAR_COPY = function () {
    applyGlobalActionbarCopy(document.getElementById(GLOBAL_ACTIONBAR_ID) || document.querySelector('.top-bar'));
  };
  window.FTG_OPEN_MAP_FOCUS_FALLBACK = openMapFromAnyPage;
  window.FTG_OPEN_CAPTAIN_GULL_FALLBACK = openCaptainGullFromAnyPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountGlobalActionbar);
  } else {
    mountGlobalActionbar();
  }

  window.addEventListener('load', function () {
    var bar = document.getElementById(GLOBAL_ACTIONBAR_ID);
    if (bar) applyGlobalActionbarCopy(bar);
  });
}());
