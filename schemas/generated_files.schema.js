import { z } from 'zod';

/**
 * Step inside a PO action method.
 */
const ActionStepSchema = z.object({
  type: z.enum(['click', 'type', 'clear', 'select', 'check', 'uncheck', 'contains-click']).describe('Cypress action type. Use contains-click to click an element by its text content.'),
  locator: z.string().describe('Locator constant name from the locators map, e.g. SIGNUP_NAME'),
  index: z.number().optional().nullable().describe('Element index for .eq(n) when selector matches multiple elements'),
  childLocator: z.string().optional().nullable().describe('Child locator for .find() chaining'),
  value: z.string().optional().nullable().describe('Value for type/select actions. Use {paramName} for dynamic params'),
});

/**
 * A single test step — either an action (call a PO function) or an assertion (check a value).
 * Actions and assertions are INTERLEAVED in execution order.
 * This ensures page context flows naturally through the test.
 */
const TestStepSchema = z.object({
  stepType: z.enum(['action', 'assertion']).describe('Whether this step performs an action or verifies a condition'),
  page: z.string().describe('Import alias of the page object for this step, e.g. HomePage, CheckoutPage, ConfirmationPage. MUST match the page the test is CURRENTLY ON.'),
  // Action fields
  call: z.string().optional().nullable().describe('For action steps: function name to call, e.g. addFirstProductToCart'),
  args: z.array(z.string()).optional().nullable().describe('For action steps: arguments to pass to the function'),
  // Assertion fields
  getter: z.string().optional().nullable().describe('For assertion steps: getter function name, e.g. getOrderHeading'),
  should: z.string().optional().nullable().describe('For assertion steps: Cypress assertion like contain, be.visible, have.class'),
  value: z.string().optional().nullable().describe('For assertion steps: expected value'),
});

/**
 * Schema for TestCodeGenerator output — structured data, not code.
 * LLM generates data, template renders code.
 */
export const GeneratedDataSchema = z.object({
  pageObjects: z.array(
    z.object({
      fileName: z.string().describe('PO file name in kebab-case, e.g. auth-modal.js'),
      locators: z.array(
        z.object({
          name: z.string().describe('Constant name in UPPER_SNAKE_CASE, e.g. SIGNUP_EMAIL'),
          selector: z.string().describe('CSS selector string, e.g. #s-email'),
        })
      ).min(1).describe('List of locator constants'),
      actions: z.array(
        z.object({
          name: z.string().describe('Action function name in camelCase, e.g. fillSignup'),
          params: z.array(z.string()).describe('Parameter names for the function'),
          steps: z.array(ActionStepSchema).min(1).describe('Ordered list of Cypress steps'),
        })
      ).describe('Action functions that perform interactions'),
      getters: z.array(
        z.object({
          name: z.string().describe('Getter function name, e.g. getSignupMsg'),
          locator: z.string().describe('Locator constant name this getter returns'),
          index: z.number().optional().nullable().describe('Element index for .eq(n)'),
          childLocator: z.string().optional().nullable().describe('Child locator for .find() chaining'),
        })
      ).describe('Getter functions that return cy.get() chains for assertions'),
    })
  ).describe('Page object files to generate — one per page visited in the flow'),
  spec: z.object({
    fileName: z.string().describe('Spec file name, e.g. user-signup.cy.js'),
    describe: z.string().describe('Top-level describe block text'),
    pageImports: z.array(
      z.object({
        alias: z.string().describe('Import alias, e.g. HomePage, CheckoutPage, ConfirmationPage'),
        path: z.string().describe('File name without extension, e.g. home-page, checkout-page'),
      })
    ).min(1).describe('Page object imports — one for EVERY page visited in the flow'),
    visitUrl: z.string().describe('URL for cy.visit in beforeEach, e.g. /index.html'),
    tests: z.array(
      z.object({
        id: z.string().describe('Test case ID, e.g. TC-001'),
        title: z.string().describe('Test title'),
        steps: z.array(TestStepSchema).min(1).describe('Interleaved actions and assertions in EXECUTION ORDER. After a navigation action, subsequent steps MUST use the new page alias.'),
      })
    ).min(1).describe('Test cases'),
  }),
});

/**
 * Legacy schema kept for backward compatibility.
 */
export const GeneratedFilesSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe('Relative file path'),
      content: z.string().min(10).describe('Full file content'),
    })
  ).min(1),
});

export const FixedFilesSchema = GeneratedFilesSchema;
