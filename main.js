(function(){'use strict';
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
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var t=document.querySelector(this.getAttribute('href'));
      if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'});}
    });
  });
})();
