/* ZakaPro Web SDK v4.1 — multi-plan modal checkout */
(function (global) {
  "use strict";
  var DEFAULT_API_BASE = "https://zakapro.vercel.app";
  var STYLE_ID = "zakapro-modal-styles-v41";
  function asElement(value){ if(typeof value==="string") return document.querySelector(value); return value&&value.nodeType===1?value:null; }
  function esc(value){ return String(value).replace(/[&<>"]/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch];}); }
  function money(value){ return Number(value||0).toLocaleString("fr-FR",{maximumFractionDigits:2}); }
  function injectStyles(){
    if(document.getElementById(STYLE_ID)) return;
    var s=document.createElement("style"); s.id=STYLE_ID;
    s.textContent=[
      ".zakapro-modal-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.74);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}",
      ".zakapro-modal{width:min(100%,520px);max-height:92vh;overflow:auto;border:1px solid rgba(234,179,8,.3);border-radius:22px;background:linear-gradient(145deg,rgba(20,27,42,.99),rgba(8,13,24,.99));box-shadow:0 30px 100px rgba(0,0,0,.58);color:#f8fafc;font-family:system-ui,-apple-system,sans-serif}",
      ".zakapro-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.14)}",
      ".zakapro-modal-title{font-size:16px;font-weight:800}.zakapro-modal-sub{margin-top:3px;font-size:11px;color:#94a3b8}.zakapro-modal-close{border:0;background:transparent;color:#94a3b8;font-size:25px;cursor:pointer;padding:4px}.zakapro-modal-close:hover{color:#fff}",
      ".zakapro-modal-body{padding:20px}.zakapro-plan-card{padding:13px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(15,23,42,.72);margin-bottom:14px}.zakapro-plan-name{font-weight:800}.zakapro-plan-price{margin-top:4px;color:#fbbf24;font-size:18px;font-weight:900}",
      ".zakapro-field{display:block;width:100%;box-sizing:border-box;margin:7px 0 12px;padding:12px 13px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#0b1220;color:#f8fafc;outline:none}.zakapro-label{display:block;font-size:11px;font-weight:800;color:#cbd5e1;margin-bottom:5px}",
      ".zakapro-methods{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0}.zakapro-method{padding:12px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#101827;color:#e2e8f0;font-weight:800;cursor:pointer}.zakapro-method.active{border-color:#eab308;background:rgba(234,179,8,.12);color:#fbbf24}",
      ".zakapro-primary{width:100%;padding:13px;border:0;border-radius:11px;background:#eab308;color:#090d16;font-weight:900;cursor:pointer}.zakapro-primary:disabled{opacity:.55;cursor:not-allowed}.zakapro-info{margin:12px 0;padding:13px;border:1px solid rgba(234,179,8,.24);border-radius:12px;background:rgba(234,179,8,.06);font-size:12px;line-height:1.55}.zakapro-error{color:#fb7185;font-size:12px;font-weight:700;margin:10px 0}.zakapro-success{color:#86efac;font-size:13px;font-weight:800}.zakapro-muted{color:#94a3b8;font-size:11px;line-height:1.5}",
      ".zakapro-actions{display:flex;gap:9px;margin-top:12px}.zakapro-secondary{flex:1;padding:11px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#101827;color:#cbd5e1;font-weight:800;cursor:pointer}",
      ".zakapro-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.25);border-top-color:#eab308;border-radius:50%;animation:zakapro-spin .8s linear infinite;margin:auto}@keyframes zakapro-spin{to{transform:rotate(360deg)}}"
    ].join(""); document.head.appendChild(s);
  }
  function ZakaProClient(options){
    options=options||{}; this.appKey=String(options.appKey||"").trim(); this.apiBase=String(options.apiBase||DEFAULT_API_BASE).replace(/\/$/,"");
    this.container=options.container||"#zakapro-plans"; this.methods=Array.isArray(options.methods)&&options.methods.length?options.methods:["moncash","natcash"];
    this.buttonClass=String(options.buttonClass||"zakapro-payment-button"); this.onPaymentConfirmed=typeof options.onPaymentConfirmed==="function"?options.onPaymentConfirmed:null; this.plans=[]; this.app=null; this.activeModal=null; injectStyles();
  }
  ZakaProClient.prototype.plansUrl=function(){return this.apiBase+"/api/apps/"+encodeURIComponent(this.appKey)+"/plans";};
  ZakaProClient.prototype.loadPlans=async function(){
    if(!this.appKey) throw new Error("ZakaPro: appKey requis.");
    var r=await fetch(this.plansUrl(),{headers:{Accept:"application/json"},credentials:"omit",cache:"no-store"});
    var b=await r.json(); if(!r.ok||!b.success) throw new Error(b.error||"Impossible de charger les plans.");
    this.plans=Array.isArray(b.plans)?b.plans:[]; this.app=b.app||null; return this.plans;
  };
  ZakaProClient.prototype.renderPlans=async function(options){
    options=options||{}; var c=asElement(options.container||this.container); if(!c) throw new Error("ZakaPro: conteneur introuvable.");
    var plans=await this.loadPlans(); c.replaceChildren(); if(!plans.length){c.textContent=options.emptyText||"Aucun plan disponible.";return plans;}
    var f=document.createDocumentFragment(),self=this;
    plans.forEach(function(plan){var b=document.createElement("button"); b.type="button"; b.className=options.buttonClass||self.buttonClass;
      b.dataset.zakaproAppKey=self.appKey;b.dataset.zakaproPlanId=plan.id;b.dataset.zakaproAmount=String(Number(plan.amount));
      b.dataset.zakaproRecurrence=String(plan.recurrence||"unique"); b.textContent=(options.labelPrefix||"Peye")+" "+plan.name+" — "+money(plan.amount)+" HTG";
      b.addEventListener("click",function(){self.openPlan(plan.id);}); f.appendChild(b);}); c.appendChild(f); return plans;
  };
  ZakaProClient.prototype.getPlans=function(){return this.loadPlans();};
  ZakaProClient.prototype.open=function(plan){return this.openPlan(plan&&plan.id);};
  ZakaProClient.prototype.openPlan=async function(planId){
    if(!this.plans.length) await this.loadPlans(); var plan=this.plans.find(function(p){return p.id===planId;}); if(!plan) throw new Error("ZakaPro: plan introuvable.");
    this.closeModal(); this.activeModal=this.createModal(plan); document.body.appendChild(this.activeModal.backdrop);
    var self=this; this.activeModal.backdrop.addEventListener("click",function(e){if(e.target===self.activeModal.backdrop)self.closeModal();});
    this.activeModal.close.addEventListener("click",function(){self.closeModal();}); return plan;
  };
  ZakaProClient.prototype.createModal=function(plan){
    var backdrop=document.createElement("div");backdrop.className="zakapro-modal-backdrop";
    var modal=document.createElement("div");modal.className="zakapro-modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
    var head=document.createElement("div");head.className="zakapro-modal-head";
    var tw=document.createElement("div");var t=document.createElement("div");t.className="zakapro-modal-title";t.textContent="Paiement ZakaPro";
    var st=document.createElement("div");st.className="zakapro-modal-sub";st.textContent="Checkout sécurisé · aucune nouvelle fenêtre";tw.appendChild(t);tw.appendChild(st);
    var close=document.createElement("button");close.type="button";close.className="zakapro-modal-close";close.setAttribute("aria-label","Fermer");close.textContent="×";head.appendChild(tw);head.appendChild(close);
    var body=document.createElement("div");body.className="zakapro-modal-body";modal.appendChild(head);modal.appendChild(body);backdrop.appendChild(modal);
    this.renderCheckoutForm(body,plan); return {backdrop:backdrop,close:close,body:body,cleanup:null};
  };
  ZakaProClient.prototype.renderCheckoutForm=function(body,plan){
    var self=this,app=this.app||{},state={method:this.methods.indexOf("moncash")>=0?"moncash":"natcash",loading:false,intent:null,error:""};
    function render(){
      var wallet=app.wallets?app.wallets[state.method==="moncash"?"moncashPhone":"natcashPhone"]:"";var walletName=app.wallets?app.wallets[state.method==="moncash"?"moncashName":"natcashName"]:"";
      body.replaceChildren();var card=document.createElement("div");card.className="zakapro-plan-card";
      var pn=document.createElement("div");pn.className="zakapro-plan-name";pn.textContent=plan.name;var pp=document.createElement("div");pp.className="zakapro-plan-price";pp.textContent=money(plan.amount)+" HTG";card.appendChild(pn);card.appendChild(pp);body.appendChild(card);
      if(!state.intent){
        var form=document.createElement("form");
        form.innerHTML="<label class=zakapro-label>Nom du compte MonCash/Natcash</label><input required minlength=2 class=zakapro-field name=name autocomplete=name><label class=zakapro-label>Email</label><input required type=email class=zakapro-field name=email autocomplete=email><label class=zakapro-label>Téléphone (+509)</label><input required class=zakapro-field name=phone inputmode=tel placeholder=37124589><label class=zakapro-label>Mode de paiement</label><div class=zakapro-methods><button type=button class=zakapro-method data-method=moncash>MonCash</button><button type=button class=zakapro-method data-method=natcash>Natcash</button></div><div class=zakapro-error></div><button class=zakapro-primary type=submit>Continuer vers le paiement</button>";
        form.querySelectorAll("[data-method]").forEach(function(btn){btn.classList.toggle("active",btn.dataset.method===state.method);btn.addEventListener("click",function(){state.method=btn.dataset.method;render();});});
        form.addEventListener("submit",async function(e){e.preventDefault();if(state.loading)return;state.loading=true;render();var d=new FormData(form),phone=String(d.get("phone")||"").replace(/\D/g,"");
          try{if(!/^\d{8}$/.test(phone))throw new Error("Numéro haïtien invalide.");
            var r=await fetch(self.apiBase+"/api/apps/"+encodeURIComponent(self.appKey)+"/checkout",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"omit",cache:"no-store",body:JSON.stringify({planId:plan.id,customerName:String(d.get("name")||"").trim(),email:String(d.get("email")||"").trim(),phone:phone})});
            var b=await r.json();if(!r.ok||!b.success)throw new Error(b.error||"Impossible de créer le paiement.");state.intent=b.intent;state.loading=false;render();self.startPolling(plan,state,body);
          }catch(err){state.loading=false;state.error=err instanceof Error?err.message:"Erreur de paiement.";render();}
        }); body.appendChild(form);
      }else{
        var info=document.createElement("div");info.className="zakapro-info";info.innerHTML="Envoyez exactement <b>"+money(state.intent.total_amount)+" HTG</b> à <b>"+esc(wallet||"numéro marchand non configuré")+"</b>"+(walletName?" au nom de <b>"+esc(walletName)+"</b>":"")+"<br><span class=zakapro-muted>Référence obligatoire : <b>"+esc(state.intent.reference)+"</b></span>";body.appendChild(info);
        var methods=document.createElement("div");methods.className="zakapro-methods";["moncash","natcash"].filter(function(m){return self.methods.indexOf(m)>=0;}).forEach(function(m){var b=document.createElement("button");b.type="button";b.className="zakapro-method"+(state.method===m?" active":"");b.textContent=m==="moncash"?"MonCash":"Natcash";b.addEventListener("click",function(){state.method=m;render();});methods.appendChild(b);});body.appendChild(methods);
        var status=document.createElement("div");status.className="zakapro-info";status.innerHTML="<span class=zakapro-muted>"+(state.loading?"Vérification automatique du paiement…":"En attente du SMS de confirmation. Cette fenêtre reste ouverte.")+"</span>";body.appendChild(status);
        var msg=document.createElement("div");msg.className=state.error?"zakapro-error":"zakapro-muted";msg.textContent=state.error||"La confirmation vient uniquement du SMS validé par ZakaPro.";body.appendChild(msg);
        var actions=document.createElement("div");actions.className="zakapro-actions";var c=document.createElement("button");c.type="button";c.className="zakapro-secondary";c.textContent="Fermer";c.addEventListener("click",function(){self.closeModal();});actions.appendChild(c);body.appendChild(actions);
      }
      if(state.error&&!state.intent){var er=document.createElement("div");er.className="zakapro-error";er.textContent=state.error;body.appendChild(er);}
    } render();
  };
  ZakaProClient.prototype.startPolling=function(plan,state,body){
    var self=this,reference=state.intent.reference,stopped=false,timer=null;state.loading=true;
    var poll=async function(){if(stopped)return;try{var r=await fetch(self.apiBase+"/api/apps/"+encodeURIComponent(self.appKey)+"/checkout-status?reference="+encodeURIComponent(reference),{headers:{Accept:"application/json"},credentials:"omit",cache:"no-store"});
      var b=await r.json();if(!r.ok)throw new Error(b.error||"Impossible de vérifier le paiement.");
      if(b.status==="paid"){stopped=true;state.loading=false;body.replaceChildren();var ok=document.createElement("div");ok.className="zakapro-info";
        ok.innerHTML="<div class=zakapro-success>✓ Paiement confirmé</div><p>"+esc(b.plan.name)+" est validé pour <b>"+money(b.amount)+" HTG</b>.</p><p class=zakapro-muted>Le webhook de confirmation a été déclenché côté ZakaPro.</p>";body.appendChild(ok);var detail={reference:b.reference,plan:b.plan,amount:b.amount,appId:b.appId};try{global.dispatchEvent(new CustomEvent("zakapro:payment-confirmed",{detail:detail}));}catch(_){}if(self.onPaymentConfirmed){try{self.onPaymentConfirmed(detail);}catch(e){console.error("[ZakaPro:onPaymentConfirmed]",e);}}setTimeout(function(){self.closeModal();},2200);return;}
      if(b.status==="rejected"||b.status==="expired"){stopped=true;state.loading=false;state.error=b.status==="expired"?"La demande de paiement a expiré.":"Le paiement a été rejeté.";self.renderCheckoutForm(body,plan);return;}
    }catch(e){console.warn("[ZakaPro:checkout-poll]",e);}timer=setTimeout(poll,3000);};poll();
    if(this.activeModal)this.activeModal.cleanup=function(){stopped=true;if(timer)clearTimeout(timer);};
  };
  ZakaProClient.prototype.closeModal=function(){if(!this.activeModal)return;if(this.activeModal.cleanup)this.activeModal.cleanup();if(this.activeModal.backdrop.parentNode)this.activeModal.backdrop.parentNode.removeChild(this.activeModal.backdrop);this.activeModal=null;};
  global.ZakaPro={init:function(options){var c=new ZakaProClient(options);if(options&&options.autoRender!==false)Promise.resolve().then(function(){return c.renderPlans(options);}).catch(function(e){console.error("[ZakaPro]",e);});return c;},version:"4.1.0"};
})(window);