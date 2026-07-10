/**
 * Partial translation dictionary (merged into the main DICT in i18n.tsx).
 * Keyed by the English source string. Fill fr/ko/es. Cubing terms
 * (Ao5, WCA, 3x3, Megaminx, Pyraminx) stay as-is. No em dashes.
 */
export const dict: Record<"fr" | "ko" | "es", Record<string, string>> = {
  fr: {
    // Results.tsx
    "Your result": "Votre résultat",
    "average of 5": "moyenne de 5",
    "mean of 3": "moyenne de 3",
    "Compare your real WCA average": "Comparez votre vraie moyenne WCA",
    "Enter your WCA ID to see how your real average compares.":
      "Saisissez votre identifiant WCA pour voir comment votre vraie moyenne se compare.",
    "That doesn't look like a WCA ID (e.g. 2016PARK01).":
      "Cela ne ressemble pas à un identifiant WCA (par ex. 2016PARK01).",
    "Couldn't reach the WCA, try again.":
      "Impossible de joindre la WCA, réessayez.",
    "Looking up…": "Recherche en cours…",
    "Compare": "Comparer",
    "Your WCA ID": "Votre identifiant WCA",
    "No official {event} average on your WCA record yet.":
      "Aucune moyenne officielle {event} dans votre historique WCA pour le moment.",
    "Your official WCA {format} is": "Votre {format} WCA officielle est",
    "which would place": "ce qui vous placerait",
    "of": "sur",
    "in this round.": "dans cette manche.",
    "Your average of": "Votre moyenne de",
    "would have placed": "vous aurait placé",
    "First round": "Première manche",
    "at": "à",
    "winner averaged": "le vainqueur a réalisé une moyenne de",
    "Top {pct}% of the field": "Top {pct}% du peloton",
    "Two or more DNFs make the average itself a DNF, and in an official round that wouldn't place.":
      "Deux DNF ou plus rendent la moyenne elle-même DNF, et dans une manche officielle cela ne serait pas classé.",
    "In a mean of 3 a single DNF makes the whole mean a DNF, and in an official round that wouldn't place.":
      "Dans une moyenne de 3, un seul DNF rend toute la moyenne DNF, et dans une manche officielle cela ne serait pas classé.",
    "Solve the round again and keep it clean.":
      "Refaites la manche et gardez-la propre.",
    "Couldn't place you ({error}). Your average is still {avg}.":
      "Impossible de vous classer ({error}). Votre moyenne reste {avg}.",
    "Try again": "Réessayer",
    "round could not be identified": "la manche n'a pas pu être identifiée",
    "no official results are published for this round yet":
      "aucun résultat officiel n'est encore publié pour cette manche",
    "Ranking unavailable": "Classement indisponible",
    "You'd have advanced": "Vous seriez passé",
    "You'd have missed the cut": "Vous auriez manqué la qualification",
    "The top {count} of {total} went through to the {round}.":
      "Les {count} premiers sur {total} sont passés au {round}.",
    "Your {place} would have made it.": "Votre {place} vous aurait qualifié.",
    "Your {place} would have fallen {short} short.":
      "Votre {place} vous aurait laissé à {short} de la qualification.",
    "Simulate the {round}": "Simuler le {round}",
    "The {round}'s scrambles weren't uploaded to the WCA, so it can't be simulated.":
      "Les mélanges du {round} n'ont pas été téléversés à la WCA, il ne peut donc pas être simulé.",
    "The final": "La finale",
    "This was the last round, so your {place} of {total} would have been your finishing position.":
      "C'était la dernière manche, donc votre {place} sur {total} aurait été votre position finale.",
    "Round podium": "Podium de la manche",
    "Where you'd slot in": "Où vous vous placeriez",
    "Real competitors around your average":
      "Vrais concurrents proches de votre moyenne",
    "You": "Vous",
    "best": "meilleur",
    "worst": "pire",
    "Best and worst are dropped. The average is the mean of the middle three.":
      "Le meilleur et le pire sont écartés. La moyenne est la moyenne des trois du milieu.",
    "Nothing is dropped. The result is the mean of all three solves.":
      "Rien n'est écarté. Le résultat est la moyenne des trois solves.",
    "A “+” marks a +2 penalty.": "Un « + » indique une pénalité de +2.",
    "A DNF counts as the worst attempt.": "Un DNF compte comme le pire essai.",
    "A single DNF makes the mean a DNF.":
      "Un seul DNF rend la moyenne DNF.",
    "Try another competition": "Essayer une autre compétition",

    // SkillTimer.tsx
    "Puzzle": "Casse-tête",
    "Regular": "Standard",
    "Skill Timer": "Skill Timer",
    "Soon": "Bientôt",
    "Skill Timer (stage splits) is a work in progress.":
      "Le Skill Timer (temps par étape) est en cours de développement.",
    "Generating a scramble…": "Génération d'un mélange…",
    "This session": "Cette session",
    "Reset": "Réinitialiser",
    "Reset this session? Your {count} will be cleared.":
      "Réinitialiser cette session ? Vos {count} seront effacés.",
    "Solves": "Solves",
    "Session best": "Meilleur de la session",
    "Personal best": "Record personnel",
    "Average": "Moyenne",
    "Worst": "Pire",
    "Consistency": "Régularité",
    "Best Ao5": "Meilleur Ao5",
    "Best Ao12": "Meilleur Ao12",
    "Focus on": "À travailler",
    "Recent solves": "Solves récents",
    "Session times": "Temps de la session",
    "Official WCA random-state scrambles, generated fresh for practice.":
      "Mélanges officiels WCA en état aléatoire, générés à neuf pour l'entraînement.",
    "To solve a real competition's exact scrambles and see where you'd place, go to Competitions.":
      "Pour résoudre les mélanges exacts d'une vraie compétition et voir où vous vous classeriez, allez dans Compétitions.",
  },
  ko: {
    // Results.tsx
    "Your result": "당신의 결과",
    "average of 5": "5회 평균",
    "mean of 3": "3회 평균",
    "Compare your real WCA average": "실제 WCA 평균과 비교하기",
    "Enter your WCA ID to see how your real average compares.":
      "WCA ID를 입력하면 실제 평균이 어떻게 비교되는지 확인할 수 있습니다.",
    "That doesn't look like a WCA ID (e.g. 2016PARK01).":
      "WCA ID 형식이 아닙니다 (예: 2016PARK01).",
    "Couldn't reach the WCA, try again.":
      "WCA에 연결할 수 없습니다. 다시 시도해 주세요.",
    "Looking up…": "조회 중…",
    "Compare": "비교",
    "Your WCA ID": "당신의 WCA ID",
    "No official {event} average on your WCA record yet.":
      "아직 WCA 기록에 공식 {event} 평균이 없습니다.",
    "Your official WCA {format} is": "당신의 공식 WCA {format}은",
    "which would place": "순위는",
    "of": "/",
    "in this round.": "이 라운드에서 해당됩니다.",
    "Your average of": "당신의 평균",
    "would have placed": "순위에 올랐을 것입니다",
    "First round": "1라운드",
    "at": "장소:",
    "winner averaged": "우승자 평균",
    "Top {pct}% of the field": "전체 참가자 중 상위 {pct}%",
    "Two or more DNFs make the average itself a DNF, and in an official round that wouldn't place.":
      "DNF가 두 개 이상이면 평균 자체가 DNF가 되며, 공식 라운드에서는 순위에 들지 못합니다.",
    "In a mean of 3 a single DNF makes the whole mean a DNF, and in an official round that wouldn't place.":
      "3회 평균에서는 DNF 하나만으로 전체 평균이 DNF가 되며, 공식 라운드에서는 순위에 들지 못합니다.",
    "Solve the round again and keep it clean.":
      "라운드를 다시 풀어 깔끔하게 마무리해 보세요.",
    "Couldn't place you ({error}). Your average is still {avg}.":
      "순위를 매길 수 없습니다 ({error}). 평균은 여전히 {avg}입니다.",
    "Try again": "다시 시도",
    "round could not be identified": "라운드를 식별할 수 없습니다",
    "no official results are published for this round yet":
      "이 라운드의 공식 결과가 아직 게시되지 않았습니다",
    "Ranking unavailable": "순위를 사용할 수 없습니다",
    "You'd have advanced": "통과했을 것입니다",
    "You'd have missed the cut": "커트라인을 넘지 못했을 것입니다",
    "The top {count} of {total} went through to the {round}.":
      "{total}명 중 상위 {count}명이 {round}에 진출했습니다.",
    "Your {place} would have made it.": "당신의 {place} 순위면 통과했을 것입니다.",
    "Your {place} would have fallen {short} short.":
      "당신의 {place} 순위는 {short}만큼 부족했을 것입니다.",
    "Simulate the {round}": "{round} 시뮬레이션",
    "The {round}'s scrambles weren't uploaded to the WCA, so it can't be simulated.":
      "{round}의 스크램블이 WCA에 업로드되지 않아 시뮬레이션할 수 없습니다.",
    "The final": "결승",
    "This was the last round, so your {place} of {total} would have been your finishing position.":
      "마지막 라운드였으므로, {total}명 중 {place} 순위가 최종 순위였을 것입니다.",
    "Round podium": "라운드 시상대",
    "Where you'd slot in": "당신의 위치",
    "Real competitors around your average":
      "당신의 평균 주변의 실제 참가자들",
    "You": "당신",
    "best": "최고",
    "worst": "최악",
    "Best and worst are dropped. The average is the mean of the middle three.":
      "최고와 최악은 제외됩니다. 평균은 가운데 세 번의 평균입니다.",
    "Nothing is dropped. The result is the mean of all three solves.":
      "제외되는 기록은 없습니다. 결과는 세 번 모두의 평균입니다.",
    "A “+” marks a +2 penalty.": "「+」는 +2 페널티를 나타냅니다.",
    "A DNF counts as the worst attempt.": "DNF는 최악의 시도로 계산됩니다.",
    "A single DNF makes the mean a DNF.":
      "DNF 하나만으로 평균이 DNF가 됩니다.",
    "Try another competition": "다른 대회 시도하기",

    // SkillTimer.tsx
    "Puzzle": "퍼즐",
    "Regular": "일반",
    "Skill Timer": "Skill Timer",
    "Soon": "곧 출시",
    "Skill Timer (stage splits) is a work in progress.":
      "Skill Timer (단계별 기록)는 개발 중입니다.",
    "Generating a scramble…": "스크램블 생성 중…",
    "This session": "이번 세션",
    "Reset": "초기화",
    "Reset this session? Your {count} will be cleared.":
      "이번 세션을 초기화할까요? {count}이 삭제됩니다.",
    "Solves": "솔브",
    "Session best": "세션 최고 기록",
    "Personal best": "개인 최고 기록",
    "Average": "평균",
    "Worst": "최악",
    "Consistency": "일관성",
    "Best Ao5": "최고 Ao5",
    "Best Ao12": "최고 Ao12",
    "Focus on": "집중할 부분",
    "Recent solves": "최근 솔브",
    "Session times": "세션 기록",
    "Official WCA random-state scrambles, generated fresh for practice.":
      "연습용으로 새로 생성한 공식 WCA 랜덤 상태 스크램블입니다.",
    "To solve a real competition's exact scrambles and see where you'd place, go to Competitions.":
      "실제 대회의 정확한 스크램블을 풀고 몇 위일지 확인하려면 대회로 이동하세요.",
  },
  es: {
    // Results.tsx
    "Your result": "Tu resultado",
    "average of 5": "promedio de 5",
    "mean of 3": "media de 3",
    "Compare your real WCA average": "Compara tu promedio WCA real",
    "Enter your WCA ID to see how your real average compares.":
      "Introduce tu ID de la WCA para ver cómo se compara tu promedio real.",
    "That doesn't look like a WCA ID (e.g. 2016PARK01).":
      "Eso no parece un ID de la WCA (p. ej. 2016PARK01).",
    "Couldn't reach the WCA, try again.":
      "No se pudo conectar con la WCA, inténtalo de nuevo.",
    "Looking up…": "Buscando…",
    "Compare": "Comparar",
    "Your WCA ID": "Tu ID de la WCA",
    "No official {event} average on your WCA record yet.":
      "Aún no hay un promedio oficial de {event} en tu historial de la WCA.",
    "Your official WCA {format} is": "Tu {format} WCA oficial es",
    "which would place": "lo que te colocaría",
    "of": "de",
    "in this round.": "en esta ronda.",
    "Your average of": "Tu promedio de",
    "would have placed": "te habría colocado",
    "First round": "Primera ronda",
    "at": "en",
    "winner averaged": "el ganador promedió",
    "Top {pct}% of the field": "Top {pct}% de los participantes",
    "Two or more DNFs make the average itself a DNF, and in an official round that wouldn't place.":
      "Dos o más DNF hacen que el propio promedio sea DNF, y en una ronda oficial no se clasificaría.",
    "In a mean of 3 a single DNF makes the whole mean a DNF, and in an official round that wouldn't place.":
      "En una media de 3, un solo DNF hace que toda la media sea DNF, y en una ronda oficial no se clasificaría.",
    "Solve the round again and keep it clean.":
      "Resuelve la ronda de nuevo y mantenla limpia.",
    "Couldn't place you ({error}). Your average is still {avg}.":
      "No se pudo clasificarte ({error}). Tu promedio sigue siendo {avg}.",
    "Try again": "Intentar de nuevo",
    "round could not be identified": "no se pudo identificar la ronda",
    "no official results are published for this round yet":
      "aún no se han publicado resultados oficiales para esta ronda",
    "Ranking unavailable": "Clasificación no disponible",
    "You'd have advanced": "Habrías avanzado",
    "You'd have missed the cut": "No habrías pasado el corte",
    "The top {count} of {total} went through to the {round}.":
      "Los {count} mejores de {total} pasaron a la {round}.",
    "Your {place} would have made it.": "Tu {place} lo habría logrado.",
    "Your {place} would have fallen {short} short.":
      "Tu {place} se habría quedado a {short} del corte.",
    "Simulate the {round}": "Simular la {round}",
    "The {round}'s scrambles weren't uploaded to the WCA, so it can't be simulated.":
      "Los mezclados de la {round} no se subieron a la WCA, así que no se puede simular.",
    "The final": "La final",
    "This was the last round, so your {place} of {total} would have been your finishing position.":
      "Esta fue la última ronda, así que tu {place} de {total} habría sido tu posición final.",
    "Round podium": "Podio de la ronda",
    "Where you'd slot in": "Dónde te situarías",
    "Real competitors around your average":
      "Competidores reales cerca de tu promedio",
    "You": "Tú",
    "best": "mejor",
    "worst": "peor",
    "Best and worst are dropped. The average is the mean of the middle three.":
      "Se descartan el mejor y el peor. El promedio es la media de los tres del medio.",
    "Nothing is dropped. The result is the mean of all three solves.":
      "No se descarta nada. El resultado es la media de los tres solves.",
    "A “+” marks a +2 penalty.": "Un « + » indica una penalización de +2.",
    "A DNF counts as the worst attempt.": "Un DNF cuenta como el peor intento.",
    "A single DNF makes the mean a DNF.":
      "Un solo DNF hace que la media sea DNF.",
    "Try another competition": "Probar otra competición",

    // SkillTimer.tsx
    "Puzzle": "Rompecabezas",
    "Regular": "Normal",
    "Skill Timer": "Skill Timer",
    "Soon": "Pronto",
    "Skill Timer (stage splits) is a work in progress.":
      "El Skill Timer (tiempos por etapa) está en desarrollo.",
    "Generating a scramble…": "Generando un mezclado…",
    "This session": "Esta sesión",
    "Reset": "Reiniciar",
    "Reset this session? Your {count} will be cleared.":
      "¿Reiniciar esta sesión? Se borrarán tus {count}.",
    "Solves": "Solves",
    "Session best": "Mejor de la sesión",
    "Personal best": "Récord personal",
    "Average": "Promedio",
    "Worst": "Peor",
    "Consistency": "Consistencia",
    "Best Ao5": "Mejor Ao5",
    "Best Ao12": "Mejor Ao12",
    "Focus on": "Enfócate en",
    "Recent solves": "Solves recientes",
    "Session times": "Tiempos de la sesión",
    "Official WCA random-state scrambles, generated fresh for practice.":
      "Mezclados oficiales de estado aleatorio de la WCA, generados al momento para practicar.",
    "To solve a real competition's exact scrambles and see where you'd place, go to Competitions.":
      "Para resolver los mezclados exactos de una competición real y ver en qué puesto quedarías, ve a Competiciones.",
  },
};
