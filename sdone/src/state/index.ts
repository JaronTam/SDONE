export type {
  ModuleType,
  ModuleNode,
  StockNode,
  SourceNode,
  SinkNode,
  Connection,
  GraphState,
} from './GraphState.js';

export { HistoryManager } from './HistoryManager.js';
export type { IHistoryManager } from './HistoryManager.js';

export {
  addModule,
  deleteModule,
  moveModule,
  addConnection,
  deleteConnection,
  updateRate,
} from './mutations.js';
