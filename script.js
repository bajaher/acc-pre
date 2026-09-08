/* =====================================================================
   محاكي الاختبار — المنطق الرئيسي
   يعتمد على: config.js (الإعدادات) و questions.js (بنك الأسئلة)
   ===================================================================== */
"use strict";

/* ---------------- أدوات عامة ---------------- */
const $ = (sel) => document.querySelector(sel);
const LETTERS = ["أ","ب","ج","د","هـ","و"];

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function normalizeAns(s){
  return String(s).trim().toLowerCase()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[،,%٪\s]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي");
}
function fmtTime(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
const TYPE_NAMES = {mcq:"اختيار من متعدد", tf:"صح / خطأ", fill:"أكمل الفراغ", match:"مطابقة", calc:"مسألة حسابية"};

/* ---------------- أجزاء الاختبار (الوحدات المعرفية) ---------------- */
/* تهيئة: حفظ الوزن المعياري الأصلي وتفعيل كل الأجزاء افتراضيًا */
CONFIG.parts.forEach(p=>{
  if(p.officialWeight === undefined) p.officialWeight = p.weight;  // وزن NCAAA الأصلي
  if(p.inComp === undefined) p.inComp = true;                      // مشمول في الاختبار الشامل
  // التصنيف: الوحدة السابعة (المحاسبة) تخصصية، وما دونها عامة
  if(!p.group) p.group = String(p.id).indexOf("7.") === 0 ? "major" : "general";
});
function groupLabel(g){ return (CONFIG.groups && CONFIG.groups[g]) || g; }

/* عدد الأسئلة المتاحة فعليًا لكل جزء */
function partStats(){
  const counts = {};
  QUESTION_BANK.forEach(q=>{ counts[q.part] = (counts[q.part]||0) + 1; });
  return CONFIG.parts.map(p => Object.assign({}, p, {
    available: counts[p.id] || 0,
    ready: (counts[p.id] || 0) > 0
  }));
}
function readyParts(){ return partStats().filter(p=>p.ready); }                 // متاح كاختبار جزئي
function compParts(){ return partStats().filter(p=>p.ready && p.inComp!==false); } // داخل الشامل
function partById(id){ return CONFIG.parts.find(p=>p.id===id) || null; }
function partName(id){ const p = partById(id); return p ? p.name : id; }

/* إعدادات اختبار الجزء الواحد (مع مراعاة تخصيص المعلم لكل جزء) */
function partExamCfg(id){
  const p = partById(id) || {};
  let types = (Array.isArray(p.qTypes) && p.qTypes.length) ? p.qTypes : CONFIG.allowedTypes;
  types = types.filter(t => CONFIG.allowedTypes.includes(t));   // احترام الأنواع المفعّلة عامًا
  if(!types.length) types = CONFIG.allowedTypes.slice();
  return {
    questions: p.qCount || CONFIG.modes.part.questions,
    duration:  p.qDuration || CONFIG.modes.part.duration,
    types: types
  };
}

/* عدد الأسئلة المتاحة في وحدة حسب النوع */
function partTypeCounts(id){
  const c = {};
  QUESTION_BANK.forEach(q=>{ if(q.part===id) c[q.type] = (c[q.type]||0)+1; });
  return c;
}

/* =====================================================================
   توزيع أسئلة الاختبار الشامل على الأجزاء بأوزان معايير NCAAA
   - يعتمد الوزن المعتمد لكل وحدة (أو الوزن المخصص من لوحة المعلم)
   - يعيد توحيد الأوزان على الأجزاء المتاحة فقط عند نقص بعضها
   - يُرجع تفصيلًا يوضح الوزن المستهدف والفعلي وأي عجز
   ===================================================================== */
function weightedPlan(total){
  const cp = compParts();
  if(!cp.length) return [];
  const sumW = cp.reduce((s,p)=>s+p.weight,0) || 1;

  let plan = cp.map(p=>{
    const ideal = total * p.weight / sumW;
    return {
      id: p.id, name: p.name, weight: p.weight, official: p.officialWeight,
      available: p.available, ideal: ideal,
      n: Math.min(p.available, Math.floor(ideal))
    };
  });

  // توزيع الأسئلة المتبقية على الأجزاء ذات أكبر كسر متبقٍ وبها رصيد
  let assigned = plan.reduce((s,x)=>s+x.n,0), guard = 0;
  while(assigned < total && guard++ < 2000){
    const cand = plan.filter(x=> x.n < x.available)
                     .sort((a,b)=> (b.ideal-b.n) - (a.ideal-a.n))[0];
    if(!cand) break;
    cand.n++; assigned++;
  }
  plan.forEach(x=>{
    x.actualPct = assigned? Math.round(x.n / assigned * 100) : 0;
    x.short = x.ideal - x.n > 0.999;      // عجز في رصيد الأسئلة
  });
  plan.total = assigned;
  return plan.filter(x=>x.n>0);
}

/* ملخص نصي لمطابقة التوزيع لأوزان المعيار */
function planCoverage(){
  const cp = compParts();
  const covered = cp.reduce((s,p)=>s+p.officialWeight,0);
  return { units: cp.length, totalUnits: CONFIG.parts.length, covered };
}

/* ---------------- بيانات الطالب والجلسة ---------------- */
const STUDENT_KEY = "taxExamStudent_v1";
const ADMIN_KEY_SESSION = "taxExamAdminSession_v1";
let STUDENT = null;
let ADMIN = null;
let PREVIEW = false;   // وضع معاينة المعلم للاختبار كطالب

/* دخول المعلم إلى الاختبار كطالب للمعاينة */
function enterPreview(){
  if(!ADMIN) return;
  PREVIEW = true;
  STUDENT = {
    name: "معاينة المعلم — " + (ADMIN.email||""),
    email: ADMIN.email || "—",
    sid: "—",
    subject: "وضع المعاينة",
    loginAt: new Date().toISOString()
  };
  $("#preview-bar").classList.remove("hidden");
  renderDash();
}
function exitPreview(){
  if(exam && exam.timerId) clearInterval(exam.timerId);
  exam = null; PREVIEW = false; STUDENT = null;
  $("#preview-bar").classList.add("hidden");
  if(typeof renderAdmin === "function") renderAdmin(); else show("screen-admin");
}

function loadStudent(){
  try{ return JSON.parse(sessionStorage.getItem(STUDENT_KEY)); }catch(e){ return null; }
}
function saveStudent(st){
  try{ sessionStorage.setItem(STUDENT_KEY, JSON.stringify(st)); }catch(e){}
}
function clearStudent(){
  try{ sessionStorage.removeItem(STUDENT_KEY); }catch(e){}
}
/* رمز تحقق قصير يربط النتيجة بالطالب (للتأكد من عدم التعديل اليدوي) */
function verifyCode(str){
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for(let i=0;i<str.length;i++){
    h1 = ((h1 ^ str.charCodeAt(i)) * 16777619) >>> 0;
    h2 = ((h2 + str.charCodeAt(i)*(i+7)) * 2654435761) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).toUpperCase().slice(0,10);
}

/* ---------------- التخزين المحلي ---------------- */
const STORE_KEY = "taxExamSim_v1";
function loadStore(){
  try{ return JSON.parse(localStorage.getItem(STORE_KEY)) || {attempts:[]}; }
  catch(e){ return {attempts:[]}; }
}
function saveStore(st){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(st)); }catch(e){} }

/* ---------------- حالة الاختبار ---------------- */
let exam = null;      // {questions:[...], idx, answers:[], flags:[], remaining, timerId, startedAt}
let lastResult = null;

/* =====================================================
   بناء نسخة اختبار من البنك
   mode = "part" (جزء واحد) أو "full" (شامل بأوزان المعيار)
   ===================================================== */
/* اختيار n سؤالًا من مجموعة مع توزيعها على الموضوعات الفرعية */
function pickSpread(pool, n){
  const byTopic = {};
  pool.forEach(q => { (byTopic[q.topic] = byTopic[q.topic]||[]).push(q); });
  const topics = Object.keys(byTopic);
  const chosen = [];
  let ti = 0, guard = 0;
  while(chosen.length < n && guard++ < 10000){
    const t = topics[ti % topics.length];
    if(byTopic[t] && byTopic[t].length) chosen.push(byTopic[t].shift());
    ti++;
    if(topics.every(t2 => byTopic[t2].length===0)) break;
  }
  return chosen;
}

function buildExam(mode, partId){
  mode = mode || "part";
  const cfg = mode==="full"
    ? CONFIG.modes.full
    : partExamCfg(partId);
  let base = QUESTION_BANK.filter(q => CONFIG.allowedTypes.includes(q.type));
  let chosen = [], planUsed = [];

  if(mode === "full"){
    const plan = weightedPlan(cfg.questions);
    plan.forEach(pl => {
      let pool = base.filter(q => q.part === pl.id);
      if(CONFIG.shuffleQuestions) pool = shuffle(pool);
      const got = pickSpread(pool, pl.n);
      chosen = chosen.concat(got);
      planUsed.push({ id: pl.id, n: got.length, weight: pl.weight, official: pl.official });
    });
  } else {
    // اختبار الوحدة: يلتزم بأنواع الأسئلة المحددة لهذه الوحدة
    let pool = QUESTION_BANK.filter(q => q.part === partId && cfg.types.includes(q.type));
    if(CONFIG.shuffleQuestions) pool = shuffle(pool);
    chosen = pickSpread(pool, Math.min(cfg.questions, pool.length));
    planUsed.push({ id: partId, n: chosen.length, types: cfg.types });
  }

  const questions = (CONFIG.shuffleQuestions ? shuffle(chosen) : chosen).map(instantiate);
  return {
    mode, partId, plan: planUsed,
    questions,
    idx:0,
    answers: questions.map(()=>null),
    flags: questions.map(()=>false),
    duration: cfg.duration,
    remaining: cfg.duration*60,
    startedAt: Date.now(),
    timerId:null
  };
}

/* ضمان عدم تكرار الخيارات في الأسئلة المولّدة عشوائيًا */
function dedupeBase(base){
  const correct = base.opts[base.a];
  const others = [];
  base.opts.forEach((o,i)=>{
    if(i!==base.a && o!==correct && !others.includes(o)) others.push(o);
  });
  const need = base.opts.length - 1;
  if(others.length < need){
    // نولّد بدائل رقمية مشتقة من الإجابة الصحيحة أو من أول خيار رقمي
    const numOf = (s)=>{
      const m = String(s).match(/([\d][\d,\.]*)/);
      return m ? {num: parseFloat(m[1].replace(/,/g,"")), tmpl: String(s), lit: m[1]} : null;
    };
    let seed = numOf(correct) || others.map(numOf).find(Boolean);
    if(seed && seed.num === 0){
      seed = others.map(numOf).find(x => x && x.num > 0) || seed;
    }
    const factors = [2, 0.5, 1.5, 3, 0.25, 4, 0.75, 5, 0.1];
    let fi = 0;
    while(others.length < need && fi < factors.length){
      let filler;
      if(seed){
        let v = seed.num * factors[fi];
        v = v >= 100 ? Math.round(v) : Math.round(v*100)/100;
        filler = seed.tmpl.replace(seed.lit, v.toLocaleString("en-US"));
      } else {
        filler = "لا شيء مما ذكر" + " ".repeat(fi);
      }
      if(filler !== correct && !others.includes(filler)) others.push(filler);
      fi++;
    }
  }
  return {q:base.q, opts:[correct].concat(others.slice(0,need)), a:0, expl:base.expl};
}

/* توليد نسخة قابلة للعرض من السؤال (مع خلط الخيارات وتوليد الأرقام) */
function instantiate(q){
  const inst = {src:q, type:q.type, topic:q.topic, part:q.part, ref:q.ref||""};
  if(q.type==="mcq" || q.type==="calc"){
    let base;
    if(typeof q.gen === "function"){
      base = dedupeBase(q.gen()); // سؤال ديناميكي بأرقام عشوائية
    } else {
      base = {q:q.q, opts:q.opts, a:q.a, expl:q.expl};
    }
    inst.q = base.q; inst.expl = base.expl;
    let order = base.opts.map((_,i)=>i);
    if(CONFIG.shuffleChoices) order = shuffle(order);
    inst.opts = order.map(i=>base.opts[i]);
    inst.correct = order.indexOf(base.a);
  } else if(q.type==="tf"){
    inst.q = q.q; inst.expl = q.expl;
    inst.opts = ["صحيحة ✓","خاطئة ✗"];
    inst.correct = q.a ? 0 : 1;
  } else if(q.type==="fill"){
    inst.q = q.q; inst.expl = q.expl;
    inst.answers = q.answers;
  } else if(q.type==="match"){
    inst.q = q.q; inst.expl = q.expl;
    inst.left = q.left;
    inst.right = q.right;
    let order = q.right.map((_,i)=>i);
    if(CONFIG.shuffleChoices) order = shuffle(order);
    inst.rightShuffled = order.map(i=>q.right[i]);
    // لكل عنصر يسار: موقع الإجابة الصحيحة داخل القائمة المخلوطة
    inst.correctMap = q.right.map((r,i)=> order.indexOf(i));
  }
  return inst;
}

/* =====================================================
   الشاشات
   ===================================================== */
function show(id){
  ["screen-gate","screen-dash","screen-guide","screen-exam","screen-result","screen-review","screen-admin"].forEach(s=>{
    const el = $("#"+s); if(el) el.classList.toggle("hidden", s!==id);
  });
  $("#btn-logout").classList.toggle("hidden", id==="screen-gate");
  const pb = $("#preview-bar");
  if(pb) pb.classList.toggle("hidden", !(PREVIEW && id!=="screen-admin" && id!=="screen-gate"));
  window.scrollTo({top:0});
}

/* ---------------- شاشة الدخول والتسجيل ---------------- */
let passTries = 0, lockedUntil = 0;
let gateRole = "student";   // student | admin

function setRole(role){
  gateRole = role;
  document.querySelectorAll(".role-tab").forEach(b=>
    b.classList.toggle("active", b.dataset.role===role));
  document.querySelectorAll(".stu-only").forEach(el=>
    el.classList.toggle("hidden", role!=="student"));
  $("#g-error").classList.add("hidden");
  $("#btn-login").textContent = role==="admin"
    ? "🔓 دخول لوحة المعلم" : "🔓 تسجيل الدخول وبدء الاختبار";
  $("#g-email").placeholder = role==="admin"
    ? (CONFIG.adminEmails && CONFIG.adminEmails[0]) || "instructor@kku.edu.sa"
    : "s123456789@kku.edu.sa";
  $("#g-email-hint").textContent = role==="admin"
    ? "بريد عضو هيئة التدريس المصرح له فقط"
    : (CONFIG.emailDomain
        ? "يجب أن ينتهي البريد بـ @" + CONFIG.emailDomain + " (البريد الجامعي الرسمي فقط)"
        : "أدخل بريدك الإلكتروني الرسمي");
  $("#g-pass").value = "";
}

function renderGate(){
  $("#g-title").textContent = CONFIG.examTitle;
  $("#g-course").textContent = CONFIG.examSubtitle + " — " + CONFIG.instructor;
  $("#g-email-hint").textContent = CONFIG.emailDomain
    ? "يجب أن ينتهي البريد بـ @" + CONFIG.emailDomain + " (البريد الجامعي الرسمي فقط)"
    : "أدخل بريدك الإلكتروني الرسمي";
  // قائمة المقررات = الوحدات المعرفية في معايير المحاسبة 2025
  const ps = partStats();
  $("#g-subject").innerHTML = '<option value="">— اختر المقرر / الوحدة المعرفية —</option>' +
    ps.map(p=>'<option value="'+esc(p.id+" — "+p.name)+'"'+(p.ready?"":" disabled")+">"+
      esc(p.id+" — "+p.name+(p.ready?"":" (قريبًا)"))+"</option>").join("");
  $("#g-sid-wrap").classList.toggle("hidden", !CONFIG.askStudentId);
  show("screen-gate");
}

function gateError(msg, focusId){
  const el = $("#g-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  if(focusId){
    const f = $("#"+focusId);
    f.classList.add("invalid");
    f.focus();
  }
}

function attemptLogin(){
  ["g-name","g-email","g-sid","g-subject","g-pass"].forEach(id=>{
    const el = $("#"+id); if(el) el.classList.remove("invalid");
  });
  $("#g-error").classList.add("hidden");

  if(Date.now() < lockedUntil){
    const left = Math.ceil((lockedUntil-Date.now())/1000);
    gateError("تم إيقاف المحاولات مؤقتًا. حاول بعد "+left+" ثانية.");
    return;
  }

  const name = $("#g-name").value.trim().replace(/\s+/g," ");
  const email = $("#g-email").value.trim().toLowerCase();
  const sid = $("#g-sid").value.trim();
  const subject = $("#g-subject").value;
  const pass = $("#g-pass").value.trim();

  /* ===== مسار دخول المعلم (المسؤول) ===== */
  if(gateRole === "admin"){
    const allowed = (CONFIG.adminEmails||[]).map(x=>String(x).toLowerCase());
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){
      gateError("صيغة البريد الإلكتروني غير صحيحة.", "g-email"); return;
    }
    if(allowed.length && !allowed.includes(email)){
      gateError("هذا البريد غير مصرح له بالدخول كمعلم.", "g-email"); return;
    }
    if(pass !== String(CONFIG.adminPassword)){
      passTries++;
      const remain = (CONFIG.maxPasswordTries||5) - passTries;
      if(remain <= 0){
        lockedUntil = Date.now() + (CONFIG.lockSeconds||60)*1000; passTries = 0;
        gateError("تم تجاوز عدد المحاولات. الرجاء الانتظار "+(CONFIG.lockSeconds||60)+" ثانية.", "g-pass");
      } else {
        gateError("كلمة مرور المعلم غير صحيحة. المحاولات المتبقية: "+remain, "g-pass");
      }
      $("#g-pass").value = ""; return;
    }
    STUDENT = null; clearStudent();
    passTries = 0;
    ADMIN = { email, loginAt:new Date().toISOString() };
    try{ sessionStorage.setItem(ADMIN_KEY_SESSION, JSON.stringify(ADMIN)); }catch(e){}
    if(typeof renderAdmin === "function") renderAdmin();
    else show("screen-admin");
    return;
  }

  // الاسم: كلمتان على الأقل
  if(name.length < 5 || name.split(" ").length < 2){
    gateError("يرجى كتابة الاسم الثلاثي كاملًا (كلمتان على الأقل).", "g-name"); return;
  }
  // البريد: صيغة صحيحة + نطاق الجامعة
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){
    gateError("صيغة البريد الإلكتروني غير صحيحة.", "g-email"); return;
  }
  if(CONFIG.emailDomain && !email.endsWith("@"+CONFIG.emailDomain.toLowerCase())){
    gateError("يجب استخدام البريد الجامعي الرسمي المنتهي بـ @"+CONFIG.emailDomain, "g-email"); return;
  }
  // الرقم الجامعي
  if(CONFIG.askStudentId && !/^[0-9]{6,12}$/.test(sid)){
    gateError("يرجى إدخال الرقم الجامعي (أرقام فقط، من 6 إلى 12 خانة).", "g-sid"); return;
  }
  // المقرر
  if(!subject){ gateError("يرجى اختيار المقرر.", "g-subject"); return; }
  // كلمة المرور
  if(pass.toUpperCase() !== String(CONFIG.examPassword).toUpperCase()){
    passTries++;
    const remain = (CONFIG.maxPasswordTries||5) - passTries;
    if(remain <= 0){
      lockedUntil = Date.now() + (CONFIG.lockSeconds||60)*1000;
      passTries = 0;
      gateError("تم تجاوز عدد المحاولات المسموح بها. الرجاء الانتظار "+(CONFIG.lockSeconds||60)+" ثانية.", "g-pass");
    } else {
      gateError("كلمة المرور غير صحيحة. المحاولات المتبقية: "+remain, "g-pass");
    }
    $("#g-pass").value = "";
    return;
  }

  STUDENT = {
    name, email, sid, subject,
    loginAt: new Date().toISOString()
  };
  saveStudent(STUDENT);
  passTries = 0;
  renderDash();
}

function studentHtml(extra){
  if(!STUDENT) return "";
  const rows = [
    ["الطالب", STUDENT.name],
    ["البريد الجامعي", STUDENT.email],
    STUDENT.sid ? ["الرقم الجامعي", STUDENT.sid] : null,
    ["المقرر", STUDENT.subject]
  ].filter(Boolean).concat(extra||[]);
  return rows.map(r=>'<div class="si"><b>'+esc(r[0])+':</b><span>'+esc(r[1])+"</span></div>").join("");
}

/* ---------------- لوحة البداية ---------------- */
/* اختيار نمط الاختبار والجزء */
let selMode = "part";
let selPart = null;

function renderPicker(){
  const ps = partStats();
  const rp = ps.filter(p=>p.ready);
  if(!selPart || !rp.some(p=>p.id===selPart)) selPart = rp.length? rp[0].id : null;

  // بطاقتا نمط الاختبار
  const fullEnabled = rp.length >= 2;
  $("#mode-cards").innerHTML = [
    { id:"part", title:"📗 اختبار جزء واحد",
      desc: CONFIG.modes.part.questions+" سؤالًا • "+CONFIG.modes.part.duration+" دقيقة — تدرّب على وحدة معرفية واحدة",
      on:true },
    { id:"full", title:"🎯 اختبار الجاهزية الشامل",
      desc: CONFIG.modes.full.questions+" سؤالًا • "+CONFIG.modes.full.duration+" دقيقة — موزّعة على الأجزاء بأوزان المعيار"
            + (fullEnabled? "" : " (يتطلب جاهزية جزأين على الأقل)"),
      on: fullEnabled }
  ].map(m=>
    '<div class="mode-card'+(selMode===m.id?" active":"")+(m.on?"":" disabled")+'" data-mode="'+m.id+'">'+
    '<div class="mc-title">'+m.title+"</div><div class=\"mc-desc\">"+esc(m.desc)+"</div></div>"
  ).join("");

  // قائمة الوحدات مقسّمة إلى عامة وتخصصية (بدون إظهار الأوزان للطالب)
  $("#part-select-wrap").classList.toggle("hidden", selMode!=="part");
  $("#part-select").innerHTML = ["general","major"].map(g=>{
    const items = ps.filter(p=>p.group===g);
    if(!items.length) return "";
    return '<optgroup label="'+esc(groupLabel(g))+'">' + items.map(p=>
      '<option value="'+p.id+'"'+(p.ready?"":" disabled")+(selPart===p.id?" selected":"")+'>'+
      esc(p.id+" — "+p.name+(p.ready? " • "+p.available+" سؤالًا" : " • قريبًا"))+"</option>").join("") +
      "</optgroup>";
  }).join("");

  // مخطط توزيع الاختبار الشامل (يظهر عند اختيار النمط الشامل)
  const bpWrap = $("#blueprint-card");
  if(selMode==="full" && fullEnabled){
    const plan = weightedPlan(CONFIG.modes.full.questions);
    const cov = planCoverage();
    bpWrap.classList.remove("hidden");
    const planById = {}; plan.forEach(x=> planById[x.id] = x);
    let rows = "";
    ["general","major"].forEach(g=>{
      const items = plan.filter(x=> (partById(x.id)||{}).group === g);
      if(!items.length) return;
      rows += '<tr class="grp"><td colspan="2">'+esc(groupLabel(g))+"</td></tr>" +
        items.map(x=>'<tr><td>'+esc(x.id+" — "+x.name)+"</td><td>"+x.n+" سؤالًا</td></tr>").join("");
    });
    $("#blueprint").innerHTML =
      '<table class="cov"><thead><tr><th>الوحدة المعرفية</th><th>عدد الأسئلة</th></tr></thead><tbody>'+
      rows + '<tr><td><b>الإجمالي</b></td><td><b>'+plan.reduce((s,x)=>s+x.n,0)+
      ' سؤالًا</b></td></tr></tbody></table>';
    $("#blueprint-note").textContent = cov.units < cov.totalUnits
      ? "يشمل هذا الاختبار " + cov.units + " وحدة معرفية من أصل " + cov.totalUnits +
        "، وتُضاف بقية الوحدات تباعًا."
      : "يشمل هذا الاختبار جميع الوحدات المعرفية (" + cov.totalUnits + " وحدة).";
  } else if(bpWrap){
    bpWrap.classList.add("hidden");
  }

  // خريطة الوحدات المعرفية (مقسّمة، وبدون أوزان في واجهة الطالب)
  let covRows = "";
  ["general","major"].forEach(g=>{
    const items = ps.filter(p=>p.group===g);
    if(!items.length) return;
    covRows += '<tr class="grp"><td colspan="3">'+esc(groupLabel(g))+" ("+items.length+" وحدات)</td></tr>" +
      items.map(p=>'<tr class="'+(p.ready?"":"muted")+'"><td>'+esc(p.id+" — "+p.name)+
        "</td><td>"+(p.available||"—")+"</td><td>"+
        (p.ready?'<span class="pill ok">جاهز</span>':'<span class="pill">قريبًا</span>')+"</td></tr>").join("");
  });
  $("#coverage").innerHTML =
    '<table class="cov"><thead><tr><th>الوحدة المعرفية</th><th>الأسئلة</th><th>الحالة</th></tr></thead><tbody>' +
    covRows + "</tbody></table>";

  const gReady = ps.filter(p=>p.group==="general" && p.ready).length;
  const mReady = ps.filter(p=>p.group==="major" && p.ready).length;
  const gAll = ps.filter(p=>p.group==="general").length;
  const mAll = ps.filter(p=>p.group==="major").length;
  $("#cov-note").textContent = rp.length
    ? "الجاهز الآن: " + gReady + " من " + gAll + " وحدات عامة، و" + mReady + " من " + mAll + " وحدات تخصص."
    : "لا توجد أسئلة في البنك بعد.";

  const pcfg = selPart ? partExamCfg(selPart)
                       : {questions:CONFIG.modes.part.questions, duration:CONFIG.modes.part.duration, types:CONFIG.allowedTypes};
  // عدد الأسئلة المتاحة في الوحدة ضمن الأنواع المسموحة لها
  const avail = selPart ? QUESTION_BANK.filter(q=>q.part===selPart && pcfg.types.includes(q.type)).length : 0;
  const qn = selMode==="full" ? CONFIG.modes.full.questions : Math.min(pcfg.questions, avail);

  // عرض أنواع الأسئلة في الوحدة المختارة
  const tw = $("#part-types");
  if(tw){
    if(selMode==="part" && selPart){
      tw.innerHTML = pcfg.types.filter(t=>QUESTION_BANK.some(q=>q.part===selPart && q.type===t))
        .map(t=>'<span class="chip type">'+esc(TYPE_NAMES[t]||t)+"</span>").join(" ");
    } else { tw.innerHTML = ""; }
  }
  $("#d-qn").textContent = qn || "—";
  $("#d-dur").textContent = (selMode==="full"? CONFIG.modes.full.duration : pcfg.duration) + " دقيقة";
  $("#btn-start").disabled = !rp.length || (selMode==="part" && !selPart);
}

function renderDash(){
  $("#d-student").innerHTML = studentHtml();
  $("#d-course").textContent = CONFIG.examTitle;
  $("#d-instructor").textContent = CONFIG.examSubtitle + " — " + CONFIG.instructor;
  $("#d-chapter").textContent = CONFIG.standardRef;
  $("#d-bank").textContent = QUESTION_BANK.length;
  $("#d-pass").textContent = CONFIG.passingGrade + "%";
  renderPicker();

  const st = loadStore();
  const el = $("#d-progress");
  if(st.attempts.length){
    const best = Math.max(...st.attempts.map(a=>a.pct));
    const avg = Math.round(st.attempts.reduce((s,a)=>s+a.pct,0)/st.attempts.length);
    const totalMin = Math.round(st.attempts.reduce((s,a)=>s+a.usedSec,0)/60);
    el.innerHTML = "المحاولات السابقة: <b>"+st.attempts.length+"</b> • أعلى درجة: <b>"+best+"%</b> • المتوسط: <b>"+avg+"%</b> • إجمالي وقت التدريب: <b>"+totalMin+" دقيقة</b>";
    $("#btn-clear").classList.remove("hidden");
  } else {
    el.textContent = "لا توجد محاولات سابقة — ابدأ أول اختبار لك الآن!";
    $("#btn-clear").classList.add("hidden");
  }
  show("screen-dash");
}

/* ---------------- شاشة الاختبار ---------------- */
function startExam(){
  exam = buildExam(selMode, selPart);
  if(!exam.questions.length){
    alert("لا توجد أسئلة متاحة لهذا الاختيار.");
    return;
  }
  $("#exam-scope").textContent = exam.mode==="full"
    ? "اختبار الجاهزية الشامل — " + exam.plan.map(x=>partName(x.id)+" ("+x.n+")").join(" • ")
    : "الجزء: " + exam.partId + " — " + partName(exam.partId);
  $("#palette").innerHTML = exam.questions.map((_,i)=>
    '<button class="pal" data-i="'+i+'">'+(i+1)+"</button>").join("");
  startTimer();
  renderQuestion();
  show("screen-exam");
}

function startTimer(){
  updateTimer();
  exam.timerId = setInterval(()=>{
    exam.remaining--;
    updateTimer();
    if(exam.remaining<=0){
      clearInterval(exam.timerId);
      submitExam(true);
    }
  },1000);
}
function updateTimer(){
  const t = $("#timer");
  t.textContent = fmtTime(Math.max(0,exam.remaining));
  t.classList.toggle("low", exam.remaining<=300);
}

function renderQuestion(){
  const i = exam.idx, q = exam.questions[i], ans = exam.answers[i];
  $("#qcount").textContent = "السؤال "+(i+1)+" من "+exam.questions.length;
  $("#pbar").style.width = (exam.answers.filter(a=>a!==null).length / exam.questions.length * 100)+"%";
  $("#qmeta").innerHTML =
    '<span class="chip type">'+TYPE_NAMES[q.type]+'</span>'+
    (exam.mode==="full" ? '<span class="chip part">'+esc(partName(q.part))+'</span>' : '')+
    '<span class="chip">'+esc(CONFIG.topics[q.topic]||"")+'</span>';
  $("#qtext").textContent = q.q;

  const box = $("#qbody");
  if(q.type==="fill"){
    box.innerHTML = '<input class="fillin" id="fillin" type="text" inputmode="text" placeholder="اكتب إجابتك هنا..." value="'+(ans!==null?esc(ans):"")+'">';
    $("#fillin").addEventListener("input", e=>{
      exam.answers[i] = e.target.value.trim()===""? null : e.target.value.trim();
      refreshPalette();
    });
  } else if(q.type==="match"){
    box.innerHTML = q.left.map((l,li)=>{
      const sel = ans && ans[li]!==undefined && ans[li]!==null ? ans[li] : -1;
      return '<div class="match-row"><div class="mleft">'+esc(l)+'</div>'+
        '<select data-li="'+li+'"><option value="-1">— اختر —</option>'+
        q.rightShuffled.map((r,ri)=>'<option value="'+ri+'"'+(sel===ri?" selected":"")+'>'+esc(r)+"</option>").join("")+
        "</select></div>";
    }).join("");
    box.querySelectorAll("select").forEach(sel=>{
      sel.addEventListener("change", ()=>{
        const cur = exam.answers[i] || q.left.map(()=>null);
        const v = parseInt(sel.value,10);
        cur[parseInt(sel.dataset.li,10)] = v<0? null : v;
        exam.answers[i] = cur.every(x=>x===null)? null : cur;
        refreshPalette();
      });
    });
  } else {
    box.innerHTML = '<div class="opts">'+q.opts.map((o,oi)=>
      '<div class="opt'+(ans===oi?" selected":"")+'" data-oi="'+oi+'">'+
      '<span class="letter">'+LETTERS[oi]+"</span><span>"+esc(o)+"</span></div>").join("")+"</div>";
    box.querySelectorAll(".opt").forEach(el=>{
      el.addEventListener("click", ()=>{
        exam.answers[i] = parseInt(el.dataset.oi,10);
        renderQuestion(); refreshPalette();
      });
    });
  }

  $("#btn-prev").disabled = i===0;
  $("#btn-next").textContent = i===exam.questions.length-1 ? "إنهاء ➜" : "التالي ⬅";
  const bf = $("#btn-flag");
  bf.classList.toggle("flagged", exam.flags[i]);
  bf.textContent = exam.flags[i] ? "★ معلَّم" : "☆ للمراجعة";
  refreshPalette();
}

function refreshPalette(){
  document.querySelectorAll(".pal").forEach((b,bi)=>{
    b.className = "pal"
      + (exam.answers[bi]!==null ? " answered":"")
      + (exam.flags[bi] ? " flagged":"")
      + (bi===exam.idx ? " current":"");
  });
  $("#pbar").style.width = (exam.answers.filter(a=>a!==null).length / exam.questions.length * 100)+"%";
}

function go(delta){
  const ni = exam.idx + delta;
  if(ni < 0) return;
  if(ni >= exam.questions.length){ confirmSubmit(); return; }
  exam.idx = ni; renderQuestion();
}

/* ---------------- التصحيح ---------------- */
function gradeOne(q, ans){
  if(ans===null || ans===undefined) return {status:"skip", pts:0};
  if(q.type==="fill"){
    const ok = q.answers.some(a => normalizeAns(a)===normalizeAns(ans));
    return {status: ok?"ok":"bad", pts: ok?1:0};
  }
  if(q.type==="match"){
    let c=0;
    q.correctMap.forEach((m,li)=>{ if(ans[li]===m) c++; });
    const all = c===q.correctMap.length;
    if(ans.every(x=>x===null)) return {status:"skip", pts:0};
    return {status: all?"ok": (c>0?"partial":"bad"), pts: c/q.correctMap.length};
  }
  const ok = ans === q.correct;
  return {status: ok?"ok":"bad", pts: ok?1:0};
}

function submitExam(auto){
  clearInterval(exam.timerId);
  const usedSec = CONFIG.examDuration*60 - Math.max(0,exam.remaining);
  let pts=0, correct=0, wrong=0, skipped=0;
  const topicAgg = {}, partAgg = {};
  const detail = exam.questions.map((q,i)=>{
    const g = gradeOne(q, exam.answers[i]);
    pts += g.pts;
    if(g.status==="skip") skipped++;
    else if(g.pts===1) correct++;
    else wrong++;
    const t = topicAgg[q.topic] = topicAgg[q.topic]||{got:0,total:0};
    t.got += g.pts; t.total += 1;
    const p = partAgg[q.part] = partAgg[q.part]||{got:0,total:0};
    p.got += g.pts; p.total += 1;
    return g;
  });
  const pct = Math.round(pts / exam.questions.length * 100);
  const submittedAt = new Date().toISOString();
  const code = verifyCode([
    STUDENT? STUDENT.email : "-", STUDENT? STUDENT.sid : "-",
    pct, correct, wrong, skipped, usedSec, submittedAt
  ].join("|"));
  lastResult = {
    pct, correct, wrong, skipped, usedSec, auto:!!auto,
    pass: pct >= CONFIG.passingGrade,
    topicAgg, partAgg, detail, submittedAt, code,
    mode: exam.mode, partId: exam.partId, duration: exam.duration,
    questions: exam.questions,
    answers: exam.answers
  };
  lastResult.preview = PREVIEW;
  if(!PREVIEW){   // لا تُحفظ محاولات المعاينة في سجل النتائج
    const st = loadStore();
    st.attempts.push({date:submittedAt, pct, usedSec, correct, wrong, skipped, code,
      mode: exam.mode, partId: exam.partId,
      student: STUDENT? {name:STUDENT.name, email:STUDENT.email, sid:STUDENT.sid, subject:STUDENT.subject} : null});
    if(st.attempts.length>100) st.attempts = st.attempts.slice(-100);
    saveStore(st);
  }
  renderResult();
  show("screen-result");
}

function renderResult(){
  const r = lastResult;
  $("#r-student").innerHTML = studentHtml([
    ["تاريخ التسليم", new Date(r.submittedAt).toLocaleString("ar-SA")],
    ["رمز التحقق", r.code]
  ]);
  const ring = $("#score-ring");
  ring.style.background = "conic-gradient("+(r.pass?"var(--ok)":"var(--bad)")+" "+(r.pct*3.6)+"deg, var(--border) 0deg)";
  $("#score-inner").innerHTML =
    '<div class="pct">'+r.pct+'%</div><div class="verdict">'+(r.pass?"ناجح ✓":"راسب ✗")+"</div>";
  $("#score-inner").parentElement.style.color = "var(--text)";
  $("#r-auto").classList.toggle("hidden", !r.auto);
  $("#r-correct").textContent = r.correct;
  $("#r-wrong").textContent = r.wrong;
  $("#r-skip").textContent = r.skipped;
  $("#r-time").textContent = fmtTime(r.usedSec);

  // الأداء حسب أجزاء المعيار
  const pk = Object.keys(r.partAgg);
  $("#part-perf-card").classList.toggle("hidden", pk.length<2);
  $("#part-perf").innerHTML = ["general","major"].map(g=>{
    const ids = pk.filter(id => (partById(id)||{}).group === g);
    if(!ids.length) return "";
    return '<div class="grp-head">'+esc(groupLabel(g))+"</div>" + ids.map(id=>{
      const a = r.partAgg[id], p = partById(id);
      const pc = Math.round(a.got/a.total*100);
      return '<div class="topicbar"><div class="tname"><span>'+esc(id+" — "+(p?p.name:id))+
        '</span><span>'+pc+'% — '+a.total+' سؤال</span></div><div class="tbar"><div style="width:'+pc+'%;background:'+
        (pc>=CONFIG.passingGrade?"var(--ok)":"var(--bad)")+'"></div></div></div>';
    }).join("");
  }).join("");

  $("#topic-perf").innerHTML = Object.keys(r.topicAgg).map(t=>{
    const a = r.topicAgg[t];
    const p = Math.round(a.got/a.total*100);
    return '<div class="topicbar"><div class="tname"><span>'+esc(CONFIG.topics[t]||t)+
      '</span><span>'+p+'%</span></div><div class="tbar"><div style="width:'+p+'%;background:'+
      (p>=CONFIG.passingGrade?"var(--ok)":"var(--bad)")+'"></div></div></div>';
  }).join("");
}

/* ---------------- تصدير بطاقة النتيجة ---------------- */
function exportResult(){
  const r = lastResult;
  if(!r) return;
  const s = STUDENT || {name:"-", email:"-", sid:"-", subject:"-"};
  const topics = Object.keys(r.topicAgg).map(t=>{
    const a = r.topicAgg[t];
    return (CONFIG.topics[t]||t) + ": " + Math.round(a.got/a.total*100) + "%";
  }).join(" | ");
  const partsTxt = Object.keys(r.partAgg).map(id=>{
    const a = r.partAgg[id], p = partById(id);
    return id + " " + (p?p.name:"") + ": " + Math.round(a.got/a.total*100) + "% (" + a.total + " سؤال)";
  }).join(" | ");

  const rows = [
    ["عنوان الاختبار", CONFIG.examTitle],
    ["الجهة", CONFIG.examSubtitle],
    ["المرجع المعياري", CONFIG.standardRef],
    ["نمط الاختبار", r.mode==="full" ? "اختبار الجاهزية الشامل" : "اختبار جزء واحد — " + r.partId + " " + partName(r.partId)],
    ["المقرر", s.subject],
    ["أستاذ المقرر", CONFIG.instructor],
    ["اسم الطالب", s.name],
    ["البريد الجامعي", s.email],
    ["الرقم الجامعي", s.sid || "-"],
    ["تاريخ التسليم", new Date(r.submittedAt).toLocaleString("ar-SA")],
    ["عدد الأسئلة", r.questions.length],
    ["إجابات صحيحة", r.correct],
    ["إجابات خاطئة", r.wrong],
    ["أسئلة متروكة", r.skipped],
    ["النسبة المئوية", r.pct + "%"],
    ["درجة النجاح المطلوبة", CONFIG.passingGrade + "%"],
    ["النتيجة", r.pass ? "ناجح" : "راسب"],
    ["الوقت المستغرق", fmtTime(r.usedSec)],
    ["التسليم التلقائي (انتهاء الوقت)", r.auto ? "نعم" : "لا"],
    ["الأداء حسب أجزاء المعيار", partsTxt],
    ["الأداء حسب الموضوعات", topics],
    ["رمز التحقق", r.code]
  ];

  // ملف CSV بترميز UTF-8 مع BOM ليفتح صحيحًا في Excel العربي
  const csv = "﻿" + rows.map(x=>'"'+String(x[0]).replace(/"/g,'""')+'","'+String(x[1]).replace(/"/g,'""')+'"').join("\r\n");
  const safe = (s.sid || s.name || "student").toString().replace(/[^\w؀-ۿ-]/g,"_");
  const fname = "نتيجة_" + safe + "_" + r.pct + "%.csv";
  try{
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
    alert("تم تنزيل بطاقة النتيجة باسم:\n" + fname + "\n\nأرسل الملف إلى أستاذ المقرر عبر البريد الجامعي.\nيمكنك أيضًا حفظ الصفحة كـ PDF من خيار الطباعة.");
  }catch(e){
    // بديل: عرض البطاقة للنسخ اليدوي في حال منع المتصفح التنزيل
    window.prompt("انسخ بطاقة النتيجة وأرسلها لأستاذ المقرر:", rows.map(x=>x[0]+": "+x[1]).join(" | "));
  }
}

/* ---------------- المراجعة ---------------- */
function renderReview(){
  const r = lastResult;
  $("#review-list").innerHTML = r.questions.map((q,i)=>{
    const g = r.detail[i], ans = r.answers[i];
    const badge = g.status==="ok" ? '<span class="badge ok">إجابة صحيحة</span>'
                : g.status==="skip" ? '<span class="badge skip">لم تتم الإجابة</span>'
                : g.status==="partial" ? '<span class="badge skip">إجابة جزئية</span>'
                : '<span class="badge bad">إجابة خاطئة</span>';
    let body="";
    if(q.type==="fill"){
      body = '<div class="opts">'+
        '<div class="opt '+(g.status==="ok"?"correct":"wrong")+'"><span>إجابتك: '+(ans!==null?esc(ans):"—")+"</span></div>"+
        '<div class="opt correct"><span>الإجابة الصحيحة: '+esc(q.answers[0])+"</span></div></div>";
    } else if(q.type==="match"){
      body = q.left.map((l,li)=>{
        const sel = ans && ans[li]!==null && ans[li]!==undefined ? ans[li] : null;
        const okm = sel===q.correctMap[li];
        return '<div class="match-row"><div class="mleft">'+esc(l)+'</div>'+
          '<div class="opt '+(okm?"correct":"wrong")+'" style="flex:1"><span>'+
          (sel!==null? esc(q.rightShuffled[sel]) : "—")+
          (okm? "" : ' <b style="color:var(--ok)">(الصحيح: '+esc(q.rightShuffled[q.correctMap[li]])+")</b>")+
          "</span></div></div>";
      }).join("");
    } else {
      body = '<div class="opts">'+q.opts.map((o,oi)=>{
        let cls="opt";
        if(oi===q.correct) cls+=" correct";
        else if(oi===ans) cls+=" wrong";
        return '<div class="'+cls+'"><span class="letter">'+LETTERS[oi]+"</span><span>"+esc(o)+"</span></div>";
      }).join("")+"</div>";
    }
    return '<div class="card review-item">'+
      '<div class="qmeta"><span class="chip">س'+(i+1)+'</span><span class="chip type">'+TYPE_NAMES[q.type]+'</span>'+badge+'</div>'+
      '<div class="qtext">'+esc(q.q)+"</div>"+body+
      '<div class="explain"><b>الشرح:</b> '+esc(q.expl)+
      '<div class="refline">📖 المرجع: '+esc(q.ref)+" — "+esc(CONFIG.topics[q.topic]||"")+"</div></div></div>";
  }).join("");
  show("screen-review");
}

/* ---------------- التأكيد والمودالات ---------------- */
function confirmSubmit(){
  const un = exam.answers.filter(a=>a===null).length;
  $("#m-text").textContent = un>0
    ? "لديك "+un+" سؤالًا بدون إجابة. هل تريد إنهاء الاختبار وتسليمه؟"
    : "هل أنت متأكد من إنهاء الاختبار وتسليمه؟";
  $("#modal").classList.remove("hidden");
}

/* ---------------- الوضع الليلي ---------------- */
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  $("#btn-theme").textContent = t==="dark" ? "☀️" : "🌙";
  try{ localStorage.setItem("taxExamTheme", t); }catch(e){}
}

/* ---------------- الربط ---------------- */
document.addEventListener("DOMContentLoaded", ()=>{
  // تطبيق تعديلات المعلم المحفوظة (إن وجدت) قبل بناء أي شاشة
  if(typeof applyAdminOverrides === "function"){ try{ applyAdminOverrides(); }catch(e){} }

  let savedTheme = null;
  try{ savedTheme = localStorage.getItem("taxExamTheme"); }catch(e){}
  const prefersDark = typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

  // عنوان الاختبار من ملف الإعدادات
  document.title = CONFIG.examTitle + " | " + CONFIG.examSubtitle;
  $("#app-brand").childNodes[0].nodeValue = CONFIG.examTitle + " ";
  $("#app-brand-sub").textContent = CONFIG.examSubtitle + " — " + CONFIG.instructor;

  // بوابة الدخول: تُعرض ما لم تكن هناك جلسة قائمة أو كان التسجيل معطّلًا
  STUDENT = loadStudent();
  try{ ADMIN = JSON.parse(sessionStorage.getItem(ADMIN_KEY_SESSION)); }catch(e){ ADMIN = null; }
  if(ADMIN && typeof renderAdmin === "function"){ renderAdmin(); }
  else if(CONFIG.requireRegistration && !STUDENT){ renderGate(); }
  else { renderDash(); }

  $("#gate-form").addEventListener("submit", e=>{ e.preventDefault(); attemptLogin(); });
  $("#role-tabs").addEventListener("click", e=>{
    const b = e.target.closest(".role-tab");
    if(b) setRole(b.dataset.role);
  });
  $("#btn-logout").addEventListener("click", ()=>{
    const inExam = exam && exam.timerId && !$("#screen-exam").classList.contains("hidden");
    if(inExam && !confirm("أنت داخل الاختبار حاليًا. الخروج سيلغي المحاولة دون تسليم. هل تريد المتابعة؟")) return;
    if(exam && exam.timerId) clearInterval(exam.timerId);
    exam = null;
    clearStudent(); STUDENT = null; ADMIN = null;
    try{ sessionStorage.removeItem(ADMIN_KEY_SESSION); }catch(e){}
    ["g-name","g-email","g-sid","g-pass"].forEach(id=>{ const el=$("#"+id); if(el) el.value=""; });
    setRole("student");
    renderGate();
  });
  $("#btn-export").addEventListener("click", exportResult);
  $("#btn-preview-exam").addEventListener("click", enterPreview);
  $("#btn-exit-preview").addEventListener("click", ()=>{
    if(exam && exam.timerId && !$("#screen-exam").classList.contains("hidden")
       && !confirm("إنهاء المعاينة والعودة للوحة المعلم؟")) return;
    exitPreview();
  });

  // اختيار نمط الاختبار والجزء
  $("#mode-cards").addEventListener("click", e=>{
    const c = e.target.closest(".mode-card");
    if(!c || c.classList.contains("disabled")) return;
    selMode = c.dataset.mode;
    renderPicker();
  });
  $("#part-select").addEventListener("change", e=>{ selPart = e.target.value; renderPicker(); });

  $("#btn-theme").addEventListener("click", ()=>{
    applyTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark");
  });
  $("#btn-start").addEventListener("click", startExam);
  $("#btn-clear").addEventListener("click", ()=>{
    if(confirm("هل تريد مسح سجل المحاولات السابقة؟")){ saveStore({attempts:[]}); renderDash(); }
  });
  $("#btn-prev").addEventListener("click", ()=>go(-1));
  $("#btn-next").addEventListener("click", ()=>go(1));
  $("#btn-skip").addEventListener("click", ()=>{ if(exam.idx<exam.questions.length-1) go(1); else confirmSubmit(); });
  $("#btn-flag").addEventListener("click", ()=>{
    exam.flags[exam.idx] = !exam.flags[exam.idx]; renderQuestion();
  });
  $("#btn-submit").addEventListener("click", confirmSubmit);
  $("#m-cancel").addEventListener("click", ()=> $("#modal").classList.add("hidden"));
  $("#m-ok").addEventListener("click", ()=>{ $("#modal").classList.add("hidden"); submitExam(false); });
  $("#palette").addEventListener("click", e=>{
    const b = e.target.closest(".pal");
    if(b){ exam.idx = parseInt(b.dataset.i,10); renderQuestion(); }
  });
  $("#btn-review").addEventListener("click", renderReview);
  $("#btn-retry").addEventListener("click", startExam);
  $("#btn-home").addEventListener("click", renderDash);
  $("#btn-back-result").addEventListener("click", ()=>show("screen-result"));

  // تحذير عند محاولة مغادرة الصفحة أثناء الاختبار
  window.addEventListener("beforeunload", (e)=>{
    if(exam && exam.timerId && !$("#screen-exam").classList.contains("hidden")){
      e.preventDefault(); e.returnValue = "";
    }
  });
});
