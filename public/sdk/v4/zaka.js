/* ZakaPro Web SDK v4 — multi-plan buttons */
(function (global) {
  "use strict";

  var DEFAULT_API_BASE = "https://zakapro.vercel.app";

  function asElement(value) {
    if (typeof value === "string") return document.querySelector(value);
    return value && value.nodeType === 1 ? value : null;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>\"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch];
    });
  }

  function ZakaProClient(options) {
    options = options || {};
    this.appKey = String(options.appKey || "").trim();
    this.apiBase = String(options.apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
    this.container = options.container || "#zakapro-plans";
    this.methods = Array.isArray(options.methods) && options.methods.length ? options.methods : ["moncash", "natcash"];
    this.buttonClass = String(options.buttonClass || "zakapro-payment-button");
  }

  ZakaProClient.prototype.plansUrl = function () {
    return this.apiBase + "/api/apps/" + encodeURIComponent(this.appKey) + "/plans";
  };

  ZakaProClient.prototype.loadPlans = async function () {
    if (!this.appKey) throw new Error("ZakaPro: appKey requis.");
    var response = await fetch(this.plansUrl(), { headers: { Accept: "application/json" } });
    var body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error || "Impossible de charger les plans.");
    return Array.isArray(body.plans) ? body.plans : [];
  };

  ZakaProClient.prototype.checkoutUrl = function (plan) {
    return this.apiBase + "/#/hub/" + encodeURIComponent(plan.appId) + "/" + encodeURIComponent(plan.id);
  };

  ZakaProClient.prototype.renderPlans = async function (options) {
    options = options || {};
    var container = asElement(options.container || this.container);
    if (!container) throw new Error("ZakaPro: conteneur introuvable.");

    var plans = await this.loadPlans();
    container.replaceChildren();

    if (!plans.length) {
      container.textContent = options.emptyText || "Aucun plan disponible.";
      return plans;
    }

    var fragment = document.createDocumentFragment();
    plans.forEach(function (plan) {
      var button = document.createElement("a");
      button.className = options.buttonClass || this.buttonClass;
      button.href = this.checkoutUrl(plan);
      button.target = "_blank";
      button.rel = "noopener noreferrer";
      button.dataset.zakaproAppKey = this.appKey;
      button.dataset.zakaproPlanId = plan.id;
      button.dataset.zakaproAmount = String(Number(plan.amount));
      button.dataset.zakaproRecurrence = String(plan.recurrence || "unique");
      button.textContent = (options.labelPrefix || "Peye") + " " + plan.name + " — " + Number(plan.amount).toLocaleString("fr-FR") + " HTG";
      fragment.appendChild(button);
    }, this);

    container.appendChild(fragment);
    return plans;
  };

  ZakaProClient.prototype.getPlans = function () {
    return this.loadPlans();
  };

  ZakaProClient.prototype.open = function (plan) {
    if (!plan || !plan.id || !plan.appId) throw new Error("ZakaPro: plan invalide.");
    global.open(this.checkoutUrl(plan), "_blank", "noopener,noreferrer");
  };

  global.ZakaPro = {
    init: function (options) {
      var client = new ZakaProClient(options);
      if (options && options.autoRender !== false) {
        Promise.resolve().then(function () { return client.renderPlans(options); }).catch(function (error) {
          console.error("[ZakaPro]", error);
        });
      }
      return client;
    },
    version: "4.0.0"
  };
})(window);
