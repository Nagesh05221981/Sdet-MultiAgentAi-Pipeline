import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Tool: Read and classify a Cypress failure log.
 * Returns the error message and a failure type classification.
 */
export class ReadFailureLogTool extends StructuredTool {
  name = 'read_failure_log';
  description =
    'Read the Cypress failure log and classify the failure type. Returns the error message and failure category (selector_issue, assertion_failure, timeout_issue, etc.).';
  schema = z.object({});

  constructor(projectRoot) {
    super();
    this.projectRoot = projectRoot;
  }

  async _call() {
    const logPath = path.resolve(this.projectRoot, 'cypress-failure.log');
    const contextPath = path.resolve(this.projectRoot, 'cypress-failure-context.json');

    let log = '';
    let context = null;

    try {
      log = await fs.readFile(logPath, 'utf-8');
    } catch {
      // try context file
    }

    try {
      const raw = await fs.readFile(contextPath, 'utf-8');
      context = JSON.parse(raw);
    } catch {
      // no context file
    }

    if (!log && !context) {
      return 'No failure log found. Either tests passed or logs were not captured.';
    }

    // Classify failure type from log content
    const failureType = classifyFailure(log || context?.errorMessage || '');

    let result = `FAILURE TYPE: ${failureType}\n\n`;
    if (context) {
      result += `SPEC: ${context.spec || 'unknown'}\n`;
      result += `FAILING TEST: ${context.failingTest || 'unknown'}\n\n`;
    }
    result += `ERROR LOG:\n${log || context?.errorMessage || '(no log content)'}`;

    return result;
  }
}

/**
 * Classify a Cypress error message into a failure category.
 */
export function classifyFailure(errorText) {
  const lower = errorText.toLowerCase();

  if (lower.includes('econnrefused') || lower.includes('connection refused') || lower.includes('err_connection')) {
    return 'server_unreachable';
  }
  if (lower.includes('failed to find element') || lower.includes('element not found') || lower.includes('querying for the element')) {
    return 'selector_issue';
  }
  if (lower.includes('timed out') || lower.includes('exceeded timeout') || lower.includes('timeout')) {
    return 'timeout_issue';
  }
  if (lower.includes('is not a function') || lower.includes('is not defined') || lower.includes('cannot read properties')) {
    return 'page_object_error';
  }
  if (lower.includes('syntaxerror') || lower.includes('unexpected token') || lower.includes('parsing error')) {
    return 'syntax_error';
  }
  if (lower.includes('expected') || lower.includes('to equal') || lower.includes('to contain') || lower.includes('assert')) {
    return 'assertion_failure';
  }
  if (lower.includes('cy.visit() failed') || lower.includes('404') || lower.includes('page load')) {
    return 'navigation_error';
  }

  return 'unknown';
}
