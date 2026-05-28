#!/usr/bin/env node
// Build (but do not send) the ContentOS prompt for a given project + step.
// Lets you verify CIA data injection + dep chain without spending LLM tokens.
//
// Usage: node scripts/preview-prompt.js <slug> <step> [--full]
//   --full   print the entire prompt; otherwise print first 80 lines + stats

import { readFileSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { buildPrompt } from '../server/contentos.js'
import { PROJECTS_DIR } from '../server/paths.js'

const slug = process.argv[2]
const stepN = parseInt(process.argv[3] || '1', 10)
const full = process.argv.includes('--full')

if (!slug || !(stepN >= 1 && stepN <= 4)) {
  console.error('Usage: preview-prompt.js <slug> <step 1-4> [--full]')
  process.exit(1)
}

const projectDir = path.join(PROJECTS_DIR, slug)
const projectYaml = yaml.load(readFileSync(path.join(projectDir, 'project.yaml'), 'utf-8')) || {}
const prompt = buildPrompt(stepN - 1, projectDir, projectYaml)

const lines = prompt.split('\n')
const ciaIdx = lines.findIndex(l => l.includes('CIA REAL DATA'))
const ciaPresent = ciaIdx >= 0
const promptKB = (prompt.length / 1024).toFixed(1)

console.log(`Project: ${slug}  Step: ${stepN}`)
console.log(`Prompt size: ${prompt.length} chars (${promptKB} KB), ${lines.length} lines`)
console.log(`CIA section present: ${ciaPresent ? `YES at line ${ciaIdx + 1}` : 'NO'}`)
console.log('---')

if (full) {
  console.log(prompt)
} else {
  console.log(lines.slice(0, 80).join('\n'))
  console.log(`\n... [${lines.length - 80} more lines truncated; use --full to see all]`)
}
