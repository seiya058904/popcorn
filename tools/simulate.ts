import { writeFileSync } from 'node:fs';
import { PRODUCERS } from '../src/content/producers.ts';
import { STAGES } from '../src/content/stages.ts';
import { BOT_PROFILES, runBot, type BotReport } from '../src/sim/bots.ts';

export const STAGE_TARGETS = [3, 12, 35, 80, 150];
export const TOLERANCE = 0.2;

const started = performance.now();
const reports = BOT_PROFILES.map((profile) => runBot(profile));
const elapsed = ((performance.now() - started) / 1000).toFixed(1);

const f1 = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : '未到达');
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
};

const lines: string[] = [];
lines.push('# 数值平衡记录', '');
lines.push('由 `npm run balance` 生成，使用与游戏相同的规则代码。模拟步长 0.1 秒。', '');
lines.push('## 三类玩家', '');
lines.push('| 类型 | 每秒点击 | 大炮 | 跳跳粒 |', '|---|---:|---|---|');
for (const p of BOT_PROFILES) {
  lines.push(`| ${p.name} | ${p.clicksPerSecond} | ${{ none: '不用', normal: '冷却好就普通开炮', perfect: '每次绿区开炮' }[p.cannon]} | 抓住 ${Math.round(p.hopperCatch * 100)}% |`);
}
lines.push('', '## 到达各阶段的时间（分钟）', '');
lines.push(`| 阶段 | 累计门槛 | 目标 | ${reports.map((r) => r.name).join(' | ')} |`, `|---|---:|---:|${reports.map(() => '---:').join('|')}|`);
STAGES.forEach((stage, index) => {
  lines.push(`| ${stage.name} | ${stage.threshold.toLocaleString('en-US')} | ${STAGE_TARGETS[index]} | ${reports.map((r) => f1(r.stageMinutes[index]!)).join(' | ')} |`);
});
lines.push('', '## 节奏', '');
lines.push(`| 指标 | ${reports.map((r) => r.name).join(' | ')} |`, `|---|${reports.map(() => '---:').join('|')}|`);
const row = (label: string, get: (r: BotReport) => string): void => {
  lines.push(`| ${label} | ${reports.map(get).join(' | ')} |`);
};
row('通关（分钟）', (r) => (r.finished ? r.endMinutes.toFixed(1) : '未通关'));
row('最长购买等待（分钟）', (r) => r.longestWaitMinutes.toFixed(2));
row('最长等待发生在（分钟）', (r) => r.longestWaitAt.toFixed(1));
row('最长等待买的是', (r) => r.longestWaitFor);
row('首次购买（秒）', (r) => r.firstPurchaseSeconds.toFixed(0));
row('首个自动单位（秒）', (r) => r.firstUnitSeconds.toFixed(0));
row('前 20 分钟购买间隔中位数（秒）', (r) => percentile(r.purchaseGapsEarly, 0.5).toFixed(0));
row('前 20 分钟购买间隔 P90（秒）', (r) => percentile(r.purchaseGapsEarly, 0.9).toFixed(0));
row('总购买次数', (r) => String(r.purchases));
row('口味', (r) => `${r.flavors}/12`);
row('升级', (r) => String(r.upgrades));
row('成就', (r) => `${r.achievements}/24`);
lines.push('', '## 每种单位的购买情况', '');
lines.push(`| 单位 | ${reports.map((r) => `${r.name}：数量 / 首购 / 末购（分钟）`).join(' | ')} |`, `|---|${reports.map(() => '---').join('|')}|`);
PRODUCERS.forEach((producer) => {
  lines.push(
    `| ${producer.name} | ${reports.map((r) => `${r.owned[producer.id]} / ${r.firstBought[producer.id]! < 0 ? '—' : r.firstBought[producer.id]!.toFixed(1)} / ${r.lastBought[producer.id]! < 0 ? '—' : r.lastBought[producer.id]!.toFixed(1)}`).join(' | ')} |`,
  );
});

const active = reports[0]!;
const idle = reports[1]!;
const failures: string[] = [];
STAGE_TARGETS.forEach((target, index) => {
  const actual = active.stageMinutes[index]!;
  if (!(Math.abs(actual - target) <= target * TOLERANCE)) failures.push(`${STAGES[index]!.name}：${f1(actual)} 分钟，目标 ${target}±${TOLERANCE * 100}%`);
});
if (active.longestWaitMinutes > 3) failures.push(`活跃玩家最长等待 ${active.longestWaitMinutes.toFixed(2)} 分钟 > 3`);
if (idle.longestWaitMinutes > 5) failures.push(`挂机玩家最长等待 ${idle.longestWaitMinutes.toFixed(2)} 分钟 > 5`);
for (const report of reports) {
  if (!report.finished) failures.push(`${report.name} 未通关`);
  PRODUCERS.forEach((producer) => {
    if (report.owned[producer.id] === 0) failures.push(`${report.name} 从未购买 ${producer.name}`);
  });
}
lines.push('', '## 相对设计方案初值的调整', '');
lines.push(
  '设计方案的初值没有计入跳跳粒、点击升级、绿区和协同，全部计入后通关只需约 9 分钟，因此做了以下调整：',
  '',
  '- 单位价格与产量按上表 `src/content/producers.ts` 重新校准：推车、大炮、影院机、工厂、火山炉的基础价提高，后三者基础产量降低。',
  '- 一次点击的收益改为“每粒 1 + 产量份额一次”，粒数不再放大产量份额。',
  '- 阶段奖励收窄为 ×1.3、×1.1、×1.15、×1，单位升级为 ×1.5，协同为每台 +0.25%。',
  '- 通关时长约 2.3 小时，在 150 分钟 ±20% 的验收范围内，略低于“约 3 小时”的预期；挂机型约 5.8 小时。',
);
lines.push('', '## 验收', '');
lines.push(failures.length === 0 ? '全部通过。' : failures.map((failure) => `- 未通过：${failure}`).join('\n'), '');

const text = lines.join('\n');
if (!process.argv.includes('--no-write')) writeFileSync('docs/BALANCE.md', text);
console.log(text);
console.log(`(模拟耗时 ${elapsed} 秒)`);
if (failures.length > 0) process.exitCode = 1;
