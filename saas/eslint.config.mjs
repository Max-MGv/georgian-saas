import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Money identifiers that hold TETRI. Rendering one directly puts an integer
// like 28000 on screen where a human expects ₾280 — which is exactly what
// bug #43 did to every guest who booked without paying online.
//
// This rule exists because the compiler cannot help here. Prisma maps both
// `Float` and `Int` to `number`, so the 2026-09-18 major-to-minor unit
// conversion produced zero type errors across the entire codebase. The sweep
// that followed was anchored on the `₾` character, and its blind spot is
// precisely a money site with no `₾` next to it — which is where every display
// defect found on 2026-09-18 was hiding.
//
// The list is explicit rather than a fuzzy /total|price|amount/ pattern so it
// does not fire on `totalOrders`, `priceLabel` and friends. Add a name here
// when you add a money column.
const MONEY_IDENTIFIERS = [
  "totalPrice", "totalAmount", "subtotal", "amount", "price",
  "pricePerPerson", "tastingLunchPricePerPerson", "pricePerUnit",
  "registrationPrice", "priceSnapshot",
  "tastingRateSnapshot", "lunchRateSnapshot", "registrationFeeSnapshot",
  "confirmedPrice", "estimatedTotal", "enhancedTotal",
  "masterclassAmt", "extrasAmt", "linesAmt", "amountPaid",
].join("|");

const MONEY_MESSAGE =
  "This is a money value in tetri — rendering it raw shows 28000 instead of ₾280. " +
  "Wrap it in formatTetri(asTetri(x)) from @/lib/money. See vault/KnownBugs.md #43.";

// Every selector is rooted at `JSXElement >`, i.e. only money RENDERED as an
// element's child. An attribute — `value={price}` on an admin input, or
// `total={order.totalPrice}` passed to a child component — is deliberately not
// flagged: handing tetri to a prop is correct, and those form inputs hold an
// editable lari *string* anyway. Without this root the rule reported 9 false
// positives across the admin screens and zero real defects.
const moneyDisplayRules = {
  "no-restricted-syntax": [
    "error",
    {
      // <p>{confirmedPrice}</p>
      selector: `JSXElement > JSXExpressionContainer > Identifier[name=/^(${MONEY_IDENTIFIERS})$/]`,
      message: MONEY_MESSAGE,
    },
    {
      // <p>{order.totalPrice}</p>
      selector: `JSXElement > JSXExpressionContainer > MemberExpression[property.name=/^(${MONEY_IDENTIFIERS})$/]`,
      message: MONEY_MESSAGE,
    },
    {
      // <p>{`${total} GEL`}</p> — the pattern lib/money.ts's header warns about
      selector: `JSXElement > JSXExpressionContainer > TemplateLiteral > Identifier[name=/^(${MONEY_IDENTIFIERS})$/]`,
      message: MONEY_MESSAGE,
    },
    {
      selector: `JSXElement > JSXExpressionContainer > TemplateLiteral > MemberExpression[property.name=/^(${MONEY_IDENTIFIERS})$/]`,
      message: MONEY_MESSAGE,
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.tsx"],
    rules: moneyDisplayRules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
