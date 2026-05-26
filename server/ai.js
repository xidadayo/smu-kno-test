import fs from 'node:fs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';

const stages = ['L1', 'L2', 'L3', 'L4'];
const textExtensions = new Set(['txt', 'md', 'csv', 'html', 'htm']);
const wordExtensions = new Set(['docx']);
const pdfExtensions = new Set(['pdf']);
const pptExtensions = new Set(['pptx']);

function splitContent(content) {
  const normalized = content
    .replace(/\r/g, '\n')
    .split(/\n+|。|\.|；|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return ['文档已上传，请补充可解析文本后重新生成。'];
  }

  return normalized.slice(0, 8);
}

function stripXml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function readPptxText(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));

  const slides = [];
  for (const [index, name] of slideNames.entries()) {
    const xml = await zip.file(name).async('string');
    const fragments = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => stripXml(match[1])).filter(Boolean);
    if (fragments.length > 0) {
      slides.push(`第 ${index + 1} 页：${fragments.join('；')}`);
    }
  }
  return slides.join('\n');
}

export async function readUploadText(file) {
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'txt';
  if (textExtensions.has(ext)) {
    return fs.readFileSync(file.path, 'utf8').slice(0, 18000);
  }

  if (wordExtensions.has(ext)) {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value.slice(0, 18000);
  }

  if (pdfExtensions.has(ext)) {
    const parser = new PDFParse({ data: fs.readFileSync(file.path) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text.slice(0, 18000);
  }

  if (pptExtensions.has(ext)) {
    return (await readPptxText(file.path)).slice(0, 18000);
  }

  throw new Error(`暂不支持解析 .${ext} 文件，请上传 txt、md、csv、html、docx、pdf 或 pptx。`);
}

async function extractReadableText(file) {
  const content = (await readUploadText(file)).trim();
  if (content.length < 20) {
    throw new Error(`${file.originalname} 未提取到足够正文，请确认文件不是扫描图片或加密文件。`);
  }
  return content;
}

function normalizeAiPayload(payload, documentId, provider = 'deepseek-v4') {
  const knowledgePoints = (payload.knowledgePoints || []).slice(0, 12).map((item, index) => {
    const stage = stages.includes(item.stage) ? item.stage : stages[index % stages.length];
    const id = `kp_${documentId}_${index + 1}`;
    return {
      id,
      documentId,
      title: String(item.title || `知识点 ${index + 1}`).slice(0, 80),
      summary: String(item.summary || item.title || '').slice(0, 300),
      keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6).map(String) : [],
      stage,
      difficulty: stages.includes(item.difficulty) ? item.difficulty : stage,
      sourceLocation: String(item.sourceLocation || `AI 切片 ${index + 1}`),
      estimatedMinutes: Number(item.estimatedMinutes || 10),
      confidence: Number(item.confidence || 0.78),
      status: 'pending_review',
      generatedBy: provider
    };
  });

  const kpIds = new Map(knowledgePoints.map((kp) => [kp.title, kp.id]));
  const questions = (payload.questions || []).slice(0, 20).map((item, index) => {
    const stage = stages.includes(item.stage) ? item.stage : knowledgePoints[index % Math.max(knowledgePoints.length, 1)]?.stage || 'L1';
    const options = Array.isArray(item.options) && item.options.length > 0 ? item.options.map(String) : ['正确', '错误'];
    const answer = Array.isArray(item.answer) ? item.answer.map(String) : [String(item.answer || options[0])];
    return {
      id: `q_${documentId}_${index + 1}`,
      knowledgePointId: item.knowledgePointId || kpIds.get(item.knowledgePointTitle) || knowledgePoints[index % Math.max(knowledgePoints.length, 1)]?.id,
      type: item.type || (options.length === 2 && options.includes('正确') ? 'judge' : 'single'),
      title: String(item.title || `题目 ${index + 1}`).slice(0, 200),
      options,
      answer,
      analysis: String(item.analysis || '由 AI 生成，发布前请管理员审核。').slice(0, 300),
      stage,
      difficulty: stages.includes(item.difficulty) ? item.difficulty : stage,
      score: Number(item.score || 10),
      confidence: Number(item.confidence || 0.78),
      status: 'pending_review',
      generatedBy: provider
    };
  });

  if (knowledgePoints.length === 0 || questions.length === 0) {
    throw new Error('AI payload is missing knowledgePoints or questions');
  }

  return { knowledgePoints, questions };
}

export async function mockGenerateFromFile(file, documentId) {
  const content = await extractReadableText(file);
  const chunks = splitContent(content);

  const knowledgePoints = chunks.map((chunk, index) => {
    const stage = stages[index % stages.length];
    return {
      id: `kp_${documentId}_${index + 1}`,
      documentId,
      title: chunk.slice(0, 28),
      summary: `${chunk.slice(0, 80)}${chunk.length > 80 ? '...' : ''}`,
      keywords: chunk
        .split(/\s+|,|，/)
        .filter((item) => item.length >= 2)
        .slice(0, 4),
      stage,
      difficulty: stage,
      sourceLocation: `自动切片 ${index + 1}`,
      estimatedMinutes: 8 + index * 3,
      confidence: Number((0.72 + Math.min(index, 4) * 0.04).toFixed(2)),
      status: 'pending_review',
      generatedBy: 'local-mock'
    };
  });

  const questions = knowledgePoints.map((kp, index) => ({
    id: `q_${documentId}_${index + 1}`,
    knowledgePointId: kp.id,
    type: index % 2 === 0 ? 'single' : 'judge',
    title: index % 2 === 0 ? `关于“${kp.title}”，下列哪项理解更准确？` : `“${kp.title}”已经完成来源追溯。`,
    options: index % 2 === 0 ? ['直接跳过', '按来源学习并完成记录', '只看考试答案', '无需审核'] : ['正确', '错误'],
    answer: index % 2 === 0 ? ['按来源学习并完成记录'] : ['正确'],
    analysis: '题目由本地模拟生成，发布前必须由管理员审核。',
    stage: kp.stage,
    difficulty: kp.difficulty,
    score: 10,
    confidence: kp.confidence,
    status: 'pending_review',
    generatedBy: 'local-mock'
  }));

  return { knowledgePoints, questions };
}

export async function generateFromFile(file, documentId) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey) {
    return { ...(await mockGenerateFromFile(file, documentId)), provider: 'local-mock', model: 'local-mock' };
  }

  const content = await extractReadableText(file);
  const prompt = [
    '请把企业知识库文档转换成可审核的阶段学习内容和题库。',
    '必须只返回 JSON，不要 Markdown，不要解释。',
    'JSON 结构：',
    '{"knowledgePoints":[{"title":"","summary":"","keywords":[],"stage":"L1","difficulty":"L1","sourceLocation":"","estimatedMinutes":10,"confidence":0.8}],"questions":[{"knowledgePointTitle":"","type":"single","title":"","options":[],"answer":[],"analysis":"","stage":"L1","difficulty":"L1","score":10,"confidence":0.8}]}',
    '阶段和难度只能使用 L1、L2、L3、L4。',
    '题型 type 可使用 single、multi、judge、blank、short、case、operation。',
    '生成 4-8 个知识点和 4-8 道客观题，低置信度内容仍需标注 confidence。',
    `文档内容：\n${content}`
  ].join('\n');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是企业培训知识库学习与考核系统的内容生成助手。' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);
    return { ...normalizeAiPayload(parsed, documentId, model), provider: 'deepseek', model };
  } catch (error) {
    const fallback = await mockGenerateFromFile(file, documentId);
    return {
      ...fallback,
      provider: 'local-mock',
      model: 'local-mock',
      aiError: error.message
    };
  }
}
