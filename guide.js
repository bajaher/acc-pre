/* =====================================================================
   دليل الوحدات المعرفية التخصصية — العرض والتفاعل
   يقرأ البيانات من units.js ويبنيها في شاشة مستقلة داخل المحاكي.
   ===================================================================== */
(function(){
  "use strict";
  const G  = (typeof UNIT_GUIDE      !== "undefined") ? UNIT_GUIDE      : {};
  const FD = (typeof UNIT_FOUNDATION !== "undefined") ? UNIT_FOUNDATION : null;
  const KT = (typeof KLO_TEXT        !== "undefined") ? KLO_TEXT        : {};
  const IDS = Object.keys(G);
  if(!IDS.length) return;

  const q = s => document.querySelector(s);
  const E = s => String(s==null?"":s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const SUM_W   = IDS.reduce((a,id)=>a+G[id].weight,0);          // 37
  const share   = id => G[id].weight / SUM_W;                    // الوزن داخل التخصص
  const bankOf  = id => (typeof QUESTION_BANK!=="undefined")
      ? QUESTION_BANK.filter(x=>x.part===id).length : 0;

  let openUnit = IDS[0];      // الوحدة المفتوحة حاليًا
  let openTopic = null;       // مفتاح الموضوع المفتوح "id#index"

  /* ---------- شريط توزيع الأوزان ---------- */
  function weightsBar(){
    return '<div class="gw-bar">' + IDS.map(id=>
      '<span class="gw-seg u'+id.replace(".","-")+'" style="flex:'+G[id].weight+'" '+
      'title="'+E(G[id].name+" — "+G[id].weight+"%")+'">'+Math.round(share(id)*100)+'%</span>'
    ).join("") + '</div>' +
    '<div class="gw-legend">' + IDS.map(id=>
      '<span class="gw-key"><i class="dot u'+id.replace(".","-")+'"></i>'+E(id+" "+G[id].name)+'</span>'
    ).join("") + '</div>';
  }

  /* ---------- بطاقات الوحدات ---------- */
  function unitTabs(){
    return '<div class="gu-tabs">' + IDS.map(id=>{
      const u=G[id], n=bankOf(id);
      return '<button class="gu-tab'+(id===openUnit?" active":"")+'" data-unit="'+id+'">'+
        '<b>'+E(id)+'</b><span>'+E(u.name)+'</span>'+
        '<em class="'+(n?"has":"none")+'">'+(n? n+" سؤالًا" : "لا أسئلة بعد")+'</em></button>';
    }).join("") + '</div>';
  }

  /* ---------- تفاصيل وحدة ---------- */
  function unitBody(id){
    const u = G[id];
    const totQ = u.topics.reduce((a,t)=>a+t.q,0);
    const n = bankOf(id);

    const stats =
      '<div class="gu-stats">'+
        '<div class="gs"><b>'+u.weight+'%</b><span>الوزن الرسمي</span></div>'+
        '<div class="gs"><b>'+Math.round(share(id)*100)+'%</b><span>الوزن داخل التخصص</span></div>'+
        '<div class="gs"><b>'+u.topics.length+'</b><span>موضوعًا رئيسًا</span></div>'+
        '<div class="gs"><b>'+totQ+'</b><span>سؤالًا مستهدفًا</span></div>'+
        '<div class="gs '+(n?"ok":"warn")+'"><b>'+n+'</b><span>في بنك الأسئلة</span></div>'+
      '</div>';

    const bloom =
      '<div class="gu-block"><h4>توزيع الأسئلة على المستويات المعرفية</h4>'+
      '<div class="gb-bar">'+
        '<span class="gb know"   style="flex:'+u.bloom.know   +'">معرفة وفهم '+u.bloom.know+'%</span>'+
        '<span class="gb apply"  style="flex:'+u.bloom.apply  +'">تطبيق '+u.bloom.apply+'%</span>'+
        '<span class="gb anal"   style="flex:'+u.bloom.analyze+'">تحليل وتقويم '+u.bloom.analyze+'%</span>'+
      '</div></div>';

    const clos =
      '<div class="gu-block"><h4>مخرجات تعلم الوحدة (CLOs)</h4><ol class="gu-clo">'+
      u.clos.map(c=>"<li>"+E(c)+"</li>").join("")+"</ol></div>";

    const topics =
      '<div class="gu-block"><h4>الموضوعات الرئيسة والمحتوى التفصيلي</h4><div class="gu-topics">'+
      u.topics.map((t,i)=>{
        const key = id+"#"+i, open = (openTopic===key);
        return '<div class="gt'+(open?" open":"")+'">'+
          '<button class="gt-head" data-topic="'+key+'">'+
            '<span class="gt-num">'+(i+1)+'</span>'+
            '<span class="gt-title">'+E(t.t)+'</span>'+
            '<span class="gt-tags"><em class="lvl">'+E(t.lvl)+'</em><em class="qn">'+t.q+' أسئلة</em></span>'+
            '<span class="gt-caret">'+(open?"−":"+")+'</span>'+
          '</button>'+
          '<div class="gt-body"'+(open?"":' hidden')+'><ul>'+
            t.subs.map(s=>"<li>"+E(s)+"</li>").join("")+
          "</ul></div></div>";
      }).join("")+"</div></div>";

    const kloTxt = u.klos.map(k=>{
      const txt = KT[k] ? " — "+E(KT[k]) : "";
      return '<span class="chip klo" title="'+E(KT[k]||"يُستكمل من توصيف البرنامج")+'">'+E(k)+txt+"</span>";
    }).join(" ");

    const foot =
      '<div class="gu-block gu-foot">'+
        '<div><h4>المخرجات التعلمية الرئيسة ذات الصلة (KLOs)</h4><div class="chips">'+kloTxt+'</div></div>'+
        '<div><h4>أساليب التقييم</h4><div class="chips">'+
          u.assess.map(a=>'<span class="chip assess">'+E(a)+"</span>").join(" ")+
        '</div></div>'+
      '</div>';

    const cta = n
      ? '<button class="btn btn-primary btn-block gu-cta" data-start="'+id+'">🚀 ابدأ اختبار هذه الوحدة ('+n+' سؤالًا متاحًا)</button>'
      : '<div class="gu-empty">لم تُضَف أسئلة لهذه الوحدة في بنك الأسئلة بعد — المحتوى أعلاه جاهز للمذاكرة، ويمكن للمعلم إضافة الأسئلة من لوحة المعلم.</div>';

    return '<div class="gu-head"><h3>'+E(id+" — "+u.name)+'</h3><div class="en">'+E(u.en)+'</div></div>'+
           stats + bloom + clos + topics + foot + cta;
  }

  /* ---------- بناء الشاشة ---------- */
  function render(){
    const host = q("#guide-body");
    if(!host) return;
    host.innerHTML =
      '<div class="card gu-intro">'+
        '<h2>🧭 دليل الوحدات المعرفية التخصصية</h2>'+
        '<p>خمس وحدات معرفية تمثّل تخصص المحاسبة في اختبار الجاهزية، بمجموع أوزان '+SUM_W+'% من الاختبار الكلي. '+
        'يعرض الدليل لكل وحدة مخرجات تعلمها والموضوعات الرئيسة والفرعية وأساليب تقييمها وتوزيع أسئلتها.</p>'+
        weightsBar()+
        (FD ? '<div class="gu-note"><b>'+E(FD.id+" "+FD.name)+' ('+FD.weight+'%):</b> '+E(FD.note)+'</div>' : "")+
      '</div>'+
      '<div class="card">'+ unitTabs() +'</div>'+
      '<div class="card gu-unit">'+ unitBody(openUnit) +'</div>';
  }

  /* ---------- الأحداث ---------- */
  document.addEventListener("click", function(e){
    const tab = e.target.closest(".gu-tab");
    if(tab){ openUnit = tab.dataset.unit; openTopic = null; render(); return; }

    const th = e.target.closest(".gt-head");
    if(th){ const k = th.dataset.topic; openTopic = (openTopic===k) ? null : k; render(); return; }

    const st = e.target.closest("[data-start]");
    if(st){ startUnitExam(st.dataset.start); return; }

    if(e.target.closest("#btn-guide"))      { openGuide(); return; }
    if(e.target.closest("#btn-guide-back")) { if(typeof show==="function") show("screen-dash"); return; }
  });

  function openGuide(){
    render();
    if(typeof show==="function") show("screen-guide");
    else { document.querySelectorAll("main > section").forEach(s=>s.classList.add("hidden"));
           q("#screen-guide").classList.remove("hidden"); }
  }

  /* بدء اختبار الوحدة مباشرة من الدليل */
  function startUnitExam(id){
    const m = q("#part-select");
    const modeBtn = document.querySelector('#mode-cards [data-mode="part"]');
    if(typeof show==="function") show("screen-dash");
    if(modeBtn) modeBtn.click();
    setTimeout(function(){
      if(m){ m.value = id; m.dispatchEvent(new Event("change")); }
      const b = q("#btn-start"); if(b && !b.disabled) b.click();
    }, 60);
  }

  window.openUnitGuide = openGuide;
})();
