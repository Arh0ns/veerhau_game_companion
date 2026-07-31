import type { BoardNode } from "./types";

export interface Point {
  x: number;
  y: number;
}

export function nodeCenter(item: BoardNode, defaultWidth = 280, defaultHeight = 170): Point {
  return {
    x: item.x + (item.width ?? defaultWidth) / 2,
    y: item.y + (item.height ?? defaultHeight) / 2,
  };
}

export function rectangleBoundaryPoint(
  item: BoardNode,
  toward: Point,
  defaultWidth = 280,
  defaultHeight = 170,
): Point {
  const width = item.width ?? defaultWidth;
  const height = item.height ?? defaultHeight;
  const center = nodeCenter(item, defaultWidth, defaultHeight);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (!dx && !dy) return center;
  const scaleX = dx ? width / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy ? height / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

