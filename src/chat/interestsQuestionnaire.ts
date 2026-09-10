import type { InterestCategory, WeeklyQuestion, WeeklyQuestionOption } from '../domain/types.js';

/**
 * Une reponse est stockee comme `${category}:${optionId}` (ex: "musique:opt-3") dans
 * EmployeeProfile.interestAnswers - un seul identifiant encode a la fois la categorie et
 * le choix precis, sans dependre du texte affiche (qui change chaque semaine).
 */
export function buildAnswerId(category: InterestCategory, optionId: string): string {
  return `${category}:${optionId}`;
}

/** Option actuellement choisie pour cette question parmi les reponses de l'employe, si presente. */
export function getCurrentAnswer(
  question: WeeklyQuestion,
  interestAnswers: readonly string[],
): WeeklyQuestionOption | undefined {
  return question.options.find((option) =>
    interestAnswers.includes(buildAnswerId(question.category, option.id)),
  );
}

/** Retire la reponse (s'il y en a une) donnee pour cette categorie. */
export function removeAnswerForCategory(
  interestAnswers: readonly string[],
  category: InterestCategory,
): string[] {
  return interestAnswers.filter((answer) => !answer.startsWith(`${category}:`));
}

function parseAnswerId(answer: string): { category: string; optionId: string } | undefined {
  const separatorIndex = answer.indexOf(':');
  if (separatorIndex === -1) return undefined;
  return {
    category: answer.slice(0, separatorIndex),
    optionId: answer.slice(separatorIndex + 1),
  };
}

function mapAnswersByCategory(interestAnswers: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const answer of interestAnswers) {
    const parsed = parseAnswerId(answer);
    if (parsed) map.set(parsed.category, parsed.optionId);
  }
  return map;
}

/**
 * Question sans reponse choisie aleatoirement (ordre different a chaque appel), ou
 * undefined si complet. Les categories "passees" (skippedCategories - repondre 0 a une
 * question) sont reproposees en dernier recours, une fois toutes les autres traitees.
 * `random` est injectable pour des tests deterministes (meme convention que
 * src/matching/engine.ts) - defaut Math.random.
 */
export function findNextQuestion(
  questions: readonly WeeklyQuestion[],
  interestAnswers: readonly string[],
  skippedCategories: readonly InterestCategory[] = [],
  random: () => number = Math.random,
): WeeklyQuestion | undefined {
  const answeredCategories = new Set(mapAnswersByCategory(interestAnswers).keys());
  const skipped = new Set(skippedCategories);
  const pending = questions.filter((question) => !answeredCategories.has(question.category));
  if (pending.length === 0) return undefined;

  const notSkipped = pending.filter((question) => !skipped.has(question.category));
  const candidates = notSkipped.length > 0 ? notSkipped : pending;
  return candidates[Math.floor(random() * candidates.length)];
}

export function formatQuestionPrompt(question: WeeklyQuestion): string {
  const optionLines = question.options.map((option, i) => `${i + 1}. ${option.label}`).join('\n');
  return [question.prompt, optionLines, '0. Passer cette question (elle reviendra a la fin)'].join(
    '\n',
  );
}

/** Numero (1-based, ordre d'affichage) -> question, pour /interets modifier|supprimer <numero>. */
export function getQuestionByIndex(
  questions: readonly WeeklyQuestion[],
  oneBasedIndex: number,
): WeeklyQuestion | undefined {
  return questions[oneBasedIndex - 1];
}

export function getQuestionByCategory(
  questions: readonly WeeklyQuestion[],
  category: InterestCategory,
): WeeklyQuestion | undefined {
  return questions.find((question) => question.category === category);
}

/**
 * Liste des categories deja repondues (avec leur numero d'origine, pour rester coherent
 * avec /interets modifier|supprimer <numero>), pour /interets modifier. Les categories
 * sans reponse ne sont pas affichees - /interets s'occupe de les proposer.
 */
export function formatInterestsEditList(
  questions: readonly WeeklyQuestion[],
  interestAnswers: readonly string[],
): string {
  const answered = mapAnswersByCategory(interestAnswers);
  const lines = questions
    .map((question, index) => {
      const optionId = answered.get(question.category);
      const option = optionId ? question.options.find((o) => o.id === optionId) : undefined;
      return option ? `${index + 1}. ${question.categoryLabel}: ${option.label}` : undefined;
    })
    .filter((line): line is string => line !== undefined);

  if (lines.length === 0) {
    return "Tu n'as pas encore repondu a une question. Tape /interets pour commencer.";
  }

  return [
    "Tes centres d'interet:",
    ...lines,
    '',
    'Pour changer une reponse: /interets modifier <numero>',
    'Pour effacer une reponse: /interets supprimer <numero>',
  ].join('\n');
}

/** Prompt affiche apres /interets modifier <numero> - reponse actuelle notee, 0 pour annuler. */
export function formatEditPrompt(
  question: WeeklyQuestion,
  currentAnswerLabel: string | undefined,
): string {
  const optionLines = question.options.map((option, i) => `${i + 1}. ${option.label}`).join('\n');
  const currentLine = currentAnswerLabel ? `Reponse actuelle: ${currentAnswerLabel}\n` : '';
  return `Modifier: ${question.categoryLabel}\n${currentLine}${question.prompt}\n${optionLines}\n0. Annuler`;
}

export interface AnsweredQuestion {
  prompt: string;
  answerLabel: string;
}

/** Pour l'affichage du profil: la question posee et le libelle de la reponse choisie, dans l'ordre des questions. */
export function getAnsweredQuestions(
  questions: readonly WeeklyQuestion[],
  interestAnswers: readonly string[],
): AnsweredQuestion[] {
  const answered: AnsweredQuestion[] = [];
  for (const question of questions) {
    const current = getCurrentAnswer(question, interestAnswers);
    if (current) answered.push({ prompt: question.prompt, answerLabel: current.label });
  }
  return answered;
}

export interface SharedInterestAnswer {
  categoryLabel: string;
  answerLabel: string;
}

/**
 * Pour chaque question, ne retient la categorie que si tous les membres ont choisi
 * exactement la meme reponse (comparaison de l'identifiant complet
 * `${category}:${optionId}` - pas juste repondu a la meme categorie avec des reponses
 * differentes).
 */
export function computeSharedAnswers(
  questions: readonly WeeklyQuestion[],
  membersInterestAnswers: readonly (readonly string[])[],
): SharedInterestAnswer[] {
  if (membersInterestAnswers.length === 0) return [];

  const shared: SharedInterestAnswer[] = [];
  for (const question of questions) {
    const answersForQuestion = membersInterestAnswers.map((answers) =>
      answers.find((answer) => parseAnswerId(answer)?.category === question.category),
    );
    const [first, ...rest] = answersForQuestion;
    if (first && rest.every((answer) => answer === first)) {
      const optionId = parseAnswerId(first)?.optionId;
      const option = question.options.find((o) => o.id === optionId);
      if (option) {
        shared.push({ categoryLabel: question.categoryLabel, answerLabel: option.label });
      }
    }
  }
  return shared;
}
