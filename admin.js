/* =====================================================================
   لوحة المعلم (المسؤول)
   - تعديل إعدادات الاختبار
   - إضافة/تعديل/حذف الأسئلة
   - عرض وتصدير نتائج الطلاب (مع الرقم الجامعي)
   - معاينة بنك الأسئلة
   التعديلات تُحفظ في متصفح المعلم، ولجعلها دائمة لجميع الطلاب
   تُصدَّر ملفات config.js / questions.js وتُستبدل في المستودع.
   ===================================================================== */
"use strict";

const ADMIN_STORE = "taxExamAdminData_v1";
const ROSTER_STORE = "taxExamRoster_v1";

function loadAdminData(){
  try{
    const d = JSON.parse(localStorage.getItem(ADMIN_STORE));
    return d && typeof d==="object" ? d : {settings:{}, added:[], edited:{}, deleted:[]};
  }catch(e){ return {settings:{}, added:[], edited:{}, deleted:[]}; }
}
function saveAdminData(d){ try{ localStorage.setItem(ADMIN_STORE, JSON.stringify(d)); }catch(e){} }
let ADATA = loadAdminData();

/* ---------- تطبيق تعديلات المعلم على الإعدادات وبنك الأسئلة ---------- */
function applyAdminOverrides(){
  ADATA = loadAdminData();
  const s = ADATA.settings || {};
  if(s.modes){
    CONFIG.modes.part = Object.assign({}, CONFIG.modes.part, s.modes.part||{});
    CONFIG.modes.full = Object.assign({}, CONFIG.modes.full, s.modes.full||{});
  }
  ["passingGrade","emailDomain","examPassword","adminPassword","shuffleQuestions",
   "shuffleChoices","askStudentId","requireRegistration"].forEach(k=>{
    if(s[k] !== undefined) CONFIG[k] = s[k];
  });
  if(Array.isArray(s.allowedTypes) && s.allowedTypes.length) CONFIG.allowedTypes = s.allowedTypes;

  // تخصيص الأوزان وإعدادات كل وحدة معرفية
  const po = s.partOverrides || {};
  CONFIG.parts.forEach(p=>{
    if(p.officialWeight === undefined) p.officialWeight = p.weight;
    const o = po[p.id] || {};
    p.weight   = (typeof o.weight === "number" && o.weight >= 0) ? o.weight : p.officialWeight;
    p.inComp   = o.inComp === false ? false : true;
    p.qCount   = o.questions || null;
    p.qDuration= o.duration || null;
  });

  // حذف
  if(ADATA.deleted && ADATA.deleted.length){
    const del = new Set(ADATA.deleted.map(String));
    for(let i=QUESTION_BANK.length-1;i>=0;i--){
      if(del.has(String(QUESTION_BANK[i].id))) QUESTION_BANK.splice(i,1);
    }
  }
  // تعديل
  if(ADATA.edited){
    QUESTION_BANK.forEach((q,i)=>{
      const e = ADATA.edited[String(q.id)];
      if(e) QUESTION_BANK[i] = Object.assign({}, q, e);
    });
  }
  // إضافة
  (ADATA.added||[]).forEach(q=>{
    if(!QUESTION_BANK.some(x=>String(x.id)===String(q.id))) QUESTION_BANK.push(q);
  });
}

/* ---------- أدوات ---------- */
function note(el, msg, kind){
  const n = $("#"+el);
  n.className = "adm-note" + (kind? " "+kind : "");
  n.textContent = msg;
  if(kind) setTimeout(()=>{ n.className="adm-note"; n.textContent=""; }, 6000);
}
function download(filename, text, mime){
  try{
    const blob = new Blob([text], {type:(mime||"text/plain")+";charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
    return true;
  }catch(e){ return false; }
}

/* =====================================================================
   الشاشة الرئيسة للوحة
   ===================================================================== */
function renderAdmin(){
  $("#adm-who").textContent = (ADMIN? ADMIN.email : "") + " • " + CONFIG.examSubtitle;
  renderSettings();
  renderBlueprint();
  renderQuestionForm();
  renderLocalQuestions();
  renderRoster();
  renderBankFilters();
  renderBank();
  show("screen-admin");
}

function switchTab(name){
  document.querySelectorAll(".atab").forEach(b=> b.classList.toggle("active", b.dataset.tab===name));
  ["settings","blueprint","questions","results","bank"].forEach(t=>
    $("#pane-"+t).classList.toggle("hidden", t!==name));
  window.scrollTo({top:0});
}

/* =====================================================================
   تبويب الأوزان والأجزاء
   ===================================================================== */
function renderBlueprint(){
  const ps = partStats();
  const head = ["الوحدة المعرفية (SKU)","وزن NCAAA","الوزن المستخدم %","ضمن الشامل",
                "الأسئلة المتاحة","أسئلة الاختبار الجزئي","المدة (دقيقة)"];
  $("#bp-table").innerHTML =
    "<table class='res'><thead><tr>"+head.map(h=>"<th>"+h+"</th>").join("")+"</tr></thead><tbody>"+
    ps.map(p=>{
      const dis = p.ready ? "" : " disabled";
      return "<tr><td>"+esc(p.id+" — "+p.name)+"</td>"+
        "<td>"+p.officialWeight+"%</td>"+
        "<td><input class='cell-in' type='number' min='0' max='100' step='0.5' data-w='"+p.id+"' value='"+p.weight+"'></td>"+
        "<td><input type='checkbox' data-c='"+p.id+"'"+(p.inComp!==false?" checked":"")+dis+"></td>"+
        "<td>"+(p.available||"—")+"</td>"+
        "<td><input class='cell-in' type='number' min='5' max='200' data-q='"+p.id+"' value='"+
            (p.qCount||CONFIG.modes.part.questions)+"'"+dis+"></td>"+
        "<td><input class='cell-in' type='number' min='5' max='300' data-d='"+p.id+"' value='"+
            (p.qDuration||CONFIG.modes.part.duration)+"'"+dis+"></td></tr>";
    }).join("")+
    "<tr><td><b>المجموع</b></td><td><b>"+ps.reduce((s,p)=>s+p.officialWeight,0)+
    "%</b></td><td><b id='bp-sum'>"+ps.reduce((s,p)=>s+p.weight,0)+
    "%</b></td><td colspan='4'></td></tr></tbody></table>";

  $("#bp-table").querySelectorAll("[data-w]").forEach(inp=>
    inp.addEventListener("input", ()=>{
      const sum = [...$("#bp-table").querySelectorAll("[data-w]")]
        .reduce((s,i)=> s + (parseFloat(i.value)||0), 0);
      const el = $("#bp-sum");
      el.textContent = (Math.round(sum*10)/10) + "%";
      el.style.color = Math.abs(sum-100) < 0.01 ? "var(--ok)" : "var(--warn)";
    }));
}

function saveBlueprint(){
  const s = ADATA.settings = ADATA.settings || {};
  const po = s.partOverrides = s.partOverrides || {};
  let sum = 0;
  CONFIG.parts.forEach(p=>{
    const w  = parseFloat($("#bp-table").querySelector("[data-w='"+p.id+"']").value);
    const c  = $("#bp-table").querySelector("[data-c='"+p.id+"']").checked;
    const q  = parseInt($("#bp-table").querySelector("[data-q='"+p.id+"']").value,10);
    const d  = parseInt($("#bp-table").querySelector("[data-d='"+p.id+"']").value,10);
    po[p.id] = {
      weight: (isNaN(w)||w<0) ? p.officialWeight : w,
      inComp: !!c,
      questions: (isNaN(q)||q<5) ? null : q,
      duration:  (isNaN(d)||d<5) ? null : d
    };
    sum += po[p.id].weight;
  });
  saveAdminData(ADATA);
  applyAdminOverrides();
  renderBlueprint();
  const msg = Math.abs(sum-100) < 0.01
    ? "✔ تم الحفظ. مجموع الأوزان 100% مطابق للمعيار."
    : "✔ تم الحفظ. مجموع الأوزان " + (Math.round(sum*10)/10) + "% — سيُعاد توحيدها تلقائيًا عند بناء الاختبار الشامل.";
  note("bp-note", msg, "ok");
  previewBlueprint();
}

function resetBlueprint(){
  if(!confirm("استعادة أوزان NCAAA الأصلية وإلغاء تخصيصك لكل الوحدات؟")) return;
  if(ADATA.settings) delete ADATA.settings.partOverrides;
  saveAdminData(ADATA);
  applyAdminOverrides();
  renderBlueprint();
  note("bp-note","تمت استعادة أوزان المعيار الأصلية.","ok");
}

function previewBlueprint(){
  const total = CONFIG.modes.full.questions;
  const plan = weightedPlan(total);
  if(!plan.length){ $("#bp-preview-out").innerHTML = "<div class='adm-note'>لا توجد وحدات جاهزة ضمن الاختبار الشامل.</div>"; return; }
  const cov = planCoverage();
  $("#bp-preview-out").innerHTML =
    "<table class='res'><thead><tr><th>الوحدة</th><th>وزن NCAAA</th><th>الوزن المستخدم</th>"+
    "<th>الأسئلة</th><th>النسبة الفعلية</th><th>ملاحظة</th></tr></thead><tbody>"+
    plan.map(x=>"<tr><td>"+esc(x.id+" — "+x.name)+"</td><td>"+x.official+"%</td><td>"+x.weight+
      "%</td><td>"+x.n+"</td><td>"+x.actualPct+"%</td><td>"+
      (x.short? "رصيد الأسئلة أقل من المطلوب" : "مكتمل")+"</td></tr>").join("")+
    "<tr><td><b>الإجمالي</b></td><td colspan='2'></td><td><b>"+plan.reduce((s,x)=>s+x.n,0)+
    "</b></td><td>100%</td><td>"+cov.units+" وحدة</td></tr></tbody></table>"+
    "<div class='adm-note'>الوحدات المشمولة تمثل "+cov.covered+"% من وزن المعيار الكامل.</div>";
}

/* =====================================================================
   1) الإعدادات
   ===================================================================== */
const TYPE_LIST = [["mcq","اختيار من متعدد"],["tf","صح/خطأ"],["fill","أكمل الفراغ"],
                   ["match","مطابقة"],["calc","مسائل حسابية"]];
const FLAG_LIST = [["shuffleQuestions","خلط ترتيب الأسئلة"],["shuffleChoices","خلط الخيارات"],
                   ["askStudentId","طلب الرقم الجامعي"],["requireRegistration","إلزام التسجيل قبل الدخول"]];

function renderSettings(){
  $("#s-pq").value = CONFIG.modes.part.questions;
  $("#s-pd").value = CONFIG.modes.part.duration;
  $("#s-fq").value = CONFIG.modes.full.questions;
  $("#s-fd").value = CONFIG.modes.full.duration;
  $("#s-pass").value = CONFIG.passingGrade;
  $("#s-domain").value = CONFIG.emailDomain || "";
  $("#s-spass").value = CONFIG.examPassword;
  $("#s-apass").value = CONFIG.adminPassword;
  $("#s-types").innerHTML = TYPE_LIST.map(t=>
    '<label><input type="checkbox" value="'+t[0]+'"'+
    (CONFIG.allowedTypes.includes(t[0])?" checked":"")+"> "+t[1]+"</label>").join("");
  $("#s-flags").innerHTML = FLAG_LIST.map(f=>
    '<label><input type="checkbox" value="'+f[0]+'"'+
    (CONFIG[f[0]]?" checked":"")+"> "+f[1]+"</label>").join("");
}

function saveSettings(){
  const num = (id, min, max, dflt)=>{
    const v = parseInt($("#"+id).value,10);
    return (isNaN(v)||v<min||v>max) ? dflt : v;
  };
  const types = [...$("#s-types").querySelectorAll("input:checked")].map(i=>i.value);
  if(!types.length){ note("s-note","يجب اختيار نوع واحد على الأقل من أنواع الأسئلة.","bad"); return; }

  const s = ADATA.settings = ADATA.settings || {};
  s.modes = {
    part:{ questions:num("s-pq",5,200,50), duration:num("s-pd",5,300,60) },
    full:{ questions:num("s-fq",5,200,60), duration:num("s-fd",5,300,90) }
  };
  s.passingGrade = num("s-pass",1,100,60);
  s.emailDomain  = $("#s-domain").value.trim().replace(/^@/,"");
  s.examPassword = $("#s-spass").value.trim() || CONFIG.examPassword;
  s.adminPassword= $("#s-apass").value.trim() || CONFIG.adminPassword;
  s.allowedTypes = types;
  FLAG_LIST.forEach(f=>{ s[f[0]] = $("#s-flags").querySelector('input[value="'+f[0]+'"]').checked; });

  saveAdminData(ADATA);
  applyAdminOverrides();
  renderSettings();
  note("s-note","✔ تم حفظ الإعدادات على هذا الجهاز. لجعلها دائمة لجميع الطلاب صدّر config.js واستبدله في المستودع.","ok");
}

function resetSettings(){
  if(!confirm("استعادة الإعدادات الافتراضية وإلغاء تعديلاتك؟")) return;
  ADATA.settings = {};
  saveAdminData(ADATA);
  note("s-note","تمت الاستعادة — أعد تحميل الصفحة لتطبيق القيم الأصلية.","ok");
}

function exportConfig(){
  const s = ADATA.settings || {};
  const lines = [
    "/* الإعدادات المصدَّرة من لوحة المعلم — " + new Date().toLocaleString("ar-SA") + " */",
    "/* انسخ القيم التالية داخل CONFIG في ملف config.js */",
    "",
    "examPassword: " + JSON.stringify(CONFIG.examPassword) + ",",
    "adminPassword: " + JSON.stringify(CONFIG.adminPassword) + ",",
    "emailDomain: " + JSON.stringify(CONFIG.emailDomain) + ",",
    "passingGrade: " + CONFIG.passingGrade + ",",
    "requireRegistration: " + !!CONFIG.requireRegistration + ",",
    "askStudentId: " + !!CONFIG.askStudentId + ",",
    "shuffleQuestions: " + !!CONFIG.shuffleQuestions + ",",
    "shuffleChoices: " + !!CONFIG.shuffleChoices + ",",
    "allowedTypes: " + JSON.stringify(CONFIG.allowedTypes) + ",",
    "modes: " + JSON.stringify(CONFIG.modes, null, 2) + ","
  ];
  download("config-overrides.txt", lines.join("\n"), "text/plain");
  note("s-note","تم تنزيل الملف. استبدل القيم المقابلة داخل config.js في المستودع.","ok");
}

/* =====================================================================
   2) الأسئلة — إضافة / تعديل / حذف
   ===================================================================== */
let editingId = null;

function renderQuestionForm(){
  $("#q-part").innerHTML = CONFIG.parts.map(p=>
    '<option value="'+p.id+'">'+esc(p.id+" — "+p.name)+"</option>").join("");
  $("#q-topic").innerHTML = Object.keys(CONFIG.topics).map(k=>
    '<option value="'+k+'">'+esc(k+" — "+CONFIG.topics[k])+"</option>").join("");
  if(!$("#q-opts").children.length){
    $("#q-opts").innerHTML = [0,1,2,3].map(i=>
      '<div class="opt-row"><input type="radio" name="q-correct" value="'+i+'"'+(i===0?" checked":"")+'>'+
      '<input type="text" class="fillin" id="q-o'+i+'" placeholder="الخيار '+["أ","ب","ج","د"][i]+'"></div>').join("");
  }
  toggleQType();
}
function toggleQType(){
  const t = $("#q-type").value;
  $("#q-mcq-wrap").classList.toggle("hidden", t!=="mcq");
  $("#q-tf-wrap").classList.toggle("hidden", t!=="tf");
  $("#q-fill-wrap").classList.toggle("hidden", t!=="fill");
}
function clearQForm(){
  editingId = null;
  $("#q-form-title").textContent = "➕ إضافة سؤال جديد";
  $("#q-cancel").classList.add("hidden");
  $("#q-text").value = ""; $("#q-expl").value = ""; $("#q-ref").value = "";
  $("#q-fill").value = "";
  [0,1,2,3].forEach(i=> $("#q-o"+i).value = "");
  const r = $("#q-opts").querySelector('input[value="0"]'); if(r) r.checked = true;
}

function saveQuestion(){
  const type = $("#q-type").value;
  const q = {
    part: $("#q-part").value,
    topic: parseInt($("#q-topic").value,10),
    type: type,
    q: $("#q-text").value.trim(),
    expl: $("#q-expl").value.trim(),
    ref: $("#q-ref").value.trim() || "—"
  };
  if(q.q.length < 8){ note("q-note","نص السؤال قصير جدًا.","bad"); return; }
  if(q.expl.length < 5){ note("q-note","يرجى كتابة شرح الإجابة.","bad"); return; }

  if(type === "mcq"){
    const opts = [0,1,2,3].map(i=> $("#q-o"+i).value.trim());
    if(opts.some(o=>!o)){ note("q-note","يجب تعبئة الخيارات الأربعة.","bad"); return; }
    if(new Set(opts).size !== 4){ note("q-note","لا يجوز تكرار الخيارات.","bad"); return; }
    const sel = $("#q-opts").querySelector("input[name='q-correct']:checked");
    q.opts = opts; q.a = sel? parseInt(sel.value,10) : 0;
  } else if(type === "tf"){
    q.a = $("#q-tf").value === "true";
  } else {
    const ans = $("#q-fill").value.split(",").map(x=>x.trim()).filter(Boolean);
    if(!ans.length){ note("q-note","أدخل إجابة مقبولة واحدة على الأقل.","bad"); return; }
    q.answers = ans;
  }

  if(editingId !== null){
    const orig = QUESTION_BANK.find(x=>String(x.id)===String(editingId));
    q.id = orig? orig.id : editingId;
    const isAdded = (ADATA.added||[]).some(x=>String(x.id)===String(q.id));
    if(isAdded){ ADATA.added = ADATA.added.map(x=> String(x.id)===String(q.id)? q : x); }
    else { ADATA.edited = ADATA.edited || {}; ADATA.edited[String(q.id)] = q; }
    note("q-note","✔ تم حفظ تعديل السؤال رقم "+q.id,"ok");
  } else {
    const maxId = QUESTION_BANK.reduce((m,x)=> Math.max(m, parseInt(x.id,10)||0), 0);
    q.id = Math.max(maxId, 1000) + 1;
    ADATA.added = ADATA.added || [];
    ADATA.added.push(q);
    note("q-note","✔ تمت إضافة السؤال رقم "+q.id+" — لا تنس تصدير questions.js لحفظه بشكل دائم.","ok");
  }
  saveAdminData(ADATA);
  rebuildBank();
  clearQForm();
  renderLocalQuestions();
  renderBank();
}

function rebuildBank(){
  // إعادة تحميل البنك الأصلي غير ممكنة بدون إعادة تحميل الصفحة،
  // لذا نطبق التغييرات على النسخة الحالية مباشرة
  (ADATA.added||[]).forEach(q=>{
    const i = QUESTION_BANK.findIndex(x=>String(x.id)===String(q.id));
    if(i>=0) QUESTION_BANK[i] = q; else QUESTION_BANK.push(q);
  });
  Object.keys(ADATA.edited||{}).forEach(id=>{
    const i = QUESTION_BANK.findIndex(x=>String(x.id)===String(id));
    if(i>=0) QUESTION_BANK[i] = Object.assign({}, QUESTION_BANK[i], ADATA.edited[id]);
  });
  (ADATA.deleted||[]).forEach(id=>{
    const i = QUESTION_BANK.findIndex(x=>String(x.id)===String(id));
    if(i>=0) QUESTION_BANK.splice(i,1);
  });
}

function editQuestion(id){
  const q = QUESTION_BANK.find(x=>String(x.id)===String(id));
  if(!q) return;
  editingId = q.id;
  $("#q-form-title").textContent = "✏️ تعديل السؤال رقم " + q.id;
  $("#q-cancel").classList.remove("hidden");
  $("#q-part").value = q.part || "7.4";
  $("#q-topic").value = q.topic || 1;
  $("#q-type").value = ["mcq","tf","fill"].includes(q.type) ? q.type : "mcq";
  toggleQType();
  $("#q-text").value = q.q || "";
  $("#q-expl").value = q.expl || "";
  $("#q-ref").value = q.ref || "";
  if(q.type === "mcq" && q.opts){
    [0,1,2,3].forEach(i=> $("#q-o"+i).value = q.opts[i] || "");
    const r = $("#q-opts").querySelector('input[value="'+(q.a||0)+'"]'); if(r) r.checked = true;
  }
  if(q.type === "tf") $("#q-tf").value = q.a ? "true" : "false";
  if(q.type === "fill") $("#q-fill").value = (q.answers||[]).join(", ");
  switchTab("questions");
  window.scrollTo({top:0});
}

function deleteQuestion(id){
  if(!confirm("حذف السؤال رقم " + id + " من البنك؟")) return;
  const wasAdded = (ADATA.added||[]).some(x=>String(x.id)===String(id));
  if(wasAdded){ ADATA.added = ADATA.added.filter(x=>String(x.id)!==String(id)); }
  else { ADATA.deleted = ADATA.deleted || []; if(!ADATA.deleted.includes(id)) ADATA.deleted.push(id); }
  if(ADATA.edited) delete ADATA.edited[String(id)];
  saveAdminData(ADATA);
  const i = QUESTION_BANK.findIndex(x=>String(x.id)===String(id));
  if(i>=0) QUESTION_BANK.splice(i,1);
  renderLocalQuestions(); renderBank();
  note("q-note","تم حذف السؤال رقم "+id,"ok");
}

function qCard(q, withBtns){
  let ans = "";
  if(q.type==="mcq" && q.opts) ans = "الإجابة: " + ["أ","ب","ج","د"][q.a] + ") " + q.opts[q.a];
  else if(q.type==="tf") ans = "الإجابة: " + (q.a ? "صحيحة" : "خاطئة");
  else if(q.type==="fill") ans = "الإجابة: " + (q.answers||[]).join(" / ");
  else if(q.type==="calc") ans = "سؤال حسابي بأرقام متغيرة";
  else if(q.type==="match") ans = "سؤال مطابقة";
  return '<div class="qrow"><div class="qh"><div><b>#'+q.id+"</b> "+
    '<span class="pill">'+esc(q.part||"—")+"</span> "+
    '<span class="pill">'+esc(TYPE_NAMES[q.type]||q.type)+"</span></div>"+
    (withBtns? '<div class="rowbtns"><button class="minibtn" data-edit="'+q.id+'">تعديل</button>'+
      '<button class="minibtn danger" data-del="'+q.id+'">حذف</button></div>' : "")+
    "</div><div>"+esc(typeof q.q==="string"? q.q : "(سؤال مولَّد بأرقام عشوائية)")+"</div>"+
    (ans? '<div class="qa">'+esc(ans)+"</div>" : "")+
    (q.ref? '<div class="qx">📖 '+esc(q.ref)+"</div>" : "")+"</div>";
}

function renderLocalQuestions(){
  const added = (ADATA.added||[]);
  const editedIds = Object.keys(ADATA.edited||{});
  const deleted = (ADATA.deleted||[]);
  let html = "";
  if(added.length) html += "<div class='adm-note'>أسئلة مضافة ("+added.length+"):</div>" +
    added.map(q=>qCard(q,true)).join("");
  if(editedIds.length) html += "<div class='adm-note'>أسئلة معدَّلة ("+editedIds.length+"):</div>" +
    editedIds.map(id=>{ const q = QUESTION_BANK.find(x=>String(x.id)===id); return q? qCard(q,true):""; }).join("");
  if(deleted.length) html += "<div class='adm-note'>أسئلة محذوفة: " + deleted.join("، ") +
    " <button class='minibtn' id='undo-del'>تراجع عن الحذف</button></div>";
  $("#q-local").innerHTML = html || "<div class='adm-note'>لا توجد تعديلات محلية بعد.</div>";
  const u = $("#undo-del");
  if(u) u.addEventListener("click", ()=>{
    ADATA.deleted = []; saveAdminData(ADATA);
    note("q-note","تم التراجع — أعد تحميل الصفحة لاستعادة الأسئلة المحذوفة.","ok");
    renderLocalQuestions();
  });
}

/* تصدير بنك الأسئلة كاملًا بصيغة questions.js */
function exportQuestions(){
  const body = QUESTION_BANK.map(q=>{
    const o = {id:q.id, type:q.type, topic:q.topic, part:q.part, q:q.q};
    if(q.opts){ o.opts = q.opts; o.a = q.a; }
    else if(q.type==="tf"){ o.a = q.a; }
    else if(q.answers){ o.answers = q.answers; }
    else if(q.left){ o.left = q.left; o.right = q.right; }
    o.expl = q.expl; o.ref = q.ref;
    if(typeof q.gen === "function") return "/* السؤال #"+q.id+" مولَّد ديناميكيًا — انسخه من الملف الأصلي */";
    return JSON.stringify(o, null, 1).replace(/\n\s*/g," ");
  }).join(",\n");
  const out = "/* بنك الأسئلة — صُدِّر من لوحة المعلم في " + new Date().toLocaleString("ar-SA") + " */\n" +
    "/* تنبيه: الأسئلة الحسابية المولَّدة ديناميكيًا (gen) لم تُصدَّر — احتفظ بها من الملف الأصلي */\n\n" +
    "const QUESTION_BANK = [\n" + body + "\n];\n";
  download("questions-export.js", out, "application/javascript");
  note("q-note","تم تنزيل الملف. راجعه ثم استبدل questions.js في المستودع (مع الإبقاء على الأسئلة الحسابية المولَّدة).","ok");
}

/* =====================================================================
   3) النتائج — عرض واستيراد وتصدير (مع الرقم الجامعي)
   ===================================================================== */
function loadRoster(){
  try{ return JSON.parse(localStorage.getItem(ROSTER_STORE)) || []; }catch(e){ return []; }
}
function saveRoster(r){ try{ localStorage.setItem(ROSTER_STORE, JSON.stringify(r)); }catch(e){} }

/* يجمع محاولات هذا الجهاز مع السجلات المستوردة */
function allRecords(){
  const local = (loadStore().attempts||[]).map(a=>({
    name: a.student? a.student.name : "—",
    sid:  a.student? (a.student.sid||"—") : "—",
    email:a.student? a.student.email : "—",
    subject: a.student? a.student.subject : "—",
    mode: a.mode==="full" ? "شامل" : "جزء " + (a.partId||""),
    pct: a.pct, correct:a.correct, wrong:a.wrong, skipped:a.skipped,
    time: fmtTime(a.usedSec), date: new Date(a.date).toLocaleString("ar-SA"),
    code: a.code||"—", src:"هذا الجهاز"
  }));
  return local.concat(loadRoster());
}

function renderRoster(){
  const rows = allRecords();
  if(!rows.length){ $("#r-table").innerHTML = "<div class='adm-note'>لا توجد نتائج بعد.</div>"; return; }
  const head = ["#","اسم الطالب","الرقم الجامعي","البريد الجامعي","المقرر","النمط",
                "النسبة","صحيحة","خاطئة","متروكة","الوقت","التاريخ","رمز التحقق","المصدر"];
  $("#r-table").innerHTML = "<table class='res'><thead><tr>" +
    head.map(h=>"<th>"+h+"</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r,i)=>"<tr>"+
      "<td>"+(i+1)+"</td><td>"+esc(r.name)+"</td><td>"+esc(r.sid)+"</td><td>"+esc(r.email)+"</td>"+
      "<td>"+esc(r.subject)+"</td><td>"+esc(r.mode)+"</td>"+
      '<td class="'+(r.pct>=CONFIG.passingGrade?"pass":"fail")+'">'+r.pct+"%</td>"+
      "<td>"+r.correct+"</td><td>"+r.wrong+"</td><td>"+r.skipped+"</td>"+
      "<td>"+esc(r.time)+"</td><td>"+esc(r.date)+"</td><td>"+esc(r.code)+"</td><td>"+esc(r.src)+"</td>"+
      "</tr>").join("") + "</tbody></table>" +
    "<div class='adm-note'>الإجمالي: "+rows.length+" محاولة • الناجحون: "+
      rows.filter(r=>r.pct>=CONFIG.passingGrade).length+"</div>";
}

/* استيراد ملفات CSV التي يصدّرها الطلاب */
function importCsvFiles(files){
  const roster = loadRoster();
  let done = 0, added = 0;
  [...files].forEach(f=>{
    const rd = new FileReader();
    rd.onload = ()=>{
      try{
        const txt = String(rd.result).replace(/^﻿/,"");
        const map = {};
        txt.split(/\r?\n/).forEach(line=>{
          const m = line.match(/^"([^"]*)","([\s\S]*)"$/);
          if(m) map[m[1]] = m[2].replace(/""/g,'"');
        });
        if(map["اسم الطالب"]){
          roster.push({
            name: map["اسم الطالب"] || "—",
            sid: map["الرقم الجامعي"] || "—",
            email: map["البريد الجامعي"] || "—",
            subject: map["المقرر"] || "—",
            mode: map["نمط الاختبار"] || "—",
            pct: parseInt(map["النسبة المئوية"],10) || 0,
            correct: map["إجابات صحيحة"] || "—",
            wrong: map["إجابات خاطئة"] || "—",
            skipped: map["أسئلة متروكة"] || "—",
            time: map["الوقت المستغرق"] || "—",
            date: map["تاريخ التسليم"] || "—",
            code: map["رمز التحقق"] || "—",
            src: "مستورد: " + f.name
          });
          added++;
        }
      }catch(e){}
      if(++done === files.length){
        saveRoster(roster); renderRoster();
        alert(added ? ("تم استيراد " + added + " نتيجة.") : "لم يتم التعرف على أي نتيجة في الملفات المختارة.");
      }
    };
    rd.readAsText(f, "utf-8");
  });
}

function exportRoster(){
  const rows = allRecords();
  if(!rows.length){ alert("لا توجد نتائج للتصدير."); return; }
  const head = ["م","اسم الطالب","الرقم الجامعي","البريد الجامعي","المقرر","النمط",
                "النسبة","صحيحة","خاطئة","متروكة","الوقت","التاريخ","رمز التحقق","المصدر"];
  const esc2 = v => '"' + String(v).replace(/"/g,'""') + '"';
  const csv = "﻿" + [head.map(esc2).join(",")].concat(
    rows.map((r,i)=>[i+1,r.name,r.sid,r.email,r.subject,r.mode,r.pct+"%",
      r.correct,r.wrong,r.skipped,r.time,r.date,r.code,r.src].map(esc2).join(","))
  ).join("\r\n");
  download("كشف_نتائج_الطلاب_"+new Date().toISOString().slice(0,10)+".csv", csv, "text/csv");
}

/* =====================================================================
   4) معاينة بنك الأسئلة
   ===================================================================== */
function renderBankFilters(){
  const counts = {};
  QUESTION_BANK.forEach(q=>{ counts[q.part]=(counts[q.part]||0)+1; });
  $("#b-part").innerHTML = '<option value="">كل الأجزاء ('+QUESTION_BANK.length+")</option>" +
    CONFIG.parts.filter(p=>counts[p.id]).map(p=>
      '<option value="'+p.id+'">'+esc(p.id+" — "+p.name)+" ("+counts[p.id]+")</option>").join("");
}
function renderBank(){
  const part = $("#b-part").value;
  const term = $("#b-search").value.trim();
  let list = QUESTION_BANK.filter(q=> !part || q.part===part);
  if(term) list = list.filter(q=> typeof q.q==="string" && q.q.includes(term));
  $("#b-count").textContent = "عدد الأسئلة المعروضة: " + list.length;
  $("#b-list").innerHTML = list.slice(0,150).map(q=>qCard(q,true)).join("") +
    (list.length>150 ? "<div class='adm-note'>يُعرض أول 150 سؤالًا — استخدم البحث لتضييق النتائج.</div>" : "");
}

/* =====================================================================
   ربط الأحداث
   ===================================================================== */
document.addEventListener("DOMContentLoaded", ()=>{
  $("#admin-tabs").addEventListener("click", e=>{
    const b = e.target.closest(".atab"); if(b) switchTab(b.dataset.tab);
  });
  $("#s-save").addEventListener("click", saveSettings);
  $("#s-reset").addEventListener("click", resetSettings);
  $("#s-export").addEventListener("click", exportConfig);

  $("#bp-save").addEventListener("click", saveBlueprint);
  $("#bp-reset").addEventListener("click", resetBlueprint);
  $("#bp-preview").addEventListener("click", previewBlueprint);

  $("#q-type").addEventListener("change", toggleQType);
  $("#q-save").addEventListener("click", saveQuestion);
  $("#q-cancel").addEventListener("click", clearQForm);
  $("#q-export").addEventListener("click", exportQuestions);

  // أزرار التعديل/الحذف داخل القوائم
  ["q-local","b-list"].forEach(id=>{
    $("#"+id).addEventListener("click", e=>{
      const ed = e.target.closest("[data-edit]");
      const dl = e.target.closest("[data-del]");
      if(ed) editQuestion(ed.dataset.edit);
      if(dl) deleteQuestion(dl.dataset.del);
    });
  });

  $("#r-import").addEventListener("change", e=>{
    if(e.target.files && e.target.files.length) importCsvFiles(e.target.files);
    e.target.value = "";
  });
  $("#r-export").addEventListener("click", exportRoster);
  $("#r-clear").addEventListener("click", ()=>{
    if(confirm("مسح السجلات المستوردة من هذا الجهاز؟")){ saveRoster([]); renderRoster(); }
  });

  $("#b-part").addEventListener("change", renderBank);
  $("#b-search").addEventListener("input", renderBank);

  $("#btn-admin-exit").addEventListener("click", ()=>{
    ADMIN = null;
    try{ sessionStorage.removeItem(ADMIN_KEY_SESSION); }catch(e){}
    setRole("student");
    renderGate();
  });
});
