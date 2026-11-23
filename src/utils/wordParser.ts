import mammoth from 'mammoth';
import type { QuestionType } from '../types/exam';

export interface ParsedWordQuestion {
  tempId: string;
  questionNumber: string;
  questionType: QuestionType;
  questionText: string;
  points: number;
  options: { optionKey: string; optionText: string; isCorrect: boolean }[];
  matchingPairs: { promptKey: string; promptText: string; matchKey: string; matchText: string }[];
  warnings: string[];
  needsCorrection: boolean;
}

export interface WordParseReport {
  questions: ParsedWordQuestion[];
  totalDetected: number;
  validCount: number;
  needsCorrectionCount: number;
  embeddedImageCount: number;
  typeBreakdown: Record<QuestionType, number>;
  errors: string[];
}

export async function parseWordDocument(file: File): Promise<WordParseReport> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    throw new Error(
      'Legacy binary .DOC files cannot be parsed directly in the browser. Please open the document in Microsoft Word or LibreOffice and save it as .DOCX first.'
    );
  }
  if (!lower.endsWith('.docx')) {
    throw new Error('Unsupported file extension. Please upload a .DOCX document.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }),
  ]);

  const imgMatches = htmlResult.value.match(/<img\s/gi);
  const embeddedImageCount = imgMatches ? imgMatches.length : 0;

  const text = rawResult.value.replace(/\r\n/g, '\n');
  const blocks = text
    .split(/(?=^QUESTION\s+\d+)/im)
    .map((b) => b.trim())
    .filter((b) => /^QUESTION\s+\d+/i.test(b));

  const parsedQuestions: ParsedWordQuestion[] = [];
  const errors: string[] = [];
  const typeBreakdown: Record<QuestionType, number> = {
    MULTIPLE_CHOICE: 0,
    MULTIPLE_RESPONSE: 0,
    TRUE_FALSE: 0,
    MATCHING: 0,
    ESSAY: 0,
  };

  if (blocks.length === 0) {
    errors.push(
      'No blocks starting with "QUESTION 1", "QUESTION 2", etc. were detected. Check your document formatting.'
    );
  }

  blocks.forEach((block, index) => {
    const lines = block.split('\n').map((l) => l.trimEnd());
    const headerMatch = lines[0]?.match(/^QUESTION\s+(\d+)/i);
    const questionNumber = headerMatch ? headerMatch[1] : String(index + 1);
    const warnings: string[] = [];

    // Extract TYPE and POINT
    const typeMatch = block.match(/^TYPE:\s*([A-Z_]+)/im);
    const pointMatch = block.match(/^POINT:\s*(\d+(?:\.\d+)?)/im);
    const rawType = typeMatch ? typeMatch[1].toUpperCase() : 'MULTIPLE_CHOICE';

    const validTypes: QuestionType[] = [
      'MULTIPLE_CHOICE',
      'MULTIPLE_RESPONSE',
      'TRUE_FALSE',
      'MATCHING',
      'ESSAY',
    ];
    let questionType: QuestionType = validTypes.includes(rawType as QuestionType)
      ? (rawType as QuestionType)
      : 'MULTIPLE_CHOICE';

    if (typeMatch && !validTypes.includes(rawType as QuestionType)) {
      warnings.push(`Unrecognized TYPE "${rawType}"; defaulted to MULTIPLE_CHOICE.`);
    }
    const points = pointMatch ? Number(pointMatch[1]) : 5;

    // Parse ANSWER block (single line or multi-line for MATCHING)
    let answerBlock = '';
    const ansIdx = lines.findIndex((l) => /^ANSWER:/i.test(l.trim()));
    if (ansIdx !== -1) {
      const firstLineVal = lines[ansIdx].replace(/^ANSWER:\s*/i, '').trim();
      const collected: string[] = firstLineVal ? [firstLineVal] : [];
      for (let i = ansIdx + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || /^(TYPE|POINT|QUESTION):?/i.test(trimmed)) break;
        collected.push(trimmed);
      }
      answerBlock = collected.join('\n');
    }

    // Collect options A-E and numbered prompts 1-9 (for MATCHING)
    const options: { optionKey: string; optionText: string; isCorrect: boolean }[] = [];
    const promptItems: { key: string; text: string }[] = [];
    const matchItems: { key: string; text: string }[] = [];
    const questionStemLines: string[] = [];

    let reachedBodyEnd = false;
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^(ANSWER|TYPE|POINT):/i.test(trimmed)) {
        reachedBodyEnd = true;
        continue;
      }
      if (reachedBodyEnd) continue;

      const optMatch = trimmed.match(/^([A-E])\.\s+(.+)$/);
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);

      if (questionType === 'MATCHING' && numMatch) {
        promptItems.push({ key: numMatch[1], text: numMatch[2].trim() });
      } else if (optMatch) {
        if (questionType === 'MATCHING') {
          matchItems.push({ key: optMatch[1], text: optMatch[2].trim() });
        } else {
          options.push({
            optionKey: optMatch[1],
            optionText: optMatch[2].trim(),
            isCorrect: false,
          });
        }
      } else if (trimmed.length > 0 && options.length === 0 && promptItems.length === 0) {
        questionStemLines.push(trimmed);
      }
    }

    const questionText = questionStemLines.join('\n').trim();
    if (!questionText) {
      warnings.push('Question stem text is empty.');
    }

    const matchingPairs: { promptKey: string; promptText: string; matchKey: string; matchText: string }[] = [];

    if (questionType === 'MULTIPLE_CHOICE' || questionType === 'TRUE_FALSE') {
      const ansKey = answerBlock.trim().toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
      if (questionType === 'TRUE_FALSE' && options.length === 0) {
        options.push(
          { optionKey: 'A', optionText: 'True', isCorrect: ansKey === 'A' },
          { optionKey: 'B', optionText: 'False', isCorrect: ansKey === 'B' }
        );
      } else {
        options.forEach((o) => {
          o.isCorrect = o.optionKey === ansKey;
        });
      }
      if (!ansKey || !options.some((o) => o.isCorrect)) {
        warnings.push('Missing or unmatched single answer key (e.g. ANSWER: B).');
      }
      if (options.length < 2) {
        warnings.push('Fewer than 2 answer options detected.');
      }
    } else if (questionType === 'MULTIPLE_RESPONSE') {
      const keys = answerBlock
        .toUpperCase()
        .split(/[\s,;]+/)
        .map((k) => k.trim())
        .filter((k) => /^[A-E]$/.test(k));
      options.forEach((o) => {
        o.isCorrect = keys.includes(o.optionKey);
      });
      if (keys.length === 0) {
        warnings.push('Missing multiple-response answer keys (e.g. ANSWER: A, C).');
      }
      if (options.length < 2) {
        warnings.push('Fewer than 2 answer options detected.');
      }
    } else if (questionType === 'MATCHING') {
      const pairLines = answerBlock.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
      const ansMap = new Map<string, string>();
      for (const pl of pairLines) {
        const m = pl.match(/^(\d+)\s*[-–:]\s*([A-E])$/i);
        if (m) ansMap.set(m[1], m[2].toUpperCase());
      }
      const matchLookup = new Map(matchItems.map((m) => [m.key, m.text]));
      for (const p of promptItems) {
        const targetKey = ansMap.get(p.key) || '';
        const targetText = matchLookup.get(targetKey) || '';
        if (!targetKey || !targetText) {
          warnings.push(`Prompt ${p.key} is missing a valid matching answer pair.`);
        }
        matchingPairs.push({
          promptKey: p.key,
          promptText: p.text,
          matchKey: targetKey || 'A',
          matchText: targetText || 'Select match text',
        });
      }
      if (promptItems.length === 0) {
        warnings.push('No numbered matching statements (1., 2., 3.) detected.');
      }
    }

    if (embeddedImageCount > 0 && index === 0) {
      warnings.push(
        `Document contains ${embeddedImageCount} embedded image(s). Please upload or verify media attachments per question in the Question Bank after import.`
      );
    }

    typeBreakdown[questionType] += 1;

    parsedQuestions.push({
      tempId: `word-q-${index}-${Date.now()}`,
      questionNumber,
      questionType,
      questionText,
      points,
      options,
      matchingPairs,
      warnings,
      needsCorrection: warnings.some((w) => !w.includes('embedded image')),
    });
  });

  const needsCorrectionCount = parsedQuestions.filter((q) => q.needsCorrection).length;

  return {
    questions: parsedQuestions,
    totalDetected: parsedQuestions.length,
    validCount: parsedQuestions.length - needsCorrectionCount,
    needsCorrectionCount,
    embeddedImageCount,
    typeBreakdown,
    errors,
  };
}
