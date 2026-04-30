import { z } from 'zod';

/**
 * Schema for TestCaseDesigner output.
 * Enforced via .withStructuredOutput() — LLM is forced to produce conformant JSON.
 */

export const TestCaseSchema = z.object({
  feature: z.string().describe('Name of the feature being tested'),
  story: z.string().describe('The original user story text'),
  cases: z.array(
    z.object({
      id: z.string().describe('Test case ID, e.g. TC-001'),
      title: z.string().describe('Short descriptive test case title'),
      priority: z.enum(['high', 'medium', 'low']).describe('Test priority'),
      steps: z.array(z.string()).min(1).describe('Ordered list of test steps'),
      assertions: z.array(z.string()).min(1).describe('Expected outcomes to verify'),
      testData: z.record(z.string()).optional().nullable().describe('Test data needed for this case as key-value string pairs'),
    })
  ).min(1).max(8),
});
