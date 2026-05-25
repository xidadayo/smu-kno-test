import fs from 'node:fs';

const stages = ['L1', 'L2', 'L3', 'L4'];

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

export function mockGenerateFromFile(file, documentId) {
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'txt';
  let content = '';

  if (['txt', 'md', 'csv', 'html'].includes(ext)) {
    content = fs.readFileSync(file.path, 'utf8');
  } else {
    content = `${file.originalname} 上传成功。当前 MVP 对二进制文档先生成审核占位，后续可接入 PDF/Word/PPT 解析服务。`;
  }

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
      status: 'pending_review'
    };
  });

  const questions = knowledgePoints.map((kp, index) => ({
    id: `q_${documentId}_${index + 1}`,
    knowledgePointId: kp.id,
    type: index % 2 === 0 ? 'single' : 'judge',
    title:
      index % 2 === 0
        ? `关于“${kp.title}”，下列哪项理解更准确？`
        : `“${kp.title}”已经完成来源追溯。`,
    options: index % 2 === 0 ? ['直接跳过', '按来源学习并完成记录', '只看考试答案', '无需审核'] : ['正确', '错误'],
    answer: index % 2 === 0 ? ['按来源学习并完成记录'] : ['正确'],
    analysis: '题目由 MVP 模拟生成，发布前必须由管理员审核。',
    stage: kp.stage,
    difficulty: kp.difficulty,
    score: 10,
    confidence: kp.confidence,
    status: 'pending_review'
  }));

  return { knowledgePoints, questions };
}
