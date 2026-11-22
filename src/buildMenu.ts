import Phaser from 'phaser';
import { W, H, money } from './config';
import { BuildItem, Career, ITEMS, ItemId, itemById } from './career';

type TextFactory = (x: number, y: number, s: string, size: number, color?: string, weight?: number) => Phaser.GameObjects.Text;

interface Row {
  item: BuildItem;
  rect: { x: number; y: number; w: number; h: number };
  bg: Phaser.GameObjects.Graphics;
  price: Phaser.GameObjects.Text;
  priceBg: Phaser.GameObjects.Graphics;
  effect: Phaser.GameObjects.Text;
}

export type ItemState = 'owned' | 'locked' | 'short' | 'buyable';

const PANEL_W = 400;
const ROW_H = 34;
const ROW_GAP = 4;

/** The between-days shop, docked on the right so the airport stays visible on the left. */
export class BuildMenu {
  private root: Phaser.GameObjects.Container | null = null;
  private rows: Row[] = [];
  private cashText: Phaser.GameObjects.Text | null = null;
  private startRect = { x: 0, y: 0, w: 0, h: 0 };
  private startBg: Phaser.GameObjects.Graphics | null = null;
  hovered: ItemId | null = null;
  private career: Career | null = null;

  constructor(
    private scene: Phaser.Scene,
    private text: TextFactory,
    private onBuy: (id: ItemId) => void,
    private onStart: () => void,
  ) {}

  get visible() {
    return this.root !== null;
  }

  static stateOf(item: BuildItem, career: Career): ItemState {
    if (career.built.includes(item.id)) return 'owned';
    if (item.requires && !career.built.includes(item.requires)) return 'locked';
    return career.cash >= item.price ? 'buyable' : 'short';
  }

  show(career: Career) {
    this.hide();
    this.career = career;
    const x0 = W - 16 - PANEL_W;
    const y0 = 16;
    const panelH = H - 32;
    const parts: Phaser.GameObjects.GameObject[] = [];

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f1d16, 0.95);
    bg.fillRoundedRect(x0, y0, PANEL_W, panelH, 18);
    bg.lineStyle(2, 0xffffff, 0.08);
    bg.strokeRoundedRect(x0, y0, PANEL_W, panelH, 18);
    parts.push(bg);

    parts.push(this.text(x0 + 22, y0 + 18, `BEFORE DAY ${career.day}`, 11, '#ffc93c').setLetterSpacing(2));
    parts.push(this.text(x0 + 22, y0 + 32, 'Build', 28, '#ffffff', 800));
    parts.push(this.text(x0 + PANEL_W - 22, y0 + 18, 'CASH', 11, '#a9c4b4').setOrigin(1, 0).setLetterSpacing(2));
    this.cashText = this.text(x0 + PANEL_W - 22, y0 + 32, '', 24, '#5ee08a', 800).setOrigin(1, 0);
    parts.push(this.cashText);

    let y = y0 + 78;
    this.rows = [];
    for (const [group, label] of [
      ['facility', 'FACILITIES'],
      ['upgrade', 'UPGRADES'],
    ] as const) {
      parts.push(this.text(x0 + 22, y, label, 11, '#a9c4b4').setLetterSpacing(2));
      y += 20;
      for (const item of ITEMS.filter((i) => i.group === group)) {
        const row = this.buildRow(item, x0 + 16, y, PANEL_W - 32);
        parts.push(row.bg, ...this.rowParts(row));
        this.rows.push(row);
        y += ROW_H + ROW_GAP;
      }
      y += 10;
    }

    const btnH = 44;
    this.startRect = { x: x0 + 16, y: y0 + panelH - 16 - btnH, w: PANEL_W - 32, h: btnH };
    this.startBg = this.scene.add.graphics();
    parts.push(this.startBg);
    parts.push(
      this.text(this.startRect.x + this.startRect.w / 2, this.startRect.y + btnH / 2, `Start day ${career.day}`, 17, '#0b1410', 800).setOrigin(0.5),
    );

    this.root = this.scene.add.container(0, 0, parts).setDepth(200);
    this.refresh(career);
  }

  private rowParts(row: Row) {
    return row.bg.getData('parts') as Phaser.GameObjects.GameObject[];
  }

  private buildRow(item: BuildItem, x: number, y: number, w: number): Row {
    const bg = this.scene.add.graphics();
    const icon = this.scene.add.image(x + 20, y + ROW_H / 2, item.icon);
    icon.setScale(24 / Math.max(icon.width, icon.height));
    if (item.rotate) icon.setRotation(-Math.PI / 2);
    const name = this.text(x + 42, y + 4, item.name, 14, '#ffffff', 700);
    const effect = this.text(x + 42, y + 20, item.effect, 11, '#a9c4b4', 500);
    const priceBg = this.scene.add.graphics();
    const price = this.text(x + w - 46, y + ROW_H / 2, '', 12, '#0b1410', 800).setOrigin(0.5);
    bg.setData('parts', [icon, name, effect, priceBg, price]);
    return { item, rect: { x, y, w, h: ROW_H }, bg, price, priceBg, effect };
  }

  /** Redraws every row for the current cash and build state. */
  refresh(career: Career) {
    this.career = career;
    if (!this.root) return;
    this.cashText?.setText(money(career.cash));
    for (const row of this.rows) {
      const state = BuildMenu.stateOf(row.item, career);
      const { x, y, w, h } = row.rect;
      const hot = this.hovered === row.item.id;
      row.bg.clear();
      row.bg.fillStyle(0xffffff, hot ? 0.11 : 0.05);
      row.bg.fillRoundedRect(x, y, w, h, 8);
      if (hot && state === 'buyable') {
        row.bg.lineStyle(1.5, 0x5ee08a, 0.8);
        row.bg.strokeRoundedRect(x, y, w, h, 8);
      }
      const label =
        state === 'owned' ? 'OWNED' : state === 'locked' ? 'LOCKED' : money(row.item.price);
      const fill =
        state === 'buyable' ? 0x5ee08a : state === 'owned' ? 0x2f4a3b : state === 'locked' ? 0x2a3330 : 0x3a2c2a;
      const color = state === 'buyable' ? '#0b1410' : state === 'owned' ? '#8fd6a8' : state === 'locked' ? '#7d8a84' : '#ff8a7e';
      row.price.setText(label).setColor(color);
      const pw = 80;
      row.priceBg.clear();
      row.priceBg.fillStyle(fill, 1);
      row.priceBg.fillRoundedRect(x + w - 6 - pw, y + 5, pw, h - 10, 7);
      row.price.setX(x + w - 6 - pw / 2);
      row.effect
        .setText(state === 'locked' ? `Needs ${itemById(row.item.requires!).name.toLowerCase()}` : row.item.effect)
        .setColor(state === 'locked' ? '#ffb020' : '#a9c4b4');
    }
    const s = this.startRect;
    const hotStart = this.hovered === null && this.startHot;
    this.startBg?.clear();
    this.startBg?.fillStyle(hotStart ? 0xffd75e : 0xffc93c, 1);
    this.startBg?.fillRoundedRect(s.x, s.y, s.w, s.h, 10);
  }

  private startHot = false;

  private inRect(r: { x: number; y: number; w: number; h: number }, x: number, y: number) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  pointerMove(x: number, y: number) {
    if (!this.root || !this.career) return;
    const row = this.rows.find((r) => this.inRect(r.rect, x, y));
    const startHot = this.inRect(this.startRect, x, y);
    if ((row?.item.id ?? null) !== this.hovered || startHot !== this.startHot) {
      this.hovered = row?.item.id ?? null;
      this.startHot = startHot;
      this.refresh(this.career);
    }
  }

  /** Returns true if the click landed on the panel. */
  pointerDown(x: number, y: number) {
    if (!this.root || !this.career) return false;
    if (this.inRect(this.startRect, x, y)) {
      this.onStart();
      return true;
    }
    const row = this.rows.find((r) => this.inRect(r.rect, x, y));
    if (row && BuildMenu.stateOf(row.item, this.career) === 'buyable') this.onBuy(row.item.id);
    return x >= W - 16 - PANEL_W;
  }

  hide() {
    this.root?.destroy();
    this.root = null;
    this.rows = [];
    this.hovered = null;
    this.startHot = false;
  }
}
