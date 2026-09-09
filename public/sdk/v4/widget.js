/* ZakaPro Monetization Widget v1.0
   Public donation checkout + secure event polling.
   Token gifts and withdrawals MUST be called server-to-server with
   X-ZakaPro-App-Signature; this browser widget never receives the app secret.
*/
(function(global){
  "use strict";
  var DEFAULT="https://zakapro.vercel.app";
  function esc(v){return String(v??"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]||c;});}
  function money(v){return Number(v||0).toLocaleString("fr-FR",{maximumFractionDigits:2});}
  function style(){
    if(document.getElementById("zakapro-monetization-style"))return;
    var s=document.createElement("style");s.id="zakapro-monetization-style";
    s.textContent=".zk-mono-back{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.76);backdrop-filter:blur(10px)}"+
    ".zk-mono{width:min(100%,500px);max-height:92vh;overflow:auto;border:1px solid rgba(234,179,8,.35);border-radius:22px;background:#0b1220;color:#f8fafc;box-shadow:0 30px 100px rgba(0,0,0,.6);font:14px system-ui,sans-serif}"+
    ".zk-head{display:flex;justify-content:space-between;align-items:center;padding:18px;border-bottom:1px solid #263044}.zk-body{padding:18px}.zk-close{border:0;background:transparent;color:#94a3b8;font-size:25px;cursor:pointer}.zk-label{display:block;margin:10px 0 5px;color:#cbd5e1;font-size:11px;font-weight:800}.zk-input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #263044;border-radius:10px;background:#080d16;color:#fff}.zk-methods{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.zk-method,.zk-primary{padding:12px;border-radius:10px;font-weight:900;cursor:pointer}.zk-method{border:1px solid #263044;background:#111827;color:#cbd5e1}.zk-method.active{border-color:#eab308;color:#fbbf24;background:#eab30818}.zk-primary{width:100%;border:0;background:#eab308;color:#090d16}.zk-info{margin:12px 0;padding:12px;border:1px solid #eab30844;border-radius:12px;background:#eab3080d;line-height:1.55}.zk-ok{color:#86efac;font-weight:900}.zk-err{color:#fb7185;font-size:12px;font-weight:700}";
    document.head.appendChild(s);
  }
  function Widget(opts){
    opts=opts||{};this.appKey=String(opts.appKey||"");this.apiBase=String(opts.apiBase||DEFAULT).replace(/\/$/,"");this.recipientUserId=String(opts.recipientUserId||"");this.theme=opts.theme||"glassmorphism";style();
  }
  Widget.prototype.open=function(){
    var self=this,back=document.createElement("div");back.className="zk-mono-back";var modal=document.createElement("div");modal.className="zk-mono";
    var head=document.createElement("div");head.className="zk-head";head.innerHTML="<div><b>Envoyer un cadeau</b><div style='font-size:11px;color:#94a3b8;margin-top:3px'>Paiement sécurisé par ZakaPro</div></div>";
    var close=document.createElement("button");close.className="zk-close";close.type="button";close.textContent="×";head.appendChild(close);
    var body=document.createElement("div");body.className="zk-body";modal.appendChild(head);modal.appendChild(body);back.appendChild(modal);document.body.appendChild(back);
    var state={method:"moncash",loading:false,intent:null,error:""};
    function closeIt(){if(back.parentNode)back.parentNode.removeChild(back);}
    close.onclick=closeIt;back.onclick=function(e){if(e.target===back)closeIt();};
    function render(){
      body.innerHTML="";
      if(!state.intent){
        body.innerHTML="<label class='zk-label'>Montant du cadeau (HTG)</label><input class='zk-input' id='zk-amt' type='number' min='1' step='0.01' required>"+
          "<label class='zk-label'>Nom</label><input class='zk-input' id='zk-name' required>"+
          "<label class='zk-label'>Email</label><input class='zk-input' id='zk-email' type='email' required>"+
          "<label class='zk-label'>Téléphone (+509)</label><input class='zk-input' id='zk-phone' inputmode='tel' placeholder='37124589' required>"+
          "<label class='zk-label'>Mode de paiement</label><div class='zk-methods'><button type='button' class='zk-method "+(state.method==="moncash"?"active":"")+"' data-m='moncash'>MonCash</button><button type='button' class='zk-method "+(state.method==="natcash"?"active":"")+"' data-m='natcash'>NatCash</button></div>"+
          "<div class='zk-err'></div><button class='zk-primary' id='zk-go' type='button'>Continuer</button>";
        body.querySelectorAll("[data-m]").forEach(function(b){b.onclick=function(){state.method=b.dataset.m;render();};});
        body.querySelector("#zk-go").onclick=async function(){
          var amount=Number(body.querySelector("#zk-amt").value),name=body.querySelector("#zk-name").value.trim(),email=body.querySelector("#zk-email").value.trim(),phone=body.querySelector("#zk-phone").value.replace(/\D/g,"");
          if(!amount||amount<=0||name.length<2||!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)||!/^\d{8}$/.test(phone)){state.error="Veuillez remplir correctement tous les champs.";render();return;}
          try{
            var r=await fetch(self.apiBase+"/api/apps/"+encodeURIComponent(self.appKey)+"/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"donation_intent",recipientUserId:self.recipientUserId,amount,customerName:name,email,phone})});
            var b=await r.json();if(!r.ok||!b.success)throw new Error(b.error||"Impossible de créer le paiement.");state.intent=b.intent;render();poll();
          }catch(e){state.error=e.message||"Erreur de paiement.";render();}
        };
        if(state.error)body.querySelector(".zk-err").textContent=state.error;
      }else{
        body.innerHTML="<div class='zk-info'>Envoyez exactement <b>"+money(state.intent.total_amount)+" HTG</b> au numéro marchand configuré dans ZakaPro.<br><small>Référence obligatoire : <b>"+esc(state.intent.reference)+"</b></small></div><div class='zk-info'>En attente de la confirmation SMS. Vous pouvez garder cette fenêtre ouverte.</div>";
      }
    }
    async function poll(){
      try{
        var r=await fetch(self.apiBase+"/api/checkout-status?appKey="+encodeURIComponent(self.appKey)+"&reference="+encodeURIComponent(state.intent.reference),{cache:"no-store"});
        var b=await r.json();
        if(b.status==="paid"){body.innerHTML="<div class='zk-info'><div class='zk-ok'>✓ Cadeau confirmé</div><p>"+money(b.amount)+" HTG a été crédité au créateur.</p></div>";global.dispatchEvent(new CustomEvent("zakapro:monetization-confirmed",{detail:b}));setTimeout(closeIt,2200);return;}
        if(b.status==="expired"||b.status==="rejected"){state.error="La demande de paiement a expiré ou a été rejetée.";state.intent=null;render();return;}
      }catch(e){}
      setTimeout(poll,3000);
    }
    render();return {close:closeIt};
  };
  global.ZakaProMonetization={init:function(opts){return new Widget(opts);},version:"1.0.0"};
})(window);
