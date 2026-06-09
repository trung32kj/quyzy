// Parser Excel → mảng Question chuẩn.
// Hỗ trợ 2 schema:
//   A "ĐH VN":  cột [STT, CauHoi, TraLoi1..4]; đáp án đúng được đánh dấu bằng "*" cuối option.
//               Nếu workbook có nhiều sheet, ưu tiên sheet tên chứa "đáp án" (dấu *).
//   B "đơn giản": cột [Câu hỏi, A, B, C, D, Đáp án] — như app cũ.
//
// Output: Question = {
//   id: number, question: string, options: string[4],
//   correctIndex: 0..3, topic?: string, image?: string
// }

import { unaccentLower, isMarkedAnswer, stripAnswerMark, normalize } from "./utils.js";

/**
 * Đọc file ArrayBuffer → trả về thông tin workbook để UI hiển thị.
 * Dùng SheetJS từ vendor/ (đã load qua <script>, biến `XLSX` global).
 * Bật `cellStyles: true` để đọc được fill color (đánh dấu đáp án đúng bằng tô màu nền).
 * @param {ArrayBuffer} buffer
 * @returns {{ workbook: any, sheetNames: string[], answerSheet: string|null }}
 */
export function readWorkbook(buffer) {
  if (typeof XLSX === "undefined") {
    throw new Error("Thư viện XLSX chưa được load (vendor/xlsx.full.min.js).");
  }
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array", cellStyles: true });
  const sheetNames = workbook.SheetNames;
  // Tìm sheet có tên chứa "dap an" (không dấu) để gợi ý mặc định
  const answerSheet = sheetNames.find((n) => unaccentLower(n).includes("dap an")) || null;
  return { workbook, sheetNames, answerSheet };
}

/**
 * Trả về true nếu cell có tô màu nền (fill khác mặc định/trống/trắng).
 * SheetJS lưu fill ở `cell.s.fgColor.rgb` hoặc `cell.s.bgColor.rgb` (ARGB hex).
 */
function cellHasHighlight(cell) {
  if (!cell || !cell.s) return false;
  const s = cell.s;
  // Kiểm tra patternType (nếu "none" thì không có fill)
  const pt = s.patternType || s.fill?.patternType;
  if (pt === "none" || pt === null || pt === undefined) {
    // Một số file vẫn có fgColor mà không có patternType → kiểm tra tiếp
  }
  const fg = s.fgColor?.rgb || s.fgColor?.argb;
  const bg = s.bgColor?.rgb || s.bgColor?.argb;
  // Mặc định trắng/trong suốt
  const isDefault = (c) => !c || /^00000000$/i.test(c) || /^FFFFFFFF$/i.test(c) ||
                            /^FFFFFF$/i.test(c) || /^000000$/i.test(c);
  if (!isDefault(fg)) return true;
  if (!isDefault(bg)) return true;
  return false;
}

/**
 * Parse 1 sheet thành mảng Question. Tự detect schema A hay B.
 * @param {any} workbook
 * @param {string} sheetName
 * @returns {{ questions: Question[], schema: 'A'|'B', skipped: number }}
 */
export function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Không tìm thấy sheet "${sheetName}".`);

  // Đọc raw header (row 1) để map cột → index, đồng thời đọc cell-by-cell
  // (sheet_to_json mất thông tin style → không xác định được cell tô màu).
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headerCells = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = sheet[addr];
    if (cell && cell.v != null) {
      const key = unaccentLower(cell.v);
      headerCells[key] = c; // lưu cột (index)
    }
  }
  if (Object.keys(headerCells).length === 0) {
    return { questions: [], schema: "A", skipped: 0 };
  }
  const headerMap = headerCells; // alias
  const totalRows = range.e.r - range.s.r; // không đếm header

  const has = (k) => headerMap[k] != null;
  // Schema B nếu thấy cột "Câu hỏi" + 4 cột đáp án A-D + "Đáp án"
  const isSchemaB =
    has("cau hoi") && has("a") && has("b") &&
    has("c") && has("d") && has("dap an");

  // Schema A nếu thấy CauHoi + TraLoi1..4
  const isSchemaA =
    (has("cauhoi") || has("cau hoi")) &&
    has("traloi1") && has("traloi2") &&
    has("traloi3") && has("traloi4");

  if (isSchemaB && !isSchemaA) {
    return parseSchemaB(sheet, range, headerMap);
  }
  if (isSchemaA) {
    return parseSchemaA(sheet, range, headerMap);
  }
  throw new Error(
    `Sheet "${sheetName}" không khớp schema nào.\n` +
    `Cột tìm thấy: ${Object.keys(headerMap).join(", ")}\n` +
    `Cần Schema A (CauHoi, TraLoi1..4) hoặc Schema B (Câu hỏi, A, B, C, D, Đáp án).`
  );
}

/**
 * Lấy giá trị + cell object tại (rowIndex, colIndex).
 * @returns {{ v: string, cell: any }}
 */
function getCell(sheet, r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  return {
    v: cell && cell.v != null ? String(cell.v).trim() : "",
    cell: cell || null,
  };
}

function parseSchemaA(sheet, range, h) {
  const colQ = h["cauhoi"] != null ? h["cauhoi"] : h["cau hoi"];
  const colT = [h["traloi1"], h["traloi2"], h["traloi3"], h["traloi4"]];
  const colTopic = h["chu de"] != null ? h["chu de"] : (h["chude"] != null ? h["chude"] : null);
  const colImage = h["hinh anh"] != null ? h["hinh anh"] : (h["hinhanh"] != null ? h["hinhanh"] : (h["image"] != null ? h["image"] : null));

  const questions = [];
  let skipped = 0;
  let highlightUsed = 0;
  let starUsed = 0;

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const q = getCell(sheet, r, colQ).v;
    const optCells = colT.map((c) => getCell(sheet, r, c));
    const opts = optCells.map((o) => o.v);
    if (!q || opts.some((o) => !o)) {
      skipped++;
      continue;
    }
    // Ưu tiên dấu * cuối option; nếu không có thì dùng cell tô màu (highlight)
    let correctIndex = opts.findIndex((o) => isMarkedAnswer(o));
    if (correctIndex !== -1) {
      starUsed++;
    } else {
      correctIndex = optCells.findIndex((oc) => cellHasHighlight(oc.cell));
      if (correctIndex !== -1) highlightUsed++;
    }
    if (correctIndex === -1) {
      skipped++;
      continue;
    }
    questions.push({
      id: questions.length + 1,
      question: q,
      options: opts.map(stripAnswerMark),
      correctIndex,
      topic: colTopic != null ? (getCell(sheet, r, colTopic).v || undefined) : undefined,
      image: colImage != null ? (getCell(sheet, r, colImage).v || undefined) : undefined,
    });
  }
  return { questions, schema: "A", skipped, info: { starUsed, highlightUsed } };
}

function parseSchemaB(sheet, range, h) {
  const colQ = h["cau hoi"];
  const colT = [h["a"], h["b"], h["c"], h["d"]];
  const colAns = h["dap an"];
  const colTopic = h["chu de"] != null ? h["chu de"] : (h["chude"] != null ? h["chude"] : null);
  const colImage = h["hinh anh"] != null ? h["hinh anh"] : (h["hinhanh"] != null ? h["hinhanh"] : (h["image"] != null ? h["image"] : null));

  const questions = [];
  let skipped = 0;

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const q = getCell(sheet, r, colQ).v;
    const opts = colT.map((c) => getCell(sheet, r, c).v);
    const ansRaw = getCell(sheet, r, colAns).v;
    if (!q || opts.some((o) => !o) || !ansRaw) {
      skipped++;
      continue;
    }
    let correctIndex = -1;
    const letters = ["a", "b", "c", "d"];
    const ansLow = normalize(ansRaw);
    if (ansLow.length === 1 && letters.includes(ansLow)) {
      correctIndex = letters.indexOf(ansLow);
    } else {
      correctIndex = opts.findIndex((o) => normalize(o) === ansLow);
    }
    if (correctIndex === -1) {
      skipped++;
      continue;
    }
    questions.push({
      id: questions.length + 1,
      question: q,
      options: opts,
      correctIndex,
      topic: colTopic != null ? (getCell(sheet, r, colTopic).v || undefined) : undefined,
      image: colImage != null ? (getCell(sheet, r, colImage).v || undefined) : undefined,
    });
  }
  return { questions, schema: "B", skipped };
}
