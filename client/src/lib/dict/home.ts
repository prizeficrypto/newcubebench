/**
 * Partial translation dictionary (merged into the main DICT in i18n.tsx).
 * Keyed by the English source string. Fill fr/ko/es. Cubing terms
 * (Ao5, WCA, 3x3, Megaminx, Pyraminx) stay as-is. No em dashes.
 */
export const dict: Record<"fr" | "ko" | "es", Record<string, string>> = {
  fr: {
    // ---- Home: hero + CTAs ----
    "Competition benchmark for speedcubers":
      "Le comparateur de compétition pour les speedcubers",
    "Find out where you'd actually place.":
      "Découvrez où vous vous classeriez vraiment.",
    "Find out where": "Découvrez où vous",
    "you'd actually place.": "vous classeriez vraiment.",
    "Solve the real scrambles from real WCA competitions and see where your average would have landed against the people who were there.":
      "Résolvez les vrais mélanges de vraies compétitions WCA et voyez où votre moyenne se serait classée face aux personnes présentes ce jour-là.",
    "Launch App": "Lancer l'app",
    "See how it works": "Voir comment ça marche",
    "Free to start · Real WCA data · Runs in your browser":
      "Gratuit au départ · Vraies données WCA · Fonctionne dans votre navigateur",

    // ---- Showcase ----
    "Your result": "Votre résultat",
    "WCA average of 5": "Moyenne WCA de 5",
    "Would have placed": "Se serait classé",
    of: "sur",
    at: "à",
    "Where your time went": "Où est passé votre temps",

    // ---- Marquee tail ----
    "…and thousands more in the archive":
      "…et des milliers d'autres dans les archives",

    // ---- Fact strip ----
    "The exact scrambles": "Les mélanges exacts",
    "The five a round actually used, straight from the WCA archive.":
      "Les cinq réellement utilisés lors d'un tour, directement issus des archives WCA.",
    "The real field": "Le vrai plateau",
    "Ranked against every competitor who showed up that day.":
      "Classé face à chaque concurrent présent ce jour-là.",
    "Scored the WCA way": "Noté à la manière WCA",
    "Ao5 with best and worst dropped, penalties included.":
      "Ao5 avec le meilleur et le pire écartés, pénalités incluses.",

    // ---- How it works ----
    "How it works": "Comment ça marche",
    "Three steps to a real answer.": "Trois étapes vers une vraie réponse.",
    "Pick a real competition": "Choisissez une vraie compétition",
    "Any competition in the library, first round through the final. Three featured championships are free.":
      "N'importe quelle compétition de la bibliothèque, du premier tour à la finale. Trois championnats en vedette sont gratuits.",
    "Solve the same five scrambles": "Résolvez les cinq mêmes mélanges",
    "Hold-to-start timer, 15 seconds of WCA inspection, and a +2 if you start late. Just like the real round.":
      "Chronomètre à maintien pour démarrer, 15 secondes d'inspection WCA, et un +2 si vous partez en retard. Comme lors du vrai tour.",
    "against the real field": "face au vrai plateau",
    "See where you'd have placed": "Voyez où vous vous seriez classé",
    "Your Ao5 sits in the official standings. The winner that day averaged 5.88.":
      "Votre Ao5 s'inscrit dans le classement officiel. Le vainqueur ce jour-là a réalisé une moyenne de 5,88.",

    // ---- Timer band ----
    "Solve 3 of 5": "Résolution 3 sur 5",
    "Any key to stop": "N'importe quelle touche pour arrêter",
    "The timer": "Le chronomètre",
    "Conventions cubers already know.":
      "Des conventions que les cubers connaissent déjà.",
    "Hold space until it arms, release to start, and any key stops. Fifteen seconds of WCA inspection runs before every solve, and a late start costs the same +2 it would on the day.":
      "Maintenez la barre d'espace jusqu'à l'armement, relâchez pour démarrer, et n'importe quelle touche arrête. Quinze secondes d'inspection WCA s'écoulent avant chaque résolution, et un départ tardif coûte le même +2 que le jour J.",
    "Mis-taps aren't fatal either. Every solve can be redone, marked +2, or flagged DNF before it counts, and leaving a round pauses it for later.":
      "Les fausses manipulations ne sont pas fatales non plus. Chaque résolution peut être refaite, marquée +2 ou signalée DNF avant d'être comptée, et quitter un tour le met en pause pour plus tard.",
    "Try a solve": "Essayer une résolution",

    // ---- Why ----
    "A regular timer": "Un chronomètre ordinaire",
    "Records your times, draws a graph, and leaves the real question open: would that average survive an actual round?":
      "Enregistre vos temps, trace un graphique et laisse la vraie question en suspens : cette moyenne tiendrait-elle lors d'un vrai tour ?",
    "Puts your average of 5 next to the official results of a real WCA round, on the exact scrambles those competitors solved, scored the way the round was scored.":
      "Place votre moyenne de 5 à côté des résultats officiels d'un vrai tour WCA, sur les mélanges exacts que ces concurrents ont résolus, notée comme le tour l'a été.",

    // ---- Numbers ----
    "By the numbers": "En chiffres",
    "One real round.": "Un vrai tour.",
    "competitors in the field you're ranked against":
      "concurrents dans le plateau face auquel vous êtes classé",
    "made the cut for the second round":
      "ont passé le cap du deuxième tour",
    "the winning average, in seconds": "la moyenne gagnante, en secondes",
    "First round of 3×3 at the WCA World Championship 2019, Melbourne.":
      "Premier tour du 3×3 au WCA World Championship 2019, Melbourne.",

    // ---- Skill band ----
    "Also inside": "Aussi à l'intérieur",
    "Skill Timer": "Skill Timer",
    "Practice with stage splits: one tap at the end of Cross, F2L, OLL, and PLL. Session by session, see exactly which stage is eating your time, and whether the work is paying off.":
      "Entraînez-vous avec des temps intermédiaires par étape : une pression à la fin de la Cross, du F2L, de l'OLL et du PLL. Session après session, voyez exactement quelle étape dévore votre temps, et si le travail porte ses fruits.",
    "Open Skill Timer": "Ouvrir Skill Timer",
    "Focus on": "Se concentrer sur",
    "Nearly half this session went to F2L. That's where practice pays off first.":
      "Près de la moitié de cette session est passée dans le F2L. C'est là que l'entraînement paie en premier.",

    // ---- FAQ ----
    FAQ: "FAQ",
    "Fair questions.": "Questions légitimes.",
    "Is the scoring really WCA-accurate?":
      "Le calcul des scores est-il vraiment conforme à la WCA ?",
    "Yes. Averages drop your single best and worst solve and take the mean of the middle three, quantized to centiseconds the way official results are. Late inspection costs a +2, and DNFs follow the official rules: one counts as your worst solve, two make the whole average a DNF.":
      "Oui. Les moyennes écartent votre meilleure et votre pire résolution, puis prennent la moyenne des trois du milieu, arrondie au centième comme le sont les résultats officiels. Une inspection tardive coûte un +2, et les DNF suivent les règles officielles : un compte comme votre pire résolution, deux transforment toute la moyenne en DNF.",
    "Where do the scrambles and results come from?":
      "D'où viennent les mélanges et les résultats ?",
    "From the WCA's public API. You solve the exact scrambles a round used, and your average is placed against that round's official results. Cube Bench isn't affiliated with the WCA; it builds on the data they publish.":
      "De l'API publique de la WCA. Vous résolvez les mélanges exacts utilisés lors d'un tour, et votre moyenne est comparée aux résultats officiels de ce tour. Cube Bench n'est pas affilié à la WCA ; il s'appuie sur les données qu'elle publie.",
    "Do I need an account?": "Ai-je besoin d'un compte ?",
    "Yes, and it's free. Your account holds your speed profile and, if you upgrade, your Pro plan. Sign up with an email and password, or with Google.":
      "Oui, et c'est gratuit. Votre compte conserve votre profil de vitesse et, si vous passez à la version supérieure, votre abonnement Pro. Inscrivez-vous avec un e-mail et un mot de passe, ou avec Google.",
    "What does Pro add?": "Qu'apporte Pro ?",
    "The full library of past WCA competitions, plus skill analytics that follow your stage splits across sessions. It's $3.49 a month (or $25 a year), with a 3-day free trial, and you can cancel anytime.":
      "La bibliothèque complète des anciennes compétitions WCA, ainsi que des analyses de compétences qui suivent vos temps par étape au fil des sessions. C'est 3,49 $ par mois (ou 25 $ par an), avec un essai gratuit de 3 jours, et vous pouvez annuler à tout moment.",
    "What happens if I mis-tap mid-solve?":
      "Que se passe-t-il si je me trompe de touche en pleine résolution ?",
    "After every solve you can redo it on the same scramble, mark a +2, or flag it as a DNF before it counts. Leaving a round pauses it, and you can resume from the competition list.":
      "Après chaque résolution, vous pouvez la refaire sur le même mélange, marquer un +2 ou la signaler comme DNF avant qu'elle ne compte. Quitter un tour le met en pause, et vous pouvez le reprendre depuis la liste des compétitions.",

    // ---- Claim ----
    "Why we built this": "Pourquoi nous avons créé ceci",
    "Make it measurable.": "Rendez-le mesurable.",
    "Cube timer websites haven't changed in years, and none of them answer the question everyone practicing at home has: am I ready for a real competition? Cube Bench turns that into a measurement. Solve a real round, see where you'd have landed, and sign up for your first competition because the numbers say you're ready.":
      "Les sites de chronométrage de cube n'ont pas changé depuis des années, et aucun ne répond à la question que tout le monde se pose en s'entraînant chez soi : suis-je prêt pour une vraie compétition ? Cube Bench en fait une mesure. Résolvez un vrai tour, voyez où vous vous seriez classé, et inscrivez-vous à votre première compétition parce que les chiffres disent que vous êtes prêt.",

    // ---- Footer ----
    "The competition benchmark for speedcubers.":
      "Le comparateur de compétition pour les speedcubers.",
    Product: "Produit",
    Pricing: "Tarifs",
    Learn: "En savoir plus",
    "Why Cube Bench": "Pourquoi Cube Bench",
    "Built on the WCA's public API. Not affiliated with the World Cube Association.":
      "Construit sur l'API publique de la WCA. Non affilié à la World Cube Association.",

    // ---- Onboarding ----
    "Free to start. Your results stay yours.":
      "Gratuit au départ. Vos résultats vous appartiennent.",
    "Step 1 of 2": "Étape 1 sur 2",
    "Step 2 of 2": "Étape 2 sur 2",
    "Sign in": "Se connecter",
    "Create your account": "Créez votre compte",
    "Welcome back": "Bon retour",
    "Two quick steps and you're solving.":
      "Deux étapes rapides et vous résolvez.",
    "Sign in to pick up where you left off.":
      "Connectez-vous pour reprendre là où vous en étiez.",
    or: "ou",
    "Your name": "Votre nom",
    "Create a password (8+ characters)":
      "Créez un mot de passe (8 caractères ou plus)",
    Password: "Mot de passe",
    "Creating…": "Création…",
    "Signing in…": "Connexion…",
    "Create account": "Créer un compte",
    "Already have an account? Sign in":
      "Vous avez déjà un compte ? Connectez-vous",
    "New here? Create an account": "Nouveau ici ? Créez un compte",
    "How fast are you?": "À quelle vitesse allez-vous ?",
    "A rough guess is fine. It just gives your results some context.":
      "Une estimation approximative suffit. Cela donne simplement un peu de contexte à vos résultats.",
    "Display name": "Nom affiché",
    "Saving…": "Enregistrement…",
    "Start solving": "Commencer à résoudre",
    "Not sure yet? Skip for now": "Pas encore sûr ? Passer pour l'instant",
    "Getting started": "Débutant",
    Improving: "En progrès",
    Intermediate: "Intermédiaire",
    Advanced: "Avancé",
    Fast: "Rapide",
    "Something went wrong.": "Une erreur s'est produite.",

    // ---- Pricing: launch offer ----
    "Free right now": "Gratuit dès maintenant",
    "Launch offer": "Offre de lancement",
    "Everyone who signs up now gets Cube Bench Pro completely free. No card.":
      "Toute personne qui s'inscrit maintenant obtient Cube Bench Pro entièrement gratuitement. Sans carte.",
    "Free through {date}.": "Gratuit jusqu'au {date}.",
  },

  ko: {
    // ---- Home: hero + CTAs ----
    "Competition benchmark for speedcubers":
      "스피드큐버를 위한 대회 벤치마크",
    "Find out where you'd actually place.":
      "당신이 실제로 몇 등을 할지 알아보세요.",
    "Find out where": "당신이 실제로",
    "you'd actually place.": "몇 등을 할지 알아보세요.",
    "Solve the real scrambles from real WCA competitions and see where your average would have landed against the people who were there.":
      "실제 WCA 대회의 진짜 스크램블을 풀고, 그날 참가했던 사람들과 비교해 당신의 평균이 어디쯤 놓였을지 확인하세요.",
    "Launch App": "앱 실행",
    "See how it works": "작동 방식 보기",
    "Free to start · Real WCA data · Runs in your browser":
      "무료로 시작 · 실제 WCA 데이터 · 브라우저에서 실행",

    // ---- Showcase ----
    "Your result": "당신의 결과",
    "WCA average of 5": "5회 WCA 평균",
    "Would have placed": "다음 순위였을 것입니다",
    of: "중",
    at: "대회:",
    "Where your time went": "시간이 어디에 쓰였는지",

    // ---- Marquee tail ----
    "…and thousands more in the archive":
      "…그리고 아카이브에 수천 개가 더 있습니다",

    // ---- Fact strip ----
    "The exact scrambles": "바로 그 스크램블",
    "The five a round actually used, straight from the WCA archive.":
      "한 라운드에서 실제로 사용된 다섯 개를 WCA 아카이브에서 그대로 가져옵니다.",
    "The real field": "진짜 참가자들",
    "Ranked against every competitor who showed up that day.":
      "그날 참가한 모든 경쟁자와 비교해 순위를 매깁니다.",
    "Scored the WCA way": "WCA 방식으로 채점",
    "Ao5 with best and worst dropped, penalties included.":
      "최고와 최저를 제외한 Ao5, 페널티 포함.",

    // ---- How it works ----
    "How it works": "작동 방식",
    "Three steps to a real answer.": "진짜 답까지 세 단계.",
    "Pick a real competition": "실제 대회를 고르세요",
    "Any competition in the library, first round through the final. Three featured championships are free.":
      "라이브러리에 있는 어떤 대회든, 예선부터 결선까지. 추천 대회 세 개는 무료입니다.",
    "Solve the same five scrambles": "같은 다섯 개의 스크램블을 푸세요",
    "Hold-to-start timer, 15 seconds of WCA inspection, and a +2 if you start late. Just like the real round.":
      "눌러서 시작하는 타이머, 15초의 WCA 인스펙션, 늦게 시작하면 +2. 실제 라운드와 똑같습니다.",
    "against the real field": "진짜 참가자들과 비교해",
    "See where you'd have placed": "당신이 몇 등을 했을지 확인하세요",
    "Your Ao5 sits in the official standings. The winner that day averaged 5.88.":
      "당신의 Ao5가 공식 순위표에 놓입니다. 그날 우승자의 평균은 5.88이었습니다.",

    // ---- Timer band ----
    "Solve 3 of 5": "5회 중 3번째",
    "Any key to stop": "아무 키나 눌러 정지",
    "The timer": "타이머",
    "Conventions cubers already know.": "큐버가 이미 아는 방식 그대로.",
    "Hold space until it arms, release to start, and any key stops. Fifteen seconds of WCA inspection runs before every solve, and a late start costs the same +2 it would on the day.":
      "준비될 때까지 스페이스바를 누르고, 떼면 시작하며, 아무 키나 누르면 멈춥니다. 매 풀이 전에 15초의 WCA 인스펙션이 진행되고, 늦게 시작하면 대회 당일과 똑같이 +2가 부과됩니다.",
    "Mis-taps aren't fatal either. Every solve can be redone, marked +2, or flagged DNF before it counts, and leaving a round pauses it for later.":
      "잘못 눌러도 치명적이지 않습니다. 모든 풀이는 집계되기 전에 다시 하거나, +2로 표시하거나, DNF로 지정할 수 있고, 라운드를 나가면 나중을 위해 일시정지됩니다.",
    "Try a solve": "한 번 풀어 보기",

    // ---- Why ----
    "A regular timer": "일반 타이머",
    "Records your times, draws a graph, and leaves the real question open: would that average survive an actual round?":
      "기록을 남기고 그래프를 그리지만, 정작 중요한 질문은 남겨둡니다. 그 평균이 실제 라운드에서 통할까요?",
    "Puts your average of 5 next to the official results of a real WCA round, on the exact scrambles those competitors solved, scored the way the round was scored.":
      "당신의 5회 평균을 실제 WCA 라운드의 공식 결과 옆에 놓습니다. 그 경쟁자들이 푼 바로 그 스크램블로, 그 라운드가 채점된 방식 그대로.",

    // ---- Numbers ----
    "By the numbers": "숫자로 보기",
    "One real round.": "실제 라운드 하나.",
    "competitors in the field you're ranked against":
      "당신이 순위를 겨루는 참가자 수",
    "made the cut for the second round": "2라운드에 진출한 인원",
    "the winning average, in seconds": "우승 평균, 초 단위",
    "First round of 3×3 at the WCA World Championship 2019, Melbourne.":
      "WCA World Championship 2019 멜버른, 3×3 예선.",

    // ---- Skill band ----
    "Also inside": "이것도 함께",
    "Skill Timer": "Skill Timer",
    "Practice with stage splits: one tap at the end of Cross, F2L, OLL, and PLL. Session by session, see exactly which stage is eating your time, and whether the work is paying off.":
      "단계별 스플릿으로 연습하세요. Cross, F2L, OLL, PLL이 끝날 때마다 한 번씩 탭. 세션마다 어느 단계가 시간을 잡아먹는지, 그리고 노력이 성과로 이어지는지 정확히 확인하세요.",
    "Open Skill Timer": "Skill Timer 열기",
    "Focus on": "집중할 부분",
    "Nearly half this session went to F2L. That's where practice pays off first.":
      "이번 세션의 거의 절반이 F2L에 쓰였습니다. 바로 그곳에서 연습 효과가 가장 먼저 나타납니다.",

    // ---- FAQ ----
    FAQ: "자주 묻는 질문",
    "Fair questions.": "당연한 궁금증.",
    "Is the scoring really WCA-accurate?":
      "채점이 정말 WCA 방식과 정확히 같나요?",
    "Yes. Averages drop your single best and worst solve and take the mean of the middle three, quantized to centiseconds the way official results are. Late inspection costs a +2, and DNFs follow the official rules: one counts as your worst solve, two make the whole average a DNF.":
      "네. 평균은 가장 좋은 풀이와 가장 나쁜 풀이를 하나씩 제외하고 가운데 세 개의 평균을 내며, 공식 결과와 똑같이 100분의 1초 단위로 처리됩니다. 인스펙션을 늦게 시작하면 +2가 부과되고, DNF는 공식 규칙을 따릅니다. 하나는 가장 나쁜 풀이로 간주되고, 두 개면 평균 전체가 DNF가 됩니다.",
    "Where do the scrambles and results come from?":
      "스크램블과 결과는 어디에서 오나요?",
    "From the WCA's public API. You solve the exact scrambles a round used, and your average is placed against that round's official results. Cube Bench isn't affiliated with the WCA; it builds on the data they publish.":
      "WCA의 공개 API에서 가져옵니다. 한 라운드에서 사용된 바로 그 스크램블을 풀고, 당신의 평균이 그 라운드의 공식 결과와 비교됩니다. Cube Bench는 WCA와 제휴 관계가 아니며, WCA가 공개한 데이터를 바탕으로 만들어졌습니다.",
    "Do I need an account?": "계정이 필요한가요?",
    "Yes, and it's free. Your account holds your speed profile and, if you upgrade, your Pro plan. Sign up with an email and password, or with Google.":
      "네, 그리고 무료입니다. 계정에는 당신의 스피드 프로필이 저장되고, 업그레이드하면 Pro 플랜도 함께 저장됩니다. 이메일과 비밀번호로, 또는 Google로 가입하세요.",
    "What does Pro add?": "Pro는 무엇이 추가되나요?",
    "The full library of past WCA competitions, plus skill analytics that follow your stage splits across sessions. It's $3.49 a month (or $25 a year), with a 3-day free trial, and you can cancel anytime.":
      "지난 WCA 대회 전체 라이브러리와, 세션에 걸쳐 단계별 스플릿을 추적하는 스킬 분석이 추가됩니다. 월 $3.49(또는 연 $25)이며, 3일 무료 체험이 있고 언제든지 해지할 수 있습니다.",
    "What happens if I mis-tap mid-solve?":
      "풀이 도중에 잘못 누르면 어떻게 되나요?",
    "After every solve you can redo it on the same scramble, mark a +2, or flag it as a DNF before it counts. Leaving a round pauses it, and you can resume from the competition list.":
      "매 풀이 후, 집계되기 전에 같은 스크램블로 다시 하거나, +2로 표시하거나, DNF로 지정할 수 있습니다. 라운드를 나가면 일시정지되며, 대회 목록에서 이어서 진행할 수 있습니다.",

    // ---- Claim ----
    "Why we built this": "우리가 이걸 만든 이유",
    "Make it measurable.": "측정할 수 있게 만드세요.",
    "Cube timer websites haven't changed in years, and none of them answer the question everyone practicing at home has: am I ready for a real competition? Cube Bench turns that into a measurement. Solve a real round, see where you'd have landed, and sign up for your first competition because the numbers say you're ready.":
      "큐브 타이머 웹사이트는 몇 년째 변하지 않았고, 집에서 연습하는 모든 사람이 품는 질문에 답해 주지 않습니다. 나는 진짜 대회에 나갈 준비가 됐을까? Cube Bench는 그것을 측정값으로 바꿉니다. 실제 라운드를 풀고, 당신이 몇 등을 했을지 확인한 뒤, 숫자가 준비됐다고 말해 주니 첫 대회에 등록하세요.",

    // ---- Footer ----
    "The competition benchmark for speedcubers.":
      "스피드큐버를 위한 대회 벤치마크.",
    Product: "제품",
    Pricing: "요금제",
    Learn: "더 알아보기",
    "Why Cube Bench": "왜 Cube Bench인가",
    "Built on the WCA's public API. Not affiliated with the World Cube Association.":
      "WCA의 공개 API를 바탕으로 만들어졌습니다. World Cube Association과 제휴 관계가 아닙니다.",

    // ---- Onboarding ----
    "Free to start. Your results stay yours.":
      "무료로 시작하세요. 당신의 결과는 당신의 것입니다.",
    "Step 1 of 2": "2단계 중 1단계",
    "Step 2 of 2": "2단계 중 2단계",
    "Sign in": "로그인",
    "Create your account": "계정을 만드세요",
    "Welcome back": "다시 오신 것을 환영합니다",
    "Two quick steps and you're solving.": "간단한 두 단계면 바로 시작합니다.",
    "Sign in to pick up where you left off.":
      "로그인하고 하던 곳에서 이어서 하세요.",
    or: "또는",
    "Your name": "이름",
    "Create a password (8+ characters)": "비밀번호 만들기 (8자 이상)",
    Password: "비밀번호",
    "Creating…": "생성 중…",
    "Signing in…": "로그인 중…",
    "Create account": "계정 만들기",
    "Already have an account? Sign in": "이미 계정이 있으신가요? 로그인",
    "New here? Create an account": "처음이신가요? 계정 만들기",
    "How fast are you?": "얼마나 빠르신가요?",
    "A rough guess is fine. It just gives your results some context.":
      "대략적인 추측이면 충분합니다. 결과에 약간의 맥락을 더해 줄 뿐입니다.",
    "Display name": "표시 이름",
    "Saving…": "저장 중…",
    "Start solving": "풀이 시작",
    "Not sure yet? Skip for now": "아직 잘 모르시겠나요? 일단 건너뛰기",
    "Getting started": "입문",
    Improving: "향상 중",
    Intermediate: "중급",
    Advanced: "상급",
    Fast: "빠름",
    "Something went wrong.": "문제가 발생했습니다.",

    // ---- Pricing: launch offer ----
    "Free right now": "지금은 무료",
    "Launch offer": "출시 기념 혜택",
    "Everyone who signs up now gets Cube Bench Pro completely free. No card.":
      "지금 가입하는 모든 분께 Cube Bench Pro를 완전 무료로 드립니다. 카드 등록 불필요.",
    "Free through {date}.": "{date}까지 무료입니다.",
  },

  es: {
    // ---- Home: hero + CTAs ----
    "Competition benchmark for speedcubers":
      "El referente de competición para speedcubers",
    "Find out where you'd actually place.":
      "Descubre en qué puesto quedarías de verdad.",
    "Find out where": "Descubre en qué",
    "you'd actually place.": "puesto quedarías de verdad.",
    "Solve the real scrambles from real WCA competitions and see where your average would have landed against the people who were there.":
      "Resuelve los mezclados reales de competiciones WCA reales y descubre dónde habría quedado tu media frente a quienes estuvieron allí.",
    "Launch App": "Abrir la app",
    "See how it works": "Ver cómo funciona",
    "Free to start · Real WCA data · Runs in your browser":
      "Gratis para empezar · Datos reales de la WCA · Funciona en tu navegador",

    // ---- Showcase ----
    "Your result": "Tu resultado",
    "WCA average of 5": "Media WCA de 5",
    "Would have placed": "Habría quedado en el puesto",
    of: "de",
    at: "en",
    "Where your time went": "Dónde se fue tu tiempo",

    // ---- Marquee tail ----
    "…and thousands more in the archive":
      "…y miles más en el archivo",

    // ---- Fact strip ----
    "The exact scrambles": "Los mezclados exactos",
    "The five a round actually used, straight from the WCA archive.":
      "Los cinco que realmente usó una ronda, directamente del archivo de la WCA.",
    "The real field": "Los competidores reales",
    "Ranked against every competitor who showed up that day.":
      "Clasificado frente a cada competidor que se presentó ese día.",
    "Scored the WCA way": "Puntuado al estilo WCA",
    "Ao5 with best and worst dropped, penalties included.":
      "Ao5 descartando el mejor y el peor, con penalizaciones incluidas.",

    // ---- How it works ----
    "How it works": "Cómo funciona",
    "Three steps to a real answer.": "Tres pasos hacia una respuesta real.",
    "Pick a real competition": "Elige una competición real",
    "Any competition in the library, first round through the final. Three featured championships are free.":
      "Cualquier competición de la biblioteca, desde la primera ronda hasta la final. Tres campeonatos destacados son gratis.",
    "Solve the same five scrambles": "Resuelve los mismos cinco mezclados",
    "Hold-to-start timer, 15 seconds of WCA inspection, and a +2 if you start late. Just like the real round.":
      "Cronómetro que se inicia al mantener pulsado, 15 segundos de inspección WCA y un +2 si empiezas tarde. Igual que en la ronda real.",
    "against the real field": "frente a los competidores reales",
    "See where you'd have placed": "Ve en qué puesto habrías quedado",
    "Your Ao5 sits in the official standings. The winner that day averaged 5.88.":
      "Tu Ao5 se sitúa en la clasificación oficial. El ganador de ese día promedió 5,88.",

    // ---- Timer band ----
    "Solve 3 of 5": "Resolución 3 de 5",
    "Any key to stop": "Cualquier tecla para parar",
    "The timer": "El cronómetro",
    "Conventions cubers already know.":
      "Convenciones que los cuberos ya conocen.",
    "Hold space until it arms, release to start, and any key stops. Fifteen seconds of WCA inspection runs before every solve, and a late start costs the same +2 it would on the day.":
      "Mantén la barra espaciadora hasta que se prepare, suéltala para empezar y cualquier tecla la detiene. Antes de cada resolución corren quince segundos de inspección WCA, y empezar tarde cuesta el mismo +2 que ese día.",
    "Mis-taps aren't fatal either. Every solve can be redone, marked +2, or flagged DNF before it counts, and leaving a round pauses it for later.":
      "Los toques erróneos tampoco son fatales. Cada resolución puede rehacerse, marcarse como +2 o señalarse como DNF antes de que cuente, y salir de una ronda la deja en pausa para más tarde.",
    "Try a solve": "Prueba una resolución",

    // ---- Why ----
    "A regular timer": "Un cronómetro normal",
    "Records your times, draws a graph, and leaves the real question open: would that average survive an actual round?":
      "Registra tus tiempos, dibuja una gráfica y deja abierta la verdadera pregunta: ¿sobreviviría esa media a una ronda real?",
    "Puts your average of 5 next to the official results of a real WCA round, on the exact scrambles those competitors solved, scored the way the round was scored.":
      "Pone tu media de 5 junto a los resultados oficiales de una ronda WCA real, sobre los mezclados exactos que resolvieron esos competidores, puntuada como se puntuó la ronda.",

    // ---- Numbers ----
    "By the numbers": "En cifras",
    "One real round.": "Una ronda real.",
    "competitors in the field you're ranked against":
      "competidores frente a los que te clasificas",
    "made the cut for the second round":
      "pasaron el corte a la segunda ronda",
    "the winning average, in seconds": "la media ganadora, en segundos",
    "First round of 3×3 at the WCA World Championship 2019, Melbourne.":
      "Primera ronda de 3×3 en el WCA World Championship 2019, Melbourne.",

    // ---- Skill band ----
    "Also inside": "También dentro",
    "Skill Timer": "Skill Timer",
    "Practice with stage splits: one tap at the end of Cross, F2L, OLL, and PLL. Session by session, see exactly which stage is eating your time, and whether the work is paying off.":
      "Practica con tiempos parciales por etapa: un toque al final de la Cross, el F2L, el OLL y el PLL. Sesión a sesión, descubre exactamente qué etapa se come tu tiempo y si el trabajo está dando frutos.",
    "Open Skill Timer": "Abrir Skill Timer",
    "Focus on": "Céntrate en",
    "Nearly half this session went to F2L. That's where practice pays off first.":
      "Casi la mitad de esta sesión se fue en el F2L. Ahí es donde la práctica rinde primero.",

    // ---- FAQ ----
    FAQ: "Preguntas frecuentes",
    "Fair questions.": "Preguntas justas.",
    "Is the scoring really WCA-accurate?":
      "¿La puntuación es realmente fiel a la WCA?",
    "Yes. Averages drop your single best and worst solve and take the mean of the middle three, quantized to centiseconds the way official results are. Late inspection costs a +2, and DNFs follow the official rules: one counts as your worst solve, two make the whole average a DNF.":
      "Sí. Las medias descartan tu mejor y tu peor resolución y toman la media de las tres del medio, redondeada a centésimas igual que los resultados oficiales. Una inspección tardía cuesta un +2, y los DNF siguen las reglas oficiales: uno cuenta como tu peor resolución, dos convierten toda la media en un DNF.",
    "Where do the scrambles and results come from?":
      "¿De dónde salen los mezclados y los resultados?",
    "From the WCA's public API. You solve the exact scrambles a round used, and your average is placed against that round's official results. Cube Bench isn't affiliated with the WCA; it builds on the data they publish.":
      "De la API pública de la WCA. Resuelves los mezclados exactos que usó una ronda y tu media se compara con los resultados oficiales de esa ronda. Cube Bench no está afiliado a la WCA; se apoya en los datos que ella publica.",
    "Do I need an account?": "¿Necesito una cuenta?",
    "Yes, and it's free. Your account holds your speed profile and, if you upgrade, your Pro plan. Sign up with an email and password, or with Google.":
      "Sí, y es gratis. Tu cuenta guarda tu perfil de velocidad y, si mejoras el plan, tu suscripción Pro. Regístrate con un correo y una contraseña, o con Google.",
    "What does Pro add?": "¿Qué añade Pro?",
    "The full library of past WCA competitions, plus skill analytics that follow your stage splits across sessions. It's $3.49 a month (or $25 a year), with a 3-day free trial, and you can cancel anytime.":
      "La biblioteca completa de competiciones WCA pasadas, más analíticas de habilidad que siguen tus tiempos por etapa a lo largo de las sesiones. Cuesta 3,49 $ al mes (o 25 $ al año), con una prueba gratuita de 3 días, y puedes cancelar cuando quieras.",
    "What happens if I mis-tap mid-solve?":
      "¿Qué pasa si me equivoco de tecla a mitad de la resolución?",
    "After every solve you can redo it on the same scramble, mark a +2, or flag it as a DNF before it counts. Leaving a round pauses it, and you can resume from the competition list.":
      "Después de cada resolución puedes rehacerla con el mismo mezclado, marcar un +2 o señalarla como DNF antes de que cuente. Salir de una ronda la deja en pausa, y puedes retomarla desde la lista de competiciones.",

    // ---- Claim ----
    "Why we built this": "Por qué creamos esto",
    "Make it measurable.": "Hazlo medible.",
    "Cube timer websites haven't changed in years, and none of them answer the question everyone practicing at home has: am I ready for a real competition? Cube Bench turns that into a measurement. Solve a real round, see where you'd have landed, and sign up for your first competition because the numbers say you're ready.":
      "Las webs de cronómetro de cubo no han cambiado en años, y ninguna responde a la pregunta que se hace todo el que practica en casa: ¿estoy listo para una competición de verdad? Cube Bench lo convierte en una medida. Resuelve una ronda real, ve en qué puesto habrías quedado y apúntate a tu primera competición porque los números dicen que estás listo.",

    // ---- Footer ----
    "The competition benchmark for speedcubers.":
      "El referente de competición para speedcubers.",
    Product: "Producto",
    Pricing: "Precios",
    Learn: "Aprende",
    "Why Cube Bench": "Por qué Cube Bench",
    "Built on the WCA's public API. Not affiliated with the World Cube Association.":
      "Construido sobre la API pública de la WCA. No afiliado a la World Cube Association.",

    // ---- Onboarding ----
    "Free to start. Your results stay yours.":
      "Gratis para empezar. Tus resultados siguen siendo tuyos.",
    "Step 1 of 2": "Paso 1 de 2",
    "Step 2 of 2": "Paso 2 de 2",
    "Sign in": "Iniciar sesión",
    "Create your account": "Crea tu cuenta",
    "Welcome back": "Bienvenido de nuevo",
    "Two quick steps and you're solving.":
      "Dos pasos rápidos y ya estás resolviendo.",
    "Sign in to pick up where you left off.":
      "Inicia sesión para seguir donde lo dejaste.",
    or: "o",
    "Your name": "Tu nombre",
    "Create a password (8+ characters)":
      "Crea una contraseña (8 caracteres o más)",
    Password: "Contraseña",
    "Creating…": "Creando…",
    "Signing in…": "Iniciando sesión…",
    "Create account": "Crear cuenta",
    "Already have an account? Sign in":
      "¿Ya tienes cuenta? Inicia sesión",
    "New here? Create an account": "¿Nuevo por aquí? Crea una cuenta",
    "How fast are you?": "¿Cómo de rápido eres?",
    "A rough guess is fine. It just gives your results some context.":
      "Una estimación aproximada vale. Solo da algo de contexto a tus resultados.",
    "Display name": "Nombre visible",
    "Saving…": "Guardando…",
    "Start solving": "Empezar a resolver",
    "Not sure yet? Skip for now": "¿Aún no lo sabes? Sáltalo por ahora",
    "Getting started": "Empezando",
    Improving: "Mejorando",
    Intermediate: "Intermedio",
    Advanced: "Avanzado",
    Fast: "Rápido",
    "Something went wrong.": "Algo salió mal.",

    // ---- Pricing: launch offer ----
    "Free right now": "Gratis ahora mismo",
    "Launch offer": "Oferta de lanzamiento",
    "Everyone who signs up now gets Cube Bench Pro completely free. No card.":
      "Todo el que se registre ahora consigue Cube Bench Pro completamente gratis. Sin tarjeta.",
    "Free through {date}.": "Gratis hasta el {date}.",
  },
};
