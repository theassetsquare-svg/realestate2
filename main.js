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
})();
