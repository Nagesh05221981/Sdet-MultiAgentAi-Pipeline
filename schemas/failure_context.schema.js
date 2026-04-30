import { z } from 'zod';

/**
 * Schema for failure classification produced by TestRunner.
 */

export const FailureContextSchema = z.object({
  spec: z.string().describe('Path to the failing spec file'),
  failureType: z.enum([
    'selector_issue',
    'assertion_failure',
    'timeout_issue',
    'page_object_error',
    'syntax_error',
    'navigation_error',
    'server_unreachable',
    'unknown',
  ]).describe('Classified failure category'),
  errorMessage: z.string().describe('Raw error message from Cypress'),
  failingTest: z.string().optional().describe('Name of the failing test case'),
  stdout: z.string().optional().describe('Full Cypress stdout'),
});
