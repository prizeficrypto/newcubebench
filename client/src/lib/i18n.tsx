import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * A tiny in-repo i18n. English strings are used as the lookup keys, so any
 * string that hasn't been translated yet still renders in real English rather
 * than a blank or a raw key. Only fr/ko/es carry dictionaries; `en` is the
 * identity fallback (`t(key) = DICT[lang]?.[key] ?? key`).
 *
 * No external library: just a context holding the current language, persisted
 * to localStorage, seeded from the browser's language on first visit.
 */

export type Lang = "en" | "fr" | "ko" | "es";

const LANG_KEY = "cb_lang";
const VALID: readonly Lang[] = ["en", "fr", "ko", "es"];

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (VALID as readonly string[]).includes(v);
}

/** localStorage first, then the browser language prefix, then English. */
function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* storage may be unavailable (private mode); fall through to navigator */
  }
  const prefix = (navigator.language || "en").slice(0, 2).toLowerCase();
  if (prefix === "fr" || prefix === "ko" || prefix === "es") return prefix;
  return "en";
}

type I18nState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* persistence is best-effort; the in-memory choice still applies */
    }
  }, []);

  const t = useCallback(
    (key: string): string => DICT[lang]?.[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}

/**
 * Translations. Keyed by the English source string. Cubing terms (Ao5, WCA,
 * 3x3, Megaminx, Pyraminx) are kept as-is where that's the convention. Korean
 * uses neutral UI phrasing (존댓말-neutral). No em dashes anywhere.
 */
export const DICT: Record<Lang, Record<string, string>> = {
  en: {},

  fr: {
    // --- nav ---
    "Competitions": "Compétitions",
    "Settings": "Paramètres",
    "Language": "Langue",
    "Account": "Compte",
    "Email": "E-mail",
    "Plan": "Forfait",
    "Manage plan": "Gérer le forfait",
    "Free": "Gratuit",
    "Pro": "Pro",
    "Pro (free month)": "Pro (mois gratuit)",
    "You're browsing as a guest.": "Vous naviguez en tant qu'invité.",
    "Timer": "Chronomètre",
    "Pricing": "Tarifs",
    "Sign out": "Se déconnecter",
    "Create account": "Créer un compte",
    "Sign in": "Se connecter",
    "Launch App": "Ouvrir l'app",
    "How it works": "Comment ça marche",
    "Why": "Pourquoi",
    "FAQ": "FAQ",

    // --- Home hero ---
    "Competition benchmark for speedcubers": "Le repère de compétition pour speedcubers",
    "Find out where": "Découvrez où",
    "you'd actually place.": "vous vous classeriez vraiment.",
    "Find out where you'd actually place.": "Découvrez où vous vous classeriez vraiment.",
    "Solve the real scrambles from real WCA competitions and see where your average would have landed against the people who were there.":
      "Résolvez les vrais mélanges de vraies compétitions WCA et voyez où votre moyenne se serait classée face à ceux qui étaient là.",
    "See how it works": "Voir comment ça marche",
    "Free to start · Real WCA data · Runs in your browser":
      "Gratuit pour commencer · Vraies données WCA · Dans votre navigateur",

    // --- Home sections ---
    "Your result": "Votre résultat",
    "WCA average of 5": "Moyenne WCA de 5",
    "Three steps to a real answer.": "Trois étapes vers une vraie réponse.",
    "Pick a real competition": "Choisissez une vraie compétition",
    "Solve the same five scrambles": "Résolvez les cinq mêmes mélanges",
    "See where you'd have placed": "Voyez où vous vous seriez classé",
    "The timer": "Le chronomètre",
    "Conventions cubers already know.": "Les conventions que les cubers connaissent déjà.",
    "Try a solve": "Essayez un solve",
    "By the numbers": "En chiffres",
    "One real round.": "Une vraie manche.",
    "Also inside": "Aussi à l'intérieur",
    "Skill Timer": "Skill Timer",
    "Open Skill Timer": "Ouvrir Skill Timer",
    "Fair questions.": "Bonnes questions.",
    "Why we built this": "Pourquoi nous l'avons créé",
    "Make it measurable.": "Rendez-le mesurable.",
    "Product": "Produit",
    "Learn": "Apprendre",
    "Why Cube Bench": "Pourquoi Cube Bench",

    // --- Pricing ---
    "Your account": "Votre compte",
    "Practice free. Benchmark any competition with Pro.":
      "Pratiquez gratuitement. Comparez n'importe quelle compétition avec Pro.",
    "You're on Cube Bench Pro.": "Vous êtes sur Cube Bench Pro.",
    "Your plan": "Votre offre",
    "Cube Bench Pro, free month": "Cube Bench Pro, mois gratuit",
    "Cube Bench Pro": "Cube Bench Pro",
    "Your subscription is active.": "Votre abonnement est actif.",
    "Three featured competitions to simulate": "Trois compétitions en vedette à simuler",
    "Unlimited practice on the regular timer": "Pratique illimitée sur le chronomètre classique",
    "Real scrambles, real fields, exact WCA scoring":
      "Vrais mélanges, vrais participants, notation WCA exacte",
    "Start solving": "Commencer à résoudre",
    "Monthly": "Mensuel",
    "Yearly": "Annuel",
    "Save 40%": "Économisez 40 %",
    "/month": "/mois",
    "/year · $2.08/mo, billed yearly": "/an · 2,08 $/mois, facturé annuellement",
    "The entire WCA competition library": "Toute la bibliothèque de compétitions WCA",
    "Everything in Free": "Tout ce qui est dans Gratuit",
    "Skill Timer, stage-split timing": "Skill Timer, chronométrage par étape",
    "Coming soon": "Bientôt disponible",
    "Upgrade to Pro": "Passer à Pro",
    "Starting…": "Démarrage…",
    "Opening…": "Ouverture…",
    "Manage subscription": "Gérer l'abonnement",
    "You're on Pro. Thanks for the support.": "Vous êtes sur Pro. Merci de votre soutien.",
    "Secure checkout by Stripe · cancel anytime":
      "Paiement sécurisé par Stripe · résiliable à tout moment",
    "Get early access": "Obtenir un accès anticipé",
    "Launching soon · no payment now": "Bientôt disponible · aucun paiement maintenant",
    "Notify me": "Me prévenir",
    "Adding…": "Ajout…",
    "You're on the list. We'll email you when Pro launches.":
      "Vous êtes sur la liste. Nous vous écrirons au lancement de Pro.",
    "Pro is launching soon. No payment is taken now.":
      "Pro arrive bientôt. Aucun paiement n'est pris pour l'instant.",
    "Cancel anytime. Your free trial won't be charged until it ends, and yearly saves 40% over paying monthly.":
      "Résiliable à tout moment. Votre essai gratuit ne sera pas facturé avant sa fin, et l'annuel économise 40 % par rapport au mensuel.",
    "Free for the first 100": "Gratuit pour les 100 premiers",
    "First 100 sign-ups get Cube Bench Pro free for a month. No card.":
      "Les 100 premiers inscrits obtiennent Cube Bench Pro gratuitement pendant un mois. Sans carte.",
    "Create a free account": "Créer un compte gratuit",
    "Questions": "Questions",
    "Can I cancel whenever I want?": "Puis-je résilier quand je veux ?",
    "What happens after the free trial?": "Que se passe-t-il après l'essai gratuit ?",
    "Is my card information safe?": "Mes informations de carte sont-elles en sécurité ?",

    // --- Onboarding ---
    "Step 1 of 2": "Étape 1 sur 2",
    "Step 2 of 2": "Étape 2 sur 2",
    "Create your account": "Créez votre compte",
    "Welcome back": "Bon retour",
    "Two quick steps and you're solving.": "Deux étapes rapides et vous résolvez.",
    "Sign in to pick up where you left off.": "Connectez-vous pour reprendre où vous en étiez.",
    "or": "ou",
    "Your name": "Votre nom",
    "Create a password (8+ characters)": "Créez un mot de passe (8 caractères ou plus)",
    "Password": "Mot de passe",
    "Creating…": "Création…",
    "Signing in…": "Connexion…",
    "Already have an account? Sign in": "Vous avez déjà un compte ? Connectez-vous",
    "New here? Create an account": "Nouveau ici ? Créez un compte",
    "How fast are you?": "Quelle est votre vitesse ?",
    "A rough guess is fine. It just gives your results some context.":
      "Une estimation approximative suffit. C'est juste pour situer vos résultats.",
    "Display name": "Nom affiché",
    "Saving…": "Enregistrement…",
    "Not sure yet? Skip for now": "Pas encore sûr ? Passer pour l'instant",
    "Getting started": "Débutant",
    "Improving": "En progrès",
    "Intermediate": "Intermédiaire",
    "Advanced": "Avancé",
    "Fast": "Rapide",
    "Free to start. Your results stay yours.":
      "Gratuit pour commencer. Vos résultats restent les vôtres.",

    // --- CompetitionPicker ---
    "Step 1": "Étape 1",
    "Pick a competition": "Choisissez une compétition",
    "Search by name, city, or year, then pick an event and any round the competition ran.":
      "Cherchez par nom, ville ou année, puis choisissez une épreuve et une manche de la compétition.",
    "Search all competitions…": "Rechercher toutes les compétitions…",
    "Sign in to search the full WCA library.":
      "Connectez-vous pour explorer toute la bibliothèque WCA.",
    "Featured competitions are free. The full library of past WCA competitions comes with Pro.":
      "Les compétitions en vedette sont gratuites. Toute la bibliothèque des compétitions WCA passées est incluse avec Pro.",
    "No competitions found.": "Aucune compétition trouvée.",
    "Try again": "Réessayer",

    // --- Simulator ---
    "Step 2": "Étape 2",
    "Step 3": "Étape 3",
    "Choose an event": "Choisissez une épreuve",
    "Choose a round": "Choisissez une manche",
    "Mean of 3": "Moyenne de 3",
    "Average of 5": "Moyenne de 5",
    "everyone": "tout le monde",
    "advanced": "qualifiés",
    "Blindfolded and Fewest Moves events aren't supported yet.":
      "Les épreuves à l'aveugle et Fewest Moves ne sont pas encore prises en charge.",
    "You made the cut": "Vous êtes qualifié",
    "Congratulations!": "Félicitations !",
    "Loading scrambles…": "Chargement des mélanges…",
    "Back to results": "Retour aux résultats",
    "Paused round": "Manche en pause",
    "Resume": "Reprendre",
    "Discard": "Abandonner",

    // --- Results ---
    "Compare your real WCA average": "Comparez votre vraie moyenne WCA",
    "Enter your WCA ID to see how your real average compares.":
      "Entrez votre identifiant WCA pour voir comment votre vraie moyenne se compare.",
    "Looking up…": "Recherche…",
    "Compare": "Comparer",
    "Round podium": "Podium de la manche",
    "Where you'd slot in": "Où vous vous placeriez",
    "Real competitors around your average": "Vrais concurrents autour de votre moyenne",
    "You": "Vous",
    "You'd have advanced": "Vous auriez été qualifié",
    "You'd have missed the cut": "Vous n'auriez pas passé le cap",
    "The final": "La finale",
    "Try another competition": "Essayer une autre compétition",

    // --- SkillTimer ---
    "Puzzle": "Puzzle",
    "Regular": "Classique",
    "Skill Timer (stage splits) is a work in progress.":
      "Skill Timer (temps par étape) est en cours de développement.",
    "Soon": "Bientôt",
    "Generating a scramble…": "Génération d'un mélange…",
    "This session": "Cette session",
    "Reset": "Réinitialiser",
    "Solves": "Résolutions",
    "Session best": "Meilleur de la session",
    "Personal best": "Record personnel",
    "Average": "Moyenne",
    "Worst": "Pire",
    "Consistency": "Régularité",
    "Best Ao5": "Meilleur Ao5",
    "Best Ao12": "Meilleur Ao12",
    "Focus on": "À travailler",
    "Session times": "Temps de la session",
    "Recent solves": "Résolutions récentes",

    // --- shared ---
    "Something went wrong.": "Une erreur est survenue.",
  },

  ko: {
    // --- nav ---
    "Competitions": "대회",
    "Settings": "설정",
    "Language": "언어",
    "Account": "계정",
    "Email": "이메일",
    "Plan": "플랜",
    "Manage plan": "플랜 관리",
    "Free": "무료",
    "Pro": "프로",
    "Pro (free month)": "프로 (무료 한 달)",
    "You're browsing as a guest.": "게스트로 둘러보는 중입니다.",
    "Timer": "타이머",
    "Pricing": "요금제",
    "Sign out": "로그아웃",
    "Create account": "계정 만들기",
    "Sign in": "로그인",
    "Launch App": "앱 실행",
    "How it works": "이용 방법",
    "Why": "왜",
    "FAQ": "자주 묻는 질문",

    // --- Home hero ---
    "Competition benchmark for speedcubers": "스피드큐버를 위한 대회 벤치마크",
    "Find out where": "당신이 실제로",
    "you'd actually place.": "몇 위일지 확인하세요.",
    "Find out where you'd actually place.": "당신이 실제로 몇 위일지 확인하세요.",
    "Solve the real scrambles from real WCA competitions and see where your average would have landed against the people who were there.":
      "실제 WCA 대회의 진짜 스크램블을 풀고, 그날 참가한 사람들과 비교해 당신의 평균이 어디쯤일지 확인하세요.",
    "See how it works": "이용 방법 보기",
    "Free to start · Real WCA data · Runs in your browser":
      "무료로 시작 · 실제 WCA 데이터 · 브라우저에서 바로 실행",

    // --- Home sections ---
    "Your result": "내 결과",
    "WCA average of 5": "WCA 5회 평균",
    "Three steps to a real answer.": "진짜 답을 얻는 세 단계.",
    "Pick a real competition": "실제 대회를 선택하세요",
    "Solve the same five scrambles": "동일한 다섯 개의 스크램블을 푸세요",
    "See where you'd have placed": "몇 위였을지 확인하세요",
    "The timer": "타이머",
    "Conventions cubers already know.": "큐버라면 이미 아는 방식 그대로.",
    "Try a solve": "한 번 풀어보기",
    "By the numbers": "숫자로 보기",
    "One real round.": "하나의 실제 라운드.",
    "Also inside": "함께 제공",
    "Skill Timer": "Skill Timer",
    "Open Skill Timer": "Skill Timer 열기",
    "Fair questions.": "궁금한 점들.",
    "Why we built this": "우리가 이걸 만든 이유",
    "Make it measurable.": "측정할 수 있게.",
    "Product": "제품",
    "Learn": "알아보기",
    "Why Cube Bench": "Cube Bench를 쓰는 이유",

    // --- Pricing ---
    "Your account": "내 계정",
    "Practice free. Benchmark any competition with Pro.":
      "무료로 연습하세요. Pro로 어떤 대회든 비교해 보세요.",
    "You're on Cube Bench Pro.": "Cube Bench Pro 이용 중입니다.",
    "Your plan": "내 요금제",
    "Cube Bench Pro, free month": "Cube Bench Pro, 무료 한 달",
    "Cube Bench Pro": "Cube Bench Pro",
    "Your subscription is active.": "구독이 활성화되어 있습니다.",
    "Three featured competitions to simulate": "시뮬레이션 가능한 추천 대회 세 개",
    "Unlimited practice on the regular timer": "일반 타이머로 무제한 연습",
    "Real scrambles, real fields, exact WCA scoring":
      "실제 스크램블, 실제 참가자, 정확한 WCA 채점",
    "Start solving": "풀기 시작",
    "Monthly": "월간",
    "Yearly": "연간",
    "Save 40%": "40% 절약",
    "/month": "/월",
    "/year · $2.08/mo, billed yearly": "/년 · 월 $2.08, 연간 청구",
    "The entire WCA competition library": "전체 WCA 대회 라이브러리",
    "Everything in Free": "무료의 모든 기능",
    "Skill Timer, stage-split timing": "Skill Timer, 단계별 기록",
    "Coming soon": "곧 제공",
    "Upgrade to Pro": "Pro로 업그레이드",
    "Starting…": "시작 중…",
    "Opening…": "여는 중…",
    "Manage subscription": "구독 관리",
    "You're on Pro. Thanks for the support.": "Pro 이용 중입니다. 응원해 주셔서 감사합니다.",
    "Secure checkout by Stripe · cancel anytime":
      "Stripe 보안 결제 · 언제든 해지 가능",
    "Get early access": "얼리 액세스 받기",
    "Launching soon · no payment now": "곧 출시 · 지금 결제 없음",
    "Notify me": "알림 받기",
    "Adding…": "추가 중…",
    "You're on the list. We'll email you when Pro launches.":
      "목록에 등록되었습니다. Pro 출시 시 이메일로 알려드릴게요.",
    "Pro is launching soon. No payment is taken now.":
      "Pro가 곧 출시됩니다. 지금은 결제되지 않습니다.",
    "Cancel anytime. Your free trial won't be charged until it ends, and yearly saves 40% over paying monthly.":
      "언제든 해지할 수 있습니다. 무료 체험은 종료 전까지 청구되지 않으며, 연간 결제는 월간 대비 40% 절약됩니다.",
    "Free for the first 100": "선착순 100명 무료",
    "First 100 sign-ups get Cube Bench Pro free for a month. No card.":
      "선착순 100명은 Cube Bench Pro를 한 달간 무료로 이용할 수 있습니다. 카드 등록 불필요.",
    "Create a free account": "무료 계정 만들기",
    "Questions": "질문",
    "Can I cancel whenever I want?": "원할 때 언제든 해지할 수 있나요?",
    "What happens after the free trial?": "무료 체험이 끝나면 어떻게 되나요?",
    "Is my card information safe?": "카드 정보는 안전한가요?",

    // --- Onboarding ---
    "Step 1 of 2": "1/2 단계",
    "Step 2 of 2": "2/2 단계",
    "Create your account": "계정을 만드세요",
    "Welcome back": "다시 오신 것을 환영합니다",
    "Two quick steps and you're solving.": "간단한 두 단계면 바로 시작합니다.",
    "Sign in to pick up where you left off.": "로그인하고 이어서 하세요.",
    "or": "또는",
    "Your name": "이름",
    "Create a password (8+ characters)": "비밀번호를 만드세요 (8자 이상)",
    "Password": "비밀번호",
    "Creating…": "생성 중…",
    "Signing in…": "로그인 중…",
    "Already have an account? Sign in": "이미 계정이 있으신가요? 로그인",
    "New here? Create an account": "처음이신가요? 계정 만들기",
    "How fast are you?": "얼마나 빠르신가요?",
    "A rough guess is fine. It just gives your results some context.":
      "대략적인 추정이면 충분합니다. 결과에 맥락을 더해 줄 뿐이에요.",
    "Display name": "표시 이름",
    "Saving…": "저장 중…",
    "Not sure yet? Skip for now": "아직 잘 모르겠나요? 나중에 하기",
    "Getting started": "입문",
    "Improving": "향상 중",
    "Intermediate": "중급",
    "Advanced": "상급",
    "Fast": "빠름",
    "Free to start. Your results stay yours.":
      "무료로 시작하세요. 결과는 당신의 것입니다.",

    // --- CompetitionPicker ---
    "Step 1": "1단계",
    "Pick a competition": "대회를 선택하세요",
    "Search by name, city, or year, then pick an event and any round the competition ran.":
      "이름, 도시, 연도로 검색한 뒤 종목과 대회가 진행한 라운드를 선택하세요.",
    "Search all competitions…": "모든 대회 검색…",
    "Sign in to search the full WCA library.":
      "로그인하면 전체 WCA 라이브러리를 검색할 수 있습니다.",
    "Featured competitions are free. The full library of past WCA competitions comes with Pro.":
      "추천 대회는 무료입니다. 지난 WCA 대회 전체 라이브러리는 Pro에서 제공됩니다.",
    "No competitions found.": "대회를 찾을 수 없습니다.",
    "Try again": "다시 시도",

    // --- Simulator ---
    "Step 2": "2단계",
    "Step 3": "3단계",
    "Choose an event": "종목을 선택하세요",
    "Choose a round": "라운드를 선택하세요",
    "Mean of 3": "3회 평균",
    "Average of 5": "5회 평균",
    "everyone": "전원",
    "advanced": "진출자",
    "Blindfolded and Fewest Moves events aren't supported yet.":
      "블라인드폴드와 Fewest Moves 종목은 아직 지원되지 않습니다.",
    "You made the cut": "컷을 통과했습니다",
    "Congratulations!": "축하합니다!",
    "Loading scrambles…": "스크램블 불러오는 중…",
    "Back to results": "결과로 돌아가기",
    "Paused round": "일시정지된 라운드",
    "Resume": "이어서 하기",
    "Discard": "삭제",

    // --- Results ---
    "Compare your real WCA average": "실제 WCA 평균과 비교하기",
    "Enter your WCA ID to see how your real average compares.":
      "WCA ID를 입력하면 실제 평균이 어떻게 비교되는지 볼 수 있습니다.",
    "Looking up…": "조회 중…",
    "Compare": "비교",
    "Round podium": "라운드 시상대",
    "Where you'd slot in": "당신의 순위 위치",
    "Real competitors around your average": "당신의 평균 주변의 실제 참가자들",
    "You": "나",
    "You'd have advanced": "진출했을 것입니다",
    "You'd have missed the cut": "컷을 넘지 못했을 것입니다",
    "The final": "결승",
    "Try another competition": "다른 대회 시도하기",

    // --- SkillTimer ---
    "Puzzle": "퍼즐",
    "Regular": "일반",
    "Skill Timer (stage splits) is a work in progress.":
      "Skill Timer(단계별 기록)는 개발 중입니다.",
    "Soon": "곧",
    "Generating a scramble…": "스크램블 생성 중…",
    "This session": "이번 세션",
    "Reset": "초기화",
    "Solves": "풀이 수",
    "Session best": "세션 최고 기록",
    "Personal best": "개인 최고 기록",
    "Average": "평균",
    "Worst": "최저 기록",
    "Consistency": "일관성",
    "Best Ao5": "최고 Ao5",
    "Best Ao12": "최고 Ao12",
    "Focus on": "집중할 부분",
    "Session times": "세션 기록",
    "Recent solves": "최근 풀이",

    // --- shared ---
    "Something went wrong.": "문제가 발생했습니다.",
  },

  es: {
    // --- nav ---
    "Competitions": "Competiciones",
    "Settings": "Ajustes",
    "Language": "Idioma",
    "Account": "Cuenta",
    "Email": "Correo",
    "Plan": "Plan",
    "Manage plan": "Gestionar plan",
    "Free": "Gratis",
    "Pro": "Pro",
    "Pro (free month)": "Pro (mes gratis)",
    "You're browsing as a guest.": "Estás navegando como invitado.",
    "Timer": "Cronómetro",
    "Pricing": "Precios",
    "Sign out": "Cerrar sesión",
    "Create account": "Crear cuenta",
    "Sign in": "Iniciar sesión",
    "Launch App": "Abrir la app",
    "How it works": "Cómo funciona",
    "Why": "Por qué",
    "FAQ": "Preguntas frecuentes",

    // --- Home hero ---
    "Competition benchmark for speedcubers": "El referente de competición para speedcubers",
    "Find out where": "Descubre en qué",
    "you'd actually place.": "puesto quedarías de verdad.",
    "Find out where you'd actually place.": "Descubre en qué puesto quedarías de verdad.",
    "Solve the real scrambles from real WCA competitions and see where your average would have landed against the people who were there.":
      "Resuelve los mezclados reales de competiciones WCA reales y descubre dónde habría quedado tu media frente a quienes estuvieron allí.",
    "See how it works": "Ver cómo funciona",
    "Free to start · Real WCA data · Runs in your browser":
      "Gratis para empezar · Datos reales de la WCA · Funciona en tu navegador",

    // --- Home sections ---
    "Your result": "Tu resultado",
    "WCA average of 5": "Media WCA de 5",
    "Three steps to a real answer.": "Tres pasos hacia una respuesta real.",
    "Pick a real competition": "Elige una competición real",
    "Solve the same five scrambles": "Resuelve los mismos cinco mezclados",
    "See where you'd have placed": "Descubre en qué puesto habrías quedado",
    "The timer": "El cronómetro",
    "Conventions cubers already know.": "Las convenciones que los cuberos ya conocen.",
    "Try a solve": "Prueba un solve",
    "By the numbers": "En cifras",
    "One real round.": "Una ronda real.",
    "Also inside": "También incluido",
    "Skill Timer": "Skill Timer",
    "Open Skill Timer": "Abrir Skill Timer",
    "Fair questions.": "Preguntas justas.",
    "Why we built this": "Por qué lo creamos",
    "Make it measurable.": "Hazlo medible.",
    "Product": "Producto",
    "Learn": "Aprender",
    "Why Cube Bench": "Por qué Cube Bench",

    // --- Pricing ---
    "Your account": "Tu cuenta",
    "Practice free. Benchmark any competition with Pro.":
      "Practica gratis. Compárate en cualquier competición con Pro.",
    "You're on Cube Bench Pro.": "Estás en Cube Bench Pro.",
    "Your plan": "Tu plan",
    "Cube Bench Pro, free month": "Cube Bench Pro, mes gratis",
    "Cube Bench Pro": "Cube Bench Pro",
    "Your subscription is active.": "Tu suscripción está activa.",
    "Three featured competitions to simulate": "Tres competiciones destacadas para simular",
    "Unlimited practice on the regular timer": "Práctica ilimitada en el cronómetro normal",
    "Real scrambles, real fields, exact WCA scoring":
      "Mezclados reales, participantes reales, puntuación WCA exacta",
    "Start solving": "Empezar a resolver",
    "Monthly": "Mensual",
    "Yearly": "Anual",
    "Save 40%": "Ahorra un 40 %",
    "/month": "/mes",
    "/year · $2.08/mo, billed yearly": "/año · 2,08 $/mes, facturado anualmente",
    "The entire WCA competition library": "Toda la biblioteca de competiciones WCA",
    "Everything in Free": "Todo lo del plan Gratis",
    "Skill Timer, stage-split timing": "Skill Timer, tiempos por etapa",
    "Coming soon": "Próximamente",
    "Upgrade to Pro": "Pasar a Pro",
    "Starting…": "Iniciando…",
    "Opening…": "Abriendo…",
    "Manage subscription": "Gestionar suscripción",
    "You're on Pro. Thanks for the support.": "Estás en Pro. Gracias por tu apoyo.",
    "Secure checkout by Stripe · cancel anytime":
      "Pago seguro con Stripe · cancela cuando quieras",
    "Get early access": "Consigue acceso anticipado",
    "Launching soon · no payment now": "Próximamente · sin pago ahora",
    "Notify me": "Avísame",
    "Adding…": "Añadiendo…",
    "You're on the list. We'll email you when Pro launches.":
      "Estás en la lista. Te escribiremos cuando se lance Pro.",
    "Pro is launching soon. No payment is taken now.":
      "Pro se lanza pronto. No se cobra nada ahora.",
    "Cancel anytime. Your free trial won't be charged until it ends, and yearly saves 40% over paying monthly.":
      "Cancela cuando quieras. Tu prueba gratis no se cobra hasta que termina, y el plan anual ahorra un 40 % frente al mensual.",
    "Free for the first 100": "Gratis para los primeros 100",
    "First 100 sign-ups get Cube Bench Pro free for a month. No card.":
      "Los primeros 100 registrados consiguen Cube Bench Pro gratis durante un mes. Sin tarjeta.",
    "Create a free account": "Crear una cuenta gratis",
    "Questions": "Preguntas",
    "Can I cancel whenever I want?": "¿Puedo cancelar cuando quiera?",
    "What happens after the free trial?": "¿Qué pasa después de la prueba gratis?",
    "Is my card information safe?": "¿Está segura la información de mi tarjeta?",

    // --- Onboarding ---
    "Step 1 of 2": "Paso 1 de 2",
    "Step 2 of 2": "Paso 2 de 2",
    "Create your account": "Crea tu cuenta",
    "Welcome back": "Bienvenido de nuevo",
    "Two quick steps and you're solving.": "Dos pasos rápidos y a resolver.",
    "Sign in to pick up where you left off.": "Inicia sesión para seguir donde lo dejaste.",
    "or": "o",
    "Your name": "Tu nombre",
    "Create a password (8+ characters)": "Crea una contraseña (8 caracteres o más)",
    "Password": "Contraseña",
    "Creating…": "Creando…",
    "Signing in…": "Iniciando sesión…",
    "Already have an account? Sign in": "¿Ya tienes cuenta? Inicia sesión",
    "New here? Create an account": "¿Eres nuevo? Crea una cuenta",
    "How fast are you?": "¿Qué tan rápido eres?",
    "A rough guess is fine. It just gives your results some context.":
      "Una estimación aproximada vale. Solo da contexto a tus resultados.",
    "Display name": "Nombre visible",
    "Saving…": "Guardando…",
    "Not sure yet? Skip for now": "¿No estás seguro aún? Sáltalo por ahora",
    "Getting started": "Principiante",
    "Improving": "Mejorando",
    "Intermediate": "Intermedio",
    "Advanced": "Avanzado",
    "Fast": "Rápido",
    "Free to start. Your results stay yours.":
      "Gratis para empezar. Tus resultados son tuyos.",

    // --- CompetitionPicker ---
    "Step 1": "Paso 1",
    "Pick a competition": "Elige una competición",
    "Search by name, city, or year, then pick an event and any round the competition ran.":
      "Busca por nombre, ciudad o año, luego elige una prueba y cualquier ronda que se disputara.",
    "Search all competitions…": "Buscar todas las competiciones…",
    "Sign in to search the full WCA library.":
      "Inicia sesión para buscar en toda la biblioteca de la WCA.",
    "Featured competitions are free. The full library of past WCA competitions comes with Pro.":
      "Las competiciones destacadas son gratis. Toda la biblioteca de competiciones WCA pasadas viene con Pro.",
    "No competitions found.": "No se encontraron competiciones.",
    "Try again": "Reintentar",

    // --- Simulator ---
    "Step 2": "Paso 2",
    "Step 3": "Paso 3",
    "Choose an event": "Elige una prueba",
    "Choose a round": "Elige una ronda",
    "Mean of 3": "Media de 3",
    "Average of 5": "Media de 5",
    "everyone": "todos",
    "advanced": "clasificados",
    "Blindfolded and Fewest Moves events aren't supported yet.":
      "Las pruebas a ciegas y Fewest Moves aún no son compatibles.",
    "You made the cut": "Has pasado el corte",
    "Congratulations!": "¡Felicidades!",
    "Loading scrambles…": "Cargando mezclados…",
    "Back to results": "Volver a los resultados",
    "Paused round": "Ronda en pausa",
    "Resume": "Reanudar",
    "Discard": "Descartar",

    // --- Results ---
    "Compare your real WCA average": "Compara tu media WCA real",
    "Enter your WCA ID to see how your real average compares.":
      "Introduce tu ID de la WCA para ver cómo se compara tu media real.",
    "Looking up…": "Buscando…",
    "Compare": "Comparar",
    "Round podium": "Podio de la ronda",
    "Where you'd slot in": "Dónde te situarías",
    "Real competitors around your average": "Competidores reales cerca de tu media",
    "You": "Tú",
    "You'd have advanced": "Habrías avanzado",
    "You'd have missed the cut": "No habrías pasado el corte",
    "The final": "La final",
    "Try another competition": "Probar otra competición",

    // --- SkillTimer ---
    "Puzzle": "Puzzle",
    "Regular": "Normal",
    "Skill Timer (stage splits) is a work in progress.":
      "Skill Timer (tiempos por etapa) está en desarrollo.",
    "Soon": "Pronto",
    "Generating a scramble…": "Generando un mezclado…",
    "This session": "Esta sesión",
    "Reset": "Reiniciar",
    "Solves": "Solves",
    "Session best": "Mejor de la sesión",
    "Personal best": "Récord personal",
    "Average": "Media",
    "Worst": "Peor",
    "Consistency": "Consistencia",
    "Best Ao5": "Mejor Ao5",
    "Best Ao12": "Mejor Ao12",
    "Focus on": "Céntrate en",
    "Session times": "Tiempos de la sesión",
    "Recent solves": "Solves recientes",

    // --- shared ---
    "Something went wrong.": "Algo salió mal.",
  },
};
