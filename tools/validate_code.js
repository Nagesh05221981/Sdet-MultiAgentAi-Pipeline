import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as acorn from 'acorn';
import { SPEC_RULES, PAGE_OBJECT_RULES } from '../config/conventions.js';

/**
 * Tool: Validate generated JavaScript code.
 * Performs AST parsing (acorn) + convention checks.
 */
export class ValidateCodeTool extends StructuredTool {
  name = 'validate_code';
  description =
    'Validate generated JavaScript code for syntax errors and convention violations. Provide the code string and file type ("spec" or "pageObject"). Returns "VALID" or a list of errors.';
  schema = z.object({
    code: z.string().describe('The JavaScript code to validate'),
    fileType: z.enum(['spec', 'pageObject']).describe('Type of file: "spec" for .cy.js, "pageObject" for page object .js'),
  });

  async _call({ code, fileType }) {
    const errors = [];

    // 1. AST Parse — check syntax
    try {
      acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      });
    } catch (err) {
      errors.push(`Syntax error at line ${err.loc?.line || '?'}, column ${err.loc?.column || '?'}: ${err.message}`);
    }

    // 2. Convention checks
    const rules = fileType === 'spec' ? SPEC_RULES : PAGE_OBJECT_RULES;
    for (const rule of rules) {
      if (!rule.test(code)) {
        errors.push(`Convention violation [${rule.id}]: ${rule.message}`);
      }
    }

    if (errors.length === 0) {
      return 'VALID';
    }

    return `INVALID — ${errors.length} error(s):\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
  }
}
