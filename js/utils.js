// Tiện ích chung dùng nhiều nơi.

/**
 * Fisher-Yates shuffle (in-place, unbiased).
 * Sửa bug của bản cũ: `arr.sort(()=>0.5-Math.random())` không phân phối đều.
 * @template T
 * @param {T[]} arr
 * @returns {T[]} chính mảng đã được xáo (cũng return để tiện chain).
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Trả về bản sao mảng đã xáo (không mutate input).
 */
export function shuffled(arr) {
  return shuffle([...arr]);
}

/**
 * Chuẩn hoá chuỗi: bỏ khoảng trắng đầu/cuối, lower-case, bỏ dấu * cuối.
 */
export function normalize(s) {
  if (s == null) return "";
  return String(s).trim().replace(/\*+\s*$/, "").trim().toLowerCase();
}

/**
 * Bỏ dấu sao đánh dấu đáp án đúng (dùng khi hiển thị cho user).
 */
export function stripAnswerMark(s) {
  if (s == null) return "";
  return String(s).replace(/\*+\s*$/, "").trim();
}

/**
 * Kiểm tra một option có phải là đáp án đúng (kết thúc bằng dấu *) không.
 */
export function isMarkedAnswer(s) {
  if (s == null) return false;
  return /\*\s*$/.test(String(s));
}

/**
 * Bỏ dấu tiếng Việt + lower-case để so sánh tên cột bất chấp dấu/hoa-thường.
 */
export function unaccentLower(s) {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}
