import { tuning, tuningFields } from '../motion/tuning.ts';

const PANEL_STYLE =
  'position:fixed;left:12px;top:12px;width:280px;max-height:calc(100vh - 24px);overflow:auto;' +
  'padding:10px 12px;border-radius:10px;background:rgba(20,12,18,.9);color:#fff6e3;' +
  'font:12px/1.4 system-ui,sans-serif;pointer-events:auto;z-index:1000;display:none';

/** F2: live sliders for every motion value, with a copy button for the current set. */
export class TuningPanel {
  private readonly root = document.createElement('div');

  constructor() {
    this.root.dataset.debug = 'tuning';
    this.root.style.cssText = PANEL_STYLE;
    const title = document.createElement('strong');
    title.textContent = '动效调参 (F2)';
    this.root.append(title);

    for (const field of tuningFields) {
      const row = document.createElement('label');
      row.style.cssText = 'display:block;margin-top:8px';
      const caption = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.value = String(tuning[field.key]);
      input.style.width = '100%';
      const refresh = (): void => {
        caption.textContent = `${field.label}: ${tuning[field.key]}`;
      };
      input.addEventListener('input', () => {
        tuning[field.key] = Number(input.value);
        refresh();
      });
      refresh();
      row.append(caption, input);
      this.root.append(row);
    }

    const copy = document.createElement('button');
    copy.textContent = '复制当前数值';
    copy.style.marginTop = '10px';
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2));
    });
    this.root.append(copy);
    document.body.append(this.root);
  }

  toggle(): void {
    this.root.style.display = this.root.style.display === 'none' ? 'block' : 'none';
  }
}
