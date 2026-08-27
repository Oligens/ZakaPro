import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, useAuth } from "../lib/auth";
import { PATHS } from "../lib/data";
import { inputCls, labelCls } from "../components/ui";
import { IconAlert, IconArrowLeft, IconCheck, IconEye, IconMail, IconRadio, IconShield, IconSpinner, IconTruck, IconZap } from "../components/icons";

/* ---------- Coquille commune : panneau de marque + formulaire ---------- */

function AuthShell({ children, title, sub }: { children: ReactNode; title: string; sub: string }) {
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque */}
      <div className="relative hidden overflow-hidden border-r border-edge lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-gold/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-cash/10 blur-3xl" />

        <Link to={PATHS.apps} className="relative flex w-fit items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold shadow-glow">
            <span className="font-display text-xl font-bold text-ink">Z</span>
          </span>
          <span className="leading-none">
            <span className="block font-display text-lg font-bold tracking-[0.08em] text-snow">
              ZAKA <span className="text-gold">PRO</span>
            </span>
            <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-fog">Passerelle Mobile Money</span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="font-display text-[34px] font-bold leading-[1.12] text-snow">
            Encaissez en gourdes,
            <br />
            activez <span className="text-gold">en un SMS.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-fog">
            ZakaPro écoute les confirmations MonCash et Natcash sur votre téléphone, signe vos webhooks et
            active les abonnements premium de vos clients — sans intervention.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: IconRadio, color: "#22C55E", label: "Écouteur SMS temps réel", desc: "Parseur regex : montant, ID, +509, source" },
              { icon: IconTruck, color: "#EAB308", label: "Alarme de livraison", desc: "Sirène + alerte urgente dès qu'un paiement exige une livraison" },
              { icon: IconShield, color: "#2563EB", label: "Webhooks HMAC-SHA256", desc: "Événements signés, retries automatiques, isolation par compte" },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.label} className="flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border" style={{ borderColor: f.color + "44", background: f.color + "12", color: f.color }}>
                    <Icon width={18} height={18} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-snow">{f.label}</p>
                    <p className="mt-0.5 text-xs text-fog">{f.desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-[10.5px] font-semibold text-fog2">
          ZakaPro SDK v3.0 <span className="mx-1.5 text-gold">•</span> Port-au-Prince, Haïti
        </p>
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-gold shadow-glow">
              <span className="font-display text-lg font-bold text-ink">Z</span>
            </span>
            <span className="font-display text-base font-bold tracking-[0.08em] text-snow">
              ZAKA <span className="text-gold">PRO</span>
            </span>
          </div>

          <h1 className="font-display text-[26px] font-bold leading-tight text-snow">{title}</h1>
          <p className="mt-1.5 text-[13px] text-fog">{sub}</p>

          <div className="animate-rise mt-6 rounded-xl border border-edge bg-panel p-5 shadow-card sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="animate-rise mt-1.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "#EC4899" }}>
      <IconAlert width={12} height={12} /> {msg}
    </p>
  );
}

function SubmitBtn({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold py-3.5 font-display text-[13px] font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && <IconSpinner width={15} height={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- /login ---------- */

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sendingAgain, setSendingAgain] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (auth.status === "authed") navigate(PATHS.apps, { replace: true });
  }, [auth.status, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Adresse email invalide.");
      setShake((n) => n + 1);
      return;
    }
    if (password.length < 8) {
      setError("Mot de passe : 8 caractères minimum.");
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await auth.login(email, password);
      navigate(PATHS.apps, { replace: true });
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message);
      setErrorCode(apiErr.code);
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const sendAgain = async () => {
    setSendingAgain(true);
    try {
      await auth.sendVerification(email);
      setSentAgain(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setSendingAgain(false);
    }
  };

  return (
    <AuthShell title="Bon retour parmi nous" sub="Connectez-vous pour retrouver vos applications, clés API et paiements.">
      <form key={shake} onSubmit={submit} className={shake > 0 ? "animate-shake" : ""} noValidate>
        {error && (
          <div className="animate-rise mb-4 rounded-lg border px-3.5 py-3 text-xs font-bold leading-relaxed" style={{ borderColor: "#EC489955", background: "#EC489912", color: "#EC4899" }}>
            {error}
            {errorCode === "unverified" && (
              <button type="button" onClick={sendAgain} disabled={sendingAgain} className="mt-2 block cursor-pointer font-extrabold underline underline-offset-2 disabled:opacity-50">
                {sentAgain ? "Email renvoyé — vérifiez votre boîte" : sendingAgain ? "Envoi en cours…" : "Renvoyer l'email de vérification"}
              </button>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="login-email">Email</label>
            <div className="relative">
              <IconMail width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog2" />
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marchand@exemple.ht" className={inputCls + " pl-9"} autoComplete="email" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="login-password">Mot de passe</label>
            <div className="relative">
              <input id="login-password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls + " pr-10"} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 ${showPw ? "text-gold" : "text-fog2 hover:text-snow"}`} aria-label="Afficher le mot de passe">
                <IconEye width={15} height={15} />
              </button>
            </div>
          </div>

          <SubmitBtn busy={busy}>Se connecter</SubmitBtn>
        </div>
      </form>

      <p className="mt-4 text-center text-xs font-semibold text-fog">
        Pas encore de compte ?{" "}
        <Link to={PATHS.register} className="font-extrabold text-gold hover:underline">
          Créer un compte marchand
        </Link>
      </p>

    </AuthShell>
  );
}

/* ---------- /register ---------- */

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [sendingAgain, setSendingAgain] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (auth.status === "authed") navigate(PATHS.apps, { replace: true });
  }, [auth.status, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Nom complet requis (2 caractères min).";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "Adresse email invalide.";
    if (password.length < 8) errs.password = "Mot de passe : 8 caractères minimum.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await auth.register(name, email, password);
      setSent(true);
    } catch (err) {
      const apiErr = err as ApiError;
      setErrors({ form: apiErr.message });
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Vérifiez votre boîte mail" sub="Un e-mail de confirmation vient de vous être envoyé.">
        <div className="grid place-items-center py-4 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-mint/50 bg-mint/12 text-mint">
            <IconMail width={28} height={28} />
          </span>
          <p className="mt-4 text-sm font-bold text-snow">
            Lien envoyé à <span className="text-gold">{email}</span>
          </p>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-fog">
            Cliquez sur le bouton « Confirmer mon email » pour activer votre compte (lien valable 24 h).
            Pensez à vérifier vos courriers indésirables.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={async () => {
                setSendingAgain(true);
                try {
                  await auth.sendVerification(email);
                  setSentAgain(true);
                } finally {
                  setSendingAgain(false);
                }
              }}
              disabled={sendingAgain}
              className="cursor-pointer rounded-lg border border-edge2 bg-panel2 px-4 py-2.5 text-xs font-bold text-fog transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-50"
            >
              {sentAgain ? "Email renvoyé" : sendingAgain ? "Envoi en cours…" : "Renvoyer l'email"}
            </button>
            <Link to={PATHS.login} className="text-xs font-extrabold text-gold hover:underline">
              J'ai confirmé — me connecter
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Créer un compte marchand" sub="Inscription gratuite — un e-mail de vérification vous sera envoyé.">
      <form key={shake} onSubmit={submit} className={shake > 0 ? "animate-shake" : ""} noValidate>
        {errors.form && (
          <div className="animate-rise mb-4 rounded-lg border px-3.5 py-3 text-xs font-bold" style={{ borderColor: "#EC489955", background: "#EC489912", color: "#EC4899" }}>
            {errors.form}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="reg-name">Nom complet</label>
            <input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Marie-Lourdes Joseph" className={inputCls} autoComplete="name" />
            <FieldError msg={errors.name} />
          </div>
          <div>
            <label className={labelCls} htmlFor="reg-email">Email</label>
            <div className="relative">
              <IconMail width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog2" />
              <input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marchand@exemple.ht" className={inputCls + " pl-9"} autoComplete="email" />
            </div>
            <FieldError msg={errors.email} />
          </div>
          <div>
            <label className={labelCls} htmlFor="reg-password">Mot de passe</label>
            <div className="relative">
              <input id="reg-password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" className={inputCls + " pr-10"} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 ${showPw ? "text-gold" : "text-fog2 hover:text-snow"}`} aria-label="Afficher le mot de passe">
                <IconEye width={15} height={15} />
              </button>
            </div>
            <FieldError msg={errors.password} />
            <div className="mt-2 flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${password.length >= (i + 1) * 3 ? (password.length >= 10 ? "bg-mint" : "bg-gold") : "bg-edge"}`} />
              ))}
            </div>
          </div>

          <SubmitBtn busy={busy}>S'inscrire</SubmitBtn>
        </div>
      </form>

      <p className="mt-4 text-center text-xs font-semibold text-fog">
        Déjà inscrit ?{" "}
        <Link to={PATHS.login} className="font-extrabold text-gold hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}

/* ---------- /verify-email?token=… ---------- */

export function VerifyEmailPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [message, setMessage] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setState("error");
      setMessage("Lien de vérification invalide — aucun jeton fourni.");
      return;
    }
    auth
      .verify(token)
      .then((user) => {
        if (!active) return;
        setUserName(user.name);
        setState("ok");
        window.setTimeout(() => navigate(PATHS.apps, { replace: true }), 1600);
      })
      .catch((err: ApiError) => {
        if (!active) return;
        setState("error");
        setMessage(err.message || "Ce lien a expiré ou a déjà été utilisé.");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell title="Vérification de l'email" sub="Confirmation de votre adresse via le jeton sécurisé.">
      {state === "checking" && (
        <div className="grid place-items-center py-10 text-center">
          <span className="relative grid h-14 w-14 place-items-center">
            <span className="absolute inset-0 animate-ring rounded-full border-2 border-gold/60" />
            <IconZap width={22} height={22} className="text-gold" />
          </span>
          <p className="mt-4 text-sm font-bold text-snow">Vérification du jeton en cours…</p>
          <p className="mt-1 text-xs text-fog">Signature et activation de votre session sécurisée.</p>
        </div>
      )}

      {state === "ok" && (
        <div className="animate-pop grid place-items-center py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-mint/50 bg-mint/12 text-mint">
            <IconCheck width={30} height={30} strokeWidth={2.4} />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-snow">Email confirmé !</p>
          <p className="mt-1.5 text-xs text-fog">
            Bienvenue, <span className="font-bold text-gold">{userName}</span> — redirection vers votre espace…
          </p>
          <span className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-edge">
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-gold" />
          </span>
        </div>
      )}

      {state === "error" && (
        <div className="grid place-items-center py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border" style={{ borderColor: "#EC489955", background: "#EC489912", color: "#EC4899" }}>
            <IconAlert width={28} height={28} />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-snow">Vérification impossible</p>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-fog">{message}</p>
          <div className="mt-5 flex gap-2">
            <Link to={PATHS.login} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-edge2 bg-panel2 px-4 py-2.5 text-xs font-bold text-fog transition-colors hover:border-gold/50 hover:text-gold">
              <IconArrowLeft width={13} height={13} /> Retour à la connexion
            </Link>
            <Link to={PATHS.register} className="rounded-lg bg-gold px-4 py-2.5 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft">
              Créer un compte
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
