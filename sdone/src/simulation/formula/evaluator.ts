import { FormulaEvalError } from './errors.js';
import type { ExprNode, BinaryOpNode, UnaryOpNode, FunctionCallNode, NumberNode, VariableNode } from './parser.js';

/**
 * Supported single-argument Math functions.
 *
 * At evaluation time, if a function name is in this set, it's called with a
 * single argument.  Otherwise, it's treated as a two-argument function
 * (currently only `min` / `max`).
 */
const SINGLE_ARG_FNS = new Set(['sin', 'cos', 'abs', 'sqrt', 'log', 'exp']);

/**
 * Evaluate an AST node against a given simulated time `t`.
 *
 * Story 7.1: Added optional `variables` parameter for injecting stock state
 * (value, capacity) into feedback formula evaluation. Variables are resolved
 * after the reserved `t` keyword — `t` always uses the simulated time value.
 *
 * @param variables  Optional bag of variable name→value mappings (e.g. { value: 50, capacity: 100 }).
 * @throws {FormulaEvalError} on runtime evaluation errors (sqrt of negative, division by zero).
 */
export function evaluate(node: ExprNode, t: number, variables?: Record<string, number>): number {
  switch (node.type) {
    case 'number':
      return (node as NumberNode).value;

    case 'variable': {
      const vn = node as VariableNode;
      if (vn.name === 't') return t;
      if (variables && vn.name in variables) return variables[vn.name];
      throw new FormulaEvalError(`Unknown variable '${vn.name}'`);
    }

    case 'binary': {
      const bn = node as BinaryOpNode;
      const left = evaluate(bn.left, t, variables);
      const right = evaluate(bn.right, t, variables);
      switch (bn.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          if (right === 0) throw new FormulaEvalError('Division by zero');
          return left / right;
        case '^': {
          const result = Math.pow(left, right);
          if (Number.isNaN(result)) {
            throw new FormulaEvalError(
              `Cannot raise negative number ${left} to non-integer power ${right}`,
            );
          }
          return result;
        }
      }
      break;
    }

    case 'unary': {
      const un = node as UnaryOpNode;
      return -evaluate(un.operand, t, variables);
    }

    case 'call': {
      const cn = node as FunctionCallNode;
      const args = cn.args.map((a) => evaluate(a, t, variables));
      const name = cn.name;

      // Single-argument functions
      if (SINGLE_ARG_FNS.has(name)) {
        if (args.length !== 1) {
          throw new FormulaEvalError(
            `Function '${name}' expects 1 argument, got ${args.length}`,
          );
        }
        switch (name) {
          case 'sin':
            return Math.sin(args[0]);
          case 'cos':
            return Math.cos(args[0]);
          case 'abs':
            return Math.abs(args[0]);
          case 'sqrt':
            if (args[0] < 0) {
              throw new FormulaEvalError(`sqrt of negative number ${args[0]}`);
            }
            return Math.sqrt(args[0]);
          case 'log':
            if (args[0] <= 0) {
              throw new FormulaEvalError(`log of non-positive number ${args[0]}`);
            }
            return Math.log(args[0]);
          case 'exp':
            return Math.exp(args[0]);
          default:
            throw new FormulaEvalError(`Unknown function '${name}'`);
        }
      }

      // Two-argument functions
      if (name === 'min' || name === 'max') {
        if (args.length !== 2) {
          throw new FormulaEvalError(
            `Function '${name}' expects 2 arguments, got ${args.length}`,
          );
        }
        return name === 'min'
          ? Math.min(args[0], args[1])
          : Math.max(args[0], args[1]);
      }

      // Unknown function — name was not in SINGLE_ARG_FNS, not min/max
      throw new FormulaEvalError(`Unknown function '${name}'`);
    }

    /* v8 ignore next 3 */
    default: {
      // Compile-time exhaustiveness guard: when a new ExprNode variant is
      // added, TypeScript narrows `node` to `never` here → compile error
      // forces the developer to handle the new variant.
      const _exhaustive: never = node;
      throw new FormulaEvalError(`Unexpected node type '${(_exhaustive as ExprNode).type}'`);
    }
  }
}
