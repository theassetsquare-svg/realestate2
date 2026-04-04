/* === TheAssetSquare Sub-Site — Interactive Features === */

(function () {
  'use strict';

  /* --- Mobile Menu --- */
  const menuToggle = document.querySelector('.menu-toggle');
  const mainNav = document.querySelector('.main-nav');
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function () {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      mainNav.classList.toggle('open');
      document.body.style.overflow = mainNav.classList.contains('open') ? 'hidden' : '';
    });
    mainNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mainNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  /* --- Category Tabs --- */
  var tabs = document.querySelectorAll('.tab-bar .tab');
  var cards = document.querySelectorAll('.property-card');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');

      var cat = this.getAttribute('data-cat');
      cards.forEach(function (card) {
        if (cat === 'all' || card.getAttribute('data-cat') === cat) {
          card.classList.remove('hidden-card');
        } else {
          card.classList.add('hidden-card');
        }
      });
    });
  });

  /* --- Budget Filter --- */
  var budgetBtns = document.querySelectorAll('.budget-btn');
  budgetBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var isActive = this.classList.contains('active');
      budgetBtns.forEach(function (b) { b.classList.remove('active'); });

      if (isActive) {
        cards.forEach(function (card) { card.classList.remove('hidden-card'); });
        return;
      }

      this.classList.add('active');
      var budget = parseInt(this.getAttribute('data-budget'));

      cards.forEach(function (card) {
        var cardBudget = parseInt(card.getAttribute('data-budget'));
        if (budget === 99) {
          card.classList.toggle('hidden-card', cardBudget < 10);
        } else if (budget === 3) {
          card.classList.toggle('hidden-card', cardBudget > 3);
        } else {
          card.classList.toggle('hidden-card', cardBudget > budget || cardBudget < budget - 2);
        }
      });

      // Reset category tabs to "all"
      tabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      var allTab = document.querySelector('.tab[data-cat="all"]');
      if (allTab) {
        allTab.classList.add('active');
        allTab.setAttribute('aria-selected', 'true');
      }
    });
  });

  /* --- Compare Feature --- */
  var compareItems = [];
  var MAX_COMPARE = 3;
  var compareTray = document.getElementById('compare-tray');
  var compareCountEl = document.getElementById('compare-count');
  var compareItemsEl = document.getElementById('compare-items');
  var compareGoBtn = document.getElementById('compare-go');
  var compareClearBtn = document.getElementById('compare-clear');
  var compareModal = document.getElementById('compare-modal');
  var compareTableWrap = document.getElementById('compare-table-wrap');

  // Property data for comparison
  var propertyData = {
    'kintex-onecity': { name: '킨텍스 원시티', type: '아파트', area: '59~84㎡', units: '1,200세대', price: '5.8억~7.2억', move: '2027년', location: 'GTX-A 킨텍스역 도보 5분', highlight: '교통 최강 — GTX-A 개통 확정' },
    'changneung-a2': { name: '고양창릉 A-2블록', type: '아파트', area: '39~84㎡', units: '2,800세대', price: '3.5억~5.8억', move: '2028년', location: '창릉역(예정) 도보 8분', highlight: '3기 신도시 첫 분양 — 분양가 상한제' },
    'kintex-greenpark': { name: '킨텍스 꿈에그린', type: '오피스텔', area: '19~33㎡', units: '680실', price: '1.2억~2.8억', move: '2027년', location: '대화역 도보 3분', highlight: '수익률 4.5~5.2% — 소액 투자 최적' },
    'ilsan-techno': { name: '일산테크노밸리', type: '지식산업센터', area: '66~330㎡', units: '450호', price: '2.5억~8억', move: '2027년', location: '정발산역 도보 7분', highlight: 'IT·바이오 기업 맞춤 — 세제 혜택' },
    'daehwa-shop': { name: '대화역 프라임상가', type: '상가', area: '33~132㎡', units: '120호', price: '3억~12억', move: '2027년', location: '대화역 1번 출구 앞', highlight: '킨텍스 유동인구 직접 흡수' }
  };

  function updateCompareTray() {
    if (!compareTray) return;
    if (compareItems.length === 0) {
      compareTray.classList.add('hidden');
      return;
    }
    compareTray.classList.remove('hidden');
    compareCountEl.textContent = compareItems.length;
    compareGoBtn.disabled = compareItems.length < 2;

    compareItemsEl.innerHTML = '';
    compareItems.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'compare-chip';
      chip.innerHTML = item.name + '<button class="compare-chip-remove" data-id="' + item.id + '">&times;</button>';
      compareItemsEl.appendChild(chip);
    });

    compareItemsEl.querySelectorAll('.compare-chip-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeFromCompare(this.getAttribute('data-id'));
      });
    });
  }

  function removeFromCompare(id) {
    compareItems = compareItems.filter(function (item) { return item.id !== id; });
    var btn = document.querySelector('.btn-compare[data-id="' + id + '"]');
    if (btn) btn.classList.remove('added');
    updateCompareTray();
  }

  document.querySelectorAll('.btn-compare').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = this.getAttribute('data-id');
      var name = this.getAttribute('data-name');

      if (this.classList.contains('added')) {
        removeFromCompare(id);
        return;
      }

      if (compareItems.length >= MAX_COMPARE) {
        alert('최대 ' + MAX_COMPARE + '개까지 비교할 수 있습니다.');
        return;
      }

      compareItems.push({ id: id, name: name });
      this.classList.add('added');
      updateCompareTray();
    });
  });

  if (compareClearBtn) {
    compareClearBtn.addEventListener('click', function () {
      compareItems = [];
      document.querySelectorAll('.btn-compare.added').forEach(function (btn) {
        btn.classList.remove('added');
      });
      updateCompareTray();
    });
  }

  if (compareGoBtn) {
    compareGoBtn.addEventListener('click', function () {
      if (compareItems.length < 2) return;
      showCompareModal();
    });
  }

  function showCompareModal() {
    if (!compareModal || !compareTableWrap) return;

    var fields = [
      { key: 'type', label: '유형' },
      { key: 'area', label: '면적' },
      { key: 'units', label: '세대/실수' },
      { key: 'price', label: '분양가' },
      { key: 'move', label: '입주 시기' },
      { key: 'location', label: '교통' },
      { key: 'highlight', label: '핵심 포인트' }
    ];

    var html = '<table class="compare-table"><thead><tr><th>항목</th>';
    compareItems.forEach(function (item) {
      html += '<th>' + (propertyData[item.id] ? propertyData[item.id].name : item.name) + '</th>';
    });
    html += '</tr></thead><tbody>';

    fields.forEach(function (field) {
      html += '<tr><td><strong>' + field.label + '</strong></td>';
      compareItems.forEach(function (item) {
        var data = propertyData[item.id];
        html += '<td>' + (data ? data[field.key] : '-') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    compareTableWrap.innerHTML = html;
    compareModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  if (compareModal) {
    compareModal.querySelector('.compare-modal-close').addEventListener('click', function () {
      compareModal.classList.add('hidden');
      document.body.style.overflow = '';
    });
    compareModal.addEventListener('click', function (e) {
      if (e.target === compareModal) {
        compareModal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });
  }

  /* --- Checklists with Progress --- */
  document.querySelectorAll('.checklist-section').forEach(function (section) {
    var checkboxes = section.querySelectorAll('.check-item input[type="checkbox"]');
    var progressFill = section.querySelector('.progress-fill');
    var statusText = section.querySelector('#checklist-status') || section.querySelector('.checklist-status-text');
    var total = checkboxes.length;

    function updateProgress() {
      var checked = section.querySelectorAll('.check-item input:checked').length;
      if (progressFill) {
        progressFill.style.width = (total > 0 ? (checked / total) * 100 : 0) + '%';
      }
      if (statusText) {
        statusText.textContent = checked + ' / ' + total + ' 완료';
      }
    }

    checkboxes.forEach(function (cb) {
      cb.addEventListener('change', updateProgress);
    });
  });

  /* --- Floor Plan Tabs --- */
  document.querySelectorAll('.floorplan-section').forEach(function (section) {
    var fpTabs = section.querySelectorAll('.fp-tab');
    var fpCards = section.querySelectorAll('.fp-card');

    fpTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var fp = this.getAttribute('data-fp');
        fpTabs.forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        fpCards.forEach(function (card) {
          card.classList.toggle('active', card.getAttribute('data-fp') === fp);
        });
      });
    });

    // Swipe support for floor plan gallery
    var gallery = section.querySelector('.floorplan-gallery');
    if (gallery) {
      var startX = 0;
      var currentFpIndex = 0;
      var fpTabList = Array.from(fpTabs);

      gallery.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
      }, { passive: true });

      gallery.addEventListener('touchend', function (e) {
        var diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) < 50) return;

        if (diff > 0 && currentFpIndex < fpTabList.length - 1) {
          currentFpIndex++;
        } else if (diff < 0 && currentFpIndex > 0) {
          currentFpIndex--;
        }
        fpTabList[currentFpIndex].click();
      }, { passive: true });
    }
  });

  /* --- FAQ Accordion (already native with <details>) --- */
  /* Optional: close other items when one opens */
  document.querySelectorAll('.faq-list').forEach(function (list) {
    list.querySelectorAll('.faq-item').forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (this.open) {
          list.querySelectorAll('.faq-item').forEach(function (other) {
            if (other !== item && other.open) other.open = false;
          });
        }
      });
    });
  });

  /* --- Smooth scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
