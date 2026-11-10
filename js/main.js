'use strict';

// Мобильная навигация. Если JS отключен, CSS оставляет ссылки видимыми.
document.documentElement.classList.add('js');

const menuToggle = document.querySelector('.site-nav__toggle');
const primaryNav = document.getElementById('primary-navigation');

if (menuToggle && primaryNav) {
  const menuText = menuToggle.querySelector('.site-nav__toggle-text');
  const menuIcon = menuToggle.querySelector('.site-nav__icon');
  const desktopNav = window.matchMedia('(min-width: 768px)');

  function setMenuOpen(open) {
    primaryNav.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuText.textContent = open ? 'Закрыть' : 'Меню';
    menuIcon.textContent = open ? '✕' : '☰';
  }

  menuToggle.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  primaryNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header__inner')) setMenuOpen(false);
  });

  desktopNav.addEventListener('change', () => setMenuOpen(false));
}

// На мобильном фильтры сворачиваются. На широком экране открыты постоянно.
const filtersDetails = document.querySelector('.catalog-filters');
if (filtersDetails) {
  const wideFilters = window.matchMedia('(min-width: 960px)');
  const syncFilters = () => { filtersDetails.open = wideFilters.matches; };
  syncFilters();
  wideFilters.addEventListener('change', syncFilters);
}

// Нативный <dialog> удерживает фокус и поддерживает Escape без дополнительных библиотек.
const orderDialog = document.getElementById('order-dialog');
const selectedProductInput = document.getElementById('selected-product');
if (orderDialog && selectedProductInput) {
  document.querySelectorAll('.product-card__button[data-product]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedProductInput.value = button.dataset.product;
      orderDialog.showModal();
      orderDialog.querySelector('input:not([type="hidden"])')?.focus();
    });
  });

  document.getElementById('close-order-dialog')?.addEventListener('click', () => {
    orderDialog.close();
  });

  // Клик по затемнённой области, но не по самой форме, закрывает диалог.
  orderDialog.addEventListener('click', (event) => {
    if (event.target !== orderDialog) return;
    const rect = orderDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) {
      orderDialog.close();
    }
  });
}

function enhanceForm(formId, messageId, dialog = null) {
  const form = document.getElementById(formId);
  const message = document.getElementById(messageId);
  if (!form || !message) return;

  form.addEventListener('input', (event) => {
    if (event.target.willValidate && event.target.checkValidity()) {
      event.target.removeAttribute('aria-invalid');
    }
  });

  form.addEventListener('reset', () => {
    message.hidden = true;
    form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const invalidFields = Array.from(form.elements).filter((field) => field.willValidate && !field.checkValidity());
    form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));

    if (invalidFields.length) {
      invalidFields.forEach((field) => field.setAttribute('aria-invalid', 'true'));
      invalidFields[0].focus();
      invalidFields[0].reportValidity();
      return;
    }

    form.reset();
    if (dialog?.open) dialog.close();
    message.hidden = false;
    message.focus?.();
  });
}

enhanceForm('order-form', 'success-message', orderDialog);
enhanceForm('page-order-form', 'order-page-success');
enhanceForm('contact-form', 'contact-success');

// При переходе из карточки товара выбранная фигурка подставляется в форму.
const productSelect = document.getElementById('order-page-product');
if (productSelect) {
  const chosen = new URLSearchParams(window.location.search).get('product');
  if (chosen && Array.from(productSelect.options).some((option) => option.value === chosen)) {
    productSelect.value = chosen;
  }
}

// КР №1 уже показывала пример пересчёта валют. При отсутствии сети остаётся
// приблизительный курс, чтобы сетка и фильтрация не зависели от внешнего API.
const exchangeRates = { CNY: 12.5, JPY: 0.54 };

function priceInRubles(price, currency) {
  return Math.round(Number(price) * (exchangeRates[currency] || 1));
}

function displayRubles() {
  document.querySelectorAll('.product-card__price-rub').forEach((element) => {
    const source = element.closest('[data-price]') || element;
    const price = Number(source.dataset.price);
    const currency = source.dataset.currency;
    if (!price || !exchangeRates[currency]) return;
    const rubles = new Intl.NumberFormat('ru-RU').format(priceInRubles(price, currency));
    element.textContent = `≈ ${rubles} ₽`;
  });
}

const catalogFilter = document.getElementById('catalog-filter-form');

function applyCatalogFilters() {
  if (!catalogFilter) return;
  const cards = Array.from(document.querySelectorAll('.catalog-products .product-card'));
  const currentCategory = catalogFilter.elements.category.value;
  const fromValue = catalogFilter.elements['price-from'].value.trim();
  const toValue = catalogFilter.elements['price-to'].value.trim();
  const minPrice = fromValue ? Number(fromValue) : 0;
  const maxPrice = toValue ? Number(toValue) : Infinity;
  const upperInput = catalogFilter.elements['price-to'];

  upperInput.setCustomValidity(minPrice > maxPrice ? 'Максимальная цена должна быть не меньше минимальной.' : '');
  if (!catalogFilter.reportValidity()) return;

  let count = 0;
  cards.forEach((card) => {
    const rubles = priceInRubles(card.dataset.price, card.dataset.currency);
    const categoryFits = currentCategory === 'all' || card.dataset.category === currentCategory;
    const visible = categoryFits && rubles >= minPrice && rubles <= maxPrice;
    card.hidden = !visible;
    if (visible) count++;
  });

  document.getElementById('catalog-results').textContent = `Найдено товаров: ${count}`;
  document.getElementById('catalog-empty').hidden = count !== 0;
}

if (catalogFilter) {
  catalogFilter.addEventListener('submit', (event) => {
    event.preventDefault();
    applyCatalogFilters();
  });
  catalogFilter.addEventListener('reset', () => {
    catalogFilter.elements['price-to'].setCustomValidity('');
    queueMicrotask(applyCatalogFilters);
  });
}

displayRubles();

async function refreshRates() {
  // Время ожидания ограничено: приложение полностью работает и без запроса.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { signal: controller.signal });
    if (!response.ok) return;
    const json = await response.json();
    const cny = Number(json?.Valute?.CNY?.Value) / Number(json?.Valute?.CNY?.Nominal);
    const jpy = Number(json?.Valute?.JPY?.Value) / Number(json?.Valute?.JPY?.Nominal);
    if (cny > 0 && jpy > 0) {
      exchangeRates.CNY = cny;
      exchangeRates.JPY = jpy;
      displayRubles();
      applyCatalogFilters();
    }
  } catch (_) {
    // В офлайне показываем значения по резервному курсу.
  } finally {
    clearTimeout(timer);
  }
}

if (document.querySelector('[data-price]')) refreshRates();
