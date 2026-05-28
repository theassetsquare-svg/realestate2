(function(){'use strict';
  /* Mobile Menu */
  var toggle=document.querySelector('.menu-toggle');
  var nav=document.querySelector('.main-nav');
  if(toggle&&nav){
    toggle.addEventListener('click',function(){
      var exp=this.getAttribute('aria-expanded')==='true';
      this.setAttribute('aria-expanded',!exp);
      nav.classList.toggle('open');
      document.body.style.overflow=nav.classList.contains('open')?'hidden':'';
    });
    nav.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');document.body.style.overflow='';});
    });
  }

  /* Smooth Scroll */
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var t=document.querySelector(this.getAttribute('href'));
      if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'});}
    });
  });

  /* Price Simulator */
  var simBtn=document.getElementById('sim-calc');
  if(simBtn){
    simBtn.addEventListener('click',function(){
      var price=parseFloat(document.getElementById('sim-price').value)*10000;
      var down=parseFloat(document.getElementById('sim-down').value)||20;
      var rate=parseFloat(document.getElementById('sim-rate').value)||3.5;
      var years=parseInt(document.getElementById('sim-years').value)||30;
      if(!price||price<=0){alert('분양가를 입력하세요');return;}
      var loan=price*(1-down/100);
      var monthlyRate=rate/100/12;
      var n=years*12;
      var monthly=monthlyRate>0?loan*monthlyRate*Math.pow(1+monthlyRate,n)/(Math.pow(1+monthlyRate,n)-1):loan/n;
      var totalInterest=monthly*n-loan;
      document.getElementById('sim-monthly').textContent=Math.round(monthly).toLocaleString('ko-KR');
      document.getElementById('sim-loan-amt').textContent=Math.round(loan).toLocaleString('ko-KR');
      document.getElementById('sim-total-interest').textContent=Math.round(totalInterest).toLocaleString('ko-KR');
      document.getElementById('sim-down-amt').textContent=Math.round(price*down/100).toLocaleString('ko-KR');
      document.querySelector('.sim-result').style.display='block';
    });
  }

  /* FAQ accordion: close others */
  document.querySelectorAll('.faq-list,.detail-content').forEach(function(wrap){
    wrap.querySelectorAll('.faq-item').forEach(function(item){
      item.addEventListener('toggle',function(){
        if(this.open){
          wrap.querySelectorAll('.faq-item').forEach(function(o){
            if(o!==item&&o.open)o.open=false;
          });
        }
      });
    });
  });

  var reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* A11Y: 본문 바로가기 스킵 링크 */
  var main=document.querySelector('main');
  if(main){
    if(!main.id)main.id='main-content';
    var skip=document.createElement('a');
    skip.href='#'+main.id;skip.className='skip-link';skip.textContent='본문 바로가기';
    document.body.insertBefore(skip,document.body.firstChild);
  }

  /* 상단 스크롤 진행바 */
  var bar=document.createElement('div');bar.className='scroll-progress';document.body.appendChild(bar);
  /* 백투탑 버튼 */
  var toTop=document.createElement('button');toTop.className='to-top';toTop.setAttribute('aria-label','맨 위로');toTop.innerHTML='↑';document.body.appendChild(toTop);
  toTop.addEventListener('click',function(){window.scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});});
  var ticking=false;
  function onScroll(){
    var h=document.documentElement;
    var scrolled=h.scrollTop/((h.scrollHeight-h.clientHeight)||1);
    bar.style.width=(scrolled*100)+'%';
    toTop.classList.toggle('show',h.scrollTop>400);
    ticking=false;
  }
  window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(onScroll);ticking=true;}},{passive:true});

  /* 현재 페이지 내비 활성화 */
  var path=location.pathname.replace(/index\.html$/,'')||'/';
  document.querySelectorAll('.main-nav a').forEach(function(a){
    var href=a.getAttribute('href');
    if(href===path||(href!=='/'&&path.indexOf(href)===0)){a.setAttribute('aria-current','page');a.style.color='#2563eb';}
  });

  /* 스크롤 리빌 (점진적 향상 — JS 없으면 항상 보임) */
  if('IntersectionObserver' in window && !reduceMotion){
    var targets=document.querySelectorAll('.cat-link,.card-link,.detail-content>h2,.detail-content>h3,.detail-content>p,.detail-content>ul,.simulator,.comparison,.timeline,.neighborhood,.expert-quote,.alert-cta,.faq-list,.detail-cta-box');
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
    },{threshold:.12,rootMargin:'0px 0px -40px 0px'});
    targets.forEach(function(el,i){el.classList.add('reveal');el.style.transitionDelay=Math.min(i%6*40,200)+'ms';io.observe(el);});
  }
})();
