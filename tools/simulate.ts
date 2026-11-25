import { writeFileSync } from 'node:fs';
import { ACHIEVEMENTS } from '../src/content/achievements.ts';
import { FLAVOR_LATE_GROWTH, FLAVORS } from '../src/content/flavors.ts';
import { formatAmount } from '../src/content/format.ts';
import { DECOR } from '../src/content/decor.ts';
import { MILESTONE_STEP, MILESTONES, PRODUCERS_IN_ORDER } from '../src/content/producers.ts';
import { STAGES } from '../src/content/stages.ts';
import { TRACKS, UPGRADE_BY_ID, UPGRADES } from '../src/content/upgrades.ts';
import { BOT_PROFILES, runBot, type BotReport } from '../src/sim/bots.ts';

export const STAGE_TARGETS = [1.5, 10, 35, 85, 150];
export const TOLERANCE = 0.15;

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
lines.push(
  '三期阶段 5 加入了 5 种设备、金牌档、10 条新协同、金色玉米、跳跳粒群、狂热手速、连环炮、礼花弹和 10 件场景装修。全部按原样叠加时，一周目从约 150 分钟缩短到 39 分钟，因为每个全局倍率都会让之后所有购买更快回本。为了保持约 2.5 小时，做了三处调整：',
  '',
  '- 厨房、电影院、小城、地球的设备价格（连同它们的升级和协同价格）分别是旧曲线的约 1.9、3、5.5、7 倍；产量不变。',
  '- 新倍率取温和值：装修每件 ×1.05，金色玉米最高 5% 几率、×20，狂热手速 ×2，跳跳粒群 20% 几率。',
  '- 金色玉米只奖励手动点击，会拉开点击型和挂机型的差距，所以双臂、八爪搅拌机改为每秒 +3、+6 次，让完全不点的玩家仍在 3.5 小时内通关。',
  '',
  `六期把 120 项升级合并成手艺、产线、玩法、装修四栏共 ${UPGRADES.length} 档，每栏只摆出下一档：`,
  '',
  `- 每种设备的四档升级改成自动生效的里程碑：${MILESTONES.map((m) => `${m.at} 台 ×${m.mult}`).join('、')}，之后每 ${MILESTONE_STEP} 台再 ×2。`,
  '- 19 条协同按场景合成 5 档「联动」；金牌档合成 5 档金色产线，某个场景的三种设备都够台数后，三种一起 ×2。',
  '- 点击、自动、大炮、跳跳粒、离线的 31 项合成手艺 8 档、玩法 8 档；10 件装修照旧。',
  '- 不再花钱买 60 档设备升级后，厨房快了约 2 分钟，所以厨房三种设备的价格提高约 1.5 倍（推车 2,500 → 4,000，厨师机 13,000 → 20,000，老式爆米花炮 74,000 → 110,000）；喷泉灯光秀 1.2 万亿 → 5 万亿，保证它在小城里买下。',
  '',
  `口味价格从二期起是 400 × 28^n，最后两种（黄金、神秘味道）比一整局的产量还贵，三类玩家通关时都只有 10/12，「说不清的味道」要在通关后再挂好几个小时才拿得到。六期阶段 4 改为第 9 种之后每种只贵 ${FLAVOR_LATE_GROWTH} 倍：星空、黄金、神秘味道都在地球买下，最后一种就在月亮之前。前 9 种价格不变，地球阶段缩短约 1 分钟。`,
  '',
);
lines.push('## 三类玩家', '');
lines.push('| 类型 | 每秒点击 | 大炮 | 跳跳粒 |', '|---|---:|---|---|');
for (const p of BOT_PROFILES) {
  lines.push(`| ${p.name} | ${p.clicksPerSecond} | ${{ none: '不用', normal: '冷却好就普通开炮', perfect: '每次绿区开炮' }[p.cannon]} | 抓住 ${Math.round(p.hopperCatch * 100)}% |`);
}
lines.push('', '## 到达各阶段的时间（分钟）', '');
lines.push(`| 阶段 | 累计门槛 | 目标 | ${reports.map((r) => r.name).join(' | ')} |`, `|---|---:|---:|${reports.map(() => '---:').join('|')}|`);
STAGES.forEach((stage, index) => {
  lines.push(`| ${stage.name} | ${formatAmount(stage.threshold)} | ${STAGE_TARGETS[index]} | ${reports.map((r) => f1(r.stageMinutes[index]!)).join(' | ')} |`);
});
lines.push('', '## 节奏', '');
lines.push(`| 指标 | ${reports.map((r) => r.name).join(' | ')} |`, `|---|${reports.map(() => '---:').join('|')}|`);
const row = (label: string, get: (r: BotReport) => string): void => {
  lines.push(`| ${label} | ${reports.map(get).join(' | ')} |`);
};
row('通关（分钟）', (r) => (r.finished ? r.endMinutes.toFixed(1) : '未通关'));
row('累计产量', (r) => formatAmount(r.total));
row('最长购买等待（分钟）', (r) => r.longestWaitMinutes.toFixed(2));
row('最长等待发生在（分钟）', (r) => r.longestWaitAt.toFixed(1));
row('最长等待买的是', (r) => r.longestWaitFor);
row('首次购买（秒）', (r) => r.firstPurchaseSeconds.toFixed(0));
row('第二种设备（秒）', (r) => r.secondKindSeconds.toFixed(0));
row('前 20 分钟购买间隔中位数（秒）', (r) => percentile(r.purchaseGapsEarly, 0.5).toFixed(0));
row('前 20 分钟购买间隔 P90（秒）', (r) => percentile(r.purchaseGapsEarly, 0.9).toFixed(0));
row('总购买次数', (r) => String(r.purchases));
row('口味', (r) => `${r.flavors}/${FLAVORS.length}`);
row('升级', (r) => String(r.upgrades));
row('成就', (r) => `${r.achievements}/${ACHIEVEMENTS.length}`);
lines.push('', '## 每种单位的购买情况', '');
lines.push('按商店顺序排列。', '');
lines.push(`| 单位 | ${reports.map((r) => `${r.name}：数量 / 首购 / 末购（分钟）`).join(' | ')} |`, `|---|${reports.map(() => '---').join('|')}|`);
PRODUCERS_IN_ORDER.forEach((producer) => {
  lines.push(
    `| ${producer.name} | ${reports.map((r) => `${r.owned[producer.id]} / ${r.firstBought[producer.id]! < 0 ? '—' : r.firstBought[producer.id]!.toFixed(1)} / ${r.lastBought[producer.id]! < 0 ? '—' : r.lastBought[producer.id]!.toFixed(1)}`).join(' | ')} |`,
  );
});
lines.push('', '## 场景装修的购买时间', '');
lines.push('格式：分钟 @ 当时所在场景。装修应在自己的场景里买下，这样买下后能在场景里看见。灶台只停留约 1.5 分钟，机器人按回本时间挑选，会在突破的那一刻买下灶台的两件；真人玩家通常更早。', '');
lines.push(`| 装修 | 所属场景 | ${reports.map((r) => r.name).join(' | ')} |`, `|---|---|${reports.map(() => '---').join('|')}|`);
for (const decor of DECOR) {
  const cells = reports.map((r) => {
    const bought = r.upgradesBought[decor.id];
    return bought ? `${bought.minute.toFixed(1)} @ ${STAGES[bought.stage]?.name ?? '结局'}` : '未购买';
  });
  lines.push(`| ${decor.name} | ${STAGES[decor.stage]!.name} | ${cells.join(' | ')} |`);
}

lines.push('', '## 升级栏位的购买时间', '');
lines.push('格式：分钟 @ 当时所在场景。「等」是这一档排在栏首、却因为设备台数不够买不了的时间，这段时间整栏都停着。', '');
lines.push(`| 栏 | 档 | 解锁场景 | ${reports.map((r) => r.name).join(' | ')} |`, `|---|---|---|${reports.map(() => '---').join('|')}|`);
for (const upgrade of UPGRADES) {
  const cells = reports.map((r) => {
    const bought = r.upgradesBought[upgrade.id];
    const waited = r.rungsWaiting[upgrade.id];
    const wait = waited && waited.minutes >= 0.1 ? `（等 ${waited.minutes.toFixed(1)}）` : '';
    return `${bought ? `${bought.minute.toFixed(1)} @ ${STAGES[bought.stage]?.name ?? '结局'}` : '未购买'}${wait}`;
  });
  lines.push(`| ${TRACKS.find((track) => track.id === upgrade.track)!.name} | ${upgrade.name} | ${STAGES[upgrade.unlockStage]!.name} | ${cells.join(' | ')} |`);
}

const active = reports[0]!;
const idle = reports[1]!;
const failures: string[] = [];
STAGE_TARGETS.forEach((target, index) => {
  const actual = active.stageMinutes[index]!;
  if (!(Math.abs(actual - target) <= target * TOLERANCE)) failures.push(`${STAGES[index]!.name}：${f1(actual)} 分钟，目标 ${target}±${TOLERANCE * 100}%`);
});
if (active.firstPurchaseSeconds > 5) failures.push(`首次购买 ${active.firstPurchaseSeconds.toFixed(1)} 秒 > 5`);
if (!(active.secondKindSeconds <= 45)) failures.push(`第二种设备 ${active.secondKindSeconds.toFixed(1)} 秒 > 45`);
if (percentile(active.purchaseGapsEarly, 0.5) > 10) failures.push(`前 20 分钟购买间隔中位数 ${percentile(active.purchaseGapsEarly, 0.5).toFixed(1)} 秒 > 10`);
if (active.longestWaitMinutes > 2) failures.push(`活跃玩家最长等待 ${active.longestWaitMinutes.toFixed(2)} 分钟 > 2`);
if (idle.longestWaitMinutes > 5) failures.push(`挂机玩家最长等待 ${idle.longestWaitMinutes.toFixed(2)} 分钟 > 5`);
if (!(idle.endMinutes <= 210)) failures.push(`挂机玩家通关 ${idle.endMinutes.toFixed(1)} 分钟 > 210`);
if (active.total < 3e16 || active.total > 3e17) failures.push(`通关累计 ${formatAmount(active.total)} 不在 3亿亿～30亿亿之间`);
for (const report of reports) {
  if (!report.finished) failures.push(`${report.name} 未通关`);
  if (report.flavors < FLAVORS.length) failures.push(`${report.name} 通关时只有 ${report.flavors}/${FLAVORS.length} 种口味`);
  // A rung waiting for machines holds up its whole row; never for more than half a scene.
  for (const [id, waited] of Object.entries(report.rungsWaiting)) {
    const span = report.stageMinutes[waited.stage]! - (waited.stage > 0 ? report.stageMinutes[waited.stage - 1]! : 0);
    if (waited.minutes > span * 0.5) failures.push(`${report.name}：「${UPGRADE_BY_ID.get(id)!.name}」在「${STAGES[waited.stage]!.name}」等设备 ${waited.minutes.toFixed(1)} 分钟，超过该场景的一半`);
  }
  PRODUCERS_IN_ORDER.forEach((producer) => {
    if (report.owned[producer.id] === 0) failures.push(`${report.name} 从未购买 ${producer.name}`);
    // No machine may be abandoned: each is still being bought in the last 40% of the run.
    else if (report.lastBought[producer.id]! < report.endMinutes * 0.6) failures.push(`${report.name} 在 ${report.lastBought[producer.id]!.toFixed(1)} 分钟后不再购买 ${producer.name}`);
  });
}
for (const decor of DECOR) {
  const bought = active.upgradesBought[decor.id];
  if (!bought) failures.push(`${active.name} 没有买 ${decor.name}`);
  // The stove lasts a minute and a half; everywhere else a decoration belongs to its own scene.
  else if (decor.stage > 0 && bought.stage !== decor.stage) failures.push(`${decor.name} 在「${STAGES[bought.stage]?.name ?? '结局'}」才买下`);
}
lines.push('', '## 验收', '');
lines.push(failures.length === 0 ? '全部通过。' : failures.map((failure) => `- 未通过：${failure}`).join('\n'), '');

const text = lines.join('\n');
if (!process.argv.includes('--no-write')) writeFileSync('docs/BALANCE.md', text);
console.log(text);
console.log(`(模拟耗时 ${elapsed} 秒)`);
if (failures.length > 0) process.exitCode = 1;
