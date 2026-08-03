import fs from 'node:fs/promises';
import path from 'node:path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { generate, extractJson } from './ollama.js';
import { log } from './database.js';

export function formatOf(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.doc') return 'doc';
  if (ext === '.txt') return 'txt';
  if (ext === '.md') return 'md';
  return 'unknown';
}

export function isSupported(filename) {
  return formatOf(filename) !== 'unknown';
}

export async function extractText(filePath, filename) {
  const fmt = formatOf(filename);
  if (fmt === 'txt' || fmt === 'md') {
    return (await fs.readFile(filePath, 'utf8')).trim();
  }
  if (fmt === 'pdf') {
    const buffer = await fs.readFile(filePath);
    try {
      const data = await pdf(buffer);
      return (data.text || '').trim();
    } catch (err) {
      log('error', `PDF parse failed for ${filename} (${err.message}), falling back to raw text scan`);
      return bestEffortText(buffer);
    }
  }
  if (fmt === 'docx') {
    const buffer = await fs.readFile(filePath);
    try {
      const result = await mammoth.extractRawText({ buffer });
      return (result.value || '').trim();
    } catch (err) {
      log('error', `DOCX parse failed for ${filename} (${err.message}), falling back to raw text scan`);
      return bestEffortText(buffer);
    }
  }
  if (fmt === 'doc') {
    const buffer = await fs.readFile(filePath);
    return bestEffortText(buffer);
  }
  return '';
}

function bestEffortText(buffer) {
  const s = buffer.toString('latin1');
  const matches = s.match(/[\x20-\x7E\u00A0-\u00FF]{4,}/g);
  if (!matches) return '';
  return matches.join(' ').slice(0, 50000);
}

export async function tailorResume(content, job) {
  const jobDesc = (job.description || '').slice(0, 8000);
  const prompt = [
    'You are a professional resume coach. Rewrite the candidate\'s resume summary and skills to',
    'match the target job description. Stay 100% truthful: never fabricate experience,',
    'companies, titles, years, or credentials. Only emphasize and reorder existing facts.',
    '',
    'Target job:',
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Description: ${jobDesc}`,
    '',
    'Current resume:',
    content.slice(0, 12000),
    '',
    'Return ONLY valid JSON with exactly these keys:',
    '{"summary": "2-4 sentence professional summary tailored to the job",',
    ' "skills": "comma separated list of skills most relevant to the job, drawn only from the resume"}'
  ].join('\n');

  const raw = await generate(prompt);
  const parsed = extractJson(raw);
  if (!parsed) {
    throw new Error(
      raw
        ? `Could not parse AI response into JSON: ${raw.slice(0, 200)}`
        : 'Could not parse AI response into JSON: the model returned nothing'
    );
  }
  const summary = String(parsed.summary || '').trim();
  const skills = String(parsed.skills || '').trim();
  if (!summary && !skills) throw new Error('AI returned empty tailoring result');
  return { summary, skills };
}

export function applyTailoring(content, summary, skills) {
  let output = content.trim();
  if (summary) {
    const headline = `# Professional Summary\n\n${summary}\n`;
    const before = output;
    output = output.replace(/#{1,3}\s*(Professional Summary|Summary|Objective)[^\n]*\n+[\s\S]*?(?=#{1,3}\s|$)/i, headline);
    if (output === before) {
      output = `${headline}\n${output}`;
    }
  }
  if (skills) {
    const block = `# Skills\n\n${skills}\n`;
    const before = output;
    output = output.replace(/#{1,3}\s*Skills?[^\n]*\n+[\s\S]*?(?=#{1,3}\s|$)/i, block);
    if (output === before) {
      output = `${output}\n${block}`;
    }
  }
  return output;
}
