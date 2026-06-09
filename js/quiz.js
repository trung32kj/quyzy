// Quiz state machine (logic thuần, không động đến DOM).
// UI gọi các hàm này qua app.js.

import { shuffle, shuffled } from "./utils.js";

/**
 * Tạo bản "quiz item" cho 1 câu hỏi: xáo thứ tự 4 đáp án và lưu lại
 * correctIndex sau khi xáo (để chấm điểm).
 * @param {Question} q
 * @returns {{ id:number, question:string, options:string[], correctIndex:number, originalCorrect:number, topic?:string, image?:string }}
 */
export function makeQuizItem(q) {
  const order = shuffled([0, 1, 2, 3]);
  const options = order.map((i) => q.options[i]);
  const correctIndex = order.indexOf(q.correctIndex);
  return {
    id: q.id,
    question: q.question,
    options,
    correctIndex,
    originalCorrect: q.correctIndex,
    topic: q.topic,
    image: q.image,
  };
}

/**
 * Chia toàn bộ câu hỏi thành các vòng (round) với numPerRound câu mỗi vòng.
 * Xáo thứ tự câu hỏi tổng + xáo thứ tự đáp án mỗi câu.
 * @param {Question[]} questions
 * @param {number} numPerRound
 */
export function buildRounds(questions, numPerRound) {
  const items = shuffled(questions).map(makeQuizItem);
  const rounds = [];
  for (let i = 0; i < items.length; i += numPerRound) {
    rounds.push(items.slice(i, i + numPerRound));
  }
  return rounds;
}

/**
 * Tạo quiz state mới.
 */
export function createState(questions, numPerRound) {
  const rounds = buildRounds(questions, numPerRound);
  return {
    rounds,
    currentRound: 0,
    /** answers[round][qIndex] = optionIndex hoặc null */
    answers: rounds.map((r) => r.map(() => null)),
    submitted: rounds.map(() => false),
  };
}

export function recordAnswer(state, qIndex, optionIndex) {
  state.answers[state.currentRound][qIndex] = optionIndex;
}

export function isCorrect(state, roundIndex, qIndex) {
  const ans = state.answers[roundIndex][qIndex];
  if (ans == null) return false;
  return state.rounds[roundIndex][qIndex].correctIndex === ans;
}

/**
 * Tính kết quả 1 vòng.
 * @returns {{ correct:number, total:number, unanswered:number }}
 */
export function roundResult(state, roundIndex = state.currentRound) {
  const round = state.rounds[roundIndex];
  let correct = 0, unanswered = 0;
  for (let i = 0; i < round.length; i++) {
    const a = state.answers[roundIndex][i];
    if (a == null) unanswered++;
    else if (a === round[i].correctIndex) correct++;
  }
  return { correct, total: round.length, unanswered };
}

export function nextRound(state) {
  if (state.currentRound < state.rounds.length - 1) {
    state.currentRound++;
    return true;
  }
  return false;
}
