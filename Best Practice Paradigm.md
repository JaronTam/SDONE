// 1. 数据结构彻底 POJO 化，保证可完美克隆
interface StockNode {
id: string;
type: 'stock';
value: number;
formulaStr: string; // 严禁存储 Function，仅存储字符串 [FR30]
}

interface GraphState {
nodes: Record<string, StockNode>;
version: number;
}

// 2. 内核态：高频可变，计算与绘制直通
class CanvasKernel {
private mutableState: GraphState; // 内核内部维护的单一可变源

// 物理计算 Tick（低频触发，如 100ms）
public simulationTick(t: number) {
Object.values(this.mutableState.nodes).forEach(node => {
// 运行时动态解析字符串公式，规避函数克隆地狱
const evaluatedRate = evaluateFormula(node.formulaStr, t);
node.value += evaluatedRate; // 原地突变，极致性能
});
this.mutableState.version++;
}

// 独立出来的快照导出器：只在必要时调用
public emitSnapshot(): GraphState {
return structuredClone(this.mutableState);
}
}
